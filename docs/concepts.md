# Khái niệm gRPC & Proto cơ bản

## Tổng quan

Giới thiệu các khái niệm gRPC và Protocol Buffers cốt lõi dùng trong `techscout-protos` cùng 4 repo tiêu thụ, và giải thích vì sao platform chọn gRPC thay vì HTTP/REST thuần.

Trang này dành cho người mới đụng vào `techscout-protos` lần đầu: giải thích
từng thuật ngữ (gRPC, stub, channel, protobuf, service, message, rpc,
version, `buf breaking`, `buf lint`...), script `gen_proto`/`grpc_gen`/
`grpc_server` thực tế trong 4 repo tiêu thụ, luồng hoạt động + phụ thuộc giữa
các khái niệm, và **vì sao** platform chọn gRPC thay vì HTTP/REST thuần —
luôn kèm liên hệ với HTTP cho ai quen REST hơn.

Các mục được sắp theo đúng thứ tự bạn cần hiểu: định nghĩa hợp đồng
(`.proto`, `message`, `service`/`rpc`) → cách hợp đồng được kiểm tra
(`buf lint`/`buf breaking`) → sinh code từ hợp đồng (`gen_proto.sh`,
`grpc_gen`) → phía server implement (`grpc_server`) → phía client gọi ra
(`stub`, `channel`) → vòng đời version → quy trình cập nhật đầy đủ → sơ đồ
tổng kết → lý do chọn gRPC.

::: tip Khác gì với các trang còn lại?
Trang này giải thích **khái niệm**. Muốn xem **quy trình** sửa proto → xem
[Cập nhật proto](/updating-protos). Muốn xem **workflow CI** chạy gì → xem
[Luồng CI/CD](/ci-flow). Muốn tra **từng RPC/message** → xem
[Tham chiếu proto](/proto-reference).
:::

## 1. So sánh nhanh: gRPC vs HTTP/REST

Bảng này dùng làm "từ điển tra chéo" — mỗi khái niệm gRPC bên dưới đều được
đối chiếu lại với dòng tương ứng ở đây.

| | HTTP/REST (kiểu quen thuộc) | gRPC (dùng trong repo này) |
| --- | --- | --- |
| Giao thức nền | HTTP/1.1 (thường) | HTTP/2 (bắt buộc) |
| Định dạng dữ liệu | JSON (text, người đọc được) | Protobuf (binary, nhỏ & nhanh hơn, không đọc trực tiếp được) |
| Hợp đồng API | Tùy chọn — OpenAPI/Swagger viết thêm, dễ lệch với code | Bắt buộc — file `.proto` **là** hợp đồng, sinh code trực tiếp từ đó |
| Gọi 1 hàm ở xa | Tự ghép URL + method (`GET /products/{id}`), tự parse JSON response | Gọi `stub.Get(request)` như gọi hàm local — code sinh sẵn lo hết |
| Kết nối | Thường 1 request/response, có thể có keep-alive/pool | 1 `channel` giữ kết nối lâu dài, multiplex nhiều RPC đồng thời trên cùng kết nối |
| Sinh code client | Cần công cụ ngoài (openapi-generator...) hoặc viết tay | Tự động từ `.proto` bằng `protoc`/`buf`, đồng bộ cho mọi ngôn ngữ |
| Kiểm tra tương thích ngược | Không có công cụ chuẩn, thường phát hiện ở runtime | `buf breaking` chặn ngay trong CI, trước khi merge |
| Ai dùng trong platform này | Gateway ⇄ trình duyệt/FE (public edge) | Gateway ⇄ product-service / rag-recommend / rag-docs (nội bộ) |

Ghi nhớ dòng cuối: **gRPC ở đây là giao tiếp nội bộ giữa các service**, không
phải API public cho trình duyệt — trình duyệt vẫn gọi gateway qua HTTP/REST
như bình thường, gateway mới là bên "dịch" HTTP → gRPC khi gọi xuống backend.

## 2. Protocol Buffers (protobuf) là gì?

Protobuf là ngôn ngữ định nghĩa dữ liệu (giống JSON Schema) **kèm** một cách
mã hóa nhị phân rất gọn để truyền dữ liệu đó qua mạng. File `.proto` vừa là
tài liệu, vừa là input để sinh code — khác JSON, nơi bạn tự định nghĩa
"shape" dữ liệu bằng tay (docstring, TypeScript type, Pydantic model...) và
không có gì đảm bảo client/server khớp nhau.

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

So với JSON `{"id": "...", "name": "...", "price": 12.5}`: cấu trúc giống
hệt, nhưng mỗi field có thêm **số field** (`= 1`, `= 2`...) — đây là điểm
khác biệt quan trọng nhất so với JSON, xem mục tiếp theo.

## 3. `message` — đơn vị dữ liệu (tương đương JSON object / DTO)

`message` giống một object JSON có schema cố định, hoặc một DTO/struct có
kiểu. Khác biệt cốt lõi: field trong protobuf được định danh bằng **số**
(`= 1`, `= 2`...), không phải tên chuỗi như JSON. Số này được ghi vào dữ liệu
nhị phân khi encode — đổi số field, đổi kiểu field, hoặc xóa field đang dùng
đều làm binary cũ/mới không tương thích, đó là lý do `buf breaking` xem những
thay đổi này là breaking (xem mục 5).

## 4. `service` + `rpc` — hợp đồng "API" (tương đương router + endpoint)

`service` giống một router/controller nhóm các "endpoint" lại; mỗi `rpc` bên
trong giống một phương thức/hàm — nhưng thay vì `GET /products/{id}`, bạn
định nghĩa nó như một **lời gọi hàm có kiểu**: nhận vào 1 message, trả về 1
message.

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

Ba `service` trong repo này (`ProductService`, `RecommendService`,
`DocsService`) — chi tiết từng RPC/message xem
[Tham chiếu proto](/proto-reference). Cả 3 hiện đều dùng **unary RPC**
(1 request → 1 response, giống hệt REST request/response) — gRPC còn hỗ trợ
streaming (client/server/bidirectional) nhưng platform này chưa cần tới.

## 5. `buf lint` vs `buf breaking` — hai "vệ sĩ" khác việc nhau

Ngay khi `.proto` (message + service + rpc) được sửa, hai công cụ này là thứ
đầu tiên chạy trên PR — trước cả khi có chuyện sinh code (mục 6):

| | `buf lint` | `buf breaking` |
| --- | --- | --- |
| Kiểm tra gì | **Style** — đặt tên, hậu tố, vị trí file... | **Tương thích ngược** — so với version trước |
| So sánh với gì | Không so sánh, chỉ soi chính file hiện tại | So với `main` (`--against '.git#branch=main'`) |
| Ví dụ lỗi bắt được | `service Product` thiếu hậu tố `Service`, field đặt `camelCase` thay vì `snake_case` | Đổi số field, đổi kiểu field, xóa RPC đang dùng |
| Cấu hình trong repo | `buf.yaml` → `lint.use: STANDARD`, trừ 2 rule tắt (xem [Tham chiếu proto](/proto-reference)) | `buf.yaml` → `breaking.use: FILE` |
| Chạy khi nào | Mọi PR/push proto | Mọi PR/push proto |

```bash
buf lint
buf breaking --against '.git#branch=main'
```

Hai lệnh này là **đúng những gì `ci.yml` chạy** — chạy local trước khi push
để không phải chờ CI báo lỗi.

## 6. Script `gen_proto.sh` / `make proto` — cầu nối `.proto` → code

Qua được `buf lint`/`buf breaking` rồi, bước tiếp theo là biến `.proto`
thành code thật cho từng ngôn ngữ:

| Service | Ngôn ngữ | Lệnh | Input | Output |
| --- | --- | --- | --- | --- |
| `gateway` | Python | `bash scripts/gen_proto.sh` | **cả 3** file `.proto` (là client của cả 3 service) | `src/grpc_gen/techscout/{product,recommend,docs}/v1/` |
| `product-service` | Go | `make proto` (trong `Makefile`) | `techscout/product/v1/product.proto` | `api/proto/product/v1/` |
| `rag-recommend` | Python | `bash scripts/gen_proto.sh` | chỉ `recommend.proto` (server của riêng service này) | `src/grpc_gen/techscout/recommend/v1/` |
| `rag-docs` | Python | `bash scripts/gen_proto.sh` | chỉ `docs.proto` | `src/grpc_gen/techscout/docs/v1/` |

Cả 3 script Python gọi chung một lệnh nền tảng:

```bash
uv run python -m grpc_tools.protoc -I proto \
  --python_out="$OUT" --grpc_python_out="$OUT" "${PROTOS[@]}"
```

`gateway` quét đệ quy toàn bộ `proto/techscout/**/*.proto` (vì nó là client
gọi cả 3 backend); `rag-docs`/`rag-recommend` chỉ định danh đúng 1 file (vì
mỗi service chỉ implement server cho đúng proto của mình). Go dùng `protoc`
trực tiếp với 2 plugin `--go_out`/`--go-grpc_out` thay vì `grpc_tools`.

::: tip Ai chạy script này, khi nào?
- **Dev chạy tay** khi cần test cục bộ sau khi tự bump submodule.
- **CI chạy hộ** trong `proto-sync.yml` của từng repo mỗi khi nhận
  `repository_dispatch` — output được **commit thẳng vào git**, vì
  Dockerfile của service dùng stub đã có sẵn, không chạy codegen lúc build
  image. Đây là lý do `proto-sync.yml` cần `PROTO_BOT_TOKEN` để push (xem
  [Luồng CI/CD](/ci-flow#3-phía-consumer-proto-guardyml-proto-syncyml)).
:::

## 7. `grpc_gen` — thư mục code sinh ra, đừng sửa tay

`grpc_gen/` (Python) hoặc `api/proto/<svc>/v1/` (Go) là **kết quả** của
script ở mục 6, gồm 2 loại file:

| File | Chứa gì | Ai dùng |
| --- | --- | --- |
| `*_pb2.py` / `*.pb.go` | Class cho từng `message` (vd. `Product`, `SearchRequest`) | Cả client lẫn server |
| `*_pb2_grpc.py` / `*_grpc.pb.go` | Class `...Stub` (cho client) **và** class `...Servicer`/interface (cho server implement) | Client dùng `Stub`, server implement `Servicer` |

```
services/gateway/src/grpc_gen/techscout/product/v1/
├── product_pb2.py          # message classes
├── product_pb2_grpc.py     # ProductServiceStub + ProductServiceServicer
└── __init__.py
```

Toàn bộ thư mục này **do máy sinh ra**, luôn có comment
`"""Generated gRPC stubs (do not edit; run scripts/gen_proto.sh)."""` — sửa
tay sẽ mất khi chạy lại script. Muốn đổi gì, sửa `.proto` rồi chạy lại
script sinh code (mục 6).

## 8. `grpc_server` — nơi backend implement hợp đồng

`grpc_server` là nơi service **đóng vai trò server**: implement class
`...Servicer` được sinh sẵn ở mục 7 (mỗi RPC trong `.proto` ứng với 1 method
cần override), rồi đăng ký nó vào một `grpc.Server` lắng nghe trên 1 cổng
TCP. Tương tự viết route handler Flask/Express, nhưng thay vì gắn theo URL
bạn override theo tên RPC — gRPC framework tự lo routing + (de)serialize.

```python
# services/rag-docs/src/grpc_server/service.py — implement hợp đồng
class DocsServicer(docs_pb2_grpc.DocsServiceServicer):
    def Query(self, request, context):
        ...
        return docs_pb2.QueryResponse(answer=answer, sources=sources)

# services/rag-docs/src/grpc_server/server.py — đăng ký + chạy server
def build_server(port: int) -> grpc.Server:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    docs_pb2_grpc.add_DocsServiceServicer_to_server(DocsServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    return server
```

Phía Go (`product-service`) làm tương tự, chỉ khác cú pháp:

```go
// services/product-service/cmd/server/grpc_enabled.go
s := grpc.NewServer()
productv1.RegisterProductServiceServer(s, grpcsrv.New(svc))
reflection.Register(s)
s.Serve(lis)
```

`rag-recommend` có cấu trúc `src/grpc_server/` y hệt `rag-docs`.
`product-service` không có thư mục `grpc_server` riêng — logic nằm trong
`internal/handler/grpcsrv/`, gọi từ `cmd/server/grpc_enabled.go` (chỉ build
khi có tag `grpc`, xem `Makefile`). `gateway` **không có** `grpc_server` —
nó chỉ đóng vai trò client (mục 9), không implement RPC nào.

::: tip Sinh tự động hay viết tay?
Khác với `grpc_gen` (mục 7, do máy sinh), **`grpc_server` luôn là code viết
tay** — `protoc`/`buf` chỉ sinh ra "khung" (`Servicer` base class rỗng), còn
logic nghiệp vụ bên trong (`Query` gọi retriever nào, `Create` ghi DB nào...)
không script nào biết để sinh hộ. Xem mục 12 để biết điều này ảnh hưởng gì
khi có version mới.
:::

## 9. `stub` — client sinh sẵn, gọi RPC như gọi hàm local

`stub` là class được `protoc`/`buf` **sinh tự động** từ `service` (nằm trong
`grpc_gen`, mục 7), đóng vai trò client: bạn gọi `stub.Search(request)`
giống gọi một hàm Python/Go bình thường, phía dưới nó tự lo serialize
message → gửi qua HTTP/2 → nhận response → deserialize ngược lại. Đây là
điểm khác lớn nhất so với REST, nơi bạn phải tự ghép URL, tự set header, tự
`json.loads()` response.

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

`ProductServiceStub` được sinh sẵn trong
`services/gateway/src/grpc_gen/techscout/product/v1/product_pb2_grpc.py` —
không ai viết tay class này, nó tự sinh lại mỗi lần chạy `gen_proto.sh`
(mục 6). Trong platform này, **chỉ `gateway` đóng vai trò client** — 3
backend còn lại chỉ implement server (mục 8), không gọi ngược lại nhau.

## 10. `channel` — kết nối tới server (tương đương connection/socket giữ lâu dài)

`channel` là một kết nối HTTP/2 tới `host:port` của server, được **giữ và
tái sử dụng** cho nhiều RPC liên tiếp thay vì mở/đóng mỗi lần gọi — nhờ
HTTP/2 hỗ trợ multiplexing, nhiều RPC có thể chạy đồng thời trên cùng một
`channel` mà không cần connection pool ở tầng ứng dụng như HTTP/1.1 thường
làm.

```python
# services/gateway/src/clients/base.py
async def _stub_for_call(self):
    addr = await self.resolver.resolve(self.service_name, self.fallback_addr)
    if self._stub is None or addr != self._addr:
        if self._channel is not None:
            await self._channel.close()
        self._channel = grpc.aio.insecure_channel(addr)   # <- channel
        self._stub = self._build_stub(self._channel)      # <- stub được build từ channel
        self._addr = addr
    return self._stub
```

Đoạn code này minh họa rõ **phụ thuộc**: `stub` (mục 9) luôn cần một
`channel` để tạo ra (`ProductServiceStub(channel)`); `channel` chỉ cần địa
chỉ `host:port` (ở đây lấy từ service-registry, có fallback tĩnh). Gateway
chỉ tạo `channel` mới khi địa chỉ đổi, còn lại tái sử dụng — tương tự việc
giữ 1 kết nối keep-alive thay vì mở kết nối HTTP mới cho mỗi request.

## 11. `version` (`.v1`) — mỗi contract gắn với 1 version cố định

Mỗi file sống tại `techscout/<svc>/v1/<svc>.proto`, khớp 1:1 với
`package techscout.<svc>.v1;`. Muốn breaking change, **không sửa `v1` tại
chỗ** — tạo `techscout/<svc>/v2/` song song, `v1` vẫn chạy cho tới khi mọi
consumer migrate xong. Mục này chỉ tóm tắt khái niệm; **`grpc_server` cụ thể
thay đổi ra sao khi có `v2`** → xem mục 12 ngay bên dưới. Quy trình đầy đủ
(kèm checklist) xem
[Quy trình cập nhật proto § Thêm version mới](/updating-protos#thêm-version-mới-v2-song-song-với-v1).

## 12. Khi thêm version mới (v2), `grpc_server` cập nhật thế nào?

Điểm quan trọng cần phân biệt (đã nhắc ở mục 8): `grpc_gen` là code **sinh tự
động**, còn `grpc_server` là code **viết tay**. Khi có `v2`, phần **sinh
code** tự lo, nhưng phần **implement logic nghiệp vụ** luôn cần một người
viết tay — không có tool nào tự sinh ra "logic" cho bạn.

### Việc gì tự động, việc gì phải tự tay làm

| Bước | Tự động hay thủ công? | Thực hiện ở đâu |
| --- | --- | --- |
| Thêm `techscout/<svc>/v2/<svc>.proto`, đổi `package` sang `.v2` | Thủ công (dev viết proto) | `techscout-protos` |
| Bump submodule để có cả `v1` + `v2` | Tự động (`proto-sync.yml`) hoặc `git submodule update --remote` thủ công | Repo tiêu thụ |
| Sinh `grpc_gen/.../v2/*_pb2.py` + `*_pb2_grpc.py` — trong đó có `Servicer` base class **mới, rỗng** cho v2 | Tự động — chạy lại script mục 6 | `gen_proto.sh` / `make proto` |
| Viết class implement servicer v2 (logic nghiệp vụ thật) | **Luôn thủ công** | `grpc_server/service.py` (Python) hoặc `internal/handler/grpcsrv` (Go) |
| Đăng ký **cả `v1` lẫn `v2`** trên cùng một `grpc.Server` | **Thủ công** — sửa file build server | `grpc_server/server.py` hoặc `cmd/server/grpc_enabled.go` |

### `grpc_server` nằm ở đâu, dùng để làm gì

`grpc_server` là nơi **duy nhất** chứa logic nghiệp vụ thật (gọi retriever,
LLM, DB...) — khác `grpc_gen` chỉ có "khung" class rỗng để implement. Vị trí
cụ thể theo từng service, và việc cần thêm khi có `v2`:

| Service | File hiện có (`v1`) | Khi thêm `v2`, cần thêm gì |
| --- | --- | --- |
| `rag-docs` | `src/grpc_server/service.py` (`DocsServicer`), `src/grpc_server/server.py` (`build_server`) | Class servicer mới (ví dụ `DocsServicerV2`) implement `Servicer` sinh ra từ `v2`; `build_server()` gọi thêm `add_DocsServiceServicer_to_server(...)` phiên bản `v2` trên **cùng** một `server` |
| `rag-recommend` | `src/grpc_server/` (cấu trúc y hệt `rag-docs`) | Tương tự — thêm servicer `v2`, đăng ký thêm trong `server.py` |
| `product-service` | `internal/handler/grpcsrv/` (implement) + `cmd/server/grpc_enabled.go` (gọi `RegisterProductServiceServer`) | Thêm handler `v2` trong `grpcsrv`, `grpc_enabled.go` gọi thêm `productv2.RegisterProductServiceServer(s, ...)` trên **cùng** `s := grpc.NewServer()` (đúng ví dụ đã nêu trong [Quy trình cập nhật proto](/updating-protos#thêm-version-mới-v2-song-song-với-v1)) |
| `gateway` | Không có `grpc_server` — chỉ là **client** (`src/clients/`) | Không cần đăng ký gì phía server; chỉ đổi `stub` sang import `v2` khi sẵn sàng migrate (mục 9) |

::: warning Tên class ở trên chỉ là ví dụ minh họa
`DocsServicerV2`, `grpcsrv.NewV2(...)` không phải tên đã tồn tại sẵn trong
repo — hiện tại cả 3 service mới chỉ có `v1`. Đây là cách đặt tên hợp lý
theo đúng khuôn mẫu Go đã dùng thật trong
[Quy trình cập nhật proto](/updating-protos#thêm-version-mới-v2-song-song-với-v1)
(`productv1.RegisterProductServiceServer(...)` **và**
`productv2.RegisterProductServiceServer(...)` trên cùng `grpc.Server`), áp
dụng tương tự sang Python.
:::

### Trình tự cập nhật `grpc_server` khi ra `v2`

1. Bump submodule → có cả `techscout/<svc>/v1/` và `techscout/<svc>/v2/`
   trong `proto/`.
2. Chạy lại `gen_proto.sh`/`make proto` (mục 6) → `grpc_gen`/`api/proto` có
   thêm cây `v2/` **song song** `v1` (không ghi đè).
3. **Tự viết** class servicer mới cho `v2` — thường bắt đầu bằng cách copy
   logic từ servicer `v1`, rồi chỉnh theo message/field mới của `v2`.
4. Sửa `server.py`/`grpc_enabled.go`: đăng ký **cả hai** servicer (`v1` và
   `v2`) trên cùng một `grpc.Server`/cùng một cổng — client cũ và mới đều
   được phục vụ song song trong giai đoạn chuyển tiếp.
5. Deploy — server giờ trả lời được cả 2 version cùng lúc, không service nào
   bị gián đoạn.
6. Khi gateway (client) đã chuyển hết sang gọi `v2` và không còn traffic
   `v1`: gỡ registration + xóa class servicer `v1` khỏi `grpc_server`, xóa
   `techscout/<svc>/v1/` khỏi `techscout-protos` (chi tiết bước dọn dẹp xem
   [Quy trình cập nhật proto](/updating-protos#thêm-version-mới-v2-song-song-với-v1)).

::: tip Vì sao không có tool tự sinh servicer?
`protoc`/`buf` chỉ biết **hình dạng** dữ liệu và chữ ký hàm (từ `.proto`),
không biết bạn muốn hàm đó làm gì (query database nào, gọi LLM nào...) — đó
là lý do `Servicer`/interface luôn cần người viết tay, trong khi `Stub` phía
client (mục 9) thì sinh tự động hoàn chỉnh, vì phía client chỉ cần gọi qua
mạng, không có logic nghiệp vụ nào để quyết định.
:::

## 13. Thứ tự cập nhật 1 proto — bản tóm tắt nhanh

1. Sửa `.proto` trên 1 branch mới.
2. Chạy `buf lint` + `buf breaking` local (mục 5) — sửa tới khi cả hai pass.
3. Mở PR vào `main` → `ci.yml` chạy lại đúng 2 lệnh trên, chặn merge nếu fail.
4. Merge → `dispatch-on-change.yml` phát hiện file đổi, gửi
   `repository_dispatch` đúng tới repo tiêu thụ file đó.
5. Mỗi repo tiêu thụ tự chạy `proto-sync.yml`: bump submodule → chạy
   `gen_proto.sh`/`make proto` (mục 6) → commit stub mới → trigger build/deploy.
6. Nếu là breaking change thật sự: dùng `v2` song song thay vì sửa `v1`
   (mục 11), rồi cả server (`grpc_server` — chi tiết ở mục 12) lẫn client
   (`stub`/`channel` — mục 9, 10) tự chọn thời điểm migrate.

Chi tiết từng bước, kèm cách thêm proto mới hoàn toàn hoặc xóa RPC không dùng
→ xem trọn [Quy trình cập nhật proto](/updating-protos). Chuỗi sự kiện CI
đầy đủ (workflow nào chạy khi nào) → xem [Luồng CI/CD](/ci-flow).

## 14. Luồng hoạt động & phụ thuộc giữa các khái niệm

Đọc sơ đồ theo chiều mũi tên, từ trên xuống rồi rẽ nhánh: **server** cần code
sinh ra để có `Servicer` base class mà implement; **client** cần code sinh ra
để có `Stub` + `message` class, và cần một `channel` để `Stub` gọi qua mạng.
Cả hai phía luôn build từ **cùng một** `.proto` (qua git submodule) — đó là
lý do toàn bộ hạ tầng CI trong [Luồng CI/CD](/ci-flow) tồn tại: đảm bảo mọi
consumer generate lại code đúng lúc `.proto` đổi, để client và server không
bao giờ lệch hợp đồng.

<svg viewBox="0 0 880 500" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;display:block;margin:24px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <marker id="arrow-vi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--vp-c-brand-1, #3451b2)" />
    </marker>
  </defs>

  <rect x="290" y="10" width="300" height="66" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="440" y="34" text-anchor="middle" font-size="13" font-weight="600" fill="var(--vp-c-text-1, #213547)">.proto</text>
  <text x="440" y="52" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">message + service + rpc</text>
  <text x="440" y="67" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">= "hợp đồng" (mục 2-4)</text>

  <line x1="440" y1="76" x2="440" y2="110" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-vi)" />
  <text x="452" y="97" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">buf lint / buf breaking</text>
  <text x="452" y="109" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">- vệ sĩ, chạy trước merge (mục 5)</text>

  <rect x="270" y="112" width="340" height="56" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1.5" />
  <text x="440" y="136" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">gen_proto.sh (Python)</text>
  <text x="440" y="153" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">make proto (Go) - mục 6</text>

  <line x1="440" y1="168" x2="440" y2="200" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-vi)" />

  <rect x="140" y="202" width="600" height="72" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1.5" />
  <text x="440" y="226" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">grpc_gen/*_pb2.py + *_pb2_grpc.py</text>
  <text x="440" y="244" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">(hoặc api/proto/.../*.pb.go) - code sinh ra, mục 7</text>
  <text x="440" y="261" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">message classes . Stub class . Servicer base class</text>

  <line x1="300" y1="274" x2="190" y2="330" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-vi)" />
  <text x="150" y="300" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">Servicer base class</text>

  <line x1="580" y1="274" x2="690" y2="330" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-vi)" />
  <text x="640" y="300" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">Stub + message</text>

  <rect x="30" y="332" width="340" height="106" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="200" y="357" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--vp-c-brand-1, #3451b2)">SERVER</text>
  <text x="200" y="376" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">grpc_server</text>
  <text x="200" y="393" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">implement Servicer (mục 8)</text>
  <text x="200" y="409" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">logic nghiệp vụ - viết tay (mục 12)</text>
  <text x="200" y="425" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">rag-docs, rag-recommend, product-service</text>

  <rect x="510" y="332" width="340" height="106" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="680" y="357" text-anchor="middle" font-size="10.5" font-weight="700" fill="var(--vp-c-brand-1, #3451b2)">CLIENT</text>
  <text x="680" y="376" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">stub + channel</text>
  <text x="680" y="393" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">gateway gọi ra (mục 9, 10)</text>
  <text x="680" y="409" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">resolver -&gt; channel -&gt; stub.Search(...)</text>
  <text x="680" y="425" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">chỉ services/gateway</text>

  <line x1="370" y1="385" x2="510" y2="385" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-vi)" marker-start="url(#arrow-vi)" />
  <text x="440" y="470" text-anchor="middle" font-size="11.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">HTTP/2 (RPC)</text>
  <text x="440" y="486" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">channel giữ kết nối, multiplex nhiều RPC</text>
</svg>

## 15. Vì sao platform này chọn gRPC (thay vì thuần HTTP/JSON)?

- **Giao tiếp nội bộ, tần suất cao**: gateway gọi xuống 3 backend liên tục
  (mỗi request người dùng có thể kéo theo vài RPC) — payload binary nhỏ hơn,
  encode/decode nhanh hơn JSON đáng kể ở quy mô này.
- **Hợp đồng bắt buộc, không thể lệch**: `.proto` vừa là tài liệu vừa là
  nguồn sinh code cho cả Go (`product-service`) lẫn Python (`gateway`,
  `rag-docs`, `rag-recommend`) — không có kiểu "server đổi field mà client
  quên cập nhật" vì client/server đều generate từ cùng 1 file, cùng 1 commit
  submodule.
- **`buf lint`/`buf breaking` tự động hóa review contract**: REST/JSON không
  có công cụ tương đương chuẩn hóa sẵn để chặn breaking change ngay trong CI
  — ở đây một PR đổi số field sai sẽ fail trước khi merge, không phải phát
  hiện lúc chạy production.
- **HTTP/2 multiplexing**: nhiều RPC đồng thời share 1 `channel`, giảm
  overhead so với mở nhiều kết nối HTTP/1.1.
- **Không đánh đổi trải nghiệm public API**: gRPC chỉ dùng **nội bộ**
  (gateway ⇄ backend); trình duyệt/FE vẫn gọi gateway qua HTTP/REST bình
  thường — gateway đứng giữa "dịch" 2 chiều, nên không mất tính dễ dùng của
  REST ở phía ngoài.

::: tip Đánh đổi (trade-off) cần biết
gRPC không human-readable trực tiếp (không `curl` xem JSON được như REST —
cần công cụ như `grpcurl`/`buf curl`), và không chạy thẳng từ trình duyệt
nếu không có gateway/proxy dịch — đây chính là lý do platform dùng mô hình
"gRPC nội bộ + HTTP/REST ở edge" thay vì gRPC toàn hệ thống.
:::
