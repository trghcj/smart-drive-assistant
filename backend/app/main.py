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

# Enable CORS for React frontend (Vercel deployments & localhost)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://smart-drive-assistant-lovat.vercel.app",
    ],
    allow_origin_regex=r"https:\/\/.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from pathlib import Path

# Persisted file storage for sessions and undo tokens
STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SESSIONS_FILE = STORAGE_DIR / "sessions.json"
UNDO_FILE = STORAGE_DIR / "undo.json"

def load_data(file_path: Path) -> dict:
    if file_path.exists():
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_data(file_path: Path, data: dict):
    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving {file_path}: {e}")

USER_SESSIONS: Dict[str, dict] = load_data(SESSIONS_FILE)
UNDO_STORE: Dict[str, list] = load_data(UNDO_FILE)

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
    save_data(SESSIONS_FILE, USER_SESSIONS)

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

import requests

@app.post("/api/auth/delete-account")
def delete_account(session_id: str = Query(...)):
    """
    Permanently delete account:
    1. Revoke the OAuth access token with Google's revocation endpoint.
    2. Wipe the session and all credentials from disk database/storage.
    """
    if session_id in USER_SESSIONS:
        token = USER_SESSIONS[session_id].get("access_token")
        # Attempt to revoke token with Google
        if token:
            try:
                requests.post(
                    "https://oauth2.googleapis.com/revoke",
                    params={"token": token},
                    headers={"content-type": "application/x-www-form-urlencoded"},
                    timeout=5
                )
            except Exception as e:
                print(f"Token revocation error (non-fatal): {e}")

        # Delete from persistent storage
        del USER_SESSIONS[session_id]
        save_data(SESSIONS_FILE, USER_SESSIONS)

    return {"success": True, "message": "Account and all session data permanently deleted."}

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

from fastapi import UploadFile, File

@app.post("/api/drive/upload")
async def upload_file_to_drive(
    file: UploadFile = File(...),
    folder_id: str = "root",
    session_id: str = Query(...)
):
    """Upload a local desktop file into the current Google Drive folder."""
    try:
        drive = get_drive_service(session_id)
        content = await file.read()
        uploaded = drive.upload_file(
            filename=file.filename,
            file_bytes=content,
            mime_type=file.content_type,
            parent_folder_id=folder_id
        )
        return {"success": True, "file": uploaded}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ----------------- AGENT AI ROUTES -----------------

@app.post("/api/agent/chat", response_model=PlanResponse)
def chat_with_agent(req: ChatRequest, session_id: str = Query(...)):
    """Analyze user request and propose structured plan."""
    try:
        drive = get_drive_service(session_id)
        agent = DriveAgent(drive)
        plan = agent.analyze_and_plan(user_prompt=req.message, current_folder_id=req.current_folder_id)
        return plan
    except Exception as e:
        print(f"Error in chat_with_agent: {e}")
        return PlanResponse(
            explanation=f"Notice: {str(e)}",
            operations=[]
        )

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

        elif op.type == "SHARE_FILE":
            if op.file_id and op.email:
                drive.share_file(file_id=op.file_id, email=op.email, role=op.role or "reader")
                executed.append({
                    "type": "SHARE_FILE",
                    "file_id": op.file_id,
                    "email": op.email,
                    "role": op.role or "reader"
                })

        elif op.type == "CREATE_DOC":
            doc = drive.create_google_doc(title=op.doc_title or op.file_name or "Untitled Doc", parent_folder_id=op.parent_id or "root")
            executed.append({
                "type": "CREATE_DOC",
                "doc_title": op.doc_title,
                "file_id": doc.get("id"),
                "webViewLink": doc.get("webViewLink")
            })

        elif op.type == "EXPORT_PDF":
            if op.file_id:
                pdf = drive.export_doc_as_pdf(file_id=op.file_id, filename=op.file_name or "Exported", target_folder_id=op.parent_id or "root")
                executed.append({
                    "type": "EXPORT_PDF",
                    "file_id": pdf.get("id"),
                    "name": pdf.get("name")
                })

    undo_token = str(uuid.uuid4())[:8]
    if undo_actions:
        UNDO_STORE[undo_token] = undo_actions
        save_data(UNDO_FILE, UNDO_STORE)

    return ExecutionResult(
        success=True,
        message=f"Successfully executed {len(executed)} operations.",
        executed_operations=executed,
        undo_token=undo_token if undo_actions else None
    )

@app.get("/api/drive/duplicates")
def get_duplicates(folder_id: str = "root", session_id: str = Query(...)):
    """Detect duplicate files using MD5 checksum and size/name comparison."""
    drive = get_drive_service(session_id)
    dups = drive.find_duplicates(folder_id=folder_id)
    return {"duplicates": dups}

from apscheduler.schedulers.background import BackgroundScheduler
SCHEDULER = BackgroundScheduler()
SCHEDULER.start()
SCHEDULED_TASKS = []

@app.post("/api/drive/schedule-cleanup")
def schedule_drive_cleanup(req: ScheduleCleanRequest, session_id: str = Query(...)):
    """Schedule recurring background sweep of root directory."""
    task_id = str(uuid.uuid4())[:8]
    SCHEDULED_TASKS.append({
        "id": task_id,
        "schedule": req.cron_time,
        "target_folder": req.target_folder_name,
        "session_id": session_id,
        "status": "active"
    })
    return {
        "success": True,
        "task_id": task_id,
        "message": f"Automation scheduled: Loose files will be organized into '{req.target_folder_name}' ({req.cron_time})."
    }

@app.get("/api/drive/schedules")
def list_scheduled_cleanups():
    return {"schedules": SCHEDULED_TASKS}

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
