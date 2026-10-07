from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class UserProfile(BaseModel):
    id: str
    email: str
    name: str
    picture: Optional[str] = None

class DriveItem(BaseModel):
    id: str
    name: str
    mimeType: str
    isFolder: bool
    size: Optional[str] = None
    modifiedTime: Optional[str] = None
    parents: Optional[List[str]] = []
    webViewLink: Optional[str] = None

class ProposedOperation(BaseModel):
    id: str
    type: str  # "CREATE_FOLDER", "MOVE_FILE", "RENAME_FILE"
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    folder_name: Optional[str] = None
    parent_id: Optional[str] = "root"
    source_folder_id: Optional[str] = None
    target_folder_id: Optional[str] = None
    target_folder_name: Optional[str] = None
    reason: Optional[str] = None

class PlanResponse(BaseModel):
    explanation: str
    operations: List[ProposedOperation] = []

class ExecutePlanRequest(BaseModel):
    operations: List[ProposedOperation]

class ExecutionResult(BaseModel):
    success: bool
    message: str
    executed_operations: List[Dict[str, Any]] = []
    undo_token: Optional[str] = None

class ChatRequest(BaseModel):
    message: str
    current_folder_id: Optional[str] = "root"
