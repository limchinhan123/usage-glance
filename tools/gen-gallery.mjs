// Generates assets/gallery.svg — a preview of all 9 widget styles with sample data.
// Run: node tools/gen-gallery.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CW = 210, CH = 188, GAP = 16, PAD = 20, LBL = 22, COLS = 3;
const cf = (p) => (p < 20 ? "#f85149" : p < 50 ? "#d29922" : "#3fb950");
const cfSoft = (p) => (p < 20 ? "#e69a9a" : p < 50 ? "#e6c06a" : "#7ec99a");
const cfLcd = (p) => (p < 20 ? "#e0572e" : p < 50 ? "#e0a82e" : "#4ad26a");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

const THEME = {
  orig: { bg: "#161b22", fg: "#e6edf3", mut: "#9aa4ad", track: "rgba(255,255,255,0.10)", font: "-apple-system, Helvetica, sans-serif", cf },
  bars: { bg: "#161b22", fg: "#e6edf3", mut: "#9aa4ad", track: "rgba(255,255,255,0.10)", font: "'Trebuchet MS', sans-serif", cf },
  rings: { bg: "#161b22", fg: "#e6edf3", mut: "#9aa4ad", track: "rgba(255,255,255,0.10)", font: "-apple-system, sans-serif", cf },
  segments: { bg: "#161b22", fg: "#e6edf3", mut: "#9aa4ad", track: "rgba(255,255,255,0.12)", font: "-apple-system, sans-serif", cf },
  battery: { bg: "#161b22", fg: "#e6edf3", mut: "#9aa4ad", track: "rgba(255,255,255,0.10)", font: "'Trebuchet MS', sans-serif", cf },
  tiles: { bg: "#12141a", fg: "#e6edf3", mut: "#9aa4ad", track: "", font: "'Trebuchet MS', sans-serif", cf },
  mono: { bg: "#161b22", fg: "#e6edf3", mut: "#9aa4ad", track: "", font: "ui-monospace, Menlo, monospace", cf },
  lcd: { bg: "#0c1410", fg: "#4ad26a", mut: "#2f7d4a", track: "", font: "ui-monospace, Menlo, monospace", cf: cfLcd },
  pastel: { bg: "#faf9ff", fg: "#4a4660", mut: "#9b96b5", track: "#eceaf4", font: "'Trebuchet MS', sans-serif", cf: cfSoft },
};
const TAG = { orig: "orig", bars: "bars", rings: "ring", segments: "seg", battery: "batt", tiles: "tile", mono: "mono", lcd: "lcd", pastel: "soft" };
const TILEC = [
  ["#ece7fb", "#5b4a9e", "#8b7fd6", "#d5ccef"], ["#ddf3e8", "#2f7a56", "#5dcaa5", "#c2e6d4"],
  ["#fbeae1", "#a35a2e", "#e08a5a", "#f1d3c4"], ["#e3eefb", "#2f5a9e", "#6aa3e0", "#cfe0f5"],
];

function T(x, y, s, fill, size, { anchor = "start", w = 400, font } = {}) {
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${w}" text-anchor="${anchor}"${font ? ` font-family="${font}"` : ""}>${esc(s)}</text>`;
}
function bar(x, y, w, pct, color, track) {
  const fw = Math.max(3, (pct / 100) * w);
  return `<rect x="${x}" y="${y}" width="${w}" height="7" rx="3.5" fill="${track}"/><rect x="${x}" y="${y}" width="${fw.toFixed(1)}" height="7" rx="3.5" fill="${color}"/>`;
}
function ring(cx, cy, pct, color, fg) {
  const r = 20, c = 2 * Math.PI * r, f = (pct / 100) * c;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(127,127,127,0.28)" stroke-width="5"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${f.toFixed(1)} ${(c - f).toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>` +
    `<text x="${cx}" y="${cy + 4}" fill="${fg}" font-size="12" font-weight="500" text-anchor="middle">${Math.round(pct)}%</text>`;
}
function pips(x, y, w, pct, color, track) {
  const n = 10, gap = 3, pw = (w - gap * (n - 1)) / n, on = Math.round(pct / 10);
  let s = "";
  for (let i = 0; i < n; i++) s += `<rect x="${(x + i * (pw + gap)).toFixed(1)}" y="${y}" width="${pw.toFixed(1)}" height="7" rx="3" fill="${i < on ? color : track}"/>`;
  return s;
}
function battery(x, y, pct, color) {
  const w = 44, fw = Math.max(3, (pct / 100) * (w - 6));
  return `<rect x="${x}" y="${y}" width="${w}" height="17" rx="3" fill="none" stroke="${color}" stroke-width="2"/>` +
    `<rect x="${x + 3}" y="${y + 3}" width="${fw.toFixed(1)}" height="11" rx="1.5" fill="${color}"/>` +
    `<rect x="${x + w + 1}" y="${y + 5}" width="3" height="7" rx="1" fill="${color}"/>`;
}

const claude = { label: "Claude", w5: 34, wk: 62, t: 17 };
const codex = { label: "Codex", wk: 84 };
const cursor = { label: "Cursor", mo: 100 };

function body(style, th) {
  const inX = 14, w = CW - 28;
  let g = T(inX, 22, "USAGE GLANCE", th.mut, 9.5, { w: 500, font: th.font });
  const valX = CW - 14;
  if (style === "orig" || style === "bars" || style === "pastel") {
    g += T(inX, 44, "Claude", th.fg, 13, { w: 500, font: th.font });
    g += `<g transform="translate(0,50)">${T(inX, 9, "5h", th.mut, 10, { font: th.font })}${bar(inX + 34, 3, w - 70, claude.w5, th.cf(claude.w5), th.track)}${T(valX, 9, "34%", th.cf(claude.w5), 11, { anchor: "end", font: th.font })}</g>`;
    g += `<g transform="translate(0,66)">${T(inX, 9, "weekly", th.mut, 10, { font: th.font })}${bar(inX + 34, 3, w - 70, claude.wk, th.cf(claude.wk), th.track)}${T(valX, 9, "62%", th.cf(claude.wk), 11, { anchor: "end", font: th.font })}</g>`;
    g += T(inX, 102, "Codex", th.fg, 13, { w: 500, font: th.font });
    g += `<g transform="translate(0,108)">${T(inX, 9, "weekly", th.mut, 10, { font: th.font })}${bar(inX + 34, 3, w - 70, codex.wk, th.cf(codex.wk), th.track)}${T(valX, 9, "84%", th.cf(codex.wk), 11, { anchor: "end", font: th.font })}</g>`;
    g += T(inX, 146, "fal.ai", th.fg, 13, { w: 500, font: th.font }) + T(valX, 146, "$19.98 left", th.fg, 12, { anchor: "end", font: th.font });
  } else if (style === "rings") {
    const cy = 66;
    g += ring(inX + 26, cy, claude.wk, th.cf(claude.wk), th.fg) + T(inX + 26, cy + 36, "Claude", th.mut, 11, { anchor: "middle", font: th.font });
    g += ring(CW / 2, cy, codex.wk, th.cf(codex.wk), th.fg) + T(CW / 2, cy + 36, "Codex", th.mut, 11, { anchor: "middle", font: th.font });
    g += ring(CW - inX - 26, cy, cursor.mo, th.cf(cursor.mo), th.fg) + T(CW - inX - 26, cy + 36, "Cursor", th.mut, 11, { anchor: "middle", font: th.font });
    g += T(inX, 138, "OpenRouter", th.mut, 12, { font: th.font }) + T(valX, 138, "$13.72 left", th.fg, 12, { anchor: "end", font: th.font });
    g += T(inX, 160, "DeepSeek", th.mut, 12, { font: th.font }) + T(valX, 160, "$17.31 left", th.fg, 12, { anchor: "end", font: th.font });
  } else if (style === "segments") {
    [["Claude", claude.wk], ["Codex", codex.wk], ["Cursor", cursor.mo]].forEach(([l, p], i) => {
      const y = 46 + i * 40;
      g += T(inX, y, l, th.fg, 13, { w: 500, font: th.font }) + T(valX, y, p + "%", th.cf(p), 12, { anchor: "end", font: th.font });
      g += pips(inX, y + 7, w, p, th.cf(p), th.track);
    });
  } else if (style === "battery") {
    [["Claude", claude.wk], ["Codex", codex.wk], ["Cursor", cursor.mo]].forEach(([l, p], i) => {
      const y = 44 + i * 30;
      g += T(inX, y + 13, l, th.fg, 13, { w: 500, font: th.font }) + battery(inX + 96, y, p, th.cf(p)) + T(valX, y + 13, p + "%", th.fg, 12, { anchor: "end", font: th.font });
    });
    g += T(inX, 156, "fal.ai", th.mut, 12, { font: th.font }) + T(valX, 156, "$19.98", th.fg, 12, { anchor: "end", font: th.font });
  } else if (style === "tiles") {
    const items = [["Claude", "62%"], ["Codex", "84%"], ["Cursor", "100%"], ["fal.ai", "$19.98"]];
    items.forEach(([l, v], i) => {
      const [bg, fg, barC, trk] = TILEC[i];
      const tx = inX + (i % 2) * ((w) / 2 + 4), ty = 36 + Math.floor(i / 2) * 66, tw = w / 2 - 4;
      g += `<rect x="${tx}" y="${ty}" width="${tw}" height="58" rx="13" fill="${bg}"/>`;
      g += T(tx + 11, ty + 19, l, fg, 11, { font: th.font }) + T(tx + 11, ty + 42, v, fg, i === 3 ? 17 : 22, { w: 600, font: th.font });
      if (i < 3) g += bar(tx + 11, ty + 48, tw - 22, parseInt(v), barC, trk);
    });
  } else if (style === "mono" || style === "lcd") {
    const fc = style === "lcd" ? "#" : "▓", ec = style === "lcd" ? "." : "░", br = style === "lcd";
    const rows = [["claude 5h", 34], ["claude wk", 62], ["codex  wk", 84], ["cursor mo", 100]];
    rows.forEach(([lab, p], i) => {
      const y = 44 + i * 22, f = Math.round(p / 10);
      const barStr = (br ? "[" : "") + fc.repeat(f) + ec.repeat(10 - f) + (br ? "]" : "");
      g += T(inX, y, lab, th.fg, 13, { font: th.font }) + T(inX + 70, y, barStr, th.cf(p), 13, { font: th.font }) + T(valX, y, p + "%", th.cf(p), 13, { anchor: "end", font: th.font });
    });
    g += T(inX, 150, "fal $19.98  openrtr $13.72", th.mut, 12, { font: th.font });
  }
  return g;
}

const rows = Math.ceil(9 / COLS);
const W = PAD * 2 + COLS * CW + (COLS - 1) * GAP;
const H = PAD * 2 + 34 + rows * (CH + LBL + GAP);
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system, Helvetica, sans-serif">`;
svg += `<rect width="${W}" height="${H}" fill="#0d1117"/>`;
svg += T(PAD, PAD + 16, "Usage Glance — 9 rotatable styles", "#e6edf3", 17, { w: 500 });
Object.keys(THEME).forEach((style, idx) => {
  const i = idx % COLS, j = Math.floor(idx / COLS);
  const x = PAD + i * (CW + GAP), y = PAD + 34 + j * (CH + LBL + GAP);
  const th = THEME[style];
  svg += T(x + 2, y + 13, `${TAG[style]}  ·  ${style}`, "#7d8590", 11);
  svg += `<g transform="translate(${x},${y + LBL})">`;
  svg += `<rect width="${CW}" height="${CH}" rx="12" fill="${th.bg}" stroke="rgba(255,255,255,0.08)"/>`;
  svg += body(style, th);
  svg += `</g>`;
});
svg += `</svg>`;

mkdirSync(join(ROOT, "assets"), { recursive: true });
writeFileSync(join(ROOT, "assets", "gallery.svg"), svg);
console.log("wrote assets/gallery.svg (" + svg.length + " bytes)");
