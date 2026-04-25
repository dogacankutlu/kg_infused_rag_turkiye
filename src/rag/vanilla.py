"""Vanilla RAG baseline.

A standard retrieval-augmented generation pipeline with no knowledge graph:
    1. BM25 retrieve top-k passages from the Türkiye-filtered description corpus.
    2. LLM summarises the passages into a query-focused note.
    3. LLM answers the question from the note.

No spreading activation. No query expansion. No KG augmentation. This is the
baseline used for Phase-5 comparison against KG-Infused RAG.

Conforms to the same `RAGPipeline` ABC and produces a `RAGResult`, so the
evaluator, logger, and web layer treat it identically. The `activation`
trace is left empty (no seeds, no rounds) and `retrieval.expanded_query`
is the empty string.
"""
from __future__ import annotations

from datetime import datetime, timezone
from time import perf_counter

from src.llm import LLMClient
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


class VanillaRAG(RAGPipeline):
    name = "vanilla_rag"

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
            # Single retrieval — no expansion, no KG.
            hits = self.retriever.search(q_text, k=self.k_passages, source_label="original")
            result.retrieval = RetrievalTrace(
                original_query=q_text,
                expanded_query="",
                original_hits=hits,
                expanded_hits=[],
                deduped=hits,
            )

            # Build a query-focused note from the retrieved passages and answer
            # directly from it (no KG augmentation step).
            result.passage_note = self.note_builder.build_passage_note(q_text, hits)
            result.enhanced_note = result.passage_note
            result.answer = self.answerer.generate(q_text, result.passage_note)
        except Exception as exc:
            result.error = f"{type(exc).__name__}: {exc}"

        result.finished_at = datetime.now(timezone.utc).isoformat()
        result.elapsed_seconds = round(perf_counter() - started, 3)
        return result
