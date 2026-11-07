# My-Shirone-Plugins · 活状态

> 本文件是**活状态文档**：只写「现在是什么」。**数字一律引用台账键**（写法 `[[键名]]`），
> 不手抄——手抄的数字从写下的那一刻起就开始腐烂。文件末尾的机器块由
> `zreflect/facts.py --render-doc` 渲染，不要手改。

## 现在是什么

- **插件**：[[plugins]] 个，名录见 [[plugin_names]]。
- **测试**：[[test_files]] 个测试文件，覆盖 [[plugins_with_tests]] 个插件。
- **缺口**：[[plugins_without_tests]] 尚无 tests/ 目录。

## 怎么跑

```bash
python3 zreflect/facts.py                        # 重测全部事实并写台账
python3 zreflect/facts.py --render-doc STATE.md  # 重渲染机器块（pre-commit 自动做）
python3 zreflect/registry.py --run commit        # 全部 commit 相位闸门
sh gates-selftest.sh                             # 每道闸门先证明自己会红
```

## 已知边界

- 台账只覆盖「一条命令能量出来」的机器事实；插件行为正确性由各自的 `*.test.mjs` 负责。
- 构建产物（dist/、node_modules/）不入库，也不进台账。

<!-- AUTO:FACTS -->
> 本区块由 `zreflect/facts.py --render-doc` 从 `FACTS.json` 渲染，**不要手改**（pre-commit 会重算并 `git add`）。
> 正文里的「测出来的数字」只在这里生产：要引用就写 `[[键名]]`，不要手抄数字。

| 键 | 值 | 测于 | 复跑命令 |
|---|---|---|---|
| `plugin_names` | **dynamic-svg,mangomesa-hub,mellow-player,mixed-feed,pretext-masonry,repo-inventory,repo-pages,steam-recent,strip-first-h1,what-im-doing** | 2026-11-07T22:01:01+0800 | `ls -d plugins/*/ | sed 's|plugins/||;s|/$||' | tr '\n' ',' | sed 's/,$//'` |
| `plugins` | **10** | 2026-11-07T22:01:01+0800 | `ls -d plugins/*/ | wc -l` |
| `plugins_with_tests` | **9** | 2026-11-07T22:01:02+0800 | `ls -d plugins/*/tests 2>/dev/null | wc -l` |
| `plugins_without_tests` | **mixed-feed** | 2026-11-07T22:01:02+0800 | `comm -13 <(ls -d plugins/*/tests 2>/dev/null | sed 's|plugins/||;s|/tests||' | sort) <(ls -d plugins/*/ | sed 's|plugins/||;s|/$||' | sort) | tr '\n' ',' | sed 's/,$//'` |
| `test_files` | **27** | 2026-11-07T22:01:02+0800 | `find plugins -name '*.test.mjs' -not -path '*/node_modules/*' | wc -l` |

5 条事实。
<!-- /AUTO:FACTS -->

<!-- AUTO:GATES -->
> 本区块由 `zreflect/facts.py --render-doc` 从发现式名录（zreflect/registry.py 的声明行）渲染，**不要手改**。
> 执行面（hooks / CI）读 `registry --run <相位>` —— 相位是声明字段（`runs_at`），不是文件名。

| 闸门 | 相位 | 它挡住什么 | 消费的旋钮 | 可未启用的理由 |
|---|---|---|---|---|
| `check_ab.py`（A/B 闸门） | commit | A/B 同旗标不变式（非 allow 轴差异 = 混淆变量，A/B 作废） | `REFLECT_AB` | 不做 A/B 对照实验的仓不需要它：规格未配 ⇒ 明说未启用 |
| `check_envfile.py`（env 文件闸门） | commit | 守钩子的 REFLECT_* 载体（旋钮 typo / 指向缺失 / 空值） | `REFLECT_ENV_FILE` | 没有 env 载体的仓（旋钮全用默认值）不需要它：规格未配 ⇒ 明说未启用 |
| `check_facts.py`（事实闸门） | commit | 块一致性 / 裸数字 / 坏引用 | `REFLECT_FACTS`, `REFLECT_DOC`, `REFLECT_NAKED_MIN` | — |
| `check_facts_replay.py`（复跑闸门） | commit | 台账 cmd 逐字复跑（裸值契约：stdout 必须等于值） | `REFLECT_FACTS`, `REFLECT_REPLAY`, `REFLECT_REPLAY_TIMEOUT` | 显式设 REFLECT_REPLAY=off 时整道闸门关闭（这是整仓出口；未配时照跑） |
| `check_i18n.py`（语言覆盖闸门） | commit | 本体零语言：用户可见文本必须走 M(code)；语言包可选 | `REFLECT_I18N_ROOT` | — |
| `check_instruments.py`（仪器生命周期闸门） | commit | 恒常检测（first_seen）+ 被证伪量法登记 | `REFLECT_INSTRUMENTS`, `REFLECT_INSTRUMENT_DAYS`, `REFLECT_FACTS` | 两个旋钮都未配 ⇒ 特化机制没启用（可插拔，本仓按需再开） |
| `check_invariants.py`（不变量闸门） | commit | 声明式不变量：仓库文件必须/不得含某片段（grep 级） | `REFLECT_INVARIANTS` | 不写声明式不变量的仓不需要它：规格未配 ⇒ 明说未启用（可插拔） |
| `check_lint.py`（静态机器检查） | commit | ruff 的 C901/F/E9/B，判据在 ruff.toml —— 「已清」必须由每次提交复跑，不是一次手工跑完写进台账（R-004） | — | 本机没装 ruff（外部工具，不是本仓依赖）⇒ 明说未启用；CI 里 pip 装了它，那道会真跑 |
| `check_locks.py`（锁定源闸门） | commit | 锁定源清单（URL + 文件 + sha256 的内容指纹） | `REFLECT_LOCKS` | 不钉上游字节的仓不需要它：规格未配 ⇒ 明说未启用 |
| `check_pins.py`（pin 闸门） | commit | 派生树 pin 一致性（stamp commit / dirty / 版本串对读） | `REFLECT_PINS` | 没有派生树的仓不需要它：规格未配 ⇒ 明说未启用 |
| `check_questions.py`（悬案闸门） | commit | 未结案的问题必须挂一个能跑的结算件 | `REFLECT_QUESTIONS` | — |
| `check_readme_sync.py`（三语 README 闸门） | commit | 语言版本是同一条断言的三份拷贝：结构互链 + 每次推送同批 | `REFLECT_READMES` | — |
| `check_retractions.py`（翻案重现检测） | commit | 被推翻的断言不许悄悄回来当现状 | `REFLECT_RETRACTIONS`, `REFLECT_DOCS`, `REFLECT_HISTORY_SECS` | — |
| `check_snapshots.py`（模块级快照闸门） | commit | 跨模块 import 的可变全局是值拷贝（陈旧快照）：改成 import 模块 + 读属性 | `REFLECT_SNAPSHOT_ROOT` | — |
| `check_stale.py`（陈旧断言检测） | commit | sha 出处 / 退役名 / 测龄 | `REFLECT_DOCS`, `REFLECT_FACTS`, `REFLECT_HISTORY_SECS`, `REFLECT_RETIRED`, `REFLECT_STALE_DAYS` | — |
| `check_world.py`（world 闸门） | commit | 声明式验证对象：多线仓库共享验证环境的世界对账 | `REFLECT_WORLD`, `REFLECT_WORLD_LINE` | 单线仓库不需要它：规格未配 ⇒ 明说未启用 |
| `doctor.py`（开工预检 doctor） | start-of-work | 进程 / 端口活性（查会死的东西 ⇒ runs_at=start-of-work，不进 pre-commit） | `REFLECT_DOCTOR`, `REFLECT_DOCTOR_TIMEOUT` | 本仓没有 doctor.json 规格：不查进程/端口活性 ⇒ 明说未启用 |

17 道闸门（发现式名录派生 —— 手写清单会漂，加闸门 = 落一个声明行，这里自动长出来）；其中 10 道**可未启用**（末列是**声明**理由，不是运行时状态 —— 此刻谁 off 要看 `registry --run <相位>`）。
<!-- /AUTO:GATES -->
