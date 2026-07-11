# techscout-protos

Single source of truth for the gRPC contracts shared across the TechScout
platform. Edit protos **here only** — services consume this repo as a git
submodule and never keep their own copy.

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
