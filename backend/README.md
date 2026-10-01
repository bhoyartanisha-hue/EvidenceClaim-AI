# ClaimIQ Backend

> **TECHNOVA '26, Track 2: AI Agent Challenges**  
> AI Insurance Claims Intelligence Agent — Decision-Support Backend.

ClaimIQ processes multi-document insurance claims (claim forms, repair invoices, policy schedules, accident reports) through a sequential pipeline of **7 narrow, deterministic-first agents**. Every decision and finding is grounded in verifiable evidence linking back to extracted values, policy clauses, or absence indicators.

---

## 1. Overview

ClaimIQ provides automated ingestion, document extraction, policy retrieval, anomaly identification, complexity scoring, and route recommendation for insurance claims. Designed with a **local-first and deterministic-first** architecture, the core demo operates with zero paid APIs or internet connectivity. Optional local LLMs (via Ollama) can enhance human-readable summaries and phrasing without altering underlying factual assessments or evidence links.

---

## 2. Architecture Diagram

```text
[ Incoming Claim & Documents ]
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                   ClaimIQ Pipeline Orchestrator                 │
  └─────────────────────────────────────────────────────────────────┘
             │
             ├──► 1. DocumentAgent (Regex extraction, dates, money)
             │        └─ Extracts E1 (date), E2 (amount), E3, E4...
             │
             ├──► 2. PolicyRAGAgent (TF-IDF + Cosine Retrieval)
             │        └─ Retrieves S3.1 (E5), S4.2 (E6) verbatim
             │
             ├──► 3. CoverageAgent (Applicable / Conflict / Insufficient)
             │        └─ Validates exclusions & policy applicability
             │
             ├──► 4. MissingInformationAgent (Completeness %)
             │        └─ Identifies missing Accident Report (E8)
             │
             ├──► 5. AnomalyAgent (Cross-Document Consistency)
             │        └─ Flags A1 (date mismatch) & A2 (amount mismatch)
             │
             ├──► 6. AssessmentAgent (Prototype Score 0-100 & Route)
             │        └─ Base: 20 + Missing: 12 + Anomalies: 30 = Score 62
             │
             └──► 7. HumanReviewAgent (Action Checklist & Summary)
                      └─ Produces structured synthesis & next steps
             │
             ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │                    Evidence Engine Validator                    │
  │     (Confirms all evidence_ids resolve; strips unsupported)     │
  └─────────────────────────────────────────────────────────────────┘
             │
             ▼
[ Output: Live Streaming & Persisted Analysis (Shared API Contract) ]
```

---

## 3. The 7 Agents and What Each Does

1. **DocumentAgent (`key: document`)**:
   - Classifies document types (`claim_form`, `repair_invoice`, `policy`, `accident_report`).
   - Extracts structured fields using deterministic regex patterns (case-insensitive labels, dates in `DD/MM/YYYY` converted to ISO `YYYY-MM-DD`, INR amounts converted to `int`).
   - Registers verifiable evidence for accident dates, repair dates, and claimed/invoiced amounts.

2. **PolicyRAGAgent (`key: policy_rag`)**:
   - Ingests policy documents into numbered section chunks (`S3.1`, `S4.2`, etc.).
   - Employs scikit-learn `TfidfVectorizer` and cosine similarity across dual queries (coverage query and required-documents query).
   - Retrieves matching policy sections verbatim with relevance scores.

3. **CoverageAgent (`key: coverage`)**:
   - Evaluates coverage against retrieved policy clauses.
   - Flags policy exclusions (`conflict`), validates covered damage (`applicable`), or marks `insufficient_evidence`.
   - Optionally asks local LLM to refine the explanatory reason while strictly preserving the deterministic outcome.

4. **MissingInformationAgent (`key: missing_info`)**:
   - Checks presence of required documents for claim types (e.g. `vehicle_accident` requires claim form, policy, repair invoice, accident report).
   - Calculates completeness percentage (75% for 3 of 4 documents).
   - Registers absence evidence for missing documents and links applicable policy clauses.

5. **AnomalyAgent (`key: anomaly`)**:
   - Performs rule-based structured comparisons across documents.
   - Detects `date_mismatch` (e.g. repair invoice date preceding accident date) and `amount_mismatch` (difference between invoice and claim amounts).
   - Detects claimant name variations and conflicting policy numbers.
   - Adheres strictly to non-accusatory language ("Anomaly detected", "Risk indicator").

6. **AssessmentAgent (`key: assessment`)**:
   - Computes transparent prototype score (Base 20 + 12 per missing doc + 15 per medium anomaly = 62).
   - Categorizes complexity (`low` < 40, `medium` 40–69, `high` >= 70).
   - Determines routing: `automated_processing`, `human_review`, or `investigation_required`.

7. **HumanReviewAgent (`key: human_review`)**:
   - Synthesizes findings into a concise overview, itemized findings list, and recommended next step.
   - Strictly enforces safe wording without ever outputting banned terms.

---

## 4. Tech Stack

- **Runtime**: Python 3.11+ (Tested on Python 3.13)
- **Web Framework**: FastAPI, Uvicorn
- **Validation & Serialization**: Pydantic v2
- **Database**: SQLite (standard library `sqlite3`)
- **Document Processing**: `pypdf` for PDF parsing, UTF-8 text parser, optional `pytesseract` + `Pillow` for OCR
- **Retrieval Engine**: `scikit-learn` (TF-IDF vectorizer + cosine similarity)
- **Local AI Provider**: Ollama (HTTP client with format `json`, 20s timeout, graceful fallback)
- **Testing**: `pytest`, `httpx`

---

## 5. Installation

```bash
# 1. Clone the repository and navigate to backend
cd backend

# 2. Create and activate a virtual environment
python -m venv .venv
# On Windows:
.venv\Scripts\activate
# On Linux/macOS:
source .venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt
```

---

## 6. Environment Variables

Create `.env` in the `backend/` directory (or copy from `.env.example`):

```bash
cp .env.example .env
```

| Variable | Default | Description |
|:---|:---|:---|
| `AI_PROVIDER` | `none` | AI provider choice (`none` or `ollama`) |
| `MODEL_NAME` | `""` | Ollama model name (e.g., `llama3:8b`, `mistral`) |
| `AI_BASE_URL` | `http://localhost:11434` | Ollama base URL |
| `DATABASE_URL` | `sqlite:///./claimiq.db` | SQLite database connection string |
| `DEMO_STEP_DELAY_MS` | `700` | UI delay between agent stages in milliseconds |

---

## 7. Running the Backend

Run the server with automatic reload:

```bash
uvicorn main:app --reload --port 8000
```

Verify that the health check endpoint responds:
```bash
curl http://localhost:8000/api/health
# {"status":"ok","ai_provider":"none","ai_available":false}
```

---

## 8. Optional Ollama Setup

To enable local LLM-assisted phrasing:

1. Install and start [Ollama](https://ollama.ai).
2. Pull your chosen model:
   ```bash
   ollama pull llama3
   ```
3. Update `backend/.env`:
   ```ini
   AI_PROVIDER=ollama
   MODEL_NAME=llama3
   AI_BASE_URL=http://localhost:11434
   ```
4. Restart the backend. If Ollama is unavailable or times out, ClaimIQ automatically activates `demo_fallback` mode without interruption.

---

## 9. Loading and Testing the Demo Claim

### Via cURL:

```bash
# 1. Load the pre-configured demo claim (vehicle accident, 3 documents)
curl -X POST http://localhost:8000/api/demo/load

# 2. Trigger the multi-agent analysis pipeline
curl -X POST http://localhost:8000/api/claims/CLM-1001/analyze

# 3. Poll the live analysis
curl http://localhost:8000/api/claims/CLM-1001/analysis
```

### Via Demo Script:

```bash
python -m backend.scripts.run_demo
```

### Via Interactive Polling Verification Script:

```bash
python backend/scripts/test_demo_flow.py
```

---

## 10. API Endpoints Table

Base URL: `http://localhost:8000`

| Method | Endpoint | Description |
|:---|:---|:---|
| `GET` | `/` | API status and documentation link |
| `GET` | `/api/health` | Health check & AI provider status |
| `POST` | `/api/claims` | Create a new claim draft |
| `GET` | `/api/claims` | List all claims (newest first) |
| `GET` | `/api/claims/{id}` | Get claim details and attached documents |
| `POST` | `/api/claims/{id}/documents` | Upload a document (`.pdf`, `.txt`, `.png`, `.jpg`, `.jpeg`, max 10MB) |
| `POST` | `/api/claims/{id}/analyze` | Trigger asynchronous pipeline analysis (returns 202) |
| `GET` | `/api/claims/{id}/analysis` | Get live/completed analysis with all 7 agent states |
| `GET` | `/api/claims/{id}/evidence` | Get lookup table of resolved evidence items |
| `POST` | `/api/demo/load` | Initialize demo claim with sample documents |

---

## 11. Known Limitations

- **TF-IDF Retrieval**: Policy clause matching is lexical and keyword-based. Highly nuanced clauses with zero overlapping vocabulary may receive lower relevance scores.
- **Regex Extraction**: Document data extraction relies on common insurance form headers and patterns. Non-standard forms may require OCR or additional pattern mappings.
- **OCR Import-Guarded**: `pytesseract` and `Pillow` are optional dependencies. When uninstalled, image uploads are safely flagged for human document processing.
- **Prototype Scoring**: The 0–100 complexity metric is a prototype heuristic designed for triage routing, not an actuarial rating engine.

---

## 12. Responsible-AI Boundaries

1. **Decision Support Only**: ClaimIQ is strictly an automated triage and decision-support assistant. All recommendations (`automated_processing`, `human_review`, `investigation_required`) are subject to human adjuster review.
2. **No Fraud Accusations**: ClaimIQ never outputs words such as *"fraud confirmed"*, *"fraudulent"*, *"approved"*, or *"rejected"*. Inconsistencies are framed objectively as *"Anomaly detected"* or *"Risk indicator"*.
3. **No Invented Evidence**: The system never hallucinates clauses, page references, or values. If evidence cannot be resolved, findings are flagged as `unsupported` and discounted from scoring.
4. **Local and Private**: Document text is never logged to standard outputs and no customer data is transmitted to third-party cloud APIs.
