from __future__ import annotations

import numpy as np

from config import settings


class Encoder:
    """Thin wrapper around sentence-transformers. Loaded lazily."""

    def __init__(self, model_name: str | None = None):
        self.model_name = model_name or settings.embedding_model
        self._model = None

    def _load(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(self.model_name)

    def encode(self, texts: list[str]) -> np.ndarray:
        self._load()
        embs = self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return np.asarray(embs, dtype=np.float32)

    def encode_one(self, text: str) -> np.ndarray:
        return self.encode([text])[0]
