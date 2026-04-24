from __future__ import annotations

from datetime import datetime, timezone
from time import perf_counter

from src.kg.neo4j_client import Neo4jClient
from src.kg.seed_finder import SeedFinder
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
from .query_expansion import QueryExpander
from .spreading_activation import SpreadingActivation
from .subgraph_summarizer import SubgraphSummarizer


class KGInfusedRAG(RAGPipeline):
    name = "kg_infused_rag"

    def __init__(
        self,
        llm: LLMClient,
        neo4j: Neo4jClient,
        seed_finder: SeedFinder | None = None,
        retriever: PassageRetriever | None = None,
        k_seeds: int = 3,
        k_passages: int = 6,
        max_rounds: int = 6,
    ):
        self.llm = llm
        self.neo4j = neo4j
        self.seed_finder = seed_finder or SeedFinder()
        self.retriever = retriever or PassageRetriever()
        self.k_seeds = k_seeds
        self.k_passages = k_passages

        self.activation = SpreadingActivation(neo4j=neo4j, llm=llm, max_rounds=max_rounds)
        self.summarizer = SubgraphSummarizer(llm)
        self.expander = QueryExpander(llm)
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
            seeds = self.seed_finder.find_seeds(q_text, k=self.k_seeds)
            for seed in seeds:
                info = self.neo4j.get_entity(seed.entity_id)
                if info:
                    rows = self.neo4j.run(
                        "MATCH (e:Entity {entityId: $id})-[r]->(n) "
                        "RETURN type(r) AS rel, n.name AS name LIMIT 15",
                        id=seed.entity_id,
                    )
                    seed.one_hop_relations = [
                        f"{row['rel'].lower().replace('_', ' ')} -> {row['name']}"
                        for row in rows
                    ]

            activation_trace = self.activation.run(q_text, seeds)

            # Fetch descriptions for all visited entities — they often contain
            # dates, birth years, and other facts not captured as KG edges.
            entity_descriptions: dict[str, tuple[str, str]] = {}
            for eid in activation_trace.visited:
                row = self.neo4j.get_entity(eid)
                if row and row.get("description"):
                    entity_descriptions[eid] = (
                        row.get("name") or eid,
                        row["description"],
                    )

            activation_trace.summary = self.summarizer.summarize(
                q_text,
                activation_trace.subgraph,
                entity_descriptions=entity_descriptions,
            )
            result.activation = activation_trace

            expanded = self.expander.expand(q_text, activation_trace.summary)
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
            result.enhanced_note = self.note_builder.augment_with_kg(
                q_text, result.passage_note, activation_trace.summary
            )
            result.answer = self.answerer.generate(q_text, result.enhanced_note)
        except Exception as exc:  # keep traceable on failures
            result.error = f"{type(exc).__name__}: {exc}"

        result.finished_at = datetime.now(timezone.utc).isoformat()
        result.elapsed_seconds = round(perf_counter() - started, 3)
        return result
