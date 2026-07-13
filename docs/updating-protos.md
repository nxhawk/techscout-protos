# Quy trình cập nhật một proto

## Nguyên tắc cốt lõi

> **Chỉ sửa `.proto` ở đây.** Không bao giờ sửa trực tiếp file trong thư mục
> submodule ở repo service — `proto-guard.yml` ở mỗi consumer sẽ chặn PR nếu
> submodule có local edit.

## Phân loại thay đổi

| Loại | Ví dụ | An toàn? |
| --- | --- | --- |
| **Không phá vỡ (non-breaking)** | Thêm field mới với số field chưa dùng, thêm RPC mới, thêm message mới, thêm giá trị enum mới ở cuối | ✅ Có thể merge thẳng, `buf breaking` sẽ pass |
| **Phá vỡ (breaking)** | Đổi số field, đổi kiểu field, xóa field/RPC đang dùng, đổi tên field/message/service, đổi `package` | ❌ `buf breaking` sẽ **fail** CI — phải cân nhắc lại thiết kế hoặc làm version mới (`v2`) |

## Các bước thực hiện

### 1. Tạo branch & sửa proto

```bash
git checkout -b feat/product-add-category
# sửa techscout/product/v1/product.proto, techscout/recommend/v1/recommend.proto hoặc techscout/docs/v1/docs.proto
```

Một vài quy ước bắt buộc (do `buf lint` với ruleset `STANDARD` kiểm tra):

- Message/Service dùng `PascalCase`, field dùng `snake_case`.
- Package phải có hậu tố version, ví dụ `techscout.product.v1`.
- Service phải có hậu tố `Service` (`ProductService`, không phải `Product`).
- Request message phải có hậu tố `Request` (`SearchRequest`).
- Không dùng `required` (proto3 semantics).
- Đường dẫn file phải khớp package: `techscout.product.v1` → `techscout/product/v1/product.proto` (rule `DIRECTORY_SAME_PACKAGE`/`PACKAGE_DIRECTORY_MATCH`, đang bật trong `buf.yaml`).

### 2. Lint + kiểm tra breaking local (bắt buộc trước khi push)

```bash
buf lint
buf breaking --against '.git#branch=main'
```

Nếu `buf breaking` báo lỗi, xem xét:

- Có thể đổi thành thêm field mới thay vì sửa field cũ không?
- Nếu thực sự cần breaking change, tạo **version mới** (`v2`) — xem mục ngay
  bên dưới — thay vì sửa `v1` tại chỗ.

### 3. Mở PR vào `main`

`ci.yml` tự chạy `buf lint` + `buf breaking` trên PR. PR chỉ nên merge khi job
này xanh.

### 4. Merge vào `main` — phần còn lại là tự động

Sau khi merge:

1. `dispatch-on-change.yml` phát hiện đúng file `.proto` vừa đổi, map sang danh
   sách repo tiêu thụ, gửi `repository_dispatch`.
2. Mỗi repo tiêu thụ tự chạy `proto-sync.yml`: kéo submodule mới nhất, sinh lại
   stub, commit, push → trigger build/deploy của service đó.
3. Bạn **không cần** tự vào từng repo service để bump submodule — trừ khi muốn
   test thủ công (`workflow_dispatch` trên `proto-sync.yml` của service, hoặc
   `git submodule update --remote` local).

Xem chi tiết từng bước ở [Luồng CI/CD chi tiết](/ci-flow).

## Thêm một proto hoàn toàn mới

Nếu bạn thêm một file `.proto` mới (ví dụ `inventory.proto` cho một service
mới), ngoài việc viết proto, cần cập nhật thêm 2 chỗ:

1. **`dispatch-on-change.yml`** — thêm dòng vào `declare -A CONSUMERS` map
   trong bước "Map protos -> consumer repos":

   ```bash
   declare -A CONSUMERS=(
     ["techscout/product/v1/product.proto"]="techscout-gateway techscout-product-service"
     ["techscout/recommend/v1/recommend.proto"]="techscout-gateway techscout-rag-recommend"
     ["techscout/docs/v1/docs.proto"]="techscout-gateway techscout-rag-docs"
     ["techscout/inventory/v1/inventory.proto"]="techscout-gateway techscout-inventory-service"  # thêm dòng này
   )
   ```

2. **`README.md`** — thêm dòng vào bảng "Contract → consumers" để người sau dễ
   tra cứu.

Nếu quên bước 1, proto mới vẫn được lint/breaking-check bình thường, nhưng
**sẽ không dispatch tới service nào** — service phải tự chạy `proto-sync.yml`
bằng tay hoặc chờ `workflow_dispatch` với input `protos` chứa tên file mới.

## Thêm version mới (v2) song song với v1

Vì mỗi contract đã nằm ở `techscout/<svc>/v1/<svc>.proto` (thư mục riêng theo
version), thêm `v2` **không đụng** tới `v1` đang chạy — hai version tồn tại
song song, mỗi consumer tự chọn thời điểm migrate. Đây là cách được khuyến
nghị mỗi khi cần một **breaking change** thật sự.

### Các bước chi tiết

**A. Phía `techscout-protos` (repo này)**

1. Tạo thư mục `techscout/<svc>/v2/` và copy nội dung từ
   `techscout/<svc>/v1/<svc>.proto` sang `techscout/<svc>/v2/<svc>.proto`.
2. Đổi khai báo `package techscout.<svc>.v1;` → `package techscout.<svc>.v2;`.
3. Áp breaking change / thiết kế lại field, RPC, message theo nhu cầu — file
   `v1` **giữ nguyên, không sửa**.
4. Nếu service viết bằng Go (như `product-service`), đổi `go_package` trong
   file `v2` sang thư mục riêng, ví dụ:
   `option go_package = ".../api/proto/product/v2;productv2";` (khác `v1` để
   không ghi đè code sinh ra).
5. Chạy `buf lint` — `buf breaking` **không** áp dụng cho file `v2` vì đây là
   file hoàn toàn mới (không có gì ở `main` để so sánh), nhưng vẫn nên chạy để
   chắc chắn không phá vỡ chính `v1` do nhầm lẫn khi copy.
6. Thêm dòng cho `v2` vào bảng "Contract → consumers" trong `README.md`.
7. Thêm entry mới vào `CONSUMERS` trong `dispatch-on-change.yml`, key là full
   path:

   ```bash
   declare -A CONSUMERS=(
     ["techscout/product/v1/product.proto"]="techscout-gateway techscout-product-service"
     ["techscout/product/v2/product.proto"]="techscout-gateway techscout-product-service"  # thêm dòng này — danh sách có thể khác v1 nếu chỉ một phần consumer đã sẵn sàng
     ...
   )
   ```

8. Mở PR, merge vào `main` như quy trình bình thường ở trên.

**B. Phía từng service tiêu thụ (tự chọn thời điểm, không bắt buộc đồng loạt)**

1. Bump submodule (`git submodule update --remote --recursive proto` hoặc chờ
   `proto-sync.yml` tự chạy) để có cả `v1` lẫn `v2` trong thư mục `proto/`.
2. Sinh code cho `v2` **song song** `v1` (không xóa code sinh ra của `v1`):
   - Python (gateway, rag-docs, rag-recommend): thêm target/`gen_proto.sh` trỏ
     `proto/techscout/<svc>/v2/<svc>.proto`, output vào
     `src/grpc_gen/techscout/<svc>/v2/`.
   - Go (product-service): thêm target `proto-v2` trong `Makefile` trỏ
     `api/proto/shared/techscout/product/v2/product.proto`, output vào
     `api/proto/product/v2/`.
3. Ở phía **server** (service implement contract): đăng ký cả hai version trên
   cùng instance — ví dụ Go: gọi cả
   `productv1.RegisterProductServiceServer(...)` và
   `productv2.RegisterProductServiceServer(...)` trên cùng `grpc.Server`. Nhờ
   vậy client cũ (`v1`) và client mới (`v2`) đều được phục vụ trong lúc chuyển
   tiếp.
4. Ở phía **client** (gateway gọi service khác): đổi import từ
   `...techscout.<svc>.v1` sang `...techscout.<svc>.v2` khi sẵn sàng — có thể
   làm từng service một, không cần đồng loạt.
5. Chạy test/staging trên `v2` trước khi để traffic thật đi qua.

**C. Dọn dẹp khi mọi consumer đã migrate xong**

1. `grep` toàn bộ 4 repo service để chắc chắn không còn ai import
   `techscout.<svc>.v1` / `techscout/<svc>/v1/` nữa.
2. Xóa `techscout/<svc>/v1/` khỏi `techscout-protos`, gỡ entry `v1` khỏi
   `CONSUMERS` trong `dispatch-on-change.yml` và khỏi bảng trong `README.md`.
3. Ở từng service: gỡ code sinh ra cho `v1` (`src/grpc_gen/.../v1` hoặc
   `api/proto/.../v1`), gỡ handler/registration cho `v1` ở phía server.

### Checklist

- [ ] Tạo `techscout/<svc>/v2/<svc>.proto`, đổi `package` sang `.v2`, giữ
      nguyên file `v1`
- [ ] (Go) Đổi `go_package` trong file `v2` sang thư mục `v2` riêng
- [ ] `buf lint` pass cho file mới
- [ ] Thêm dòng `v2` vào bảng "Contract → consumers" trong `README.md`
- [ ] Thêm entry `v2` vào `CONSUMERS` trong `dispatch-on-change.yml`
- [ ] Merge PR vào `main`
- [ ] Mỗi service tự bump submodule, sinh code cho `v2` **song song** `v1`
      (không xóa code `v1`)
- [ ] Server: đăng ký/handle cả `v1` và `v2` cùng lúc trong giai đoạn chuyển
      tiếp
- [ ] Client (gateway): chuyển import sang `v2` từng service một, có test
      trước khi đổi traffic thật
- [ ] Sau khi xác nhận không còn consumer nào dùng `v1` (grep toàn repo): xóa
      `techscout/<svc>/v1/` + entry liên quan trong `dispatch-on-change.yml`
      và `README.md`, gỡ code sinh ra cho `v1` ở từng service

## Xóa một proto / một RPC không dùng nữa

`buf breaking` sẽ chặn việc này theo mặc định vì coi là breaking change. Quy
trình khuyến nghị:

1. Xác nhận **không còn consumer nào gọi RPC/field đó** (kiểm tra ở 4 repo
   service).
2. Nếu chắc chắn an toàn, thêm exception có mục tiêu vào `buf.yaml`
   (`breaking.ignore` cho đúng file/path đó) kèm comment giải thích, thay vì
   tắt `breaking` toàn cục.
3. Sau khi merge, thông báo cho team trước qua Discord/README — vì đây là thay
   đổi có chủ đích phá vỡ tương thích.

## Docs của trang này thay đổi thì sao?

Nếu bạn chỉ sửa nội dung trong `docs/` (kể cả trang này), **không cần** làm gì
ở bước lint/breaking/dispatch — `docs.yml` sẽ tự build & deploy lại trang, còn
`ci.yml` và `dispatch-on-change.yml` sẽ bỏ qua commit đó hoàn toàn (xem bảng ở
cuối trang [Luồng CI/CD](/ci-flow#summary-table)).
