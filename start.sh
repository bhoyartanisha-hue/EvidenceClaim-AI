#!/usr/bin/env bash
set -e

echo "==================================================="
echo "  ClaimIQ - Evidence-First Claims Intelligence"
echo "==================================================="

# Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/"
    exit 1
fi

node -e "const v=parseInt(process.versions.node.split('.')[0]); if(v<18){console.error('[ERROR] Node 18+ required. Current: '+process.version); process.exit(1);}"

# Check Python
PY_CMD=""
if command -v python3 >/dev/null 2>&1; then
    PY_CMD="python3"
elif command -v python >/dev/null 2>&1; then
    PY_CMD="python"
else
    echo "[ERROR] Python is not installed. Please install Python 3.11+ from https://python.org/"
    exit 1
fi

$PY_CMD -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)" || {
    echo "[ERROR] Python 3.11+ is required."
    exit 1
}

# Ensure .env files exist
if [ ! -f "backend/.env" ] && [ -f "backend/.env.example" ]; then
    cp backend/.env.example backend/.env
    echo "[OK] Created backend/.env from template"
fi

if [ ! -f "frontend/.env" ] && [ -f "frontend/.env.example" ]; then
    cp frontend/.env.example frontend/.env
    echo "[OK] Created frontend/.env from template"
fi

# Backend venv setup
if [ ! -f "backend/.venv/bin/python" ]; then
    echo "[*] Creating Python virtual environment in backend/.venv..."
    $PY_CMD -m venv backend/.venv
fi

if [ ! -d "backend/.venv/lib" ] || [ ! -f "backend/.venv/bin/uvicorn" ]; then
    echo "[*] Installing backend dependencies..."
    backend/.venv/bin/python -m pip install -r backend/requirements.txt
fi

# Frontend setup
if [ ! -d "node_modules/concurrently" ]; then
    echo "[*] Installing root dependencies..."
    npm install
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "[*] Installing frontend dependencies..."
    npm --prefix frontend install
fi

echo ""
echo "ClaimIQ is running -> Frontend: http://localhost:5173  Backend docs: http://localhost:8000/docs"
echo ""

npm run dev
