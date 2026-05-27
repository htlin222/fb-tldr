# Cloudflare setup — Workers AI + Zero Trust Access

Two pieces: deploy the Worker (holds the AI binding), then put Cloudflare Access
in front of its hostname so only `you@example.com` can call it.

## 0. Prerequisites

- The zone **`example.com`** is already on your Cloudflare account.
- `wrangler` authenticated: `pnpm dlx wrangler login` (or `npx wrangler login`).
- Workers AI is enabled on the account (free tier = 10,000 Neurons/day).

> The API token at <https://dash.cloudflare.com/profile/api-tokens> is only
> needed if you script deploys in CI (token needs **Workers Scripts:Edit** +
> **Workers AI:Read**). For local `wrangler login` you don't need to paste one.

## 1. Deploy the Worker

```bash
cd worker
pnpm install
pnpm wrangler deploy        # publishes to fb-tldr.example.com (custom_domain route)
```

If the custom domain isn't created automatically, add it in the dashboard:
**Workers & Pages → fb-tldr-proxy → Settings → Domains & Routes → Add custom
domain → `fb-tldr.example.com`**.

### Local test before deploy (Access NOT enforced locally)

```bash
pnpm wrangler dev
curl -s -X POST localhost:8787/summarize \
  -H 'content-type: application/json' \
  -d '{"text":"（貼上一段很長的 Facebook 貼文內文）"}'
# → {"summary":"…兩三句繁體中文…","model":"@cf/meta/llama-3.1-8b-instruct"}
```

## 2. Protect it with Access (Zero Trust)

Dashboard → **Zero Trust → Access → Applications → Add an application →
Self-hosted**.

| Field                | Value                                            |
| -------------------- | ------------------------------------------------ |
| Application name     | `fb-tldr`                                         |
| Session duration     | e.g. `24h` (longer = fewer re-logins)            |
| Application domain   | `fb-tldr.example.com`  (subdomain, no path)    |

**Identity provider:** add **Google** (or use the built-in **One-time PIN**,
which emails a code to the address that signs in).

**Policy** (Add a policy):

| Field   | Value                                       |
| ------- | ------------------------------------------- |
| Name    | `only-me`                                   |
| Action  | **Allow**                                   |
| Include | **Emails** → `you@example.com`     |

**CORS settings:** leave them empty. The extension calls the Worker from its
**background service worker** (which has `host_permissions` for the host), so
Chrome exempts those requests from page CORS — there is no `Origin` check or
preflight for Access to handle. Optionally toggle **"Bypass OPTIONS requests to
origin" → ON** so any stray preflight reaches the Worker's own `OPTIONS` handler;
nothing else on that tab is needed. (Do not enable "Allow all origins" with
credentials — that combination is invalid.)

Save.

## 3. Verify protection + identity

```bash
# Without the Access cookie this should 302 to the login page (= protected):
curl -sI https://fb-tldr.example.com/summarize | head -n1
```

In a browser, open **https://fb-tldr.example.com/whoami** → you get the Access
SSO challenge → after signing in as `you@example.com` it returns:

```json
{ "email": "you@example.com" }
```

That confirms Access injects `Cf-Access-Authenticated-User-Email` and the Worker
sees it. The browser now holds the `CF_Authorization` cookie for the hostname —
which is exactly what the extension's background fetch rides on.

## 4. Point the extension at the Worker

If you used a different hostname, update it in **two** places:

- `extension/background.js` → `WORKER_BASE`
- `extension/manifest.json` → `host_permissions`
- `worker/wrangler.toml` → `routes.pattern`
