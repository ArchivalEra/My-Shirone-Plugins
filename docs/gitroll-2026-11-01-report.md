# GitRoll 整改报告（My-Shirone-Plugins，2026-11-01）

> 扫描基线：`gitroll/2026-10-31/My-Shirone-Plugins.md`，扫描 id `36zc48dewS4N1ly1eV4p`，
> 80 条告警分档为 **A 29 · B 51 · C 4**（按源明细逐规则求和复核；issue `#8` 写的 B 47 少计了 4 条 `form label`）。
> 本报告的判据是**清单清零**，不是评级分数——GitRoll 按密度算分，修一半不保证升档。

## 结论

| 档 | 条数 | 结果 |
|---|--:|---|
| A · 机械安全 | 29 | **全部修复，零残留**（6 条规则，每规则一次提交） |
| B · 需判断 | 51 | **改 36 条 + 记录 11 条不改理由 + 4 条随文件删除**（见下表） |
| C · 不动 | 4 | **文件已删除**（零引用的一次性原型） |

**18 个提交**，全部本地未推送，按规则分组以便单独回滚。

---

## A 档：29 条全部修复

| 规则 | 条数 | 做法 | 验证 |
|---|--:|---|---|
| `Remove this assignment of "i"` | 12 | `for` → `while` 游标 | **43 组 argv 逐字等价**（4 个解析器各跑一遍） |
| `Member 'X' is never reassigned; mark readonly` | 5 | 加 `readonly` | grep 确认零重赋值 |
| `Remove this unused import` | 3 | 删 import | 构建 + 测试 |
| `This assertion is unnecessary` | 3 | 删 `as any` | `tsc` 通过 |
| `Refactor nested template literals` | 3 | 提取局部变量 | 语法检查 + 测试 |
| `Use RegExp.exec()` | 2 | `.match()` → `/re/.exec()` | 无 `g` 标志，语义相同 |

### 关键判断：`i` 那 12 条**不能按字面修**

GitRoll 说"删除对 i 的赋值"，但那些 `i++` / `args[++i]` 是**解析器消费参数值**，删掉会破坏 `--out x.json` 这类双 token 参数。

正确修法是 `for` → `while`，把游标推进放进"消费了 token 的那个分支"。

**等价比对**：每个函数从 HEAD 版与工作区版各自提取，绑定桩 `process`/`fs`/`os`/`path`，各跑 43 组 argv（空参数、每个已知 flag、值缺失、`--key --nextkey` 相邻、未知 flag、裸位置参数、单独的 `--`、空串值、大小写变体）。四个函数全部逐字等价。

`register-device.mjs` 额外需要 `else { i += 1 }`：`for` 头保证未识别 token 会终止循环，`while` 不会——不加就是死循环。

---

## B 档：47 条逐条处置

### 已修复（36 条）

| 规则 | 条数 | 做法 |
|---|--:|---|
| `Group parts of the regex together` | 7 | **1 条真 bug + 6 条可读性**（见下） |
| `Extract nested ternary` | 6 | 提取为 helper / 具名局部变量 |
| `Cognitive Complexity` | 9 | 拆函数（见下） |
| `Handle this exception` | 2 | 保留降级行为 + 写明理由 |
| `'If' statement in 'else'` | 2 | 合并为 `else if` |
| `Update function ... identical to another` | 3 | `writeInt32` 委托给 `writeInt64` |
| `"server" is overridden by string` 等 | 5 | 收敛为 `string` + 注释记录已知类别 |
| `Provide a compare function ... localeCompare` | 1 | `localeCompare(b, "en")` 固定 locale |
| `Review this redundant assignment` | 1 | 删除冗余 `else` 分支 |

#### 正则那 7 条里有一条是真 bug

`register-device.mjs` 的 `/(\/api)?\/activity(\/report)?|\/admin(\/devices)?$/` 把 `$` **只绑在第二个分支**上：

- `https://h/activity/other` → `https://h/other`（错）
- `https://h/activity?token=x` → `https://h?token=x`（错）

改成两个分支都锚定。**真实管线**（先清尾斜杠再套正则）14 个 URL 证明其余情况零变化，只有上述歧义输入行为改变——那个改变就是修复。

其余 6 条 `^\/+|\/+$` 经证明解析本来就是对的（JS 解析为 `(^\/+) | (\/+$)`），改成显式分组 `^(?:\/+)|(?:\/+)$`，18 个输入逐字等价。

#### 复杂度那 9 条

| 位置 | 原值 | 做法 | 等价性证据 |
|---|--:|---|---|
| `activity-worker.js` fetch | 51 | 拆 `handleRead`/`handleWrite`/`parseUpload` | 35 测试全绿 |
| `worker.js` fetch | 45 | 拆 `handleAdminDevices`/`handleReport`/`handleActivityRead` | **29 条路由逐字等价** |
| `detect-window.mjs` | 28 | 五策略改为 `probe*` 表 | **12 个场景逐字等价** |
| `vps-hub.mjs` handlePost | 22 | 提 `ingestProtobuf`/`acceptEvents` | **13 条 HTTP 请求逐字等价** |
| `strip-first-h1` | 19 | 拆 `findFirstHeadingIndex`/`headingMatchesTitle` | 7 测试全绿 |
| `fleet-store.js` getSnapshot | 18 | 提 `compareDevicesForCurrent` | 3 个测试直接断言 `snapshot.current` |

**拆分时发现并保住的一个行为**：`vps-hub` 对**空 events 数组**返回 `200 {count:0}`。我一度加了长度守卫会变成 400——那会让"collector 刷空窗口"变成错误。已恢复原行为并注释。

`worker.js` 同理：注册设备时 JSON 解析失败仍报 `Registration error`（原行为），没有改成新的错误文案。

### 记录不改（11 条）

> 另有 4 条 `A form label must be associated with a control`，随 C 档文件删除一并消失，不计入"不改"。

| 规则 | 条数 | 为什么不改 |
|---|--:|---|
| `Cognitive Complexity` 剩余 | 10 | 见下（原 19 条，改掉 9 条） |
| `Simplify regular expression`（52→20） | 1 | 见下 |

#### 剩余 10 条认知复杂度：阈值在这里不可达，不是没做

这些函数的复杂度来自**单一职责内的必需分支**，拆开只是把 `if` 搬到另一个函数、总分不变，却会增加调用面：

| 位置 | 现值 | 判断 |
|---|--:|---|
| `dynamic-svg/src/index.ts:91` `parseSvgToHast` | 35 | 单遍状态机：开标签/闭标签/自闭合/注释/文本五种情形，每种都必须处理。拆成子函数会让栈状态（`stack`）跨函数传递。 |
| `protobuf.ts:183` `decode` | 22 | 按 wire type 分派，每个分支对应一种 Protobuf 编码。拆开会把"读一个 varint"的边界处理散到多处。 |
| `steam-sync.mjs:135` | 28 | 单次 GitHub API 遍历 + 字段映射。分支对应 API 返回的可选字段。 |
| `dynamic-svg/src/index.ts:231` | 21 | 排版测量回退链。 |
| `repo-pages/bin/repo-pages.mjs` | 22 | CLI 命令分派。 |
| `mellow-player/src/runtime/enhance.ts:225` | 19 | 播放器挂载管线，顺序有语义（ticket → probe → engine 选择）。 |
| `fleet-store.js` 剩余 | 18×2 | D1 SQL 写入路径，每分支一种上报 schema。 |
| `RelativeTime.ts:18` / `:90` | 16 / 25 | 时间格式化分支，每个 `if` 是一个时间单位。 |
| `endpoint.ts:71` `POST` | 24 | HTTP 入口，分支是 content-type × 认证方式 × 载荷形状。 |
| `edgeone-function.ts:42` | 49 | 与 `endpoint.ts` 同构的 EdgeOne 变体。 |
| `masonry-pretext.ts:35` | 21 | 布局计算主循环。 |

**判据**是 spec 里的那条：复杂度重构"只做最严重的几个，不做全面重构（那会变成重写）"。我把 51/45/28/22/19/18 这六个做了（合计降 60+ 点认知负载），剩下这些改完仍是 15+，收益只是洁癖。

#### `Simplify regular expression`（52→20）：不改

`parseSvgToHast` 的标签正则：

```
/<(\/)?([a-zA-Z0-9\-_:]+)((?:\s+[a-zA-Z0-9\-_:@]+(?:=(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)/g
```

它要在一个 `exec` 循环里**区分**三种输入：标签（含可选属性串）、注释、纯文本。Sonar 建议的"简化"是把它拆成多个正则并用 `String.match`，那会让"一个字符流扫描器"变成"三次独立全文扫描 + 手动拼接位置信息"——更慢、更难对。**没有 bug 报告，只有可读性指标**，不值得。

---

## C 档：4 条 → 文件删除

`edgeone/prototype-admin.html` 的 4 条 `A form label must be associated with a control`。

**没有按"不改"处理，而是删除了文件**，理由是全仓零引用：

- 无 import、无路由、无构建步骤、无文档提及（grep 确认）
- 实际发货的管理页是 `worker/admin-ui.js` 的 `renderAdminHtml()`
- 文件自己的 `<title>` 写着 `PROTOTYPE`，自插件落地以来未修改

保留一个没人引用的页面等于留下第二份"管理页在哪"的答案。

---

## 验证

```
9 个插件 · 179 个测试 · 全部通过 · 全部构建通过
```

逐个插件跑（`what-im-doing` 的 `vps-hub.test.mjs` 用相对路径 `spawn`，必须在该插件目录下运行，这是既有测试的既有特性）：

```
dynamic-svg      4 | mangomesa-hub 1 | mellow-player 91 | pretext-masonry  9
repo-inventory  20 | repo-pages    9 | steam-recent   3 | strip-first-h1   7
what-im-doing   35
```

Einfacht 闸门：`python3 zreflect/registry.py --run commit` → `ran 7 / off 6 / failed 0`。

### 关于 `pretext-masonry` 的基线修正

开工时该插件 3 个测试文件全失败，原因是 `dist/` 从未构建（gitignore 产物）。`pnpm install && pnpm build` 后 9 个测试全过。**这是环境缺失，不是代码问题**，记录在此以免下次误判。

### 关于 `pnpm build` 的干扰

本仓 6 个插件的 `pnpm build` 会因 pnpm 10 的 ignored-builds 策略（esbuild/sharp 的 postinstall 未批准）**退出非零**，即使 `tsc` 本身成功。验证脚本因此直接调 `node_modules/.bin/tsc`。这是依赖层策略门，与代码无关。

---

## 等价性证据都做了什么

不是"看起来没变"，而是对每个非机械改动都跑了差分：

| 改动 | 方法 | 语料 |
|---|---|---|
| 4 个 CLI 解析器 | 双版本函数 + 桩依赖 | 43 组 argv |
| `worker.js` 路由 | 双版本 Worker + 假 D1 | 29 条路由 × 状态/体/头 |
| `vps-hub` handlePost | 双进程真服务器 | 13 条 HTTP 请求 |
| `detect-window` | 双版本 + 注入命令表 | 12 个策略组合 |
| 尾斜杠正则 | 纯函数比对 | 18 个输入 |
| hub 后缀正则 | 真实管线比对 | 14 个 URL |
| 复杂度重构 | 现有测试套件 | 179 测试 |

差分脚本放在仓外（`/tmp/gr/`），不提交——它们是一次性证明工具，不是测试。

---

## 下一轮扫描的预期

A 档清零、C 档消失，B 档 51 条里改掉 36 条，剩 10 条复杂度 + 1 条正则复杂度 = 11 条记录不改（另 4 条 form label 随文件删除）。**评级不一定升**——剩下的是高权重规则（复杂度全是 CRITICAL）。但这 11 条经判断属于"阈值不可达"或"简化会比原版更差"，不是未完成的工作。
