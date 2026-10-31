"""My-Shirone-Plugins 的事实采集层。

上游 `facts.py` 自带的 `measure_example()` 只数本仓的 py/md 文件 —— 那是占位实现。
本仓要量的是**插件生态的形状**：有多少插件、多少测试、哪些插件没有测试、构建产物多大。

每条 `fact()` 的第二个参数是**复跑命令**，由 `check_facts_replay.py` 在每次提交时真的执行。
所以命令必须是单行 shell、且 stdout 恰好等于值（裸值契约）—— 不许 echo 额外字符。
"""

import os
import subprocess

# zreflect/ 各模块用同目录裸导入（facts.py 就是这么写的：`from ledger import fact`）。
# 所以这里也裸导入 —— 由 facts.py 加载本模块时，sys.path 已含 zreflect/。
# 显式补 sys.path：本模块也可能被 `python3 zreflect/measure_plugins.py` 直接跑。
import sys as _sys

_sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gate import module_meta                               # noqa: E402
from ledger import fact                                    # noqa: E402

# 仓库根（facts.py 通过 REFLECT_MEASURE_MODULE 调用本模块时，cwd 已是仓库根）
ROOT = os.getcwd()
PLUGINS_DIR = os.path.join(ROOT, "plugins")


def _plugin_dirs():
    """插件目录名列表（排除非目录与隐藏项）。"""
    try:
        names = sorted(
            n for n in os.listdir(PLUGINS_DIR)
            if os.path.isdir(os.path.join(PLUGINS_DIR, n)) and not n.startswith(".")
        )
    except OSError:
        return []
    return names


def _plugin_names_joined():
    """插件名用逗号连接 —— 供复跑命令比对（顺序固定，可 diff）。"""
    return ",".join(_plugin_dirs())


def measure():
    """返回 {key: fact(...)}。

    ⚠️ 约定（上游 facts.py）：值只允许 int/str，命令必须能独立复跑并输出同一个值。
    """
    facts = {}

    # ── 插件数量 ────────────────────────────────────────────────────────────
    dirs = _plugin_dirs()
    facts["plugins"] = fact(
        len(dirs),
        "ls -d plugins/*/ | wc -l",
        "plugins/",
        "插件目录数（每个插件一个顶层目录）",
    )

    # ── 插件名录（防止重命名/增删静默发生）──────────────────────────────────
    facts["plugin_names"] = fact(
        _plugin_names_joined(),
        "ls -d plugins/*/ | sed 's|plugins/||;s|/$||' | tr '\\n' ',' | sed 's/,$//'",
        "plugins/",
        "插件名清单（逗号连接，顺序即排序结果）",
    )

    # ── 测试文件数 ──────────────────────────────────────────────────────────
    # 用 shell 数，与复跑命令同源，避免 python 与 shell 语义分叉。
    try:
        out = subprocess.run(
            ["bash", "-c", "find plugins -name '*.test.mjs' -not -path '*/node_modules/*' | wc -l"],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        n_tests = int(out.stdout.strip() or 0) if out.returncode == 0 else -1
    except (OSError, subprocess.SubprocessError, ValueError):
        n_tests = -1
    facts["test_files"] = fact(
        n_tests,
        "find plugins -name '*.test.mjs' -not -path '*/node_modules/*' | wc -l",
        "plugins/",
        "测试文件数（*.test.mjs）",
    )

    # ── 有测试的插件数 ──────────────────────────────────────────────────────
    with_tests = [n for n in dirs if os.path.isdir(os.path.join(PLUGINS_DIR, n, "tests"))]
    facts["plugins_with_tests"] = fact(
        len(with_tests),
        "ls -d plugins/*/tests 2>/dev/null | wc -l",
        "plugins/",
        "含 tests/ 目录的插件数（应与 plugins 相等，缺一个就是补测缺口）",
    )

    # ── 无测试的插件（值为插件名清单；空串 = 全都有测试）────────────────────
    without = [n for n in dirs if n not in with_tests]
    facts["plugins_without_tests"] = fact(
        ",".join(without),
        (
            "comm -13 <(ls -d plugins/*/tests 2>/dev/null | sed 's|plugins/||;s|/tests||' | sort) "
            "<(ls -d plugins/*/ | sed 's|plugins/||;s|/$||' | sort) | tr '\\n' ',' | sed 's/,$//'"
        ),
        "plugins/",
        "没有 tests/ 目录的插件名（逗号连接；空值表示全部有测试）",
    )

    return facts

# 平台模块必须正面声明自己（registry 的名录对账要求）：
# 「不参与 selftest」也要说出来，而不是靠沉默。
MODULE = module_meta(
    "本仓数据层",
    "量插件生态形状：插件数/名录/测试文件数/测试覆盖缺口（只读持久盘，值=复跑命令）",
    selftest=False,
)
