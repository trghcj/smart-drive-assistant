import json
import uuid
from typing import Dict, Any, List
from google import genai
from google.genai import types
from .config import GEMINI_API_KEY
from .drive_service import DriveService
from .schemas import PlanResponse, ProposedOperation

class DriveAgent:
    def __init__(self, drive_service: DriveService):
        self.drive = drive_service
        self.client = genai.Client(api_key=GEMINI_API_KEY)

    def analyze_and_plan(self, user_prompt: str, current_folder_id: str = "root") -> PlanResponse:
        """
        Takes user natural language request, inspects drive state, and asks Gemini
        to return an explanation and an executable list of ProposedOperations.
        """
        # 1. Fetch current context: files in root / current folder
        current_files = self.drive.list_files_in_folder(folder_id=current_folder_id, page_size=60)
        
        # If user asks about the whole drive, images, or searching, include search results
        query_lower = user_prompt.lower()
        if any(w in query_lower for w in ["whole drive", "entire drive", "all drive", "any image", "search", "where", "find"]):
            try:
                extra_files = self.drive.search_files(text_query="", page_size=50)
                existing_ids = {f["id"] for f in current_files}
                for ef in extra_files:
                    if ef["id"] not in existing_ids:
                        current_files.append(ef)
            except Exception:
                pass

        # 2. Extract content snippets intelligently:
        # Prioritize files explicitly named in prompt or relevant to prompt, with a strict max token budget
        files_with_context = []
        user_prompt_lower = user_prompt.lower()
        
        # Sort files so any files mentioned in the user's prompt come first
        sorted_files = sorted(
            current_files,
            key=lambda f: 0 if f["name"].lower() in user_prompt_lower or any(part in f["name"].lower() for part in user_prompt_lower.split() if len(part) > 3) else 1
        )

        # Inspect snippets for up to 15 relevant files to conserve API limits & quota
        for idx, f in enumerate(sorted_files[:30]):
            snippet = None
            if not f["isFolder"] and idx < 15:
                # Use compact 350 max_chars snippet
                snippet = self.drive.get_file_content_snippet(f["id"], f["mimeType"], max_chars=350)

            files_with_context.append({
                "id": f["id"],
                "name": f["name"],
                "mimeType": f["mimeType"],
                "isFolder": f["isFolder"],
                "modifiedTime": f.get("modifiedTime"),
                "content_preview": snippet if snippet else None
            })

        # 3. System Prompt instructing Gemini with full suite of actions & concise reporting
        system_instruction = (
            "You are Smart Drive Assistant, an autonomous AI Google Drive manager with deep content inspection.\n"
            "You analyze file contents (PDFs, Docs, Sheets, images like JPEG/PNG, videos like MP4), answer questions, and execute organization plans.\n\n"
            "Capabilities & Rules:\n"
            "1. DESCRIPTIVE FOLDER NAMING & LOCATIONS:\n"
            "   - When creating or moving to folders, choose professional, self-explanatory names (e.g., 'Campus Placements/2026 Batch', 'Marketing Media/Images', 'Video Footage/Recordings', 'Invoices & Receipts').\n"
            "   - Group files cleanly by domain, date, or content context.\n"
            "2. MULTIMEDIA & DOCUMENT ANALYSIS:\n"
            "   - For image & video files, inspect their metadata (dimensions, camera, geolocation, duration) to understand what they are.\n"
            "   - For spreadsheets and documents, review their content snippet to answer user inquiries.\n"
            "3. CONCISE EXECUTIVE SUMMARIES (API-FRIENDLY):\n"
            "   - Keep your 'explanation' crisp, minimal, and informative (under 250 words).\n"
            "   - When asked to read/extract data from a file, provide a compact summary table or bullet points instead of flooding raw dumps.\n"
            "4. Supported operation types:\n"
            "   - 'CREATE_FOLDER': { folder_name, parent_id, reason }\n"
            "   - 'MOVE_FILE': { file_id, file_name, source_folder_id, target_folder_name, reason }\n"
            "   - 'RENAME_FILE': { file_id, file_name, new_name, reason }\n"
            "   - 'SHARE_FILE': { file_id, file_name, email, role: 'reader'|'writer', reason }\n"
            "   - 'CREATE_DOC': { doc_title, parent_id, reason }\n"
            "   - 'EXPORT_PDF': { file_id, file_name, reason }\n\n"
            "Format your response as valid JSON matching this schema:\n"
            "{\n"
            '  "explanation": "Concise summary report or direct conversational answer",\n'
            '  "operations": [\n'
            '    {\n'
            '      "id": "unique-uuid-str",\n'
            '      "type": "OPERATION_TYPE",\n'
            '      ...\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "If no move/create actions are needed (e.g. user just asks a question or wants a summary), return 'operations': [].\n"
            "Return ONLY raw JSON without markdown code fences."
        )

        user_content = {
            "user_request": user_prompt,
            "current_folder_id": current_folder_id,
            "available_files": files_with_context
        }

        # Supported modern Gemini models
        models_to_try = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-flash-latest"]
        response = None
        last_err = None

        for model_name in models_to_try:
            try:
                response = self.client.models.generate_content(
                    model=model_name,
                    contents=f"System: {system_instruction}\n\nUser Input: {json.dumps(user_content, indent=2)}",
                )
                if response:
                    break
            except Exception as err:
                last_err = err
                continue

        if not response:
            raise last_err or Exception("Failed to call Gemini model")

        try:
            raw_text = response.text.strip()
            
            # Clean possible markdown wrapping ```json ... ```
            if raw_text.startswith("```"):
                lines = raw_text.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines and lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_text = "\n".join(lines).strip()

            parsed = json.loads(raw_text)
            
            # Ensure each operation has an id
            operations = []
            for op in parsed.get("operations", []):
                if not op.get("id"):
                    op["id"] = str(uuid.uuid4())[:8]
                operations.append(ProposedOperation(**op))

            return PlanResponse(
                explanation=parsed.get("explanation", "Plan generated."),
                operations=operations
            )

        except Exception as e:
            # Fallback if parsing or Gemini encountered error
            return PlanResponse(
                explanation=f"Error generating plan: {str(e)}",
                operations=[]
            )
