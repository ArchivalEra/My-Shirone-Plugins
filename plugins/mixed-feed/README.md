# Plugin: Mixed Timeline Feed (`mixed-feed`)

The **Mixed Timeline Feed** plugin bridges long-form blog articles and short-form status updates (Moments) into a unified, chronological timeline feed on the homepage.

---

## 1. Design Rationale

Shirone cleanly separates structured articles (`content/posts`) from micro-moments (`content/moments`). However, for active bloggers who frequently post quick updates, hardware experiments, or micro-thoughts, having moments siloed exclusively under `/moments/` reduces their discoverability.

`mixed-feed` merges these two content collections into a unified feed while preserving distinct visual identities for each medium:
- **Articles**: Retain standard rich `PostCard` rendering (hero covers, reading time, descriptions, tag chips).
- **Moments**: Render as lightweight status cards (mood badge, author avatar, direct `.custom-md` content, optional inline image gallery).

---

## 2. Architectural Design & Contract

### 2.1 Data Model (`FeedItem`)

```typescript
export type PostFeedItem = {
  type: "post";
  id: string;
  published: Date;
  data: CollectionEntry<"posts">["data"];
  entry: CollectionEntry<"posts">;
  url: string;
};

export type MomentFeedItem = {
  type: "moment";
  id: string;
  published: Date;
  moment: MomentItem;
};

export type FeedItem = PostFeedItem | MomentFeedItem;
```

### 2.2 Sorting and Priority

1. **Pinned Items (`pinned: true`)**:
   - Pinned posts and pinned moments always float to the top of the feed.
2. **Chronological Sorting**:
   - Non-pinned items are strictly ordered by `published` timestamp descending.

---

## 3. Configuration

Add the `mixedFeed` toggle to your `postListConfig` (or `config/post-list.yaml`):

```yaml
# config/post-list.yaml
pageSize: 10
mixedFeed: true
```

When `mixedFeed` is `false` or omitted:
- The site renders 100% standard Shirone blog post pagination.
- Zero extra performance or bundle overhead.

---

## 4. Components

- `src/components/molecules/FeedMomentCard.astro`: Dedicated lightweight feed card for micro-moments.
- `src/types/feed.ts`: Public TypeScript contracts.
- `src/utils/content-utils.ts`: Aggregator helper `getMixedFeed()`.
