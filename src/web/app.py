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

import hashlib
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
from src.trace import Question, verdict_from_dict


# ---------------------------------------------------------------------------
# Manual verdict override store
# ---------------------------------------------------------------------------
# A run is identified by a 12-char SHA-1 of (started_at + question_text).
# Overrides live in logs/verdict_overrides.json so they survive restarts and
# don't require rewriting the original JSONL log files.

_overrides_lock = Lock()
_overrides_path = Path("logs") / "verdict_overrides.json"


def _run_id(rec: dict[str, Any]) -> str:
    started = rec.get("started_at") or ""
    qtext = ((rec.get("question") or {}).get("question_text")) or ""
    digest = hashlib.sha1(f"{started}|{qtext}".encode("utf-8")).hexdigest()
    return digest[:12]


def _read_overrides() -> dict[str, str]:
    if not _overrides_path.exists():
        return {}
    try:
        return json.loads(_overrides_path.read_text(encoding="utf-8")) or {}
    except Exception:
        return {}


def _write_overrides(data: dict[str, str]) -> None:
    with _overrides_lock:
        _overrides_path.parent.mkdir(parents=True, exist_ok=True)
        _overrides_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


# ---------------------------------------------------------------------------
# Lazy pipeline (heavy to construct — embeddings, BM25 index, Neo4j)
# ---------------------------------------------------------------------------

_pipelines: dict[str, Any] = {}
_pipeline_lock = Lock()
_shared: dict[str, Any] = {}

PIPELINE_KG = "kg_infused"
PIPELINE_VANILLA = "vanilla"
PIPELINE_VANILLA_QE = "vanilla_qe"
PIPELINE_NO_RETRIEVAL = "no_retrieval"

PIPELINE_ALIASES = {
    # KG-Infused
    "kg_infused": PIPELINE_KG,
    "kg-infused": PIPELINE_KG,
    "kg_infused_rag": PIPELINE_KG,
    "kg": PIPELINE_KG,
    # Vanilla
    "vanilla": PIPELINE_VANILLA,
    "vanilla_rag": PIPELINE_VANILLA,
    # Vanilla + QE
    "vanilla_qe": PIPELINE_VANILLA_QE,
    "vanilla-qe": PIPELINE_VANILLA_QE,
    "vanilla_qe_rag": PIPELINE_VANILLA_QE,
    "qe": PIPELINE_VANILLA_QE,
    # No-retrieval baseline
    "no_retrieval": PIPELINE_NO_RETRIEVAL,
    "no-retrieval": PIPELINE_NO_RETRIEVAL,
    "no_retrieval_rag": PIPELINE_NO_RETRIEVAL,
    "nor": PIPELINE_NO_RETRIEVAL,
}


def _normalize_pipeline(name: str | None) -> str:
    return PIPELINE_ALIASES.get((name or "").strip().lower(), PIPELINE_KG)


def _ensure_llm():
    if "llm" not in _shared:
        from src.llm import get_llm_client
        _shared["llm"] = get_llm_client()
    return _shared["llm"]


# Hot-swap support — clear cached LLM + every constructed pipeline so the next
# /api/ask rebuilds them against the new provider. Cheaper than a full server
# restart: Neo4j driver, BM25 corpus and embeddings stay loaded.
def _reset_llm_and_pipelines() -> None:
    with _pipeline_lock:
        _shared.pop("llm", None)
        _pipelines.clear()


# Friendly labels for the two providers the UI exposes. "Qwen" is the Ollama
# default model (qwen2.5:7b-instruct) — the underlying provider is "ollama".
PROVIDER_LABELS = {
    "groq": "Groq (Cloud)",
    "ollama": "Qwen (Local · Ollama)",
}


def _ensure_retriever():
    if "retriever" not in _shared:
        _shared["retriever"] = PassageRetriever()
    return _shared["retriever"]


def get_pipeline(name: str = PIPELINE_KG):
    name = _normalize_pipeline(name)
    if name in _pipelines:
        return _pipelines[name]
    with _pipeline_lock:
        if name in _pipelines:
            return _pipelines[name]
        from src.rag import (
            KGInfusedRAG,
            NoRetrievalRAG,
            VanillaQERAG,
            VanillaRAG,
        )

        if name == PIPELINE_NO_RETRIEVAL:
            _pipelines[name] = NoRetrievalRAG(llm=_ensure_llm())
        elif name == PIPELINE_VANILLA:
            _pipelines[name] = VanillaRAG(
                llm=_ensure_llm(), retriever=_ensure_retriever()
            )
        elif name == PIPELINE_VANILLA_QE:
            _pipelines[name] = VanillaQERAG(
                llm=_ensure_llm(), retriever=_ensure_retriever()
            )
        else:  # PIPELINE_KG
            if "neo4j" not in _shared:
                _shared["neo4j"] = Neo4jClient()
            if "seed_finder" not in _shared:
                _shared["seed_finder"] = SeedFinder()
            _pipelines[name] = KGInfusedRAG(
                llm=_ensure_llm(),
                neo4j=_shared["neo4j"],
                seed_finder=_shared["seed_finder"],
                retriever=_ensure_retriever(),
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
# /api/provider — quick-select between Groq and Qwen (Ollama) without restart
# ---------------------------------------------------------------------------

class ProviderRequest(BaseModel):
    provider: str  # "groq" | "ollama"


@app.get("/api/provider")
def get_provider() -> dict[str, Any]:
    """Report the currently active LLM provider and the catalog of options."""
    current = (settings.llm_provider or "groq").lower()
    return {
        "provider": current,
        "model": settings.llm_model,
        "label": PROVIDER_LABELS.get(current, current),
        "options": [
            {"id": pid, "label": label} for pid, label in PROVIDER_LABELS.items()
        ],
    }


@app.post("/api/provider")
def set_provider(req: ProviderRequest) -> dict[str, Any]:
    """Hot-swap the LLM provider. Mutates settings in place and clears the
    cached LLM client + every pipeline so the next /api/ask rebuilds against
    the new provider. No server restart required.
    """
    pid = (req.provider or "").strip().lower()
    if pid not in PROVIDER_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"provider must be one of: {', '.join(PROVIDER_LABELS.keys())}",
        )
    # Pick a sensible default model when flipping providers — Groq needs a
    # cloud model id; Ollama needs a locally-pulled tag.
    settings.llm_provider = pid
    if pid == "groq":
        if "qwen" in settings.llm_model.lower() or ":" in settings.llm_model:
            settings.llm_model = "llama-3.3-70b-versatile"
    elif pid == "ollama":
        if "llama-" in settings.llm_model.lower() and ":" not in settings.llm_model:
            settings.llm_model = "qwen2.5:7b-instruct"
    _reset_llm_and_pipelines()
    return {
        "provider": settings.llm_provider,
        "model": settings.llm_model,
        "label": PROVIDER_LABELS[pid],
    }


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
# /api/questions/promote — promote a verified question into the QA dataset
# ---------------------------------------------------------------------------

class PromoteRequest(BaseModel):
    question_text: str
    gold_answer: str
    domain: Optional[str] = None
    difficulty: Optional[str] = None


_promote_lock = Lock()


def _next_user_id(qs: list[dict[str, Any]]) -> str:
    n = sum(1 for q in qs if str(q.get("question_id", "")).startswith("USR_"))
    return f"USR_{n + 1:03d}"


@app.post("/api/questions/promote")
def promote_question(req: PromoteRequest) -> dict[str, Any]:
    """Append a user-verified question to the QA dataset under the
    'user-created' domain. If a previously logged run targeted the exact
    same question text, retroactively re-score it against the new gold
    answer so the Evaluation tab picks it up immediately.
    """
    q_text = (req.question_text or "").strip()
    gold = (req.gold_answer or "").strip()
    if not q_text:
        raise HTTPException(status_code=400, detail="question_text is required")
    if not gold:
        raise HTTPException(status_code=400, detail="gold_answer is required")

    path = settings.questions_path
    with _promote_lock:
        qs = _load_questions()
        # If a question with the exact same text already exists, just
        # update its gold_answer rather than duplicating.
        existing = next(
            (q for q in qs if (q.get("question_text") or "").strip().lower()
             == q_text.lower()),
            None,
        )
        if existing:
            existing["gold_answer"] = gold
            if req.domain:
                existing["domain"] = req.domain.strip() or existing.get("domain", "")
            if req.difficulty:
                existing["difficulty"] = req.difficulty.strip() or existing.get("difficulty", "")
            new_q = existing
            created = False
        else:
            new_q = {
                "question_id": _next_user_id(qs),
                "question_text": q_text,
                "reasoning_path": [],
                "gold_answer": gold,
                "difficulty": (req.difficulty or "2-hop").strip(),
                "domain": (req.domain or "user-created").strip() or "user-created",
            }
            qs.append(new_q)
            created = True

        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(qs, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # Retroactively re-score any prior runs against this question text so the
    # Evaluation dashboard picks up the new gold answer without a re-run.
    rescored = _rescore_runs_for_question(q_text, gold)

    return {
        "created": created,
        "question": new_q,
        "rescored_runs": rescored,
    }


def _rescore_runs_for_question(question_text: str, gold: str) -> int:
    """Walk every JSONL log file, attach the new gold answer to any record
    whose question_text matches (case-insensitive) and that lacks one, then
    rewrite the file with refreshed metric scores. Returns the number of
    records updated.
    """
    from src.eval.metrics import (  # local import to avoid cold-start cost
        accuracy as acc_metric,
        em as em_metric,
        f1 as f1_metric,
    )

    target = question_text.strip().lower()
    updated = 0
    for sub in ("success", "failure"):
        d = Path("logs") / sub
        if not d.exists():
            continue
        for fp in d.glob("*.jsonl"):
            lines = fp.read_text(encoding="utf-8").splitlines()
            changed = False
            new_lines: list[str] = []
            for line in lines:
                if not line.strip():
                    new_lines.append(line)
                    continue
                try:
                    rec = json.loads(line)
                except Exception:
                    new_lines.append(line)
                    continue
                q = rec.get("question") or {}
                qtxt = (q.get("question_text") or "").strip().lower()
                if qtxt == target and not (q.get("gold_answer") or "").strip():
                    q["gold_answer"] = gold
                    rec["question"] = q
                    ans = rec.get("answer") or ""
                    metrics = rec.get("metrics") or {}
                    metrics["em"] = float(em_metric(ans, gold))
                    metrics["f1"] = float(f1_metric(ans, gold))
                    metrics["accuracy"] = float(acc_metric(ans, gold))
                    # retrieval_recall stays as previously logged — recomputing
                    # it cleanly requires reconstructing the RAGResult, which
                    # is overkill for a retroactive rescore.
                    rec["metrics"] = metrics
                    changed = True
                    updated += 1
                new_lines.append(json.dumps(rec, ensure_ascii=False))
            if changed:
                fp.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    return updated


# ---------------------------------------------------------------------------
# /api/history
# ---------------------------------------------------------------------------

@app.get("/api/history")
def history(
    verdict: Optional[str] = Query(
        None, description="'success', 'failure', or 'unverified'"
    ),
    limit: int = Query(100, ge=1, le=1000),
) -> dict[str, Any]:
    """Return recent attempts. Verdict is recomputed on the fly using the
    current logic so that historical entries are reclassified retroactively
    (e.g. old "no information found" answers now show as Failed). Each
    attempt is tagged with a stable `run_id`, and any manual override
    persisted under logs/verdict_overrides.json wins over the recomputed
    verdict.
    """
    logger = RunLogger()
    overrides = _read_overrides()
    items: list[dict[str, Any]] = []
    for rec in logger.iter_attempts():
        rid = _run_id(rec)
        rec["run_id"] = rid
        if rid in overrides:
            rec["manual_verdict"] = overrides[rid]
        rec["verdict"] = verdict_from_dict(rec)
        if verdict and rec["verdict"] != verdict:
            continue
        items.append(rec)
    items.sort(key=lambda r: r.get("finished_at", r.get("started_at", "")), reverse=True)
    items = items[:limit]
    return {"count": len(items), "attempts": items}


# ---------------------------------------------------------------------------
# /api/runs/verdict — manual override
# ---------------------------------------------------------------------------

class VerdictOverrideRequest(BaseModel):
    run_id: str
    verdict: str  # "success" | "failure" | "unverified" — empty string clears


@app.post("/api/runs/verdict")
def set_verdict(req: VerdictOverrideRequest) -> dict[str, Any]:
    rid = (req.run_id or "").strip()
    v = (req.verdict or "").strip().lower()
    if not rid:
        raise HTTPException(status_code=400, detail="run_id required")
    overrides = _read_overrides()
    if v in ("", "auto"):
        overrides.pop(rid, None)
    elif v in ("success", "failure", "unverified"):
        overrides[rid] = v
    else:
        raise HTTPException(
            status_code=400,
            detail="verdict must be one of: success, failure, unverified, auto",
        )
    _write_overrides(overrides)
    return {"run_id": rid, "verdict": overrides.get(rid, "auto")}


# ---------------------------------------------------------------------------
# /api/evaluation — aggregated metrics per pipeline (KG-Infused vs Vanilla)
# ---------------------------------------------------------------------------


def _pipeline_key(name: str) -> str:
    """Map any logged pipeline name string to a canonical bucket id."""
    n = (name or "").lower()
    if "no_retrieval" in n or n in ("nor",):
        return "no_retrieval"
    if "vanilla_qe" in n or "qe" == n:
        return "vanilla_qe"
    if "vanilla" in n:
        return "vanilla"
    if "kg" in n:
        return "kg_infused"
    return "other"


PIPELINE_KEYS = ("no_retrieval", "vanilla", "vanilla_qe", "kg_infused")


@app.get("/api/evaluation")
def evaluation() -> dict[str, Any]:
    """Aggregate metrics per pipeline across the success+failure logs.

    Idempotency: only the FIRST attempt for a given (pipeline, question_id)
    contributes to the global metrics. Subsequent re-runs of the same question
    remain visible in /api/history but are ignored here so repeated executions
    cannot skew Accuracy/F1/EM/Retrieval-Recall.
    """
    logger = RunLogger()
    overrides = _read_overrides()
    buckets: dict[str, dict[str, Any]] = {}

    # Sort attempts chronologically so "first" means earliest by started_at.
    all_attempts = list(logger.iter_attempts())
    all_attempts.sort(key=lambda r: r.get("started_at", "") or "")
    seen: set[tuple[str, str]] = set()

    for rec in all_attempts:
        key = _pipeline_key(rec.get("pipeline", ""))
        if key == "other":
            continue
        qid = (rec.get("question") or {}).get("question_id", "")
        dedup_key = (key, qid)
        if qid and dedup_key in seen:
            continue  # later run — logged in history, ignored in metrics
        if qid:
            seen.add(dedup_key)
        rid = _run_id(rec)
        if rid in overrides:
            rec["manual_verdict"] = overrides[rid]
        v = verdict_from_dict(rec)
        b = buckets.setdefault(
            key,
            {
                "pipeline": key,
                "runs": 0,
                "successes": 0,
                "failures": 0,
                "unverified": 0,
                "with_gold": 0,
                "em_sum": 0.0,
                "f1_sum": 0.0,
                "acc_sum": 0.0,
                "rr_sum": 0.0,
                "elapsed_sum": 0.0,
                "elapsed_n": 0,
            },
        )
        b["runs"] += 1
        if v == "success":
            b["successes"] += 1
        elif v == "failure":
            b["failures"] += 1
        else:
            b["unverified"] += 1

        # Metrics are only meaningful when a gold answer existed
        # (manual overrides do not synthesise EM/F1 numbers).
        gold = (rec.get("question") or {}).get("gold_answer", "")
        m = rec.get("metrics") or {}
        if gold:
            b["with_gold"] += 1
            b["em_sum"] += float(m.get("em") or 0.0)
            b["f1_sum"] += float(m.get("f1") or 0.0)
            b["acc_sum"] += float(m.get("accuracy") or 0.0)
            b["rr_sum"] += float(m.get("retrieval_recall") or 0.0)

        elapsed = rec.get("elapsed_seconds")
        if elapsed:
            b["elapsed_sum"] += float(elapsed)
            b["elapsed_n"] += 1

    def avg(s: float, n: int) -> float:
        return round(s / n, 4) if n else 0.0

    pipelines: list[dict[str, Any]] = []
    for key in PIPELINE_KEYS:
        b = buckets.get(key)
        if not b:
            pipelines.append(
                {
                    "pipeline": key,
                    "runs": 0,
                    "successes": 0,
                    "failures": 0,
                    "unverified": 0,
                    "success_rate": 0.0,
                    "with_gold": 0,
                    "metrics": {"em": 0.0, "f1": 0.0, "accuracy": 0.0, "retrieval_recall": 0.0},
                    "avg_elapsed_seconds": 0.0,
                }
            )
            continue
        n_gold = b["with_gold"]
        # Success rate excludes unverified runs from the denominator —
        # they are pending human review and shouldn't drag the rate down.
        decided = b["successes"] + b["failures"]
        pipelines.append(
            {
                "pipeline": key,
                "runs": b["runs"],
                "successes": b["successes"],
                "failures": b["failures"],
                "unverified": b["unverified"],
                "success_rate": round(b["successes"] / decided, 4) if decided else 0.0,
                "with_gold": n_gold,
                "metrics": {
                    "em": avg(b["em_sum"], n_gold),
                    "f1": avg(b["f1_sum"], n_gold),
                    "accuracy": avg(b["acc_sum"], n_gold),
                    "retrieval_recall": avg(b["rr_sum"], n_gold),
                },
                "avg_elapsed_seconds": avg(b["elapsed_sum"], b["elapsed_n"]),
            }
        )
    return {"pipelines": pipelines}


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


# ---------------------------------------------------------------------------
# /api/verify — Question Verifier
# ---------------------------------------------------------------------------
#
# Lightweight pre-flight check: given a question, can the system likely answer
# it? Runs only seed lookup + BM25 retrieval — no LLM call, no spreading
# activation. Returns a structured report so users can fix bad questions
# before paying the full pipeline cost.

class VerifyRequest(BaseModel):
    question_text: str


@app.post("/api/verify")
def verify(req: VerifyRequest) -> dict[str, Any]:
    q_text = (req.question_text or "").strip()
    if not q_text:
        raise HTTPException(status_code=400, detail="question_text is required")

    checks: list[dict[str, Any]] = []

    # Check 1 — minimum length / shape.
    word_count = len(q_text.split())
    length_ok = word_count >= 3 and len(q_text) >= 10
    checks.append({
        "id": "shape",
        "label": "Question shape",
        "ok": length_ok,
        "detail": f"{word_count} words, {len(q_text)} characters"
        + ("" if length_ok else " — too short, prefer ≥3 words"),
    })

    # Check 2 — seed entities resolvable in the KG.
    seeds_info: list[dict[str, Any]] = []
    seed_ok = False
    try:
        finder = _ensure_seed_finder()
        seeds = finder.find_seeds(q_text, k=3)
        for s in seeds:
            seeds_info.append({
                "entity_id": s.entity_id,
                "name": s.name,
                "score": round(float(s.score), 3),
            })
        seed_ok = bool(seeds and seeds[0].score > 0.0)
        checks.append({
            "id": "seeds",
            "label": "KG seed entities",
            "ok": seed_ok,
            "detail": (
                f"Top match: {seeds[0].name} (score {seeds[0].score:.2f})"
                if seeds_info else "No seed entity matched in the KG"
            ),
        })
    except Exception as exc:
        checks.append({
            "id": "seeds",
            "label": "KG seed entities",
            "ok": False,
            "detail": f"Lookup failed: {type(exc).__name__}: {exc}",
        })

    # Check 3 — BM25 corpus retrieval.
    passages_preview: list[dict[str, Any]] = []
    retrieval_ok = False
    try:
        retriever = _ensure_retriever()
        hits = retriever.search(q_text, k=3, source_label="verify")
        for p in hits:
            passages_preview.append({
                "entity_id": p.entity_id,
                "title": p.title,
                "score": round(float(p.score), 2),
            })
        retrieval_ok = bool(hits and hits[0].score > 1.0)
        checks.append({
            "id": "retrieval",
            "label": "Passage retrieval",
            "ok": retrieval_ok,
            "detail": (
                f"Top passage: {hits[0].title} (BM25 {hits[0].score:.2f})"
                if hits else "No relevant passage in the corpus"
            ),
        })
    except Exception as exc:
        checks.append({
            "id": "retrieval",
            "label": "Passage retrieval",
            "ok": False,
            "detail": f"Lookup failed: {type(exc).__name__}: {exc}",
        })

    # Overall verdict — answerable if seeds OR retrieval can ground it.
    answerable = length_ok and (seed_ok or retrieval_ok)

    if answerable:
        recommendation = (
            "Question looks answerable. Try KG-Infused RAG for multi-hop "
            "questions, or Vanilla RAG for direct factual lookups."
        )
    elif length_ok and not seed_ok and not retrieval_ok:
        recommendation = (
            "Neither the KG nor the passage corpus matched any entity from "
            "this question. Likely about an entity outside the Türkiye "
            "subgraph — rephrase or pick a different topic."
        )
    else:
        recommendation = (
            "Question is too short or generic — add more context (entity "
            "name, time, or location) to make it answerable."
        )

    return {
        "question_text": q_text,
        "answerable": answerable,
        "checks": checks,
        "seeds": seeds_info,
        "passages": passages_preview,
        "recommendation": recommendation,
    }


def _ensure_seed_finder():
    if "seed_finder" not in _shared:
        _shared["seed_finder"] = SeedFinder()
    return _shared["seed_finder"]
