"""Find seed entities for a natural-language question.

Hybrid scoring: normalized BM25 (over entity descriptions) + cosine similarity
between question embedding and entity description embedding. Optionally
boosts entities whose aliases appear verbatim in the question.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import numpy as np
from rank_bm25 import BM25Okapi

from config import settings
from src.embeddings import Encoder
from src.trace import SeedTrace


_WORD_RE = re.compile(r"\w+", re.UNICODE)


def _tokenize(text: str) -> list[str]:
    return [t.lower() for t in _WORD_RE.findall(text)]


class SeedFinder:
    def __init__(
        self,
        processed_dir: Path | None = None,
        encoder: Encoder | None = None,
        embed_top_n: int = 200,
    ):
        self.processed_dir = processed_dir or settings.processed_path
        self.encoder = encoder or Encoder()
        self.embed_top_n = embed_top_n
        self._entities: list[dict] = []
        self._tokenized_corpus: list[list[str]] = []
        self._bm25: BM25Okapi | None = None
        self._alias_to_id: dict[str, str] = {}
        self._loaded = False

    def load(self):
        if self._loaded:
            return
        ents_file = self.processed_dir / "turkiye_entities.jsonl"
        if not ents_file.exists():
            raise FileNotFoundError(
                f"{ents_file} missing. Run extract-turkiye first."
            )
        with ents_file.open("r", encoding="utf-8") as f:
            for line in f:
                rec = json.loads(line)
                self._entities.append(rec)
                corpus_text = " ".join(
                    [rec.get("name", "")] + rec.get("aliases", []) + [rec.get("description", "")]
                )
                self._tokenized_corpus.append(_tokenize(corpus_text))
                for alias in rec.get("aliases", []):
                    self._alias_to_id.setdefault(alias.lower(), rec["entity_id"])
                self._alias_to_id.setdefault(rec.get("name", "").lower(), rec["entity_id"])
        self._bm25 = BM25Okapi(self._tokenized_corpus)
        self._loaded = True

    def _alias_matches(self, question: str) -> list[tuple[str, str]]:
        q_low = question.lower()
        hits = []
        for alias, eid in self._alias_to_id.items():
            if len(alias) < 3:
                continue
            if alias in q_low:
                hits.append((alias, eid))
        return hits

    def find_seeds(self, question: str, k: int = 3) -> list[SeedTrace]:
        self.load()
        assert self._bm25 is not None
        tokens = _tokenize(question)
        bm25_scores = self._bm25.get_scores(tokens)
        top_idx = np.argsort(-bm25_scores)[: self.embed_top_n]

        if len(top_idx) == 0:
            return []

        q_emb = self.encoder.encode_one(question)
        top_texts = [
            f"{self._entities[i].get('name', '')}. {self._entities[i].get('description', '')}"
            for i in top_idx
        ]
        emb_matrix = self.encoder.encode(top_texts)
        cosines = emb_matrix @ q_emb

        max_bm25 = float(bm25_scores[top_idx].max()) or 1.0
        norm_bm25 = bm25_scores[top_idx] / max_bm25
        combined = 0.5 * norm_bm25 + 0.5 * cosines

        alias_hits = dict(self._alias_matches(question))
        final_scores = combined.copy()
        for rank_i, ent_i in enumerate(top_idx):
            rec = self._entities[ent_i]
            if rec.get("name", "").lower() in alias_hits or any(
                a.lower() in alias_hits for a in rec.get("aliases", [])
            ):
                final_scores[rank_i] += 0.3

        order = np.argsort(-final_scores)[:k]
        seeds: list[SeedTrace] = []
        for rank_i in order:
            ent_i = int(top_idx[rank_i])
            rec = self._entities[ent_i]
            matched = [a for a in rec.get("aliases", []) if a.lower() in alias_hits]
            seeds.append(
                SeedTrace(
                    entity_id=rec["entity_id"],
                    name=rec.get("name", rec["entity_id"]),
                    entity_type="",
                    score=float(final_scores[rank_i]),
                    bm25_score=float(norm_bm25[rank_i]),
                    embed_score=float(cosines[rank_i]),
                    matched_aliases=matched,
                )
            )
        return seeds
