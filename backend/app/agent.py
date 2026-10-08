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
        
        # 2. Extract content snippets for documents to enable deep content-aware sorting
        files_with_context = []
        for f in current_files[:30]:
            snippet = ""
            if not f["isFolder"]:
                snippet = self.drive.get_file_content_snippet(f["id"], f["mimeType"], max_chars=400)
            files_with_context.append({
                "id": f["id"],
                "name": f["name"],
                "mimeType": f["mimeType"],
                "isFolder": f["isFolder"],
                "modifiedTime": f.get("modifiedTime"),
                "content_preview": snippet if snippet else None
            })

        # 3. System Prompt instructing Gemini with full suite of actions
        system_instruction = (
            "You are Smart Drive Assistant, an autonomous Google Drive file manager with deep content inspection.\n"
            "You can analyze file contents (PDFs, Docs, Sheets), identify duplicates, and execute organization plans.\n"
            "Supported operation types:\n"
            "- 'CREATE_FOLDER': { folder_name, parent_id, reason }\n"
            "- 'MOVE_FILE': { file_id, file_name, source_folder_id, target_folder_name, reason }\n"
            "- 'RENAME_FILE': { file_id, file_name, new_name, reason }\n"
            "- 'SHARE_FILE': { file_id, file_name, email, role: 'reader'|'writer', reason }\n"
            "- 'CREATE_DOC': { doc_title, parent_id, reason }\n"
            "- 'EXPORT_PDF': { file_id, file_name, reason }\n\n"
            "Format your response as valid JSON matching this schema:\n"
            "{\n"
            '  "explanation": "Clear summary of the organization plan and insights from document contents",\n'
            '  "operations": [\n'
            '    {\n'
            '      "id": "unique-uuid-str",\n'
            '      "type": "OPERATION_TYPE",\n'
            '      ...\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "Rules:\n"
            "1. Inspect 'content_preview' to understand what each document actually is (e.g. invoice, resume, receipt, report) and categorize accordingly.\n"
            "2. If creating a new folder, include the CREATE_FOLDER operation before MOVE_FILE operations targeting it.\n"
            "3. If user asks to share a file, include SHARE_FILE.\n"
            "4. Return ONLY raw JSON without markdown code fences."
        )

        user_content = {
            "user_request": user_prompt,
            "current_folder_id": current_folder_id,
            "available_files": files_with_context
        }

        # Google API requires gemini-3.8-flash
        models_to_try = ["gemini-3.8-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
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
