from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.responses import JSONResponse
from pydantic import BaseModel
import pandas as pd
import io
import logging
import os
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client

from rules import analyze, clean_title

load_dotenv()

logger = logging.getLogger("feedback")

_supabase_url = os.getenv("SUPABASE_URL")
_supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(_supabase_url, _supabase_key) if _supabase_url and _supabase_key else None

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Logistics Title Mapper API", version="2.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, lambda req, exc: JSONResponse(
    status_code=429,
    content={"detail": "Too many requests. Please slow down and try again shortly."}
))
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    title: str
    description: str = ""
    country: str = ""

class BulkAnalyzeRequest(BaseModel):
    rows: list[AnalyzeRequest]

class CleanPreviewRequest(BaseModel):
    titles: list[str]

class FeedbackRequest(BaseModel):
    rating: str          # "up" or "down"
    title: str = ""      # 被分類的職稱
    result: str = ""     # 分到哪個 domain
    comment: str = ""
    page: str = ""

class WaitlistRequest(BaseModel):
    email: str
    plan: str = "general"
    source: str = "landing_page"


# ── Endpoints ─────────────────────────────────────────────────────────────────

def _log_titles(rows: list[dict]):
    """Background task: batch-insert title + result to Supabase for training data."""
    if not supabase:
        return
    try:
        records = [
            {
                "title":       r.get("raw_title", ""),
                "clean_title": r.get("clean_title", ""),
                "domain":      r.get("domain", ""),
                "confidence":  r.get("confidence", 0),
                "ai_used":     r.get("ai_used", False),
            }
            for r in rows
        ]
        if records:
            supabase.table("title_log").insert(records).execute()
    except Exception as e:
        logger.error("Supabase title_log insert failed: %s", e)


@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/analyze")
@limiter.limit("60/minute")
def analyze_single(request: Request, req: AnalyzeRequest, background_tasks: BackgroundTasks):
    result = analyze(req.title, req.description, req.country)
    background_tasks.add_task(_log_titles, [result])
    return result


@app.post("/bulk-analyze")
@limiter.limit("10/minute")
def bulk_analyze(request: Request, req: BulkAnalyzeRequest, background_tasks: BackgroundTasks):
    if len(req.rows) > 10_000:
        raise HTTPException(status_code=400, detail="Maximum 10,000 rows per request.")
    results = [analyze(r.title, r.description, r.country) for r in req.rows]
    background_tasks.add_task(_log_titles, results)
    return results


@app.post("/upload")
@limiter.limit("20/minute")
async def upload_file(request: Request, file: UploadFile = File(...)):
    """
    Accept CSV or XLSX, return parsed rows for the frontend
    to map columns before sending to /bulk-analyze.
    """
    content = await file.read()
    filename = file.filename or ""

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content), dtype=str).fillna("")
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
        else:
            raise HTTPException(status_code=400, detail="Only CSV and XLSX files are supported.")
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse file: {e}")

    return {
        "headers": list(df.columns),
        "rows": df.to_dict(orient="records"),
        "total": len(df),
    }


@app.post("/clean-preview")
@limiter.limit("20/minute")
def clean_preview(request: Request, req: CleanPreviewRequest):
    """
    Step 1 of the paid bulk flow:
    Return before/after pairs so the user can review cleaning
    before classification runs.
    """
    return [
        {"raw": t, "clean": clean_title(t)}
        for t in req.titles
    ]


@app.post("/waitlist")
@limiter.limit("5/minute")
def join_waitlist(request: Request, req: WaitlistRequest):
    if supabase:
        try:
            supabase.table("waitlist").insert({
                "email":  req.email,
                "plan":   req.plan,
                "source": req.source,
            }).execute()
        except Exception as e:
            logger.error("Supabase waitlist insert failed: %s", e)
    return {"ok": True}


@app.post("/feedback")
@limiter.limit("20/minute")
def submit_feedback(request: Request, req: FeedbackRequest):
    ts = datetime.now(timezone.utc).isoformat()
    logger.info("FEEDBACK | %s | rating=%s | title=%s | result=%s | page=%s | comment=%s",
                ts, req.rating, req.title, req.result, req.page, req.comment)

    if supabase:
        try:
            supabase.table("feedback").insert({
                "title":   req.title,
                "result":  req.result,
                "rating":  req.rating,
                "comment": req.comment,
                "page":    req.page,
            }).execute()
        except Exception as e:
            logger.error("Supabase feedback insert failed: %s", e)

    return {"ok": True}
