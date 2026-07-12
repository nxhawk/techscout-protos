# What each proto means

The repo has 3 `.proto` files, each an independent bounded context, each
package carrying a `.v1` version suffix. All three are consumed by `gateway`
as a **client**; each backend service only consumes its own proto as the
**server**.

## Overview

| Proto | Package | Backend service that implements it | Consumed by |
| --- | --- | --- | --- |
| `product.proto` | `techscout.product.v1` | `product-service` (Go) | `gateway` (client), `product-service` (server) |
| `recommend.proto` | `techscout.recommend.v1` | `rag-recommend` | `gateway` (client), `rag-recommend` (server) |
| `docs.proto` | `techscout.docs.v1` | `rag-docs` | `gateway` (client), `rag-docs` (server) |

---

## `product.proto` — Product catalog

**Package:** `techscout.product.v1`

```protobuf
option go_package = "github.com/nxhawk/techscout-product-service/api/proto/product/v1;productv1";
```

`go_package` is only read by `product-service` (written in Go) — `protoc` uses
this option together with `--go_opt=module=<module>` to generate stubs into
`api/proto/product/v1/`, keeping the service's existing import paths
unchanged. Python consumers (gateway) ignore this option.

### Service `ProductService`

Serves product CRUD + search over gRPC to the gateway.

| RPC | Request | Response | Meaning |
| --- | --- | --- | --- |
| `Search` | `SearchRequest` | `SearchResponse` | Search products by keyword, with pagination |
| `Get` | `GetRequest` | `Product` | Fetch a single product by `id` |
| `Create` | `CreateRequest` | `Product` | Create a new product |
| `Update` | `UpdateRequest` | `Product` | Update a product by `id` |
| `Delete` | `DeleteRequest` | `DeleteResponse` | Delete a product by `id` |

::: tip Why do `Get`/`Create`/`Update` return `Product` directly?
This is one of 2 rules disabled in `buf.yaml`
(`RPC_RESPONSE_STANDARD_NAME`) — an intentional choice to reuse the `Product`
message as the response instead of adding near-duplicate
`GetResponse`/`CreateResponse`/`UpdateResponse` messages.
:::

### Messages

| Message | Field | Type | Notes |
| --- | --- | --- | --- |
| `Product` | `id` | `string` | Product identifier |
| | `name` | `string` | Product name |
| | `brand` | `string` | Brand |
| | `price` | `double` | Price |
| | `specs` | `map<string, string>` | Free-form key-value technical specs |
| `SearchRequest` | `query` | `string` | Search keyword |
| | `page` | `int32` | Current page |
| | `page_size` | `int32` | Results per page |
| `SearchResponse` | `results` | `repeated Product` | Matching products |
| | `total` | `int32` | Total match count (for client-side pagination) |
| `GetRequest` | `id` | `string` | — |
| `CreateRequest` | `product` | `Product` | Product to create (client doesn't set `id`) |
| `UpdateRequest` | `id` | `string` | Product to update |
| | `product` | `Product` | New data |
| `DeleteRequest` | `id` | `string` | — |
| `DeleteResponse` | `ok` | `bool` | Whether the delete succeeded |

---

## `recommend.proto` — Product recommendation & comparison

**Package:** `techscout.recommend.v1`

No `go_package` — there is no Go consumer for this contract (`rag-recommend`
is a Python service, and so is `gateway`).

### Service `RecommendService`

Answers RAG (retrieval-augmented generation) style questions to recommend or
compare products.

| RPC | Request | Response | Meaning |
| --- | --- | --- | --- |
| `Recommend` | `RecommendRequest` | `RecommendResponse` | Recommend products for a natural-language `query`, limited to `top_k` reference sources |
| `Compare` | `CompareRequest` | `CompareResponse` | Compare a specific list of `product_ids`, answer with cited sources |

### Messages

| Message | Field | Type | Notes |
| --- | --- | --- | --- |
| `Source` | `id` | `string` | Reference source identifier (e.g. product id / doc id) |
| | `title` | `string` | Display title of the source |
| | `score` | `double` | Relevance score |
| `RecommendRequest` | `query` | `string` | The user's question / need description |
| | `top_k` | `int32` | Max number of sources used to generate the answer |
| `CompareRequest` | `query` | `string` | Comparison criteria (e.g. "which has better battery life?") |
| | `product_ids` | `repeated string` | Products to compare |
| `RecommendResponse` | `answer` | `string` | Natural-language answer |
| | `sources` | `repeated Source` | Sources used to generate the answer |
| `CompareResponse` | `answer` | `string` | Natural-language comparison answer |
| | `sources` | `repeated Source` | Sources relevant to the comparison |

---

## `docs.proto` — RAG over documentation

**Package:** `techscout.docs.v1`

No `go_package` — `rag-docs` is a Python service.

### Service `DocsService`

Q&A over an internal documentation corpus (RAG), plus ingesting new documents
into the index.

| RPC | Request | Response | Meaning |
| --- | --- | --- | --- |
| `Query` | `QueryRequest` | `QueryResponse` | Ask a question over already-indexed docs, answer with cited sources |
| `Ingest` | `IngestRequest` | `IngestResponse` | Ingest the document(s) at a `path` into the index for later `Query` calls |

### Messages

| Message | Field | Type | Notes |
| --- | --- | --- | --- |
| `Source` | `source` | `string` | Source document identifier/path |
| | `text` | `string` | Quoted text snippet from the source |
| | `score` | `double` | Relevance score |
| `QueryRequest` | `query` | `string` | The question |
| | `top_k` | `int32` | Max number of snippets used to answer |
| `QueryResponse` | `answer` | `string` | Synthesized answer |
| | `sources` | `repeated Source` | Snippets used as evidence for the answer |
| `IngestRequest` | `path` | `string` | Path to the document(s)/directory to ingest |
| `IngestResponse` | `documents` | `int32` | Number of documents processed |
| | `chunks_indexed` | `int32` | Number of chunks added to the index |

::: tip What `recommend.proto` and `docs.proto` have in common
Both follow the same RAG shape: `Request` has a `query` (+ `top_k` when
limiting sources), `Response` has `answer` + `repeated Source`. If you add a
new RAG service, reuse this shape for consistency.
:::

## Why do the 3 packages sit flat at the root instead of `techscout/<svc>/v1/`?

See the comment in
[`buf.yaml`](https://github.com/nxhawk/techscout-protos/blob/main/buf.yaml):
this is an intentional choice to keep submodule paths and `protoc` `-I` flags
unchanged across every service, at the cost of disabling 2 lint rules
(`DIRECTORY_SAME_PACKAGE`, `PACKAGE_DIRECTORY_MATCH`) that would otherwise
require the directory structure to match the package.
