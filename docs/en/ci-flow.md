# CI/CD flow in detail

`techscout-protos` has 4 workflows in this repo, plus 2 more workflows in
**each** consumer repo (gateway, product-service, rag-recommend, rag-docs). This
page walks through every workflow, when it runs, and the full chain of events
from editing a `.proto` to a service being deployed.

## Overview diagram

```text
 Dev edits *.proto ──push/PR main──▶ ci.yml (buf lint + breaking)
        │
        └─push main, path **/*.proto──▶ dispatch-on-change.yml
                                              │
                                    figure out which protos changed
                                              │
                                    map protos ─▶ list of consumer repos
                                              │
                                    repository_dispatch "proto-updated"
                                              │
                       ┌──────────────────────┼──────────────────────┐
                       ▼                      ▼                      ▼
                 gateway/proto-sync.yml  product-service/proto-sync.yml  rag-*/proto-sync.yml
                       │ (each repo, independently)
                 git submodule update --remote
                 regenerate gRPC stubs
                 commit + push (PROTO_BOT_TOKEN)
                       │
                 triggers that service's docker.yml
                       │
                 build image → deploy → service-updated

 Dev edits docs/** ──push main, path docs/**──▶ docs.yml (build + deploy Pages)
                                              (does NOT run ci.yml, does NOT
                                               touch dispatch-on-change.yml)
```

## 1. `ci.yml` — buf lint + breaking-change guard

**Trigger:** `push` or `pull_request` to `main`, scoped to proto-related paths
(`**/*.proto`, `buf.yaml`, `buf.gen.yaml`) — commits that only touch `docs/**`
will **not** trigger this job.

**What it does:**

1. Checks out full history (`fetch-depth: 0` — required so `buf breaking` can
   diff against `main`).
2. Runs `bufbuild/buf-action@v1` with:
   - `lint: true` — applies the config in `buf.yaml` (`STANDARD` minus the 4
     rules disabled because they conflict with the flat 3-package layout and
     the reuse of the `Product` message as a response).
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
   `git diff --name-only --diff-filter=d "$BEFORE" "$SHA" -- '*.proto'`, or all
   `*.proto` files on the first push / a manual run with no input.
2. **Map protos → consumer repos** — a hard-coded table in the workflow:

   | Proto | Repos that receive the dispatch |
   | --- | --- |
   | `product.proto` | `techscout-gateway`, `techscout-product-service` |
   | `recommend.proto` | `techscout-gateway`, `techscout-rag-recommend` |
   | `docs.proto` | `techscout-gateway`, `techscout-rag-docs` |

   If you add a 4th proto, **this `CONSUMERS` table must be updated**, along
   with the matching table in `README.md`.
3. **Send `repository_dispatch`** (`event_type: proto-updated`) to each repo in
   the list, via `curl` + the `DISPATCH_TOKEN` secret (a PAT with
   `contents: write` on the 4 consumer repos — the default `GITHUB_TOKEN`
   cannot call another repo's API).

::: tip Why only the right consumers, not all 4?
If you only change `recommend.proto`, `techscout-rag-docs` and
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
