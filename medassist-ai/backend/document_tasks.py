from __future__ import annotations

from typing import Any

from .config import MEDICAL_DISCLAIMER, Settings, get_settings
from .rag_engine import _build_llm


def _invoke_or_fallback(
    system: str,
    user_text: str,
    fallback: str,
    settings: Settings,
) -> str:
    if settings.mock_llm or settings.llm_provider == "mock":
        return fallback
    from langchain_core.prompts import ChatPromptTemplate

    llm = _build_llm(settings)
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", f"{system}\n\n{MEDICAL_DISCLAIMER}"),
            ("human", "{text}"),
        ]
    ).invoke({"text": user_text})
    result = llm.invoke(prompt)
    return getattr(result, "content", str(result))


def summarize_document(text: str, settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    text = text.strip()
    if not text:
        raise ValueError("Text cannot be empty.")
    fallback = (
        "Summary:\n"
        "- Source text was provided for academic documentation support.\n"
        "- Key details should be reviewed against the original record.\n"
        "- No missing clinical facts were inferred.\n\n"
        "Review points:\n"
        "- Verify names, dates, measurements, medications, and follow-up details."
    )
    output = _invoke_or_fallback(
        "Summarize the supplied healthcare-related text for documentation review. "
        "Do not diagnose or invent facts. Preserve uncertainty.",
        text,
        fallback,
        settings,
    )
    return {"result": f"{output}\n\n{MEDICAL_DISCLAIMER}", "disclaimer": MEDICAL_DISCLAIMER}


def structure_note(text: str, settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    text = text.strip()
    if not text:
        raise ValueError("Text cannot be empty.")
    fallback = (
        "STRUCTURED DRAFT\n"
        "Chief concern / reason for note: Not provided\n"
        "Reported history: Extract only what is explicitly stated in the source text.\n"
        "Observations / measurements: Not provided\n"
        "Assessment statements supplied by author: Not provided\n"
        "Medications: Not provided\n"
        "Allergies: Not provided\n"
        "Plan / follow-up: Not provided\n"
        "Open questions: Verify all missing or ambiguous details against the source."
    )
    output = _invoke_or_fallback(
        "Convert rough notes into a structured clinical-documentation draft. "
        "Use only supplied facts. Never invent values. Mark missing items as "
        "'Not provided'.",
        text,
        fallback,
        settings,
    )
    return {"result": f"{output}\n\n{MEDICAL_DISCLAIMER}", "disclaimer": MEDICAL_DISCLAIMER}


def patient_education(text: str, settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    text = text.strip()
    if not text:
        raise ValueError("Text cannot be empty.")
    fallback = (
        "Plain-language education draft:\n"
        "This information is based only on the supplied text. Please follow the "
        "instructions given by your healthcare professional. If symptoms are severe "
        "or rapidly worsening, seek urgent professional assessment. Ask your "
        "healthcare professional if any part of this information is unclear."
    )
    output = _invoke_or_fallback(
        "Rewrite the supplied healthcare text into plain, respectful language. "
        "Do not diagnose, prescribe, or add treatment instructions not present in "
        "the source. Preserve uncertainty.",
        text,
        fallback,
        settings,
    )
    return {"result": f"{output}\n\n{MEDICAL_DISCLAIMER}", "disclaimer": MEDICAL_DISCLAIMER}
