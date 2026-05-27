/* fb-tldr — Options: set the Cloudflare Worker URL + grant host permission. */

const input = document.getElementById("worker");
const saveBtn = document.getElementById("save");
const statusEl = document.getElementById("status");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status " + (kind || "");
}

function normalize(raw) {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:") return null;
    return u.origin; // strips path / trailing slash
  } catch {
    return null;
  }
}

saveBtn.addEventListener("click", async () => {
  const origin = normalize(input.value);
  if (!origin) {
    setStatus("請輸入有效的 https 網址。", "warn");
    return;
  }
  // Request permission to fetch this origin from the background worker.
  const granted = await chrome.permissions.request({ origins: [origin + "/*"] });
  if (!granted) {
    setStatus("未取得該網域的存取權限，無法呼叫 Worker。", "warn");
    return;
  }
  await chrome.storage.local.set({ workerBase: origin });
  input.value = origin;
  setStatus("已儲存：" + origin, "ok");
});

(async () => {
  const { workerBase } = await chrome.storage.local.get("workerBase");
  if (workerBase) {
    input.value = workerBase;
    const ok = await chrome.permissions.contains({ origins: [workerBase + "/*"] });
    setStatus(ok ? "目前設定：" + workerBase : "已儲存，但缺少存取權限，請重新儲存。", ok ? "ok" : "warn");
  } else {
    setStatus("尚未設定 Worker 網址。", "warn");
  }
})();
