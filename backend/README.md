# ClaimIQ Backend

AI insurance claims intelligence agent decision-support backend built for TECHNOVA '26 (Track 2: AI Agent Challenges).

## Quickstart

```bash
# 1. Install dependencies
pip install -r backend/requirements.txt

# 2. Run the demo pipeline verification script
python -m backend.scripts.run_demo

# 3. Start the FastAPI server
uvicorn backend.main:app --reload --port 8000
```
