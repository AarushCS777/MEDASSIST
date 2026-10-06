from pathlib import Path

import fitz
import pytest

from backend.config import MEDICAL_DISCLAIMER, Settings
from backend.ingestion import ingest_documents
from backend.rag_engine import answer_question
from backend.document_tasks import structure_note


@pytest.fixture()
def test_settings(tmp_path: Path):
    return Settings(
        mock_llm=True,
        llm_provider="mock",
        embedding_model="sentence-transformers/all-MiniLM-L6-v2",
        chroma_collection=f"test_{tmp_path.name}",
        chroma_dir=str(tmp_path / "chroma"),
        upload_dir=str(tmp_path / "uploads"),
    )


def test_text_ingestion_and_rag(tmp_path: Path, test_settings: Settings):
    source = tmp_path / "guide.txt"
    source.write_text(
        "Synthetic guide. Blood pressure documentation should include date, time, "
        "position, cuff/site, systolic, diastolic, pulse, symptoms, and medication context.",
        encoding="utf-8",
    )
    result = ingest_documents([source], test_settings)
    assert result["documents"] == 1
    assert result["chunks"] >= 1

    answer = answer_question("What should be recorded for a blood pressure reading?", test_settings)
    assert MEDICAL_DISCLAIMER in answer["answer"]
    assert answer["citations"]
    assert answer["retrieved_chunks"] >= 1


def test_pdf_extraction_and_ingestion(tmp_path: Path, test_settings: Settings):
    pdf_path = tmp_path / "guide.pdf"
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Synthetic PDF note: document medication name, strength, route, frequency.")
    doc.save(pdf_path)
    doc.close()

    result = ingest_documents([pdf_path], test_settings)
    assert result["documents"] == 1
    assert result["chunks"] >= 1


def test_note_structure_contains_disclaimer(test_settings: Settings):
    result = structure_note("Patient reports that the medication list was reviewed.", test_settings)
    assert "STRUCTURED DRAFT" in result["result"]
    assert MEDICAL_DISCLAIMER in result["result"]
