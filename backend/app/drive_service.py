import json
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from typing import List, Dict, Any, Optional, Callable

class DriveService:
    def __init__(self, credentials_info: dict, on_token_refresh: Optional[Callable[[str, Optional[str]], None]] = None):
        self.creds = Credentials(
            token=credentials_info.get("access_token"),
            refresh_token=credentials_info.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=credentials_info.get("client_id"),
            client_secret=credentials_info.get("client_secret"),
            scopes=credentials_info.get("scopes")
        )
        # Check and auto-refresh credentials if expired or missing access token
        try:
            if not self.creds.valid:
                request = Request()
                self.creds.refresh(request)
                if on_token_refresh and self.creds.token:
                    on_token_refresh(self.creds.token, self.creds.refresh_token)
        except Exception as e:
            print(f"Warning: Token refresh attempt: {e}")

        self.service = build("drive", "v3", credentials=self.creds)

    def list_files_in_folder(self, folder_id: str = "root", view: str = "my-drive", page_size: int = 60) -> List[Dict[str, Any]]:
        """List contents of a specific folder or special view (shared, recent, starred, trash)."""
        if view == "shared":
            query = "sharedWithMe = true and trashed = false"
            order = "sharedWithMeTime desc"
        elif view == "recent":
            query = "trashed = false and mimeType != 'application/vnd.google-apps.folder'"
            order = "viewedByMeTime desc"
        elif view == "starred":
            query = "starred = true and trashed = false"
            order = "folder, name"
        elif view == "trash":
            query = "trashed = true"
            order = "trashedTime desc"
        else:
            query = f"'{folder_id}' in parents and trashed = false"
            order = "folder, name"

        try:
            results = self.service.files().list(
                q=query,
                pageSize=page_size,
                fields="files(id, name, mimeType, size, modifiedTime, parents, webViewLink, iconLink, starred, trashed)",
                orderBy=order
            ).execute()
        except Exception:
            results = self.service.files().list(
                q=query,
                pageSize=page_size,
                fields="files(id, name, mimeType, size, modifiedTime, parents, webViewLink, iconLink, starred, trashed)"
            ).execute()

        files = results.get("files", [])
        return [
            {
                "id": f["id"],
                "name": f["name"],
                "mimeType": f["mimeType"],
                "isFolder": f["mimeType"] == "application/vnd.google-apps.folder",
                "size": f.get("size"),
                "modifiedTime": f.get("modifiedTime"),
                "parents": f.get("parents", []),
                "webViewLink": f.get("webViewLink"),
                "starred": f.get("starred", False),
                "trashed": f.get("trashed", False),
            }
            for f in files
        ]

    def toggle_star_file(self, file_id: str, starred: bool = True) -> Dict[str, Any]:
        """Star or unstar a file."""
        return self.service.files().update(
            fileId=file_id,
            body={"starred": starred},
            fields="id, name, starred"
        ).execute()

    def toggle_trash_file(self, file_id: str, trashed: bool = True) -> Dict[str, Any]:
        """Move a file to trash or restore it."""
        return self.service.files().update(
            fileId=file_id,
            body={"trashed": trashed},
            fields="id, name, trashed"
        ).execute()

    def delete_permanently(self, file_id: str) -> bool:
        """Permanently delete a file or folder from Google Drive."""
        from googleapiclient.errors import HttpError
        try:
            self.service.files().delete(fileId=file_id).execute()
            return True
        except HttpError as err:
            # 404 indicates file was already deleted or not found
            if err.resp.status == 404:
                return False
            raise err

    def search_files(self, text_query: str = "", mime_type: Optional[str] = None, page_size: int = 40) -> List[Dict[str, Any]]:
        """Search files by name, full-text or mimeType."""
        query_parts = ["trashed = false"]
        if text_query:
            escaped = text_query.replace("'", "\\'")
            query_parts.append(f"(name contains '{escaped}' or fullText contains '{escaped}')")
        if mime_type:
            query_parts.append(f"mimeType = '{mime_type}'")

        q = " and ".join(query_parts)
        results = self.service.files().list(
            q=q,
            pageSize=page_size,
            fields="files(id, name, mimeType, size, modifiedTime, parents, webViewLink)",
            orderBy="modifiedTime desc"
        ).execute()

        files = results.get("files", [])
        return [
            {
                "id": f["id"],
                "name": f["name"],
                "mimeType": f["mimeType"],
                "isFolder": f["mimeType"] == "application/vnd.google-apps.folder",
                "size": f.get("size"),
                "modifiedTime": f.get("modifiedTime"),
                "parents": f.get("parents", []),
                "webViewLink": f.get("webViewLink")
            }
            for f in files
        ]

    def create_folder(self, folder_name: str, parent_id: str = "root") -> Dict[str, Any]:
        """Create a new folder in Google Drive."""
        file_metadata = {
            "name": folder_name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]
        }
        folder = self.service.files().create(
            body=file_metadata,
            fields="id, name, mimeType, parents, webViewLink"
        ).execute()
        return folder

    def move_file(self, file_id: str, target_folder_id: str, current_parent_id: Optional[str] = None) -> Dict[str, Any]:
        """Move a file from its current parent to target_folder_id."""
        if not current_parent_id:
            # retrieve existing parents
            file = self.service.files().get(fileId=file_id, fields="parents").execute()
            current_parents = ",".join(file.get("parents", []))
        else:
            current_parents = current_parent_id

        updated = self.service.files().update(
            fileId=file_id,
            addParents=target_folder_id,
            removeParents=current_parents,
            fields="id, name, parents"
        ).execute()
        return updated

    def rename_file(self, file_id: str, new_name: str) -> Dict[str, Any]:
        """Rename a file or folder."""
        file_metadata = {"name": new_name}
        return self.service.files().update(
            fileId=file_id,
            body=file_metadata,
            fields="id, name"
        ).execute()

    def upload_file(self, filename: str, file_bytes: bytes, mime_type: str, parent_folder_id: str = "root") -> Dict[str, Any]:
        """Upload a file directly to Google Drive."""
        from googleapiclient.http import MediaIoBaseUpload
        import io

        file_metadata = {
            "name": filename,
            "parents": [parent_folder_id]
        }
        media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mime_type or "application/octet-stream", resumable=True)
        uploaded = self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, mimeType, webViewLink, size"
        ).execute()
        return uploaded

    def get_file_content_snippet(self, file_id: str, mime_type: str, max_chars: int = 500) -> str:
        """Extract lightweight text snippet, image metadata, or video info for fast content-aware analysis."""
        try:
            # 1. Images (JPEG, PNG, WEBP, GIF, SVG)
            if "image/" in mime_type:
                try:
                    meta = self.service.files().get(
                        fileId=file_id,
                        fields="imageMediaMetadata(width, height, time, cameraMake, cameraModel, location)"
                    ).execute()
                    imm = meta.get("imageMediaMetadata") or {}
                    parts = []
                    if imm.get("width") and imm.get("height"):
                        parts.append(f"dimensions: {imm['width']}x{imm['height']}")
                    if imm.get("cameraMake") or imm.get("cameraModel"):
                        parts.append(f"camera: {imm.get('cameraMake', '')} {imm.get('cameraModel', '')}".strip())
                    if imm.get("time"):
                        parts.append(f"captured: {imm['time']}")
                    if imm.get("location"):
                        loc = imm["location"]
                        parts.append(f"geo-coordinates: lat={loc.get('latitude')}, lon={loc.get('longitude')}")
                    return f"[Image file | {', '.join(parts) if parts else 'standard image'}]"
                except Exception:
                    return "[Image file]"

            # 2. Videos (MP4, MOV, MKV, AVI, WEBM)
            elif "video/" in mime_type:
                try:
                    meta = self.service.files().get(
                        fileId=file_id,
                        fields="videoMediaMetadata(width, height, durationMillis)"
                    ).execute()
                    vmm = meta.get("videoMediaMetadata") or {}
                    parts = []
                    if vmm.get("width") and vmm.get("height"):
                        parts.append(f"resolution: {vmm['width']}x{vmm['height']}")
                    if vmm.get("durationMillis"):
                        dur_sec = round(int(vmm["durationMillis"]) / 1000)
                        parts.append(f"duration: {dur_sec}s")
                    return f"[Video file | {', '.join(parts) if parts else 'video recording'}]"
                except Exception:
                    return "[Video file]"

            # 3. Google Doc / Presentation -> export as plain text
            elif "google-apps.document" in mime_type or "google-apps.kix" in mime_type:
                res = self.service.files().export(fileId=file_id, mimeType="text/plain").execute()
                text = res.decode("utf-8", errors="ignore") if isinstance(res, bytes) else str(res)
                return text.strip()[:max_chars]

            # 4. Google Sheet -> export as CSV (compact first few rows)
            elif "google-apps.spreadsheet" in mime_type:
                res = self.service.files().export(fileId=file_id, mimeType="text/csv").execute()
                text = res.decode("utf-8", errors="ignore") if isinstance(res, bytes) else str(res)
                lines = [line.strip() for line in text.splitlines() if line.strip()][:10]
                return "\n".join(lines)[:max_chars]

            # 5. Binary PDF file -> extract first page
            elif "pdf" in mime_type:
                import io
                from pypdf import PdfReader
                content = self.service.files().get_media(fileId=file_id).execute()
                reader = PdfReader(io.BytesIO(content))
                text = ""
                for page in reader.pages[:2]:
                    text += (page.extract_text() or "") + "\n"
                    if len(text) >= max_chars:
                        break
                return text.strip()[:max_chars]

            # 6. Plain text / Markdown / CSV / JSON
            elif "text/" in mime_type or "csv" in mime_type or "json" in mime_type:
                content = self.service.files().get_media(fileId=file_id).execute()
                text = content.decode("utf-8", errors="ignore")
                return text.strip()[:max_chars]

        except Exception as e:
            return f"[Snippet unavailable: {str(e)}]"
        return ""

    def find_duplicates(self, folder_id: str = "root") -> List[Dict[str, Any]]:
        """Find duplicate files in folder by MD5 checksum and filename matching."""
        query = f"'{folder_id}' in parents and trashed = false and mimeType != 'application/vnd.google-apps.folder'"
        results = self.service.files().list(
            q=query,
            pageSize=100,
            fields="files(id, name, mimeType, size, md5Checksum, modifiedTime, webViewLink)"
        ).execute()
        files = results.get("files", [])
        
        # Group by md5 or (name + size)
        hashes: Dict[str, List[Dict[str, Any]]] = {}
        duplicates: List[Dict[str, Any]] = []

        for f in files:
            key = f.get("md5Checksum") or f"{f['name']}_{f.get('size')}"
            if key not in hashes:
                hashes[key] = []
            hashes[key].append(f)

        for key, group in hashes.items():
            if len(group) > 1:
                # Keep first as primary, others as duplicates
                duplicates.append({
                    "primary": group[0],
                    "duplicates": group[1:]
                })
        return duplicates

    def share_file(self, file_id: str, email: str, role: str = "reader") -> Dict[str, Any]:
        """Share a file/folder with an email (role: 'reader', 'commenter', 'writer')."""
        permission = {
            "type": "user",
            "role": role,
            "emailAddress": email
        }
        return self.service.permissions().create(
            fileId=file_id,
            body=permission,
            fields="id, emailAddress, role",
            sendNotificationEmail=True
        ).execute()

    def create_google_doc(self, title: str, parent_folder_id: str = "root", content: str = "") -> Dict[str, Any]:
        """Create a new Google Doc with optional initial text content."""
        from googleapiclient.http import MediaIoBaseUpload
        import io

        file_metadata = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [parent_folder_id]
        }

        if content:
            # Upload plain text content while converting to Google Doc
            media = MediaIoBaseUpload(
                io.BytesIO(content.encode("utf-8")),
                mimetype="text/plain",
                resumable=True
            )
            return self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields="id, name, mimeType, webViewLink"
            ).execute()
        else:
            return self.service.files().create(
                body=file_metadata,
                fields="id, name, mimeType, webViewLink"
            ).execute()

    def export_doc_as_pdf(self, file_id: str, filename: str, target_folder_id: str = "root") -> Dict[str, Any]:
        """Export Google Doc or Sheet as PDF and save directly to Drive."""
        from googleapiclient.http import MediaIoBaseUpload
        import io

        pdf_bytes = self.service.files().export(fileId=file_id, mimeType="application/pdf").execute()
        file_metadata = {
            "name": f"{filename}.pdf" if not filename.endswith(".pdf") else filename,
            "parents": [target_folder_id]
        }
        media = MediaIoBaseUpload(io.BytesIO(pdf_bytes), mimetype="application/pdf", resumable=True)
        return self.service.files().create(
            body=file_metadata,
            media_body=media,
            fields="id, name, mimeType, webViewLink"
        ).execute()

    def get_about_info(self) -> Dict[str, Any]:
        """Get drive user & storage quota info."""
        return self.service.about().get(fields="user, storageQuota").execute()
