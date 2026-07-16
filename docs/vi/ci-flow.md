# Luồng CI/CD chi tiết

## Tổng quan

Giải thích từng workflow CI/CD trong `techscout-protos` và các repo tiêu thụ, khi nào mỗi workflow chạy, và cách một thay đổi `.proto` lan truyền tới lúc service được deploy.

`techscout-protos` có 4 workflow trong repo này, cộng thêm 2 workflow ở **mỗi**
repo tiêu thụ (gateway, product-service, rag-recommend, rag-docs). Trang này giải
thích từng workflow, khi nào nó chạy, và toàn bộ chuỗi sự kiện từ lúc bạn sửa một
`.proto` đến lúc service được deploy.

## Sơ đồ tổng quan

Đọc sơ đồ theo chiều mũi tên: một commit sửa `*.proto` rẽ thành 2 nhánh song
song (`ci.yml` và `dispatch-on-change.yml`); `dispatch-on-change.yml` lại
fan-out tới 3 repo tiêu thụ, mỗi repo tự đồng bộ rồi tự trigger `docker.yml`
của service đó. Luồng `docs/**` (dưới cùng) hoàn toàn tách biệt — không giao
với luồng proto ở trên (xem mục 5).

<svg viewBox="0 0 920 770" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;display:block;margin:24px auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <defs>
    <marker id="arrow-ci-vi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="var(--vp-c-brand-1, #3451b2)" />
    </marker>
  </defs>

  <rect x="340" y="10" width="240" height="54" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1.5" />
  <text x="460" y="33" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">Dev sửa *.proto</text>
  <text x="460" y="50" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">commit trên 1 nhánh</text>

  <line x1="410" y1="64" x2="435" y2="106" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />
  <text x="300" y="88" text-anchor="end" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">push main, path **/*.proto</text>

  <line x1="510" y1="64" x2="642" y2="120" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />
  <text x="560" y="85" text-anchor="start" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">push / PR → main</text>

  <rect x="640" y="106" width="260" height="72" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="770" y="130" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">ci.yml (mục 1)</text>
  <text x="770" y="147" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">buf lint + buf breaking</text>
  <text x="770" y="163" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">chặn merge nếu fail</text>

  <rect x="260" y="108" width="360" height="110" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="440" y="130" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">dispatch-on-change.yml (mục 2)</text>
  <text x="440" y="150" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">1. xác định proto nào đổi</text>
  <text x="440" y="168" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">2. map proto → repo tiêu thụ</text>
  <text x="440" y="186" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">3. repository_dispatch "proto-updated"</text>
  <text x="440" y="204" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">(chỉ chạy khi commit đổi *.proto)</text>

  <line x1="440" y1="218" x2="440" y2="240" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <line x1="440" y1="240" x2="150" y2="258" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />
  <line x1="440" y1="240" x2="460" y2="258" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />
  <line x1="440" y1="240" x2="770" y2="258" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />

  <rect x="10" y="260" width="280" height="120" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="150" y="282" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vp-c-text-1, #213547)">gateway/proto-sync.yml</text>
  <text x="150" y="300" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">git submodule update --remote</text>
  <text x="150" y="317" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">regenerate gRPC stubs</text>
  <text x="150" y="334" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">commit + push (PROTO_BOT_TOKEN)</text>
  <text x="150" y="354" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(độc lập với 2 repo còn lại)</text>

  <rect x="320" y="260" width="280" height="120" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="460" y="282" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vp-c-text-1, #213547)">product-service/proto-sync.yml</text>
  <text x="460" y="300" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">git submodule update --remote</text>
  <text x="460" y="317" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">regenerate gRPC stubs</text>
  <text x="460" y="334" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">commit + push (PROTO_BOT_TOKEN)</text>
  <text x="460" y="354" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(độc lập với 2 repo còn lại)</text>

  <rect x="630" y="260" width="280" height="120" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="770" y="282" text-anchor="middle" font-size="12" font-weight="600" fill="var(--vp-c-text-1, #213547)">rag-*/proto-sync.yml</text>
  <text x="770" y="300" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">git submodule update --remote</text>
  <text x="770" y="317" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">regenerate gRPC stubs</text>
  <text x="770" y="334" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">commit + push (PROTO_BOT_TOKEN)</text>
  <text x="770" y="354" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(rag-recommend, rag-docs)</text>

  <line x1="150" y1="380" x2="350" y2="420" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />
  <line x1="460" y1="380" x2="460" y2="420" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />
  <line x1="770" y1="380" x2="570" y2="420" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />

  <rect x="230" y="422" width="460" height="70" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="460" y="446" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">docker.yml của service đó</text>
  <text x="460" y="464" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">build image → deploy → service-updated</text>
  <text x="460" y="480" text-anchor="middle" font-size="10" fill="var(--vp-c-text-2, #3c3c43)">(mỗi repo trigger docker.yml của riêng nó)</text>

  <line x1="20" y1="540" x2="900" y2="540" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1" stroke-dasharray="4 4" />
  <text x="460" y="560" text-anchor="middle" font-size="11" font-style="italic" fill="var(--vp-c-text-2, #3c3c43)">Luồng docs tách biệt hoàn toàn — không giao với luồng proto ở trên</text>

  <rect x="340" y="580" width="240" height="54" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-divider, #e2e2e3)" stroke-width="1.5" />
  <text x="460" y="603" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">Dev sửa docs/**</text>
  <text x="460" y="620" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">push main, path docs/**</text>

  <line x1="460" y1="634" x2="460" y2="668" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" marker-end="url(#arrow-ci-vi)" />

  <rect x="290" y="670" width="340" height="86" rx="8" fill="var(--vp-c-bg-soft, #f6f6f7)" stroke="var(--vp-c-brand-1, #3451b2)" stroke-width="1.5" />
  <text x="460" y="694" text-anchor="middle" font-size="12.5" font-weight="600" fill="var(--vp-c-text-1, #213547)">docs.yml (mục 5)</text>
  <text x="460" y="712" text-anchor="middle" font-size="11" fill="var(--vp-c-text-2, #3c3c43)">npm run docs:build → deploy Pages</text>
  <text x="460" y="729" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">❌ không chạy ci.yml</text>
  <text x="460" y="745" text-anchor="middle" font-size="10.5" fill="var(--vp-c-text-2, #3c3c43)">❌ không chạm dispatch-on-change.yml</text>
</svg>

## 1. `ci.yml` — buf lint + breaking change guard

**Trigger:** `push` hoặc `pull_request` vào `main`, giới hạn ở các path liên quan
đến proto (`**/*.proto`, `buf.yaml`, `buf.gen.yaml`) — các commit chỉ đổi
`docs/**` sẽ **không** kích hoạt job này.

**Việc nó làm:**

1. Checkout full history (`fetch-depth: 0` — cần thiết để `buf breaking` so sánh
   với `main`).
2. Chạy `bufbuild/buf-action@v1` với:
   - `lint: true` — áp cấu hình trong `buf.yaml` (`STANDARD` trừ 2 rule đã tắt vì
     response tái dùng message `Product` thay vì trả về `*Response` riêng).
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
   `git diff --name-only --diff-filter=d "$BEFORE" "$SHA" -- 'techscout/**/*.proto'`,
   hoặc lấy toàn bộ `techscout/**/*.proto` nếu là push đầu tiên / chạy tay
   không truyền input.
2. **Map proto → repo tiêu thụ** (`Map protos -> consumer repos`) — bảng cứng
   trong workflow, khóa theo **đường dẫn đầy đủ** (không phải basename) để một
   `v2` trong tương lai có thể map sang danh sách consumer khác `v1` mà không
   đụng nhau:

   | Proto | Repo nhận dispatch |
   | --- | --- |
   | `techscout/product/v1/product.proto` | `techscout-gateway`, `techscout-product-service` |
   | `techscout/recommend/v1/recommend.proto` | `techscout-gateway`, `techscout-rag-recommend` |
   | `techscout/docs/v1/docs.proto` | `techscout-gateway`, `techscout-rag-docs` |

   Nếu bạn thêm proto thứ 4, **phải cập nhật bảng `CONSUMERS` này** kèm bảng
   tương ứng trong `README.md`.
3. **Gửi `repository_dispatch`** (`event_type: proto-updated`) tới từng repo
   trong danh sách, bằng `curl` + secret `DISPATCH_TOKEN` (PAT có quyền
   `contents: write` trên 4 repo tiêu thụ — `GITHUB_TOKEN` mặc định không đủ
   quyền gọi API repo khác).

::: tip Vì sao chỉ dispatch đúng consumer, không phải cả 4?
Nếu bạn chỉ sửa `techscout/recommend/v1/recommend.proto`, `techscout-rag-docs` và
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
