@echo off
echo ========================================================
echo        Starting Smart Drive Assistant Services
echo ========================================================

start "Smart Drive Backend (FastAPI)" cmd /k "cd /d %~dp0 && python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload"

start "Smart Drive Frontend (React)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both services are starting:
echo  - Backend API: http://localhost:8000
echo  - Frontend Dashboard: http://localhost:5173
echo.
echo Press any key to exit this launcher window...
pause >nul
