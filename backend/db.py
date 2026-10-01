import sqlite3
import json
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
try:
    from .config import DB_PATH
except (ImportError, ValueError):
    from config import DB_PATH


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@contextmanager
def get_db():
    conn = get_db_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init_db():
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS claims (
                id TEXT PRIMARY KEY,
                claim_type TEXT NOT NULL,
                description TEXT NOT NULL,
                claim_amount INTEGER NOT NULL,
                incident_date TEXT NOT NULL,
                status TEXT NOT NULL,
                complexity TEXT,
                complexity_score INTEGER,
                recommendation TEXT,
                issues_count INTEGER,
                created_at TEXT NOT NULL
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT NOT NULL,
                claim_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                document_type TEXT,
                extracted_text TEXT,
                created_at TEXT NOT NULL,
                PRIMARY KEY (claim_id, id),
                FOREIGN KEY (claim_id) REFERENCES claims (id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agent_results (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id TEXT NOT NULL,
                agent_name TEXT NOT NULL,
                status TEXT NOT NULL,
                result_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims (id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                claim_id TEXT NOT NULL,
                agent_name TEXT NOT NULL,
                document_id TEXT,
                page INTEGER,
                field TEXT NOT NULL,
                value TEXT NOT NULL,
                description TEXT NOT NULL,
                confidence REAL NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims (id)
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS analyses (
                claim_id TEXT PRIMARY KEY,
                analysis_json TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (claim_id) REFERENCES claims (id)
            )
        """)

def get_next_claim_id() -> str:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM claims WHERE id LIKE 'CLM-%'")
        rows = cursor.fetchall()
        max_num = 1000
        for r in rows:
            cid = r["id"]
            try:
                num = int(cid.split("-")[1])
                if num > max_num:
                    max_num = num
            except (IndexError, ValueError):
                continue
        return f"CLM-{max_num + 1}"

def get_next_doc_id(claim_id: str) -> str:
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as count FROM documents WHERE claim_id = ?", (claim_id,))
        count = cursor.fetchone()["count"]
        return f"doc-{count + 1}"
