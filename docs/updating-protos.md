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
# sửa product.proto, recommend.proto hoặc docs.proto
```

Một vài quy ước bắt buộc (do `buf lint` với ruleset `STANDARD` kiểm tra):

- Message/Service dùng `PascalCase`, field dùng `snake_case`.
- Package phải có hậu tố version, ví dụ `techscout.product.v1`.
- Service phải có hậu tố `Service` (`ProductService`, không phải `Product`).
- Request message phải có hậu tố `Request` (`SearchRequest`).
- Không dùng `required` (proto3 semantics).

### 2. Lint + kiểm tra breaking local (bắt buộc trước khi push)

```bash
buf lint
buf breaking --against '.git#branch=main'
```

Nếu `buf breaking` báo lỗi, xem xét:

- Có thể đổi thành thêm field mới thay vì sửa field cũ không?
- Nếu thực sự cần breaking change, cân nhắc tạo **file/`package` version mới**
  (`techscout.product.v2`) thay vì sửa `v1` — giữ `v1` chạy song song cho tới
  khi mọi consumer migrate xong.

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
     ["product.proto"]="techscout-gateway techscout-product-service"
     ["recommend.proto"]="techscout-gateway techscout-rag-recommend"
     ["docs.proto"]="techscout-gateway techscout-rag-docs"
     ["inventory.proto"]="techscout-gateway techscout-inventory-service"  # thêm dòng này
   )
   ```

2. **`README.md`** — thêm dòng vào bảng "Contract → consumers" để người sau dễ
   tra cứu.

Nếu quên bước 1, proto mới vẫn được lint/breaking-check bình thường, nhưng
**sẽ không dispatch tới service nào** — service phải tự chạy `proto-sync.yml`
bằng tay hoặc chờ `workflow_dispatch` với input `protos` chứa tên file mới.

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
