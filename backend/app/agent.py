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
        
        # 2. System Prompt instructing Gemini to produce structured reorganization plan
        system_instruction = (
            "You are Smart Drive Assistant, an autonomous Google Drive file manager.\n"
            "The user will give you an instruction like 'Organize my invoices into a folder called 2026 Invoices', "
            "or 'Sort loose PDFs into Documents folder', etc.\n"
            "You must inspect the provided list of files in the current folder, select relevant files, "
            "and output a structured plan of operations.\n"
            "Allowed operation types: 'CREATE_FOLDER', 'MOVE_FILE', 'RENAME_FILE'.\n"
            "Format your response as valid JSON matching this schema:\n"
            "{\n"
            '  "explanation": "Clear explanation of what you plan to do",\n'
            '  "operations": [\n'
            '    {\n'
            '      "id": "unique-uuid-str",\n'
            '      "type": "CREATE_FOLDER",\n'
            '      "folder_name": "Folder Name",\n'
            '      "parent_id": "root",\n'
            '      "reason": "Why this folder is created"\n'
            '    },\n'
            '    {\n'
            '      "id": "unique-uuid-str",\n'
            '      "type": "MOVE_FILE",\n'
            '      "file_id": "original-file-id",\n'
            '      "file_name": "filename.pdf",\n'
            '      "source_folder_id": "current-folder-id",\n'
            '      "target_folder_name": "Target Folder Name",\n'
            '      "reason": "Why this file belongs in that folder"\n'
            '    }\n'
            '  ]\n'
            "}\n"
            "Important Rules:\n"
            "1. Only propose moving files that actually exist in the provided file list.\n"
            "2. If you need a new folder, include a CREATE_FOLDER operation before MOVE_FILE operations that target it.\n"
            "3. If the user request is just a question, return an empty operations list with the answer in 'explanation'.\n"
            "4. Return ONLY valid raw JSON without markdown code fences or backticks."
        )

        user_content = {
            "user_request": user_prompt,
            "current_folder_id": current_folder_id,
            "available_files": [
                {
                    "id": f["id"],
                    "name": f["name"],
                    "mimeType": f["mimeType"],
                    "isFolder": f["isFolder"],
                    "modifiedTime": f.get("modifiedTime")
                }
                for f in current_files
            ]
        }

        # List of supported models in order of preference
        models_to_try = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite"]
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
