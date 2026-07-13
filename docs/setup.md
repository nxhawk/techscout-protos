# Cài đặt & chạy local

## 1. Yêu cầu

| Công cụ | Dùng để | Cài đặt |
| --- | --- | --- |
| [`buf`](https://buf.build/docs/installation) | Lint + kiểm tra breaking change cho `.proto` | `brew install bufbuild/buf/buf` hoặc tải binary từ GitHub Releases |
| `git` ≥ 2.30 | Submodule, `merge-base` | — |
| Node.js ≥ 18 | Chạy site docs (VitePress) | `nvm install 20` |
| `protoc` + plugin ngôn ngữ (tùy service) | Sinh stub gRPC khi làm việc trong repo service | xem README của từng service tiêu thụ |

Repo này **không** cần Node/Python để làm việc với proto — Node chỉ cần khi bạn muốn
chạy hoặc build site tài liệu (`docs/`).

## 2. Clone & cấu trúc repo

```bash
git clone https://github.com/nxhawk/techscout-protos.git
cd techscout-protos
ls
# buf.yaml  techscout/  docs/  README.md
```

Ba file `.proto` nằm dưới `techscout/<service>/v1/` (xem giải thích trong
[`buf.yaml`](https://github.com/nxhawk/techscout-protos/blob/main/buf.yaml)) —
mỗi service có thư mục version riêng, để thêm `v2` sau này không đụng tới `v1`
đang chạy.

## 3. Lint & kiểm tra breaking change local

Chạy đúng những gì CI chạy, trước khi push:

```bash
buf lint
buf breaking --against '.git#branch=main'
```

- `buf lint` — kiểm tra style: PascalCase/snake_case, hậu tố version `.v1`, hậu tố
  `Service`, tên `*Request`, không field `required`, v.v. (theo cấu hình `STANDARD`
  trừ 2 rule đã tắt trong `buf.yaml`).
- `buf breaking` — so sánh với `main` để đảm bảo bạn không đổi số field, đổi kiểu,
  xóa field/RPC đang được dùng… (những thay đổi phá vỡ khả năng tương thích ngược
  của consumer).

## 4. Dùng repo này trong một service (submodule)

Các service tiêu thụ gắn repo này làm submodule, ví dụ tại `services/gateway/proto`:

```bash
git submodule add https://github.com/nxhawk/techscout-protos.git proto
git submodule update --init --recursive
```

Cập nhật thủ công lên bản mới nhất trên `main` (bình thường việc này do
`proto-sync.yml` của từng service tự làm khi nhận `repository_dispatch`):

```bash
git submodule update --remote --recursive proto
```

## 5. Chạy trang tài liệu này ở local

Trang tài liệu (VitePress) nằm trong `docs/`:

```bash
cd docs
npm install
npm run docs:dev       # http://localhost:5173/techscout-protos/
```

Build tĩnh (giống hệt bước CI chạy trước khi deploy lên GitHub Pages):

```bash
npm run docs:build     # xuất ra docs/.vitepress/dist
npm run docs:preview   # xem thử bản build
```

::: warning
`base` trong `docs/.vitepress/config.mts` được set cứng thành `/techscout-protos/`
để khớp với GitHub Pages project site. Nếu bạn đổi tên repo, nhớ cập nhật `base`
theo.
:::

## 6. Secret cần thiết cho CI

| Secret | Repo | Mục đích |
| --- | --- | --- |
| `DISPATCH_TOKEN` | `techscout-protos` | PAT (fine-grained, `contents: write` trên 4 repo tiêu thụ) hoặc GitHub App token, dùng để gửi `repository_dispatch` sang các repo consumer. `GITHUB_TOKEN` mặc định **không** có quyền dispatch sang repo khác. |
| `DISCORD_WEBHOOK` | `techscout-protos` | (tùy chọn) URL webhook Discord để thông báo mỗi khi có commit lên `main`. |

Việc deploy trang docs này lên GitHub Pages **không cần secret bổ sung** — nó dùng
`GITHUB_TOKEN` mặc định qua `actions/deploy-pages`.
