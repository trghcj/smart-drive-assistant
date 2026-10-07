import uuid
import json
from fastapi import FastAPI, Depends, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from google_auth_oauthlib.flow import Flow
from typing import Dict, Any, List, Optional

from .config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI,
    DRIVE_SCOPES,
    FRONTEND_URL
)
from .schemas import (
    DriveItem,
    ChatRequest,
    PlanResponse,
    ExecutePlanRequest,
    ExecutionResult
)
from .drive_service import DriveService
from .agent import DriveAgent

app = FastAPI(title="Smart Drive Assistant API")

# Enable CORS for React frontend (including Vercel deployments and localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store & undo history (for MVP development)
# Map of session_id -> credentials_dict
USER_SESSIONS: Dict[str, dict] = {}
# Undo history: undo_token -> list of inverted operations
UNDO_STORE: Dict[str, list] = {}

def get_client_config():
    return {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI]
        }
    }

def get_drive_service(session_id: str) -> DriveService:
    if not session_id or session_id not in USER_SESSIONS:
        raise HTTPException(status_code=401, detail="Unauthorized. Please log in with Google.")
    return DriveService(USER_SESSIONS[session_id])

# ----------------- AUTH ROUTES -----------------

# Store PKCE code_verifier by state
OAUTH_STATES: Dict[str, str] = {}

@app.get("/api/auth/google/login")
def google_login():
    """Start OAuth 2.0 Google login flow."""
    flow = Flow.from_client_config(
        get_client_config(),
        scopes=DRIVE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI
    )
    auth_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent"
    )
    # Persist code_verifier associated with this state
    if flow.code_verifier:
        OAUTH_STATES[state] = flow.code_verifier
    return {"url": auth_url}

@app.get("/api/auth/google/callback")
def google_callback(code: str, state: Optional[str] = None):
    """Handle callback from Google and exchange code for tokens."""
    flow = Flow.from_client_config(
        get_client_config(),
        scopes=DRIVE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI
    )
    if state and state in OAUTH_STATES:
        flow.code_verifier = OAUTH_STATES.pop(state)

    flow.fetch_token(code=code)
    creds = flow.credentials

    session_id = str(uuid.uuid4())
    USER_SESSIONS[session_id] = {
        "access_token": creds.token,
        "refresh_token": creds.refresh_token,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes
    }

    # Redirect user back to frontend with session_id token
    redirect_target = f"{FRONTEND_URL}/?session_id={session_id}"
    return RedirectResponse(url=redirect_target)

@app.get("/api/auth/me")
def get_current_user(session_id: str = Query(...)):
    """Fetch profile and Drive quota information."""
    drive = get_drive_service(session_id)
    about = drive.get_about_info()
    return {
        "user": about.get("user", {}),
        "quota": about.get("storageQuota", {})
    }

# ----------------- DRIVE EXPLORER ROUTES -----------------

@app.get("/api/drive/files")
def list_files(folder_id: str = "root", session_id: str = Query(...)):
    """List files and folders inside specified folder."""
    drive = get_drive_service(session_id)
    files = drive.list_files_in_folder(folder_id=folder_id)
    return {"files": files}

@app.get("/api/drive/search")
def search_drive(q: str = "", session_id: str = Query(...)):
    """Search files by keyword."""
    drive = get_drive_service(session_id)
    results = drive.search_files(text_query=q)
    return {"files": results}

# ----------------- AGENT AI ROUTES -----------------

@app.post("/api/agent/chat", response_model=PlanResponse)
def chat_with_agent(req: ChatRequest, session_id: str = Query(...)):
    """Analyze user request and propose structured plan."""
    drive = get_drive_service(session_id)
    agent = DriveAgent(drive)
    plan = agent.analyze_and_plan(user_prompt=req.message, current_folder_id=req.current_folder_id)
    return plan

@app.post("/api/agent/execute", response_model=ExecutionResult)
def execute_plan(req: ExecutePlanRequest, session_id: str = Query(...)):
    """Execute approved operations on Google Drive."""
    drive = get_drive_service(session_id)
    created_folders: Dict[str, str] = {} # Map folder_name -> new folder_id
    executed = []
    undo_actions = []

    for op in req.operations:
        if op.type == "CREATE_FOLDER":
            parent = op.parent_id or "root"
            folder = drive.create_folder(folder_name=op.folder_name, parent_id=parent)
            created_folders[op.folder_name] = folder["id"]
            executed.append({
                "type": "CREATE_FOLDER",
                "folder_name": op.folder_name,
                "folder_id": folder["id"]
            })
            # Undo for create folder: we can move it to trash later if needed

        elif op.type == "MOVE_FILE":
            target_id = op.target_folder_id
            if not target_id and op.target_folder_name in created_folders:
                target_id = created_folders[op.target_folder_name]

            if target_id and op.file_id:
                moved = drive.move_file(
                    file_id=op.file_id,
                    target_folder_id=target_id,
                    current_parent_id=op.source_folder_id
                )
                executed.append({
                    "type": "MOVE_FILE",
                    "file_id": op.file_id,
                    "file_name": op.file_name,
                    "target_id": target_id
                })
                # Register undo step: move back to source
                if op.source_folder_id:
                    undo_actions.append({
                        "file_id": op.file_id,
                        "restore_to": op.source_folder_id,
                        "current_folder": target_id
                    })

    undo_token = str(uuid.uuid4())[:8]
    if undo_actions:
        UNDO_STORE[undo_token] = undo_actions

    return ExecutionResult(
        success=True,
        message=f"Successfully executed {len(executed)} operations.",
        executed_operations=executed,
        undo_token=undo_token if undo_actions else None
    )

@app.post("/api/agent/undo")
def undo_last_operation(undo_token: str = Query(...), session_id: str = Query(...)):
    """Revert the file movements of a previous plan."""
    if undo_token not in UNDO_STORE:
        raise HTTPException(status_code=404, detail="Undo token not found or already restored.")

    drive = get_drive_service(session_id)
    actions = UNDO_STORE.pop(undo_token)
    reverted_count = 0

    for act in actions:
        try:
            drive.move_file(
                file_id=act["file_id"],
                target_folder_id=act["restore_to"],
                current_parent_id=act["current_folder"]
            )
            reverted_count += 1
        except Exception:
            pass

    return {"success": True, "message": f"Successfully reverted {reverted_count} file movements."}
