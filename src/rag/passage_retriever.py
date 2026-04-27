"""BM25 retrieval over the Türkiye-filtered entity descriptions.

Corpus source: data/processed/turkiye_text.tsv
Each passage = <entity_id, title (name), description text>.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi

from config import settings
from src.trace import RetrievedPassage


_WORD_RE = re.compile(r"\w+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return [t.lower() for t in _WORD_RE.findall(text)]


class PassageRetriever:
    def __init__(self, processed_dir: Path | None = None):
        self.processed_dir = processed_dir or settings.processed_path
        self._docs: list[dict] = []
        self._tokenized: list[list[str]] = []
        self._bm25: BM25Okapi | None = None
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        names: dict[str, str] = {}
        ents_file = self.processed_dir / "turkiye_entities.jsonl"
        if ents_file.exists():
            with ents_file.open("r", encoding="utf-8") as f:
                for line in f:
                    rec = json.loads(line)
                    names[rec["entity_id"]] = rec.get("name", rec["entity_id"])

        text_file = self.processed_dir / "turkiye_text.tsv"
        if not text_file.exists():
            raise FileNotFoundError(
                f"{text_file} missing. Run extract-turkiye first."
            )
        with text_file.open("r", encoding="utf-8") as f:
            for line in f:
                parts = line.rstrip("\n").split("\t", 1)
                if len(parts) != 2:
                    continue
                eid, desc = parts
                self._docs.append(
                    {"entity_id": eid, "title": names.get(eid, eid), "text": desc}
                )
                self._tokenized.append(_tokenize(f"{names.get(eid, eid)} {desc}"))
        self._bm25 = BM25Okapi(self._tokenized)
        self._loaded = True

    def search(self, query: str, k: int, source_label: str) -> list[RetrievedPassage]:
        self.load()
        assert self._bm25 is not None
        tokens = _tokenize(query)
        if not tokens:
            return []
        scores = self._bm25.get_scores(tokens)
        top = np.argsort(-scores)[:k]
        return [
            RetrievedPassage(
                entity_id=self._docs[i]["entity_id"],
                title=self._docs[i]["title"],
                text=self._docs[i]["text"],
                score=float(scores[i]),
                source_query=source_label,
            )
            for i in top
            if scores[i] > 0
        ]

    def dual_retrieve(
        self, original_query: str, expanded_query: str, k_p: int = 6
    ) -> tuple[list[RetrievedPassage], list[RetrievedPassage], list[RetrievedPassage]]:
        original_hits = self.search(original_query, k_p, "original")
        expanded_hits = self.search(expanded_query, k_p, "expanded")
        seen: set[str] = set()
        deduped: list[RetrievedPassage] = []
        for p in original_hits + expanded_hits:
            if p.entity_id in seen:
                continue
            seen.add(p.entity_id)
            deduped.append(p)
        return original_hits, expanded_hits, deduped[:k_p]
