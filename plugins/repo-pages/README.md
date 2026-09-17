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
