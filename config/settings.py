from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    neo4j_uri: str = "bolt://localhost:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme"
    neo4j_database: str = "neo4j"

    llm_provider: str = "groq"
    llm_model: str = "llama-3.3-70b-versatile"
    llm_temperature: float = 0.0
    llm_max_tokens: int = 1024

    groq_api_key: str = ""

    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_api_key: str = "ollama"

    embedding_model: str = "intfloat/multilingual-e5-small"

    turkiye_entity_id: str = "Q43"
    extraction_max_hops: int = 2

    data_dir: str = "data"
    log_dir: str = "logs"

    @property
    def data_path(self) -> Path:
        return PROJECT_ROOT / self.data_dir

    @property
    def raw_path(self) -> Path:
        return self.data_path / "raw"

    @property
    def processed_path(self) -> Path:
        return self.data_path / "processed"

    @property
    def log_path(self) -> Path:
        return PROJECT_ROOT / self.log_dir

    @property
    def questions_path(self) -> Path:
        return PROJECT_ROOT / "questions" / "turkiye_qa.json"


settings = Settings()
