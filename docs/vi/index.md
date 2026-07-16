---
layout: home

hero:
  name: techscout-protos
  text: Hợp đồng gRPC dùng chung
  tagline: Nguồn sự thật duy nhất (single source of truth) cho các contract gRPC của nền tảng TechScout.
  actions:
    - theme: brand
      text: Luồng CI/CD
      link: /vi/ci-flow
    - theme: alt
      text: Cập nhật một proto
      link: /vi/updating-protos
    - theme: alt
      text: Tham chiếu proto
      link: /vi/proto-reference
    - theme: alt
      text: Khái niệm gRPC
      link: /vi/concepts

features:
  - title: 3 contract, 4 repo tiêu thụ
    details: techscout/{product,recommend,docs}/v1/*.proto — dùng chung bởi gateway, product-service, rag-recommend, rag-docs qua git submodule.
  - title: buf lint + breaking change guard
    details: Mọi PR/push vào main đều được buf kiểm tra style và tính tương thích ngược trước khi phát tán.
  - title: Fan-out tự động theo file thay đổi
    details: Chỉ những service thực sự tiêu thụ file .proto vừa đổi mới nhận repository_dispatch để đồng bộ — không cần bump toàn bộ.
  - title: Docs không đụng vào service
    details: Thay đổi trong thư mục docs/ chỉ build & deploy trang GitHub Pages này, không kích hoạt buf lint hay dispatch sang service nào.
---

## Repo này dùng để làm gì?

`techscout-protos` là nơi **duy nhất** định nghĩa các `.proto` cho toàn bộ hệ thống
TechScout. Các service (gateway, product-service, rag-recommend, rag-docs) không giữ
bản sao proto của riêng mình — chúng gắn repo này làm **git submodule** và sinh mã
(gRPC stub) từ đó.

Nếu bạn cần:

- Mới bắt đầu, chưa quen gRPC/protobuf? → xem [Khái niệm gRPC & Proto cơ bản](/vi/concepts)
- Hiểu **luồng CI/CD** hoạt động ra sao khi một proto thay đổi → xem [Luồng CI/CD](/vi/ci-flow)
- Biết **các bước** để sửa/thêm một proto một cách an toàn → xem [Cập nhật proto](/vi/updating-protos)
- Tra cứu **ý nghĩa** của từng service/message trong 3 file proto → xem [Tham chiếu proto](/vi/proto-reference)
- **Cài đặt** môi trường local (buf, protoc, submodule, chạy docs) → xem [Cài đặt](/vi/setup)

::: tip Ngôn ngữ
Trang này có bản [English](/) — dùng nút chọn ngôn ngữ ở góc trên bên phải.
:::
