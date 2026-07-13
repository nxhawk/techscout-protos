# gRPC & Proto Concepts

This page is for anyone touching `techscout-protos` for the first time: it
explains each term (gRPC, stub, channel, protobuf, service, message, rpc,
version, `buf breaking`, `buf lint`...), the actual `gen_proto`/`grpc_gen`/
`grpc_server` scripts across the 4 consumer repos, the end-to-end flow and
dependency between these concepts, and **why** the platform picked gRPC over
plain HTTP/REST — always tied back to an HTTP analogy for readers who know
REST better.

::: tip How is this different from the other pages?
This page explains **concepts**. For the **process** of editing a proto →
see [Updating a proto](/en/updating-protos). For the **CI workflows** that
run → see [CI/CD flow](/en/ci-flow). To look up **each RPC/message** → see
[Proto reference](/en/proto-reference).
:::

## 1. Quick cross-reference: gRPC vs HTTP/REST

Use this table as a lookup — every gRPC concept below is tied back to the
matching row here.

| | HTTP/REST (the familiar style) | gRPC (used in this repo) |
| --- | --- | --- |
| Underlying protocol | HTTP/1.1 (typically) | HTTP/2 (required) |
| Data format | JSON (text, human-readable) | Protobuf (binary, smaller & faster, not directly readable) |
| API contract | Optional — OpenAPI/Swagger written separately, easy to drift from code | Mandatory — the `.proto` file **is** the contract, code is generated straight from it |
| Calling a remote function | Manually build a URL + method (`GET /products/{id}`), manually parse the JSON response | Call `stub.Get(request)` like a local function — generated code handles the rest |
| Connection | Usually one request/response, maybe keep-alive/pooling | One `channel` held open, multiplexing many RPCs over the same connection |
| Client codegen | Needs an external tool (openapi-generator...) or hand-written code | Automatic from `.proto` via `protoc`/`buf`, consistent across every language |
| Backward-compat checking | No standard tooling, usually discovered at runtime | `buf breaking` blocks it right in CI, before merge |
| Who uses which here | Gateway ⇄ browser/frontend (public edge) | Gateway ⇄ product-service / rag-recommend / rag-docs (internal) |

Remember the last row: **gRPC here is internal service-to-service
communication**, not a public API for the browser — the browser still calls
the gateway over HTTP/REST as usual; the gateway is the one that "translates"
HTTP ⇄ gRPC when calling down to a backend.

## 2. What is Protocol Buffers (protobuf)?

Protobuf is a data-definition language (like JSON Schema) **plus** a very
compact binary encoding for sending that data over the network. A `.proto`
file is both documentation and the input for code generation — unlike JSON,
where you define the data "shape" by hand (docstrings, a TypeScript type, a
Pydantic model...) with nothing guaranteeing the client and server agree.

```protobuf
// techscout/product/v1/product.proto
message Product {
  string id = 1;
  string name = 2;
  string brand = 3;
  double price = 4;
  map<string, string> specs = 5;
}
```

Compared to JSON `{"id": "...", "name": "...", "price": 12.5}`: the shape is
identical, but every field also has a **field number** (`= 1`, `= 2`...) —
the single most important difference from JSON, covered next.

## 3. `message` — a unit of data (the JSON object / DTO equivalent)

A `message` is like a JSON object with a fixed schema, or a typed DTO/struct.
The core difference: protobuf fields are identified by **number**
(`= 1`, `= 2`...), not by string name like JSON. That number is what gets
written into the binary encoding — changing a field's number, changing its
type, or removing a field still in use all make old and new binaries
incompatible, which is exactly what `buf breaking` flags (see section 9).

## 4. `service` + `rpc` — the "API" contract (router + endpoint equivalent)

A `service` is like a router/controller grouping "endpoints" together; each
`rpc` inside it is like a method/function — but instead of
`GET /products/{id}`, you define it as a **typed function call**: takes one
message in, returns one message.

```protobuf
// techscout/product/v1/product.proto
service ProductService {
  rpc Search(SearchRequest) returns (SearchResponse);
  rpc Get(GetRequest) returns (Product);
  rpc Create(CreateRequest) returns (Product);
  rpc Update(UpdateRequest) returns (Product);
  rpc Delete(DeleteRequest) returns (DeleteResponse);
}
```

The three services in this repo (`ProductService`, `RecommendService`,
`DocsService`) — full RPC/message details in
[Proto reference](/en/proto-reference). All three currently use **unary
RPCs** (one request → one response, exactly like a REST request/response) —
gRPC also supports streaming (client/server/bidirectional) but the platform
doesn't need it yet.

## 5. `stub` — the generated client, calls an RPC like a local function

A `stub` is a class **auto-generated** by `protoc`/`buf` from a `service`,
acting as the client: you call `stub.Search(request)` just like a normal
Python/Go function call, and under the hood it serializes the message →
sends it over HTTP/2 → receives the response → deserializes it back. This is
the biggest difference from REST, where you manually build the URL, set
headers, and `json.loads()` the response yourself.

```python
# services/gateway/src/clients/product_client.py
class ProductClient(ResolvingGrpcClient):
    def _build_stub(self, channel):
        return product_pb2_grpc.ProductServiceStub(channel)

    async def search(self, query, page=1, page_size=20):
        stub = await self._stub_for_call()
        resp = await stub.Search(
            product_pb2.SearchRequest(query=query, page=page, page_size=page_size)
        )
        return [_to_dict(p) for p in resp.results]
```

`ProductServiceStub` is generated into
`services/gateway/src/grpc_gen/techscout/product/v1/product_pb2_grpc.py` —
nobody hand-writes this class; it's regenerated every time `gen_proto.sh`
runs (section 8).

## 6. `channel` — the connection to a server (a held-open connection/socket)

A `channel` is an HTTP/2 connection to a server's `host:port`, **held and
reused** across many RPCs instead of opening/closing one per call — HTTP/2
multiplexing lets many RPCs run concurrently over the same `channel` without
needing an application-level connection pool the way HTTP/1.1 typically
does.

```python
# services/gateway/src/clients/base.py
async def _stub_for_call(self):
    addr = await self.resolver.resolve(self.service_name, self.fallback_addr)
    if self._stub is None or addr != self._addr:
        if self._channel is not None:
            await self._channel.close()
        self._channel = grpc.aio.insecure_channel(addr)   # <- channel
        self._stub = self._build_stub(self._channel)      # <- stub built from the channel
        self._addr = addr
    return self._stub
```

This snippet shows the **dependency** clearly: a `stub` always needs a
`channel` to be constructed (`ProductServiceStub(channel)`); a `channel`
only needs a `host:port` address (here resolved from the service registry,
with a static fallback). The gateway only creates a new `channel` when the
address changes, otherwise it reuses the existing one — similar to holding a
keep-alive connection instead of opening a fresh HTTP connection per
request.

## 7. `grpc_gen` — the generated code folder, never hand-edit it

`grpc_gen/` (Python) or `api/proto/<svc>/v1/` (Go) is the **generated
output** from `.proto`, containing two kinds of files:

| File | Contains | Used by |
| --- | --- | --- |
| `*_pb2.py` / `*.pb.go` | A class per `message` (e.g. `Product`, `SearchRequest`) | Both client and server |
| `*_pb2_grpc.py` / `*_grpc.pb.go` | The `...Stub` class (for the client) **and** the `...Servicer`/interface (for the server to implement) | Client uses `Stub`, server implements `Servicer` |

```
services/gateway/src/grpc_gen/techscout/product/v1/
├── product_pb2.py          # message classes
├── product_pb2_grpc.py     # ProductServiceStub + ProductServiceServicer
└── __init__.py
```

The entire folder is **machine-generated**, always carrying the comment
`"""Generated gRPC stubs (do not edit; run scripts/gen_proto.sh)."""` — hand
edits are lost the next time the script runs. To change anything, edit the
`.proto` and re-run the codegen script (section 9).

## 8. `grpc_server` — where the backend implements the contract

`grpc_server` is where a service plays the **server** role: it implements
the generated `...Servicer` class (each RPC in the `.proto` maps to one
method to override), then registers it on a `grpc.Server` listening on a TCP
port. Similar to writing a Flask/Express route handler, but instead of
binding by URL you override by RPC name — the gRPC framework handles routing
and (de)serialization for you.

```python
# services/rag-docs/src/grpc_server/service.py — implementing the contract
class DocsServicer(docs_pb2_grpc.DocsServiceServicer):
    def Query(self, request, context):
        ...
        return docs_pb2.QueryResponse(answer=answer, sources=sources)

# services/rag-docs/src/grpc_server/server.py — registering + running
def build_server(port: int) -> grpc.Server:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    docs_pb2_grpc.add_DocsServiceServicer_to_server(DocsServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    return server
```

Go (`product-service`) does the same thing with different syntax:

```go
// services/product-service/cmd/server/grpc_enabled.go
s := grpc.NewServer()
productv1.RegisterProductServiceServer(s, grpcsrv.New(svc))
reflection.Register(s)
s.Serve(lis)
```

`rag-recommend` has the exact same `src/grpc_server/` layout as `rag-docs`.
`product-service` has no dedicated `grpc_server` folder — the logic lives in
`internal/handler/grpcsrv/`, wired up from `cmd/server/grpc_enabled.go`
(only built with the `grpc` build tag, see `Makefile`).

## 9. `gen_proto.sh` / `make proto` — the bridge from `.proto` to code

| Service | Language | Command | Input | Output |
| --- | --- | --- | --- | --- |
| `gateway` | Python | `bash scripts/gen_proto.sh` | **all 3** `.proto` files (client of all 3 services) | `src/grpc_gen/techscout/{product,recommend,docs}/v1/` |
| `product-service` | Go | `make proto` (in `Makefile`) | `techscout/product/v1/product.proto` | `api/proto/product/v1/` |
| `rag-recommend` | Python | `bash scripts/gen_proto.sh` | only `recommend.proto` (this service's own server contract) | `src/grpc_gen/techscout/recommend/v1/` |
| `rag-docs` | Python | `bash scripts/gen_proto.sh` | only `docs.proto` | `src/grpc_gen/techscout/docs/v1/` |

All three Python scripts call the same underlying command:

```bash
uv run python -m grpc_tools.protoc -I proto \
  --python_out="$OUT" --grpc_python_out="$OUT" "${PROTOS[@]}"
```

`gateway` recursively scans all `proto/techscout/**/*.proto` (since it's a
client for all 3 backends); `rag-docs`/`rag-recommend` name exactly one file
(since each service only implements the server for its own proto). Go calls
`protoc` directly with the `--go_out`/`--go-grpc_out` plugins instead of
`grpc_tools`.

::: tip Who runs this script, and when?
- **A dev, by hand**, when testing locally after bumping the submodule
  themselves.
- **CI, on your behalf**, inside each repo's `proto-sync.yml` whenever it
  receives a `repository_dispatch` — the output is **committed straight to
  git**, because the service's Dockerfile ships the already-committed stubs
  and never runs codegen at image build time. This is why `proto-sync.yml`
  needs `PROTO_BOT_TOKEN` to push (see
  [CI/CD flow](/en/ci-flow#3-consumer-side-proto-guardyml-proto-syncyml)).
:::

## 10. `version` (`.v1`) — every contract is pinned to one version

Each file lives at `techscout/<svc>/v1/<svc>.proto`, matching
`package techscout.<svc>.v1;` 1:1. For a breaking change, **don't edit `v1`
in place** — create `techscout/<svc>/v2/` alongside it; `v1` keeps working
until every consumer has migrated off it. This is just the concept summary;
for the full process with a checklist, see
[Updating a proto § Adding a new version](/en/updating-protos#adding-a-new-version-v2-alongside-v1).

## 11. `buf lint` vs `buf breaking` — two different guards

| | `buf lint` | `buf breaking` |
| --- | --- | --- |
| Checks | **Style** — naming, suffixes, file placement... | **Backward compatibility** — against the previous version |
| Compared against | Nothing, just inspects the current file | `main` (`--against '.git#branch=main'`) |
| Example caught error | `service Product` missing the `Service` suffix, a field named in `camelCase` instead of `snake_case` | Changing a field number, changing a field's type, removing an RPC still in use |
| Config in repo | `buf.yaml` → `lint.use: STANDARD`, minus 2 disabled rules (see [Proto reference](/en/proto-reference)) | `buf.yaml` → `breaking.use: FILE` |
| Runs when | Every proto PR/push | Every proto PR/push |

```bash
buf lint
buf breaking --against '.git#branch=main'
```

These two commands are **exactly what `ci.yml` runs** — run them locally
before pushing instead of waiting for CI to report the failure.

## 12. Order of operations for updating a proto — quick recap

1. Edit the `.proto` on a new branch.
2. Run `buf lint` + `buf breaking` locally — fix until both pass.
3. Open a PR into `main` → `ci.yml` re-runs the same two commands, blocking
   the merge on failure.
4. Merge → `dispatch-on-change.yml` detects the changed file(s) and sends a
   `repository_dispatch` to exactly the repos that consume that file.
5. Each consumer's `proto-sync.yml` runs on its own: bump the submodule →
   run `gen_proto.sh`/`make proto` → commit the new stubs → trigger a
   build/deploy.
6. For a genuine breaking change: ship it as `v2` alongside `v1` (section
   10) instead of editing `v1`, then server and client each migrate on
   their own schedule.

For the full step-by-step, including adding a brand-new proto or removing an
unused RPC → see the full [Updating a proto](/en/updating-protos) guide. For
the complete CI event chain (which workflow runs when) → see
[CI/CD flow](/en/ci-flow).

## 13. End-to-end flow & dependency between concepts

```text
.proto (message + service + rpc = "the contract")
   │
   │  buf lint / buf breaking  ← guards, run before merge (section 11)
   ▼
gen_proto.sh (Python) / make proto (Go)   ← bridge script (section 9)
   │
   ▼
grpc_gen/*_pb2.py + *_pb2_grpc.py   (or api/proto/.../*.pb.go)  ← generated code (section 7)
   │                                   │
   │ message classes              Stub class        Servicer base class
   │ (used on both sides)         (for the CLIENT)   (for the SERVER to implement)
   │                                   │                     │
   ▼                                   ▼                     ▼
grpc_server/service.py            channel + stub        grpc_server/server.py
(implements Servicer,             (sections 5, 6 —      (registers Servicer,
 section 8)                        gateway calls out)    add_insecure_port, section 8)
                                        │                     │
                                        └──── HTTP/2 (RPC) ───┘
```

Read it by dependency: the **server** needs the generated code to get a
`Servicer` base class to implement; the **client** needs the generated code
to get the `Stub` + `message` classes, plus a `channel` for the `Stub` to
call over the network. Both sides always build from the **same** `.proto`
(via the git submodule) — that's exactly why the CI infrastructure in
[CI/CD flow](/en/ci-flow) exists: to make sure every consumer regenerates
its code the moment the `.proto` changes, so client and server never drift
apart on the contract.

## 14. Why this platform chose gRPC over plain HTTP/JSON

- **High-frequency internal traffic**: the gateway calls down to 3 backends
  constantly (a single user request can fan out into several RPCs) — a
  binary payload is noticeably smaller and faster to encode/decode than
  JSON at this scale.
- **A mandatory, never-drifting contract**: the `.proto` is both the
  documentation and the code-generation source for Go (`product-service`)
  and Python (`gateway`, `rag-docs`, `rag-recommend`) alike — there's no
  "server changed a field but the client forgot to update" scenario,
  because client and server both generate from the same file, the same
  submodule commit.
- **`buf lint`/`buf breaking` automate contract review**: REST/JSON has no
  standard equivalent tooling to block a breaking change right in CI — here
  a PR that changes a field number the wrong way fails before it can merge,
  not after it's discovered in production.
- **HTTP/2 multiplexing**: many concurrent RPCs share one `channel`,
  reducing overhead compared to opening multiple HTTP/1.1 connections.
- **No trade-off on the public API experience**: gRPC is only used
  **internally** (gateway ⇄ backend); the browser/frontend still calls the
  gateway over plain HTTP/REST — the gateway sits in the middle translating
  both ways, so REST's ease of use at the edge isn't lost.

::: tip Trade-offs worth knowing
gRPC isn't directly human-readable — you can't just `curl` it and read JSON
like REST; you need a tool like `grpcurl`/`buf curl`. It also can't be
called directly from a browser without a gateway/proxy to translate — which
is exactly why the platform uses "gRPC internally + HTTP/REST at the edge"
instead of gRPC end to end.
:::
