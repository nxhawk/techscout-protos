# CI/CD flow in detail

## Overview

Walks through every CI/CD workflow in `techscout-protos` and its consumer repos, explaining when each one runs and how a `.proto` edit propagates all the way to a deployed service.

`techscout-protos` has 4 workflows in this repo, plus 2 more workflows in
**each** consumer repo (gateway, product-service, rag-recommend, rag-docs). This
page walks through every workflow, when it runs, and the full chain of events
from editing a `.proto` to a service being deployed.

## Overview diagram

Follow the arrows: a commit that touches `*.proto` splits into 2 parallel
branches (`ci.yml` and `dispatch-on-change.yml`); `dispatch-on-change.yml`
then fans out to the 3 consumer repos, each of which syncs on its own and
triggers its own `docker.yml`. The `docs/**` flow (at the bottom) is
completely separate — it never crosses paths with the proto flow above (see
section 5).

<svg viewBox="0 0 920 770" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;display:block;margin:24px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <marker id="arrow-ci-en" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--vp-c-brand-1, #3451b2)" />
    </marker>
  </defs>

  <rect x="340" y="10" width="240" height="54" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1.5" />
  <text x="460" y="33" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">Dev edits *.proto</text>
  <text x="460" y="50" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">commit on a branch</text>

  <line x1="410" y1="64" x2="435" y2="106" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />
  <text x="300" y="88" text-anchor="end" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">push main, path **/*.proto</text>

  <line x1="510" y1="64" x2="642" y2="120" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />
  <text x="560" y="85" text-anchor="start" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">push / PR → main</text>

  <rect x="640" y="106" width="260" height="72" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="770" y="130" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">ci.yml (section 1)</text>
  <text x="770" y="147" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">buf lint + buf breaking</text>
  <text x="770" y="163" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">blocks the merge on failure</text>

  <rect x="260" y="108" width="360" height="110" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="440" y="130" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">dispatch-on-change.yml (section 2)</text>
  <text x="440" y="150" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">1. determine which protos changed</text>
  <text x="440" y="168" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">2. map protos → consumer repos</text>
  <text x="440" y="186" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">3. repository_dispatch "proto-updated"</text>
  <text x="440" y="204" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">(only runs when a commit changes *.proto)</text>

  <line x1="440" y1="218" x2="440" y2="240" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <line x1="440" y1="240" x2="150" y2="258" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />
  <line x1="440" y1="240" x2="460" y2="258" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />
  <line x1="440" y1="240" x2="770" y2="258" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />

  <rect x="10" y="260" width="280" height="120" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="150" y="282" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vp-c-text-1, #213547)">gateway/proto-sync.yml</text>
  <text x="150" y="300" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">git submodule update --remote</text>
  <text x="150" y="317" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">regenerate gRPC stubs</text>
  <text x="150" y="334" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">commit + push (PROTO_BOT_TOKEN)</text>
  <text x="150" y="354" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(independent of the other 2 repos)</text>

  <rect x="320" y="260" width="280" height="120" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="460" y="282" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vp-c-text-1, #213547)">product-service/proto-sync.yml</text>
  <text x="460" y="300" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">git submodule update --remote</text>
  <text x="460" y="317" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">regenerate gRPC stubs</text>
  <text x="460" y="334" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">commit + push (PROTO_BOT_TOKEN)</text>
  <text x="460" y="354" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(independent of the other 2 repos)</text>

  <rect x="630" y="260" width="280" height="120" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="770" y="282" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vp-c-text-1, #213547)">rag-*/proto-sync.yml</text>
  <text x="770" y="300" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">git submodule update --remote</text>
  <text x="770" y="317" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">regenerate gRPC stubs</text>
  <text x="770" y="334" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">commit + push (PROTO_BOT_TOKEN)</text>
  <text x="770" y="354" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(rag-recommend, rag-docs)</text>

  <line x1="150" y1="380" x2="350" y2="420" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />
  <line x1="460" y1="380" x2="460" y2="420" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />
  <line x1="770" y1="380" x2="570" y2="420" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />

  <rect x="230" y="422" width="460" height="70" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="460" y="446" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">that service's docker.yml</text>
  <text x="460" y="464" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">build image → deploy → service-updated</text>
  <text x="460" y="480" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(each repo triggers its own docker.yml)</text>

  <line x1="20" y1="540" x2="900" y2="540" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1" stroke-dasharray="4 4" />
  <text x="460" y="560" text-anchor="middle" font-size="11" font-style="italic" fill="var(--vp-c-text-2, #3c3c43)">The docs flow is completely separate — it never crosses the proto flow above</text>

  <rect x="340" y="580" width="240" height="54" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1.5" />
  <text x="460" y="603" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">Dev edits docs/**</text>
  <text x="460" y="620" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">push main, path docs/**</text>

  <line x1="460" y1="634" x2="460" y2="668" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-en)" />

  <rect x="290" y="670" width="340" height="86" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="460" y="694" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">docs.yml (section 5)</text>
  <text x="460" y="712" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">npm run docs:build → deploy Pages</text>
  <text x="460" y="729" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">❌ does not run ci.yml</text>
  <text x="460" y="745" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">❌ does not touch dispatch-on-change.yml</text>
</svg>

## 1. `ci.yml` — buf lint + breaking-change guard

**Trigger:** `push` or `pull_request` to `main`, scoped to proto-related paths
(`**/*.proto`, `buf.yaml`, `buf.gen.yaml`) — commits that only touch `docs/**`
will **not** trigger this job.

**What it does:**

1. Checks out full history (`fetch-depth: 0` — required so `buf breaking` can
   diff against `main`).
2. Runs `bufbuild/buf-action@v1` with:
   - `lint: true` — applies the config in `buf.yaml` (`STANDARD` minus the 2
     rules disabled because of the reuse of the `Product` message as a
     response instead of a dedicated `*Response`).
   - `breaking: true`, `breaking_against` pointing at
     `https://github.com/<repo>.git#branch=main` — blocks any change that would
     break backward compatibility (renumbering a field, changing a type,
     removing an RPC still in use, etc.) relative to `main`.

This is a **required guardrail** — a PR that fails this job shouldn't be
merged, since a breaking change here means breaking at least one of the 4
consumer services.

## 2. `dispatch-on-change.yml` — selective fan-out

**Trigger:**

- `push` to `main` **with path filter `**/*.proto`** — only runs when at least
  one `.proto` file changed in the commit. This is exactly why commits that
  only touch `docs/**` **never** trigger this workflow, and therefore
  **never** bump any service.
- `workflow_dispatch` — manual run, with a `protos` input to force-dispatch a
  specific list of files (empty = dispatch all).

**What it does (3 steps):**

1. **Determine changed protos** — using
   `git diff --name-only --diff-filter=d "$BEFORE" "$SHA" -- 'techscout/**/*.proto'`,
   or all `techscout/**/*.proto` files on the first push / a manual run with
   no input.
2. **Map protos → consumer repos** — a hard-coded table in the workflow, keyed
   by **full path** (not basename) so a future `v2` can map to a different
   consumer list than `v1` without colliding on filename:

   | Proto | Repos that receive the dispatch |
   | --- | --- |
   | `techscout/product/v1/product.proto` | `techscout-gateway`, `techscout-product-service` |
   | `techscout/recommend/v1/recommend.proto` | `techscout-gateway`, `techscout-rag-recommend` |
   | `techscout/docs/v1/docs.proto` | `techscout-gateway`, `techscout-rag-docs` |

   If you add a 4th proto, **this `CONSUMERS` table must be updated**, along
   with the matching table in `README.md`.
3. **Send `repository_dispatch`** (`event_type: proto-updated`) to each repo in
   the list, via `curl` + the `DISPATCH_TOKEN` secret (a PAT with
   `contents: write` on the 4 consumer repos — the default `GITHUB_TOKEN`
   cannot call another repo's API).

::: tip Why only the right consumers, not all 4?
If you only change `techscout/recommend/v1/recommend.proto`, `techscout-rag-docs` and
`techscout-product-service` will **not** receive a dispatch — avoiding
unnecessary builds/deploys for unrelated services.
:::

## 3. On the consumer side: `proto-guard.yml` + `proto-sync.yml`

These two workflows live in **each consumer repo** (e.g. `services/gateway`),
not in `techscout-protos`, but they're the next link in the chain so it's
worth understanding them:

### `proto-sync.yml` — receives the dispatch, self-syncs

- **Trigger:** `repository_dispatch` with `types: [proto-updated]`, or a manual
  run.
- **What it does:**
  1. Checks out with submodules.
  2. `git submodule update --remote --recursive proto` — pulls the
     `techscout-protos` submodule to the latest commit on `main`.
  3. Regenerates gRPC stubs (e.g. `bash scripts/gen_proto.sh` — since the
     service's Dockerfile ships committed stubs and doesn't run codegen at
     image-build time).
  4. Commits + pushes using the `PROTO_BOT_TOKEN` secret (**not** the default
     `GITHUB_TOKEN`, since a push made with the default token would not
     re-trigger other workflows — and the next step needs `docker.yml` to run).
  5. That push automatically triggers the service's `docker.yml` → build image
     → deploy → emits a `service-updated` event for the overall deploy system.

### `proto-guard.yml` — blocks a "drifted" submodule

- **Trigger:** `push`/`pull_request` to `main` in the consumer repo, or a
  manual run.
- **What it does:** for every submodule pointing at `techscout-protos`, ensures:
  - The pinned commit **is an ancestor** of `techscout-protos@main` (not
    pinned to a commit that was never pushed to `main`, or one that no longer
    exists because `main` was rewritten).
  - The submodule has **no local edits** — protos must only be changed in
    `techscout-protos`, never directly inside a consumer repo.

## 4. `notify-discord.yml`

- **Trigger:** every `push` to `main` (no path filter).
- **What it does:** posts an embed to the team's Discord channel via the
  `DISCORD_WEBHOOK` secret (skipped if the secret is empty). This is purely a
  notification — it does **not** affect any service's build/deploy. Even when
  a commit only touches `docs/**`, this workflow still runs so the team knows
  something changed (that's different from "bumping a service", so this
  behavior is left as-is).

## 5. `docs.yml` — build & deploy this documentation site (new)

- **Trigger:** `push` to `main` **scoped to path `docs/**`**, or a manual run.
- **What it does:** installs Node, runs `npm ci` inside `docs/`,
  `npm run docs:build`, uploads the artifact, and deploys via
  `actions/deploy-pages` to GitHub Pages
  (`https://nxhawk.github.io/techscout-protos/`).
- **Fully isolated from the proto flow:** because both `ci.yml` and
  `dispatch-on-change.yml` are scoped to proto-related paths (`.proto`,
  `buf.yaml`), a commit that only touches `docs/**` will:
  - ❌ not run `buf lint`/`buf breaking`
  - ❌ not send a `repository_dispatch` to any consumer repo
  - ❌ not bump any service's submodule pointer
  - ✅ only rebuild & redeploy the GitHub Pages site

## Summary table: what changed → which workflow runs {#summary-table}

| Change in the commit | `ci.yml` | `dispatch-on-change.yml` | `docs.yml` | `notify-discord.yml` |
| --- | :---: | :---: | :---: | :---: |
| Only `*.proto` / `buf.yaml` | ✅ | ✅ | ❌ | ✅ |
| Only `docs/**` | ❌ | ❌ | ✅ | ✅ |
| Both | ✅ | ✅ | ✅ | ✅ |
| Something else (e.g. root `README.md`) | ❌ | ❌ | ❌ | ✅ |
