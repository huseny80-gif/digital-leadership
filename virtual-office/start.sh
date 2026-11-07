#!/usr/bin/env bash
# Virtual Office — Start Script
# Launches all services: API server, task runner, Lion supervisor, Obsidian reporter
# Usage: ./start.sh [--no-obsidian] [--no-grok]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
mkdir -p "$LOG_DIR"

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; RESET="\033[0m"
info()  { echo -e "${GREEN}[VO]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[VO]${RESET} $*"; }
error() { echo -e "${RED}[VO]${RESET} $*"; }

# ── Flags ─────────────────────────────────────────────────────────────────────
RUN_OBSIDIAN=true
RUN_GROK=true
for arg in "$@"; do
  [[ "$arg" == "--no-obsidian" ]] && RUN_OBSIDIAN=false
  [[ "$arg" == "--no-grok" ]]    && RUN_GROK=false
done

# ── .env ─────────────────────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a; source "$SCRIPT_DIR/.env"; set +a
  info ".env loaded"
else
  warn ".env not found — using defaults. Copy .env.example to .env and fill in values."
fi

export OFFICE_DIR="${OFFICE_DIR:-$SCRIPT_DIR}"

# ── Python check ──────────────────────────────────────────────────────────────
PYTHON="${PYTHON:-python3}"
if ! command -v "$PYTHON" &>/dev/null; then
  error "Python not found. Install Python 3.10+ and try again."
  exit 1
fi

# ── pip dependencies ──────────────────────────────────────────────────────────
info "Checking Python dependencies..."
DEPS=(flask flask-cors anthropic python-dotenv schedule watchdog playwright)
$PYTHON -m pip install --quiet "${DEPS[@]}"
info "Dependencies OK"

# ── Playwright browsers ───────────────────────────────────────────────────────
if $RUN_GROK; then
  if ! $PYTHON -c "from playwright.sync_api import sync_playwright" 2>/dev/null; then
    warn "Playwright not importable — skipping Grok bot"
    RUN_GROK=false
  else
    $PYTHON -m playwright install chromium --quiet 2>/dev/null || \
      warn "Playwright Chromium install failed — Grok bot may not work"
  fi
fi

# ── PID tracking ─────────────────────────────────────────────────────────────
PIDS=()
PID_FILE="$LOG_DIR/virtual_office.pids"
: > "$PID_FILE"

launch() {
  local name="$1"; shift
  local log="$LOG_DIR/${name}.out"
  info "Starting $name..."
  "$PYTHON" "$@" >> "$log" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
  echo "$pid $name" >> "$PID_FILE"
  info "$name PID $pid → $log"
}

# ── Initialise state if missing ───────────────────────────────────────────────
STATE_FILE="$SCRIPT_DIR/state/office_state.json"
if [[ ! -f "$STATE_FILE" ]]; then
  mkdir -p "$SCRIPT_DIR/state"
  $PYTHON "$SCRIPT_DIR/scripts/state_manager.py" --init 2>/dev/null || \
    warn "state_manager --init failed; state may be empty"
fi

# ── Launch services ───────────────────────────────────────────────────────────
launch "state_server"      "$SCRIPT_DIR/scripts/state_server.py"
sleep 1   # let Flask bind before other services read it

launch "task_runner"       "$SCRIPT_DIR/scripts/task_runner.py"
launch "lion_supervisor"   "$SCRIPT_DIR/scripts/lion_supervisor.py"

if $RUN_OBSIDIAN; then
  VAULT="${OBSIDIAN_VAULT:-$HOME/ObsidianVault}"
  if [[ -d "$VAULT" ]]; then
    launch "obsidian_reporter" "$SCRIPT_DIR/scripts/obsidian_reporter.py"
  else
    warn "Obsidian vault not found at $VAULT — reporter skipped (set OBSIDIAN_VAULT in .env)"
  fi
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
FRONTEND="$SCRIPT_DIR/frontend/index.html"
if [[ -f "$FRONTEND" ]]; then
  info "Frontend: file://$FRONTEND"
  if command -v open &>/dev/null; then
    open "$FRONTEND"
  elif command -v xdg-open &>/dev/null; then
    xdg-open "$FRONTEND"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
info "  🏢  Virtual Office is running"
info "  API    : http://localhost:5050/api"
info "  State  : $STATE_FILE"
info "  Logs   : $LOG_DIR/"
info "  PIDs   : $PID_FILE"
info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "Press Ctrl+C to stop all services"

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Stopping services..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null && info "  Stopped PID $pid" || true
  done
  rm -f "$PID_FILE"
  info "Virtual Office stopped."
}
trap cleanup EXIT INT TERM

# ── Wait ──────────────────────────────────────────────────────────────────────
wait
