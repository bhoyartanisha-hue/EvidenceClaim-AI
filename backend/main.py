import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

try:
    from .db import init_db
    from .api.routes import router
except (ImportError, ValueError):
    from db import init_db
    from api.routes import router


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("claimiq")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB on startup
    init_db()
    logger.info("ClaimIQ backend database initialized.")
    yield

app = FastAPI(
    title="ClaimIQ API",
    description="AI insurance claims intelligence agent decision-support backend",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173"
]

ORIGIN_REGEX = r"https://.*(lovable\.app|lovableproject\.com)"

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.exceptions import RequestValidationError

# Safe 422 validation handler (short and friendly, not raw dumps)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        first = errors[0]
        field = first.get("loc", ["field"])[-1]
        msg = first.get("msg", "Invalid value")
        detail = f"Invalid '{field}': {msg}"
    else:
        detail = "Invalid request format."
    return JSONResponse(status_code=422, content={"detail": detail})

# Global safe error handler (never expose stack traces)
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Internal error processing request {request.url.path}: {type(exc).__name__}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Something went wrong. Please try again."}
    )

app.include_router(router, prefix="/api")


@app.get("/")
def root():
    return {"name": "ClaimIQ API", "docs": "/docs"}
