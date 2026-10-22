#!/usr/bin/env bash
# STAGE FDP client E2E tests - one entry point.
#
#   ./run.sh [suite] [options] [-- extra Playwright arguments]
#
# Suites:  all (default) | smoke | root | flow | admin | excel | cleanup
# Options:
#   --url URL           client URL               (FDP_UI_URL,  default http://localhost:8088)
#   --api URL           FDP API / persistent URL (FDP_API_URL, default <url>/stage-fdp-api)
#   --user EMAIL        admin account            (FDP_USER,    default admin@example.com)
#   --excel FILE        workbook/CSV for the excel suite (FDP_EXCEL_FILE)
#   --excel-mode MODE   standard | kora | nfbc   (FDP_EXCEL_MODE, default standard)
#   --excel-entity E    dataset | csvw           (FDP_EXCEL_ENTITY, default dataset)
#   --keep              keep what the run creates (FDP_CLEANUP=0)
#   --no-root-save      do not save the root metadata (FDP_ROOT_SAVE=0)
#   --headed            show the browser;  --slow MS  slow every action down
#   --report            open the HTML report afterwards
#
# The password comes from FDP_PASSWORD (environment or e2e/.env); otherwise it is asked for.
# Examples:
#   ./run.sh                      # everything against the local stage-fdp-ext stack
#   ./run.sh flow --headed        # watch the metadata lifecycle
#   ./run.sh excel --excel ~/Downloads/NFBC/NFBC1966_standardized.xlsx
#   ./run.sh smoke --url https://kroniq.srdc.com.tr/stage-fdp --api https://kroniq.srdc.com.tr/stage-fdp-api

set -euo pipefail
cd "$(dirname "$0")"

[ -f .env ] && { set -a; . ./.env; set +a; }

suite="all"
open_report=0
extra=()
if [ $# -gt 0 ] && [[ "$1" != -* ]]; then suite="$1"; shift; fi
while [ $# -gt 0 ]; do
  case "$1" in
    --url) export FDP_UI_URL="$2"; shift 2 ;;
    --api) export FDP_API_URL="$2"; shift 2 ;;
    --user) export FDP_USER="$2"; shift 2 ;;
    --excel) export FDP_EXCEL_FILE="$2"; shift 2 ;;
    --excel-mode) export FDP_EXCEL_MODE="$2"; shift 2 ;;
    --excel-entity) export FDP_EXCEL_ENTITY="$2"; shift 2 ;;
    --keep) export FDP_CLEANUP=0; shift ;;
    --no-root-save) export FDP_ROOT_SAVE=0; shift ;;
    --headed) export HEADED=1; shift ;;
    --slow) export SLOWMO="$2"; shift 2 ;;
    --report) open_report=1; shift ;;
    --) shift; extra+=("$@"); break ;;
    *) extra+=("$1"); shift ;;
  esac
done

# --- Node: PATH first, then the copies IntelliJ / nvm / the Node installer leave behind ------
find_node() {
  if command -v node >/dev/null 2>&1; then dirname "$(command -v node)"; return; fi
  local candidates
  candidates=$(find "$HOME/AppData/Roaming/JetBrains" "$HOME/AppData/Local/JetBrains" "$HOME/.nvm" \
      "$HOME/AppData/Roaming/nvm" "/c/Program Files/nodejs" -maxdepth 5 \( -name node.exe -o -name node \) -type f 2>/dev/null \
    | sort -V | tail -1)
  [ -n "$candidates" ] && dirname "$candidates"
}
NODE_DIR="$(find_node || true)"
if [ -z "$NODE_DIR" ]; then
  echo "run.sh: no Node.js found (PATH, IntelliJ, nvm, Program Files). Install Node 18+ or set PATH." >&2
  exit 1
fi
export PATH="$NODE_DIR:$PATH"
echo "Node $(node -v) from $NODE_DIR"

# Git Bash paths (/c/Users/...) must be handed to node.exe as Windows paths (C:\Users\...).
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# npm: the npm-cli.js shipped next to that node (IntelliJ, installer, nvm), else any npm on PATH.
npm_install() {
  local cli
  for cli in "$NODE_DIR/node_modules/npm/bin/npm-cli.js" "$(dirname "$NODE_DIR")/lib/node_modules/npm/bin/npm-cli.js"; do
    if [ -f "$cli" ]; then node "$(native "$cli")" install --no-audit --no-fund; return; fi
  done
  if [ -f "$NODE_DIR/npm.cmd" ]; then cmd //c "$(native "$NODE_DIR/npm.cmd")" install --no-audit --no-fund; return; fi
  if command -v npm >/dev/null 2>&1; then npm install --no-audit --no-fund; return; fi
  echo "run.sh: found node in $NODE_DIR but no npm next to it." >&2
  echo "        Install Node.js (it includes npm), or run 'npm install' in this folder once from IntelliJ's terminal." >&2
  exit 1
}

# --- Dependencies and browser (first run only) ----------------------------------------------
if [ ! -f node_modules/@playwright/test/cli.js ]; then
  echo "Installing test dependencies..."
  npm_install
fi
PW=(node node_modules/@playwright/test/cli.js)
"${PW[@]}" install chromium >/dev/null

# --- Credentials ------------------------------------------------------------------------------
export FDP_USER="${FDP_USER:-admin@example.com}"
if [ -z "${FDP_PASSWORD:-}" ]; then
  read -rsp "FDP password for $FDP_USER: " FDP_PASSWORD; echo
  export FDP_PASSWORD
fi

# --- Run --------------------------------------------------------------------------------------
case "$suite" in
  all) projects=() ;;
  smoke|root|flow|admin|excel|cleanup) projects=(--project="$suite") ;;
  *) echo "run.sh: unknown suite '$suite' (all | smoke | root | flow | admin | excel | cleanup)" >&2; exit 2 ;;
esac

echo "Suite: $suite   UI: ${FDP_UI_URL:-http://localhost:8088}   API: ${FDP_API_URL:-<ui>/stage-fdp-api}   user: $FDP_USER"
# Everything printed below also goes to reports/logs/run-<time>.log (and reports/latest.log);
# reports/summary.md lists each test and, per failure, the error and the browser log.
export FDP_LOG_STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p reports/logs
LOG="reports/logs/run-$FDP_LOG_STAMP.log"
{
  echo "run.sh $suite ${extra[*]:-}"
  echo "date: $(date)   node: $(node -v)   UI: ${FDP_UI_URL:-http://localhost:8088}   API: ${FDP_API_URL:-<ui>/stage-fdp-api}   user: $FDP_USER"
} > "$LOG"

set +e
"${PW[@]}" test "${projects[@]}" "${extra[@]}" 2>&1 | tee -a "$LOG"
status=${PIPESTATUS[0]}
set -e
sed -i 's/\x1b\[[0-9;]*[A-Za-z]//g' "$LOG"
cp "$LOG" reports/latest.log

echo
echo "Log:     $LOG (also reports/latest.log)"
echo "Summary: reports/summary.md"
[ "$open_report" = 1 ] && "${PW[@]}" show-report reports/html
[ "$status" = 0 ] || echo "Some tests failed - see reports/summary.md, or ./run.sh --report for traces and videos."
exit $status
