# Plugin: Dynamic SVG (`@shirone-plugins/dynamic-svg`)

Zero-runtime, build-time Rehype plugin and Astro integration that inlines local SVGs marked with `#dynamic` directly into the DOM tree. This unlocks full cascading Material 3 CSS variables (`var(--primary)`, `var(--surface-container)`, `var(--on-surface)`) for instant light/dark mode switching and dynamic seed-color extraction, with optional zero-reflow Pretext text measurement linkage.

---

## 1. Why Dynamic SVG?

Standard Markdown images `![Alt](./diagram.svg)` render as `<img>` tags. Browsers execute `<img>` tags in isolated sandboxes where parent document CSS variables cannot cascade into the SVG. As a result:
- Night/day mode toggle cannot adapt SVG colors;
- Dynamic Material You / M3 seed-color changes cannot affect the SVG.

`@shirone-plugins/dynamic-svg` solves this at **build time**:
- Inlines target SVGs directly into the HAST syntax tree.
- Zero client-side JavaScript execution overhead (100% static HTML).
- Non-intrusive: only transforms images explicitly marked with `#dynamic` (e.g. `![Alt](./path.svg#dynamic)`). All standard images remain completely untouched.
- Optional linkage with `@shirone-plugins/pretext-masonry` or `@chenglou/pretext` for zero-reflow arithmetic multi-line text layout.

---

## 2. Usage

### 2.1 In Markdown

```markdown
![System Architecture](./assets/architecture.svg#dynamic)
```

Inside `architecture.svg`, use standard CSS variables:
```xml
<svg viewBox="0 0 800 400" xmlns="http://www.w3.org/2000/svg">
  <!-- Card background follows M3 surface container -->
  <rect width="800" height="400" rx="16" fill="var(--surface-container)" stroke="var(--outline-variant)" />
  
  <!-- Accent header follows M3 primary token -->
  <text x="30" y="50" fill="var(--primary)" font-size="20" font-weight="bold">Architecture Overview</text>
  
  <!-- Body text follows on-surface token -->
  <text x="30" y="90" fill="var(--on-surface)" font-size="14">Dynamic content adapting to light/dark modes.</text>
</svg>
```

### 2.2 Pretext Linkage (Optional)

Mark any `<text>` element in the SVG with `data-pretext-max-width="300"` to automatically wrap text lines without DOM reflow:

```xml
<text x="30" y="120" data-pretext-max-width="300" data-pretext-line-height="22" fill="var(--on-surface-variant)">
  Long sentences that automatically break into tspans using pure arithmetic without foreignObject glitches.
</text>
```

---

## 3. Configuration

```javascript
// astro.config.mjs or markdown-processor.mjs
import { rehypeDynamicSvg } from "@shirone-plugins/dynamic-svg";

export const plugins = [
  [rehypeDynamicSvg, {
    allSvg: false, // only match #dynamic
    pretext: {
      enabled: true,
    }
  }],
];
```
