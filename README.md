# MedAssist AI

MedAssist AI is an **academic RAG prototype for healthcare documentation**. It demonstrates document ingestion, local vector retrieval, grounded question answering, documentation drafting, and a plain-language education workflow.

> **DISCLAIMER: MedAssist AI is an academic prototype for reference only, not certified for diagnosis or treatment. All outputs must be validated by a licensed healthcare professional.**

## What it includes

- FastAPI async backend
- PyMuPDF PDF extraction
- Recursive character chunking: 800 characters / 100 overlap
- Persistent local ChromaDB vector store
- HuggingFace sentence-transformer embeddings
- Configurable OpenAI, Groq, or Ollama LLM layer
- Deterministic mock mode for offline application testing
- Source passage citations in RAG responses
- Single-page Tailwind + vanilla JavaScript dashboard
- Automated pytest coverage
- `build_and_verify.py` for file validation, imports, end-to-end verification, and ZIP packaging

## Project structure

```text
medassist-ai/
├── backend/
│   ├── __init__.py
│   ├── main.py
│   ├── config.py
│   ├── ingestion.py
│   ├── rag_engine.py
│   ├── document_tasks.py
│   └── mock_data.py
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   └── sample_medical_guide.txt
├── tests/
│   ├── __init__.py
│   └── test_pipeline.py
├── requirements.txt
├── .env.example
├── README.md
└── build_and_verify.py
```

## Requirements

- Python 3.10+
- Internet access on the first embedding-model use, unless the HuggingFace model is already cached
- For hosted LLMs, the relevant API key
- For Ollama, a locally running Ollama service and an installed model

## Setup

### 1. Create a virtual environment

Windows:

```powershell
python -m venv .venv
.venv\Scripts\activate
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment

Copy `.env.example` to `.env`.

For a completely local deterministic demo:

```text
MOCK_LLM=true
LLM_PROVIDER=mock
```

The embedding model is still downloaded by HuggingFace the first time it is used.

For OpenAI:

```text
MOCK_LLM=false
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
OPENAI_API_KEY=your_key
```

For Groq:

```text
MOCK_LLM=false
LLM_PROVIDER=groq
LLM_MODEL=your_groq_model
GROQ_API_KEY=your_key
```

For Ollama:

```text
MOCK_LLM=false
LLM_PROVIDER=ollama
LLM_MODEL=your_local_model
OLLAMA_BASE_URL=http://localhost:11434
```

## Run

From the project root:

```bash
uvicorn backend.main:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

The UI is served directly by FastAPI.

## Try the seeded guide

The easiest first test is to upload:

```text
data/sample_medical_guide.txt
```

The UI accepts TXT as well as PDF so the seeded guide can be indexed immediately. You can also convert or replace it with a PDF for a PDF ingestion demonstration.

Then ask:

> What should be recorded for a blood pressure reading?

The RAG response includes retrieved source metadata and an excerpt.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Health check |
| POST | `/api/ingest` | Upload and index PDF/TXT/MD |
| POST | `/api/query` | Grounded RAG question |
| POST | `/api/summarize` | Documentation summary |
| POST | `/api/structure-note` | Structured note draft |
| POST | `/api/patient-education` | Plain-language education draft |

Every endpoint response contains the mandatory disclaimer.

## Test

```bash
pytest -q
```

The tests cover:

1. Text ingestion and Chroma retrieval.
2. PDF extraction and vector ingestion.
3. RAG answer citations and disclaimer.
4. Structured note formatting and disclaimer.

The first test run can take longer because the HuggingFace embedding model may need to download.

## Build and verify

From the repository root:

```bash
python build_and_verify.py
```

The script:

1. Checks every required file.
2. Imports the core backend modules.
3. Creates a temporary synthetic PDF and TXT source.
4. Runs extraction/chunking/vector ingestion.
5. Runs a RAG query in mock mode.
6. Checks that the medical disclaimer is present.
7. Runs the document structuring fallback.
8. Runs pytest.
9. Creates `medassist_ai.zip`.

The generated archive contains the complete project.

## Safety boundary

This project is intentionally a documentation/retrieval prototype. It is not a clinical decision system. The application does not claim certification, diagnosis, treatment authority, or patient-specific medical reliability.

The mock mode is deterministic so software engineers can test the UI and API without an LLM API key. Retrieval still uses the configured local embedding model and ChromaDB.
