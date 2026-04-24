from src.llm.base import LLMClient
from src.rag.spreading_activation import SpreadingActivation
from src.trace import SeedTrace, Triple


class FakeLLM(LLMClient):
    provider = "fake"
    model = "fake"

    def __init__(self, response: str):
        self._response = response

    def generate(self, prompt, system=None, temperature=0.0, max_tokens=1024):
        return self._response


class FakeNeo4j:
    def __init__(self, triples_by_frontier):
        self._triples_by_frontier = triples_by_frontier

    def get_one_hop_neighbors(self, entity_ids, visited_ids):
        key = tuple(sorted(entity_ids))
        return self._triples_by_frontier.get(key, [])


def test_stops_on_no_candidates():
    neo = FakeNeo4j({})
    act = SpreadingActivation(neo4j=neo, llm=FakeLLM("0"), max_rounds=3)
    seeds = [SeedTrace(entity_id="Q1", name="Start")]
    trace = act.run("Soru?", seeds)
    assert len(trace.rounds) == 1
    assert trace.rounds[0].stop_reason == "no candidates"
    assert trace.subgraph == []


def test_llm_none_stops():
    triple = Triple("Q1", "Start", "related", "Q2", "Next")
    neo = FakeNeo4j({("Q1",): [triple]})
    act = SpreadingActivation(neo4j=neo, llm=FakeLLM("NONE"), max_rounds=3)
    trace = act.run("Soru?", [SeedTrace(entity_id="Q1", name="Start")])
    assert len(trace.rounds) == 1
    assert trace.rounds[0].stop_reason == "LLM selected none"
    assert trace.subgraph == []


def test_selects_and_advances():
    t1 = Triple("Q1", "Start", "related", "Q2", "Mid")
    t2 = Triple("Q2", "Mid", "related", "Q3", "End")
    neo = FakeNeo4j({("Q1",): [t1], ("Q2",): [t2]})
    act = SpreadingActivation(neo4j=neo, llm=FakeLLM("0"), max_rounds=3)
    trace = act.run("Soru?", [SeedTrace(entity_id="Q1", name="Start")])
    assert len(trace.subgraph) == 2
    assert trace.subgraph[-1].target_id == "Q3"
