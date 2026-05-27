/**
 * fb-tldr — background service worker (MV3)
 *
 * The network layer. All requests to the Cloudflare Worker happen here (not in
 * the content script) so that:
 *   - the granted host permission covers the Worker host → no page CORS
 *   - credentials:"include" sends the first-party CF_Authorization cookie that
 *     Cloudflare Access sets after SSO login.
 *
 * The Worker URL is NOT hardcoded — the user sets it on the Options page, which
 * also requests host permission for that origin. Until it's set, calls return
 * { error: "config" } and the UI points the user to Options.
 *
 * Messages handled:
 *   { type:"summarize", text }  -> { summary } | { error:"auth"|"config"|... }
 *   { type:"whoami" }            -> { email } | { error:"auth"|"config" }
 *   { type:"signin" }            -> opens the Access login tab (or Options)
 */

async function getBase() {
  const { workerBase } = await chrome.storage.local.get("workerBase");
  return (workerBase || "").replace(/\/+$/, ""); // no trailing slash
}

/** True when Access has redirected us to a login page instead of the API. */
function looksLikeAuthChallenge(resp) {
  if (resp.type === "opaqueredirect" || resp.status === 0) return true;
  if (resp.status === 401 || resp.status === 403) return true;
  const ct = resp.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return true; // Access serves an HTML login page
  return false;
}

async function callWorker(path, init) {
  const base = await getBase();
  if (!base) return { error: "config" };
  const resp = await fetch(base + path, {
    credentials: "include",
    redirect: "manual",
    ...init,
  });
  if (looksLikeAuthChallenge(resp)) {
    await chrome.storage.local.set({ needsAuth: true });
    return { error: "auth" };
  }
  await chrome.storage.local.set({ needsAuth: false });
  try {
    return await resp.json();
  } catch {
    return { error: "bad response" };
  }
}

async function summarize(text) {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (!enabled) return { error: "disabled" };
  return callWorker("/summarize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

async function openSignin() {
  const base = await getBase();
  // A real tab navigation lets the Access SSO redirect chain set the cookie
  // first-party. With no Worker configured, send the user to Options instead.
  if (base) chrome.tabs.create({ url: base + "/whoami" });
  else chrome.runtime.openOptionsPage();
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg && msg.type) {
      case "summarize":
        sendResponse(await summarize(msg.text));
        break;
      case "whoami":
        sendResponse(await callWorker("/whoami", { method: "GET" }));
        break;
      case "signin":
        await openSignin();
        sendResponse({ ok: true });
        break;
      default:
        sendResponse({ error: "unknown message" });
    }
  })();
  return true; // keep the message channel open for the async response
});

// Sensible default on install: extension starts disabled.
chrome.runtime.onInstalled.addListener(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled === undefined) await chrome.storage.local.set({ enabled: false });
});
