# techscout-protos

Single source of truth for the gRPC contracts shared across the TechScout
platform. Edit protos **here only** — services consume this repo as a git
submodule and never keep their own copy.

📖 Full docs (VitePress, vi/en): **https://nxhawk.github.io/techscout-protos/**
— CI/CD flow, how to update a proto, and what every message/RPC means.

## Contract → consumers

| Proto            | Package                  | Consumed by                          |
| ---------------- | ------------------------ | ------------------------------------ |
| `product.proto`  | `techscout.product.v1`   | gateway (client), product-service    |
| `recommend.proto`| `techscout.recommend.v1` | gateway (client), rag-recommend      |
| `docs.proto`     | `techscout.docs.v1`      | gateway (client), rag-docs           |

## What happens when you change a proto

1. Push to `main`.
2. `.github/workflows/ci.yml` runs `buf lint` + `buf breaking` (guardrail).
3. `.github/workflows/dispatch-on-change.yml` detects which `*.proto` changed
   and sends a `repository_dispatch` (`event_type: proto-updated`) to **only**
   the consumer repos of that file.
4. Each consumer's `proto-sync` workflow bumps its submodule, regenerates
   stubs, commits, and pushes — which triggers that service's normal build &
   deploy, and (via `service-updated`) the platform deploy.

## Required secret

`DISPATCH_TOKEN` — a PAT (fine-grained, `contents: write` on the four consumer
repos) or a GitHub App token. Used to fire `repository_dispatch` across repos.
The default `GITHUB_TOKEN` cannot dispatch to other repositories.

## Docs site

`docs/` is a VitePress site (Vietnamese by default at `/`, English at `/en/`)
deployed to GitHub Pages by `.github/workflows/docs.yml`. That workflow is
scoped to `paths: docs/**`, and `ci.yml` / `dispatch-on-change.yml` are scoped
to proto-related paths — so editing docs only rebuilds the Pages site and
never runs `buf lint`, never dispatches to a consumer repo, and never bumps a
service. See `docs/setup.md` for running it locally.
