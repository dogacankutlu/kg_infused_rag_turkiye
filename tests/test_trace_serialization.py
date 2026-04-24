import json

from src.trace import (
    MetricScores,
    Question,
    RAGResult,
    RetrievalTrace,
    RetrievedPassage,
    RoundTrace,
    SeedTrace,
    SpreadingActivationTrace,
    Triple,
)


def test_rag_result_round_trips_via_json():
    question = Question(
        question_id="TR_TEST",
        question_text="Galatasaray'ın stadyumu nerededir?",
        reasoning_path=["Galatasaray", "home venue", "Rams Park"],
        gold_answer="İstanbul",
        difficulty="2-hop",
        domain="football",
    )
    seed = SeedTrace(entity_id="Q207058", name="Galatasaray", score=0.91, bm25_score=0.8, embed_score=0.95)
    triple = Triple(
        source_id="Q207058",
        source_name="Galatasaray",
        relation="home venue",
        target_id="Q123",
        target_name="Rams Park",
    )
    round_trace = RoundTrace(
        round_number=1,
        frontier=["Q207058"],
        candidate_triples=5,
        selected_triples=[triple],
    )
    activation = SpreadingActivationTrace(seeds=[seed], rounds=[round_trace], subgraph=[triple])
    activation.summary = "Kısa özet."
    activation.visited = ["Q207058", "Q123"]

    retrieval = RetrievalTrace(
        original_query="Galatasaray stadyumu?",
        expanded_query="Rams Park nerede?",
        deduped=[
            RetrievedPassage(
                entity_id="Q123",
                title="Rams Park",
                text="İstanbul'da bulunan futbol stadyumu.",
                score=3.14,
                source_query="original",
            )
        ],
    )

    result = RAGResult(
        pipeline="kg_infused_rag",
        question=question,
        activation=activation,
        retrieval=retrieval,
        passage_note="Rams Park İstanbul'da.",
        enhanced_note="Rams Park Galatasaray'ın stadyumudur ve İstanbul'da bulunur.",
        answer="İstanbul",
        metrics=MetricScores(em=1.0, f1=1.0, accuracy=1.0, retrieval_recall=1.0),
        finished_at="2026-04-22T10:00:00Z",
        elapsed_seconds=4.2,
    )

    d = result.to_dict()
    serialized = json.dumps(d, ensure_ascii=False)
    restored = json.loads(serialized)
    assert restored["answer"] == "İstanbul"
    assert restored["question"]["question_id"] == "TR_TEST"
    assert restored["activation"]["seeds"][0]["entity_id"] == "Q207058"
    assert restored["retrieval"]["deduped"][0]["title"] == "Rams Park"
    assert restored["metrics"]["em"] == 1.0
    assert restored["verdict"] == "success"
