# 🌿 Smart Drive Assistant

**Autonomous AI Operating System for Google Drive** powered by **Gemini 3.8 Flash**, **FastAPI**, and **React 19 (Vite + Tailwind CSS)**.

Smart Drive Assistant bridges the gap where native Drive Gemini stops: it doesn't just read documents—it has **hands to execute**, safely organizing files, creating folder structures, detecting duplicates, and scheduling background maintenance sweeps with full user control, dry-run previews, and one-click instant undo.

---

## ✨ Features Implemented Today

### 1. 🤖 Autonomous Gemini 3.8 Flash Agent & Media Inspection
- **Natural Language Execution**: Direct actions from plain English prompts (*"Find all 2026 invoices and put them into a new Taxes folder"*).
- **Deep Content & Multimedia Inspection**:
  - Reads text snippets inside PDFs (via `pypdf`), Google Docs, and Sheets.
  - **Images & Video Analysis**: Analyzes media metadata for images (`.jpg`, `.png`, `.webp` - dimensions, camera model, geolocations, timestamps) and videos (`.mp4`, `.mov`, `.mkv` - resolution, duration) without consuming excessive token limits.
  - **API Token-Budget Optimization**: Prioritizes selected/queried files, restricts character payloads to 350 characters, and produces concise executive summaries under 250 words.
- **Smart Folder Categorization & Naming**: Automatically selects professional, structured destination paths (e.g. `Campus Placements/2026 Batch`, `Media Assets/Images`, `Financials/Invoices & Receipts`).
- **Multimodal Voice Input**: Native browser Web Speech API microphone integration in the chat input for hands-free voice commands.

### 2. 🛡️ Safety-First Architecture & Reversibility
- **Interactive Dry-Run Card**: The agent proposes actions (`CREATE_FOLDER`, `MOVE_FILE`, `RENAME_FILE`, `SHARE_FILE`, `CREATE_DOC`, `EXPORT_PDF`) in a review card with explicit reasons before executing.
- **1-Click Instant Undo**: Reverts any batch file moves back to their original parent locations with a single click.
- **Zero Drive Takeover / Privacy**: Files remain 100% inside user Google Drive. No documents or user files are ever stored on our servers.

### 3. ☑️ Interactive Multi-File Selection & Bulk Actions
- **Active Bulk Action Toolbar**: Selecting one or multiple files slides in a specialized bulk action bar:
  - **Selection Counter & Clear**: Real-time counter badge and one-click clear button.
  - **✨ Ask Assistant**: Feeds the exact list of selected files into the AI chat to summarize, organize, or categorize.
  - **⭐ Star / Unstar**: Bulk toggles star status on Google Drive in parallel.
  - **🗑️ Bulk Trash**: Safe confirmation modal to batch-trash selected items.

### 4. 📂 Live Google Drive Explorer & Ingestion
- **Real-Time Drive Tree Navigation**: Interactive explorer with breadcrumb navigation, type badges, file sizes, and direct links to Drive.
- **Mouse Draggable Resizing**: Drag the border between the File Manager and Assistant to smoothly resize the panels to any desired width.
- **Local-to-Drive File Uploader**:
  - Top toolbar **Upload Files** button for multi-file desktop uploads.
  - Full drag-and-drop dropzone directly over the file list container.

### 5. 🔍 Duplicates Detection (MD5 Checksum)
- Dedicated **Find Duplicates** modal tool that compares exact MD5 hashes and file sizes to identify redundant copies in any folder.

### 6. ⏰ Scheduled Autonomous Maintenance
- **Auto-Clean Schedule** powered by `APScheduler`:
  - Configurable frequencies: Every Friday at 5:00 PM, Daily at Midnight, or Hourly Maintenance Sweeps.
  - Automatically sweeps unorganized loose files into a target archive folder.

### 7. 📤 Sharing & Document Tools
- **File Sharing**: Grant Editor or Viewer permissions directly from the AI chat (*"Share offer letter with friend@gmail.com as reader"*).
- **Document Creation & PDF Export**: Create blank Google Docs or export spreadsheets/docs to PDF format.

### 8. 🗑️ Delete Account & Privacy Compliance
- **1-Click Account Purge**:
  - Revokes OAuth tokens directly with Google's revocation endpoint (`https://oauth2.googleapis.com/revoke`).
  - Purges user profile, session credentials, and undo transactions from persistent storage.
  - Clears browser `localStorage` and completely logs out.

### 9. 🎨 Design System: White & Olive Green Theme
- **Olive & Moss Palette**: Clean neutral background `#f7f8f6`, olive accents `#4d602c`, and light green scrollbar thumb styling (`#c8d6b9` with hover `#9bb185`).
- **Collapsible Sidebar**: Smoothly collapses into a compact `w-16` icon bar with centered expand/collapse toggle and border alignment.
- **Independent Scroll Areas**: Fixed header, independently scrolling file lists, and dedicated assistant panel.

---

## 📁 Project Structure

```
smart-drive-assistant/
├── .env                       # Local secrets (never committed)
├── start.bat                  # One-click Windows local dev launcher
├── README.md                  # Complete documentation
│
├── backend/
│   ├── requirements.txt       # FastAPI, Google APIs, pypdf, APScheduler
│   ├── storage/               # Persistent JSON session & undo storage
│   └── app/
│       ├── config.py          # Environment settings & Drive scopes
│       ├── schemas.py         # Pydantic models (operations, plans, schedules)
│       ├── drive_service.py   # Google Drive v3 REST wrapper & OCR helpers
│       ├── agent.py           # Gemini 3.8 Flash agent & plan synthesizer
│       └── main.py            # FastAPI REST, OAuth, upload & schedule routes
│
└── frontend/
    ├── package.json           # React 19, Lucide icons, Axios, Tailwind v4
    ├── vite.config.js         # Vite configuration with 0.0.0.0 host binding
    ├── index.html             # Inter font & metadata
    └── src/
        ├── App.jsx            # Full Dashboard (Explorer, Chat, Modals, Audio)
        └── index.css          # Tailwind CSS theme & olive green components
```

---

## 🌐 Production Deployments

- **Frontend (Vercel)**: `https://smart-drive-assistant-lovat.vercel.app`
- **Backend (Render)**: `https://smart-drive-assistant.onrender.com`
- **GitHub Repository**: `https://github.com/trghcj/smart-drive-assistant`

---

## 🚀 Running Locally

### Option 1: One-Click Launcher (Windows)
Double-click `start.bat` in the root folder. Both FastAPI (`http://localhost:8000`) and Vite React (`http://localhost:5173`) will launch automatically in separate terminal windows.

### Option 2: Manual Terminal

1. **Start the FastAPI Backend**:
   ```bash
   cd smart-drive-assistant
   python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload
   ```

2. **Start the React Frontend**:
   ```bash
   cd smart-drive-assistant/frontend
   npm run dev
   ```

3. Open **`http://localhost:5173`** in your browser.

---

## 🔒 Security & Google OAuth Notes

- Smart Drive Assistant uses Google's official OAuth 2.0 flow with PKCE.
- During Testing mode, only authorized Test Users listed in Google Cloud Console can sign in.
- All file manipulations require explicit user confirmation via the dry-run review card.
