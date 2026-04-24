from abc import ABC, abstractmethod


class LLMClient(ABC):
    provider: str = "abstract"
    model: str = ""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        system: str | None = None,
        temperature: float = 0.0,
        max_tokens: int = 1024,
    ) -> str:
        ...

    def describe(self) -> str:
        return f"{self.provider}:{self.model}"
