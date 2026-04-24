from src.llm import LLMClient
from src.prompts import templates


class QueryExpander:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def expand(self, question: str, kg_summary: str) -> str:
        expanded = self.llm.generate(
            prompt=templates.query_expansion_prompt(question, kg_summary),
            system=templates.QUERY_EXPANSION_SYSTEM,
            temperature=0.0,
            max_tokens=100,
        ).strip().strip("\"'")
        if not expanded:
            return question
        return expanded.split("\n")[0]
