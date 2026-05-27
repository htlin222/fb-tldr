# Changelog

All notable changes to fb-tldr. Format follows
[Keep a Changelog](https://keepachangelog.com/); versions track
`extension/manifest.json`. The release workflow publishes the section whose
heading matches the pushed tag (e.g. tag `v0.1.0` → the `## [0.1.0]` block).

## [0.1.1] - 2026-05-27

### Fixed

- TL;DR buttons no longer **accumulate** when toggling 顯示較多 / 顯示較少.
  Facebook renders a fresh See-more node on each toggle; injection now dedups
  on the post's message container (one button per post) instead of per node.
  Covered by a `linkedom` smoke test (`pnpm test`).

## [0.1.0] - 2026-05-27

### Added

- Inline **TL;DR** button on long Facebook News Feed posts (home feed **and**
  groups), anchored next to the native 查看更多 / 顯示更多 / See more control.
- Summaries in **繁體中文** via Cloudflare Workers AI (Llama 3.1 8B), proxied
  through a Cloudflare Worker behind **Zero Trust Access** — no API token ever
  lives in the browser.
- **Map-reduce** chunking in the Worker (~2000 chars/chunk) so long Chinese
  posts summarize instead of returning empty.
- On/off toggle; off-screen text capture with a shimmer **skeleton** while
  pending; original post collapsed behind a 顯示/隱藏原始內容 toggle.
- Configurable Worker URL via the **Options** page (host permission requested
  on save) — nothing is hardcoded.
- CI release workflow that builds and publishes a signed **.crx** (+ zip).
