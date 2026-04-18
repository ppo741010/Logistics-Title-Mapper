from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import io
import logging
from datetime import datetime, timezone

from rules import analyze, clean_title

logger = logging.getLogger("feedback")

app = FastAPI(title="Logistics Title Mapper API", version="2.0.0")

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
    comment: str = ""
    page: str = ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "version": "2.0.0"}


@app.post("/analyze")
def analyze_single(req: AnalyzeRequest):
    return analyze(req.title, req.description, req.country)


@app.post("/bulk-analyze")
def bulk_analyze(req: BulkAnalyzeRequest):
    if len(req.rows) > 10_000:
        raise HTTPException(status_code=400, detail="Maximum 10,000 rows per request.")
    return [analyze(r.title, r.description, r.country) for r in req.rows]


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
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
def clean_preview(req: CleanPreviewRequest):
    """
    Step 1 of the paid bulk flow:
    Return before/after pairs so the user can review cleaning
    before classification runs.
    """
    return [
        {"raw": t, "clean": clean_title(t)}
        for t in req.titles
    ]


@app.post("/feedback")
def submit_feedback(req: FeedbackRequest):
    ts = datetime.now(timezone.utc).isoformat()
    logger.info("FEEDBACK | %s | rating=%s | page=%s | comment=%s", ts, req.rating, req.page, req.comment)
    print(f"FEEDBACK | {ts} | rating={req.rating} | page={req.page} | comment={req.comment}", flush=True)
    return {"ok": True}
