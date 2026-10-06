from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "data"
CHROMA_DIR = DATA_DIR / "chroma_db"
UPLOAD_DIR = DATA_DIR / "uploads"

MEDICAL_DISCLAIMER = (
    "DISCLAIMER: MedAssist AI is an academic prototype for reference only, "
    "not certified for diagnosis or treatment. All outputs must be validated "
    "by a licensed healthcare professional."
)


class Settings(BaseSettings):
    app_name: str = "MedAssist AI"
    environment: str = "development"
    mock_llm: bool = True
    llm_provider: Literal["mock", "openai", "groq", "ollama"] = "mock"
    llm_model: str = "gpt-4o-mini"
    openai_api_key: str | None = None
    groq_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    chroma_collection: str = "medassist_knowledge"
    chroma_dir: str = str(CHROMA_DIR)
    upload_dir: str = str(UPLOAD_DIR)
    cors_origins: str = "*"
    retrieval_k: int = Field(default=4, ge=1, le=10)
    chunk_size: int = Field(default=800, ge=100)
    chunk_overlap: int = Field(default=100, ge=0)
    max_upload_mb: int = Field(default=15, ge=1, le=100)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    Path(settings.chroma_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
    return settings
