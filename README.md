# KG-Infused RAG — Türkiye Domain

CSE 474 / 5074 Social Network Analysis term project. Implements the KG-Infused
RAG framework (Wu et al., 2025) over Wikidata5M, focused on the Türkiye domain.

## What this implements

### Four interchangeable RAG pipelines (assignment §6 ablation)

All four are concrete subclasses of the `RAGPipeline` ABC, share the same
`RAGResult` trace contract, and are selectable from the web UI's hidden header
dropdown or the CLI `--pipeline` flag:

| Pipeline | Description | Modules used |
|---|---|---|
| **KG-Infused RAG** | Full pipeline: seeds → spreading activation → KG summary → KG-expanded BM25 → KG-augmented note → answer | All Modules 1-3 |
| **Vanilla RAG** | BM25 retrieval over the original question only → passage note → answer | retriever + note + answer |
| **Vanilla + Query Expansion** | Pure-LLM rewrite (no KG) → dual BM25 → passage note → answer | retriever + LLM rewriter |
| **No-Retrieval Baseline** | LLM answers from parametric memory only — lower-bound baseline | LLM only |

Detail of the KG-Infused pipeline:
1. Seed entity detection (BM25 + multilingual embeddings + alias match)
2. KG-guided spreading activation (Neo4j traversal + LLM triple selection)
3. Subgraph summarization
4. KG-based query expansion + dual-query BM25 retrieval over Wikidata5M descriptions
5. Passage-note construction → KG-augmented note → final answer

### Cross-cutting features

- **LLM abstraction** — one env var swaps Groq for a local Ollama model
- **Metrics**: Exact Match, token F1, lenient Accuracy, Retrieval Recall
  (per-pipeline, side-by-side in the web Evaluation tab)
- **Logging**: every successful / failed attempt appended to `logs/{success,failure}/*.jsonl`,
  tagged with the pipeline that produced it; verdict recomputed on read so
  "no information" answers are always classified as failures
- **QA dataset**: 100+ Turkish multi-hop questions across ~20 domains
  (single-hop / 2-hop / 3-hop / comparison)

### Web UI (FastAPI + React)

A FastAPI backend (`src/web/app.py`) exposes the same four pipelines, a
verifier endpoint, history, stats, and evaluation. A React + Vite + Tailwind
frontend (`web/`) provides:

- **Ask page** — question input with animated typewriter placeholder; result
  view adapts per pipeline (NoR shows just the answer; Vanilla adds passages;
  Vanilla-QE adds an expanded-query card; KG-Infused renders the full
  two-column knowledge-graph analysis with a Cytoscape.js graph)
- **History → Recent Runs** — every attempt with method chip, status, and a
  one-word *Failure Reason* column (Timeout / Rate Limit / DB Down / KG Error /
  LLM Error / No Seeds / No Info / …)
- **History → Evaluation & Metrics** — four success-rate cards (one per
  pipeline) plus a comparison table that highlights the per-metric winner;
  dataset overview (domain pie, difficulty histogram, top relations,
  searchable triple table) sits directly underneath
- **History → Dataset & Validation** — Question Verifier (shape + KG seed +
  BM25 reachability checks, no LLM call) on top, full QA dataset table below
  (filterable by domain + difficulty, grouped by hop count)

See [`web_quickstart.txt`](./web_quickstart.txt) for how to run it locally.

## Repo layout

```
config/            settings (pydantic-settings, env-driven)
src/llm/           LLMClient ABC, Groq & Ollama implementations, factory
src/kg/            Neo4j client, extractor, loader, seed finder
src/rag/           Four RAG pipelines (kg_infused, vanilla, vanilla_qe, no_retrieval) + sub-modules
src/prompts/       centralized prompt templates
src/trace/         dataclasses with to_dict() + rich console renderer
src/eval/          metrics + evaluator
src/logging_utils/ success/failure JSONL logger
src/cli/           click CLI entry
src/web/           FastAPI app (reuses the pipeline, serves /api/*)
web/               React + Vite + Tailwind frontend (Home + History pages)
tests/             pytest smoke tests
tools/verify_qa.py verifies each QA path exists in Neo4j before eval
questions/         turkiye_qa.json (100+ Turkish multi-hop questions, ~20 domains)
data/raw/          you extract the Wikidata5M archives here
data/processed/    filtered Türkiye subgraph (produced by extract-turkiye)
logs/              run logs + eval CSV/JSON outputs
```

## Setup

### 1. Python dependencies

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 2. Neo4j

Install Neo4j Desktop (https://neo4j.com/download/) or start a local Neo4j 5.x
server. Create a database, set a password, start it on the default
`bolt://localhost:7687`.

### 3. Env

```bash
cp .env.example .env
# edit .env — set NEO4J_PASSWORD and GROQ_API_KEY
```

### 4. Dataset

Place the two archives (already in `../project dataset/`) and extract:

```bash
mkdir -p data/raw
tar -xzf "../project dataset/wikidata5m_kg.tar.gz" -C data/raw
tar -xzf "../project dataset/wikidata5m_raw_data.tar.gz" -C data/raw
# data/raw/ should now contain:
#   wikidata5m_kg.jsonl
#   wikidata5m_all_triplet.txt
#   wikidata5m_entity.txt
#   wikidata5m_relation.txt
#   wikidata5m_text.txt
```

## One-time data pipeline

```bash
# 1. Filter Wikidata5M to a Türkiye-reachable subgraph.
#    Writes data/processed/ artifacts + stats.json. Takes minutes on first run.
python -m src.cli extract-turkiye

# 2. Load the filtered subgraph into Neo4j.
python -m src.cli load-neo4j

# 3. Sanity checks.
python -m src.cli check-neo4j
python -m src.cli stats
```

## Usage

```bash
# Single question (CLI)
python -m src.cli ask "Galatasaray'ın teknik direktörünün doğum yeri neresidir?" \
    --gold "İstanbul" --domain football --difficulty 2-hop

# REPL
python -m src.cli interactive

# Full evaluation across all four pipelines
python -m src.cli eval
# CSV + summary JSON written under logs/eval_<timestamp>.*

# Verify each QA reasoning path exists in Neo4j (assignment §10.1 rule).
python -m tools.verify_qa
```

### Swap the LLM: Groq → Ollama

The entire pipeline only depends on the `LLMClient` ABC. To switch:

```bash
# make sure `ollama serve` is running and you've pulled a model:
ollama pull llama3.1

# flip the provider
LLM_PROVIDER=ollama LLM_MODEL=llama3.1 python -m src.cli ask "..."
```

No code changes required — every LLM call goes through `src/llm/factory.py`.

## What the console prints for each question

```
── Question TR_017 (3-hop, football) ──────────────────────
Q:    Galatasaray'ın teknik direktörünün doğum yeri neresidir?
Gold: İstanbul
Reasoning path: Galatasaray S.K. → head coach → Okan Buruk → place of birth → İstanbul
── Seed entities (k=3) ────
  Q207058  Galatasaray S.K.   score=0.91  bm25=0.88  embed=0.95  aliases=GS
  ...
── Spreading activation ──
  Round 1  frontier=3  candidates=47  selected=4
    Galatasaray S.K. --[head coach]--> Okan Buruk  (Q79773)
    ...
  Round 2  ...
  ╭─ KG summary ────────────╮
  │ Galatasaray'ın teknik   │
  │ direktörü Okan Buruk... │
  ╰─────────────────────────╯
── Retrieval ──
  Original query   → 3 passages
  Expanded query   → 3 passages  (5 after dedup)
── Answer ──
  System: İstanbul
  Gold:   İstanbul   ✓
  EM=1.00  F1=1.00  Acc=1.00  Retrieval-Recall=1.00
```

Every displayed field is backed by a trace dataclass in `src/trace/models.py`
and is serialized via `to_dict()` into the run log.

## Tests

```bash
python -m pytest tests/ -q
```

Covers: LLM factory contract, metric normalization (Turkish-aware), trace
serialization round-trip, spreading-activation state machine (with fake
neo4j + fake LLM).

## Architecture guarantees

- `RAGResult.to_dict()` produces a fully JSON-serializable trace; the FastAPI
  `POST /ask` route returns it unchanged.
- `src/trace/console.py` is the **only** module that imports `rich` — the
  business logic has zero CLI coupling, which is what lets the same pipeline
  drive both the CLI and the web UI.
- `src/kg/turkey_extractor.py` produces `stats.json` (entity counts, top
  relations, domain histogram, sample triplets) — read directly by the web
  Overview section.
- Run logs in `logs/{success,failure}/*.jsonl` are the source of truth for
  the Recent Runs and Evaluation tabs; `RunLogger.iter_attempts()` is the
  single reader.
- Pipeline factory dispatch in `src/web/app.py::get_pipeline()` shares one
  cached LLM / retriever / Neo4j / seed-finder across all four pipelines, so
  the web server doesn't pay the load cost more than once.

## Assignment mapping

| Assignment section | Implementation |
|---|---|
| Phase 1 — Dataset exploration, §2 | `src/kg/turkey_extractor.py` + `stats.json` |
| Phase 2 — Domain selection, §3 | covered by `stats.json` + README notes |
| Phase 3 — Multi-hop questions, §4 | `questions/turkiye_qa.json` + `tools/verify_qa.py` + web Question Verifier |
| Phase 4 — KG-Infused RAG, §5 | `src/rag/kg_infused.py` + Modules 1-3 sub-modules |
| Phase 5 — Experiments, §6 | All four pipelines (`kg_infused`, `vanilla`, `vanilla_qe`, `no_retrieval`) selectable via the web dropdown or CLI; `src/eval/evaluator.py` aggregates per-pipeline metrics |
| Phase 6 — Case study, §7 | run logs → Recent Runs view with Failure-Reason classification (Timeout / DB Down / KG Error / No Info / …) |

## License / credits

Dataset: Wikidata5M-KG (MIT). Paper: Wu et al. 2025, *KG-Infused RAG*
(arXiv:2506.09542).
