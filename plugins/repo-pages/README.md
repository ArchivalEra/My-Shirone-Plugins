# @shirone-plugins/repo-pages

> GitHub Pages 仓库集群国内加速反代与项目展示生态插件。

为个人/组织名下的所有 GitHub 仓库开通 GitHub Pages，并通过腾讯云 EdgeOne 节点以 `https://isui.ren/repo/<repoName>/` 的统一二级路由进行国内极速反向代理与边缘缓存。

---

## 特性亮点

1. **统一国内访问前缀**：所有仓库的 GitHub Pages 页面（`archivalera.github.io/<repo>/`）统一映射为 `https://isui.ren/repo/<repo>/`。
2. **边缘智能重写**：自动在 HTML 中注入 `<base href="/repo/<repo>/">`，并流式修正绝对路径资源链接，解决子路径 404 顽疾。
3. **国内 CDN 强缓存**：CSS、JS、WebAssembly、图片及字体在 EdgeOne 国内边缘节点享受强缓存加速，告别 GitHub Pages 在国内丢包与慢速。
4. **CLI 运维自动化**：内置 `shirone-repo-pages` 命令行，支持一键扫描与批量开通 GitHub Pages。
5. **博客前端无缝集成**：配套 Svelte 5 / M3E 内嵌查看器 (`RepoEmbedViewer.svelte`)，与 Shirone 博客 `/projects` 项目展台深度打通。

---

## 前缀重写的唯一实现

`rewriteForPrefix(html, { repo, prefix })` 是本集群里**唯一**一份"把一份 HTML 挪到镜像前缀下"的实现：

- 它编译成**零依赖单文件**（`dist/rewrite-for-prefix.js`，无 `import`/`require`），因此 edge 可以直接消费；
- 主题仓部署时把它 vendor 到 heart 仓 `deploy` 分支的 `rewrite-for-prefix.mjs`，heart 的中间件用**动态 import** 加载（该运行时支持同目录 import，已实测）；每次部署重算，所以 edge 那份永远等于这里的当前构建——手抄漂移正是它此前长出两份实现、并带上同一个转义缺陷的原因；
- 行为范围刻意划死：一个 `<base>`（已有则**替换**，绝不叠加第二个）+ 本仓自身子路径的根绝对引用（仓名**按字面**处理，因为本舰队仓名含 `.`）。`srcset`、CSS `url()`、JS 内拼的路径**不在范围内**——被镜像的都是自建站点，两种写法（相对 / 根绝对）已知。

## CLI 工具用法

```bash
# 扫描当前账号下所有仓库的 Pages 状态与国内镜像路由
node bin/repo-pages.mjs inspect

# 为指定仓库开启 GitHub Pages (默认基于 main 分支与根目录或 docs)
node bin/repo-pages.mjs enable Shirone-personalized

# 导出开启 Pages 的项目数据，直接对接 isui.ren-Blog/data/projects.ts
node bin/repo-pages.mjs sync
```

---

## 许可证

MIT License
