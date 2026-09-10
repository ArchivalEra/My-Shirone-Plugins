# @shirone-plugins/strip-first-h1

Zero-runtime, AST-level Remark plugin and Astro integration for Shirone (and Astro blogs).
Strips the redundant first `#` (H1) heading from markdown posts to eliminate "Double Title" and keep the Table of Contents (TOC) outline clean.

## 为什么需要此插件？

在博客主题（如 Shirone）中，文章详情页已通过 Frontmatter `title` 渲染了带有装饰彩条、字数统计与复制链接的顶层大标题。然而，在 Obsidian、Typora、Notion 等工具中创作时，作者通常习惯在首行写 `# 文章大标题`。

直接渲染会导致：
1. **双重标题**：页面顶部展示模板大标题，正文开头又紧跟着一个重复的 `<h1>`。
2. **目录污染**：Astro 提取的 `headings` 目录树将文章大标题作为第一项，冗余且不协调。

本插件在 Remark AST 解析早期将第一个 H1 节点直接摘除：
- 正文不再渲染重复的 `<h1>`；
- Astro 提取的 `headings` 目录树纯净，TOC 直接从 `## 二级标题` 开始；
- 纯编译期执行，**0 客户端运行时，0 渲染开销**。

## 安装与使用

### 方式一：在 `siteRemarkPlugins` 引入（推荐用于 Shirone）

```js
// src/utils/markdown-processor.mjs
import { remarkStripFirstH1 } from "@shirone-plugins/strip-first-h1";

export const siteRemarkPlugins = [
  remarkStripFirstH1,
  // ... 其他 remark 插件
];
```

### 方式二：作为 Astro Integration 使用

```js
// astro.config.mjs
import stripFirstH1 from "@shirone-plugins/strip-first-h1";

export default defineConfig({
  integrations: [
    stripFirstH1({ matchTitleOnly: false }),
  ],
});
```

## 配置项

```ts
interface StripFirstH1Options {
  /**
   * 仅在首个 H1 文本与 Frontmatter title 一致时剥离。
   * 默认为 false（直接剥离首个 H1，因为主题已提供顶层标题）。
   */
  matchTitleOnly?: boolean;
}
```
