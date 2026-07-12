# Luồng CI/CD chi tiết

`techscout-protos` có 4 workflow trong repo này, cộng thêm 2 workflow ở **mỗi**
repo tiêu thụ (gateway, product-service, rag-recommend, rag-docs). Trang này giải
thích từng workflow, khi nào nó chạy, và toàn bộ chuỗi sự kiện từ lúc bạn sửa một
`.proto` đến lúc service được deploy.

## Sơ đồ tổng quan

```text
 Dev sửa *.proto ──push/PR main──▶ ci.yml (buf lint + breaking)
        │
        └─push main, path **/*.proto──▶ dispatch-on-change.yml
                                              │
                                    xác định proto nào đổi
                                              │
                                    map proto ─▶ danh sách repo tiêu thụ
                                              │
                                    repository_dispatch "proto-updated"
                                              │
                       ┌──────────────────────┼──────────────────────┐
                       ▼                      ▼                      ▼
                 gateway/proto-sync.yml  product-service/proto-sync.yml  rag-*/proto-sync.yml
                       │ (mỗi repo, độc lập)
                 git submodule update --remote
                 regenerate gRPC stubs
                 commit + push (PROTO_BOT_TOKEN)
                       │
                 trigger docker.yml của service đó
                       │
                 build image → deploy → service-updated

 Dev sửa docs/** ──push main, path docs/**──▶ docs.yml (build + deploy Pages)
                                              (KHÔNG chạy ci.yml, KHÔNG chạm
                                               dispatch-on-change.yml)
```

## 1. `ci.yml` — buf lint + breaking change guard

**Trigger:** `push` hoặc `pull_request` vào `main`, giới hạn ở các path liên quan
đến proto (`**/*.proto`, `buf.yaml`, `buf.gen.yaml`) — các commit chỉ đổi
`docs/**` sẽ **không** kích hoạt job này.

**Việc nó làm:**

1. Checkout full history (`fetch-depth: 0` — cần thiết để `buf breaking` so sánh
   với `main`).
2. Chạy `bufbuild/buf-action@v1` với:
   - `lint: true` — áp cấu hình trong `buf.yaml` (`STANDARD` trừ 4 rule đã tắt vì
     xung đột với layout phẳng 3 package + response tái dùng message `Product`).
   - `breaking: true`, `breaking_against` trỏ tới
     `https://github.com/<repo>.git#branch=main` — chặn mọi thay đổi phá vỡ
     tương thích ngược (đổi field number, đổi type, xóa RPC đang dùng…) so với
     `main`.

Đây là **guardrail bắt buộc** — PR không pass được job này thì không nên merge,
vì breaking change ở đây đồng nghĩa với việc làm hỏng ít nhất một trong 4 service
tiêu thụ.

## 2. `dispatch-on-change.yml` — fan-out có chọn lọc

**Trigger:**

- `push` vào `main` **với path filter `**/*.proto`** — chỉ chạy khi ít nhất một
  file `.proto` thay đổi trong commit. Đây chính là lý do các commit chỉ sửa
  `docs/**` **không bao giờ** kích hoạt workflow này, và do đó **không bao giờ**
  bump bất kỳ service nào.
- `workflow_dispatch` — cho phép chạy tay, có input `protos` để force-dispatch
  một danh sách file cụ thể (để trống = dispatch tất cả).

**Việc nó làm (3 bước):**

1. **Xác định proto nào đổi** (`Determine changed protos`) — dùng
   `git diff --name-only --diff-filter=d "$BEFORE" "$SHA" -- '*.proto'`, hoặc lấy
   toàn bộ `*.proto` nếu là push đầu tiên / chạy tay không truyền input.
2. **Map proto → repo tiêu thụ** (`Map protos -> consumer repos`) — bảng cứng
   trong workflow:

   | Proto | Repo nhận dispatch |
   | --- | --- |
   | `product.proto` | `techscout-gateway`, `techscout-product-service` |
   | `recommend.proto` | `techscout-gateway`, `techscout-rag-recommend` |
   | `docs.proto` | `techscout-gateway`, `techscout-rag-docs` |

   Nếu bạn thêm proto thứ 4, **phải cập nhật bảng `CONSUMERS` này** kèm bảng
   tương ứng trong `README.md`.
3. **Gửi `repository_dispatch`** (`event_type: proto-updated`) tới từng repo
   trong danh sách, bằng `curl` + secret `DISPATCH_TOKEN` (PAT có quyền
   `contents: write` trên 4 repo tiêu thụ — `GITHUB_TOKEN` mặc định không đủ
   quyền gọi API repo khác).

::: tip Vì sao chỉ dispatch đúng consumer, không phải cả 4?
Nếu bạn chỉ sửa `recommend.proto`, `techscout-rag-docs` và
`techscout-product-service` sẽ **không** nhận dispatch — tránh build/deploy
không cần thiết cho service không liên quan.
:::

## 3. Phía consumer: `proto-guard.yml` + `proto-sync.yml`

Hai workflow này nằm ở **từng repo tiêu thụ** (ví dụ `services/gateway`), không
nằm trong `techscout-protos`, nhưng là mắt xích tiếp theo của luồng nên cần hiểu:

### `proto-sync.yml` — nhận dispatch, tự đồng bộ

- **Trigger:** `repository_dispatch` với `types: [proto-updated]`, hoặc chạy tay.
- **Việc nó làm:**
  1. Checkout kèm submodule.
  2. `git submodule update --remote --recursive proto` — kéo submodule
     `techscout-protos` về commit mới nhất trên `main`.
  3. Regenerate gRPC stub (ví dụ `bash scripts/gen_proto.sh` — vì Dockerfile của
     service ship stub đã commit sẵn, không chạy codegen lúc build image).
  4. Commit + push bằng secret `PROTO_BOT_TOKEN` (**không dùng** `GITHUB_TOKEN`
     mặc định, vì push bằng token mặc định sẽ không tự trigger workflow khác —
     mà bước tiếp theo cần `docker.yml` tự chạy).
  5. Push này tự động trigger `docker.yml` của service → build image → deploy →
     phát sự kiện `service-updated` cho hệ thống deploy tổng.

### `proto-guard.yml` — chặn submodule "lệch"

- **Trigger:** `push`/`pull_request` vào `main` của repo consumer, hoặc chạy tay.
- **Việc nó làm:** với mỗi submodule trỏ tới `techscout-protos`, đảm bảo:
  - Commit đang pin **là ancestor** của `techscout-protos@main` (không pin vào
    một commit chưa từng được push lên `main`, hoặc `main` đã bị rewrite).
  - Submodule **không có local edit** — proto chỉ được sửa ở
    `techscout-protos`, không sửa trực tiếp trong repo consumer.

## 4. `notify-discord.yml`

- **Trigger:** mọi `push` vào `main` (không giới hạn path).
- **Việc nó làm:** post embed vào kênh Discord của team qua secret
  `DISCORD_WEBHOOK` (bỏ qua nếu secret trống). Đây chỉ là thông báo, **không**
  ảnh hưởng tới build/deploy của bất kỳ service nào — kể cả khi commit chỉ sửa
  `docs/**`, workflow này vẫn chạy để team biết có thay đổi (điều này khác với
  "bump service", nên vẫn giữ nguyên hành vi).

## 5. `docs.yml` — build & deploy trang tài liệu này (mới)

- **Trigger:** `push` vào `main` **giới hạn path `docs/**`**, hoặc chạy tay.
- **Việc nó làm:** cài Node, `npm ci` trong `docs/`, `npm run docs:build`, upload
  artifact và deploy qua `actions/deploy-pages` lên GitHub Pages
  (`https://nxhawk.github.io/techscout-protos/`).
- **Cách ly hoàn toàn khỏi luồng proto:** vì `ci.yml` và `dispatch-on-change.yml`
  đều giới hạn theo path liên quan tới `.proto`/`buf.yaml`, một commit chỉ sửa
  `docs/**` sẽ:
  - ❌ không chạy `buf lint`/`buf breaking`
  - ❌ không gửi `repository_dispatch` tới bất kỳ repo consumer nào
  - ❌ không làm submodule ở service nào nhích commit
  - ✅ chỉ build & deploy lại trang GitHub Pages

## Bảng tóm tắt: commit đổi gì → workflow nào chạy {#summary-table}

| Thay đổi trong commit | `ci.yml` | `dispatch-on-change.yml` | `docs.yml` | `notify-discord.yml` |
| --- | :---: | :---: | :---: | :---: |
| Chỉ `*.proto` / `buf.yaml` | ✅ | ✅ | ❌ | ✅ |
| Chỉ `docs/**` | ❌ | ❌ | ✅ | ✅ |
| Cả hai | ✅ | ✅ | ✅ | ✅ |
| File khác (vd. `README.md` gốc) | ❌ | ❌ | ❌ | ✅ |
