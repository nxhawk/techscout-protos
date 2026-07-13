# Setup & local development

## 1. Requirements

| Tool | Used for | Install |
| --- | --- | --- |
| [`buf`](https://buf.build/docs/installation) | Lint + breaking-change check for `.proto` files | `brew install bufbuild/buf/buf` or download a binary from GitHub Releases |
| `git` ≥ 2.30 | Submodules, `merge-base` | — |
| Node.js ≥ 18 | Running the docs site (VitePress) | `nvm install 20` |
| `protoc` + language plugin (per service) | Generating gRPC stubs when working inside a consumer repo | see each consumer service's README |

This repo does **not** need Node/Python to work with the protos themselves — Node
is only needed if you want to run or build the documentation site (`docs/`).

## 2. Clone & repo layout

```bash
git clone https://github.com/nxhawk/techscout-protos.git
cd techscout-protos
ls
# buf.yaml  techscout/  docs/  README.md
```

The three `.proto` files live under `techscout/<service>/v1/` (see the rationale
in [`buf.yaml`](https://github.com/nxhawk/techscout-protos/blob/main/buf.yaml)) —
each service gets its own version directory, so adding `v2` later never touches
the `v1` that's already deployed.

## 3. Lint & breaking-change check locally

Run exactly what CI runs, before you push:

```bash
buf lint
buf breaking --against '.git#branch=main'
```

- `buf lint` — checks style: PascalCase/snake_case, `.v1` version suffix,
  `Service` suffix, `*Request` naming, no `required` fields, etc. (the `STANDARD`
  ruleset minus the 2 rules disabled in `buf.yaml`).
- `buf breaking` — compares against `main` to make sure you haven't renumbered a
  field, changed a type, removed a field/RPC still in use, etc. (anything that
  would break a consumer's backward compatibility).

## 4. Consuming this repo from a service (submodule)

Consumer services attach this repo as a submodule, e.g. at
`services/gateway/proto`:

```bash
git submodule add https://github.com/nxhawk/techscout-protos.git proto
git submodule update --init --recursive
```

Manually bumping to the latest `main` (normally done automatically by each
service's `proto-sync.yml` on `repository_dispatch`):

```bash
git submodule update --remote --recursive proto
```

## 5. Running this docs site locally

The documentation site (VitePress) lives under `docs/`:

```bash
cd docs
npm install
npm run docs:dev       # http://localhost:5173/techscout-protos/
```

Static build (identical to what CI runs before deploying to GitHub Pages):

```bash
npm run docs:build     # outputs to docs/.vitepress/dist
npm run docs:preview   # preview the build
```

::: warning
`base` in `docs/.vitepress/config.mts` is hard-coded to `/techscout-protos/` to
match the GitHub Pages project site. If you ever rename the repo, update `base`
accordingly.
:::

## 6. Secrets required by CI

| Secret | Repo | Purpose |
| --- | --- | --- |
| `DISPATCH_TOKEN` | `techscout-protos` | A fine-grained PAT (`contents: write` on the 4 consumer repos) or GitHub App token, used to send `repository_dispatch` to consumer repos. The default `GITHUB_TOKEN` **cannot** dispatch to other repositories. |
| `DISCORD_WEBHOOK` | `techscout-protos` | (optional) Discord webhook URL to notify the team on every push to `main`. |

Deploying this docs site to GitHub Pages needs **no extra secret** — it uses the
default `GITHUB_TOKEN` via `actions/deploy-pages`.
