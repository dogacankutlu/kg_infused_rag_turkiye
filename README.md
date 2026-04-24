# KG-Infused RAG — Türkiye Domain

CSE 474 / 5074 Social Network Analysis term project. Implements the KG-Infused
RAG framework (Wu et al., 2025) over Wikidata5M, focused on the Türkiye domain.

## What this implements (Phase 1)

- **KG-Infused RAG** pipeline (only pipeline implemented now):
  1. Seed entity detection (BM25 + multilingual embeddings + alias match)
  2. KG-guided spreading activation (Neo4j traversal + LLM triple selection)
  3. Subgraph summarization
  4. KG-based query expansion + dual-query BM25 retrieval over Wikidata5M descriptions
  5. Passage-note construction → KG-augmented note → final answer
- **CLI-only** interface (rich-powered console output showing every stage)
- **LLM abstraction** — one env var swaps Groq for a local Ollama model
- **Metrics**: Exact Match, token F1, lenient Accuracy, Retrieval Recall
- **Logging**: every successful / failed attempt appended to `logs/{success,failure}/*.jsonl`
- **QA dataset**: 50 Turkish multi-hop questions (30 × 2-hop, 15 × 3-hop, 5 × comparison)

Phase 2 (web UI) is **implemented** — a FastAPI backend (`src/web/app.py`) reuses
the same pipeline, and a React + Vite + Tailwind frontend (`web/`) provides a Home
page (ask + spreading-activation graph + distribution charts) and a History page
(stats, top relations, sample triplets, QA dataset, Cypher catalog, recent runs).
See [`web_quickstart.txt`](./web_quickstart.txt).

## Repo layout

```
config/            settings (pydantic-settings, env-driven)
src/llm/           LLMClient ABC, Groq & Ollama implementations, factory
src/kg/            Neo4j client, extractor, loader, seed finder
src/rag/           KG-Infused pipeline + all sub-modules (Modules 1-3)
src/prompts/       centralized prompt templates
src/trace/         dataclasses with to_dict() + rich console renderer
src/eval/          metrics + evaluator
src/logging_utils/ success/failure JSONL logger
src/cli/           click CLI entry
src/web/           FastAPI app (reuses the pipeline, serves /api/*)
web/               React + Vite + Tailwind frontend (Home + History pages)
tests/             pytest smoke tests
tools/verify_qa.py verifies each QA path exists in Neo4j before eval
questions/         turkiye_qa.json (50 Turkish multi-hop questions)
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

# Full evaluation over all 50 questions
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

## Phase 2 — Web UI (design only, not built)

The Phase-1 architecture is deliberately structured so a web UI is an
additive layer. Key guarantees that Phase-2 will rely on:

- `RAGResult.to_dict()` already produces a fully JSON-serializable trace.
  A FastAPI `POST /ask` route returns it unchanged.
- `src/trace/console.py` is the **only** module that imports `rich`. Delete
  it and nothing breaks — the business logic has no CLI coupling.
- `src/kg/turkey_extractor.py` already produces `stats.json` with entity
  counts, top relations, domain histogram, and sample triplets — the Home
  and History pages read from this file directly.
- Run logs in `logs/{success,failure}/*.jsonl` are the source of truth for
  the History page; `RunLogger.iter_attempts()` already exists.

When we build the web UI, the planned additions are:

- **Backend**: `src/web/app.py` (FastAPI) with endpoints `POST /ask`,
  `GET /history`, `GET /stats`, `GET /domains`, `GET /questions`,
  `GET /queries`. No changes to `src/rag/*`.
- **Frontend**: React + Vite + TypeScript, light-mode Tailwind theme (neutral
  greys, Türkiye-flag-red `#E30A17` for primary actions).
- **Pages**:
  - **Home** (`/`): question input → live streaming trace; seed cards,
    spreading-activation graph (Cytoscape.js), entity distribution bar
    chart (Recharts), answer block with gold comparison.
  - **History** (`/history`): tabs for Statistics Summary (counts, domains),
    Top Relations (bar chart of country/place-of-birth/head-coach/etc.),
    Sample Triplets (searchable raw `<s | r | o>` table), QA Dataset
    (filterable by 2-hop / 3-hop / comparison), Cypher Query Catalog
    (template count, max hops, average retrieval time pulled from run logs).

No Phase-2 code ships in this increment.

## Assignment mapping

| Assignment section | Implementation |
|---|---|
| Phase 1 — Dataset exploration, §2 | `src/kg/turkey_extractor.py` + `stats.json` |
| Phase 2 — Domain selection, §3 | covered by `stats.json` + README notes |
| Phase 3 — Multi-hop questions, §4 | `questions/turkiye_qa.json` + `tools/verify_qa.py` |
| Phase 4 — KG-Infused RAG, §5 | `src/rag/kg_infused.py` + modules |
| Phase 5 — Experiments, §6 | `src/eval/evaluator.py` (baselines Ollama/Groq compare; vanilla RAG pluggable via `RAGPipeline` ABC) |
| Phase 6 — Case study, §7 | run logs → pick successes/failures from `logs/success|failure/*.jsonl` |

## License / credits

Dataset: Wikidata5M-KG (MIT). Paper: Wu et al. 2025, *KG-Infused RAG*
(arXiv:2506.09542).
