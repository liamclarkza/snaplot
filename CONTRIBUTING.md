# Contributing

Thanks for your interest. This is a small, opinionated project; we aim to keep it that way.

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
| `npm run typecheck` | `tsc --noEmit` over the library and site |
| `npm test` | Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run lint` | Biome lint |
| `npm run lint:fix` | Apply safe lint fixes |
| `npm run check` | Biome lint/config checks |

## Quality gates

`npm run verify` runs G1 to G3 (and the build). CI (`.github/workflows/ci.yml`) runs every gate
as its own job on each pull request and push to `main`; `deploy.yml` and `publish.yml` call it
and run only if it passes. Every workflow declares its `permissions:`.

| # | Gate | Command | CI |
|---|---|---|---|
| G1 | Lint and format | `npx biome ci .` | blocking |
| G2 | Types | `npm run typecheck` (library: `tsconfig.json` and `tsconfig.test.json`; every workspace) | blocking |
| G3 | Unit | `npm test` (CI adds v8 coverage), `npm run test:tz`, `node scripts/check-architecture.mjs` | blocking |
| G4 | Ledger | `npm run ledger`, `npm run trace-check`, `node scripts/overhaul/check-visual-ledger.mjs` | blocking (overhaul tooling, removed at M17) |
| G5 | Package | `npm run build && npm run check:package` | blocking, on Node 22.12.0 and `.nvmrc` |
| G6 | Size | `npm run build && npm run check:size` | blocking |
| G7 | API | `npm run build && npm run check:api` | blocking |
| G8 | Palettes | `npm run check:palettes` | blocking |
| G9 | Browser | `npm run test:browser` (Chromium, WebKit and Firefox smoke) | blocking |
| G10 | Visual | `npm run test:visual -- --against <ref>`, then `node scripts/overhaul/check-visual-diffs.mjs` | advisory in CI; review every changed shot and add a `docs/decisions/visual-ledger/` row in the commit that changes it |
| G11 | Docs | `npm run build:site`, `npm run check:examples`, `npm run check:migration` | blocking |
| G12 | Perf | `npm run bench:ab -- --base <ref>` | advisory in CI |

What the package, size and API gates check:

- **`check:package`**: `publint --strict`, `attw --pack --profile esm-only` (ESM only, D39), then
  `scripts/check-consumers.mjs`. That packs the library, installs the tarball into a throwaway
  project outside the repository and runs `test/consumers/` there under vitest: TypeScript under
  `bundler`, `node16` and `nodenext` without `skipLibCheck`; `import()` and `require()` of every
  entry; the Solid export conditions (server and client agree with `solid-js/web`, a
  `workerd`/`worker` bundle, the `solid` JSX source built by `vite-plugin-solid`); React and Solid
  SSR then hydration; the `'use client'` banner; the packed file list. Known defects are
  `it.fails('[id] …')` entries, listed by `npm run ledger`. `--keep` keeps the project for
  debugging.
- **`check:size`**: `scripts/size.mjs` bundles each import in `scripts/size-budgets.json` from
  the build (esbuild, minified, browser conditions, peers external) and gzips it at level 9.
  `node scripts/size.mjs --json` lists bytes per source module. Raise a budget
  (`node scripts/size.mjs --update` sets measured + 2%) only with the reason in the commit body.
- **`check:api`**: the rolled-up `dist/*.d.ts` must equal `packages/snaplot/api/*.d.ts`, and
  those must not name engine types (P4). After an intended public API change, run
  `npm run build && npm run api:update` and commit the reviewed diff. Never hand-merge
  `api/*.d.ts`, `package-lock.json` or screenshots: regenerate them.

Hooks (lefthook): pre-commit runs Biome on staged files and the type-check when library
source, tests or a `tsconfig*.json` changed; pre-push runs `npm test`. Bypass a hook only with
`--no-verify` and say why in the commit body. Node: `.nvmrc` for development; the package
supports Node 22.12 and later.

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

Tests run in Node by default. A test that needs a DOM sets `// @vitest-environment jsdom` at the
top of the file; `test/fakes` installs a recording canvas, frames, layout and media for chart-level
tests. Browser behaviour (gestures, focus, pixels) is tested with Playwright under `test/browser/`,
and the framework adapters under `test/conformance/`.

A known defect is a test marked `it.fails('[finding-id] …')` (or `test.fail(true, '[id]')`), which
`npm run ledger` lists; the fix flips it.

## Releases

Flow is "edit CHANGELOG as you go, cut a release with one script":

1. Land changes on `main` with CI green; add bullets to `CHANGELOG.md` under
   `## [Unreleased]` as you go.
2. When you're ready to ship, run from a clean `main`:

    ```bash
    scripts/release.sh patch      # or: minor | major | 1.2.3 | 1.0.0-beta.0
    scripts/release.sh --dry-run 1.0.0-beta.0   # print the plan, change nothing
    ```

   That bumps `packages/snaplot/package.json`, updates/stages
   `package-lock.json`, promotes the `[Unreleased]` section under a dated
   `## [X.Y.Z]` header (reseeding an empty `[Unreleased]` on top), commits
   `chore: release vX.Y.Z`, and tags `vX.Y.Z`. It stops short of pushing.
   A `X.Y.Z-beta.N` version is a prerelease: it publishes on the npm
   dist-tag `next`, so `npm i snaplot` keeps installing `latest`.
3. Push:

    ```bash
    git push --follow-tags
    ```

### What the tag push triggers

`.github/workflows/publish.yml` runs four jobs in sequence:

1. **ci**, the whole CI workflow (every blocking gate).
2. **verify**, tag must match `packages/snaplot/package.json` and be
   `X.Y.Z` or `X.Y.Z-beta.N`; re-runs the package, size and API gates on
   this build; extracts the matching `CHANGELOG.md` section for the release
   notes; packs the tarball.
3. **publish-npm**, `npm publish <tarball> --provenance --access public
   --tag <next|latest>`. Scoped to the `npm` GitHub environment so npm's
   trusted-publisher OIDC trust pins it there, and the publish shows up on
   the Deployments tab.
4. **release**, creates a GitHub Release named `vX.Y.Z` (marked as a
   prerelease for `-beta.N`), body is the extracted CHANGELOG section,
   asset is the packed tarball.

A failed `ci` or `verify` blocks publish and release; a failed `publish-npm`
blocks release. If either npm or GitHub is flaky mid-publish, re-run the
failed job only, don't re-tag.
