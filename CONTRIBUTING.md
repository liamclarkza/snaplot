# Contributing

Thanks for your interest. This is a small, opinionated project, we aim to stay that way.

## Setup

```bash
npm install        # installs deps + git hooks
npm run dev        # starts the docs site with live HMR against the lib source
```

Requires Node ≥ 22. Uses npm workspaces (`packages/snaplot` + `site`).

## Scripts

| Command | What it does |
| :-- | :-- |
| `npm run dev` | Site dev server (library HMR wired via alias) |
| `npm run dev:lib` | Library watch build only |
| `npm run build` | Library production build (→ `packages/snaplot/dist`) |
| `npm run build:site` | Site production build |
| `npm run typecheck` | `tsc --noEmit` over the library |
| `npm test` | Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | Biome lint |
| `npm run lint:fix` | Apply safe lint fixes |
| `npm run check` | Biome lint + format check |
| `npm run format` | Apply Biome formatting |

## Quality gates

Three gates enforce the same standards locally and in CI:

1. **Pre-commit hook** (lefthook): Biome check on staged files, typecheck when library source changed.
2. **Pre-push hook**: full `npm test`.
3. **CI** (`.github/workflows/quality.yml`): lint + typecheck + tests + both builds on every PR and push to `main`.

Bypass a hook only with `--no-verify` and say why in the commit body.

## Code style

- **TypeScript strict mode**. Avoid `any`; prefer precise generics or `unknown` with narrowing.
- **No premature abstraction**. Three similar lines is better than a helper. Don't build for hypothetical requirements.
- **Comments explain why, not what**. Leave the "what" to the code.
- **No dead code**. If it's unreachable or unused, delete it.

## Commits + PRs

We loosely follow [Conventional Commits](https://www.conventionalcommits.org/):

```
fix(scope): short imperative sentence

Optional body explaining the *why*, not a description of the diff.
```

Common scopes: `core`, `tooltip`, `legend`, `scales`, `data`, `renderers`, `site`, `ci`.

PR descriptions: bullet points, short. The diff explains the what; the description explains the why.

## Tests

New library code should come with a unit test when the logic is non-trivial. Co-locate tests next to sources: `foo.ts` + `foo.test.ts`.

Tests run in Node by default. DOM-dependent modules (gesture handlers, tooltips) need `environment: 'jsdom'` set per file, we'll add that shared setup once there's a reason to.

## Releases

Flow is "edit CHANGELOG as you go, cut a release with one script":

1. Land changes on `main` with CI green; add bullets to `CHANGELOG.md` under
   `## [Unreleased]` as you go.
2. When you're ready to ship, run from a clean `main`:

    ```bash
    scripts/release.sh patch      # or: minor | major | 1.2.3
    ```

   That bumps `packages/snaplot/package.json`, promotes the `[Unreleased]`
   section under a dated `## [X.Y.Z]` header (reseeding an empty
   `[Unreleased]` on top), commits `chore: release vX.Y.Z`, and tags
   `vX.Y.Z`. It stops short of pushing.
3. Push:

    ```bash
    git push --follow-tags
    ```

### What the tag push triggers

`.github/workflows/publish.yml` runs three jobs in sequence:

1. **verify**, tag must match `packages/snaplot/package.json`; runs lint,
   typecheck, tests, both builds; extracts the matching `CHANGELOG.md`
   section for the release notes.
2. **publish-npm**, `npm publish --provenance --access public`. Scoped to
   the `npm` GitHub environment so npm's trusted-publisher OIDC trust
   pins it there, and the publish shows up on the Deployments tab.
3. **release**, creates a GitHub Release named `vX.Y.Z`, body is the
   extracted CHANGELOG section, asset is the packed tarball.

A failed `verify` blocks publish and release; a failed `publish-npm`
blocks release. If either npm or GitHub is flaky mid-publish, re-run the
failed job only, don't re-tag.
