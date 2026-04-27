"""Run the three non-KG baseline pipelines (vanilla, vanilla_qe, no_retrieval)
over a curated subset of the Turkish QA dataset, log every attempt via the
standard RunLogger, and print an aggregate metrics table at the end.

Why a separate script rather than `python -m src.cli eval`:
The shipped CLI's `_build_pipeline()` only constructs KGInfusedRAG. We want to
exercise the three baselines without touching the main CLI surface, and we
want a quick-running selection (12 questions × 3 pipelines = 36 runs) that
finishes inside ~15 minutes on local Qwen rather than the full 113 × 3 = 339.

The picked subset is balanced across difficulty (single-hop, 2-hop, 3-hop,
comparison) and across domains so the resulting metrics are representative.
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


# Curated 12-question subset. Each row: (question_id, expected difficulty),
# selected to balance domains and exercise both factual and comparison questions.
PICKED_IDS = [
    # single-hop
    "TR_000",  # geography  Türkiye'nin başkenti
    "TR_001",  # geography  para birimi
    "TR_080",  # politics   Atatürk doğum yılı
    # 2-hop
    "TR_002",  # football   Galatasaray menajer doğum yeri
    "TR_011",  # cinema     Eşkıya yönetmen
    "TR_022",  # company    THY merkez şehir
    "TR_040",  # politics   Süleyman Demirel
    "TR_055",  # academia   Boğaziçi rektör
    # 3-hop
    "TR_004",  # football   Galatasaray stadyum şehir ülke
    "TR_017",  # cinema     3-hop cinema
    # comparison
    "TR_065",  # academia   Boğaziçi vs ODTÜ
    "TR_066",  # politics   Atatürk vs İnönü
]


def load_questions() -> list[Question]:
    qa_path = ROOT / "questions" / "turkiye_qa.json"
    raw = json.loads(qa_path.read_text(encoding="utf-8"))
    by_id = {q["question_id"]: q for q in raw}

    # Fall back to the first matching items per difficulty if specific IDs
    # don't exist (the QA file's IDs may have shifted across edits).
    picked: list[dict] = []
    for qid in PICKED_IDS:
        if qid in by_id:
            picked.append(by_id[qid])

    # If fewer than 12 hit, top up by difficulty class.
    if len(picked) < 12:
        wanted_per_diff = {"single-hop": 3, "2-hop": 5, "3-hop": 2, "comparison": 2}
        already_text = {q["question_text"] for q in picked}
        by_diff = defaultdict(list)
        for q in raw:
            by_diff[q.get("difficulty", "?")].append(q)
        for diff, n in wanted_per_diff.items():
            count = sum(1 for q in picked if q.get("difficulty") == diff)
            for q in by_diff.get(diff, []):
                if count >= n:
                    break
                if q["question_text"] in already_text:
                    continue
                if not q.get("gold_answer"):
                    continue
                picked.append(q)
                already_text.add(q["question_text"])
                count += 1

    out = []
    for q in picked[:12]:
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
    questions = load_questions()
    print(f"Picked {len(questions)} questions:")
    for q in questions:
        print(
            f"  [{q.difficulty:<10} {q.domain:<14}] {q.question_text}  →  {q.gold_answer}"
        )

    llm = get_llm_client()
    retriever = PassageRetriever()  # shared across pipelines (loads BM25 index once)
    pipelines = [
        VanillaRAG(llm=llm, retriever=retriever),
        VanillaQERAG(llm=llm, retriever=retriever),
        NoRetrievalRAG(llm=llm),
    ]

    logger = RunLogger()
    agg: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "em": 0.0, "f1": 0.0, "acc": 0.0, "rr": 0.0, "lat": 0.0}
    )
    print()
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
    print("AGGREGATE (just-completed runs)")
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
