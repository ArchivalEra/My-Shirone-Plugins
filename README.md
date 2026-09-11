# My-Shirone-Plugins

A curated collection of modular plugins, component extensions, and functional enhancements for the [Shirone](https://github.com/LyraVoid/Shirone) blog theme ecosystem.

All plugins in this repository are designed strictly adhering to Shirone's core architectural guidelines:
- **Zero-Breaking Compatibility**: Features are non-intrusive and optional by default.
- **Zero-Cost Inactivity**: When disabled, no extra runtime scripts or empty DOM nodes are generated.
- **Atomic Hierarchy & M3E Compliance**: Component implementations respect Material 3 Expressive standards and Shirone's atomic design system.

---

## Plugins Index

| Plugin | Status | Description |
|---|---|---|
| [`what-im-doing`](./plugins/what-im-doing) | Active | Serverless edge fleet telemetry aggregator & Material 3 multi-device activity capsule / drawer. |
| [`strip-first-h1`](./plugins/strip-first-h1) | Active | Compile-time AST optimizer to eliminate redundant first `<h1>` headings, fixing double title syndrome & TOC pollution. |
| [`pretext-masonry`](./plugins/pretext-masonry) | Active | Zero-reflow pure arithmetic waterfall layout powered by `@chenglou/pretext`, eliminating forced layout thrashing. |
| [`mixed-feed`](./plugins/mixed-feed) | Active | Unified timeline feed combining long-form blog posts and lightweight micro-moments on the homepage. |

---

## Guidelines & Architecture

Each plugin is located under `plugins/<plugin-name>` and contains:
- `README.md`: Design rationale, configuration keys, and usage instructions.
- Source implementations (`src/`), types (`types/`), and integration helpers.

---

## License

[MIT](./LICENSE) © 2026 ArchivalEra
