#!/usr/bin/env bun
/**
 * Grok 4 via OpenRouter with Live Search for X/Twitter
 *
 * Env:
 *   OPENROUTER_API_KEY (required)
 *   GROK_MODEL (optional, defaults to "x-ai/grok-4")
 *
 * Usage examples:
 *   bun scripts/grok.ts --q "what are people saying about ERC-7702 wallets on X?"
 *   bun scripts/grok.ts --q "tweets from @elonmusk this week" --include "@elonmusk" "@OpenAI" --from 2025-11-01 --to 2025-11-07 --mode on --max 15
 *
 * Exit codes:
 *   0 - success
 *   2 - usage/validation error
 *   3 - network/timeout error
 *   4 - JSON parse error
 *
 * Notes:
 * - Live Search is configured via extra_body.search_parameters.
 * - X-specific filters: included_x_handles / excluded_x_handles, post_favorite_count, post_view_count.
 * - from_date / to_date and max_search_results are top-level under search_parameters.
 */

type Mode = "on" | "off" | "auto";

interface CLI {
  q?: string;
  mode?: Mode;
  include: string[];
  exclude: string[];
  from?: string; // YYYY-MM-DD
  to?: string;   // YYYY-MM-DD
  max?: number;  // 1..50 (xAI default 20)
  minFaves?: number;
  minViews?: number;
}

function parseArgs(argv: string[]): CLI {
  const a: CLI = { include: [], exclude: [] };

  const collect = (start: number) => {
    const values: string[] = [];
    let i = start;
    while (i < argv.length && !argv[i].startsWith("--")) values.push(argv[i++]);
    return { values, next: i };
  };

  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    switch (t) {
      case "--q":
        a.q = argv[++i];
        break;
      case "--mode": {
        const m = argv[++i];
        if (m !== "on" && m !== "off" && m !== "auto") {
          console.error('Invalid --mode. Use: on | off | auto');
          process.exit(2);
        }
        a.mode = m as Mode;
        break;
      }
      case "--include": {
        const { values, next } = collect(i + 1);
        a.include.push(...values);
        i = next - 1;
        break;
      }
      case "--exclude": {
        const { values, next } = collect(i + 1);
        a.exclude.push(...values);
        i = next - 1;
        break;
      }
      case "--from":
        a.from = argv[++i];
        break;
      case "--to":
        a.to = argv[++i];
        break;
      case "--max": {
        const n = Number(argv[++i]);
        if (!Number.isFinite(n)) {
          console.error("Invalid --max (must be a number)");
          process.exit(2);
        }
        a.max = n;
        break;
      }
      case "--min-faves": {
        const n = Number(argv[++i]);
        if (!Number.isInteger(n) || n < 0) {
          console.error("Invalid --min-faves (must be >= 0 integer)");
          process.exit(2);
        }
        a.minFaves = n;
        break;
      }
      case "--min-views": {
        const n = Number(argv[++i]);
        if (!Number.isInteger(n) || n < 0) {
          console.error("Invalid --min-views (must be >= 0 integer)");
          process.exit(2);
        }
        a.minViews = n;
        break;
      }
      default:
        // ignore unknown tokens so quoted multi-values work smoothly
        break;
    }
  }
  return a;
}

function ensureISO(d?: string): string | undefined {
  if (!d) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    console.error("Date must be YYYY-MM-DD:", d);
    process.exit(2);
  }
  const [y, m, day] = d.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, day));
  const iso = dt.toISOString().slice(0, 10);
  if (iso !== d) {
    console.error("Invalid calendar date (YYYY-MM-DD):", d);
    process.exit(2);
  }
  return d;
}

function stripAt(h: string) {
  return h.startsWith("@") ? h.slice(1) : h;
}

function normalizeHandles(list: string[]) {
  return Array.from(new Set(list.map(stripAt).map((s) => s.toLowerCase()))).slice(0, 10);
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function computeBackoffMs(attempt: number, base = 500) {
  const jitter = Math.floor(Math.random() * 250);
  return base * 2 ** (attempt - 1) + jitter;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: { attempts?: number; timeoutMs?: number } = {}
) {
  const attempts = opts.attempts ?? 3;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) return res;

      const status = res.status;
      const retryAfter = res.headers.get("retry-after");
      const text = await res.text();
      const reqId = res.headers.get("x-request-id") || res.headers.get("x-openrouter-id") || "n/a";

      const retriable = [408, 429, 500, 502, 503, 504].includes(status);
      if (!retriable || attempt === attempts) {
        console.error(`HTTP ${status} (request-id=${reqId}): ${text}`);
        process.exit(1);
      }

      const delay = retryAfter ? Number(retryAfter) * 1000 : computeBackoffMs(attempt);
      await sleep(delay);
      continue;
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      if (attempt === attempts) break;
      await sleep(computeBackoffMs(attempt));
    }
  }
  console.error("Network/timeout error:", String(lastError));
  process.exit(3);
}

const args = parseArgs(process.argv.slice(2));
if (!args.q) {
  console.error('Usage: bun scripts/grok.ts --q "<query>" [--mode on|auto|off] [--include @a ... | --exclude @x ...] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--min-faves N] [--min-views N] [--max N]');
  process.exit(2);
}
if (args.include.length && args.exclude.length) {
  console.error("You cannot set both --include and --exclude (xAI constraint).");
  process.exit(2);
}
const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error([
    "Missing env OPENROUTER_API_KEY.",
    "Set it in your shell and re-run. Examples:",
    '  export OPENROUTER_API_KEY="sk-or-..."',
    '  OPENROUTER_API_KEY="sk-or-..." bun scripts/grok.ts --q "..."',
    "Tip: add the export to your shell profile (~/.zshrc or ~/.bashrc) to persist.",
  ].join("\n"));
  process.exit(2);
}

const include = normalizeHandles(args.include);
const exclude = normalizeHandles(args.exclude);
const maxRaw = args.max;
const max_search_results = Number.isFinite(maxRaw) ? Math.min(50, Math.max(1, Number(maxRaw))) : 12;

const xSource: Record<string, unknown> = { type: "x" };
if (include.length) xSource["included_x_handles"] = include;
if (exclude.length) xSource["excluded_x_handles"] = exclude;
if (args.minFaves != null) xSource["post_favorite_count"] = args.minFaves;
if (args.minViews != null) xSource["post_view_count"] = args.minViews;

const searchParameters: Record<string, unknown> = {
  mode: args.mode || "auto",
  return_citations: true,
  max_search_results,
  from_date: ensureISO(args.from),
  to_date: ensureISO(args.to),
  sources: [xSource],
};

const model = process.env.GROK_MODEL ?? "x-ai/grok-4";

const body = {
  model,
  messages: [
    {
      role: "system",
      content:
        "You are Grok 4 answering with X/Twitter Live Search. Summarize concisely, and include tweet URLs as citations. Prefer bullets.",
    },
    { role: "user", content: String(args.q) },
  ],
  extra_body: { search_parameters: searchParameters },
  temperature: 0.2,
  max_tokens: 1200,
  stream: false,
};

const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "X-Title": "grok-skill",
    "HTTP-Referer": "https://github.com",
  },
  body: JSON.stringify(body),
});

let json: any;
try {
  json = await res.json();
} catch (e) {
  console.error("Failed to parse JSON response");
  process.exit(4);
}

const text =
  json?.choices?.[0]?.message?.content ??
  json?.choices?.[0]?.delta?.content ??
  "";

let citations =
  json?.citations ??
  json?.choices?.[0]?.message?.citations ??
  json?.extra?.citations ??
  null;

// Fallback: extract X/Twitter URLs from text when citations are absent
if (!citations) {
  const urls = Array.from(String(text).matchAll(/https?:\/\/[^\s)]+/g)).map((m) => m[0]);
  const xUrls = urls.filter((u) => /(^https?:\/\/(x\.com|twitter\.com)\/)/i.test(u));
  citations = xUrls.length ? Array.from(new Set(xUrls)) : null;
}

const out = {
  query: args.q,
  summary: String(text).trim(),
  citations,
  usage: json?.usage ?? null,
  model: json?.model ?? model,
};

console.log(JSON.stringify(out, null, 2));
