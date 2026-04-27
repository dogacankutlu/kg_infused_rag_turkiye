"""No-Retrieval baseline.

The simplest possible pipeline: ask the LLM the question with no retrieval,
no knowledge graph, no augmentation. Used as the lower-bound baseline in the
Phase-5 evaluation (assignment §6).

Conforms to the same `RAGPipeline` ABC and produces a `RAGResult`. The
`activation` and `retrieval` traces are left empty so the evaluator,
logger, and web layer treat it identically to the other pipelines.
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

from .base import RAGPipeline


class NoRetrievalRAG(RAGPipeline):
    name = "no_retrieval_rag"

    def __init__(self, llm: LLMClient):
        self.llm = llm

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
            # Direct ask, no context. Reuse the answer-generator system prompt
            # so output style stays consistent with the other pipelines.
            raw = self.llm.generate(
                prompt=(
                    f"Soru: {q_text}\n\n"
                    "Cevap:"
                ),
                system=templates.NO_RETRIEVAL_SYSTEM,
                temperature=0.0,
                max_tokens=80,
            )
            result.answer = raw.strip().strip(".").strip("\"'").split("\n")[0]
        except Exception as exc:
            result.error = f"{type(exc).__name__}: {exc}"

        result.finished_at = datetime.now(timezone.utc).isoformat()
        result.elapsed_seconds = round(perf_counter() - started, 3)
        return result
