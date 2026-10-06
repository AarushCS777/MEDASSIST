from __future__ import annotations

import base64
import json
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile
import zlib
from pathlib import Path



PROJECT_ROOT = Path(__file__).resolve().parent
ZIP_PATH = PROJECT_ROOT.parent / "medassist_ai.zip"

# The compressed source bundle makes this builder standalone: it can recreate the
# complete project even if the other project files have been deleted.
SOURCE_BUNDLE_B64 = """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"""

REQUIRED_FILES = [
    "backend/__init__.py",
    "backend/main.py",
    "backend/config.py",
    "backend/ingestion.py",
    "backend/rag_engine.py",
    "backend/document_tasks.py",
    "backend/mock_data.py",
    "frontend/index.html",
    "frontend/style.css",
    "frontend/app.js",
    "data/sample_medical_guide.txt",
    "tests/__init__.py",
    "tests/test_pipeline.py",
    "requirements.txt",
    ".env.example",
    "README.md",
    "build_and_verify.py",
]


def materialize_project() -> None:
    payload = json.loads(
        zlib.decompress(base64.b64decode(SOURCE_BUNDLE_B64)).decode("utf-8")
    )
    for relative, content in payload.items():
        path = PROJECT_ROOT / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    print(f"[OK] Materialized {len(payload)} source files.")


def verify_files() -> None:
    missing = [item for item in REQUIRED_FILES if not (PROJECT_ROOT / item).is_file()]
    if missing:
        raise RuntimeError("Missing required files:\n" + "\n".join(missing))
    print(f"[OK] Verified {len(REQUIRED_FILES)} required files.")


def verify_imports() -> None:
    sys.path.insert(0, str(PROJECT_ROOT))
    import backend.config  # noqa: F401
    import backend.ingestion  # noqa: F401
    import backend.rag_engine  # noqa: F401
    import backend.document_tasks  # noqa: F401
    import backend.main  # noqa: F401
    print("[OK] Backend imports succeeded.")


def verify_end_to_end() -> None:
    os.environ["MOCK_LLM"] = "true"
    os.environ["LLM_PROVIDER"] = "mock"

    from backend.config import MEDICAL_DISCLAIMER, Settings
    from backend.document_tasks import structure_note
    from backend.ingestion import ingest_documents
    from backend.rag_engine import answer_question


    with tempfile.TemporaryDirectory(prefix="medassist_verify_") as temp:
        temp_dir = Path(temp)
        settings = Settings(
            mock_llm=True,
            llm_provider="mock",
            chroma_collection="verify_collection",
            chroma_dir=str(temp_dir / "chroma"),
            upload_dir=str(temp_dir / "uploads"),
        )

        text_path = temp_dir / "verification.txt"
        text_path.write_text(
            "Synthetic verification guide. A blood pressure documentation entry "
            "should include date, time, position, cuff/site, systolic, diastolic, "
            "pulse, symptoms, and medication context.",
            encoding="utf-8",
        )

        import fitz

        pdf_path = temp_dir / "verification.pdf"
        pdf = fitz.open()
        page = pdf.new_page()
        page.insert_text(
            (72, 72),
            "Synthetic PDF guide. Medication reconciliation should record name, "
            "strength, route, frequency, allergies, and verification status.",
        )
        pdf.save(pdf_path)
        pdf.close()

        text_result = ingest_documents([text_path], settings)
        if text_result["chunks"] < 1:
            raise RuntimeError("Text ingestion produced no chunks.")

        pdf_result = ingest_documents([pdf_path], settings)
        if pdf_result["chunks"] < 1:
            raise RuntimeError("PDF ingestion produced no chunks.")

        rag = answer_question(
            "What should be recorded for a blood pressure reading?",
            settings,
        )
        if MEDICAL_DISCLAIMER not in rag["answer"]:
            raise RuntimeError("RAG answer is missing the mandatory disclaimer.")
        if not rag["citations"]:
            raise RuntimeError("RAG query returned no citations.")

        note = structure_note("Medication list was reviewed.", settings)
        if MEDICAL_DISCLAIMER not in note["result"]:
            raise RuntimeError("Note output is missing the mandatory disclaimer.")

    print("[OK] End-to-end ingestion -> embedding -> Chroma -> retrieval -> mock RAG passed.")


def run_pytest() -> None:
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q"],
        cwd=PROJECT_ROOT,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("pytest failed.")
    print("[OK] pytest suite passed.")


def package_project() -> None:
    if ZIP_PATH.exists():
        ZIP_PATH.unlink()

    excluded_parts = {".venv", "__pycache__", ".pytest_cache", ".git"}
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in PROJECT_ROOT.rglob("*"):
            if not path.is_file():
                continue
            relative = path.relative_to(PROJECT_ROOT)
            if any(part in excluded_parts for part in relative.parts):
                continue
            archive.write(path, Path(PROJECT_ROOT.name) / relative)

    print(f"[OK] Created package: {ZIP_PATH}")


def main() -> None:
    print("MedAssist AI build + verification")
    materialize_project()
    verify_files()
    verify_imports()
    verify_end_to_end()
    run_pytest()
    package_project()
    print("[DONE] MedAssist AI is verified and packaged.")


if __name__ == "__main__":
    main()
