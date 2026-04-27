"""Remove every JSONL log record whose question_id is in the removed-list.

Reads questions/.removed_question_ids.json (written by rebalance_qa.py),
then rewrites every logs/success/*.jsonl and logs/failure/*.jsonl in place,
keeping only records that DON'T reference a removed question_id.

Each .jsonl is backed up to .jsonl.bak before being rewritten.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REMOVED_PATH = ROOT / "questions" / ".removed_question_ids.json"


def main() -> None:
    removed_ids = set(
        json.loads(REMOVED_PATH.read_text(encoding="utf-8"))["removed_ids"]
    )
    print(f"Pruning runs for {len(removed_ids)} removed question_ids")

    total_pruned = 0
    total_kept = 0
    for log_dir in [ROOT / "logs" / "success", ROOT / "logs" / "failure"]:
        for f in sorted(log_dir.glob("*.jsonl")):
            kept_lines: list[str] = []
            pruned_here = 0
            with f.open(encoding="utf-8") as fh:
                for line in fh:
                    line_s = line.rstrip("\n")
                    if not line_s:
                        continue
                    try:
                        rec = json.loads(line_s)
                    except json.JSONDecodeError:
                        kept_lines.append(line_s)  # keep malformed line as-is
                        continue
                    qid = (rec.get("question") or {}).get("question_id")
                    if qid in removed_ids:
                        pruned_here += 1
                        continue
                    kept_lines.append(line_s)
            if pruned_here:
                # backup, then rewrite
                bak = f.with_suffix(f.suffix + ".bak")
                bak.write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
                f.write_text(
                    "\n".join(kept_lines) + ("\n" if kept_lines else ""),
                    encoding="utf-8",
                )
            total_pruned += pruned_here
            total_kept += len(kept_lines)
            print(f"  {f.relative_to(ROOT)}: pruned={pruned_here} kept={len(kept_lines)}")
    print(f"\nDone. Total pruned: {total_pruned}, total kept: {total_kept}")


if __name__ == "__main__":
    main()
