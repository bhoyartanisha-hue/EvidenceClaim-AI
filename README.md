# ClaimIQ — Evidence-First Multi-Agent Insurance Claims Intelligence

ClaimIQ is an evidence-first multi-agent AI decision-support platform designed for insurance claim adjusters. Instead of opaque "black-box" decisions, ClaimIQ structures every finding around four immutable pillars: **Decision → Reason → Evidence → Source**.

---

## The "Evidence-First AI" Core Concept

In traditional AI insurance systems, claims are often scored or rejected without explainability. ClaimIQ never concludes fraud or approves/rejects claims autonomously. Instead, ClaimIQ provides:
- **Decision Support for Human Adjusters**: Evaluates loss circumstances and flags inconsistencies.
- **Traceable Evidence Links**: Every single claim indicator links directly to source document citations (with document name, page number, and extracted verbatim text).
- **Responsible AI Principles**: Output language adheres to non-punitive, objective terminology ("Risk indicator detected", "Anomaly detected", "Prototype score").

---

## The 7-Agent Pipeline

Claims pass sequentially through seven narrow, specialized agents:

1. **Document Agent**: Ingests uploaded claim documents (forms, repair invoices, policies, accident reports) and extracts structured key fields using regex and heuristic parsing.
2. **Policy / RAG Agent**: Indexes policy documents with TF-IDF retrieval to pull the most relevant policy terms, coverage clauses, and procedural conditions.
3. **Coverage Agent**: Validates reported damage and peril circumstances against retrieved policy terms to evaluate whether loss falls within covered perils.
4. **Missing Info Agent**: Verifies completeness of submitted documentation against mandatory requirements (e.g., checks for mandatory police FIR/accident report in accident claims).
5. **Anomaly Agent**: Cross-examines data across multiple documents to identify inconsistencies (e.g., repair invoice dated prior to incident date, or invoice amount exceeding claimed amount).
6. **Assessment Agent**: Aggregates findings from prior agents into an explainable prototype complexity score (0–100) and routes the claim to automated processing, human review, or investigation.
7. **Human Review Agent**: Produces an executive adjuster briefing, summarizing key evidence and recommending clear next operational actions.

---

## Architecture

```
┌────────────────────────────────────────────────────────┐
│             React + TypeScript Frontend                │
│   (Vite, TanStack Router/Query, Tailwind CSS, Lucide)  │
└──────────────────────────┬─────────────────────────────┘
                           │ (Vite Proxy: /api/* -> :8000)
                           ▼
┌────────────────────────────────────────────────────────┐
│                  FastAPI Backend                       │
│    (REST API: /api/claims, /api/analyze, /api/demo)    │
└────────────┬─────────────────────────────┬─────────────┘
             │                             │
             ▼                             ▼
┌─────────────────────────┐   ┌──────────────────────────┐
│   Pipeline Orchestrator │   │   SQLite Database        │
│ ┌─────────────────────┐ │   │   (claimiq.db)           │
│ │ 1. Document Agent   │ │   └──────────────────────────┘
│ │ 2. Policy / RAG     │ │
│ │ 3. Coverage Agent   │ │   ┌──────────────────────────┐
│ │ 4. Missing Info     │ │   │   TF-IDF Document Vector │
│ │ 5. Anomaly Agent    │ │   │   Retrieval Engine       │
│ │ 6. Assessment Agent │ │   └──────────────────────────┘
│ │ 7. Human Review     │ │
│ └─────────────────────┘ │   ┌──────────────────────────┐
└─────────────────────────┘   │ Optional Ollama LLM /    │
                              │ Deterministic Mode       │
                              └──────────────────────────┘
```

---

## Prerequisites

- **Python**: Version 3.11 or higher
- **Node.js**: Version 18 or higher (with `npm`)

---

## Quick Start

### Windows
Double-click `start.bat` or run:
```cmd
start.bat
```

### macOS / Linux
```bash
chmod +x start.sh
./start.sh
```

The startup script will automatically:
1. Verify Python 3.11+ and Node.js 18+ are available.
2. Create `backend/.venv` and install Python dependencies from `backend/requirements.txt`.
3. Create `backend/.env` and `frontend/.env` from templates if missing.
4. Install frontend npm dependencies.
5. Start both backend (`:8000`) and frontend (`:5173`) concurrently.

---

## Manual Startup Alternative

If you prefer starting servers manually in separate terminal windows:

### Terminal 1: Backend
```bash
cd backend
python -m venv .venv

# On Windows:
.venv\Scripts\activate
# On macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Terminal 2: Frontend
```bash
cd frontend
npm install
npm run dev
```

Visit **http://localhost:5173** in your browser.

---

## Loading the Demo Claim & Expected Result

1. Click **"Load Demo Claim"** in the top navigation or dashboard.
2. The live pipeline will process the vehicle accident claim through all 7 agents in real time.
3. Expected Output:
   - **Coverage**: `applicable` (accidental vehicle damage falls within active policy period).
   - **Document Completeness**: `75%` (Claim Form, Repair Invoice, and Policy present; Accident Report missing).
   - **Anomalies**: Exactly 2 risk indicators:
     - `Date mismatch`: Repair invoice dated `08/09/2026` precedes the reported accident date `12/09/2026`.
     - `Amount mismatch`: Repair invoice total (`₹92,000`) differs from claimed amount (`₹85,000`).
   - **Complexity Score**: `62` (Medium complexity).
   - **Recommended Route**: `Human Review` (routed to an adjuster).
   - **Evidence Drawer**: Clicking any evidence chip opens the interactive side drawer citing source documents and page numbers.

---

## Environment Variables

### Backend (`backend/.env`)
| Variable | Default | Description |
|---|---|---|
| `AI_PROVIDER` | `none` | `none` for deterministic mode, `ollama` for local LLM integration |
| `MODEL_NAME` | `""` | Model name when using Ollama (e.g., `llama3.2` or `mistral`) |
| `AI_BASE_URL` | `http://localhost:11434` | Ollama API endpoint |
| `DATABASE_URL` | `sqlite:///./claimiq.db` | SQLite database connection string |
| `DEMO_STEP_DELAY_MS` | `700` | Delay between agent stages to illustrate live streaming |

### Frontend (`frontend/.env`)
| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `""` | Empty string uses the Vite proxy to `http://localhost:8000`. Can be set to `http://localhost:8000` to bypass proxy. |

---

## Optional: Local Ollama AI Setup

ClaimIQ is 100% deterministic and functional out of the box with zero external API keys. To optionally enhance agent narrative summaries with a local LLM:

1. Install [Ollama](https://ollama.com/) and pull a model:
   ```bash
   ollama pull llama3.2
   ```
2. Configure `backend/.env`:
   ```env
   AI_PROVIDER=ollama
   MODEL_NAME=llama3.2
   AI_BASE_URL=http://localhost:11434
   ```
3. Restart the backend.

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | API status and docs pointer |
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/claims` | List all submitted claims |
| `POST` | `/api/claims` | Create a new claim draft |
| `GET` | `/api/claims/{id}` | Retrieve specific claim details |
| `POST` | `/api/claims/{id}/documents` | Upload multipart document for claim |
| `POST` | `/api/claims/{id}/analyze` | Trigger asynchronous 7-agent pipeline |
| `GET` | `/api/claims/{id}/analysis` | Poll live analysis status and agent outputs |
| `GET` | `/api/claims/{id}/evidence` | List all indexed evidence items |
| `POST` | `/api/demo/load` | Seed demo claim and attached test files |

Interactive OpenAPI documentation is available at **http://localhost:8000/docs**.

---

## Running Tests

### Backend Unit & Integration Tests
```bash
npm run test:backend
# Or directly via venv:
cd backend && .venv/Scripts/python -m pytest tests
```

### Shared API Contract Verification
```bash
npm run test:contract
```

### Full Test Suite
```bash
npm test
```

---

## Troubleshooting

- **Port 8000 or 5173 already in use**:
  Ensure no other instance of FastAPI or Vite is running. Stop previous instances or specify an alternative port in config.
- **"Demo mode" status pill displayed in UI**:
  The frontend periodically checks `GET /api/health`. If the backend is not yet running, the UI switches to built-in fallback data. Ensure the backend server is running on port 8000.
- **Database Reset**:
  To reset all claim history to a clean state, stop the backend and delete `backend/claimiq.db`. The database will be recreated automatically on next startup.

---

## Responsible AI & Guardrails

- **Human-in-the-Loop**: ClaimIQ is an AI decision-support prototype. Outputs are strictly analytical indicators and are never legally binding determinations.
- **No Hallucinated Citations**: Every finding requires linked evidence with extracted values and source document citations. If evidence is absent, the agent records an explicit absence indicator.
- **Objective Terminology**: The platform avoids defamatory or conclusory labels (such as "fraud confirmed"), maintaining neutral, risk-indexed classifications.
