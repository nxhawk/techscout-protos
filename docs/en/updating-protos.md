# Updating-a-proto workflow

## Core rule

> **Only edit `.proto` files here.** Never edit the submodule copy directly
> inside a consumer service repo — each consumer's `proto-guard.yml` blocks
> the PR if the submodule has local edits.

## Classifying a change

| Kind | Example | Safe? |
| --- | --- | --- |
| **Non-breaking** | Adding a new field with an unused field number, adding a new RPC, adding a new message, appending a new enum value | ✅ Safe to merge directly, `buf breaking` passes |
| **Breaking** | Renumbering a field, changing a field's type, removing a field/RPC still in use, renaming a field/message/service, changing the `package` | ❌ `buf breaking` will **fail** CI — reconsider the design or ship a new version (`v2`) |

## Step by step

### 1. Create a branch & edit the proto

```bash
git checkout -b feat/product-add-category
# edit product.proto, recommend.proto, or docs.proto
```

A few conventions are enforced by `buf lint` (`STANDARD` ruleset):

- Messages/Services use `PascalCase`, fields use `snake_case`.
- Packages must have a version suffix, e.g. `techscout.product.v1`.
- Services must have a `Service` suffix (`ProductService`, not `Product`).
- Request messages must have a `Request` suffix (`SearchRequest`).
- No `required` fields (proto3 semantics).

### 2. Lint + breaking check locally (do this before pushing)

```bash
buf lint
buf breaking --against '.git#branch=main'
```

If `buf breaking` fails, consider:

- Can this be a new field instead of changing an existing one?
- If a breaking change is genuinely needed, consider a **new file/`package`
  version** (`techscout.product.v2`) rather than editing `v1` — keep `v1`
  running in parallel until every consumer has migrated.

### 3. Open a PR into `main`

`ci.yml` automatically runs `buf lint` + `buf breaking` on the PR. Only merge
once this job is green.

### 4. Merge into `main` — the rest is automatic

Once merged:

1. `dispatch-on-change.yml` detects exactly which `.proto` file(s) changed,
   maps them to the consumer repos, and sends a `repository_dispatch`.
2. Each consumer repo automatically runs its `proto-sync.yml`: pulls the
   latest submodule, regenerates stubs, commits, pushes — which triggers that
   service's own build/deploy.
3. You **don't need** to manually go into each service repo to bump the
   submodule — unless you want to test manually (`workflow_dispatch` on the
   service's `proto-sync.yml`, or a local `git submodule update --remote`).

See [CI/CD flow in detail](/en/ci-flow) for the full breakdown.

## Adding a brand-new proto

If you add a new `.proto` file (e.g. `inventory.proto` for a new service),
besides writing the proto itself you need to update 2 more places:

1. **`dispatch-on-change.yml`** — add a line to the `declare -A CONSUMERS` map
   in the "Map protos -> consumer repos" step:

   ```bash
   declare -A CONSUMERS=(
     ["product.proto"]="techscout-gateway techscout-product-service"
     ["recommend.proto"]="techscout-gateway techscout-rag-recommend"
     ["docs.proto"]="techscout-gateway techscout-rag-docs"
     ["inventory.proto"]="techscout-gateway techscout-inventory-service"  # add this
   )
   ```

2. **`README.md`** — add a row to the "Contract → consumers" table so it's
   discoverable later.

If you skip step 1, the new proto still gets linted/breaking-checked
normally, but it **won't be dispatched to any service** — the service will
need to run `proto-sync.yml` manually, or wait for a `workflow_dispatch` run
with `protos` set to the new filename.

## Removing a proto / an unused RPC

`buf breaking` blocks this by default because it's treated as a breaking
change. Recommended process:

1. Confirm **no consumer still calls** that RPC/field (check all 4 service
   repos).
2. If it's genuinely safe, add a targeted exception to `buf.yaml`
   (`breaking.ignore` scoped to that file/path) with a comment explaining why,
   rather than disabling `breaking` globally.
3. After merging, proactively notify the team via Discord/README — this is an
   intentionally compatibility-breaking change.

## What about changes to these docs?

If you only edit content under `docs/` (including this page), you don't need
to do anything about lint/breaking/dispatch — `docs.yml` will rebuild and
redeploy the site, while `ci.yml` and `dispatch-on-change.yml` skip that
commit entirely (see the table at the end of
[CI/CD flow](/en/ci-flow#summary-table)).
