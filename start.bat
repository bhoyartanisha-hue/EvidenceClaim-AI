@echo off
setlocal enabledelayedexpansion

echo ===================================================
echo   ClaimIQ - Evidence-First Claims Intelligence
echo ===================================================

:: Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Please install Node.js 18+ from https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
for /f "tokens=2 delims=v." %%b in ('node -v') do (
    if "!NODE_MAJOR!"=="" set NODE_MAJOR=%%b
)
:: Node version check
node -e "const v=parseInt(process.versions.node.split('.')[0]); if(v<18){console.error('[ERROR] Node 18+ required. Current: '+process.version); process.exit(1);}"
if %errorlevel% neq 0 (
    pause
    exit /b 1
)

:: Check Python
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH.
    echo Please install Python 3.11+ from https://python.org/
    pause
    exit /b 1
)

python -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if %errorlevel% neq 0 (
    echo [ERROR] Python 3.11+ is required.
    pause
    exit /b 1
)

:: Ensure .env files exist
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        copy "backend\.env.example" "backend\.env" >nul
        echo [OK] Created backend\.env from template
    )
)
if not exist "frontend\.env" (
    if exist "frontend\.env.example" (
        copy "frontend\.env.example" "frontend\.env" >nul
        echo [OK] Created frontend\.env from template
    )
)

:: Backend venv setup
if not exist "backend\.venv\Scripts\python.exe" (
    echo [*] Creating Python virtual environment in backend\.venv...
    python -m venv backend\.venv
)

if not exist "backend\.venv\Lib\site-packages\fastapi" (
    echo [*] Installing backend dependencies...
    backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
)

:: Frontend setup
if not exist "node_modules\concurrently" (
    echo [*] Installing root dependencies...
    call npm.cmd install
)

if not exist "frontend\node_modules" (
    echo [*] Installing frontend dependencies...
    call npm.cmd --prefix frontend install
)

echo.
echo ClaimIQ is running -^> Frontend: http://localhost:5173  Backend docs: http://localhost:8000/docs
echo.

call npm.cmd run dev
