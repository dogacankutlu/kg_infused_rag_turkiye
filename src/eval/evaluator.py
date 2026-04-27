from __future__ import annotations

import csv
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from src.logging_utils import RunLogger
from src.rag.base import RAGPipeline
from src.trace import Question, RAGResult

from .metrics import score_result


class Evaluator:
    def __init__(
        self,
        pipeline: RAGPipeline,
        run_logger: RunLogger | None = None,
        log_dir: Path | None = None,
    ):
        self.pipeline = pipeline
        self.run_logger = run_logger or RunLogger()
        self.log_dir = log_dir or settings.log_path

    def load_questions(self, path: Path | None = None) -> list[Question]:
        path = path or settings.questions_path
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
        return [Question.from_dict(d) for d in data]

    def _previously_seen_qids(self) -> set[str]:
        """Question IDs already logged for this pipeline — for idempotency,
        these will be re-run and re-logged but excluded from metric aggregates.

        Errored records (exception during pipeline execution) are NOT counted
        as "seen" — they don't represent real model behaviour, so the next
        successful run for the same qid should contribute to aggregates.
        """
        pipeline_name = getattr(self.pipeline, "name", "")
        seen: set[str] = set()
        for rec in self.run_logger.iter_attempts():
            if rec.get("pipeline") != pipeline_name:
                continue
            if rec.get("error"):
                continue  # crashed runs don't claim the qid
            qid = (rec.get("question") or {}).get("question_id", "")
            if qid:
                seen.add(qid)
        return seen

    def run(
        self,
        questions: list[Question] | None = None,
        render_each: callable | None = None,
    ) -> dict:
        questions = questions if questions is not None else self.load_questions()
        already_logged = self._previously_seen_qids()
        results: list[RAGResult] = []
        counted_results: list[RAGResult] = []
        for q in questions:
            result = self.pipeline.answer(q)
            score_result(result)
            self.run_logger.log_attempt(result)
            if render_each is not None:
                render_each(result)
            results.append(result)
            # Only first execution of a question contributes to metrics.
            if q.question_id not in already_logged:
                counted_results.append(result)
                already_logged.add(q.question_id)
        aggregate, per_group_rows = self._aggregate(counted_results)
        self._write_csv(results, aggregate, per_group_rows)
        return {
            "results": results,
            "counted": counted_results,
            "aggregate": aggregate,
            "groups": per_group_rows,
        }

    def _aggregate(self, results: list[RAGResult]):
        def avg(items: list[float]) -> float:
            return sum(items) / len(items) if items else 0.0

        buckets: dict[str, list[RAGResult]] = defaultdict(list)
        buckets["overall"] = list(results)
        for r in results:
            buckets[f"domain:{r.question.domain}"].append(r)
            buckets[f"difficulty:{r.question.difficulty}"].append(r)

        per_group_rows = []
        for name in sorted(buckets.keys()):
            items = buckets[name]
            per_group_rows.append(
                {
                    "group": name,
                    "n": len(items),
                    "accuracy": avg([r.metrics.accuracy for r in items if r.metrics]),
                    "f1": avg([r.metrics.f1 for r in items if r.metrics]),
                    "em": avg([r.metrics.em for r in items if r.metrics]),
                    "retrieval_recall": avg(
                        [r.metrics.retrieval_recall for r in items if r.metrics]
                    ),
                }
            )

        overall = next(row for row in per_group_rows if row["group"] == "overall")
        aggregate = {
            "n": overall["n"],
            "accuracy": overall["accuracy"],
            "f1": overall["f1"],
            "em": overall["em"],
            "retrieval_recall": overall["retrieval_recall"],
        }
        return aggregate, per_group_rows

    def _write_csv(self, results, aggregate, per_group_rows):
        self.log_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        csv_path = self.log_dir / f"eval_{ts}.csv"
        with csv_path.open("w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "question_id",
                    "domain",
                    "difficulty",
                    "pred",
                    "gold",
                    "em",
                    "f1",
                    "accuracy",
                    "retrieval_recall",
                    "elapsed",
                    "error",
                ]
            )
            for r in results:
                m = r.metrics
                writer.writerow(
                    [
                        r.question.question_id,
                        r.question.domain,
                        r.question.difficulty,
                        r.answer,
                        r.question.gold_answer,
                        m.em if m else "",
                        m.f1 if m else "",
                        m.accuracy if m else "",
                        m.retrieval_recall if m else "",
                        r.elapsed_seconds,
                        r.error,
                    ]
                )
        summary_path = self.log_dir / f"eval_{ts}_summary.json"
        summary_path.write_text(
            json.dumps(
                {"aggregate": aggregate, "groups": per_group_rows},
                ensure_ascii=False,
                indent=2,
            ),
            encoding="utf-8",
        )
