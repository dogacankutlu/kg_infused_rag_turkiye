import httpx

from .base import LLMClient


class OllamaClient(LLMClient):
    provider = "ollama"

    def __init__(self, base_url: str, model: str, api_key: str = "ollama"):
        self.base_url = base_url.rstrip("/")
        self.model = model
        self._headers = {"Authorization": f"Bearer {api_key}"}

    def generate(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": False,
        }
        with httpx.Client(timeout=120.0) as client:
            r = client.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                headers=self._headers,
            )
            r.raise_for_status()
            data = r.json()
        return data["choices"][0]["message"]["content"] or ""
