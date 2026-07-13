# Ý nghĩa từng proto

Repo có 3 file `.proto`, mỗi file là một "bounded context" độc lập, mỗi package
có version suffix `.v1`. Cả 3 đều được `gateway` tiêu thụ dưới vai trò **client**;
mỗi service backend chỉ tiêu thụ đúng proto của mình dưới vai trò **server**.

## Bảng tổng quan

| Proto | Package | Service backend triển khai | Tiêu thụ bởi |
| --- | --- | --- | --- |
| `techscout/product/v1/product.proto` | `techscout.product.v1` | `product-service` (Go) | `gateway` (client), `product-service` (server) |
| `techscout/recommend/v1/recommend.proto` | `techscout.recommend.v1` | `rag-recommend` | `gateway` (client), `rag-recommend` (server) |
| `techscout/docs/v1/docs.proto` | `techscout.docs.v1` | `rag-docs` | `gateway` (client), `rag-docs` (server) |

---

## `techscout/product/v1/product.proto` — Danh mục sản phẩm

**Package:** `techscout.product.v1`

```protobuf
option go_package = "github.com/nxhawk/techscout-product-service/api/proto/product/v1;productv1";
```

`go_package` chỉ được `product-service` (viết bằng Go) đọc — `protoc` dùng option
này cùng `--go_opt=module=<module>` để sinh stub vào đúng
`api/proto/product/v1/`, giữ nguyên đường dẫn import hiện có của service. Các
consumer Python (gateway) bỏ qua option này.

### Service `ProductService`

Phục vụ CRUD + tìm kiếm sản phẩm qua gRPC cho gateway.

| RPC | Request | Response | Ý nghĩa |
| --- | --- | --- | --- |
| `Search` | `SearchRequest` | `SearchResponse` | Tìm sản phẩm theo từ khóa, có phân trang |
| `Get` | `GetRequest` | `Product` | Lấy 1 sản phẩm theo `id` |
| `Create` | `CreateRequest` | `Product` | Tạo sản phẩm mới |
| `Update` | `UpdateRequest` | `Product` | Cập nhật sản phẩm theo `id` |
| `Delete` | `DeleteRequest` | `DeleteResponse` | Xóa sản phẩm theo `id` |

::: tip Vì sao `Get`/`Create`/`Update` trả thẳng `Product`?
Đây là 1 trong 2 rule bị tắt trong `buf.yaml`
(`RPC_RESPONSE_STANDARD_NAME`) — thiết kế có chủ đích để tái dùng message
`Product` làm response thay vì tạo thêm `GetResponse`/`CreateResponse`/
`UpdateResponse` gần như trùng lặp.
:::

### Message

| Message | Field | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| `Product` | `id` | `string` | Định danh sản phẩm |
| | `name` | `string` | Tên sản phẩm |
| | `brand` | `string` | Thương hiệu |
| | `price` | `double` | Giá |
| | `specs` | `map<string, string>` | Thông số kỹ thuật dạng key-value tự do |
| `SearchRequest` | `query` | `string` | Từ khóa tìm kiếm |
| | `page` | `int32` | Trang hiện tại |
| | `page_size` | `int32` | Số kết quả mỗi trang |
| `SearchResponse` | `results` | `repeated Product` | Danh sách sản phẩm khớp |
| | `total` | `int32` | Tổng số kết quả (dùng để phân trang phía client) |
| `GetRequest` | `id` | `string` | — |
| `CreateRequest` | `product` | `Product` | Sản phẩm cần tạo (client không set `id`) |
| `UpdateRequest` | `id` | `string` | Sản phẩm cần cập nhật |
| | `product` | `Product` | Dữ liệu mới |
| `DeleteRequest` | `id` | `string` | — |
| `DeleteResponse` | `ok` | `bool` | Xóa thành công hay không |

---

## `techscout/recommend/v1/recommend.proto` — Gợi ý & so sánh sản phẩm

**Package:** `techscout.recommend.v1`

Không có `go_package` — không có consumer Go nào cho contract này (`rag-recommend`
là service Python, `gateway` cũng là Python).

### Service `RecommendService`

Trả lời câu hỏi dạng RAG (retrieval-augmented generation) để gợi ý hoặc so sánh
sản phẩm.

| RPC | Request | Response | Ý nghĩa |
| --- | --- | --- | --- |
| `Recommend` | `RecommendRequest` | `RecommendResponse` | Gợi ý sản phẩm theo câu hỏi tự nhiên (`query`), giới hạn `top_k` nguồn tham chiếu |
| `Compare` | `CompareRequest` | `CompareResponse` | So sánh một danh sách `product_ids` cụ thể, trả lời có kèm nguồn |

### Message

| Message | Field | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| `Source` | `id` | `string` | Định danh nguồn tham chiếu (vd. product id / doc id) |
| | `title` | `string` | Tiêu đề hiển thị của nguồn |
| | `score` | `double` | Điểm liên quan (relevance score) |
| `RecommendRequest` | `query` | `string` | Câu hỏi / mô tả nhu cầu của người dùng |
| | `top_k` | `int32` | Số nguồn tối đa dùng để sinh câu trả lời |
| `CompareRequest` | `query` | `string` | Tiêu chí so sánh (vd. "cái nào pin trâu hơn?") |
| | `product_ids` | `repeated string` | Danh sách sản phẩm cần so sánh |
| `RecommendResponse` | `answer` | `string` | Câu trả lời dạng văn bản tự nhiên |
| | `sources` | `repeated Source` | Các nguồn được dùng để sinh câu trả lời |
| `CompareResponse` | `answer` | `string` | Câu trả lời so sánh dạng văn bản |
| | `sources` | `repeated Source` | Nguồn liên quan tới phần so sánh |

---

## `techscout/docs/v1/docs.proto` — RAG trên tài liệu

**Package:** `techscout.docs.v1`

Không có `go_package` — `rag-docs` là service Python.

### Service `DocsService`

Hỏi-đáp trên kho tài liệu nội bộ (RAG) và nạp thêm tài liệu mới vào index.

| RPC | Request | Response | Ý nghĩa |
| --- | --- | --- | --- |
| `Query` | `QueryRequest` | `QueryResponse` | Hỏi đáp trên tài liệu đã được index, trả lời kèm nguồn trích dẫn |
| `Ingest` | `IngestRequest` | `IngestResponse` | Nạp (ingest) tài liệu tại một `path` vào index để phục vụ `Query` sau này |

### Message

| Message | Field | Kiểu | Ghi chú |
| --- | --- | --- | --- |
| `Source` | `source` | `string` | Định danh/đường dẫn nguồn tài liệu |
| | `text` | `string` | Đoạn văn bản trích dẫn từ nguồn |
| | `score` | `double` | Điểm liên quan |
| `QueryRequest` | `query` | `string` | Câu hỏi |
| | `top_k` | `int32` | Số đoạn trích dẫn tối đa dùng để trả lời |
| `QueryResponse` | `answer` | `string` | Câu trả lời tổng hợp |
| | `sources` | `repeated Source` | Các đoạn trích dùng làm căn cứ trả lời |
| `IngestRequest` | `path` | `string` | Đường dẫn tới tài liệu/thư mục cần nạp |
| `IngestResponse` | `documents` | `int32` | Số tài liệu đã xử lý |
| | `chunks_indexed` | `int32` | Số đoạn (chunk) đã được đưa vào index |

::: tip Điểm chung giữa `techscout/recommend/v1/recommend.proto` và `techscout/docs/v1/docs.proto`
Cả hai đều theo mô-tuýp RAG: `Request` có `query` (+ `top_k` khi cần giới hạn
nguồn), `Response` có `answer` + `repeated Source`. Nếu thêm một service RAG
mới, nên tái dùng mô-tuýp này để nhất quán.
:::

## Vì sao 3 package nằm dưới `techscout/<svc>/v1/`?

Mỗi contract sống tại `techscout/<svc>/v1/<svc>.proto`, khớp 1:1 với khai báo
`package techscout.<svc>.v1;` — đúng theo rule lint `DIRECTORY_SAME_PACKAGE` /
`PACKAGE_DIRECTORY_MATCH` (cả hai đều đang bật trong `buf.yaml`, không còn bị
tắt như trước). Lợi ích chính: khi cần một thay đổi phá vỡ (breaking change),
ta thêm `techscout/<svc>/v2/<svc>.proto` (package `techscout.<svc>.v2`) nằm
song song với `v1` thay vì sửa đè lên file cũ — các consumer tự chọn thời điểm
migrate sang `v2`, còn `v1` vẫn chạy bình thường cho tới khi không còn ai dùng.
