from abc import ABC, abstractmethod

from src.trace import Question, RAGResult


class RAGPipeline(ABC):
    name: str = "abstract"

    @abstractmethod
    def answer(self, question: Question) -> RAGResult:
        ...
