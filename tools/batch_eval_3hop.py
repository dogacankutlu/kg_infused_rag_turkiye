"""Run the three non-KG baselines over EVERY 3-hop question in the QA dataset.

Same shape as batch_eval_baselines.py but selects all questions whose
difficulty == "3-hop" (instead of a 12-question curated subset).

23 × 3-hop questions × 3 pipelines = 69 runs. KG-Infused is intentionally
omitted (it'd add ~30 min/q on local Qwen).
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


def load_3hop_questions() -> list[Question]:
    qa_path = ROOT / "questions" / "turkiye_qa.json"
    raw = json.loads(qa_path.read_text(encoding="utf-8"))
    out = []
    for q in raw:
        if q.get("difficulty") != "3-hop":
            continue
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


def main() -> None:
    questions = load_3hop_questions()
    print(f"Loaded {len(questions)} 3-hop questions:")
    for q in questions:
        print(f"  [{q.domain:<14}] {q.question_text}  →  {q.gold_answer}")

    llm = get_llm_client()
    retriever = PassageRetriever()
    pipelines = [
        VanillaRAG(llm=llm, retriever=retriever),
        VanillaQERAG(llm=llm, retriever=retriever),
        NoRetrievalRAG(llm=llm),
    ]

    logger = RunLogger()
    agg: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "em": 0.0, "f1": 0.0, "acc": 0.0, "rr": 0.0, "lat": 0.0}
    )

    for pipe in pipelines:
        print(f"\n=== Running pipeline: {pipe.name} ===")
        for i, q in enumerate(questions, 1):
            t0 = time.time()
            try:
                result = pipe.answer(q)
            except Exception as e:
                print(f"  [{i:>2}/{len(questions)}] {q.question_id} ERROR: {e}")
                continue
            score_result(result)
            logger.log_attempt(result)
            m = result.metrics
            elapsed = time.time() - t0
            agg[pipe.name]["n"] += 1
            agg[pipe.name]["em"] += m.em or 0
            agg[pipe.name]["f1"] += m.f1 or 0
            agg[pipe.name]["acc"] += m.accuracy or 0
            agg[pipe.name]["rr"] += m.retrieval_recall or 0
            agg[pipe.name]["lat"] += elapsed
            print(
                f"  [{i:>2}/{len(questions)}] {q.question_id} "
                f"EM={m.em:.0f} F1={m.f1:.2f} RR={m.retrieval_recall:.0f}  "
                f"({elapsed:.1f}s)  → {result.answer[:60]!r}"
            )

    print("\n" + "=" * 70)
    print("3-HOP AGGREGATE")
    print("=" * 70)
    print(f"{'Pipeline':<22} {'N':>3} {'EM':>6} {'F1':>6} {'Acc':>6} {'RR':>6} {'AvgSec':>7}")
    for name, d in agg.items():
        n = d["n"] or 1
        print(
            f"{name:<22} {d['n']:>3} "
            f"{d['em']/n:>6.3f} {d['f1']/n:>6.3f} {d['acc']/n:>6.3f} "
            f"{d['rr']/n:>6.3f} {d['lat']/n:>7.2f}"
        )


if __name__ == "__main__":
    main()
