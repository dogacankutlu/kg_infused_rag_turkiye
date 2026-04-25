"""FastAPI app exposing the KG-Infused RAG pipeline over HTTP.

Endpoints (all JSON):
  POST /api/ask           — run the pipeline on a single question, return RAGResult
  GET  /api/stats         — dataset + live Neo4j stats
  GET  /api/domains       — distinct domains from the QA dataset
  GET  /api/questions     — full QA dataset (filterable via ?domain=&difficulty=)
  GET  /api/history       — recent attempts from logs/success + logs/failure
  GET  /api/queries       — the Cypher query catalog (templates used in the pipeline)
  GET  /api/health        — ping

The pipeline is built lazily on first /api/ask call and reused (expensive init
loads embeddings + Neo4j driver + BM25 corpus).
"""
from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import settings
from src.eval import score_result
from src.kg import Neo4jClient
from src.kg.seed_finder import SeedFinder
from src.logging_utils import RunLogger
from src.rag.passage_retriever import PassageRetriever
from src.trace import Question


# ---------------------------------------------------------------------------
# Lazy pipeline (heavy to construct — embeddings, BM25 index, Neo4j)
# ---------------------------------------------------------------------------

_pipelines: dict[str, Any] = {}
_pipeline_lock = Lock()
_shared: dict[str, Any] = {}

PIPELINE_KG = "kg_infused"
PIPELINE_VANILLA = "vanilla"
PIPELINE_ALIASES = {
    "kg_infused": PIPELINE_KG,
    "kg-infused": PIPELINE_KG,
    "kg_infused_rag": PIPELINE_KG,
    "kg": PIPELINE_KG,
    "vanilla": PIPELINE_VANILLA,
    "vanilla_rag": PIPELINE_VANILLA,
}


def _normalize_pipeline(name: str | None) -> str:
    return PIPELINE_ALIASES.get((name or "").strip().lower(), PIPELINE_KG)


def get_pipeline(name: str = PIPELINE_KG):
    name = _normalize_pipeline(name)
    if name in _pipelines:
        return _pipelines[name]
    with _pipeline_lock:
        if name in _pipelines:
            return _pipelines[name]
        from src.llm import get_llm_client
        from src.rag import KGInfusedRAG, VanillaRAG

        # Build & cache shared heavy resources once across pipelines.
        if "llm" not in _shared:
            _shared["llm"] = get_llm_client()
        if "retriever" not in _shared:
            _shared["retriever"] = PassageRetriever()

        if name == PIPELINE_VANILLA:
            _pipelines[name] = VanillaRAG(
                llm=_shared["llm"], retriever=_shared["retriever"]
            )
        else:
            if "neo4j" not in _shared:
                _shared["neo4j"] = Neo4jClient()
            if "seed_finder" not in _shared:
                _shared["seed_finder"] = SeedFinder()
            _pipelines[name] = KGInfusedRAG(
                llm=_shared["llm"],
                neo4j=_shared["neo4j"],
                seed_finder=_shared["seed_finder"],
                retriever=_shared["retriever"],
            )
        return _pipelines[name]


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class AskRequest(BaseModel):
    question_text: str
    gold_answer: str = ""
    domain: str = ""
    difficulty: str = "2-hop"
    reasoning_path: list[str] = []
    pipeline: str = "kg_infused"  # "kg_infused" | "vanilla"


# ---------------------------------------------------------------------------
# Cypher query catalog — hand-curated list of the templates the pipeline uses
# ---------------------------------------------------------------------------

CYPHER_CATALOG: list[dict[str, Any]] = [
    {
        "name": "Seed neighbors (one hop)",
        "purpose": "Fetch a seed entity's outgoing relations for seed-card display.",
        "template": (
            "MATCH (e:Entity {entityId: $id})-[r]->(n) "
            "RETURN type(r) AS rel, n.name AS name LIMIT 15"
        ),
    },
    {
        "name": "Spreading activation expansion",
        "purpose": "Each round: fetch outgoing triples from the current frontier.",
        "template": (
            "MATCH (e:Entity {entityId: $id})-[r]->(n) "
            "RETURN e.entityId AS sId, e.name AS sName, "
            "type(r) AS rel, n.entityId AS tId, n.name AS tName "
            "LIMIT $limit"
        ),
    },
    {
        "name": "Entity lookup",
        "purpose": "Fetch an entity's name + description (used by the KG summarizer).",
        "template": (
            "MATCH (e:Entity {entityId: $id}) "
            "RETURN e.entityId AS entityId, e.name AS name, e.description AS description"
        ),
    },
    {
        "name": "Fulltext seed search",
        "purpose": "Alias/description fulltext match for seed finder fallback.",
        "template": (
            "CALL db.index.fulltext.queryNodes('entity_text', $q) "
            "YIELD node, score RETURN node.entityId AS id, node.name AS name, score "
            "LIMIT $limit"
        ),
    },
    {
        "name": "Top relation histogram",
        "purpose": "Aggregate relation frequencies for the stats/history page.",
        "template": (
            "MATCH ()-[r]->() RETURN type(r) AS rel, count(*) AS freq "
            "ORDER BY freq DESC LIMIT $limit"
        ),
    },
    {
        "name": "Sample triples",
        "purpose": "Random triple samples for the History → Sample Triplets tab.",
        "template": (
            "MATCH (s:Entity)-[r]->(o:Entity) "
            "RETURN s.name AS s, type(r) AS rel, o.name AS o LIMIT $limit"
        ),
    },
]


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(title="KG-Infused RAG — Türkiye", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# /api/ask
# ---------------------------------------------------------------------------

@app.post("/api/ask")
def ask(req: AskRequest) -> dict[str, Any]:
    if not req.question_text.strip():
        raise HTTPException(status_code=400, detail="question_text is required")
    pipeline = get_pipeline(req.pipeline)
    q = Question(
        question_id=f"web-{uuid4().hex[:6]}",
        question_text=req.question_text.strip(),
        gold_answer=req.gold_answer.strip(),
        domain=req.domain.strip(),
        difficulty=req.difficulty.strip() or "2-hop",
        reasoning_path=[s for s in req.reasoning_path if s.strip()],
    )
    result = pipeline.answer(q)
    score_result(result)
    try:
        RunLogger().log_attempt(result)
    except Exception:
        # don't fail the request if logging fails
        pass
    return result.to_dict()


# ---------------------------------------------------------------------------
# /api/stats
# ---------------------------------------------------------------------------

@app.get("/api/stats")
def stats() -> dict[str, Any]:
    data: dict[str, Any] = {"filtered": None, "live": None}

    stats_file = settings.processed_path / "stats.json"
    if stats_file.exists():
        data["filtered"] = json.loads(stats_file.read_text(encoding="utf-8"))

    try:
        client = Neo4jClient()
        data["live"] = {
            "entities": client.entity_count(),
            "relations": client.relation_count(),
            "top_relations": client.top_relations(limit=20),
        }
        client.close()
    except Exception as e:
        data["live_error"] = str(e)

    # Domain histogram (from QA dataset — cheap and always available)
    try:
        qs = _load_questions()
        hist: dict[str, int] = {}
        diff_hist: dict[str, int] = {}
        for q in qs:
            hist[q.get("domain", "unknown")] = hist.get(q.get("domain", "unknown"), 0) + 1
            diff_hist[q.get("difficulty", "unknown")] = (
                diff_hist.get(q.get("difficulty", "unknown"), 0) + 1
            )
        data["qa_domain_histogram"] = hist
        data["qa_difficulty_histogram"] = diff_hist
        data["qa_total"] = len(qs)
    except Exception:
        pass

    return data


# ---------------------------------------------------------------------------
# /api/questions + /api/domains
# ---------------------------------------------------------------------------

def _load_questions() -> list[dict[str, Any]]:
    path = settings.questions_path
    if not path.exists():
        return []
    raw = json.loads(path.read_text(encoding="utf-8"))
    # accept either a list or {"questions": [...]}
    if isinstance(raw, dict) and "questions" in raw:
        return raw["questions"]
    return raw


@app.get("/api/questions")
def questions(
    domain: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
) -> dict[str, Any]:
    qs = _load_questions()
    if domain:
        qs = [q for q in qs if q.get("domain", "").lower() == domain.lower()]
    if difficulty:
        qs = [q for q in qs if q.get("difficulty", "").lower() == difficulty.lower()]
    return {"count": len(qs), "questions": qs}


@app.get("/api/domains")
def domains() -> dict[str, Any]:
    qs = _load_questions()
    seen: dict[str, int] = {}
    for q in qs:
        d = q.get("domain", "")
        if d:
            seen[d] = seen.get(d, 0) + 1
    return {"domains": sorted(seen.keys()), "counts": seen}


# ---------------------------------------------------------------------------
# /api/history
# ---------------------------------------------------------------------------

@app.get("/api/history")
def history(
    verdict: Optional[str] = Query(None, description="'success' or 'failure'"),
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    logger = RunLogger()
    items: list[dict[str, Any]] = []
    for rec in logger.iter_attempts(verdict=verdict):
        items.append(rec)
    # newest first
    items.sort(key=lambda r: r.get("finished_at", r.get("started_at", "")), reverse=True)
    items = items[:limit]
    return {"count": len(items), "attempts": items}


# ---------------------------------------------------------------------------
# /api/queries — Cypher catalog
# ---------------------------------------------------------------------------

@app.get("/api/queries")
def queries() -> dict[str, Any]:
    logger = RunLogger()
    times: list[float] = []
    max_hops = 0
    for rec in logger.iter_attempts():
        elapsed = rec.get("elapsed_seconds") or 0.0
        if elapsed:
            times.append(float(elapsed))
        rounds = rec.get("activation", {}).get("rounds", [])
        max_hops = max(max_hops, len(rounds))
    avg = sum(times) / len(times) if times else 0.0
    return {
        "templates": CYPHER_CATALOG,
        "template_count": len(CYPHER_CATALOG),
        "max_hops_observed": max_hops,
        "avg_elapsed_seconds": round(avg, 3),
        "runs_analyzed": len(times),
    }
