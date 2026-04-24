from __future__ import annotations

from src.llm import LLMClient
from src.prompts import templates
from src.trace import Triple


class SubgraphSummarizer:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def summarize(
        self,
        question: str,
        subgraph: list[Triple],
        entity_descriptions: dict[str, tuple[str, str]] | None = None,
    ) -> str:
        """Summarize the subgraph into natural language.

        Args:
            question: The original question.
            subgraph: Selected triples from spreading activation.
            entity_descriptions: Optional dict of {entity_id: (name, description)}
                for entities visited during activation. Their descriptions often
                contain dates/years not captured as graph edges.
        """
        if not subgraph and not entity_descriptions:
            return "Bilgi grafiğinde ilgili bir olgu bulunamadı."

        facts = "\n".join(
            f"- {t.source_name} {t.relation} {t.target_name}" for t in subgraph
        ) if subgraph else "(olgular bulunamadı)"

        descriptions_block = ""
        if entity_descriptions:
            lines = []
            for eid, (name, desc) in entity_descriptions.items():
                if desc:
                    lines.append(f"- {name}: {desc[:300]}")
            descriptions_block = "\n".join(lines)

        return self.llm.generate(
            prompt=templates.subgraph_summary_prompt(question, facts, descriptions_block),
            system=templates.SUBGRAPH_SUMMARY_SYSTEM,
            temperature=0.0,
            max_tokens=500,
        ).strip()
