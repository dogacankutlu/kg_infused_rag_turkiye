from src.llm import LLMClient
from src.prompts import templates
from src.trace import RetrievedPassage


class NoteBuilder:
    def __init__(self, llm: LLMClient, passage_char_limit: int = 600):
        self.llm = llm
        self.passage_char_limit = passage_char_limit

    def build_passage_note(
        self, question: str, passages: list[RetrievedPassage]
    ) -> str:
        if not passages:
            return "İlgili pasaj bulunamadı."
        block = "\n\n".join(
            f"[{i+1}] {p.title}: {p.text[: self.passage_char_limit]}"
            for i, p in enumerate(passages)
        )
        return self.llm.generate(
            prompt=templates.passage_note_prompt(question, block),
            system=templates.PASSAGE_NOTE_SYSTEM,
            temperature=0.0,
            max_tokens=400,
        ).strip()

    def augment_with_kg(self, question: str, passage_note: str, kg_summary: str) -> str:
        return self.llm.generate(
            prompt=templates.augment_note_prompt(question, passage_note, kg_summary),
            system=templates.AUGMENT_NOTE_SYSTEM,
            temperature=0.0,
            max_tokens=500,
        ).strip()
