"""Run all three non-KG baseline pipelines over the ENTIRE QA dataset.

115 questions × 3 pipelines = 345 runs (KG-Infused omitted — too slow locally).
Logs every attempt via RunLogger and prints per-difficulty + per-domain aggregate
tables at the end.
"""

from __future__ import annotations

import json
import sys
import time
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from src.eval import score_result
from src.llm import get_llm_client
from src.logging_utils import RunLogger
from src.rag import NoRetrievalRAG, VanillaQERAG, VanillaRAG
from src.rag.passage_retriever import PassageRetriever
from src.trace import Question


def load_all_questions() -> list[Question]:
    qa_path = ROOT / "questions" / "turkiye_qa.json"
    raw = json.loads(qa_path.read_text(encoding="utf-8"))
    out = []
    for q in raw:
        if not q.get("gold_answer"):
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


def print_table(title: str, agg: dict[str, dict]) -> None:
    print(f"\n{'=' * 70}")
    print(title)
    print("=" * 70)
    print(f"{'Group':<22} {'N':>3} {'EM':>6} {'F1':>6} {'Acc':>6} {'RR':>6} {'AvgSec':>7}")
    for name, d in sorted(agg.items()):
        n = d["n"] or 1
        print(
            f"{name:<22} {d['n']:>3} "
            f"{d['em']/n:>6.3f} {d['f1']/n:>6.3f} {d['acc']/n:>6.3f} "
            f"{d['rr']/n:>6.3f} {d['lat']/n:>7.2f}"
        )


def main() -> None:
    questions = load_all_questions()
    print(f"Loaded {len(questions)} questions from rebalanced dataset")
    from collections import Counter
    diff_counts = Counter(q.difficulty for q in questions)
    domain_counts = Counter(q.domain for q in questions)
    print(f"Difficulty distribution: {dict(diff_counts)}")
    print(f"Domain distribution: {dict(domain_counts)}")
    print()

    llm = get_llm_client()
    retriever = PassageRetriever()
    pipelines = [
        VanillaRAG(llm=llm, retriever=retriever),
        VanillaQERAG(llm=llm, retriever=retriever),
        NoRetrievalRAG(llm=llm),
    ]

    logger = RunLogger()

    # Aggregate by pipeline name
    agg_pipeline: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "em": 0.0, "f1": 0.0, "acc": 0.0, "rr": 0.0, "lat": 0.0}
    )
    # Aggregate by (pipeline, difficulty)
    agg_diff: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "em": 0.0, "f1": 0.0, "acc": 0.0, "rr": 0.0, "lat": 0.0}
    )

    total_start = time.time()

    for pipe in pipelines:
        print(f"\n{'=' * 60}")
        print(f"Pipeline: {pipe.name}  ({len(questions)} questions)")
        print("=" * 60)
        for i, q in enumerate(questions, 1):
            t0 = time.time()
            try:
                result = pipe.answer(q)
            except Exception as e:
                print(f"  [{i:>3}/{len(questions)}] {q.question_id} ERROR: {e}")
                continue
            score_result(result)
            logger.log_attempt(result)
            m = result.metrics
            elapsed = time.time() - t0

            for bucket in [agg_pipeline[pipe.name], agg_diff[f"{pipe.name}/{q.difficulty}"]]:
                bucket["n"] += 1
                bucket["em"] += m.em or 0
                bucket["f1"] += m.f1 or 0
                bucket["acc"] += m.accuracy or 0
                bucket["rr"] += m.retrieval_recall or 0
                bucket["lat"] += elapsed

            em_mark = "✓" if (m.em or 0) >= 1 else "✗"
            print(
                f"  [{i:>3}/{len(questions)}] {q.question_id:<10} "
                f"EM={m.em:.0f}{em_mark} F1={m.f1:.2f}  "
                f"({elapsed:.1f}s)  → {result.answer[:55]!r}"
            )

    total_elapsed = time.time() - total_start
    print(f"\nTotal wall time: {total_elapsed/60:.1f} min")

    print_table("OVERALL — by pipeline", agg_pipeline)

    # Per-difficulty breakdown per pipeline
    for pipe_name in [p.name for p in pipelines]:
        diff_slice = {
            k.split("/")[1]: v
            for k, v in agg_diff.items()
            if k.startswith(pipe_name + "/")
        }
        print_table(f"DIFFICULTY BREAKDOWN — {pipe_name}", diff_slice)


if __name__ == "__main__":
    main()
