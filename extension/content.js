/**
 * fb-tldr — content script
 *
 * Anchors directly on Facebook's native "查看更多 / See more" button (a
 * role="button" element) wherever it appears — home feed AND group feeds —
 * and injects a "TL;DR" button right next to it. We deliberately do NOT depend
 * on role="article" wrappers, because group posts don't have them.
 *
 * On click: expand the post (click See more) so we summarize the full text,
 * pull the text from the enclosing message container, and render the summary.
 * Pure DOM work — the network call happens in the background service worker.
 */

// Post-body expander labels. Both 查看更多 and 顯示更多 are used by posts; the
// MSG_SEL container check in findSeeMores() excludes the left-nav "顯示更多"
// (Groups / Shortcuts), since those aren't inside a post message container.
const SEE_MORE_RE = /^(查看更多|顯示更多|See more|See More)$/;
// Facebook's post-body containers, most specific first.
const MSG_SEL =
  '[data-ad-comet-preview="message"], [data-ad-preview="message"], [data-ad-rendering-role="story_message"]';

let observer = null;
let scanTimer = null;

/* ---------- locating See-more buttons ---------- */

function findSeeMores() {
  // A real post See-more must (a) match the exact label and (b) live inside a
  // post message container. (b) excludes the left-nav "顯示更多" and profile
  // "查看更多…" links, which are not in a message container.
  return [...document.querySelectorAll('[role="button"]')].filter(
    (el) => SEE_MORE_RE.test((el.textContent || "").trim()) && el.closest(MSG_SEL)
  );
}

// Expand/collapse labels and our own button text, stripped from extracted text.
const STRIP_RE =
  /(TL;DR|查看更多|顯示更多|顯示較少|See more|See More|Show less|See Less)/g;

/* ---------- summary box ---------- */

function setBox(box, state, text) {
  box.className = "fbtldr-box fbtldr-" + state;
  box.style.display = "block";
  box.textContent = text;
}

// Animated shimmer placeholder shown while the summary is pending.
function showSkeleton(box) {
  box.className = "fbtldr-box fbtldr-loading";
  box.style.display = "block";
  box.textContent = "";
  for (let i = 0; i < 3; i++) {
    const line = document.createElement("div");
    line.className = "fbtldr-skel" + (i === 2 ? " fbtldr-skel-short" : "");
    box.appendChild(line);
  }
}

// Restore the original post body and the TL;DR trigger (used on error).
function reveal(msg, btn) {
  msg.classList.remove("fbtldr-offscreen");
  msg.style.display = "";
  btn.style.display = "";
}

// Render the finished summary, hide the original post body, and add a toggle.
function renderSummary(box, summary, original) {
  box.className = "fbtldr-box fbtldr-ok";
  box.style.display = "block";
  box.textContent = "";

  const sum = document.createElement("div");
  sum.className = "fbtldr-summary";
  sum.textContent = summary;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "fbtldr-toggle";
  const sync = () => {
    toggle.textContent =
      original.style.display === "none" ? "顯示原始內容" : "隱藏原始內容";
  };
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    original.style.display = original.style.display === "none" ? "" : "none";
    sync();
  });

  original.style.display = "none"; // hide the original post body by default
  sync();

  box.appendChild(sum);
  box.appendChild(toggle);
}

function makeBox(anchor) {
  const box = document.createElement("div");
  box.className = "fbtldr-box";
  anchor.insertAdjacentElement("beforebegin", box); // top of the post content
  return box;
}

async function summarizeFor(btn) {
  // Derive the message container from OUR button, which is injected inside the
  // post body. This stays valid even after Facebook removes the original
  // See-more node on expand (查看更多 → 顯示較少) — relying on that node breaks.
  const msg = btn.closest(MSG_SEL);
  if (!msg) return;

  // Pending UI: hide the trigger and show an animated skeleton at the top.
  btn.style.display = "none";
  let box = btn._fbtldrBox;
  if (!box || !box.isConnected) box = btn._fbtldrBox = makeBox(msg);
  showSkeleton(box);
  // Move the body off-screen — still rendered (so innerText works), but invisible
  // from the first frame, so there's no flash while it expands.
  msg.classList.add("fbtldr-offscreen");

  // If the post is still truncated, click its CURRENT expander to show all text.
  try {
    const expander = [...msg.querySelectorAll('[role="button"]')].find(
      (b) => b !== btn && SEE_MORE_RE.test((b.textContent || "").trim())
    );
    if (expander) {
      expander.click();
      await new Promise((r) => setTimeout(r, 350));
    }
  } catch (_) {
    /* expansion is best-effort */
  }

  // Read the full text (minus our label + expand/collapse links), then hide the
  // original body for the duration of the AI request.
  const text = (msg.innerText || "").replace(STRIP_RE, "").trim();
  msg.classList.remove("fbtldr-offscreen");
  msg.style.display = "none";

  if (!box.isConnected) box = btn._fbtldrBox = makeBox(msg);
  if (!text) {
    reveal(msg, btn);
    setBox(box, "error", "找不到可摘要的文字內容。");
    return;
  }

  const resp = await chrome.runtime.sendMessage({ type: "summarize", text });
  if (!box.isConnected) box = btn._fbtldrBox = makeBox(msg);

  if (!resp || resp.error) {
    reveal(msg, btn);
    if (resp && resp.error === "config")
      setBox(box, "auth", "尚未設定 Worker 網址（請開啟外掛 → 設定）。");
    else if (resp && resp.error === "auth")
      setBox(box, "auth", "需要登入 Cloudflare（請開啟外掛 → Sign in）。");
    else if (resp && resp.error === "disabled")
      setBox(box, "error", "外掛已關閉。");
    else setBox(box, "error", "摘要失敗：" + ((resp && resp.error) || "unknown"));
    return;
  }

  const summary = (resp.summary || "").trim();
  if (!summary) {
    // Empty model output almost always means the post overflowed the context.
    reveal(msg, btn);
    setBox(box, "error", "（模型未回傳摘要，貼文可能過長）");
    return;
  }
  renderSummary(box, summary, msg); // keeps the body hidden, adds show/hide toggle
}

/* ---------- injection (self-healing) ---------- */

function inject(seeMore) {
  // Skip if our button already sits right after this See-more.
  const next = seeMore.nextElementSibling;
  if (next && next.classList && next.classList.contains("fbtldr-btn")) return;

  const btn = document.createElement("button");
  btn.className = "fbtldr-btn";
  btn.type = "button";
  btn.textContent = "TL;DR";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    summarizeFor(btn);
  });
  seeMore.insertAdjacentElement("afterend", btn);
}

function scan() {
  const seeMores = findSeeMores();
  seeMores.forEach(inject);
  return seeMores.length;
}

function scheduleScan() {
  if (scanTimer) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    scan();
  }, 250);
}

/* ---------- activate / deactivate ---------- */

function activate() {
  const n = scan();
  console.log("[fb-tldr] active — See-more buttons found:", n);
  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });
}

function deactivate() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (scanTimer) {
    clearTimeout(scanTimer);
    scanTimer = null;
  }
  document.querySelectorAll(".fbtldr-btn, .fbtldr-box").forEach((n) => n.remove());
}

/* ---------- state wiring ---------- */

async function applyState() {
  const { enabled } = await chrome.storage.local.get("enabled");
  if (enabled) activate();
  else deactivate();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "enabled" in changes) applyState();
});

applyState();
