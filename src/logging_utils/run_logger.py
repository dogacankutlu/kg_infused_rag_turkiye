from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from config import settings
from src.trace import RAGResult


class RunLogger:
    def __init__(self, log_dir: Path | None = None):
        self.log_dir = log_dir or settings.log_path
        (self.log_dir / "success").mkdir(parents=True, exist_ok=True)
        (self.log_dir / "failure").mkdir(parents=True, exist_ok=True)

    def log_attempt(self, result: RAGResult) -> Path:
        verdict = result.verdict()
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        path = self.log_dir / verdict / f"{date}.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(result.to_dict(), ensure_ascii=False) + "\n")
        return path

    def iter_attempts(self, verdict: str | None = None) -> Iterable[dict]:
        verdicts = [verdict] if verdict else ["success", "failure"]
        for v in verdicts:
            root = self.log_dir / v
            if not root.exists():
                continue
            for p in sorted(root.glob("*.jsonl")):
                with p.open("r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line:
                            continue
                        yield json.loads(line)
