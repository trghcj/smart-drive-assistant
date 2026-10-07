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

    def get_about_info(self) -> Dict[str, Any]:
        """Get drive user & storage quota info."""
        return self.service.about().get(fields="user, storageQuota").execute()
