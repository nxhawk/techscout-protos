# Khái niệm gRPC & Proto cơ bản

Trang này dành cho người mới đụng vào `techscout-protos` lần đầu: giải thích
từng thuật ngữ (gRPC, stub, channel, protobuf, service, message, rpc,
version, `buf breaking`, `buf lint`...), script `gen_proto`/`grpc_gen`/
`grpc_server` thực tế trong 4 repo tiêu thụ, luồng hoạt động + phụ thuộc giữa
các khái niệm, và **vì sao** platform chọn gRPC thay vì HTTP/REST thuần —
luôn kèm liên hệ với HTTP cho ai quen REST hơn.

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
thay đổi này là breaking (xem mục 9).

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

## 5. `stub` — client sinh sẵn, gọi RPC như gọi hàm local

`stub` là class được `protoc`/`buf` **sinh tự động** từ `service`, đóng vai
trò client: bạn gọi `stub.Search(request)` giống gọi một hàm Python/Go bình
thường, phía dưới nó tự lo serialize message → gửi qua HTTP/2 → nhận response
→ deserialize ngược lại. Đây là điểm khác lớn nhất so với REST, nơi bạn phải
tự ghép URL, tự set header, tự `json.loads()` response.

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
`services/gateway/src/grpc_gen/techscout/product/v1/product_pb2_grpc.py` — không
ai viết tay class này, nó tự sinh lại mỗi lần chạy `gen_proto.sh` (mục 8).

## 6. `channel` — kết nối tới server (tương đương connection/socket giữ lâu dài)

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

Đoạn code này minh họa rõ **phụ thuộc**: `stub` luôn cần một `channel` để
tạo ra (`ProductServiceStub(channel)`); `channel` chỉ cần địa chỉ
`host:port` (ở đây lấy từ service-registry, có fallback tĩnh). Gateway chỉ
tạo `channel` mới khi địa chỉ đổi, còn lại tái sử dụng — tương tự việc giữ
1 kết nối keep-alive thay vì mở kết nối HTTP mới cho mỗi request.

## 7. `grpc_gen` — thư mục code sinh ra, đừng sửa tay

`grpc_gen/` (Python) hoặc `api/proto/<svc>/v1/` (Go) là **kết quả sinh code**
từ `.proto`, gồm 2 loại file:

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
script sinh code (mục 9).

## 8. `grpc_server` — nơi backend implement hợp đồng

`grpc_server` là nơi service **đóng vai trò server**: implement class
`...Servicer` được sinh sẵn (mỗi RPC trong `.proto` ứng với 1 method cần
override), rồi đăng ký nó vào một `grpc.Server` lắng nghe trên 1 cổng TCP.
Tương tự viết route handler Flask/Express, nhưng thay vì gắn theo URL bạn
override theo tên RPC — gRPC framework tự lo routing + (de)serialize.

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
khi có tag `grpc`, xem `Makefile`).

## 9. Script `gen_proto.sh` / `make proto` — cầu nối `.proto` → code

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

## 10. `version` (`.v1`) — mỗi contract gắn với 1 version cố định

Mỗi file sống tại `techscout/<svc>/v1/<svc>.proto`, khớp 1:1 với
`package techscout.<svc>.v1;`. Muốn breaking change, **không sửa `v1` tại
chỗ** — tạo `techscout/<svc>/v2/` song song, `v1` vẫn chạy cho tới khi mọi
consumer migrate xong. Đây chỉ là tóm tắt khái niệm; quy trình đầy đủ (kèm
checklist) xem [Quy trình cập nhật proto § Thêm version mới](/updating-protos#thêm-version-mới-v2-song-song-với-v1).

## 11. `buf lint` vs `buf breaking` — hai "vệ sĩ" khác việc nhau

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

## 12. Thứ tự cập nhật 1 proto — bản tóm tắt nhanh

1. Sửa `.proto` trên 1 branch mới.
2. Chạy `buf lint` + `buf breaking` local — sửa tới khi cả hai pass.
3. Mở PR vào `main` → `ci.yml` chạy lại đúng 2 lệnh trên, chặn merge nếu fail.
4. Merge → `dispatch-on-change.yml` phát hiện file đổi, gửi
   `repository_dispatch` đúng tới repo tiêu thụ file đó.
5. Mỗi repo tiêu thụ tự chạy `proto-sync.yml`: bump submodule → chạy
   `gen_proto.sh`/`make proto` → commit stub mới → trigger build/deploy.
6. Nếu là breaking change thật sự: dùng `v2` song song thay vì sửa `v1`
   (mục 10), rồi cả server lẫn client tự chọn thời điểm migrate.

Chi tiết từng bước, kèm cách thêm proto mới hoàn toàn hoặc xóa RPC không dùng
→ xem trọn [Quy trình cập nhật proto](/updating-protos). Chuỗi sự kiện CI
đầy đủ (workflow nào chạy khi nào) → xem [Luồng CI/CD](/ci-flow).

## 13. Luồng hoạt động & phụ thuộc giữa các khái niệm

```text
.proto (message + service + rpc = "hợp đồng")
   │
   │  buf lint / buf breaking  ← vệ sĩ, chạy trước khi merge (mục 11)
   ▼
gen_proto.sh (Python) / make proto (Go)   ← script cầu nối (mục 9)
   │
   ▼
grpc_gen/*_pb2.py + *_pb2_grpc.py   (hoặc api/proto/.../*.pb.go)  ← code sinh ra (mục 7)
   │                                   │
   │ message classes              Stub class        Servicer base class
   │ (dùng ở cả 2 phía)           (cho CLIENT)       (cho SERVER implement)
   │                                   │                     │
   ▼                                   ▼                     ▼
grpc_server/service.py            channel + stub        grpc_server/server.py
(implement Servicer,              (mục 5, 6 —          (đăng ký Servicer,
 mục 8)                            gateway gọi ra)       add_insecure_port, mục 8)
                                        │                     │
                                        └──── HTTP/2 (RPC) ───┘
```

Đọc theo chiều phụ thuộc: **server** cần code sinh ra để có `Servicer` base
class mà implement; **client** cần code sinh ra để có `Stub` + `message`
class, và cần một `channel` để `Stub` gọi qua mạng. Cả hai phía luôn build từ
**cùng một** `.proto` (qua git submodule) — đó là lý do toàn bộ hạ tầng CI
trong [Luồng CI/CD](/ci-flow) tồn tại: đảm bảo mọi consumer generate lại code
đúng lúc `.proto` đổi, để client và server không bao giờ lệch hợp đồng.

## 14. Vì sao platform này chọn gRPC (thay vì thuần HTTP/JSON)?

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
