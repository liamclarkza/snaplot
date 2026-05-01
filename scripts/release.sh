#!/usr/bin/env bash
# Cut a new snaplot release locally.
#
#   scripts/release.sh patch
#   scripts/release.sh minor
#   scripts/release.sh major
#   scripts/release.sh 1.2.3
#
# Bumps packages/snaplot/package.json, promotes the [Unreleased] section
# of CHANGELOG.md under a dated [X.Y.Z] header (reseeding an empty
# Unreleased on top), commits, tags. Does NOT push — do that yourself
# when you're ready:
#
#   git push --follow-tags
#
# The tag push triggers .github/workflows/publish.yml (quality gates →
# npm publish → GitHub Release).

set -euo pipefail

bump=${1:-}
if [[ -z "$bump" ]]; then
  echo "usage: $0 <patch|minor|major|X.Y.Z>" >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel)
cd "$root"

# --- Safety checks ---------------------------------------------------------

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "error: working tree not clean. commit or stash first." >&2
  exit 1
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" != "main" ]]; then
  echo "error: releases must be cut from 'main' (on '$branch')." >&2
  exit 1
fi

# --- Derive new version ----------------------------------------------------

pkg=packages/snaplot/package.json
current=$(node -p "require('./$pkg').version")

case "$bump" in
  patch|minor|major)
    new=$(node -e "
      const [a,b,c]='$current'.split('.').map(Number);
      const k='$bump';
      const v = k==='major' ? [a+1,0,0] : k==='minor' ? [a,b+1,0] : [a,b,c+1];
      console.log(v.join('.'));
    ")
    ;;
  *)
    new="$bump"
    ;;
esac

if ! [[ "$new" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "error: '$new' is not a valid semver version." >&2
  exit 1
fi

if git rev-parse "v$new" >/dev/null 2>&1; then
  echo "error: tag v$new already exists." >&2
  exit 1
fi

# --- Verify CHANGELOG has an Unreleased section ----------------------------

if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  echo "error: CHANGELOG.md missing '## [Unreleased]' header." >&2
  exit 1
fi

# Warn (don't fail) if Unreleased looks empty — solo project, small releases
# sometimes land under just a docs-only umbrella.
unreleased_body=$(awk '
  /^## \[Unreleased\]/ { found=1; next }
  /^## \[/ && found { exit }
  found && NF > 0 { print }
' CHANGELOG.md)
if [[ -z "$unreleased_body" ]]; then
  echo "warning: [Unreleased] section appears empty." >&2
  read -r -p "continue anyway? [y/N] " answer
  [[ "$answer" != "y" && "$answer" != "Y" ]] && exit 1
fi

# --- Apply changes ---------------------------------------------------------

echo "Releasing v$new (was v$current)…"

# Bump package.json
node -e "
  const fs=require('fs');
  const p=require('./$pkg');
  p.version='$new';
  fs.writeFileSync('$pkg', JSON.stringify(p,null,2)+'\n');
"

# Keep the workspace lockfile in sync with the package version committed
# for the release. `--ignore-scripts` avoids local hook side effects.
npm install --package-lock-only --ignore-scripts
npm ci --ignore-scripts --dry-run

# Roll CHANGELOG — insert a new dated header *after* the Unreleased
# header so previous Unreleased content sits under the new version
# and Unreleased becomes empty for the next cycle.
today=$(date +%Y-%m-%d)
node -e "
  const fs=require('fs');
  let s=fs.readFileSync('CHANGELOG.md','utf8');
  const marker='## [Unreleased]';
  if (!s.includes(marker)) { console.error('missing Unreleased'); process.exit(1); }
  s = s.replace(marker, marker + '\n\n## [$new] - $today');
  fs.writeFileSync('CHANGELOG.md', s);
"

git add "$pkg" package-lock.json CHANGELOG.md
git commit -m "chore: release v$new"
git tag -a "v$new" -m "v$new"

cat <<EOF

✓ Prepared v$new locally.

Diff: $(git log --oneline -1)
Tag:  $(git tag -l "v$new")

To ship, push the commit and tag together:

    git push --follow-tags

The tag push triggers: quality gates → npm publish → GitHub Release.
EOF
