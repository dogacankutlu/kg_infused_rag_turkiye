#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
#  KG-Infused RAG — Türkiye Domain · Unified Launcher
# ──────────────────────────────────────────────────────────────────────
#  Brings up the entire dev environment in one shot:
#    1. Reminds you to start Neo4j Desktop  (we don't auto-start that —
#       Desktop databases require GUI interaction)
#    2. Activates the Python venv and starts the FastAPI backend
#    3. Starts the Vite frontend dev server
#    4. Tails both logs in this terminal until you Ctrl-C
#
#  Both child processes share this script's process group so a single
#  Ctrl-C tears everything down cleanly.  Logs are written to
#  ./logs/runtime/{backend,frontend}.log so you can re-read them later.
#
#  Usage:
#      ./start.sh                 # foreground, Ctrl-C to stop
#      ./start.sh --no-tail       # start in background, return prompt
#      ./start.sh --open          # also open http://localhost:5173
#
#  Double-click launcher: see start.command (macOS) — it just calls this.
# ──────────────────────────────────────────────────────────────────────

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/logs/runtime"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"

NO_TAIL=0
OPEN_BROWSER=0
for arg in "$@"; do
  case "$arg" in
    --no-tail) NO_TAIL=1 ;;
    --open)    OPEN_BROWSER=1 ;;
    -h|--help)
      sed -n '2,22p' "$0"
      exit 0
      ;;
  esac
done

# ── pretty colors ──
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
  C_ORANGE=$'\033[38;5;208m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
  C_BLUE=$'\033[34m'; C_YELLOW=$'\033[33m'
else
  C_BOLD=""; C_DIM=""; C_RST=""; C_ORANGE=""; C_GREEN=""; C_RED=""; C_BLUE=""; C_YELLOW=""
fi
say()  { printf "%s\n" "$*"; }
hdr()  { printf "${C_ORANGE}${C_BOLD}%s${C_RST}\n" "$*"; }
ok()   { printf "${C_GREEN}✓${C_RST} %s\n" "$*"; }
warn() { printf "${C_YELLOW}!${C_RST} %s\n" "$*"; }
err()  { printf "${C_RED}✗${C_RST} %s\n" "$*"; }

hdr "════════════════════════════════════════════════════════════════"
hdr "  KG-Infused RAG · Türkiye  —  unified launcher"
hdr "════════════════════════════════════════════════════════════════"

# ── 1. Neo4j reminder ──
if command -v lsof >/dev/null 2>&1 && lsof -iTCP:7687 -sTCP:LISTEN >/dev/null 2>&1; then
  ok "Neo4j is listening on bolt://localhost:7687"
else
  warn "Neo4j is NOT listening on bolt://localhost:7687."
  warn "Open Neo4j Desktop and START the 'turkiye-kg' database before /api/ask calls."
fi

# ── 2. Python venv check ──
if [ -d "$ROOT/.venv" ]; then
  # shellcheck disable=SC1091
  source "$ROOT/.venv/bin/activate"
  ok "Python venv activated  ($(python --version 2>&1))"
else
  err "No .venv found at $ROOT/.venv — run 'python3 -m venv .venv && pip install -r requirements.txt' first."
  exit 1
fi

# ── 3. Frontend deps check ──
if [ ! -d "$ROOT/web/node_modules" ]; then
  warn "web/node_modules missing — running 'npm install' (one-time, ~30s)…"
  ( cd "$ROOT/web" && npm install ) || { err "npm install failed"; exit 1; }
fi
ok "Frontend dependencies present"

# ── 4. Trap cleanup ──
PIDS=()
cleanup() {
  echo
  hdr "shutting down…"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  # second pass — give them a moment, then SIGKILL stragglers
  sleep 1
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
  ok "all processes stopped"
  exit 0
}
trap cleanup INT TERM

# ── 5. Backend ──
hdr "starting backend  →  http://127.0.0.1:8000"
( python -m src.cli serve --reload >"$BACKEND_LOG" 2>&1 ) &
PIDS+=($!)
say "  pid=${PIDS[-1]}  log=$BACKEND_LOG"

# ── 6. Frontend ──
hdr "starting frontend →  http://localhost:5173"
( cd "$ROOT/web" && npm run dev >"$FRONTEND_LOG" 2>&1 ) &
PIDS+=($!)
say "  pid=${PIDS[-1]}  log=$FRONTEND_LOG"

# ── 7. Optional: open browser when frontend is ready ──
if [ "$OPEN_BROWSER" = "1" ]; then
  (
    for _ in $(seq 1 30); do
      if curl -fsS http://localhost:5173 >/dev/null 2>&1; then
        if command -v open >/dev/null 2>&1; then open http://localhost:5173; fi
        break
      fi
      sleep 1
    done
  ) &
fi

# ── 8. Tail or detach ──
if [ "$NO_TAIL" = "1" ]; then
  hdr "running in background — Ctrl-C in this shell will NOT stop it."
  say "  stop with:  pkill -f 'src.cli serve' ; pkill -f 'vite'"
  exit 0
fi

hdr "tailing logs (Ctrl-C to stop everything)"
say "${C_DIM}── backend ─────────────────────────────────────${C_RST}"
say "${C_DIM}── frontend ────────────────────────────────────${C_RST}"
tail -F "$BACKEND_LOG" "$FRONTEND_LOG" &
PIDS+=($!)

wait
