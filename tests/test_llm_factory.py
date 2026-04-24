import pytest

from src.llm.base import LLMClient
from src.llm.factory import get_llm_client
from src.llm.groq_client import GroqClient
from src.llm.ollama_client import OllamaClient


def test_groq_client_implements_llmclient():
    client = GroqClient(api_key="test-key", model="llama-3.3-70b-versatile")
    assert isinstance(client, LLMClient)
    assert client.provider == "groq"
    assert client.model == "llama-3.3-70b-versatile"


def test_groq_requires_api_key():
    with pytest.raises(ValueError):
        GroqClient(api_key="", model="llama-3.3-70b-versatile")


def test_ollama_client_implements_llmclient():
    client = get_llm_client(provider="ollama", model="llama3.1")
    assert isinstance(client, LLMClient)
    assert client.provider == "ollama"


def test_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_llm_client(provider="nonexistent", model="x")
