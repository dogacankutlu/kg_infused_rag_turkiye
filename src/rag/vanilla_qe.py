"""Vanilla RAG with Query Expansion (no KG).

Pipeline:
    1. LLM expands the question into a richer query (without any KG context).
    2. BM25 retrieval is run with both the original AND the expanded query;
       results deduplicated.
    3. LLM summarises the passages into a query-focused note.
    4. LLM answers from the note.

This is the "Vanilla-QE" baseline used in Phase-5 evaluation — it isolates
the contribution of query expansion alone, holding the KG component out.
"""
from __future__ import annotations

from datetime import datetime, timezone
from time import perf_counter

from src.llm import LLMClient
from src.prompts import templates
from src.trace import (
    MetricScores,
    Question,
    RAGResult,
    RetrievalTrace,
    SpreadingActivationTrace,
)

from .answer_generator import AnswerGenerator
from .base import RAGPipeline
from .note_builder import NoteBuilder
from .passage_retriever import PassageRetriever


class VanillaQERAG(RAGPipeline):
    name = "vanilla_qe_rag"

    def __init__(
        self,
        llm: LLMClient,
        retriever: PassageRetriever | None = None,
        k_passages: int = 6,
    ):
        self.llm = llm
        self.retriever = retriever or PassageRetriever()
        self.k_passages = k_passages
        self.note_builder = NoteBuilder(llm)
        self.answerer = AnswerGenerator(llm)

    def _expand_no_kg(self, question: str) -> str:
        """Query expansion without any KG hint — pure LLM rephrasing."""
        raw = self.llm.generate(
            prompt=(
                f"Original question: {question}\n\n"
                "Rewrite this question as a richer search query that includes "
                "likely synonyms, related entities, and any implied sub-questions. "
                "Return ONE single line, no numbering, no quotes."
            ),
            system=templates.QUERY_EXPANSION_SYSTEM,
            temperature=0.0,
            max_tokens=100,
        ).strip().strip("\"'")
        if not raw:
            return question
        return raw.split("\n")[0]

    def answer(self, question: Question) -> RAGResult:
        started = perf_counter()
        started_at = datetime.now(timezone.utc).isoformat()
        q_text = question.question_text

        result = RAGResult(
            pipeline=self.name,
            question=question,
            activation=SpreadingActivationTrace(seeds=[]),
            retrieval=RetrievalTrace(original_query=q_text, expanded_query=""),
            metrics=MetricScores(),
            started_at=started_at,
        )

        try:
            expanded = self._expand_no_kg(q_text)
            original_hits, expanded_hits, deduped = self.retriever.dual_retrieve(
                q_text, expanded, k_p=self.k_passages
            )
            result.retrieval = RetrievalTrace(
                original_query=q_text,
                expanded_query=expanded,
                original_hits=original_hits,
                expanded_hits=expanded_hits,
                deduped=deduped,
            )

            result.passage_note = self.note_builder.build_passage_note(q_text, deduped)
            result.enhanced_note = result.passage_note
            result.answer = self.answerer.generate(q_text, result.passage_note)
        except Exception as exc:
            result.error = f"{type(exc).__name__}: {exc}"

        result.finished_at = datetime.now(timezone.utc).isoformat()
        result.elapsed_seconds = round(perf_counter() - started, 3)
        return result
