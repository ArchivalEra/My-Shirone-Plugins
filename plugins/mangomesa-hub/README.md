# @shirone-plugins/mangomesa-hub

> MangoMesa 博客、站点罗盘、开源项目与 Bahnhof 中央站台跨站互联生态插件。

将 `isui.ren` 站点集群下的四大中枢打通并实现无缝跨站导航：
- **`Mango Mesa` (`/MangoMesa/`)**：博客主站台
- **`站点罗盘` (`/MangoMesa/compass/`)**：站点导航与常用网址
- **`开源项目` (`/MangoMesa/projects/`)**：开源项目与国内加速镜像
- **`Bahnhof 调度站` (`/Bahnhof/`)**：全站中央车次与调度时刻大屏

---

## 特性

1. **统一站台互联元数据**：提供严谨的 `MANGOMESA_STATION_LINKS` 跨站索引定义。
2. **M3E 穿梭胶囊组件**：内置 Svelte 5 `BahnhofShuttlePill.svelte`，在罗盘或页脚优雅挂载直达 `/Bahnhof/` 的交互入口。
3. **零外部冗余**：纯 TypeScript + 零运行时依赖，完全遵循 Shirone 规范。

---

## 许可证

MIT License
