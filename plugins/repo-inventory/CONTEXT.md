# Repository Inventory

Build-time machine facts about the repositories a site presents: whether each has a usable GitHub Pages mirror, whether it is served from this cluster's own mirror tree, and when it was last pushed.

## Language

**Repository Inventory**:
The artifact produced by one probe run: a timestamp, the mirror tree's directory names, and one `RepoState` per repository that was actually read.
_Avoid_: repo list, repo index, catalog

**Curated Whitelist**:
The repository names a site chooses to present, taken from the `repository` fields of its projects data. The inventory answers only for these; a repository outside the whitelist has no business appearing, which is why the whitelist is passed in rather than discovered.
_Avoid_: allowlist, config, repo set

**RepoState**:
One repository's machine facts — its Pages state, whether it is accelerated, and its last push. Editorial fields (a summary, a technology list, a phase) are not part of it.
_Avoid_: repo info, metadata, project

**Pages State**:
Whether a repository's GitHub Pages mirror is usable — `ready`, `absent`, or `pending`. `pending` means Pages is enabled but the last build did not succeed, so the mirror may be stale. An unreadable build status on an enabled mirror is `ready`, not `pending`: the distinction only exists when the status was actually read.
_Avoid_: status, health, availability

**Accelerated**:
Served from the mirror repository's own tree instead of being proxied to GitHub Pages. Derived from the presence of a directory, never from a second hand-kept list.
_Avoid_: local, cached, domestic

**Mirror Repository**:
The repository whose tree holds the accelerated mirrors, one directory per repository name.
_Avoid_: proxy repo, site repo

**Mirror Tree**:
The directory inside the mirror repository that holds those directories.
_Avoid_: repo dir, mirrors folder

**Orphan**:
A directory in the mirror tree with no matching whitelist entry. Orphans are reported, never silently ignored — an unreachable tree left behind by a rename is exactly what this naming exists to surface.
_Avoid_: stale entry, dead dir

**Inventory Probe**:
The adapter that supplies facts to the inventory: per-repository facts, the mirror tree listing, and the clock. The inventory module never fetches anything itself, so the probe is the only place that knows about the network.
_Avoid_: fetcher, client, backend

**Published Inventory**:
The same inventory, served as a static file so a page can re-read it without the build. It carries the same `generatedAt`, so a reader can always tell how old the data is.
_Avoid_: live data, API, endpoint
