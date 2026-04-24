from .base import LLMClient


class GroqClient(LLMClient):
    provider = "groq"

    def __init__(self, api_key: str, model: str):
        from groq import Groq

        if not api_key:
            raise ValueError("GROQ_API_KEY is empty. Set it in .env before using Groq.")
        self._client = Groq(api_key=api_key)
        self.model = model

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
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content or ""
