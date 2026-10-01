import os
import re
from pathlib import Path
from typing import Optional, List, Dict, Tuple, Any

ALLOWED_EXTENSIONS = {".txt", ".pdf", ".png", ".jpg", ".jpeg"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

def sanitize_filename(filename: str) -> str:
    # Strip paths, directory traversal
    base = os.path.basename(filename)
    # Remove any dangerous characters except alphanumerics, dots, hyphens, underscores
    sanitized = re.sub(r"[^a-zA-Z0-9._-]", "_", base)
    if not sanitized or sanitized.startswith("."):
        sanitized = f"upload_{sanitized}"
    return sanitized

def validate_file_metadata(filename: str, size_bytes: int) -> Tuple[bool, Optional[str]]:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file extension '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"
    if size_bytes > MAX_FILE_SIZE_BYTES:
        return False, f"File size exceeds 10 MB limit ({size_bytes} bytes)"
    return True, None

def extract_text_from_file(file_path: Path) -> Tuple[Optional[str], List[Dict[str, Any]]]:
    """
    Returns (full_text, pages_list) where pages_list is:
    [{"page": 1, "text": "..."}] for PDF or single page for text.
    Returns (None, []) if unreadable.
    """
    ext = file_path.suffix.lower()
    if ext == ".txt":
        try:
            with open(file_path, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
            return text, [{"page": 1, "text": text}]
        except Exception:
            return None, []

    elif ext == ".pdf":
        try:
            import pypdf
            reader = pypdf.PdfReader(str(file_path))
            pages = []
            full_text_parts = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                pages.append({"page": i + 1, "text": page_text})
                full_text_parts.append(page_text)
            return "\n\n".join(full_text_parts), pages
        except Exception:
            return None, []

    elif ext in {".png", ".jpg", ".jpeg"}:
        try:
            from PIL import Image
            import pytesseract
            img = Image.open(str(file_path))
            text = pytesseract.image_to_string(img)
            return text, [{"page": 1, "text": text}]
        except (ImportError, Exception):
            # OCR optional and import-guarded
            return None, []

    return None, []
