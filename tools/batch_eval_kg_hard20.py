"""Run KG-Infused RAG over the same 20 hardest questions used in batch_eval_hard20.py.

20 questions × 1 pipeline = 20 runs.
Each run involves Neo4j spreading activation (up to 6 rounds) + LLM calls,
so expect ~1–3 min per question (~30–60 min total).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.eval import score_result
from src.kg.neo4j_client import Neo4jClient
from src.llm import get_llm_client
from src.logging_utils import RunLogger
from src.rag import KGInfusedRAG
from src.rag.passage_retriever import PassageRetriever
from src.trace import Question

# Same 20 questions as batch_eval_hard20.py
HARD_IDS = [
    # 3-hop (15)
    "TR_032", "TR_036", "TR_057", "TR_063", "TR_065",
    "USR_021", "USR_022", "USR_023", "USR_024", "USR_025",
    "USR_026", "USR_027", "USR_028", "USR_029", "USR_030",
    # Comparison (5)
    "TR_049", "TR_076", "TR_107", "TR_108", "USR_035",
]


def load_hard_questions() -> list[Question]:
    qa_path = ROOT / "questions" / "turkiye_qa.json"
    raw = json.loads(qa_path.read_text(encoding="utf-8"))
    by_id = {q["question_id"]: q for q in raw}
    out = []
    for qid in HARD_IDS:
        q = by_id.get(qid)
        if not q or not q.get("gold_answer"):
            print(f"  WARNING: {qid} missing or no gold_answer — skipping")
            continue
        out.append(
            Question(
                question_id=q["question_id"],
                question_text=q["question_text"],
                gold_answer=q["gold_answer"],
                domain=q.get("domain", ""),
                difficulty=q.get("difficulty", ""),
                reasoning_path=q.get("reasoning_path", []) or [],
            )
        )
    return out


def main() -> None:
    questions = load_hard_questions()
    print(f"Running KG-Infused RAG on {len(questions)} hardest questions\n")
    for q in questions:
        print(f"  [{q.difficulty:<10} {q.domain:<14}] {q.question_id}  "
              f"{q.question_text[:55]}  →  {q.gold_answer}")

    print("\nInitialising pipeline...")
    llm = get_llm_client()
    neo4j = Neo4jClient()
    if not neo4j.verify_connection():
        raise RuntimeError("Neo4j not reachable — start Neo4j Desktop first.")
    retriever = PassageRetriever()
    pipeline = KGInfusedRAG(llm=llm, neo4j=neo4j, retriever=retriever)
    print(f"Pipeline ready: {pipeline.name}\n")

    logger = RunLogger()
    results_log = []

    em_total = f1_total = acc_total = rr_total = lat_total = 0.0
    n = 0
    diff_agg: dict[str, dict] = {}

    total_start = time.time()

    print("=" * 60)
    print(f"Pipeline: {pipeline.name}")
    print("=" * 60)

    for i, q in enumerate(questions, 1):
        t0 = time.time()
        try:
            result = pipeline.answer(q)
        except Exception as e:
            print(f"  [{i:>2}/{len(questions)}] {q.question_id} ERROR: {e}")
            continue
        score_result(result)
        logger.log_attempt(result)
        m = result.metrics
        elapsed = time.time() - t0

        em_total += m.em or 0
        f1_total += m.f1 or 0
        acc_total += m.accuracy or 0
        rr_total += m.retrieval_recall or 0
        lat_total += elapsed
        n += 1

        diff = q.difficulty
        if diff not in diff_agg:
            diff_agg[diff] = {"n": 0, "em": 0.0, "f1": 0.0, "acc": 0.0, "rr": 0.0}
        diff_agg[diff]["n"] += 1
        diff_agg[diff]["em"] += m.em or 0
        diff_agg[diff]["f1"] += m.f1 or 0
        diff_agg[diff]["acc"] += m.accuracy or 0
        diff_agg[diff]["rr"] += m.retrieval_recall or 0

        # Count spreading activation rounds
        rounds = len(result.activation.rounds) if result.activation else 0
        seeds_found = len(result.activation.seeds) if result.activation else 0
        em_mark = "✓" if (m.em or 0) >= 1 else "✗"

        print(
            f"  [{i:>2}/{len(questions)}] {q.question_id:<10} "
            f"EM={m.em:.0f}{em_mark} F1={m.f1:.2f} RR={m.retrieval_recall:.0f}  "
            f"seeds={seeds_found} rounds={rounds}  "
            f"({elapsed:.1f}s)  → {result.answer[:50]!r}"
        )
        results_log.append({
            "qid": q.question_id, "difficulty": q.difficulty,
            "em": m.em, "f1": m.f1, "rr": m.retrieval_recall,
            "seeds": seeds_found, "rounds": rounds,
            "answer": result.answer, "gold": q.gold_answer,
        })

    total_elapsed = time.time() - total_start
    print(f"\nTotal wall time: {total_elapsed/60:.1f} min")

    print("\n" + "=" * 70)
    print("AGGREGATE — KG-Infused RAG, 20 Hardest Questions")
    print("=" * 70)
    print(f"{'Pipeline':<22} {'N':>3} {'EM':>6} {'F1':>6} {'Acc':>6} {'RR':>6} {'AvgSec':>7}")
    nd = n or 1
    print(
        f"{'kg_infused_rag':<22} {n:>3} "
        f"{em_total/nd:>6.3f} {f1_total/nd:>6.3f} {acc_total/nd:>6.3f} "
        f"{rr_total/nd:>6.3f} {lat_total/nd:>7.2f}"
    )

    print("\n" + "=" * 70)
    print("BY DIFFICULTY")
    print("=" * 70)
    print(f"{'Difficulty':<15} {'N':>3} {'EM':>6} {'F1':>6} {'Acc':>6} {'RR':>6}")
    for diff, d in sorted(diff_agg.items()):
        nd2 = d["n"] or 1
        print(
            f"{diff:<15} {d['n']:>3} "
            f"{d['em']/nd2:>6.3f} {d['f1']/nd2:>6.3f} "
            f"{d['acc']/nd2:>6.3f} {d['rr']/nd2:>6.3f}"
        )

    print("\n" + "=" * 70)
    print("COMPARISON vs BASELINES (Hard-20)")
    print("=" * 70)
    print(f"{'Pipeline':<22} {'EM':>6} {'F1':>6} {'RR':>6}")
    print(f"{'vanilla_rag':<22} {'0.450':>6} {'0.475':>6} {'0.550':>6}")
    print(f"{'vanilla_qe_rag':<22} {'0.450':>6} {'0.475':>6} {'0.550':>6}")
    print(f"{'no_retrieval_rag':<22} {'0.400':>6} {'0.425':>6} {'0.000':>6}")
    nd = n or 1
    print(
        f"{'kg_infused_rag':<22} {em_total/nd:>6.3f} {f1_total/nd:>6.3f} {rr_total/nd:>6.3f}"
    )


if __name__ == "__main__":
    main()
