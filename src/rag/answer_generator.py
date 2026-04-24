from src.llm import LLMClient
from src.prompts import templates


class AnswerGenerator:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def generate(self, question: str, enhanced_note: str) -> str:
        raw = self.llm.generate(
            prompt=templates.answer_prompt(question, enhanced_note),
            system=templates.ANSWER_SYSTEM,
            temperature=0.0,
            max_tokens=80,
        )
        return raw.strip().strip(".").strip("\"'").split("\n")[0]
