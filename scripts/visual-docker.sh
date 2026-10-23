#!/usr/bin/env bash
# Optional Linux path for the visual gate (plan §11.3 G10). Agents run `npm run test:visual` in
# local macOS Chromium (EXECUTION.md rule 1) and never need this script. CI and the maintainer's
# `update-snapshots` workflow use it to compare or refresh the `-linux` baselines in the pinned
# Playwright image, without touching the host's darwin node_modules.
#
#   scripts/visual-docker.sh [--against <ref>] [--update] [--platform linux/amd64|linux/arm64]
#                            [-- <args for npm run test:visual>]
#
# It copies the working tree (tracked and untracked files, never node_modules or dist) and, for
# --against, `git archive <ref>` into the container, runs `npm ci` and
# `node packages/snaplot/test/visual/run.mjs` there, and copies back
# packages/snaplot/test-results/visual (report, meta, contact sheet, diff images, the reference
# copy) and, with --update, the `-linux` screenshots. Default platform linux/amd64 (GitHub's x86_64 runners);
# if that is unavailable or too slow, use --platform linux/arm64 and keep CI's visual job advisory.
set -euo pipefail

IMAGE="mcr.microsoft.com/playwright:v1.61.1-noble"
PLATFORM="linux/amd64"
AGAINST=""
UPDATE=0
PASS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --against) AGAINST="$2"; shift 2 ;;
    --against=*) AGAINST="${1#--against=}"; shift ;;
    --update) UPDATE=1; shift ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --) shift; PASS+=("$@"); break ;;
    *) PASS+=("$1"); shift ;;
  esac
done

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
docker info >/dev/null 2>&1 || { echo "visual-docker: docker is not available" >&2; exit 2; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/snaplot-visual.XXXXXX")"
trap 'rm -rf "$WORK"' EXIT
git ls-files -co --exclude-standard -z | tar --null -T - -cf "$WORK/head.tar"
ARGS=()
if [[ -n "$AGAINST" ]]; then
  SHA="$(git rev-parse --verify "${AGAINST}^{commit}")"
  git archive --format=tar "$SHA" >"$WORK/ref.tar"
  ARGS+=(--against-tree /work/ref --against-sha "$SHA")
fi
[[ $UPDATE -eq 1 ]] && ARGS+=(--update)
ARGS+=("${PASS[@]+"${PASS[@]}"}")
printf '%s\n' "${ARGS[@]+"${ARGS[@]}"}" >"$WORK/args"

VOLUME="snaplot-visual-$$"
docker volume create "$VOLUME" >/dev/null
cleanup() { docker volume rm -f "$VOLUME" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

START=$(date +%s)
set +e
docker run --rm --platform "$PLATFORM" --ipc=host \
  -v "$VOLUME:/work" -v "$WORK:/io" -w /work "$IMAGE" bash -euo pipefail -c '
    mkdir -p head && tar -xf /io/head.tar -C head
    if [[ -f /io/ref.tar ]]; then mkdir -p ref && tar -xf /io/ref.tar -C ref; fi
    cd head
    git init -q && git add -A && git -c user.name=visual -c user.email=visual@localhost commit -qm head
    npm ci --no-audit --no-fund
    mapfile -t ARGS </io/args
    export SNAPLOT_SNAPSHOT_DIR=/work/cache CI=1
    status=0
    node packages/snaplot/test/visual/run.mjs "${ARGS[@]}" || status=$?
    # With --against, run.mjs compared the head against its own copy of the reference in
    # test-results/visual/reference/ (meta.json points there), so the copy comes back with it.
    tar -cf /io/result.tar packages/snaplot/test-results/visual \
      $(cd packages/snaplot && find test/visual/__screenshots__ -name "*-linux.png" 2>/dev/null | sed "s|^|packages/snaplot/|")
    exit $status
  '
STATUS=$?
set -e
echo "visual-docker: $PLATFORM run took $(( $(date +%s) - START ))s, exit $STATUS"

if [[ -f "$WORK/result.tar" ]]; then
  if [[ $UPDATE -eq 1 ]]; then
    tar -xf "$WORK/result.tar" -C "$ROOT"
  else
    tar -xf "$WORK/result.tar" -C "$ROOT" packages/snaplot/test-results/visual
  fi
  echo "visual-docker: results in packages/snaplot/test-results/visual"
fi
exit $STATUS
