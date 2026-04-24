from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


@dataclass
class Question:
    question_id: str
    question_text: str
    reasoning_path: list[str] = field(default_factory=list)
    gold_answer: str = ""
    difficulty: str = "2-hop"
    domain: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Question":
        return cls(
            question_id=d["question_id"],
            question_text=d["question_text"],
            reasoning_path=list(d.get("reasoning_path", [])),
            gold_answer=d.get("gold_answer", ""),
            difficulty=d.get("difficulty", "2-hop"),
            domain=d.get("domain", ""),
        )


@dataclass
class SeedTrace:
    entity_id: str
    name: str
    entity_type: str = ""
    score: float = 0.0
    bm25_score: float = 0.0
    embed_score: float = 0.0
    matched_aliases: list[str] = field(default_factory=list)
    one_hop_relations: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Triple:
    source_id: str
    source_name: str
    relation: str
    target_id: str
    target_name: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def as_str(self) -> str:
        return f"<{self.source_name} | {self.relation} | {self.target_name}>"


@dataclass
class RoundTrace:
    round_number: int
    frontier: list[str]
    candidate_triples: int
    selected_triples: list[Triple]
    stopped: bool = False
    stop_reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "round_number": self.round_number,
            "frontier": list(self.frontier),
            "candidate_triples": self.candidate_triples,
            "selected_triples": [t.to_dict() for t in self.selected_triples],
            "stopped": self.stopped,
            "stop_reason": self.stop_reason,
        }


@dataclass
class SpreadingActivationTrace:
    seeds: list[SeedTrace]
    rounds: list[RoundTrace] = field(default_factory=list)
    subgraph: list[Triple] = field(default_factory=list)
    visited: list[str] = field(default_factory=list)
    summary: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "seeds": [s.to_dict() for s in self.seeds],
            "rounds": [r.to_dict() for r in self.rounds],
            "subgraph": [t.to_dict() for t in self.subgraph],
            "visited": list(self.visited),
            "summary": self.summary,
        }


@dataclass
class RetrievedPassage:
    entity_id: str
    title: str
    text: str
    score: float
    source_query: str  # "original" | "expanded"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RetrievalTrace:
    original_query: str
    expanded_query: str
    original_hits: list[RetrievedPassage] = field(default_factory=list)
    expanded_hits: list[RetrievedPassage] = field(default_factory=list)
    deduped: list[RetrievedPassage] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "original_query": self.original_query,
            "expanded_query": self.expanded_query,
            "original_hits": [p.to_dict() for p in self.original_hits],
            "expanded_hits": [p.to_dict() for p in self.expanded_hits],
            "deduped": [p.to_dict() for p in self.deduped],
        }


@dataclass
class MetricScores:
    em: float = 0.0
    f1: float = 0.0
    accuracy: float = 0.0
    retrieval_recall: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RAGResult:
    pipeline: str
    question: Question
    activation: SpreadingActivationTrace
    retrieval: RetrievalTrace
    passage_note: str = ""
    enhanced_note: str = ""
    answer: str = ""
    metrics: MetricScores | None = None
    started_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    finished_at: str = ""
    elapsed_seconds: float = 0.0
    error: str = ""

    def verdict(self) -> str:
        if self.error:
            return "failure"
        if self.metrics and (self.metrics.em >= 1.0 or self.metrics.f1 >= 0.5):
            return "success"
        return "failure"

    def to_dict(self) -> dict[str, Any]:
        return {
            "pipeline": self.pipeline,
            "question": self.question.to_dict(),
            "activation": self.activation.to_dict(),
            "retrieval": self.retrieval.to_dict(),
            "passage_note": self.passage_note,
            "enhanced_note": self.enhanced_note,
            "answer": self.answer,
            "metrics": self.metrics.to_dict() if self.metrics else None,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "elapsed_seconds": self.elapsed_seconds,
            "error": self.error,
            "verdict": self.verdict(),
        }
