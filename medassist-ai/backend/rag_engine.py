from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate

from .config import MEDICAL_DISCLAIMER, Settings, get_settings
from .ingestion import get_vectorstore
from .mock_data import MOCK_ANSWER


RAG_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are MedAssist AI, an academic healthcare-documentation assistant.
Use only the supplied context. Do not diagnose, prescribe, or invent missing facts.
If the context does not support an answer, say that the reference material does not
contain enough information. Keep the answer concise and clearly separate reference
facts from uncertainty.

{disclaimer}""",
        ),
        (
            "human",
            """Question:
{question}

Reference context:
{context}

Return a grounded answer and do not add unsupported medical claims.""",
        ),
    ]
)


@dataclass
class Citation:
    source: str
    page: int | str
    excerpt: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "source": self.source,
            "page": self.page,
            "excerpt": self.excerpt,
        }


def _format_context(docs: list[Document]) -> tuple[str, list[Citation]]:
    context_parts: list[str] = []
    citations: list[Citation] = []
    for index, doc in enumerate(docs, start=1):
        source = str(doc.metadata.get("source", "unknown"))
        page = doc.metadata.get("page", "n/a")
        excerpt = " ".join(doc.page_content.split())
        excerpt = excerpt[:500]
        context_parts.append(f"[Source {index}] {source}, page {page}\n{doc.page_content}")
        citations.append(Citation(source=source, page=page, excerpt=excerpt))
    return "\n\n".join(context_parts), citations


def _build_llm(settings: Settings):
    if settings.mock_llm or settings.llm_provider == "mock":
        return None
    if settings.llm_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when LLM_PROVIDER=openai")
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=settings.llm_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )
    if settings.llm_provider == "groq":
        if not settings.groq_api_key:
            raise RuntimeError("GROQ_API_KEY is required when LLM_PROVIDER=groq")
        from langchain_groq import ChatGroq
        return ChatGroq(
            model=settings.llm_model,
            api_key=settings.groq_api_key,
            temperature=0,
        )
    if settings.llm_provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(
            model=settings.llm_model,
            base_url=settings.ollama_base_url,
            temperature=0,
        )
    raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")


def answer_question(question: str, settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    question = question.strip()
    if not question:
        raise ValueError("Question cannot be empty.")

    retriever = get_vectorstore(settings).as_retriever(
        search_kwargs={"k": settings.retrieval_k}
    )
    docs = retriever.invoke(question)
    context, citations = _format_context(docs)

    if settings.mock_llm or settings.llm_provider == "mock":
        answer = MOCK_ANSWER if docs else (
            "The knowledge base does not contain enough reference material to answer "
            "this question safely."
        )
    else:
        llm = _build_llm(settings)
        prompt = RAG_PROMPT.invoke(
            {
                "question": question,
                "context": context or "No relevant context was retrieved.",
                "disclaimer": MEDICAL_DISCLAIMER,
            }
        )
        result = llm.invoke(prompt)
        answer = getattr(result, "content", str(result))

    final_answer = f"{answer}\n\n{MEDICAL_DISCLAIMER}"
    return {
        "answer": final_answer,
        "citations": [citation.as_dict() for citation in citations],
        "retrieved_chunks": len(docs),
        "disclaimer": MEDICAL_DISCLAIMER,
    }
