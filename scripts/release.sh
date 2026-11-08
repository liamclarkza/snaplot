#!/usr/bin/env bash
# Cut a new snaplot release locally.
#
#   scripts/release.sh patch | minor | major     (from a release version)
#   scripts/release.sh 1.2.3
#   scripts/release.sh 0.14.0-beta.0             (a prerelease: npm dist-tag `next`)
#   scripts/release.sh --dry-run 0.14.0-beta.0   (print the plan, change nothing)
#
# Bumps packages/snaplot/package.json, promotes the [Unreleased] section of CHANGELOG.md under
# a dated [X.Y.Z] header (reseeding an empty Unreleased on top), syncs the README's pinned
# version (scripts/sync-readme.mjs), commits and tags. It does NOT
# push; do that yourself when you are ready:
#
#   git push --follow-tags
#
# The tag push triggers .github/workflows/publish.yml: the CI gates, the package, size and API
# gates again, then npm publish (`--tag next` and a GitHub prerelease for X.Y.Z-beta.N,
# `latest` otherwise) and a GitHub Release.

set -euo pipefail

dry_run=0
bump=''
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=1 ;;
    -*)
      echo "error: unknown option '$arg'" >&2
      exit 2
      ;;
    *) bump="$arg" ;;
  esac
done
if [[ -z "$bump" ]]; then
  echo "usage: $0 [--dry-run] <patch|minor|major|X.Y.Z|X.Y.Z-beta.N>" >&2
  exit 2
fi

root=$(git rev-parse --show-toplevel)
cd "$root"

# In a dry run a failed precondition is reported, not fatal, so the whole plan prints.
problems=0
check_failed() {
  if ((dry_run)); then
    echo "  would stop: $1" >&2
    problems=$((problems + 1))
  else
    echo "error: $1" >&2
    exit 1
  fi
}

# --- Safety checks ---------------------------------------------------------

if ! git diff --quiet || ! git diff --cached --quiet; then
  check_failed 'working tree not clean. commit or stash first.'
fi

branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$branch" != "main" ]]; then
  check_failed "releases must be cut from 'main' (on '$branch')."
fi

# --- Derive new version ----------------------------------------------------

pkg=packages/snaplot/package.json
current=$(node -p "require('./$pkg').version")
release_pattern='^[0-9]+\.[0-9]+\.[0-9]+$'
version_pattern='^[0-9]+\.[0-9]+\.[0-9]+(-beta\.[0-9]+)?$'

case "$bump" in
  patch | minor | major)
    if ! [[ "$current" =~ $release_pattern ]]; then
      echo "error: $current is a prerelease; give the next version explicitly." >&2
      exit 1
    fi
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

if ! [[ "$new" =~ $version_pattern ]]; then
  echo "error: '$new' is not X.Y.Z or X.Y.Z-beta.N." >&2
  exit 1
fi

if git rev-parse "v$new" >/dev/null 2>&1; then
  check_failed "tag v$new already exists."
fi

if [[ "$new" == *-* ]]; then
  dist_tag=next
  channel='prerelease (npm dist-tag `next`; `npm i snaplot` still installs `latest`)'
else
  dist_tag=latest
  channel='release (npm dist-tag `latest`)'
fi

# --- Verify CHANGELOG has an Unreleased section ----------------------------

if ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  check_failed "CHANGELOG.md missing '## [Unreleased]' header."
fi

# Warn (don't fail) if Unreleased looks empty — solo project, small releases
# sometimes land under just a docs-only umbrella.
unreleased_body=$(awk '
  /^## \[Unreleased\]/ { found=1; next }
  /^## \[/ && found { exit }
  found && NF > 0 { print }
' CHANGELOG.md)

today=$(date +%Y-%m-%d)

if ((dry_run)); then
  cat <<EOF
Release plan (dry run; nothing was changed):

  version      $current -> $new
  channel      $channel
  branch       $branch
  CHANGELOG    '## [Unreleased]' ($(printf '%s\n' "$unreleased_body" | grep -c . || true) non-empty lines) becomes '## [$new] - $today'
  commit       chore: release v$new   ($pkg, package-lock.json, CHANGELOG.md, README.md)
  tag          v$new (annotated, local)

  then, by hand: git push --follow-tags
  publish.yml on the tag: CI gates -> verify (tag = package.json, check:package, check:size,
    check:api, release notes) -> npm publish --provenance --access public --tag $dist_tag
    -> GitHub Release v$new (prerelease: $([[ "$dist_tag" == next ]] && echo true || echo false))
EOF
  if ((problems)); then
    echo "The real run would stop at $problems precondition(s) listed above." >&2
  fi
  exit 0
fi

if [[ -z "$unreleased_body" ]]; then
  echo "warning: [Unreleased] section appears empty." >&2
  read -r -p "continue anyway? [y/N] " answer
  [[ "$answer" != "y" && "$answer" != "Y" ]] && exit 1
fi

# --- Apply changes ---------------------------------------------------------

echo "Releasing v$new (was v$current) as a $channel…"

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
node -e "
  const fs=require('fs');
  let s=fs.readFileSync('CHANGELOG.md','utf8');
  const marker='## [Unreleased]';
  if (!s.includes(marker)) { console.error('missing Unreleased'); process.exit(1); }
  s = s.replace(marker, marker + '\n\n## [$new] - $today');
  fs.writeFileSync('CHANGELOG.md', s);
"

# The README's no-build CDN URL pins the version, and its install line says @next for a
# prerelease; site/tests/readme.test.ts fails the release if they lag.
node scripts/sync-readme.mjs

git add "$pkg" package-lock.json CHANGELOG.md README.md
git commit -m "chore: release v$new"
git tag -a "v$new" -m "v$new"

cat <<EOF

✓ Prepared v$new locally ($channel).

Diff: $(git log --oneline -1)
Tag:  $(git tag -l "v$new")

To ship, push the commit and tag together:

    git push --follow-tags

The tag push triggers: CI gates → verify → npm publish --tag $dist_tag → GitHub Release.
EOF
