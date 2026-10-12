#!/bin/bash
#
# Tells a session, on its first turn, what the objectives in this repository are
# doing - so a person who comes back after a few hours is told rather than
# having to ask.
#
# This is the one thing CLAUDE.md structurally cannot do. CLAUDE.md is always
# loaded and says a session is the driver; it cannot say what is currently
# waiting, because it is a static file. This runs, so it can.
#
# Deliberately not `set -e`, and it always exits 0: this reports, it never
# gates. A session that cannot start because a briefing failed is worse than
# the briefing being missing, and the briefing is a convenience - the driver
# role itself comes from CLAUDE.md and survives this script doing nothing.
#
# Silence is a valid outcome and the common one. Nothing open, no credentials,
# no network, a repository not using objectives at all: print nothing and get
# out of the way.

set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "$0")/../.." && pwd)}" 2>/dev/null || exit 0

repo="$(git config --get remote.origin.url 2>/dev/null \
  | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
[ -n "$repo" ] || exit 0

# Three ways to reach the API and they are not interchangeable across
# environments: a desktop session usually has `gh` authenticated, a cloud
# session usually has a token in the environment and no `gh` at all, and some
# sessions have neither. Try in that order, give up quietly on the third.
api() {
  local path="$1"
  if command -v gh >/dev/null 2>&1; then
    gh api --silent --method GET "$path" 2>/dev/null && return 0
    gh api --method GET "$path" 2>/dev/null && return 0
  fi
  local tok="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
  if [ -n "$tok" ] && command -v curl >/dev/null 2>&1; then
    curl -sS --max-time 10 -H "Authorization: Bearer $tok" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/$path" 2>/dev/null && return 0
  fi
  return 1
}

# Labels this release needs, against the labels this repository has.
#
# A release that adds one ships the *name* in files and cannot create the label
# itself: only `bootstrap` does that, it is workflow_dispatch only, and only a
# person can run it. So a repository picks up a release, its roles start naming
# a label nothing can apply, and the failure is silent in the worst way - the
# run that should have started simply does not, and nothing anywhere says why.
#
# This is the only place that can say so before it bites, because it is the
# only thing that runs when the person who can fix it turns up. It goes before
# the objectives fetch on purpose: the riskiest moment is just after an update
# and before any objective exists, and behind that gate this would stay silent
# in exactly that case.
declared="$(python3 <<'DECLARED' 2>/dev/null
import json
try:
    print("\n".join(json.load(open(".claude/agent-factory.json")).get("labels") or []))
except Exception:
    pass
DECLARED
)"
if [ -n "$declared" ]; then
  have="$(api "repos/$repo/labels?per_page=100")" || have=""
  [ -n "$have" ] && python3 - "$have" "$declared" <<'MISSING' 2>/dev/null
import json, sys

try:
    have = {l["name"] for l in json.loads(sys.argv[1]) if isinstance(l, dict)}
except Exception:
    sys.exit(0)

missing = [name for name in sys.argv[2].split("\n") if name and name not in have]
if not missing:
    sys.exit(0)

# Only ever one direction. A label this repository has and the release no
# longer names is harmless, and reporting it would spend the reader's trust on
# something they do not have to act on.
print(f"{len(missing)} label(s) this release needs are missing from this repository:")
for name in missing:
    print(f"  {name}")
print("Run `bootstrap` from the Actions tab. It is idempotent and creates whichever are absent.")
print("Until then, work that needs one of these does not start and nothing reports it.")
print()
MISSING
fi

objectives="$(api "repos/$repo/issues?labels=objective&state=open&per_page=20")" || exit 0
[ -n "$objectives" ] || exit 0

python3 - "$objectives" <<'PY' 2>/dev/null || exit 0
import json, sys

try:
    issues = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
if not isinstance(issues, list) or not issues:
    sys.exit(0)

# A pull request is an issue to this endpoint. Objectives are not pull
# requests, so anything carrying that key is not one of ours.
issues = [i for i in issues if isinstance(i, dict) and "pull_request" not in i]
if not issues:
    sys.exit(0)

waiting, running = [], []
for i in issues:
    labels = {l.get("name") for l in i.get("labels") or []}
    line = f"  #{i.get('number')} {i.get('title')}"
    policy = "green" if "Merge policy: green" in (i.get("body") or "") else None
    if "needs-human" in labels:
        waiting.append(line + "  - waiting on you")
    else:
        running.append(line + ("  - merge policy: green" if policy else ""))

print("Objectives open in this repository:")
for line in waiting + running:
    print(line)
if waiting:
    print("Lead with the ones waiting on a person; the parent issue carries the detail.")
print("See .claude/skills/driving-an-objective/ before acting on any of them.")
PY

exit 0
