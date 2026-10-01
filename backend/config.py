import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env if present
load_dotenv()

BASE_DIR = Path(__file__).resolve().parent

AI_PROVIDER = os.getenv("AI_PROVIDER", "none").lower()
MODEL_NAME = os.getenv("MODEL_NAME", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "http://localhost:11434").rstrip("/")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./claimiq.db")
DEMO_STEP_DELAY_MS = int(os.getenv("DEMO_STEP_DELAY_MS", "700"))

# SQLite database file path extraction
if DATABASE_URL.startswith("sqlite:///"):
    DB_PATH = DATABASE_URL.replace("sqlite:///", "")
    if DB_PATH.startswith("./"):
        DB_PATH = str(BASE_DIR / DB_PATH[2:])
else:
    DB_PATH = str(BASE_DIR / "claimiq.db")

UPLOADS_DIR = BASE_DIR / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

DEMO_DIR = BASE_DIR / "demo"
