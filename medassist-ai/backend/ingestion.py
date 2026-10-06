from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Iterable

import fitz
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import Chroma
from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from .config import Settings, get_settings


def clean_text(text: str) -> str:
    text = text.replace("\x00", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_pdf(path: str | Path) -> list[Document]:
    path = Path(path)
    documents: list[Document] = []
    with fitz.open(path) as pdf:
        for page_number, page in enumerate(pdf, start=1):
            text = clean_text(page.get_text("text"))
            if text:
                documents.append(
                    Document(
                        page_content=text,
                        metadata={
                            "source": path.name,
                            "page": page_number,
                            "file_type": "pdf",
                        },
                    )
                )
    return documents


def extract_text(path: str | Path) -> list[Document]:
    path = Path(path)
    text = clean_text(path.read_text(encoding="utf-8"))
    return [
        Document(
            page_content=text,
            metadata={"source": path.name, "page": 1, "file_type": "text"},
        )
    ] if text else []


def split_documents(
    documents: Iterable[Document],
    chunk_size: int = 800,
    chunk_overlap: int = 100,
) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return splitter.split_documents(list(documents))


def make_embeddings(settings: Settings | None = None):
    settings = settings or get_settings()
    return HuggingFaceEmbeddings(
        model_name=settings.embedding_model,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},
    )


def get_vectorstore(settings: Settings | None = None) -> Chroma:
    settings = settings or get_settings()
    return Chroma(
        collection_name=settings.chroma_collection,
        embedding_function=make_embeddings(settings),
        persist_directory=settings.chroma_dir,
    )


def ingest_documents(
    paths: Iterable[str | Path],
    settings: Settings | None = None,
) -> dict:
    settings = settings or get_settings()
    all_docs: list[Document] = []
    for raw_path in paths:
        path = Path(raw_path)
        if path.suffix.lower() == ".pdf":
            docs = extract_pdf(path)
        elif path.suffix.lower() in {".txt", ".md"}:
            docs = extract_text(path)
        else:
            raise ValueError(f"Unsupported file type: {path.suffix}")
        all_docs.extend(docs)

    chunks = split_documents(
        all_docs,
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    if not chunks:
        return {"documents": 0, "chunks": 0, "ids": []}

    vectorstore = get_vectorstore(settings)
    ids = []
    for index, doc in enumerate(chunks):
        source = str(doc.metadata.get("source", "unknown"))
        page = str(doc.metadata.get("page", ""))
        digest = hashlib.sha256(
            f"{source}|{page}|{index}|{doc.page_content}".encode("utf-8")
        ).hexdigest()[:24]
        ids.append(f"{source}-{digest}")
    vectorstore.add_documents(chunks, ids=ids)

    return {
        "documents": len(all_docs),
        "chunks": len(chunks),
        "ids": ids,
        "sources": sorted({str(d.metadata.get("source", "")) for d in all_docs}),
    }
