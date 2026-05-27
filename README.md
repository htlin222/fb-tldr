# fb-tldr

A Chrome extension that adds an inline **TL;DR** button to long Facebook News
Feed posts. Click it and the post is summarized into **繁體中文** (2–3 sentences)
by **Cloudflare Workers AI** (free tier: 10,000 Neurons/day).

The Workers AI call goes through a small **Cloudflare Worker** so no API token
ever lives in the browser, and the Worker is gated by **Cloudflare Access
(Zero Trust)** — only `you@example.com` can use it.

```
content.js (facebook.com)            ── scrape post text ──┐
   • finds long posts via "查看更多 / See more"            │ chrome.runtime.sendMessage
   • injects TL;DR button next to it                       ▼
background.js (service worker)  ── fetch …, credentials:"include" ──┐
                                                                    ▼
Cloudflare Access (only you@example.com)  ──►  Worker  ──►  env.AI.run(Llama 3.1 8B)
```

## Layout

| Path                              | What                                              |
| --------------------------------- | ------------------------------------------------- |
| `worker/`                         | Cloudflare Worker proxy (Workers AI binding)      |
| `extension/`                      | MV3 Chrome extension                              |
| `docs/cloudflare-access-setup.md` | Step-by-step Worker deploy + Zero Trust config    |
| `fb.har`                          | Reference capture of a Facebook session           |

## Quick start

1. **Deploy + protect the Worker** — follow
   [`docs/cloudflare-access-setup.md`](docs/cloudflare-access-setup.md).
2. **Install the extension** — either grab the `.crx` from
   [Releases](../../releases), or `chrome://extensions` → *Developer mode* →
   *Load unpacked* → select `extension/`.
3. **Set your Worker URL** — click the fb-tldr icon → **⚙ 設定 Worker 網址** →
   enter your Worker URL (e.g. `https://fb-tldr.example.com`) and approve the
   host-access prompt. (Stored in `chrome.storage`; nothing is hardcoded.)
4. **Use it** — open <https://www.facebook.com>, flip the toggle **ON**, click
   **Sign in to Cloudflare** (one-time SSO), then scroll your feed: long posts
   show a **TL;DR** button next to *查看更多*.

## How auth works

Cloudflare Access sets a first-party `CF_Authorization` cookie on your Worker
host after SSO login. The extension's **background** service worker (using the
host permission you granted in Options) fetches the Worker with
`credentials:"include"`, so the cookie rides along — no token stored anywhere.
When the session expires the popup shows "尚未登入" and the **Sign in** button
re-runs the flow.

## Toggle on/off

A single flag, `chrome.storage.local.enabled`, is the source of truth. The popup
toggle writes it; the content script subscribes to `storage.onChanged` and
injects or tears down its buttons live (no page reload).

## Notes & limits

- **Text only** — images, videos, link cards, and comments are ignored;
  Messenger is out of scope (feed only).
- Facebook's DOM is obfuscated and changes often; the post-detection selectors
  (`role="feed"`, `role="article"`, the *See more* text match) are best-effort
  and may need occasional tuning.
- Personal-use tool. Keep summarizing manual/on-demand (the per-post button does
  this) rather than bulk-scraping.
- Default model `@cf/meta/llama-3.1-8b-instruct` — change `MODEL` in
  `worker/src/index.js` to trade quality for Neurons.
