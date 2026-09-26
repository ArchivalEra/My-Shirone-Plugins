# @shirone-plugins/repo-inventory

> 构建期仓库清单：列出账号下全部公开仓库，读出各自的 GitHub Pages 状态与本集群的加速镜像情况。

给 Shirone 项目页提供**机器事实**的那一层。收录范围是**自动**的：列全部公开仓库，减去一份排除表——新开的仓库不需要谁去登记，下一次构建就会自己出现。这里只回答四个问题——**这个仓有可用的 GitHub Pages 镜像吗？它是不是由本集群的镜像树直供的？最近一次推送是什么时候？它的简介和主语言是什么？**

---

## 为什么是构建期

运行时零请求。数据在构建时读一次，产出两份消费方式：

1. **烘焙进构建**：`src/data/repo-inventory.json`，主题的 `resolveProjectsData` 按 `repository` 名 join 进项目页，产出 SSR 首屏。
2. **发布成静态文件**：站点根的 `/sites.json`，页面手动刷新时重新 fetch 它。

没有守护进程、没有 Worker、没有边缘端点、没有密钥下发到边缘。"每天拉一次"用的是主题仓 `deploy.yml` 里本来就有的日度 cron。

---

## 零依赖承诺

`src/index.ts` 编译出的 `dist/index.js` **不含任何 `import` / `require`**（模块只用 `URL`/`RegExp`/`Map`/`Set`/`Promise`，不碰网络也不碰文件系统），所有事实通过注入的 `InventoryDeps` 进来：

```ts
export interface InventoryDeps {
	facts(name: string): Promise<RepoFacts | null>;
	acceleratedDirs(): Promise<string[]>;
	now(): string;
}
```

因此 `list()` 整个可以用一个假 adapter 测完（`tests/` 就是这么做的），而真正取数的 CLI 只是这层 interface 外面的一层薄壳。这条形态是刻意的：这个集群的运行时落脚面（`middleware.js`、`vps-hub.mjs`）都是单文件零依赖，共享逻辑若不以同样形态产出，就会被手抄一份——`repo-pages` 里那份 `rewriteRepoHtml` 就是前车之鉴。

---

## 数据形态

```ts
export type RepoPagesState = "ready" | "absent" | "pending";

export interface RepoState {
	name: string;
	pages: RepoPagesState;   // ready 已就绪 / absent 未开启 / pending 已开启但未构建成功
	accelerated: boolean;    // 由镜像树的目录名判定，"目录即事实"
	pushedAt: string;
	status: string | null;   // GitHub 原始构建状态，只进文件不上 UI
}

export interface RepoInventory {
	generatedAt: string;
	acceleratedDirs: string[];  // 镜像树里的全部目录名，含孤儿
	entries: RepoState[];       // 只含真的读到了事实的仓库
}
```

两条刻意的取舍：

- **读不到就不写。** `facts()` 返回 `null`（仓库读失败、限流）时，该仓**从 `entries` 里省略**，而不是猜一个状态。项目页因此显示"没有徽章"，而不是显示一个假徽章。
- **`acceleratedDirs` 收全部目录名。** 镜像树里有、没有任何仓库对应的目录就是孤儿——它们会被 CLI 单独报出来，这也是那棵无人引用的静态树能被自动发现的原因，而不是靠人记得。

---

## CLI 用法

```sh
# 需要先构建（bin 从 ../dist 取 module）
pnpm build

# 需要 GITHUB_TOKEN 才能用上 5000/hr 的认证配额
GITHUB_TOKEN=xxx node bin/repo-inventory.mjs \
  --exclude-file ../isui.ren-Blog/data/repo-exclusions.txt \
  --out ../Shirone-personalized/src/data/repo-inventory/snapshot.json
```

**产物必须落在自己的子目录里。** 主题的 `content:sync` 裁剪只豁免"内容仓不拥有的顶层段"，
而**顶层文件的顶段是空串**——与内容仓 `data/` 下的 `projects.ts` 同段，于是会被当成内容仓的
文件裁掉（`anime-snapshots/` 用子目录正是这个原因）。放进 `src/data/repo-inventory/` 后
实测 `pruned 0`，文件存活。

| 参数 | 说明 |
| :--- | :--- |
| `--exclude-file <file>` | 要从收录里剔除的仓库名，一行一个（`#` 注释）。缺省则收录全部公开仓 |
| `--out <file>` | 必填。清单 JSON 的输出路径 |
| `--owner <user>` | 默认 `ArchivalEra` |
| `--mirror-repo <name>` | 默认 `isui.ren-heart`，即镜像树所在仓库 |
| `--mirror-branch <ref>` | 默认 `deploy` |
| `--mirror-dir <path>` | 默认 `repo` |
| `--api <base>` | 默认 `https://api.github.com`，便于测试 |

环境变量：`GITHUB_TOKEN`（可选）。没有它就走匿名配额，遇到限流会直接失败而不是静默少报。

**收录规则**：`!private && 不在排除表里`。fork 也在内——规则是「非私有、未排除」，不是「非 fork」；排除按**名字**逐条列，所以藏掉一个仓不会顺手藏掉它的邻居。排除表是一行一个名字的纯文本文件，推荐放在内容仓 `data/` 下，由部署流程传进来。

清单因此同时带着 `description`、`language`、`url`：自动收录的仓库没有手写简介，这几个字段就是它在卡片上的全部内容——**一个编辑性字段都不编**（`phase` 因此缺省，卡片也就不渲染那枚胶囊）。

---

## 测试

```sh
pnpm test    # 先 build，再 node --test tests/
```

18 条用例，全部穿过 `list()` 与 `selectDiscovered()` 两个 interface（假 adapter），覆盖三态判定、`accelerated` 判定、公开/私有/排除/去重/名字归一的选取规则、读不到时省略而非猜测、孤儿保留，以及 Biome 形状的序列化。
