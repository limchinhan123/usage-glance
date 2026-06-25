#!/usr/bin/env node
// Usage Glance — collector. Gathers remaining-bandwidth across AI agents and
// prints one normalized JSON blob to stdout. No external deps (Node 22 built-ins).
//
// Output: { ts, sources: [ {key,label,kind,windows?,consumed?,balance?,ok,note?} ] }
//   kind "limit": subscription with windows[{name,remainingPct,resetsAt}]
//   kind "spend": pay-as-you-go with consumed.usd and/or balance
// Every source is wrapped so one failure never breaks the others (graceful "—").

import { readFileSync, readdirSync, statSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const HOME = homedir();
const CONFIG_DIR = join(HOME, ".config", "usage-glance");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

// ---------- config + secret resolution ----------
function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

// Parse a dotenv-style file into {KEY: value} (values un-quoted, no export logic).
function parseEnvFile(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  return out;
}

const config = loadConfig();
// Optional extra dotenv file to source keys from (e.g. an existing project's .env).
// Set "envFile" in config.json, e.g. "~/.config/usage-glance/.env". Off by default.
const expandTilde = (p) => (p && p.startsWith("~") ? join(HOME, p.slice(1)) : p);
const dotenvVars = config.envFile ? parseEnvFile(expandTilde(config.envFile)) : {};

// Read a secret from the macOS login Keychain (service "usage-glance").
// Encrypted at rest; nothing in a plaintext dotfile. Returns null if absent.
function keychainGet(name) {
  try {
    const v = execFileSync(
      "/usr/bin/security",
      ["find-generic-password", "-s", "usage-glance", "-a", name, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
    ).trim();
    return v || null;
  } catch {
    return null;
  }
}

// Resolve a secret by precedence: Keychain -> config.json -> optional dotenv -> process.env.
function secret(...names) {
  for (const n of names) {
    const kc = keychainGet(n);
    if (kc) return kc;
    if (config.secrets && config.secrets[n]) return config.secrets[n];
    if (dotenvVars[n]) return dotenvVars[n];
    if (process.env[n]) return process.env[n];
  }
  return null;
}

const enabled = (key, dflt = true) =>
  config.sources && key in config.sources ? !!config.sources[key] : dflt;

// ---------- helpers ----------
function listFilesRecursive(dir, match) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) found.push(...listFilesRecursive(p, match));
    else if (match.test(e.name)) found.push(p);
  }
  return found;
}

// Recursively find the first object carrying a given key, returning its value.
function deepFind(obj, key) {
  if (!obj || typeof obj !== "object") return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) {
    const r = deepFind(v, key);
    if (r !== undefined) return r;
  }
  return undefined;
}

async function fetchJson(url, opts = {}, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json, text, headers: res.headers };
  } finally {
    clearTimeout(t);
  }
}

// ---------- Codex (ChatGPT subscription) — local rate-limit snapshots ----------
function collectCodex() {
  const dirs = [
    join(HOME, ".codex", "sessions"),
    join(HOME, ".codex", "archived_sessions"),
  ];
  const files = dirs.flatMap((d) => listFilesRecursive(d, /^rollout-.*\.jsonl$/));
  if (files.length === 0)
    return { key: "codex", label: "Codex", kind: "limit", ok: false, note: "no session files" };

  // newest by mtime
  files.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

  // Read a whole file, or just its tail for huge ones (Codex rollouts can run
  // past Node's ~512 MB string limit). rate_limits snapshots recur throughout
  // the log, so the tail still holds a recent one. Drop the first (partial) line.
  const TAIL_BYTES = 4 * 1024 * 1024;
  const readForScan = (f) => {
    const size = statSync(f).size;
    if (size <= TAIL_BYTES) return readFileSync(f, "utf8").split("\n").filter(Boolean);
    const fd = openSync(f, "r");
    try {
      const buf = Buffer.allocUnsafe(TAIL_BYTES);
      readSync(fd, buf, 0, TAIL_BYTES, size - TAIL_BYTES);
      return buf.toString("utf8").split("\n").filter(Boolean).slice(1);
    } finally {
      closeSync(fd);
    }
  };

  // scan newest files until we find the most recent rate_limits snapshot
  let snap = null;
  for (const f of files.slice(0, 8)) {
    let lines;
    try {
      lines = readForScan(f);
    } catch {
      continue;
    }
    for (let i = lines.length - 1; i >= 0; i--) {
      let obj;
      try {
        obj = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const rl = deepFind(obj, "rate_limits");
      if (rl && (rl.primary || rl.secondary)) {
        snap = rl;
        break;
      }
    }
    if (snap) break;
  }
  if (!snap)
    return { key: "codex", label: "Codex", kind: "limit", ok: false, note: "no rate_limits yet" };

  const windowFromBucket = (b, fallbackName) => {
    if (!b || typeof b.used_percent !== "number") return null;
    const mins = b.window_minutes;
    const name = mins === 300 ? "5h" : mins === 10080 ? "weekly" : mins ? `${mins}m` : fallbackName;
    return {
      name,
      windowMinutes: mins ?? null,
      remainingPct: Math.max(0, Math.round((100 - b.used_percent) * 10) / 10),
      resetsAt: b.resets_at ?? null,
    };
  };

  const windows = [windowFromBucket(snap.primary, "5h"), windowFromBucket(snap.secondary, "weekly")].filter(Boolean);
  return { key: "codex", label: "Codex", kind: "limit", windows, ok: windows.length > 0 };
}

// ---------- Claude (subscription) — widget's OWN oauth creds ----------
// Creds file written by login.mjs: {access_token, refresh_token, expires_at(ms)}.
const CLAUDE_CREDS = join(CONFIG_DIR, "claude-creds.json");
const CLAUDE_TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"; // Claude Code prod OAuth client
const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

async function claudeAccessToken() {
  // Preferred: a long-lived token from `claude setup-token` (no rotation, no
  // conflict with Claude Code). Provide via config.secrets.CLAUDE_CODE_OAUTH_TOKEN
  // or the CLAUDE_CODE_OAUTH_TOKEN env var.
  const staticTok = secret("CLAUDE_CODE_OAUTH_TOKEN");
  if (staticTok) return staticTok;
  if (!existsSync(CLAUDE_CREDS)) throw new Error("no token (run setup-token — see CLAUDE-SETUP.md)");
  const creds = JSON.parse(readFileSync(CLAUDE_CREDS, "utf8"));
  if (creds.expires_at && Date.now() < creds.expires_at - 60_000) return creds.access_token;
  // refresh using our own refresh token (never touches Claude Code's file)
  const r = await fetchJson(CLAUDE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: creds.refresh_token,
      client_id: CLAUDE_CLIENT_ID,
    }),
  });
  if (!r.ok || !r.json?.access_token) throw new Error(`refresh failed (${r.status})`);
  const next = {
    access_token: r.json.access_token,
    refresh_token: r.json.refresh_token || creds.refresh_token,
    expires_at: Date.now() + (r.json.expires_in ?? 3600) * 1000,
  };
  const { writeFileSync, chmodSync } = await import("node:fs");
  writeFileSync(CLAUDE_CREDS, JSON.stringify(next), { mode: 0o600 });
  chmodSync(CLAUDE_CREDS, 0o600);
  return next.access_token;
}

// Subscription remaining comes from the unified rate-limit headers on a normal
// API response: anthropic-ratelimit-unified-<window>-utilization (a 0..1 fraction)
// and -reset (unix seconds). remaining% = (1 - utilization) * 100.
function pctFromHeaders(h, prefix) {
  const util = Number(h.get(`anthropic-ratelimit-unified-${prefix}-utilization`));
  const reset = Number(h.get(`anthropic-ratelimit-unified-${prefix}-reset`));
  if (!Number.isFinite(util)) return null;
  return {
    remainingPct: Math.max(0, Math.min(100, Math.round((1 - util) * 1000) / 10)),
    resetsAt: Number.isFinite(reset) ? reset : null,
  };
}

const CLAUDE_CACHE = join(CONFIG_DIR, ".claude-cache.json");
// Minimum gap between probes even when actively coding (config: claudeMinProbeMinutes).
const CLAUDE_MIN_PROBE_MS = (config.claudeMinProbeMinutes ?? 10) * 60 * 1000;

function readClaudeCache() {
  try {
    return JSON.parse(readFileSync(CLAUDE_CACHE, "utf8"));
  } catch {
    return null;
  }
}

// Newest mtime across Claude Code's session logs = last time Claude was actually used.
// If nothing changed since the last probe, the cached remaining% is still accurate.
function lastClaudeActivityMs() {
  let newest = 0;
  for (const f of listFilesRecursive(join(HOME, ".claude", "projects"), /\.jsonl$/)) {
    try {
      const m = statSync(f).mtimeMs;
      if (m > newest) newest = m;
    } catch {}
  }
  return newest;
}

// A reset that has already passed means that window refilled — show it full
// (the real new reset time is picked up on the next probe).
function adjustForResets(windows) {
  const now = Math.floor(Date.now() / 1000);
  return windows.map((w) =>
    w.resetsAt && w.resetsAt < now ? { ...w, remainingPct: 100, resetsAt: null } : w
  );
}

async function collectClaude() {
  const base = { key: "claude", label: "Claude", kind: "limit" };
  const cache = readClaudeCache();
  if (cache && cache.windows?.length) {
    const nowSec = Math.floor(Date.now() / 1000);
    const noNewUsage = lastClaudeActivityMs() <= cache.ts; // quota unchanged since last reading
    const tooSoon = Date.now() - cache.ts < CLAUDE_MIN_PROBE_MS; // avoid hammering mid-burst
    // A window whose reset has elapsed (e.g. laptop was asleep/off across it) refilled to an
    // unknown level with an unknown new reset time. That's genuinely stale — probe to refresh
    // rather than showing a fabricated "100% / no reset" (which also drops the time bar).
    const resetPassed = cache.windows.some((w) => w.resetsAt && w.resetsAt < nowSec);
    if ((noNewUsage && !resetPassed) || tooSoon) {
      return { ...base, windows: adjustForResets(cache.windows), ok: true, note: noNewUsage ? "idle" : "cached" };
    }
  }

  let token;
  try {
    token = await claudeAccessToken();
  } catch (e) {
    return { ...base, ok: false, note: String(e.message || e) };
  }

  // A minimal call (max_tokens:1) returns the subscription's 5h + 7d rate-limit
  // headers. Works with the setup-token (user:inference) scope.
  try {
    const r = await fetchJson("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "." }],
      }),
    });
    const windows = [];
    const w5 = pctFromHeaders(r.headers, "5h");
    const w7 = pctFromHeaders(r.headers, "7d");
    if (w5) windows.push({ name: "5h", windowMinutes: 300, ...w5 });
    if (w7) windows.push({ name: "weekly", windowMinutes: 10080, ...w7 });
    if (windows.length) {
      try {
        const { writeFileSync, chmodSync } = await import("node:fs");
        writeFileSync(CLAUDE_CACHE, JSON.stringify({ ts: Date.now(), windows }), { mode: 0o600 });
        chmodSync(CLAUDE_CACHE, 0o600);
      } catch {}
      return { ...base, windows, ok: true };
    }
    // rate-limited or unexpected — fall back to stale cache if we have one
    if (cache?.windows?.length) return { ...base, windows: cache.windows, ok: true, note: "stale" };
    return { ...base, ok: false, note: `no rate-limit headers (HTTP ${r.status})` };
  } catch (e) {
    if (cache?.windows?.length) return { ...base, windows: cache.windows, ok: true, note: "stale" };
    return { ...base, ok: false, note: String(e.message || e) };
  }
}

// Map the /usage JSON into our window shape. Shape unconfirmed -> defensive.
function normalizeClaudeUsage(j) {
  const windows = [];
  const push = (name, remainingPct, resetsAt) => {
    if (typeof remainingPct === "number") windows.push({ name, remainingPct, resetsAt: resetsAt ?? null });
  };
  // try a few plausible shapes
  const five = j.five_hour || j.five_hour_limit || deepFind(j, "five_hour");
  const week = j.seven_day || j.weekly || j.seven_day_limit || deepFind(j, "seven_day");
  const asPct = (o) => {
    if (!o) return undefined;
    if (typeof o.remaining_pct === "number") return o.remaining_pct;
    if (typeof o.utilization === "number") return Math.max(0, 100 - o.utilization);
    if (typeof o.used_percent === "number") return Math.max(0, 100 - o.used_percent);
    if (typeof o.remaining === "number" && typeof o.limit === "number" && o.limit > 0)
      return Math.round((o.remaining / o.limit) * 1000) / 10;
    return undefined;
  };
  const resetOf = (o) => {
    const v = o && (o.resets_at || o.reset_at || o.resetsAt);
    if (v == null) return null;
    if (typeof v === "number") return v > 1e12 ? Math.floor(v / 1000) : v; // ms->s
    const t = Date.parse(v);
    return Number.isFinite(t) ? Math.floor(t / 1000) : null; // ISO string -> s
  };
  push("5h", asPct(five), resetOf(five));
  push("weekly", asPct(week), resetOf(week));
  return windows;
}

// ---------- TTL cache for network "spend" rows (balances change slowly) ----------
// Per-source files so parallel collectors never clobber each other's cache.
const SPEND_TTL_MS = (config.spendTtlMinutes ?? 10) * 60 * 1000;
const spendCachePath = (key) => join(CONFIG_DIR, `.spend-${key}.json`);

// Run fn but serve a cached result while it's still fresh; on failure, serve stale.
async function cachedSource(key, fn) {
  const p = spendCachePath(key);
  let c = null;
  try {
    c = JSON.parse(readFileSync(p, "utf8"));
  } catch {}
  if (c?.value?.ok && Date.now() - c.ts < SPEND_TTL_MS) {
    return { ...c.value, note: "cached" };
  }
  const v = await fn();
  if (v.ok) {
    try {
      const fs = await import("node:fs");
      fs.writeFileSync(p, JSON.stringify({ ts: Date.now(), value: v }), { mode: 0o600 });
      fs.chmodSync(p, 0o600);
    } catch {}
    return v;
  }
  if (c?.value?.ok) return { ...c.value, note: "stale" };
  return v;
}

// ---------- OpenRouter — credits ----------
async function collectOpenRouter() {
  const base = { key: "openrouter", label: "OpenRouter", kind: "spend" };
  const key = secret("OPENROUTER_API_KEY");
  if (!key) return { ...base, ok: false, note: "no key" };
  try {
    const r = await fetchJson("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const d = r.json?.data;
    if (!r.ok || !d) return { ...base, ok: false, note: `http ${r.status}` };
    const total = Number(d.total_credits ?? 0);
    const used = Number(d.total_usage ?? 0);
    return { ...base, balance: Math.round((total - used) * 100) / 100, consumed: { usd: Math.round(used * 100) / 100 }, ok: true };
  } catch (e) {
    return { ...base, ok: false, note: String(e.message || e) };
  }
}

// ---------- DeepSeek — balance ----------
async function collectDeepSeek() {
  const base = { key: "deepseek", label: "DeepSeek", kind: "spend" };
  const key = secret("DEEPSEEK_API_KEY");
  if (!key) return { ...base, ok: false, note: "no key" };
  try {
    const r = await fetchJson("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const info = r.json?.balance_infos?.[0];
    if (!r.ok || !info) return { ...base, ok: false, note: `http ${r.status}` };
    return {
      ...base,
      balance: Number(info.total_balance),
      currency: info.currency,
      ok: true,
    };
  } catch (e) {
    return { ...base, ok: false, note: String(e.message || e) };
  }
}

// ---------- Cursor — usage-based spend vs hard limit (UNOFFICIAL; local token) ----------
// Reads the access token Cursor keeps fresh in its local state.vscdb, then calls
// the dashboard endpoints (need an Origin header to pass CSRF). Auto-refreshing,
// but undocumented — degrades to "—" on any change, never breaks the widget.
const CURSOR_DB = join(HOME, "Library/Application Support/Cursor/User/globalStorage/state.vscdb");

function cursorToken() {
  try {
    const jwt = execFileSync(
      "sqlite3",
      [CURSOR_DB, "SELECT value FROM ItemTable WHERE key='cursorAuth/accessToken'"],
      { encoding: "utf8" }
    ).trim().replace(/^"|"$/g, "");
    if (!jwt || jwt.split(".").length < 3) return null;
    const sub = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).sub;
    return { jwt, userId: sub.includes("|") ? sub.split("|")[1] : sub };
  } catch {
    return null;
  }
}

async function collectCursor() {
  // Included-plan usage % + billing-cycle reset (the Pro "usage limit"), via the
  // undocumented usage-summary endpoint. Modeled as a limit row like Claude/Codex.
  const base = { key: "cursor", label: "Cursor", kind: "limit", unofficial: true };
  const tok = cursorToken();
  if (!tok) return { ...base, ok: false, note: "not logged in (Cursor app)" };
  try {
    const r = await fetchJson("https://cursor.com/api/usage-summary", {
      headers: { Cookie: `WorkosCursorSessionToken=${tok.userId}%3A%3A${tok.jwt}` },
    });
    const plan = r.json?.individualUsage?.plan;
    const usedPct = plan && typeof plan.totalPercentUsed === "number" ? plan.totalPercentUsed : null;
    if (!r.ok || usedPct == null) return { ...base, ok: false, note: `no usage % (http ${r.status})` };
    const startMs = Date.parse(r.json.billingCycleStart);
    const endMs = Date.parse(r.json.billingCycleEnd);
    return {
      ...base,
      windows: [
        {
          name: "monthly",
          windowMinutes:
            Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.round((endMs - startMs) / 60000) : null,
          remainingPct: Math.max(0, Math.min(100, Math.round((100 - usedPct) * 10) / 10)),
          resetsAt: Number.isFinite(endMs) ? Math.floor(endMs / 1000) : null,
        },
      ],
      ok: true,
    };
  } catch (e) {
    return { ...base, ok: false, note: String(e.message || e) };
  }
}

// ---------- fal.ai — credit balance ----------
async function collectFal() {
  const base = { key: "fal", label: "fal.ai", kind: "spend" };
  const key = secret("FAL_API_KEY", "FAL_KEY");
  if (!key) return { ...base, ok: false, note: "no key" };
  try {
    const r = await fetchJson("https://api.fal.ai/v1/account/billing?expand=credits", {
      headers: { Authorization: `Key ${key}` },
    });
    const bal = r.json?.credits?.current_balance;
    if (!r.ok || bal == null) return { ...base, ok: false, note: `http ${r.status}` };
    return { ...base, balance: Number(bal), currency: r.json.credits.currency || "USD", ok: true };
  } catch (e) {
    return { ...base, ok: false, note: String(e.message || e) };
  }
}

// ---------- Manus — credit balance from /v2/usage.balance ----------
// Manus exposes a clean balance: total_credits = subscription_credits (monthly,
// resetting) + gift_credits (non-expiring). (Don't sum the /v2/usage.list ledger
// for this — expired monthly credits leave no entry, so the sum overcounts.)
// Auth via the x-manus-api-key header. NOTE: this endpoint is undocumented and
// has been observed to 404 intermittently; cachedSource serves the last-known
// balance as "stale" when that happens, so the row degrades gracefully.
async function collectManus() {
  const base = { key: "manus", label: "Manus", kind: "spend", unit: "cr" };
  const key = secret("MANUS_API_KEY");
  if (!key) return { ...base, ok: false, note: "no key" };
  try {
    const r = await fetchJson("https://api.manus.ai/v2/usage.balance", {
      headers: { "x-manus-api-key": key },
    });
    const bal = r.json?.total_credits;
    if (!r.ok || bal == null) return { ...base, ok: false, note: `http ${r.status}` };
    return { ...base, balance: Number(bal), ok: true };
  } catch (e) {
    return { ...base, ok: false, note: String(e.message || e) };
  }
}

// Manus subscription credits refresh monthly on a roughly fixed day (Pro grants
// landed Apr 10, May 10, Jun 12 — "usually the 10th"). The API's next_grant_time
// is the *annual* plan renewal, not this, so compute the monthly date locally
// from a configurable day-of-month. Clamps to the last day of shorter months.
function nextMonthlyRenewal(day) {
  const at = (y, m) => {
    const dim = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, dim), 0, 0, 0, 0).getTime();
  };
  const now = new Date();
  let t = at(now.getFullYear(), now.getMonth());
  if (t <= Date.now()) {
    const m = now.getMonth() + 1;
    t = at(now.getFullYear() + (m > 11 ? 1 : 0), m % 12);
  }
  return Math.floor(t / 1000);
}

// ---------- main ----------
const jobs = [];
if (enabled("claude")) jobs.push(collectClaude());
if (enabled("codex")) jobs.push(Promise.resolve(collectCodex()));
if (enabled("cursor")) jobs.push(cachedSource("cursor", collectCursor));
if (enabled("openrouter")) jobs.push(cachedSource("openrouter", collectOpenRouter));
if (enabled("deepseek")) jobs.push(cachedSource("deepseek", collectDeepSeek));
if (enabled("fal")) jobs.push(cachedSource("fal", collectFal));
if (enabled("manus")) jobs.push(cachedSource("manus", collectManus));

const settled = await Promise.allSettled(jobs);
const sources = settled.map((s) =>
  s.status === "fulfilled" ? s.value : { key: "?", label: "?", ok: false, note: String(s.reason) }
);

// Manus renewal countdown is computed locally (always fresh, even when the
// balance is served from stale cache), overriding whatever the row carried.
const manusSrc = sources.find((s) => s.key === "manus");
if (manusSrc) manusSrc.resetsAt = nextMonthlyRenewal(config.manusRenewalDay ?? 10);

const ui = { size: (config.size || "small").toLowerCase() };
process.stdout.write(JSON.stringify({ ts: Date.now(), ui, sources }, null, 2) + "\n");
