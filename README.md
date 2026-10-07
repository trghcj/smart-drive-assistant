# Smart Drive Assistant (FastAPI + React + Gemini)

Autonomous AI assistant for Google Drive file organization, folder creation, and batch moving with dry-run safety approvals and one-click undo.

---

## 📁 Project Structure

```
smart-drive-assistant/
├── .env                       # OAuth credentials & Gemini API key
├── start.bat                  # One-click launcher for Windows
├── backend/
│   ├── requirements.txt       # FastAPI & Google API dependencies
│   └── app/
│       ├── config.py          # Environment settings & Drive scopes
│       ├── schemas.py         # Pydantic models for plans & items
│       ├── drive_service.py   # Google Drive API v3 operations
│       ├── agent.py           # Gemini 2.5 Flash agent & plan generator
│       └── main.py            # FastAPI REST & OAuth routes
└── frontend/
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx            # Explorer UI, Chat & Plan approval
        └── index.css          # Tailwind CSS styles
```

---

## 🚀 How to Run

### Method 1: One-Click Launcher (Recommended)
Double-click `start.bat` in the project root folder. It will launch both the FastAPI backend and Vite React frontend in separate terminal windows.

### Method 2: Manual Terminal Run

1. **Start the FastAPI Backend**:
   ```bash
   cd "C:\Users\suremdra singh\Desktop\smart-drive-assistant"
   python -m uvicorn backend.app.main:app --port 8000 --reload
   ```

2. **Start the React Frontend**:
   ```bash
   cd "C:\Users\suremdra singh\Desktop\smart-drive-assistant\frontend"
   npm run dev
   ```

3. Open **`http://localhost:5173`** in your browser.

---

## 🔒 Safety Features Included

1. **Dry-Run Plan Card**: The AI never moves files behind your back. It presents an interactive review card with the exact folders it intends to create and files it will move.
2. **One-Click Undo**: After executing any batch organization, an "Undo Action" button lets you revert all moved files back to their original parent locations.
