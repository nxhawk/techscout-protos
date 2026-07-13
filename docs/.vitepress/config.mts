import { defineConfig } from "vitepress";

// Site is published to https://nxhawk.github.io/techscout-protos/
// (GitHub Pages project site -> base must match the repo name).
const base = "/techscout-protos/";

export default defineConfig({
  base,
  title: "techscout-protos",
  description: "Hợp đồng gRPC dùng chung cho nền tảng TechScout",
  lastUpdated: true,
  cleanUrls: true,

  head: [["link", { rel: "icon", href: `${base}favicon.svg` }]],

  // Root locale = Vietnamese (files live directly under docs/).
  // English lives under docs/en/ and is served at /en/.
  locales: {
    root: {
      label: "Tiếng Việt",
      lang: "vi-VN",
      title: "techscout-protos",
      description: "Hợp đồng gRPC dùng chung cho nền tảng TechScout",
      themeConfig: {
        nav: [
          { text: "Trang chủ", link: "/" },
          { text: "Khái niệm gRPC", link: "/concepts" },
          { text: "Luồng CI", link: "/ci-flow" },
          { text: "Cập nhật proto", link: "/updating-protos" },
          { text: "Tham chiếu proto", link: "/proto-reference" },
          { text: "Cài đặt", link: "/setup" },
        ],
        sidebar: [
          {
            text: "Bắt đầu",
            items: [
              { text: "Giới thiệu", link: "/" },
              { text: "Khái niệm gRPC & Proto cơ bản", link: "/concepts" },
              { text: "Cài đặt & chạy local", link: "/setup" },
            ],
          },
          {
            text: "Vận hành",
            items: [
              { text: "Luồng CI/CD chi tiết", link: "/ci-flow" },
              { text: "Quy trình cập nhật proto", link: "/updating-protos" },
            ],
          },
          {
            text: "Tham chiếu",
            items: [{ text: "Ý nghĩa từng proto", link: "/proto-reference" }],
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
    en: {
      label: "English",
      lang: "en-US",
      link: "/en/",
      title: "techscout-protos",
      description: "Shared gRPC contracts for the TechScout platform",
      themeConfig: {
        nav: [
          { text: "Home", link: "/en/" },
          { text: "gRPC Concepts", link: "/en/concepts" },
          { text: "CI Flow", link: "/en/ci-flow" },
          { text: "Updating Protos", link: "/en/updating-protos" },
          { text: "Proto Reference", link: "/en/proto-reference" },
          { text: "Setup", link: "/en/setup" },
        ],
        sidebar: [
          {
            text: "Getting started",
            items: [
              { text: "Introduction", link: "/en/" },
              { text: "gRPC & Proto concepts", link: "/en/concepts" },
              { text: "Setup & local dev", link: "/en/setup" },
            ],
          },
          {
            text: "Operations",
            items: [
              { text: "CI/CD flow in detail", link: "/en/ci-flow" },
              { text: "Updating a proto", link: "/en/updating-protos" },
            ],
          },
          {
            text: "Reference",
            items: [{ text: "What each proto means", link: "/en/proto-reference" }],
          },
        ],
        editLink: {
          pattern:
            "https://github.com/nxhawk/techscout-protos/edit/main/docs/:path",
          text: "Edit this page on GitHub",
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
          root: {
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
