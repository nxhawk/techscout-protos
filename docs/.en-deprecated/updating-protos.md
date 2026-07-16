# Updating-a-proto workflow

## Overview

The workflow for changing a `.proto` — classifying breaking vs non-breaking edits, the edit→lint→PR→merge steps, and how to add a new proto, ship a `v2`, or remove an unused proto/RPC.

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
# edit techscout/product/v1/product.proto, techscout/recommend/v1/recommend.proto, or techscout/docs/v1/docs.proto
```

A few conventions are enforced by `buf lint` (`STANDARD` ruleset):

- Messages/Services use `PascalCase`, fields use `snake_case`.
- Packages must have a version suffix, e.g. `techscout.product.v1`.
- Services must have a `Service` suffix (`ProductService`, not `Product`).
- Request messages must have a `Request` suffix (`SearchRequest`).
- No `required` fields (proto3 semantics).
- The file path must match the package: `techscout.product.v1` →
  `techscout/product/v1/product.proto` (the `DIRECTORY_SAME_PACKAGE` /
  `PACKAGE_DIRECTORY_MATCH` rules, both enabled in `buf.yaml`).

### 2. Lint + breaking check locally (do this before pushing)

```bash
buf lint
buf breaking --against '.git#branch=main'
```

If `buf breaking` fails, consider:

- Can this be a new field instead of changing an existing one?
- If a breaking change is genuinely needed, ship a **new version** (`v2`) —
  see the section right below — instead of editing `v1` in place.

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

See [CI/CD flow in detail](/ci-flow) for the full breakdown.

## Adding a brand-new proto

If you add a new `.proto` file (e.g. `inventory.proto` for a new service),
besides writing the proto itself you need to update 2 more places:

1. **`dispatch-on-change.yml`** — add a line to the `declare -A CONSUMERS` map
   in the "Map protos -> consumer repos" step:

   ```bash
   declare -A CONSUMERS=(
     ["techscout/product/v1/product.proto"]="techscout-gateway techscout-product-service"
     ["techscout/recommend/v1/recommend.proto"]="techscout-gateway techscout-rag-recommend"
     ["techscout/docs/v1/docs.proto"]="techscout-gateway techscout-rag-docs"
     ["techscout/inventory/v1/inventory.proto"]="techscout-gateway techscout-inventory-service"  # add this
   )
   ```

2. **`README.md`** — add a row to the "Contract → consumers" table so it's
   discoverable later.

If you skip step 1, the new proto still gets linted/breaking-checked
normally, but it **won't be dispatched to any service** — the service will
need to run `proto-sync.yml` manually, or wait for a `workflow_dispatch` run
with `protos` set to the new filename.

## Adding a new version (v2) alongside v1

Since each contract already lives at `techscout/<svc>/v1/<svc>.proto` (its own
version directory), adding `v2` **doesn't touch** `v1` at all — both versions
coexist, and each consumer picks its own migration timing. This is the
recommended path any time you need a genuine breaking change.

### Detailed steps

**A. On the `techscout-protos` side (this repo)**

1. Create `techscout/<svc>/v2/` and copy the contents of
   `techscout/<svc>/v1/<svc>.proto` into `techscout/<svc>/v2/<svc>.proto`.
2. Change the declaration from `package techscout.<svc>.v1;` to
   `package techscout.<svc>.v2;`.
3. Apply your breaking redesign to fields/RPCs/messages as needed — the `v1`
   file **stays untouched**.
4. For Go-consumed contracts (like `product-service`), point `go_package` in
   the `v2` file at a separate directory, e.g.
   `option go_package = ".../api/proto/product/v2;productv2";` (different from
   `v1` so generated code doesn't collide).
5. Run `buf lint` — `buf breaking` doesn't apply to the `v2` file since it's
   brand new (nothing on `main` to diff against), but running it anyway is a
   good sanity check that you didn't accidentally break `v1` while copying.
6. Add a row for `v2` to the "Contract → consumers" table in `README.md`.
7. Add a new entry to `CONSUMERS` in `dispatch-on-change.yml`, keyed by the
   full path:

   ```bash
   declare -A CONSUMERS=(
     ["techscout/product/v1/product.proto"]="techscout-gateway techscout-product-service"
     ["techscout/product/v2/product.proto"]="techscout-gateway techscout-product-service"  # add this — the list can differ from v1 if only some consumers are ready
     ...
   )
   ```

8. Open a PR and merge into `main` following the normal workflow above.

**B. On each consumer service (opt in whenever it's ready — no need to move together)**

1. Bump the submodule (`git submodule update --remote --recursive proto`, or
   let `proto-sync.yml` run automatically) so the `proto/` directory now has
   both `v1` and `v2`.
2. Generate code for `v2` **alongside** `v1` (don't delete the `v1` generated
   code):
   - Python (gateway, rag-docs, rag-recommend): add a target/adjust
     `gen_proto.sh` to also point at
     `proto/techscout/<svc>/v2/<svc>.proto`, outputting into
     `src/grpc_gen/techscout/<svc>/v2/`.
   - Go (product-service): add a `proto-v2` target in the `Makefile` pointing
     at `api/proto/shared/techscout/product/v2/product.proto`, outputting into
     `api/proto/product/v2/`.
3. On the **server** side (whichever service implements the contract):
   register both versions on the same instance — e.g. in Go, call both
   `productv1.RegisterProductServiceServer(...)` and
   `productv2.RegisterProductServiceServer(...)` on the same `grpc.Server`.
   That way both old (`v1`) and new (`v2`) clients are served during the
   transition.
4. On the **client** side (gateway calling another service): switch the
   import from `...techscout.<svc>.v1` to `...techscout.<svc>.v2` whenever
   ready — this can be done one service at a time, no need to migrate
   everything together.
5. Test/stage against `v2` before routing real traffic through it.

**C. Cleanup once every consumer has migrated**

1. Grep all 4 service repos to confirm nothing still imports
   `techscout.<svc>.v1` / `techscout/<svc>/v1/`.
2. Remove `techscout/<svc>/v1/` from `techscout-protos`, drop the `v1` entry
   from `CONSUMERS` in `dispatch-on-change.yml` and from the table in
   `README.md`.
3. In each service: remove the generated `v1` code
   (`src/grpc_gen/.../v1` or `api/proto/.../v1`), and remove the `v1`
   handler/registration on the server side.

### Checklist

- [ ] Create `techscout/<svc>/v2/<svc>.proto`, change `package` to `.v2`, keep
      the `v1` file untouched
- [ ] (Go) Point `go_package` in the `v2` file at its own `v2` directory
- [ ] `buf lint` passes for the new file
- [ ] Add a `v2` row to the "Contract → consumers" table in `README.md`
- [ ] Add a `v2` entry to `CONSUMERS` in `dispatch-on-change.yml`
- [ ] Merge the PR into `main`
- [ ] Each service bumps its submodule and generates `v2` code **alongside**
      `v1` (without deleting the `v1` code)
- [ ] Server: register/handle both `v1` and `v2` at the same time during the
      transition
- [ ] Client (gateway): move imports to `v2` one service at a time, with
      testing before real traffic switches over
- [ ] Once confirmed no consumer still uses `v1` (grep across all repos):
      remove `techscout/<svc>/v1/` plus the related entries in
      `dispatch-on-change.yml` and `README.md`, and remove the generated `v1`
      code in each service

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
[CI/CD flow](/ci-flow#summary-table)).
