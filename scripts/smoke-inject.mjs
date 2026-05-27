// Smoke test for the "TL;DR buttons accumulate on 顯示較多/顯示較少 toggle" bug.
// Reproduces Facebook re-rendering a fresh See-more node and asserts that the
// dedup keeps exactly ONE button. Mirrors the inject() logic in
// extension/content.js — keep in sync.
import { parseHTML } from "linkedom";
import assert from "node:assert";

const MSG_SEL =
  '[data-ad-comet-preview="message"], [data-ad-preview="message"], [data-ad-rendering-role="story_message"]';

// --- mirrored from content.js inject() (DOM-only parts) ---
function inject(document, seeMore) {
  const msg = seeMore.closest(MSG_SEL);
  if (!msg || msg.querySelector(".fbtldr-btn")) return;
  const btn = document.createElement("button");
  btn.className = "fbtldr-btn";
  btn.type = "button";
  btn.textContent = "TL;DR";
  seeMore.insertAdjacentElement("afterend", btn);
}

function newSeeMore(document, text) {
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.textContent = text;
  return el;
}

const { document } = parseHTML(`<!doctype html><body>
  <div data-ad-comet-preview="message"><div dir="auto">一段貼文內容……</div></div>
</body>`);
const msg = document.querySelector(MSG_SEL);

// 1) collapsed: inject once
const sm1 = newSeeMore(document, "顯示更多");
msg.querySelector('[dir="auto"]').appendChild(sm1);
inject(document, sm1);
assert.strictEqual(msg.querySelectorAll(".fbtldr-btn").length, 1, "after first inject");

// 2) user toggles: FB removes sm1, renders a NEW node sm2 in the same container
sm1.remove();
const sm2 = newSeeMore(document, "顯示更多");
msg.querySelector('[dir="auto"]').appendChild(sm2);
inject(document, sm2);
assert.strictEqual(
  msg.querySelectorAll(".fbtldr-btn").length,
  1,
  "after toggle re-render — must stay 1, not accumulate"
);

// 3) several more toggles
for (let i = 0; i < 5; i++) {
  const s = newSeeMore(document, "顯示更多");
  msg.querySelector('[dir="auto"]').appendChild(s);
  inject(document, s);
}
assert.strictEqual(
  msg.querySelectorAll(".fbtldr-btn").length,
  1,
  "after many toggles — still exactly 1 button"
);

console.log("✓ smoke: TL;DR button does not accumulate across See-more re-renders");
