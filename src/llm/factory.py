from config import settings

from .base import LLMClient


def get_llm_client(provider: str | None = None, model: str | None = None) -> LLMClient:
    provider = (provider or settings.llm_provider).lower()
    model = model or settings.llm_model

    if provider == "groq":
        from .groq_client import GroqClient

        return GroqClient(api_key=settings.groq_api_key, model=model)
    if provider == "ollama":
        from .ollama_client import OllamaClient

        return OllamaClient(
            base_url=settings.ollama_base_url,
            model=model,
            api_key=settings.ollama_api_key,
        )
    raise ValueError(f"Unknown LLM_PROVIDER: {provider}. Expected 'groq' or 'ollama'.")
