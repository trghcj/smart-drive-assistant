import json
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from typing import List, Dict, Any, Optional

class DriveService:
    def __init__(self, credentials_info: dict):
        self.creds = Credentials(
            token=credentials_info.get("access_token"),
            refresh_token=credentials_info.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=credentials_info.get("client_id"),
            client_secret=credentials_info.get("client_secret"),
            scopes=credentials_info.get("scopes")
        )
        self.service = build("drive", "v3", credentials=self.creds)

    def list_files_in_folder(self, folder_id: str = "root", page_size: int = 50) -> List[Dict[str, Any]]:
        """List contents of a specific folder."""
        query = f"'{folder_id}' in parents and trashed = false"
        results = self.service.files().list(
            q=query,
            pageSize=page_size,
            fields="files(id, name, mimeType, size, modifiedTime, parents, webViewLink, iconLink)",
            orderBy="folder, name"
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
            }
            for f in files
        ]

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

    def get_file_content_snippet(self, file_id: str, mime_type: str, max_chars: int = 1500) -> str:
        """Extract text snippet from Docs, Sheets, or PDFs for content-aware sorting."""
        try:
            # 1. Google Doc / Sheet / Presentation -> export as plain text
            if "google-apps.document" in mime_type or "google-apps.kix" in mime_type:
                res = self.service.files().export(fileId=file_id, mimeType="text/plain").execute()
                return res.decode("utf-8", errors="ignore")[:max_chars] if isinstance(res, bytes) else str(res)[:max_chars]
            elif "google-apps.spreadsheet" in mime_type:
                res = self.service.files().export(fileId=file_id, mimeType="text/csv").execute()
                return res.decode("utf-8", errors="ignore")[:max_chars] if isinstance(res, bytes) else str(res)[:max_chars]
            # 2. Binary PDF file -> download and extract with pypdf
            elif "pdf" in mime_type:
                import io
                from pypdf import PdfReader
                content = self.service.files().get_media(fileId=file_id).execute()
                reader = PdfReader(io.BytesIO(content))
                text = ""
                for page in reader.pages[:3]:
                    text += page.extract_text() or ""
                    if len(text) >= max_chars:
                        break
                return text[:max_chars]
            # 3. Plain text / Markdown / CSV
            elif "text/" in mime_type or "csv" in mime_type or "json" in mime_type:
                content = self.service.files().get_media(fileId=file_id).execute()
                return content.decode("utf-8", errors="ignore")[:max_chars]
        except Exception as e:
            return f"[Snippet extraction unavailable: {str(e)}]"
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

    def create_google_doc(self, title: str, parent_folder_id: str = "root") -> Dict[str, Any]:
        """Create a new Google Doc."""
        file_metadata = {
            "name": title,
            "mimeType": "application/vnd.google-apps.document",
            "parents": [parent_folder_id]
        }
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
