from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import MEDICAL_DISCLAIMER, get_settings
from .document_tasks import patient_education, structure_note, summarize_document
from .ingestion import ingest_documents
from .rag_engine import answer_question

settings = get_settings()
app = FastAPI(title="MedAssist AI", version="1.0.0", description="Academic RAG prototype for healthcare documentation.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


class QuestionRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)


class TextRequest(BaseModel):
    text: str = Field(min_length=1, max_length=30000)


def with_disclaimer(payload: dict) -> dict:
    payload["disclaimer"] = MEDICAL_DISCLAIMER
    if "result" in payload and MEDICAL_DISCLAIMER not in payload["result"]:
        payload["result"] += f"\n\n{MEDICAL_DISCLAIMER}"
    if "answer" in payload and MEDICAL_DISCLAIMER not in payload["answer"]:
        payload["answer"] += f"\n\n{MEDICAL_DISCLAIMER}"
    return payload


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/health")
async def health() -> dict:
    return with_disclaimer(
        {"status": "ok", "app": settings.app_name, "mock_llm": settings.mock_llm}
    )


@app.post("/api/ingest")
async def upload_and_ingest(file: UploadFile = File(...)) -> dict:
    if not file.filename:
        raise HTTPException(status_code=400, detail="A filename is required.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".pdf", ".txt", ".md"}:
        raise HTTPException(status_code=400, detail="Only PDF, TXT, and MD files are supported.")

    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=413, detail=f"File exceeds {settings.max_upload_mb} MB.")

    safe_name = Path(file.filename).name
    destination = Path(settings.upload_dir) / safe_name
    destination.write_bytes(content)

    try:
        result = ingest_documents([destination], settings)
    except Exception as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {exc}") from exc

    return with_disclaimer(result)


@app.post("/api/query")
async def query(request: QuestionRequest) -> dict:
    try:
        return with_disclaimer(answer_question(request.question, settings))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG query failed: {exc}") from exc


@app.post("/api/summarize")
async def summarize(request: TextRequest) -> dict:
    try:
        return with_disclaimer(summarize_document(request.text, settings))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {exc}") from exc


@app.post("/api/structure-note")
async def structure(request: TextRequest) -> dict:
    try:
        return with_disclaimer(structure_note(request.text, settings))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Note structuring failed: {exc}") from exc


@app.post("/api/patient-education")
async def education(request: TextRequest) -> dict:
    try:
        return with_disclaimer(patient_education(request.text, settings))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Education drafting failed: {exc}") from exc
