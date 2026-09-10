# Plugin: Pretext Zero-Reflow Masonry (`@shirone-plugins/pretext-masonry`)

A pure drop-in Astro Integration for Shirone that replaces DOM-thrashing waterfall calculations (`card.offsetHeight`) with pure arithmetic text measurements powered by [`@chenglou/pretext`](https://github.com/chenglou/pretext).

---

## 1. The Engineering Motivation

### The Problem: Synchronous Layout Thrashing
Traditional CSS grid waterfall layouts (including standard Shirone's `src/utils/masonry.ts`) query DOM dimensions imperatively:
```typescript
const measurements = cards.map((card) => {
  const height = card.offsetHeight; // <-- Synchronous Forced Reflow!
  // ...
});
```
When loading a feed of 20–50 posts, resizing the browser window, or navigating between routes via Swup, repeatedly querying `card.offsetHeight` forces the browser's layout engine to freeze execution, calculate CSS geometry, and recalculate styles. On 120Hz displays or mobile devices, this induces noticeable micro-stutter and frame drops.

### The Solution: Pretext Pure Arithmetic
Pretext splits text layout into two distinct phases:
1. **`prepare(text, font, options)`**: Tokenizes via `Intl.Segmenter` (handling Unicode UAX #14 line breaking and CJK graphemes), extracts glyph metrics once using off-screen Canvas `measureText`, and caches widths.
2. **`layout(prepared, maxWidth, lineHeight)`**: Performs **pure arithmetic** over numeric arrays. Zero DOM reads, zero reflows, zero style recalculation. Operates in $\sim 0.0002\,\text{ms}$ per block ($\sim 500\times$ faster than browser layout).

By predicting card heights purely from variable text fields (Titles, Descriptions) and fixed tokens (16:9 Cover aspect ratio, paddings, metadata, tag chips), this plugin achieves **zero forced synchronous reflows**.

---

## 2. Key Production Features

1. **Pure Drop-in Zero Intrusion**:
   Hooks into Astro via a Vite module alias (`@utils/masonry` $\to$ runtime). No modifications required in Shirone's core Astro templates or Svelte components.
2. **Webfont Readiness Dual Gate**:
   Awaits `document.fonts.ready` + 1 frame `requestAnimationFrame` before measuring. Prevents measuring fallback system fonts before webfonts download.
3. **ResizeObserver Loop Guard (`WIDTH_EPSILON_PX = 1`)**:
   Setting `grid-row-end: span N` modifies the container's height. The guard ignores all self-induced height-only resize notifications, eliminating feedback loops.
4. **Multi-line Clamp Capping**:
   Post descriptions styled with `-webkit-line-clamp: 2` are mathematically clamped ($\min(2, \text{lineCount})$) to prevent card height inflation.
5. **Full CJK & Mixed-Language Support**:
   Leverages Pretext's native grapheme segmentation and iteration mark rules for Japanese and Chinese typography.
6. **Graceful Single-Pass Fallback**:
   If Canvas or Pretext is unavailable, falls back to a clean batched single-pass DOM reader (all reads grouped before all writes).

---

## 3. Installation & Usage

### 3.1 Installation

```bash
pnpm add -D @shirone-plugins/pretext-masonry
```

### 3.2 Astro Configuration

Add the integration to `astro.config.mjs`:

```javascript
// astro.config.mjs
import { defineConfig } from "astro/config";
import pretextMasonry from "@shirone-plugins/pretext-masonry";

export default defineConfig({
  integrations: [
    pretextMasonry({
      debug: false,
    }),
  ],
});
```

That's it! All masonry consumers (`PostPage.astro`, `layout-mode.ts`, `ProjectSection.svelte`, `DeviceSection.svelte`) will automatically execute zero-reflow layout calculations.

---

## 4. Configuration Options

```typescript
export interface PretextMasonryOptions {
  /**
   * Whether the Pretext zero-reflow engine is active.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Output debug diagnostic metrics in browser console.
   * Default: false
   */
  debug?: boolean;

  /**
   * Fallback to batched DOM offsetHeight if Pretext calculation fails.
   * Default: true
   */
  fallbackToDom?: boolean;

  /**
   * Override default card geometry tokens (spacings, aspect ratios).
   */
  tokens?: Partial<CardGeometryTokens>;
}
```

---

## 5. Mathematical Model

For a column width $W_{\text{col}}$:
- **Text Width**: $W_{\text{text}} = W_{\text{col}} - 40\,\text{px}$ (or $W_{\text{col}} - 96\,\text{px}$ without cover).
- **Cover Height** ($16:9$): $H_{\text{cover}} = \text{round}((W_{\text{col}} - 32) \times 9 / 16) + 16\,\text{px}$.
- **Title Height**: $H_{\text{title}} = \text{layout}(\text{title}, W_{\text{text}}, 28.6\,\text{px}).\text{height}$.
- **Description Height**: $H_{\text{desc}} = 12\,\text{px} + \min(2, \text{lines}) \times 22.4\,\text{px}$.
- **Total Card Height**: $H_{\text{total}} = H_{\text{cover}} + H_{\text{title}} + H_{\text{desc}} + H_{\text{meta}} + H_{\text{tags}} + 40\,\text{px}$.
- **Row Span**: $\text{span} = \lceil (H_{\text{total}} + 16) / 8 \rceil$.

---

## 6. License

MIT
