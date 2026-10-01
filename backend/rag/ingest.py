import re
from typing import Optional, List, Dict, Any

_INDEX_CACHE: Dict[str, List[Dict[str, Any]]] = {}

def ingest_policy(
    filename: str,
    text: str,
    pages_list: Optional[List[Dict[str, Any]]] = None
) -> List[Dict[str, Any]]:
    """
    Splits policy text into structured chunks by numbered section headings.
    Caches chunks in memory by filename.
    Each chunk: {
        "section_id": "S3.1",
        "section": "3.1 Accidental Damage",
        "text": "Accidental vehicle damage...",
        "source_document": filename,
        "page": page_number or None
    }
    """
    if filename in _INDEX_CACHE and _INDEX_CACHE[filename]:
        return _INDEX_CACHE[filename]

    if not text:
        return []

    # Regex to match numbered sections like '1. Definitions' or '3.1 Accidental Damage'
    # Pattern: at start of line, number(s) with dot, then title
    pattern = r'(?m)^(\d+(?:\.\d+)?)\.?\s+([^\n\r]+)'
    matches = list(re.finditer(pattern, text))

    chunks: List[Dict[str, Any]] = []

    if matches:
        for i, match in enumerate(matches):
            sec_num = match.group(1)
            sec_title = match.group(2).strip()
            section_id = f"S{sec_num}"
            section_full = f"{sec_num} {sec_title}"

            start_body = match.end()
            end_body = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            body = text[start_body:end_body].strip()

            # Determine page if pages_list provided
            page = None
            if pages_list and len(pages_list) > 1:
                # Find which page contains start_body
                char_count = 0
                for p in pages_list:
                    p_len = len(p.get("text", ""))
                    if char_count + p_len >= match.start():
                        page = p.get("page")
                        break
                    char_count += p_len

            chunks.append({
                "section_id": section_id,
                "section": section_full,
                "text": body,
                "source_document": filename,
                "page": page
            })
    else:
        # Fallback to paragraph chunks ~400 chars
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        for i, para in enumerate(paragraphs):
            chunks.append({
                "section_id": f"S{i+1}",
                "section": f"Section {i+1}",
                "text": para,
                "source_document": filename,
                "page": None
            })

    _INDEX_CACHE[filename] = chunks
    return chunks

def clear_cache():
    _INDEX_CACHE.clear()
