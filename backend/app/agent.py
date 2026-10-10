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
        res_folder = self.drive.list_files_in_folder(folder_id=current_folder_id, page_size=100)
        current_files = res_folder.get("files", [])
        
        # If user asks about spreadsheets, images, PDFs, documents, or deleting/searching, actively query matching files across Drive
        query_lower = user_prompt.lower()
        needs_search = any(w in query_lower for w in [
            "whole drive", "entire drive", "all drive", "search", "where", "find", "delete", "remove", "clean",
            "xls", "xlsx", "xlsb", "sheet", "spreadsheet", "excel", "csv",
            "pdf", "image", "jpg", "jpeg", "png", "svg", "gif", "doc", "docx", "document"
        ])

        if needs_search:
            try:
                extra_files = []
                # If specific types mentioned, query directly
                if any(w in query_lower for w in ["xls", "xlsx", "xlsb", "sheet", "spreadsheet", "excel"]):
                    extra_files.extend(self.drive.search_files(mime_type="application/vnd.google-apps.spreadsheet", page_size=60))
                    extra_files.extend(self.drive.search_files(text_query=".xls", page_size=60))
                    extra_files.extend(self.drive.search_files(text_query=".xlsx", page_size=60))
                if any(w in query_lower for w in ["pdf"]):
                    extra_files.extend(self.drive.search_files(mime_type="application/pdf", page_size=60))
                    extra_files.extend(self.drive.search_files(text_query=".pdf", page_size=60))
                if any(w in query_lower for w in ["image", "jpg", "jpeg", "png", "svg", "gif"]):
                    extra_files.extend(self.drive.search_files(text_query=".png", page_size=60))
                    extra_files.extend(self.drive.search_files(text_query=".jpg", page_size=60))
                    extra_files.extend(self.drive.search_files(text_query=".jpeg", page_size=60))
                    extra_files.extend(self.drive.search_files(text_query=".svg", page_size=60))

                # General search fallback
                extra_files.extend(self.drive.search_files(text_query="", page_size=60))

                existing_ids = {f["id"] for f in current_files}
                for ef in extra_files:
                    if ef["id"] not in existing_ids:
                        current_files.append(ef)
                        existing_ids.add(ef["id"])
            except Exception as e:
                print(f"Notice: extra file search: {e}")

        # 2. Extract content snippets intelligently:
        # Prioritize files explicitly named in prompt or relevant to prompt, with a strict max token budget
        files_with_context = []
        user_prompt_lower = user_prompt.lower()
        
        # Sort files so any files matching user criteria come first
        def match_priority(f):
            fname = f["name"].lower()
            fmime = f.get("mimeType", "").lower()
            if any(part in fname for part in user_prompt_lower.split() if len(part) > 2):
                return 0
            if any(w in user_prompt_lower for w in ["xls", "sheet", "excel"]) and ("sheet" in fmime or fname.endswith(('.xls', '.xlsx', '.xlsb', '.csv'))):
                return 0
            if "pdf" in user_prompt_lower and ("pdf" in fmime or fname.endswith('.pdf')):
                return 0
            if any(w in user_prompt_lower for w in ["image", "png", "jpg", "jpeg", "svg"]) and ("image" in fmime or fname.endswith(('.png', '.jpg', '.jpeg', '.svg', '.gif'))):
                return 0
            return 1

        sorted_files = sorted(current_files, key=match_priority)

        # Inspect snippets for relevant files to conserve API limits & quota
        for idx, f in enumerate(sorted_files[:60]):
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
            "You analyze file contents (PDFs, Docs, Sheets, images like JPEG/PNG/SVG, videos), answer questions, and execute organization plans.\n\n"
            "Capabilities & Rules:\n"
            "1. DESCRIPTIVE FOLDER NAMING & LOCATIONS:\n"
            "   - When creating or moving to folders, choose professional, self-explanatory names (e.g., 'Campus Placements/2026 Batch', 'Marketing Media/Images', 'Video Footage/Recordings', 'Invoices & Receipts').\n"
            "   - Group files cleanly by domain, date, or content context.\n"
            "2. MULTIMEDIA & DOCUMENT ANALYSIS:\n"
            "   - For image & vector files (.png, .jpg, .jpeg, .svg, .gif), inspect their metadata to understand what they are.\n"
            "   - For spreadsheets and documents, review their content snippet to answer user inquiries.\n"
            "3. COMPREHENSIVE FILE TYPE MATCHING (CRITICAL):\n"
            "   - When user asks to delete or organize Excel / spreadsheet / .xls files:\n"
            "     * Treat ALL of the following as spreadsheet files: files with extension .xls, .xlsx, .xlsb, .csv, as well as native Google Sheets ('application/vnd.google-apps.spreadsheet', even if the name doesn't have an extension like 'Ciena', 'CMS IT Services', 'CDC round 2 absent student').\n"
            "     * Do NOT omit files just because they don't have '.xlsx' at the end! Check the mimeType and name.\n"
            "   - When user asks to delete or organize PDF files:\n"
            "     * Include all files ending with .pdf or with mimeType 'application/pdf'.\n"
            "   - When user asks to delete or organize image files (.jpg, .jpeg, .png, .svg):\n"
            "     * Include files with extension .jpg, .jpeg, .png, .svg, or mimeType starting with 'image/'.\n"
            "4. CLEAN, CONCISE FORMATTING (NO CLUTTER):\n"
            "   - Write in clean, beautiful, natural prose. Do NOT use markdown heading hashes (like '###').\n"
            "   - Do NOT overuse bold asterisks ('**'). Use bold sparingly only for file names or crucial numbers.\n"
            "   - Do NOT use unnecessary slashes, escaped characters, or raw markdown artifacts.\n"
            "   - Format lists with clean bullet dashes ('•' or '-') or simple numbered steps (1., 2.).\n"
            "   - Keep your 'explanation' crisp, minimal, and informative (under 200 words).\n"
            "5. Supported operation types:\n"
            "   - 'CREATE_FOLDER': { folder_name, parent_id, reason }\n"
            "   - 'MOVE_FILE': { file_id, file_name, source_folder_id, target_folder_name, reason }\n"
            "   - 'RENAME_FILE': { file_id, file_name, new_name, reason }\n"
            "   - 'SHARE_FILE': { file_id, file_name, email, role: 'reader'|'writer', reason }\n"
            "   - 'CREATE_DOC': { doc_title, target_folder_name, doc_content: 'Full structured analysis report text to write inside the document', reason }\n"
            "   - 'EXPORT_PDF': { file_id, file_name, reason }\n"
            "   - 'DELETE_FILE': { file_id, file_name, reason: 'Specific reason for permanent deletion' }\n"
            "   - 'DELETE_FOLDER': { file_id, folder_name, reason: 'Specific reason for permanent deletion of folder' }\n\n"
            "6. DELETION SAFETY & PERMISSION:\n"
            "   - When the user asks to delete files (e.g. 'delete all xls files', 'delete all png images', 'delete invoice.pdf', 'delete old folder'), identify ALL matching target files or folders from 'available_files', and return 'DELETE_FILE' or 'DELETE_FOLDER' operations for every matching file.\n"
            "   - In 'explanation', clearly list how many files you found and state that you have queued them for permanent deletion pending user approval.\n"
            "   - The user will be prompted to approve the deletion plan before anything is deleted.\n\n"
            "CRITICAL: When generating a summary report or analysis document (CREATE_DOC), ALWAYS populate 'doc_content' with the comprehensive summary, metrics, and findings so the created Google Doc is populated and not blank!\n\n"
            "Format your response as valid JSON matching this schema:\n"
            "{\n"
            '  "explanation": "Clean and concise explanation or summary for the user",\n'
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

        # Broad pool of high-availability Gemini models (Flash, 2.5, 2.0, 1.5)
        models_to_try = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-flash-latest"
        ]
        response = None
        last_err = None

        import time

        for model_name in models_to_try:
            # Try each model up to 2 times with a quick backoff if temporarily 503 or 429
            for attempt in range(2):
                try:
                    response = self.client.models.generate_content(
                        model=model_name,
                        contents=f"System: {system_instruction}\n\nUser Input: {json.dumps(user_content, indent=2)}",
                    )
                    if response and response.text:
                        break
                except Exception as err:
                    last_err = err
                    err_str = str(err).lower()
                    if "503" in err_str or "unavailable" in err_str or "429" in err_str or "high demand" in err_str:
                        time.sleep(1.2 * (attempt + 1))
                        continue
                    else:
                        break
            if response and response.text:
                break

        if not response:
            raise last_err or Exception("All Gemini models are temporarily busy. Please retry in a few moments.")

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
