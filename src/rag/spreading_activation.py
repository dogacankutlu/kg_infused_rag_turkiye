from __future__ import annotations

import re

from src.kg.neo4j_client import Neo4jClient
from src.llm import LLMClient
from src.prompts import templates
from src.trace import (
    RoundTrace,
    SeedTrace,
    SpreadingActivationTrace,
    Triple,
)


_INDEX_RE = re.compile(r"\d+")


class SpreadingActivation:
    def __init__(
        self,
        neo4j: Neo4jClient,
        llm: LLMClient,
        max_rounds: int = 6,
        max_entities_per_round: int = 10,
        max_triples_per_entity: int = 20,
        max_triples_per_round: int = 80,
    ):
        self.neo4j = neo4j
        self.llm = llm
        self.max_rounds = max_rounds
        self.max_entities_per_round = max_entities_per_round
        self.max_triples_per_entity = max_triples_per_entity
        self.max_triples_per_round = max_triples_per_round

    def _limit_per_entity(self, triples: list[Triple]) -> list[Triple]:
        buckets: dict[str, list[Triple]] = {}
        for t in triples:
            buckets.setdefault(t.source_id, []).append(t)
        limited: list[Triple] = []
        for bucket in buckets.values():
            limited.extend(bucket[: self.max_triples_per_entity])
        return limited[: self.max_triples_per_round]

    def _llm_select(self, question: str, triples: list[Triple]) -> list[Triple]:
        if not triples:
            return []
        block = "\n".join(f"{i}: {t.as_str()}" for i, t in enumerate(triples))
        response = self.llm.generate(
            prompt=templates.triple_selection_prompt(question, block),
            system=templates.TRIPLE_SELECTION_SYSTEM,
            temperature=0.0,
            max_tokens=256,
        )
        if "NONE" in response.upper():
            return []
        indices = [int(m) for m in _INDEX_RE.findall(response)]
        selected: list[Triple] = []
        seen_idx: set[int] = set()
        for i in indices:
            if 0 <= i < len(triples) and i not in seen_idx:
                selected.append(triples[i])
                seen_idx.add(i)
        return selected

    def run(
        self, question: str, seeds: list[SeedTrace]
    ) -> SpreadingActivationTrace:
        trace = SpreadingActivationTrace(seeds=seeds)
        current: set[str] = {s.entity_id for s in seeds}
        visited: set[str] = set()

        for round_num in range(1, self.max_rounds + 1):
            frontier = list(current)
            candidates = self.neo4j.get_one_hop_neighbors(frontier, visited)
            candidates = self._limit_per_entity(candidates)

            if not candidates:
                trace.rounds.append(
                    RoundTrace(
                        round_number=round_num,
                        frontier=frontier,
                        candidate_triples=0,
                        selected_triples=[],
                        stopped=True,
                        stop_reason="no candidates",
                    )
                )
                break

            selected = self._llm_select(question, candidates)
            round_trace = RoundTrace(
                round_number=round_num,
                frontier=frontier,
                candidate_triples=len(candidates),
                selected_triples=selected,
            )
            trace.rounds.append(round_trace)

            if not selected:
                round_trace.stopped = True
                round_trace.stop_reason = "LLM selected none"
                break

            trace.subgraph.extend(selected)
            visited.update(current)

            next_entities = {t.target_id for t in selected} - visited
            if len(next_entities) > self.max_entities_per_round:
                next_entities = set(list(next_entities)[: self.max_entities_per_round])

            if not next_entities:
                round_trace.stopped = True
                round_trace.stop_reason = "no new entities"
                break

            current = next_entities

        trace.visited = sorted(visited | current)
        return trace
