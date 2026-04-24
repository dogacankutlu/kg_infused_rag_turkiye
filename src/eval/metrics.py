from __future__ import annotations

import re
import string
import unicodedata
from collections import Counter

from src.trace import MetricScores, RAGResult


_PUNCT_RE = re.compile(f"[{re.escape(string.punctuation)}]")


def _normalize(text: str) -> str:
    if text is None:
        return ""
    t = text.lower().strip()
    t = unicodedata.normalize("NFKD", t)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = _PUNCT_RE.sub(" ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def _tokens(text: str) -> list[str]:
    return [t for t in _normalize(text).split(" ") if t]


def em(pred: str, gold: str) -> float:
    return 1.0 if _normalize(pred) == _normalize(gold) else 0.0


def accuracy(pred: str, gold: str) -> float:
    """Lenient accuracy: gold substring in prediction or vice versa, after normalize."""
    p, g = _normalize(pred), _normalize(gold)
    if not p or not g:
        return 0.0
    return 1.0 if (g in p or p in g) else 0.0


def f1(pred: str, gold: str) -> float:
    p_tokens = _tokens(pred)
    g_tokens = _tokens(gold)
    if not p_tokens or not g_tokens:
        return 0.0
    common = Counter(p_tokens) & Counter(g_tokens)
    shared = sum(common.values())
    if shared == 0:
        return 0.0
    precision = shared / len(p_tokens)
    recall = shared / len(g_tokens)
    return 2 * precision * recall / (precision + recall)


def retrieval_recall(result: RAGResult) -> float:
    """1.0 if the gold-answer string appears (normalized) in any retrieved passage."""
    gold = _normalize(result.question.gold_answer)
    if not gold:
        return 0.0
    for p in result.retrieval.deduped:
        if gold in _normalize(p.title) or gold in _normalize(p.text):
            return 1.0
    return 0.0


def score_result(result: RAGResult) -> MetricScores:
    gold = result.question.gold_answer
    pred = result.answer or ""
    scores = MetricScores(
        em=em(pred, gold),
        f1=f1(pred, gold),
        accuracy=accuracy(pred, gold),
        retrieval_recall=retrieval_recall(result),
    )
    result.metrics = scores
    return scores
