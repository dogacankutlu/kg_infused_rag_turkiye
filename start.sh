#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────
#  KG-Infused RAG — Türkiye Domain · Unified Launcher
# ──────────────────────────────────────────────────────────────────────
#  Brings the whole dev stack up in one shot:
#    • Neo4j  — must be started in Neo4j Desktop (we only check it)
#    • Ollama — auto-started in the background if LLM_PROVIDER=ollama
#    • FastAPI backend on http://127.0.0.1:8000
#    • Vite frontend  on http://localhost:5173
#    • Browser tab    — opens automatically once Vite is ready
#
#  Compatible with the system bash (/bin/bash 3.2) on stock macOS — does
#  NOT use bash-4 features like negative array subscripts or assoc arrays.
#
#  Usage:
#      ./start.sh                # full stack, auto-open browser
#      ./start.sh --no-open      # skip the browser tab
#      ./start.sh --no-tail      # detach (servers stay running, prompt returns)
#
#  Stop everything: Ctrl-C in this terminal.
# ──────────────────────────────────────────────────────────────────────

# Note: NO `set -u` / `set -e` here. We *want* to keep going past minor
# failures (e.g. lsof missing) and report problems instead of dying silent.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || { echo "✗ cannot cd to $ROOT"; exit 1; }

LOG_DIR="$ROOT/logs/runtime"
mkdir -p "$LOG_DIR"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
OLLAMA_LOG="$LOG_DIR/ollama.log"

OPEN_BROWSER=1
NO_TAIL=0
for arg in "$@"; do
  case "$arg" in
    --no-open) OPEN_BROWSER=0 ;;
    --no-tail) NO_TAIL=1 ;;
    --open)    OPEN_BROWSER=1 ;;  # back-compat
    -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
  esac
done

# ── colors ────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'; C_RST=$'\033[0m'
  C_ORANGE=$'\033[38;5;208m'; C_GREEN=$'\033[32m'; C_RED=$'\033[31m'
  C_YELLOW=$'\033[33m'
else
  C_BOLD=""; C_DIM=""; C_RST=""; C_ORANGE=""; C_GREEN=""; C_RED=""; C_YELLOW=""
fi
hdr()  { printf "${C_ORANGE}${C_BOLD}%s${C_RST}\n" "$*"; }
ok()   { printf "${C_GREEN}✓${C_RST} %s\n" "$*"; }
warn() { printf "${C_YELLOW}!${C_RST} %s\n" "$*"; }
err()  { printf "${C_RED}✗${C_RST} %s\n" "$*"; }

# Track child pids without bash-4 syntax. We append into a string and
# split on whitespace at cleanup time.
CHILD_PIDS=""
add_pid() { CHILD_PIDS="$CHILD_PIDS $1"; }

cleanup() {
  echo
  hdr "shutting down…"
  for pid in $CHILD_PIDS; do
    kill "$pid" 2>/dev/null
  done
  sleep 1
  for pid in $CHILD_PIDS; do
    kill -9 "$pid" 2>/dev/null
  done
  ok "all processes stopped"
  exit 0
}
trap cleanup INT TERM

# ── port helpers ──────────────────────────────────────────────────────
port_in_use() {
  # Returns 0 if something is LISTENing on the given TCP port.
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  else
    nc -z 127.0.0.1 "$1" >/dev/null 2>&1
  fi
}

wait_for_url() {
  # wait_for_url <url> <timeout-seconds>
  local url="$1"; local max="$2"; local i=0
  while [ "$i" -lt "$max" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then return 0; fi
    sleep 1; i=$((i+1))
  done
  return 1
}

hdr "════════════════════════════════════════════════════════════════"
hdr "  KG-Infused RAG · Türkiye  —  unified launcher"
hdr "════════════════════════════════════════════════════════════════"
printf "${C_DIM}working dir: %s${C_RST}\n" "$ROOT"
printf "${C_DIM}bash:        %s${C_RST}\n\n" "$BASH_VERSION"

# ── 1. Neo4j ──────────────────────────────────────────────────────────
if port_in_use 7687; then
  ok "Neo4j is listening on bolt://localhost:7687"
else
  warn "Neo4j is NOT running on :7687 — open Neo4j Desktop and START 'turkiye-kg'"
  warn "   (the backend will boot anyway, but /api/ask calls will fail until then)"
fi

# ── 2. Python venv ────────────────────────────────────────────────────
if [ ! -f "$ROOT/.venv/bin/activate" ]; then
  err "no .venv at $ROOT/.venv"
  err "  run: python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
  echo; read -r -p "press Return to close…" _; exit 1
fi
# shellcheck disable=SC1091
source "$ROOT/.venv/bin/activate"
ok "Python venv activated  ($(python --version 2>&1))"

# Verify uvicorn is actually installed — otherwise `serve` will silent-fail.
if ! python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  err "fastapi / uvicorn not installed in the venv"
  err "  run: pip install -r requirements.txt"
  echo; read -r -p "press Return to close…" _; exit 1
fi

# ── 3. Frontend deps ──────────────────────────────────────────────────
if [ ! -d "$ROOT/web/node_modules" ]; then
  warn "web/node_modules missing — running 'npm install' (one-time, ~30s)…"
  ( cd "$ROOT/web" && npm install ) || { err "npm install failed"; exit 1; }
fi
ok "Frontend dependencies present"

# ── 4. Ollama (only if provider is ollama) ────────────────────────────
LLM_PROVIDER_VAL="$(grep -E '^LLM_PROVIDER=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"' | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
[ -z "$LLM_PROVIDER_VAL" ] && LLM_PROVIDER_VAL="${LLM_PROVIDER:-groq}"

if [ "$LLM_PROVIDER_VAL" = "ollama" ]; then
  if port_in_use 11434; then
    ok "Ollama already running on :11434"
  elif command -v ollama >/dev/null 2>&1; then
    hdr "starting Ollama  →  http://127.0.0.1:11434"
    ( ollama serve >"$OLLAMA_LOG" 2>&1 ) &
    add_pid $!
    if wait_for_url "http://127.0.0.1:11434/api/tags" 15; then
      ok "Ollama is up"
    else
      warn "Ollama did not respond within 15s — check $OLLAMA_LOG"
    fi
  else
    warn "LLM_PROVIDER=ollama but the 'ollama' CLI is not installed."
    warn "   install from https://ollama.com — or set LLM_PROVIDER=groq in .env"
  fi
else
  ok "LLM provider: $LLM_PROVIDER_VAL  (you can hot-swap to Qwen from the UI)"
fi

# ── 5. Backend ────────────────────────────────────────────────────────
if port_in_use 8000; then
  warn "port 8000 already in use — assuming an existing backend; not relaunching"
  BACKEND_PID=""
else
  hdr "starting backend  →  http://127.0.0.1:8000"
  ( python -m src.cli serve --reload >"$BACKEND_LOG" 2>&1 ) &
  BACKEND_PID=$!
  add_pid "$BACKEND_PID"
  printf "  pid=%s  log=%s\n" "$BACKEND_PID" "$BACKEND_LOG"
fi

# ── 6. Frontend ───────────────────────────────────────────────────────
if port_in_use 5173; then
  warn "port 5173 already in use — assuming an existing frontend; not relaunching"
  FRONTEND_PID=""
else
  hdr "starting frontend →  http://localhost:5173"
  ( cd "$ROOT/web" && npm run dev >"$FRONTEND_LOG" 2>&1 ) &
  FRONTEND_PID=$!
  add_pid "$FRONTEND_PID"
  printf "  pid=%s  log=%s\n" "$FRONTEND_PID" "$FRONTEND_LOG"
fi

# ── 7. Health checks ──────────────────────────────────────────────────
echo
hdr "waiting for servers to come up…"

if wait_for_url "http://127.0.0.1:8000/api/health" 30; then
  ok "backend  /api/health responding"
else
  err "backend did NOT come up within 30s — last 30 log lines:"
  echo "${C_DIM}────────── $BACKEND_LOG ──────────${C_RST}"
  tail -30 "$BACKEND_LOG" 2>/dev/null
  echo "${C_DIM}─────────────────────────────────${C_RST}"
fi

if wait_for_url "http://localhost:5173" 30; then
  ok "frontend ready on http://localhost:5173"
else
  err "frontend did NOT come up within 30s — last 30 log lines:"
  echo "${C_DIM}────────── $FRONTEND_LOG ──────────${C_RST}"
  tail -30 "$FRONTEND_LOG" 2>/dev/null
  echo "${C_DIM}─────────────────────────────────${C_RST}"
fi

# ── 8. Open browser ───────────────────────────────────────────────────
if [ "$OPEN_BROWSER" = "1" ] && command -v open >/dev/null 2>&1; then
  open http://localhost:5173 >/dev/null 2>&1 && ok "opened browser tab"
fi

echo
hdr "─── ready ────────────────────────────────────────────────────────"
echo "  app:      http://localhost:5173"
echo "  api:      http://127.0.0.1:8000/api/health"
[ "$LLM_PROVIDER_VAL" = "ollama" ] && echo "  ollama:   http://127.0.0.1:11434"
echo "  logs:     $LOG_DIR/{backend,frontend,ollama}.log"
hdr "──────────────────────────────────────────────────────────────────"

# ── 9. Tail or detach ─────────────────────────────────────────────────
if [ "$NO_TAIL" = "1" ]; then
  warn "running in background — Ctrl-C in this shell will NOT stop it."
  echo "  stop with:  pkill -f 'src.cli serve' ; pkill -f 'vite' ; pkill -x ollama"
  exit 0
fi

hdr "tailing logs (Ctrl-C to stop everything)"
tail -F "$BACKEND_LOG" "$FRONTEND_LOG" 2>/dev/null &
add_pid $!

# Block until Ctrl-C; trap 'cleanup' will do the actual teardown.
wait
