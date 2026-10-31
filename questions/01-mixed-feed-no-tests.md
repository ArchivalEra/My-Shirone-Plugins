# 01: mixed-feed 插件没有 tests/ 目录

**What to build:** 给 `plugins/mixed-feed/` 补一套 `tests/*.test.mjs`，覆盖它的时间线合并逻辑。

台账键 `plugins_without_tests` 当前值是 `mixed-feed` —— 这是 Einfacht 接入当天（2026-10-31）
第一次测量就暴露的唯一测试缺口。其余 9 个插件都有 tests/。

**为什么挂这条**：本仓的插件是给主题消费的，任何一个缺测试就意味着
「它坏了没人知道」，而 CI 跑的是 `plugins/*/tests/*.test.mjs`，没有测试文件的插件
在 CI 里是**静默通过**的（0 个测试也算绿）。

**Settling:** 不存在 —— 本工单的第一交付物是一套能跑的测试文件。
判据：`ls -d plugins/*/tests 2>/dev/null | wc -l` 的结果从 9 变成 10，
且 `find plugins -name '*.test.mjs' -not -path '*/node_modules/*' | wc -l` 大于 27。

**Status:** ready-for-agent
