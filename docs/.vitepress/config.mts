import { defineConfig } from "vitepress";

// Site is published to https://nxhawk.github.io/techscout-protos/
// (GitHub Pages project site -> base must match the repo name).
const base = "/techscout-protos/";

export default defineConfig({
  base,
  title: "techscout-protos",
  description: "Shared gRPC contracts for the TechScout platform",
  lastUpdated: true,
  cleanUrls: true,
  // .en-deprecated/ holds leftover files from a locale-layout migration and
  // must never be picked up as site pages.
  srcExclude: ["**/.en-deprecated/**"],

  head: [["link", { rel: "icon", href: `${base}favicon.svg` }]],

  // Root locale = English (files live directly under docs/).
  // Vietnamese lives under docs/vi/ and is served at /vi/.
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      title: "techscout-protos",
      description: "Shared gRPC contracts for the TechScout platform",
      themeConfig: {
        nav: [
          { text: "Home", link: "/" },
          { text: "gRPC Concepts", link: "/concepts" },
          { text: "CI Flow", link: "/ci-flow" },
          { text: "Updating Protos", link: "/updating-protos" },
          { text: "Proto Reference", link: "/proto-reference" },
          { text: "Setup", link: "/setup" },
        ],
        sidebar: [
          {
            text: "Getting started",
            items: [
              { text: "Introduction", link: "/" },
              { text: "gRPC & Proto concepts", link: "/concepts" },
              { text: "Setup & local dev", link: "/setup" },
            ],
          },
          {
            text: "Operations",
            items: [
              { text: "CI/CD flow in detail", link: "/ci-flow" },
              { text: "Updating a proto", link: "/updating-protos" },
            ],
          },
          {
            text: "Reference",
            items: [{ text: "What each proto means", link: "/proto-reference" }],
          },
        ],
        editLink: {
          pattern:
            "https://github.com/nxhawk/techscout-protos/edit/main/docs/:path",
          text: "Edit this page on GitHub",
        },
      },
    },
    vi: {
      label: "Tiếng Việt",
      lang: "vi-VN",
      link: "/vi/",
      title: "techscout-protos",
      description: "Hợp đồng gRPC dùng chung cho nền tảng TechScout",
      themeConfig: {
        nav: [
          { text: "Trang chủ", link: "/vi/" },
          { text: "Khái niệm gRPC", link: "/vi/concepts" },
          { text: "Luồng CI", link: "/vi/ci-flow" },
          { text: "Cập nhật proto", link: "/vi/updating-protos" },
          { text: "Tham chiếu proto", link: "/vi/proto-reference" },
          { text: "Cài đặt", link: "/vi/setup" },
        ],
        sidebar: [
          {
            text: "Bắt đầu",
            items: [
              { text: "Giới thiệu", link: "/vi/" },
              { text: "Khái niệm gRPC & Proto cơ bản", link: "/vi/concepts" },
              { text: "Cài đặt & chạy local", link: "/vi/setup" },
            ],
          },
          {
            text: "Vận hành",
            items: [
              { text: "Luồng CI/CD chi tiết", link: "/vi/ci-flow" },
              { text: "Quy trình cập nhật proto", link: "/vi/updating-protos" },
            ],
          },
          {
            text: "Tham chiếu",
            items: [{ text: "Ý nghĩa từng proto", link: "/vi/proto-reference" }],
          },
        ],
        outline: { label: "Trên trang này" },
        docFooter: { prev: "Trang trước", next: "Trang sau" },
        returnToTopLabel: "Về đầu trang",
        darkModeSwitchLabel: "Giao diện",
        sidebarMenuLabel: "Menu",
        lastUpdatedText: "Cập nhật lần cuối",
        editLink: {
          pattern:
            "https://github.com/nxhawk/techscout-protos/edit/main/docs/:path",
          text: "Sửa trang này trên GitHub",
        },
      },
    },
  },

  themeConfig: {
    socialLinks: [
      { icon: "github", link: "https://github.com/nxhawk/techscout-protos" },
    ],
    search: {
      provider: "local",
      options: {
        locales: {
          vi: {
            translations: {
              button: { buttonText: "Tìm kiếm", buttonAriaLabel: "Tìm kiếm" },
              modal: {
                noResultsText: "Không tìm thấy kết quả cho",
                resetButtonTitle: "Xóa tìm kiếm",
                footer: {
                  selectText: "để chọn",
                  navigateText: "để di chuyển",
                  closeText: "để đóng",
                },
              },
            },
          },
        },
      },
    },
  },
});
