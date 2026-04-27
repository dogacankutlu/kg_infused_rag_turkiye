"""Remove every JSONL log record that has a non-empty `error` field.

These are pipeline runs that crashed mid-execution (exception, missing
dependency, etc.) — they don't represent real model behaviour and should not
contribute to metric aggregates.

Each .jsonl is backed up to .jsonl.errbak before being rewritten.
"""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main() -> None:
    total_pruned = 0
    total_kept = 0
    pruned_by_pipeline: Counter = Counter()

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
                    if rec.get("error"):
                        pruned_here += 1
                        pruned_by_pipeline[rec.get("pipeline", "?")] += 1
                        continue
                    kept_lines.append(line_s)
            if pruned_here:
                bak = f.with_suffix(f.suffix + ".errbak")
                bak.write_text(f.read_text(encoding="utf-8"), encoding="utf-8")
                f.write_text(
                    "\n".join(kept_lines) + ("\n" if kept_lines else ""),
                    encoding="utf-8",
                )
            total_pruned += pruned_here
            total_kept += len(kept_lines)
            print(f"  {f.relative_to(ROOT)}: pruned={pruned_here} kept={len(kept_lines)}")

    print(f"\nTotal pruned: {total_pruned}, total kept: {total_kept}")
    if pruned_by_pipeline:
        print("Pruned by pipeline:")
        for pipe, n in pruned_by_pipeline.most_common():
            print(f"  {pipe}: {n}")


if __name__ == "__main__":
    main()
