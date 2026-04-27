"""Run the 3 baseline pipelines over the 20 hardest questions.

Selection: all 15 three-hop questions + 5 comparison questions chosen for
requiring specific date/year knowledge (hardest for a parametric LLM to answer
without retrieval).

20 questions × 3 pipelines = 60 runs.
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

# All 15 three-hop questions + 5 hardest comparison questions
# (comparison ones chosen: require specific founding years / birth years / award years)
HARD_IDS = [
    # --- 3-hop (15) ---
    "TR_032",   # Fenerbahçe teknik direktörünün doğduğu şehrin ülkesi → Portekiz
    "TR_036",   # Koç Holding kurucusunun doğduğu şehrin ülkesi → Türkiye
    "TR_057",   # Sabahattin Ali doğduğu şehrin ülkesi → Bulgaristan
    "TR_063",   # Fenerbahçe Beko arenasının şehri → İstanbul
    "TR_065",   # Cedi Osman doğduğu şehrin ülkesi → Kuzey Makedonya
    "USR_021",  # Galatasaray menajeri doğduğu şehrin ili → İstanbul
    "USR_022",  # Fenerbahçe stadyumu şehrin en kalabalık ilçesi → Kadıköy
    "USR_023",  # Aziz Sancar'ın üniversitesinin şehri → İstanbul
    "USR_024",  # Süleyman Demirel'in üniversitesinin şehri → İstanbul
    "USR_025",  # Orhan Pamuk'un üniversitesinin şehri → İstanbul
    "USR_026",  # Hakan Şükür'ün kulübü stadyumunun şehri → İstanbul
    "USR_027",  # Erdoğan'ın doğduğu ilin coğrafi bölgesi → Karadeniz Bölgesi
    "USR_028",  # THY merkezinin havalimanı → İstanbul Havalimanı
    "USR_029",  # Kış Uykusu başrolü → Haluk Bilginer
    "USR_030",  # Türkiye'nin ilk Nobel'li yazarının şehri → İstanbul
    # --- Comparison (5) — require founding/birth/award year knowledge ---
    "TR_049",   # Koç Holding mi Sabancı Holding mi daha erken? → Koç Holding
    "TR_076",   # Tarkan mı Sezen Aksu mu daha önce doğdu? → Sezen Aksu
    "TR_107",   # Aziz Sancar mı Orhan Pamuk mu Nobel önce? → Orhan Pamuk
    "TR_108",   # Hürriyet mi Cumhuriyet mi daha önce kuruldu? → Cumhuriyet
    "USR_035",  # Topkapı Sarayı mı Dolmabahçe Sarayı mı daha eski? → Topkapı Sarayı
]


def load_hard_questions() -> list[Question]:
    qa_path = ROOT / "questions" / "turkiye_qa.json"
    raw = json.loads(qa_path.read_text(encoding="utf-8"))
    by_id = {q["question_id"]: q for q in raw}
    out = []
    for qid in HARD_IDS:
        q = by_id.get(qid)
        if not q:
            print(f"  WARNING: {qid} not found in dataset — skipping")
            continue
        if not q.get("gold_answer"):
            print(f"  WARNING: {qid} has no gold_answer — skipping")
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
    print(f"Running {len(questions)} hardest questions (3-hop + comparison)\n")
    for q in questions:
        print(f"  [{q.difficulty:<10} {q.domain:<14}] {q.question_id}  {q.question_text[:55]}  →  {q.gold_answer}")

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
    agg_diff: dict[str, dict] = defaultdict(
        lambda: {"n": 0, "em": 0.0, "f1": 0.0, "acc": 0.0, "rr": 0.0, "lat": 0.0}
    )

    total_start = time.time()

    for pipe in pipelines:
        print(f"\n=== Pipeline: {pipe.name} ===")
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
            agg_diff[f"{pipe.name}/{q.difficulty}"]["n"] += 1
            agg_diff[f"{pipe.name}/{q.difficulty}"]["em"] += m.em or 0
            agg_diff[f"{pipe.name}/{q.difficulty}"]["f1"] += m.f1 or 0
            agg_diff[f"{pipe.name}/{q.difficulty}"]["acc"] += m.accuracy or 0
            agg_diff[f"{pipe.name}/{q.difficulty}"]["rr"] += m.retrieval_recall or 0
            agg_diff[f"{pipe.name}/{q.difficulty}"]["lat"] += elapsed
            em_mark = "✓" if (m.em or 0) >= 1 else "✗"
            print(
                f"  [{i:>2}/{len(questions)}] {q.question_id:<10} "
                f"EM={m.em:.0f}{em_mark} F1={m.f1:.2f} RR={m.retrieval_recall:.0f}  "
                f"({elapsed:.1f}s)  → {result.answer[:55]!r}"
            )

    print(f"\nTotal wall time: {(time.time()-total_start)/60:.1f} min")

    print("\n" + "=" * 70)
    print("AGGREGATE — 20 Hardest Questions")
    print("=" * 70)
    print(f"{'Pipeline':<22} {'N':>3} {'EM':>6} {'F1':>6} {'Acc':>6} {'RR':>6} {'AvgSec':>7}")
    for name, d in agg.items():
        n = d["n"] or 1
        print(
            f"{name:<22} {d['n']:>3} "
            f"{d['em']/n:>6.3f} {d['f1']/n:>6.3f} {d['acc']/n:>6.3f} "
            f"{d['rr']/n:>6.3f} {d['lat']/n:>7.2f}"
        )

    print("\n" + "=" * 70)
    print("BY DIFFICULTY")
    print("=" * 70)
    print(f"{'Pipeline/Diff':<28} {'N':>3} {'EM':>6} {'F1':>6} {'Acc':>6} {'RR':>6}")
    for key in sorted(agg_diff):
        d = agg_diff[key]
        n = d["n"] or 1
        print(
            f"{key:<28} {d['n']:>3} "
            f"{d['em']/n:>6.3f} {d['f1']/n:>6.3f} {d['acc']/n:>6.3f} {d['rr']/n:>6.3f}"
        )


if __name__ == "__main__":
    main()
