/**
 * fb-tldr-proxy — Cloudflare Worker
 *
 * Summarizes Facebook post text into Traditional Chinese using Workers AI.
 * The extension never holds a Cloudflare API token; this Worker runs the model
 * server-side via the `AI` binding (wrangler.toml). Cloudflare Access (Zero
 * Trust) protects this Worker's hostname, so only the allowed identity can use it.
 *
 * Long posts: the Llama 3.1 8B model reliably summarizes only ~2000 chars of
 * dense Chinese before it gives up. So we chunk on paragraph boundaries and do
 * map-reduce — summarize each chunk, then summarize the partial summaries.
 *
 * Routes:
 *   POST /summarize  { text }   -> { summary, model, chunks }
 *   GET  /whoami                 -> { email }   (from Access header)
 *   OPTIONS *                    -> CORS preflight
 */

const MODEL = "@cf/meta/llama-3.1-8b-instruct";
const CHUNK_CHARS = 2000; // safe per-call size for dense Chinese on the 8B model
const MAX_CHUNKS = 12; // bound total work / Neuron usage on pathological inputs
const MAX_INPUT_CHARS = CHUNK_CHARS * MAX_CHUNKS;
const MAX_TOKENS = 400;

const SUMMARY_PROMPT =
  "你是專業摘要助手。請用繁體中文，把使用者提供的 Facebook 貼文濃縮成 2 到 3 句 TL;DR 重點。" +
  "只輸出摘要本身，不要加任何前言、標題或解釋。";
const MAP_PROMPT =
  "你是專業摘要助手。以下是一篇長文的其中一段，請用繁體中文精簡條列出這一段的重點。" +
  "只輸出重點，不要加前言或解釋。";
const REDUCE_PROMPT =
  "你是專業摘要助手。以下是一篇長文各段落的重點，請用繁體中文整合成 2 到 3 句 TL;DR 總結。" +
  "只輸出摘要本身，不要加任何前言、標題或解釋。";

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
}

function json(body, request, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(request) },
  });
}

// Split text into <= CHUNK_CHARS pieces, preferring paragraph boundaries.
function chunkText(text) {
  const paras = text.split(/\n+/);
  const chunks = [];
  let cur = "";
  for (const p of paras) {
    if (!p) continue;
    if (cur && cur.length + p.length + 1 > CHUNK_CHARS) {
      chunks.push(cur);
      cur = "";
    }
    if (p.length > CHUNK_CHARS) {
      if (cur) {
        chunks.push(cur);
        cur = "";
      }
      for (let i = 0; i < p.length; i += CHUNK_CHARS)
        chunks.push(p.slice(i, i + CHUNK_CHARS));
    } else {
      cur += (cur ? "\n" : "") + p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks.slice(0, MAX_CHUNKS);
}

async function summarizeOne(env, system, content) {
  const r = await env.AI.run(MODEL, {
    messages: [
      { role: "system", content: system },
      { role: "user", content },
    ],
    max_tokens: MAX_TOKENS,
  });
  return (r.response || "").trim();
}

async function summarize(env, text) {
  const input = text.slice(0, MAX_INPUT_CHARS);
  const chunks = chunkText(input);
  if (chunks.length <= 1) {
    return { summary: await summarizeOne(env, SUMMARY_PROMPT, input), chunks: 1 };
  }
  // map: summarize each chunk (in parallel), then reduce the partials.
  const partials = await Promise.all(
    chunks.map((c) => summarizeOne(env, MAP_PROMPT, c))
  );
  const summary = await summarizeOne(env, REDUCE_PROMPT, partials.join("\n\n"));
  return { summary, chunks: chunks.length };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === "/whoami" && request.method === "GET") {
      const email =
        request.headers.get("Cf-Access-Authenticated-User-Email") || null;
      return json({ email }, request);
    }

    if (url.pathname === "/summarize" && request.method === "POST") {
      let text;
      try {
        ({ text } = await request.json());
      } catch {
        return json({ error: "invalid JSON body" }, request, 400);
      }
      if (typeof text !== "string" || !text.trim()) {
        return json({ error: "missing 'text'" }, request, 400);
      }
      try {
        const { summary, chunks } = await summarize(env, text);
        return json({ summary, model: MODEL, chunks }, request);
      } catch (err) {
        return json({ error: "AI run failed", detail: String(err) }, request, 502);
      }
    }

    return json({ error: "not found" }, request, 404);
  },
};
