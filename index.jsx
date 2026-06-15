// Usage Glance — Übersicht widget. 9 rotatable styles + size + drag.
// Header chips: [style] [size] cycle looks/scale; drag the header to move.

// Übersicht runs `command` from this widget's own folder, so a relative path works.
// If Übersicht can't find node on its PATH, set NODE to an absolute path,
// e.g. "/opt/homebrew/bin/node" or "/usr/local/bin/node" (find yours: `which node`).
const NODE = "node";

export const command = `${NODE} collect.mjs`;
export const refreshFrequency = 60000;

export const className = `
  top: 60px;
  left: 40px;
  width: 210px;
  transform-origin: top left;
  font-family: Fredoka, -apple-system, BlinkMacSystemFont, sans-serif;
  color: #e6edf3;
  background: rgba(22, 27, 34, 0.82);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  padding: 10px 12px 8px;

  @keyframes ug-grow { from { width: 0 } }
  .ug-anim { animation: ug-grow .5s ease-out; }
  .ug-title { font-size: 9.5px; letter-spacing: 1.3px; text-transform: uppercase;
    margin-bottom: 7px; display:flex; justify-content:space-between; align-items:center;
    cursor: move; user-select: none; }
  .ug-right { display:flex; align-items:center; gap:5px; }
  .ug-chip { cursor:pointer; padding:0 4px; border-radius:4px; background:rgba(127,127,127,0.22);
    font-size:8px; letter-spacing:.3px; line-height:13px; }
  .ug-chip:hover { background:rgba(127,127,127,0.40); }
  .ug-row { margin-bottom: 7px; }
  .ug-row:last-child { margin-bottom: 2px; }
  .ug-win { display:flex; align-items:center; gap:8px; margin-top:5px; }
  .ug-bar { flex:1; height:7px; border-radius:4px; overflow:hidden; }
  .ug-fill { display:block; height:100%; border-radius:4px; }
  .ug-style { display:none; }
`;

// ---------- color ramps (semantic: green→amber→red) ----------
const cBars = (p) => (p < 20 ? "#f85149" : p < 50 ? "#d29922" : "#3fb950");
const cSoft = (p) => (p < 20 ? "#e69a9a" : p < 50 ? "#e6c06a" : "#7ec99a");
const cLcd = (p) => (p < 20 ? "#e0572e" : p < 50 ? "#e0a82e" : "#4ad26a");

// ---------- themes ----------
const DARK = { bg: "rgba(22,27,34,0.82)", fg: "#e6edf3", mut: "#9aa4ad", hdr: "#7d8590",
  reset: "#6e7681", track: "rgba(255,255,255,0.10)", time: "#5b8bb0",
  font: "Fredoka, -apple-system, sans-serif", border: "1px solid rgba(255,255,255,0.08)", radius: "12px", blur: true, cf: cBars };
const THEMES = {
  orig: { ...DARK, font: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' },
  bars: DARK,
  rings: DARK,
  segments: DARK,
  battery: DARK,
  tiles: { ...DARK, bg: "rgba(18,20,26,0.86)" },
  mono: { ...DARK, font: "ui-monospace, SFMono-Regular, Menlo, monospace" },
  lcd: { bg: "#0c1410", fg: "#4ad26a", mut: "#2f7d4a", hdr: "#2f7d4a", reset: "#2f7d4a",
    track: "#10301e", time: "#3a9e6a", font: "VT323, ui-monospace, monospace",
    border: "1px solid #1d3b2a", radius: "12px", blur: false, cf: cLcd },
  pastel: { bg: "rgba(250,249,255,0.93)", fg: "#4a4660", mut: "#9b96b5", hdr: "#9b96b5",
    reset: "#b3aece", track: "#eceaf4", time: "#9bb0d8",
    font: "Fredoka, sans-serif", border: "1px solid rgba(20,20,40,0.06)", radius: "16px", blur: true, cf: cSoft },
};
const STYLES = ["orig", "bars", "rings", "segments", "battery", "tiles", "mono", "lcd", "pastel"];
const STYLE_TAG = { orig: "orig", bars: "bars", rings: "ring", segments: "seg", battery: "batt", tiles: "tile", mono: "mono", lcd: "lcd", pastel: "soft" };
const STYLE_NAME = { orig: "Original (system font)", bars: "Bars (rounded)", rings: "Rings", segments: "Segments", battery: "Batteries", tiles: "Tiles", mono: "Mono", lcd: "Retro LCD", pastel: "Light pastel" };

const TILE_COLORS = [
  { bg: "#ece7fb", fg: "#5b4a9e", bar: "#8b7fd6", track: "#d5ccef" },
  { bg: "#ddf3e8", fg: "#2f7a56", bar: "#5dcaa5", track: "#c2e6d4" },
  { bg: "#fbeae1", fg: "#a35a2e", bar: "#e08a5a", track: "#f1d3c4" },
  { bg: "#e3eefb", fg: "#2f5a9e", bar: "#6aa3e0", track: "#cfe0f5" },
  { bg: "#fbe7f1", fg: "#9e3a6a", bar: "#e07aaa", track: "#f1c8dd" },
  { bg: "#fbf3da", fg: "#8a6a1e", bar: "#e0b94a", track: "#f1e3b8" },
];

// ---------- helpers ----------
const remPct = (w) => Math.max(0, Math.min(100, w.remainingPct));
const isLong = (w) => w.windowMinutes && w.windowMinutes >= 1440;
const primaryWin = (s) => (s.windows || []).slice().sort((a, b) => (b.windowMinutes || 0) - (a.windowMinutes || 0))[0];

function fmtReset(ts) {
  if (!ts) return "";
  const ms = ts * 1000 - Date.now();
  if (ms <= 0) return "now";
  const h = ms / 3.6e6;
  if (h < 24) return h < 1 ? `${Math.round(ms / 6e4)}m` : `${Math.round(h)}h`;
  return new Date(ts * 1000).toLocaleDateString([], { weekday: "short" });
}
function fmtTimeLeft(ts) {
  if (!ts) return "";
  const ms = ts * 1000 - Date.now();
  if (ms <= 0) return "0h";
  const d = Math.floor(ms / 86400000), h = Math.round((ms % 86400000) / 3600000);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.round((ms % 3600000) / 60000);
  return h > 0 ? `${h}h` : `${m}m`;
}
function timeRemainingPct(w) {
  if (!w.resetsAt || !w.windowMinutes) return null;
  return Math.max(0, Math.min(100, ((w.resetsAt * 1000 - Date.now()) / (w.windowMinutes * 60000)) * 100));
}
function bal(s) {
  const cur = s.currency === "CNY" ? "¥" : "$";
  return s.balance != null ? `${cur}${s.balance.toFixed(2)}` : "—";
}

// ---------- per-style body renderers ----------
function barWin(w, T, label, color, value, reset, key) {
  return (
    <div className="ug-win" key={key}>
      <span style={{ width: 42, fontSize: 10, color: T.mut }}>{label}</span>
      <span className="ug-bar" style={{ background: T.track }}>
        <span className="ug-fill ug-anim" style={{ width: `${Math.max(2, value)}%`, background: color }} />
      </span>
      <span style={{ width: 33, textAlign: "right", fontSize: 11, color }}>{Math.round(value)}%</span>
      <span style={{ width: 50, textAlign: "right", fontSize: 9, color: T.reset }}>{reset}</span>
    </div>
  );
}
function spendLine(s, T) {
  return (
    <div className="ug-row" key={s.key}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{s.label}{s.unofficial ? <span style={{ color: T.time }}> *</span> : null}</span>
        <span style={{ fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {s.limit != null && s.consumed ? `$${s.consumed.usd.toFixed(2)} / $${s.limit.toFixed(2)}` : `${bal(s)} left`}
        </span>
      </div>
      {s.consumed && s.consumed.usd != null && s.limit == null ? (
        <div style={{ fontSize: 10, color: T.mut }}>${s.consumed.usd.toFixed(2)} used</div>
      ) : null}
    </div>
  );
}
function renderBars(data, T) {
  return data.sources.map((s) => {
    if (!s.ok) return <div className="ug-row" key={s.key} style={{ opacity: 0.4 }}><span style={{ fontWeight: 500 }}>{s.label}</span> <span style={{ color: T.mut, fontSize: 11 }}>—</span></div>;
    if (s.kind === "spend") return spendLine(s, T);
    const wins = [];
    (s.windows || []).forEach((w) => {
      wins.push(barWin(w, T, w.name, T.cf(remPct(w)), remPct(w), fmtReset(w.resetsAt), w.name));
      if (isLong(w)) { const tp = timeRemainingPct(w); if (tp != null) wins.push(barWin(w, T, "time", T.time, tp, fmtTimeLeft(w.resetsAt), w.name + "-t")); }
    });
    return <div className="ug-row" key={s.key}><div style={{ fontWeight: 500, fontSize: 13 }}>{s.label}{s.unofficial ? <span style={{ color: T.time }}> *</span> : null}</div>{wins}</div>;
  });
}

function Ring(pct, color, fg) {
  const r = 22, circ = 2 * Math.PI * r, filled = Math.max(0, Math.min(1, pct / 100)) * circ;
  return (
    <svg width="56" height="56" viewBox="0 0 58 58">
      <circle cx="29" cy="29" r={r} fill="none" stroke="rgba(127,127,127,0.28)" strokeWidth="5" />
      <circle cx="29" cy="29" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${filled} ${circ - filled}`} transform="rotate(-90 29 29)" />
      <text x="29" y="33" textAnchor="middle" fill={fg} fontSize="13" fontWeight="500">{Math.round(pct)}%</text>
    </svg>
  );
}
function renderRings(data, T) {
  const limits = data.sources.filter((s) => s.ok && s.kind === "limit");
  const spends = data.sources.filter((s) => s.kind === "spend");
  return [
    <div key="rings" style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-around", gap: 6 }}>
      {limits.map((s) => { const w = primaryWin(s); const p = remPct(w); return (
        <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          {Ring(p, T.cf(p), T.fg)}
          <span style={{ fontSize: 11, color: T.mut }}>{s.label}{s.unofficial ? " *" : ""}</span>
        </div>
      ); })}
    </div>,
    <div key="sp" style={{ marginTop: 12 }}>
      {spends.map((s) => (
        <div key={s.key} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginTop: 5 }}>
          <span style={{ color: T.mut }}>{s.label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{s.ok ? `${bal(s)} left` : "—"}</span>
        </div>
      ))}
    </div>,
  ];
}

function renderMono(data, T, fc, ec, br) {
  const lines = [];
  data.sources.forEach((s) => {
    if (!s.ok) { lines.push(<div key={s.key} style={{ opacity: 0.5 }}>{s.label.toLowerCase().padEnd(8)} —</div>); return; }
    if (s.kind === "spend") { lines.push(<div key={s.key} style={{ color: T.mut }}>{s.label.toLowerCase().slice(0, 8).padEnd(8)} {bal(s)}</div>); return; }
    (s.windows || []).forEach((w) => {
      const p = remPct(w), f = Math.round(p / 10);
      lines.push(
        <div key={s.key + w.name}>{s.label.toLowerCase().slice(0, 7).padEnd(7)} {w.name.slice(0, 2)} {br ? "[" : ""}<span style={{ color: T.cf(p) }}>{fc.repeat(f) + ec.repeat(10 - f)}</span>{br ? "]" : ""} <span style={{ color: T.cf(p) }}>{Math.round(p)}%</span></div>
      );
    });
  });
  return <div style={{ fontSize: T.font.indexOf("VT323") >= 0 ? 18 : 12, lineHeight: 1.45, whiteSpace: "pre" }}>{lines}</div>;
}

function renderSegments(data, T) {
  return data.sources.map((s) => {
    if (!s.ok) return <div className="ug-row" key={s.key} style={{ opacity: 0.4, fontWeight: 500 }}>{s.label} —</div>;
    if (s.kind === "spend") return spendLine(s, T);
    const w = primaryWin(s), p = remPct(w), color = T.cf(p), f = Math.round(p / 10);
    return (
      <div className="ug-row" key={s.key}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 500 }}><span>{s.label}{s.unofficial ? <span style={{ color: T.time }}> *</span> : null}</span><span style={{ color }}>{Math.round(p)}%</span></div>
        <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
          {Array.from({ length: 10 }).map((_, i) => <span key={i} style={{ flex: 1, height: 7, borderRadius: 3, background: i < f ? color : T.track }} />)}
        </div>
      </div>
    );
  });
}

function renderBattery(data, T) {
  return data.sources.map((s) => {
    if (!s.ok) return <div className="ug-win" key={s.key} style={{ opacity: 0.4, justifyContent: "space-between" }}><span style={{ fontWeight: 500 }}>{s.label}</span><span>—</span></div>;
    if (s.kind === "spend") return (
      <div className="ug-win" key={s.key} style={{ justifyContent: "space-between" }}><span style={{ color: T.mut }}>{s.label}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{bal(s)}</span></div>
    );
    const w = primaryWin(s), p = remPct(w), color = T.cf(p);
    return (
      <div className="ug-win" key={s.key} style={{ justifyContent: "space-between" }}>
        <span style={{ fontWeight: 500, fontSize: 13 }}>{s.label}{s.unofficial ? <span style={{ color: T.time }}> *</span> : null}</span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 46, height: 18, border: `2px solid ${color}`, borderRadius: 4, padding: 2, boxSizing: "border-box" }}>
            <span className="ug-anim" style={{ display: "block", height: "100%", width: `${Math.max(3, p)}%`, background: color, borderRadius: 2 }} />
          </span>
          <span style={{ width: 4, height: 8, background: color, borderRadius: "0 2px 2px 0" }} />
          <span style={{ width: 30, textAlign: "right", fontSize: 12 }}>{Math.round(p)}%</span>
        </span>
      </div>
    );
  });
}

function renderTiles(data, T) {
  const items = data.sources.filter((s) => s.ok);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
      {items.map((s, i) => {
        const c = TILE_COLORS[i % TILE_COLORS.length];
        if (s.kind === "spend") return (
          <div key={s.key} style={{ background: c.bg, color: c.fg, borderRadius: 14, padding: "9px 11px" }}>
            <div style={{ fontSize: 12 }}>{s.label}</div>
            <div style={{ fontSize: 19, fontWeight: 600, lineHeight: 1.3 }}>{bal(s)}</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>balance</div>
          </div>
        );
        const w = primaryWin(s), p = remPct(w);
        return (
          <div key={s.key} style={{ background: c.bg, color: c.fg, borderRadius: 14, padding: "9px 11px" }}>
            <div style={{ fontSize: 12 }}>{s.label}{s.unofficial ? " *" : ""}</div>
            <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>{Math.round(p)}%</div>
            <div style={{ height: 6, borderRadius: 3, background: c.track, marginTop: 5, overflow: "hidden" }}>
              <span className="ug-anim" style={{ display: "block", height: "100%", width: `${Math.max(3, p)}%`, background: c.bar }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const RENDER = {
  orig: (d, T) => renderBars(d, T),
  bars: (d, T) => renderBars(d, T),
  pastel: (d, T) => renderBars(d, T),
  rings: (d, T) => renderRings(d, T),
  segments: (d, T) => renderSegments(d, T),
  battery: (d, T) => renderBattery(d, T),
  tiles: (d, T) => renderTiles(d, T),
  mono: (d, T) => renderMono(d, T, "▓", "░", false),
  lcd: (d, T) => renderMono(d, T, "#", ".", true),
};

// ---------- size / style / position (localStorage) ----------
const SCALES = { small: 0.82, medium: 0.92, large: 1.0, "extra large": 1.15, xl: 1.15 };
const SIZE_ORDER = ["small", "medium", "large", "extra large"];
const SIZE_LABEL = { small: "S", medium: "M", large: "L", "extra large": "XL" };
const SIZE_KEY = "usageGlanceSize", STYLE_KEY = "usageGlanceStyle", POS_KEY = "usageGlancePos";
const ls = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lset = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const getSize = (fb) => { const s = ls(SIZE_KEY); return s && SCALES[s] ? s : fb || "small"; };
const getStyle = () => { const s = ls(STYLE_KEY); return s && THEMES[s] ? s : "orig"; };
const getPos = () => { try { const p = JSON.parse(ls(POS_KEY)); if (p && typeof p.left === "number") return p; } catch {} return null; };

let containerEl = null, rootEl = null;

function ensureFonts() {
  if (document.getElementById("ug-fonts")) return;
  const l = document.createElement("link");
  l.id = "ug-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600&family=VT323&display=swap";
  document.head.appendChild(l);
}
function applyTheme(c, style) {
  const T = THEMES[style];
  c.style.background = T.bg; c.style.color = T.fg; c.style.fontFamily = T.font;
  c.style.border = T.border; c.style.borderRadius = T.radius;
  c.style.webkitBackdropFilter = T.blur ? "blur(14px)" : "none";
  c.style.backdropFilter = T.blur ? "blur(14px)" : "none";
  const h = c.querySelector(".ug-title"); if (h) h.style.color = T.hdr;
}
function showActive(root, style) {
  if (!root) return;
  root.querySelectorAll(".ug-style").forEach((el) => { el.style.display = el.getAttribute("data-style") === style ? "block" : "none"; });
}
const applyChrome = (scale, style) => (el) => {
  if (!el) return;
  ensureFonts();
  rootEl = el;
  const c = el.parentElement || el;
  containerEl = c;
  applyTheme(c, style);
  c.style.transformOrigin = "top left";
  c.style.transform = `scale(${scale})`;
  const p = getPos(); if (p) { c.style.left = p.left + "px"; c.style.top = p.top + "px"; }
  showActive(el, style);
};

const cycleSize = (e) => {
  e.stopPropagation(); e.preventDefault();
  const next = SIZE_ORDER[(SIZE_ORDER.indexOf(getSize()) + 1) % SIZE_ORDER.length];
  lset(SIZE_KEY, next);
  if (containerEl) containerEl.style.transform = `scale(${SCALES[next]})`;
  if (e.currentTarget) e.currentTarget.textContent = SIZE_LABEL[next];
};
const cycleStyle = (e) => {
  e.stopPropagation(); e.preventDefault();
  const next = STYLES[(STYLES.indexOf(getStyle()) + 1) % STYLES.length];
  lset(STYLE_KEY, next);
  if (containerEl) applyTheme(containerEl, next);
  showActive(rootEl, next);
  if (e.currentTarget) e.currentTarget.textContent = STYLE_TAG[next];
};
const startDrag = () => (e) => {
  const c = containerEl; if (!c) return;
  e.preventDefault();
  const scale = SCALES[getSize()] || 0.82;
  const sl = parseFloat(c.style.left) || c.offsetLeft || 0, st = parseFloat(c.style.top) || c.offsetTop || 0;
  const sx = e.clientX, sy = e.clientY;
  const move = (ev) => { c.style.left = sl + (ev.clientX - sx) / scale + "px"; c.style.top = st + (ev.clientY - sy) / scale + "px"; };
  const up = () => { document.removeEventListener("mousemove", move); document.removeEventListener("mouseup", up); lset(POS_KEY, JSON.stringify({ left: parseFloat(c.style.left) || 0, top: parseFloat(c.style.top) || 0 })); };
  document.addEventListener("mousemove", move); document.addEventListener("mouseup", up);
};

export const render = ({ output }) => {
  let data;
  try { data = JSON.parse(output); } catch (e) {
    return <div><div className="ug-title">Usage Glance</div><div style={{ fontSize: 11, color: "#7d8590" }}>starting…</div></div>;
  }
  const size = getSize((data.ui && data.ui.size) || "small");
  const scale = SCALES[size] || 0.82;
  const style = getStyle();
  const t = new Date(data.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return (
    <div className="ug-root" ref={applyChrome(scale, style)}>
      <div className="ug-title" onMouseDown={startDrag()} title="drag to move">
        <span>Usage Glance</span>
        <span className="ug-right">
          <span className="ug-chip" onMouseDown={cycleStyle} title={`style: ${STYLE_NAME[style]} (click)`}>{STYLE_TAG[style]}</span>
          <span className="ug-chip" onMouseDown={cycleSize} title="resize">{SIZE_LABEL[size]}</span>
          <span>{t}</span>
        </span>
      </div>
      {STYLES.map((id) => (
        <div className="ug-style" data-style={id} key={id} style={{ display: id === style ? "block" : "none" }}>
          {RENDER[id](data, THEMES[id])}
        </div>
      ))}
      {data.sources.some((s) => s.unofficial) ? (
        <div style={{ marginTop: 8, fontSize: 8.5, textAlign: "right", opacity: 0.6 }}>* unofficial source</div>
      ) : null}
    </div>
  );
};
