import { defineConfig } from "vitepress";

// https://vitepress.dev/reference/site-config
export default defineConfig({
  lang: "en-US",
  title: "ProAgents",
  description:
    "Forge specialized AI agents from incomplete ideas — progressive questioning, pluggable context frameworks and deterministic multi-agent architecture generation.",
  head: [
    ["link", { rel: "icon", type: "image/png", href: "/favicon.png" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:title", content: "ProAgents" }],
    [
      "meta",
      {
        property: "og:description",
        content: "Forge specialized AI agents from incomplete ideas.",
      },
    ],
    ["meta", { property: "og:image", content: "/og-image.png" }],
    ["meta", { name: "theme-color", content: "#b9fb1d" }],
  ],
  base: "/proagents/",
  cleanUrls: true,
  themeConfig: {
    logo: "/logo.png",
    siteTitle: "ProAgents",
    nav: [
      { text: "Docs", link: "/guide/what-is-proagents", activeMatch: "/guide/" },
      { text: "CLI", link: "/cli/", activeMatch: "/cli/" },
      {
        text: "Context",
        link: "/context/",
        activeMatch: "/context/",
      },
      { text: "npm", link: "https://www.npmjs.com/package/proagent" },
      {
        text: "GitHub",
        link: "https://github.com/proagents-dev/proagents",
      },
    ],
    sidebar: {
      "/guide/": [
        {
          text: "Introduction",
          items: [
            { text: "What is ProAgents?", link: "/guide/what-is-proagents" },
            { text: "Getting started", link: "/guide/getting-started" },
            { text: "Agent operating guide", link: "/guide/agent-guide" },
          ],
        },
        {
          text: "Concepts",
          items: [
            { text: "The question engine", link: "/guide/question-engine" },
            { text: "Agent architecture & graphs", link: "/guide/architecture" },
            { text: "Self-improvement", link: "/guide/self-improvement" },
          ],
        },
      ],
      "/cli/": [
        {
          text: "CLI",
          items: [
            { text: "Overview", link: "/cli/" },
            { text: "JSON interface", link: "/cli/json" },
          ],
        },
      ],
      "/context/": [
        {
          text: "Context Frameworks",
          items: [
            { text: "Overview", link: "/context/" },
            { text: "Write an adapter", link: "/context/adapters" },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/proagents-dev/proagents" },
      { icon: "npm", link: "https://www.npmjs.com/package/proagent" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 ProAgents contributors",
    },
    outline: { level: [2, 3], label: "On this page" },
    docFooter: { prev: "Previous", next: "Next" },
    lastUpdated: true,
  },
});
