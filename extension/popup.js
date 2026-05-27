/* fb-tldr — popup: on/off toggle, sign-in, auth status. */

const toggle = document.getElementById("toggle");
const stateLabel = document.getElementById("state-label");
const authStatus = document.getElementById("auth-status");
const signinBtn = document.getElementById("signin");

function renderState(enabled) {
  toggle.checked = !!enabled;
  stateLabel.textContent = enabled ? "已開啟" : "已關閉";
  stateLabel.className = "state " + (enabled ? "on" : "off");
}

async function refreshAuth() {
  authStatus.textContent = "檢查中…";
  const resp = await chrome.runtime.sendMessage({ type: "whoami" });
  if (resp && resp.email) {
    authStatus.textContent = "已登入：" + resp.email;
    authStatus.className = "auth-status ok";
  } else if (resp && resp.error === "auth") {
    authStatus.textContent = "尚未登入 Cloudflare Access";
    authStatus.className = "auth-status warn";
  } else {
    authStatus.textContent = "無法連線到 Worker";
    authStatus.className = "auth-status warn";
  }
}

toggle.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: toggle.checked });
  renderState(toggle.checked);
});

signinBtn.addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "signin" });
  // Give the SSO flow a moment, then re-check identity.
  setTimeout(refreshAuth, 1500);
});

document.getElementById("settings").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

(async () => {
  const { enabled } = await chrome.storage.local.get("enabled");
  renderState(enabled);
  refreshAuth();
})();
