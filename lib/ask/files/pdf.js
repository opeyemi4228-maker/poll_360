import { LEVEL_WORDS, TONE_HEX, fmtCell, fmtInt, isNumeric, niceAxis } from "../format.js";
import { site } from "../../site.js";

/* Who builds and runs Poll360, from the one place the product keeps it. */
const POWERED_BY = site.poweredBy;

/**
 * The Ask Poll360 brief, as a PDF.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WRITTEN BY HAND, AND WHY
 *
 *  A PDF library is a large dependency to keep current and audit, for a file
 *  whose whole vocabulary is rectangles, lines and text in two faces. The
 *  format's own standard faces — Helvetica and its bold — need no embedding,
 *  so the file is small, opens anywhere, and nothing is fetched to make it.
 *  The cost is that text is measured here, from the faces' published widths,
 *  and anything outside Western European characters is written plainly.
 *
 *  The brief is in the product's own colours only: the navy block for bands
 *  and table heads, the brand red for the rule and the marks, the ink scale
 *  for type and rows. The status swatches use the same tones the screen does.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── COLOURS, FROM app/globals.css ─────────────────────────────────────── */
const C = {
  navy: "#09144d",
  navyDeep: "#030729",
  royal: "#2943c5",
  blue300: "#95b1fe",
  blue100: "#dee8ff",
  blue50: "#eff3fe",
  red: "#e4013b",
  ink: "#0c0e14",
  ink700: "#35383e",
  ink500: "#6e7278",
  ink300: "#c5c7cd",
  ink200: "#dee0e4",
  ink100: "#edeef1",
  ink50: "#f6f7f9",
  white: "#ffffff",
};

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)).join(" ");
};

/* ── THE FACES' WIDTHS, IN THOUSANDTHS OF THE SIZE, CHARACTERS 32–126 ─── */
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
  556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556,
  556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722,
  500, 500, 500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722,
  611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556,
  611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778,
  556, 556, 500, 389, 280, 389, 584,
];
const HIGH = { 0x85: 1000, 0x91: 222, 0x92: 222, 0x93: 333, 0x94: 333, 0x95: 350, 0x96: 556, 0x97: 1000, 0xb7: 278, 0xd7: 584 };

/* ── TEXT INTO THE FACES' OWN ENCODING ──────────────────────────────────── */
const WIN = {
  "—": 0x97, "–": 0x96, "’": 0x92, "‘": 0x91, "“": 0x93, "”": 0x94, "•": 0x95, "…": 0x85, "·": 0xb7, "×": 0xd7,
};
const PLAIN = { "−": "-", "₦": "N", "↑": "^", "↓": "v", "→": "->", "≤": "<=", "≥": ">=", " ": " " };

function encode(text) {
  const bytes = [];
  for (const ch of String(text ?? "")) {
    if (PLAIN[ch]) {
      for (const c of PLAIN[ch]) bytes.push(c.charCodeAt(0));
      continue;
    }
    const code = ch.codePointAt(0);
    if (code >= 32 && code <= 126) bytes.push(code);
    else if (WIN[ch]) bytes.push(WIN[ch]);
    else if (code >= 0xa0 && code <= 0xff) bytes.push(code);
    else {
      const plain = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      const c = plain.codePointAt(0);
      bytes.push(c >= 32 && c <= 126 ? c : 63);
    }
  }
  return bytes;
}

function widthOf(text, bold, size) {
  const table = bold ? HELVETICA_BOLD : HELVETICA;
  let total = 0;
  for (const byte of encode(text)) {
    total += byte >= 32 && byte <= 126 ? table[byte - 32] : HIGH[byte] ?? 556;
  }
  return (total / 1000) * size;
}

const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

/** Lines of text no wider than `max`. Long words are broken rather than overflowing. */
function wrap(text, bold, size, max) {
  const lines = [];
  for (const paragraph of String(text ?? "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (widthOf(next, bold, size) <= max) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      if (widthOf(word, bold, size) <= max) {
        line = word;
        continue;
      }
      let piece = "";
      for (const ch of word) {
        if (widthOf(piece + ch, bold, size) > max) {
          lines.push(piece);
          piece = ch;
        } else piece += ch;
      }
      line = piece;
    }
    lines.push(line);
  }
  return lines;
}

function clip(text, bold, size, max) {
  const value = String(text ?? "");
  /* No glyph is wider than 1.015 em, so a short string needs no measuring —
     which is most cells in a table of 176,000 rows. */
  if (value.length * size * 1.02 <= max) return value;
  if (widthOf(value, bold, size) <= max) return value;
  let low = 0;
  let high = value.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (widthOf(`${value.slice(0, mid)}…`, bold, size) <= max) low = mid;
    else high = mid - 1;
  }
  return `${value.slice(0, Math.max(1, low)).trimEnd()}…`;
}

/* ══════════════════════════════════════════════════════════════ the page */

class Page {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.ops = [];
  }
  y(top) {
    return (this.height - top).toFixed(2);
  }
  rect(x, top, w, h, fill) {
    this.ops.push(`${rgb(fill)} rg ${x.toFixed(2)} ${(this.height - top - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  }
  line(x1, top1, x2, top2, color, width = 0.5) {
    this.ops.push(`${rgb(color)} RG ${width} w ${x1.toFixed(2)} ${this.y(top1)} m ${x2.toFixed(2)} ${this.y(top2)} l S`);
  }
  text(x, baseline, value, { size = 9, bold = false, italic = false, color = C.ink, spacing = 0 } = {}) {
    const font = bold ? "F2" : italic ? "F3" : "F1";
    const tc = spacing ? `${spacing} Tc ` : "";
    this.ops.push(`BT /${font} ${size} Tf ${tc}${rgb(color)} rg ${x.toFixed(2)} ${this.y(baseline)} Td <${hex(encode(value))}> Tj${spacing ? " 0 Tc" : ""} ET`);
  }
  right(xRight, baseline, value, options = {}) {
    const w = widthOf(value, options.bold, options.size ?? 9) + (options.spacing ?? 0) * String(value).length;
    this.text(xRight - w, baseline, value, options);
  }
  circle(cx, cy, r, fill) {
    const k = 0.5523 * r;
    const Y = (v) => (this.height - v).toFixed(2);
    const X = (v) => v.toFixed(2);
    this.ops.push(
      `${rgb(fill)} rg ${X(cx + r)} ${Y(cy)} m ` +
        `${X(cx + r)} ${Y(cy + k)} ${X(cx + k)} ${Y(cy + r)} ${X(cx)} ${Y(cy + r)} c ` +
        `${X(cx - k)} ${Y(cy + r)} ${X(cx - r)} ${Y(cy + k)} ${X(cx - r)} ${Y(cy)} c ` +
        `${X(cx - r)} ${Y(cy - k)} ${X(cx - k)} ${Y(cy - r)} ${X(cx)} ${Y(cy - r)} c ` +
        `${X(cx + k)} ${Y(cy - r)} ${X(cx + r)} ${Y(cy - k)} ${X(cx + r)} ${Y(cy)} c f`
    );
  }
  /**
   * A filled outline from an SVG path of straight lines (M, L, Z only — the
   * boundary files are written that way), mapped through `at(x, y)`.
   */
  shape(d, at, fill, stroke = C.white, width = 0.35) {
    const ops = [];
    const tokens = String(d).match(/[MLZ]|-?\d+(?:\.\d+)?/g) ?? [];
    let command = "M";
    for (let i = 0; i < tokens.length; ) {
      const token = tokens[i];
      if (token === "M" || token === "L") {
        command = token;
        i += 1;
        continue;
      }
      if (token === "Z") {
        ops.push("h");
        i += 1;
        continue;
      }
      const [x, y] = at(Number(tokens[i]), Number(tokens[i + 1]));
      ops.push(`${x.toFixed(2)} ${this.y(y)} ${command === "M" ? "m" : "l"}`);
      if (command === "M") command = "L";
      i += 2;
    }
    if (!ops.length) return;
    this.ops.push(`${rgb(fill)} rg ${rgb(stroke)} RG ${width} w 1 j ${ops.join(" ")} b`);
  }
  /** The Poll360 coverage dial: 24 ticks, a red arc from twelve o'clock, the count at the centre. */
  dial(x, top, size, { tick = C.blue300, centre = C.white, sweep = 0.25 } = {}) {
    const s = size / 40;
    const cx = x + 20 * s;
    const cy = top + 20 * s;
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2 - Math.PI / 2;
      const inner = (i % 6 === 0 ? 11.5 : 13.2) * s;
      this.line(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner, cx + Math.cos(a) * 17.5 * s, cy + Math.sin(a) * 17.5 * s, tick, 1.4 * s);
    }
    const r = 15.5 * s;
    const steps = 40;
    const points = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = -Math.PI / 2 + (i / steps) * sweep * Math.PI * 2;
      points.push(`${(cx + Math.cos(a) * r).toFixed(2)} ${this.y(cy + Math.sin(a) * r)}`);
    }
    this.ops.push(`${rgb(C.red)} RG ${(3.2 * s).toFixed(2)} w 0 J ${points[0]} m ${points.slice(1).map((p) => `${p} l`).join(" ")} S`);
    this.circle(cx, cy, 4.4 * s, centre);
  }
}

/* ══════════════════════════════════════════════════════════════ the brief */

const PORTRAIT = [595.28, 841.89];
const LANDSCAPE = [841.89, 595.28];
/**
 * The brief as a PDF: every row of every table, however many there are.
 *
 * ── PAGE BY PAGE, SO IT CAN BE ANY LENGTH ────────────────────────────────
 * Every polling unit in the country is about four thousand pages. They are
 * not held in memory together: the number of pages is worked out first, so
 * each one is drawn with its "Page n of N", compressed and let go before the
 * next is begun. `compress` is supplied by the caller — Node's zlib on the
 * server, the browser's own CompressionStream on the screen — so the same
 * writer runs in both places. Returns the file as a list of byte chunks.
 *
 * `rowsCap` limits the rows printed per table for callers that must (a
 * server response has a size ceiling); the screen passes none and gets all.
 */
export async function briefPdf(
  { payload, sections, understood, scopeName, madeAt = new Date(), analysis = null, visual = null, geometry = null },
  { compress, onProgress = null, rowsCap = Infinity } = {}
) {
  if (typeof compress !== "function") throw new Error("briefPdf needs a compress function");
  const pages = [];
  const ref = String(payload.id ?? "").slice(0, 8).toUpperCase();
  const stamp = madeAt.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Lagos" });

  /* ── PAGE ONE: THE BRIEF ─────────────────────────────────────────────── */
  const [PW, PH] = PORTRAIT;
  const M = 44;
  const W = PW - M * 2;
  let page = new Page(PW, PH);
  pages.push(page);

  page.rect(0, 0, PW, 124, C.navy);
  page.rect(0, 124, PW, 4, C.red);
  page.dial(M, 34, 48);
  page.text(M + 60, 58, "Poll360", { size: 22, bold: true, color: C.white });
  page.text(M + 61, 76, "ASK POLL360  ·  ELECTION ANALYTICS & PLANNING BRIEF", { size: 7, bold: true, color: C.blue300, spacing: 1.1 });
  page.right(PW - M, 52, `Ref. ${ref}`, { size: 8, bold: true, color: C.white });
  page.right(PW - M, 66, stamp, { size: 8, color: C.blue300 });
  page.right(PW - M, 80, `Ground: ${scopeName}`, { size: 8, color: C.blue300 });
  page.text(M, 106, "From the booth to the broadcast. Every figure worked out from the record, none of it guessed.", { size: 7.5, italic: true, color: C.blue300 });

  let top = 160;
  const room = (needed) => {
    if (top + needed <= PH - 64) return;
    page = new Page(PW, PH);
    pages.push(page);
    slimHeader(page, "The brief, continued");
    top = 84;
  };

  /* A heading never ends a page: it keeps room for itself and the first
     lines under it. */
  const label = (text, color = C.ink500) => {
    room(60);
    page.text(M, top, text.toUpperCase(), { size: 7, bold: true, color, spacing: 1.2 });
    top += 12;
  };

  label("The question");
  for (const line of wrap(`“${payload.question}”`, false, 12.5, W)) {
    room(17);
    page.text(M, top + 4, line, { size: 12.5, italic: true, color: C.ink700 });
    top += 17;
  }
  top += 10;

  label("The answer", C.red);
  for (const line of wrap(payload.answer.headline, true, 17, W)) {
    room(22);
    page.text(M, top + 6, line, { size: 17, bold: true, color: C.navy });
    top += 22;
  }
  top += 8;

  /* What the question was understood as, and on what basis it was answered. */
  const bases = [...new Set(sections.map((section) => section.provenanceLabel.label))].map((name) => {
    const found = sections.find((section) => section.provenanceLabel.label === name);
    return `${name}: ${found.provenanceLabel.note}`;
  });
  const chips = [...understood.map((chip) => `${chip.label}: ${chip.value}`), ...bases];
  let x = M;
  room(20);
  for (const chip of chips) {
    const w = widthOf(chip, false, 7.5) + 12;
    if (x + w > M + W) {
      x = M;
      top += 18;
      room(20);
    }
    page.rect(x, top, w, 14, C.blue50);
    page.rect(x, top, 2, 14, C.royal);
    page.text(x + 7, top + 9.8, chip, { size: 7.5, color: C.ink700 });
    x += w + 5;
  }
  top += 30;

  /* The figures that carry the answer. */
  const tiles = sections[0]?.tiles ?? [];
  if (tiles.length) {
    room(74);
    const gap = 8;
    const tw = (W - gap * (tiles.length - 1)) / tiles.length;
    tiles.forEach((tile, index) => {
      const tx = M + index * (tw + gap);
      page.rect(tx, top, tw, 68, C.ink50);
      page.rect(tx, top, tw, 2.5, index === 0 ? C.red : C.navy);
      page.text(tx + 9, top + 16, clip(tile.label.toUpperCase(), true, 6.3, tw - 16), { size: 6.3, bold: true, color: C.ink500, spacing: 0.5 });
      page.text(tx + 9, top + 38, clip(tile.value, true, 17, tw - 16), {
        size: 17,
        bold: true,
        color: tile.tone === "warn" ? C.red : tile.tone === "good" ? C.royal : C.navy,
      });
      wrap(tile.sub ?? "", false, 6.8, tw - 16)
        .slice(0, 2)
        .forEach((line, at) => page.text(tx + 9, top + 51 + at * 8.5, line, { size: 6.8, color: C.ink500 }));
    });
    top += 84;
  }

  /* ── BY THE NUMBERS, AND THE BREAKDOWN ──────────────────────────────── */
  if (analysis?.numbers?.length) {
    label("By the numbers");
    const colW = (W - 16) / 2;
    const rows = Math.ceil(analysis.numbers.length / 2);
    for (let r = 0; r < rows; r += 1) {
      room(38);
      for (let c = 0; c < 2; c += 1) {
        const entry = analysis.numbers[r * 2 + c];
        if (!entry) continue;
        const x = M + c * (colW + 16);
        page.rect(x, top, 2, 32, C.ink200);
        page.text(x + 9, top + 8, clip(entry.label, false, 7.3, colW - 12), { size: 7.3, color: C.ink500 });
        page.text(x + 9, top + 21, clip(entry.value, true, 11.5, colW - 12), { size: 11.5, bold: true, color: entry.tone === "warn" ? C.red : C.navy });
        if (entry.note) page.text(x + 9, top + 30, clip(entry.note, false, 6.6, colW - 12), { size: 6.6, color: C.ink500 });
      }
      top += 38;
    }
    top += 8;
  }

  /* ── THE MAP ──────────────────────────────────────────────────────────
     The same outlines and the same colours as the answer on screen. */
  if (visual?.map && geometry?.regions?.length) {
    const [bx, by, bw, bh] = geometry.box;
    const mapW = W;
    const mapH = Math.min(300, (mapW * bh) / bw);
    const scale = Math.min(mapW / bw, mapH / bh);
    const offsetX = M + (mapW - bw * scale) / 2;
    /* The heading moves with its map: room for both, or a new page for both. */
    room(mapH + 90);
    label("The map");
    page.text(M, top + 4, clip(visual.map.title, true, 9.5, W), { size: 9.5, bold: true, color: C.ink });
    top += 12;
    const originTop = top;
    const at = (x, y) => [offsetX + (x - bx) * scale, originTop + (y - by) * scale];
    /* ── CLIPPED TO ITS FRAME ─────────────────────────────────────────────
       A map zoomed to the South still has the North in its outlines; without
       a clip those states are drawn past the frame, over the page header. */
    const frameH = bh * scale;
    page.ops.push(`q ${M.toFixed(2)} ${(page.height - originTop - frameH).toFixed(2)} ${mapW.toFixed(2)} ${frameH.toFixed(2)} re W n`);
    for (const region of geometry.regions) page.shape(region.d, at, region.color);
    page.ops.push("Q");
    top += bh * scale + 8;
    let lx = M;
    for (const entry of visual.map.legend) {
      const w = widthOf(entry.label, false, 7.3) + 20;
      if (lx + w > M + W) {
        lx = M;
        top += 11;
      }
      page.rect(lx, top, 7, 7, entry.color);
      page.text(lx + 10, top + 6.2, entry.label, { size: 7.3, color: C.ink700 });
      lx += w;
    }
    top += 13;
    page.text(M, top + 4, `${visual.map.note ? `${visual.map.note} ` : ""}Boundaries: geoBoundaries (CC BY 4.0).`, { size: 6.6, italic: true, color: C.ink500 });
    top += 16;
  }

  /* ── THE CHART: two runs, one row per place ─────────────────────────── */
  if (visual?.chart?.rows?.length) {
    const chart = visual.chart;
    const rowsDrawn = chart.rows.slice(0, 44);
    const rowH = 11;
    const needed = rowsDrawn.length * rowH + 60;
    room(Math.min(needed + 20, PH - 150));
    label("The chart");
    page.text(M, top + 4, clip(chart.title, true, 9.5, W), { size: 9.5, bold: true, color: C.ink });
    top += 12;
    /* Legend in words beside marks: open dot, filled dots, the line. */
    let lx = M;
    const legendItem = (draw, text) => {
      draw(lx, top + 3.5);
      page.text(lx + 9, top + 6, text, { size: 7.3, color: C.ink700 });
      lx += widthOf(text, false, 7.3) + 22;
    };
    legendItem((x, y) => { page.circle(x + 3, y, 3, C.ink500); page.circle(x + 3, y, 1.8, C.white); }, chart.fromLabel);
    legendItem((x, y) => page.circle(x + 3, y, 3, C.royal), `${chart.toLabel}, higher`);
    legendItem((x, y) => page.circle(x + 3, y, 3, C.red), `${chart.toLabel}, lower`);
    if (chart.line !== null) legendItem((x, y) => page.rect(x + 2.5, y - 4, 0.8, 8, C.red), `${chart.line}% line`);
    top += 14;

    const labelW = 120;
    const plotX = M + labelW;
    const plotW = W - labelW - 6;
    const axis = niceAxis(Math.min(100, Math.max(...chart.rows.flatMap((row) => [row.from, row.to]), chart.line ?? 0)));
    const max = axis.top;
    const px = (v) => plotX + (Math.max(0, Math.min(max, v)) / max) * plotW;
    const chartTop = top;
    const chartBottom = top + rowsDrawn.length * rowH;
    for (const tick of axis.ticks) {
      page.rect(px(tick) - 0.2, chartTop, 0.4, chartBottom - chartTop, C.ink100);
      const text = `${Math.round(tick)}%`;
      page.text(px(tick) - widthOf(text, false, 6.6) / 2, chartBottom + 9, text, { size: 6.6, color: C.ink500 });
    }
    if (chart.line !== null && chart.line <= max) page.rect(px(chart.line) - 0.4, chartTop - 2, 0.8, chartBottom - chartTop + 4, C.red);
    rowsDrawn.forEach((row, index) => {
      const cy = chartTop + index * rowH + rowH / 2;
      if (index % 2 === 1) page.rect(M, cy - rowH / 2, W, rowH, C.ink50);
      page.right(plotX - 6, cy + 2.5, clip(row.label, false, 7.2, labelW - 10), { size: 7.2, color: C.ink700 });
      const a = px(row.from);
      const b = px(row.to);
      page.rect(Math.min(a, b), cy - 0.8, Math.abs(b - a), 1.6, C.ink300);
      page.circle(a, cy, 2.8, C.ink500);
      page.circle(a, cy, 1.6, C.white);
      page.circle(b, cy, 3, row.to >= row.from ? C.royal : C.red);
    });
    top = chartBottom + 16;
    if (chart.rows.length > rowsDrawn.length) {
      page.text(M, top, `The first ${rowsDrawn.length} of ${chart.rows.length}; every one is in the tables.`, { size: 7, italic: true, color: C.ink500 });
      top += 10;
    }
    top += 8;
  }

  const bars = analysis?.breakdown?.bars ?? [];
  if (bars.length) {
    label("Breakdown");
    room(18);
    page.text(M, top + 4, clip(analysis.breakdown.title, true, 9.5, W), { size: 9.5, bold: true, color: C.ink });
    top += 14;
    const signed = Boolean(analysis.breakdown.signed);
    const maxAbs = Math.max(...bars.map((bar) => (signed ? Math.abs(bar.value ?? 0) : bar.max ?? bar.value ?? 0)), 1);
    const labelW = 130;
    const valueW = 70;
    const trackW = W - labelW - valueW - 16;
    const toneHex = { held: C.royal, cleared: "#3d5fe3", slipped: C.blue300, reach: "#ec7c0e", beyond: C.ink300, ink: C.navy };
    for (const bar of bars) {
      room(15);
      const value = Number(bar.value ?? 0);
      page.text(M, top + 8, clip(bar.label, false, 8, labelW - 6), { size: 8, color: C.ink700 });
      const tx = M + labelW;
      page.rect(tx, top + 2.5, trackW, 7, C.ink100);
      const share = Math.min(1, Math.abs(value) / (signed ? maxAbs : bar.max ?? maxAbs));
      const fill = toneHex[bar.tone] ?? C.navy;
      if (signed) {
        const mid = tx + trackW / 2;
        const w = (trackW / 2) * share;
        page.rect(value >= 0 ? mid : mid - w, top + 2.5, w, 7, fill);
        page.rect(mid - 0.3, top + 1, 0.6, 10, C.ink300);
      } else {
        page.rect(tx, top + 2.5, trackW * share, 7, fill);
      }
      page.right(M + W, top + 8.5, bar.display ?? String(value), { size: 8, bold: true, color: C.ink });
      top += 14;
    }
    top += 10;
  }

  if (payload.answer.reading?.length) {
    label("The reading");
    for (const item of payload.answer.reading) {
      const lines = wrap(item, false, 9.5, W - 16);
      room(lines.length * 13.5 + 6);
      page.rect(M + 1, top + 1.5, 4.5, 4.5, C.red);
      lines.forEach((line, at) => page.text(M + 14, top + 6.5 + at * 13.5, line, { size: 9.5, color: C.ink }));
      top += lines.length * 13.5 + 5;
    }
    top += 10;
  }

  if (payload.answer.plan?.length) {
    label("For the plan", C.royal);
    payload.answer.plan.forEach((item, index) => {
      const lines = wrap(item, false, 9.5, W - 22);
      room(lines.length * 13.5 + 8);
      page.circle(M + 7, top + 3.5, 7, C.navy);
      page.text(M + 7 - widthOf(String(index + 1), true, 7.5) / 2, top + 6.2, String(index + 1), { size: 7.5, bold: true, color: C.white });
      lines.forEach((line, at) => page.text(M + 22, top + 6.5 + at * 13.5, line, { size: 9.5, color: C.ink }));
      top += lines.length * 13.5 + 7;
    });
    top += 10;
  }

  /* ── THE TABLES, PLANNED BEFORE A LINE OF THEM IS DRAWN ──────────────── */
  const plans = sections.map((section) => planTable(section, rowsCap));

  /* Their page ranges are written into the contents once the brief's own
     length is known; the line is laid out now and filled in then. */
  const contents = [];
  if (sections.length) {
    label("In the tables that follow");
    for (const [at, section] of sections.entries()) {
      room(15);
      page.rect(M, top - 1, 3, 11, C.navy);
      page.text(M + 10, top + 7.5, clip(section.title, true, 9, W - 210), { size: 9, bold: true, color: C.ink });
      contents.push({ page, top, plan: plans[at], section });
      top += 16;
    }
    top += 10;
  }

  if (payload.answer.method?.length) {
    const lines = payload.answer.method.flatMap((item) => wrap(item, false, 8, W - 28).map((line, at) => ({ line, first: at === 0 })));
    const height = 26 + lines.length * 11.5;
    room(Math.min(height, 300));
    page.rect(M, top, W, height, C.ink50);
    page.rect(M, top, 2.5, height, C.ink300);
    page.text(M + 14, top + 16, "HOW POLL360 WORKED THIS OUT", { size: 7, bold: true, color: C.ink500, spacing: 1.2 });
    let ly = top + 30;
    for (const { line, first } of lines) {
      if (ly > PH - 70) break;
      if (first) page.rect(M + 14, ly - 5, 2.5, 2.5, C.ink500);
      page.text(M + 22, ly, line, { size: 8, color: C.ink700 });
      ly += 11.5;
    }
    top += height + 8;
  }

  /* ── THE WHOLE DOCUMENT'S LENGTH, BEFORE ANY OF IT IS WRITTEN ─────────── */
  const briefCount = pages.length;
  let next = briefCount + 1;
  for (const plan of plans) {
    plan.firstPage = next;
    next += plan.pageCount;
  }
  const total = next - 1;
  for (const entry of contents) {
    const { plan, section } = entry;
    const range = plan.pageCount === 1 ? `p. ${fmtInt(plan.firstPage)}` : `pp. ${fmtInt(plan.firstPage)}–${fmtInt(plan.firstPage + plan.pageCount - 1)}`;
    const rowsText = plan.rows.length < section.total ? `${fmtInt(plan.rows.length)} of ${fmtInt(section.total)} rows` : `all ${fmtInt(section.total)} rows`;
    entry.page.right(M + W, entry.top + 7.5, `${rowsText} · ${range}`, { size: 8, color: C.ink500 });
  }

  const finished = [];
  const finish = async (one, index) => {
    footer(one, index, total, ref);
    const bytes = await compress(latin1(one.ops.join("\n")));
    finished.push({ width: one.width, height: one.height, bytes });
    one.ops = null;
    if (onProgress && (index % 25 === 0 || index === total)) onProgress({ page: index, pages: total });
  };

  for (const [index, one] of pages.entries()) await finish(one, index + 1);
  pages.length = 0;

  /* ── EVERY TABLE, EVERY ROW ────────────────────────────────────────────── */
  let number = briefCount;
  for (const [at, plan] of plans.entries()) {
    for (let pageIndex = 0; pageIndex < plan.pageCount; pageIndex += 1) {
      number += 1;
      const one = drawTablePage(sections[at], plan, pageIndex);
      await finish(one, number);
    }
  }

  return serialise(finished, {
    title: `Ask Poll360: ${payload.question}`,
    subject: payload.answer.headline,
    madeAt,
    outline: [
      { title: "The brief", page: 1 },
      ...plans.map((plan, at) => ({
        title: `${sections[at].title} — ${fmtInt(plan.rows.length)} rows`,
        page: plan.firstPage,
        /* Each state (or local government) a click away in the sidebar. */
        children: plan.band
          ? plan.groups.map((group) => ({
              title: `${bandWords(sections[at], plan, group).name} — ${fmtInt(group.count)}`,
              page: plan.firstPage + group.page,
            }))
          : [],
      })),
    ],
  });
}

/** The foot every page carries: reference, maker, page of pages, and the disclosure. */
function footer(one, index, total, ref) {
  const m = one.width > one.height ? 32 : 44;
  const foot = one.height - 34;
  one.line(m, foot - 10, one.width - m, foot - 10, C.ink200, 0.6);
  one.text(m, foot, `Poll360  ·  Ask Poll360 brief  ·  Ref. ${ref}`, { size: 7, bold: true, color: C.ink500 });
  const credit = `Powered by ${POWERED_BY}`;
  one.text((one.width - widthOf(credit, false, 7)) / 2, foot, credit, { size: 7, color: C.ink500 });
  one.right(one.width - m, foot, `Page ${fmtInt(index)} of ${fmtInt(total)}`, { size: 7, color: C.ink500 });
  one.text(
    m,
    foot + 11,
    "Poll360 is not the electoral commission. Declared results are INEC's; figures below the state are Poll360's estimates and are marked so.",
    { size: 6.3, italic: true, color: C.ink500 }
  );
}

/** A string of Latin-1 characters as bytes — every operator here is one. */
function latin1(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 255;
  return out;
}

function slimHeader(page, title) {
  const m = page.width > page.height ? 32 : 44;
  page.rect(0, 0, page.width, 44, C.navy);
  page.rect(0, 44, page.width, 2.5, C.red);
  page.dial(m, 9, 26);
  page.text(m + 34, 27, "Poll360", { size: 11.5, bold: true, color: C.white });
  page.text(m + 34 + widthOf("Poll360", true, 11.5) + 6, 27, "Ask Poll360", { size: 8.5, color: C.blue300 });
  page.right(page.width - m, 27, clip(title, true, 8.5, page.width / 2), { size: 8.5, bold: true, color: C.white });
}

/* ══════════════════════════════════════════════════════════════ tables */

/* The columns a printed page can afford to lose first, when it must. */
const DROP_ORDER = ["zone", "booths", "share_prev", "turnout", "registered", "lead", "ward", "per_unit", "code"];

const TABLE_TOP = 112;
const TABLE_BOTTOM = 58;

/**
 * How a table will be printed: its columns and their widths, how tall a row
 * is, and so how many pages it takes — all decided before a page is drawn.
 * A long table is set tighter so every polling unit fits in a document a
 * person can still carry: 42 rows a page rather than 26.
 */
function planTable(section, rowsCap) {
  const [W, H] = LANDSCAPE;
  const M = 32;
  const width = W - M * 2;
  const rows = section.rows.length > rowsCap ? section.rows.slice(0, rowsCap) : section.rows;
  const dense = rows.length > 1500;
  const size = dense ? 6.6 : 7.4;
  const rowH = dense ? 10 : 15;

  /* Widths are measured on rows spread across the whole table and on its tail,
     never its head alone: a list ordered by priority keeps its longest labels
     ("Out of reach") and its widest numbers for the last pages. */
  const stride = Math.max(1, Math.floor(rows.length / 1200));
  const sample = [];
  for (let index = 0; index < rows.length; index += stride) sample.push(rows[index]);
  sample.push(...rows.slice(-50));
  /* Columns that only repeat what a band already says are left to the CSV:
     the state (and its role) under a state's band, and the one state of an
     answer about one state. */
  const band = section.group ?? null;
  const oneState = rows.length > 0 && rows.every((row) => row.stateCode === rows[0].stateCode);
  const repeated = new Set([
    ...(band ? [band.name] : []),
    ...(band?.role || (band && oneState) ? ["state", "status"] : []),
    ...(oneState && section.level !== "state" ? ["state", "status"] : []),
  ]);
  let columns = section.columns.filter((column) => section.level === "state" || !repeated.has(column.key)).map((column) => {
    const pad = dense ? 9 : 12;
    const head = widthOf(column.label, true, size) + pad;
    let body = 0;
    for (const row of sample) body = Math.max(body, widthOf(fmtCell(column, row), column.main, size));
    if (column.kind === "bar") body += 44;
    if (column.kind === "status") body += 12;
    /* A dense table gives its names less room so that no figure is dropped. */
    const cap = column.main ? (dense ? 150 : 190) : column.kind === "text" ? (dense ? 84 : 130) : 110;
    return { ...column, w: Math.min(cap, Math.max(head, body + pad)) };
  });
  for (const key of DROP_ORDER) {
    if (columns.reduce((sum, column) => sum + column.w, 0) <= width) break;
    if (columns.length > 4) columns = columns.filter((column) => column.key !== key);
  }
  const natural = columns.reduce((sum, column) => sum + column.w, 0);
  const scale = width / natural;
  columns = columns.map((column) => ({ ...column, w: column.w * scale }));

  /* ── PAGES, WITH A BAND WHERE EACH STATE (OR LOCAL GOVERNMENT) BEGINS ────
     A band takes a row and a half. A page that opens mid-group opens with the
     group's band again, marked as continued, so no page is read blind. */
  const room = H - TABLE_BOTTOM - TABLE_TOP;
  const bandH = dense ? 14 : 19;
  const pages = [];
  const groups = [];
  if (!band) {
    const perPage = Math.max(1, Math.floor(room / rowH));
    for (let start = 0; start < rows.length || start === 0; start += perPage) pages.push({ start, end: Math.min(rows.length, start + perPage) });
  } else {
    let used = room + 1;
    let current = null;
    for (let index = 0; index < rows.length; index += 1) {
      const value = rows[index][band.key];
      const opens = !current || value !== current.value;
      if (opens) {
        current = { value, first: index, count: 0, row: rows[index] };
        groups.push(current);
      }
      current.count += 1;
      const need = rowH + (opens ? bandH : 0);
      if (used + need > room) {
        if (pages.length) pages[pages.length - 1].end = index;
        pages.push({ start: index, end: rows.length });
        used = opens ? 0 : bandH;
      }
      if (opens) current.page = pages.length - 1;
      used += need;
    }
    if (!pages.length) pages.push({ start: 0, end: 0 });
  }
  const nest = (section.nest ?? []).filter((key) => columns.some((column) => column.key === key));
  return { rows, columns, size, rowH, bandH, band, groups, nest, pages, pageCount: pages.length, width, M, W, H, dense };
}

/** The words on a group's band: its name, the state's role, and how many rows follow. */
function bandWords(section, plan, group) {
  const { band } = plan;
  const row = group.row;
  const name = band.name === "state" ? row.state : `${row.lga} local government${row.state ? `, ${row.state}` : ""}`;
  const noun = LEVEL_WORDS[section.level];
  const many = group.count === 1 ? noun?.one ?? "row" : noun?.many ?? "rows";
  return {
    name,
    role: band.role ? row.status_label ?? null : null,
    tone: band.role ? row.status : null,
    count: `${fmtInt(group.count)} ${many} · rows ${fmtInt(group.first + 1)}–${fmtInt(group.first + group.count)}`,
  };
}

/** One page of a table: its header repeated, its slice of rows, nothing held after. */
function drawTablePage(section, plan, pageIndex) {
  const { rows, columns, size, rowH, bandH, band, groups, nest, pages, pageCount, width, M, W, H } = plan;
  const page = new Page(W, H);
  slimHeader(page, `${LEVEL_WORDS[section.level]?.title ?? "Table"} · ${fmtInt(pageIndex + 1)} of ${fmtInt(pageCount)}`);
  page.text(M, 70, clip(section.title, true, 12.5, width - 260), { size: 12.5, bold: true, color: C.navy });
  page.right(W - M, 70, `${section.provenanceLabel.label}: ${section.provenanceLabel.note}`, { size: 7.5, color: C.ink500 });
  const { start: first, end } = pages[pageIndex];
  const slice = rows.slice(first, end);
  page.text(
    M,
    83,
    `Rows ${fmtInt(first + 1)}–${fmtInt(first + slice.length)} of ${fmtInt(rows.length)}${rows.length < section.total ? ` (of ${fmtInt(section.total)} in the answer)` : ""}.`,
    { size: 7.5, color: C.ink500 }
  );

  let top = 94;
  page.rect(M, top, width, 18, C.navy);
  let cx = M;
  for (const column of columns) {
    const labelText = clip(column.label, true, size, column.w - 10);
    if (isNumeric(column)) page.right(cx + column.w - 5, top + 12, labelText, { size, bold: true, color: C.white });
    else page.text(cx + 5, top + 12, labelText, { size, bold: true, color: C.white });
    cx += column.w;
  }
  top += 18;

  const baseline = rowH * 0.68;
  /* Groups are found by where they start, so a band costs no search per row. */
  let groupAt = band ? groups.findIndex((group) => group.first + group.count > first) : -1;
  const drawBand = (group, continued) => {
    const words = bandWords(section, plan, group);
    const text = Math.min(size + 1.4, 9);
    page.rect(M, top + 1.5, width, bandH - 1.5, C.blue50);
    page.rect(M, top + 1.5, 3, bandH - 1.5, C.navy);
    const base = top + 1.5 + (bandH - 1.5) * 0.68;
    let x = M + 10;
    const title = `${words.name}${continued ? ", continued" : ""}`;
    page.text(x, base, title, { size: text, bold: true, color: C.navy });
    x += widthOf(title, true, text) + 10;
    if (words.role) {
      const swatch = Math.min(6.5, bandH - 6);
      page.rect(x, top + 1.5 + (bandH - 1.5 - swatch) / 2, swatch, swatch, TONE_HEX[words.tone] ?? C.ink200);
      page.text(x + swatch + 4, base, words.role, { size: text - 0.6, color: C.ink700 });
    }
    page.right(M + width - 6, base, words.count, { size: text - 1, color: C.ink500 });
    top += bandH;
  };
  let stripe = 0;
  /* The path to each nested level — "Kubau", then "Kubau / Anchau" — so a
     ward of the same name in another local government still counts as new. */
  const pathOf = (row, depth) => nest.slice(0, depth + 1).map((key) => row[key]).join("\u0000");
  let before = null;
  slice.forEach((row, offset) => {
    const index = first + offset;
    let fresh = offset === 0;
    if (band) {
      const group = groups[groupAt];
      if (index === group.first + group.count) {
        groupAt += 1;
        drawBand(groups[groupAt], false);
        stripe = 0;
        fresh = true;
      } else if (offset === 0) {
        drawBand(group, index !== group.first);
        stripe = 0;
      }
    }
    /* Which nested cells are new on this row; the rest are left blank. */
    const shown = new Set();
    nest.forEach((key, depth) => {
      if (fresh || !before || pathOf(row, depth) !== pathOf(before, depth)) shown.add(key);
    });
    /* A firmer rule where a local government begins, a lighter one at a ward. */
    if (nest.length && !fresh && shown.size) page.line(M, top, M + width, top, shown.has(nest[0]) ? C.ink300 : C.ink200, shown.has(nest[0]) ? 0.7 : 0.4);
    before = row;
    if (stripe % 2 === 1) page.rect(M, top, width, rowH, C.ink50);
    stripe += 1;
    let x = M;
    for (const column of columns) {
      const base = top + baseline;
      if (column.kind === "status") {
        const swatch = Math.min(6, rowH - 4);
        page.rect(x + 5, top + (rowH - swatch) / 2, swatch, swatch, TONE_HEX[row.status] ?? C.ink200);
        page.text(x + 8 + swatch, base, clip(row.status_label ?? "—", false, size, column.w - 14 - swatch), { size, color: C.ink });
      } else if (column.kind === "bar") {
        const value = row[column.key];
        page.right(x + column.w - 5, base, fmtCell(column, row), { size, bold: true, color: C.ink });
        if (value !== null && value !== undefined) {
          const bw = 36;
          const bh = Math.min(3.5, rowH / 4);
          const by = top + (rowH - bh) / 2;
          page.rect(x + 5, by, bw, bh, C.ink100);
          const clear = column.threshold === null || column.threshold === undefined || value >= column.threshold;
          page.rect(x + 5, by, (bw * Math.max(0, Math.min(100, value))) / 100, bh, clear ? C.royal : C.ink300);
          if (column.threshold !== null && column.threshold !== undefined) {
            page.rect(x + 5 + (bw * column.threshold) / 100 - 0.4, by - 1.5, 0.9, bh + 3, C.red);
          }
        }
      } else if (nest.includes(column.key) && !shown.has(column.key)) {
        /* Same local government (or ward) as the row above: left blank. */
      } else {
        const text = clip(fmtCell(column, row), Boolean(column.main), size, column.w - 10);
        const color = column.main ? C.ink : column.kind === "text" ? C.ink700 : C.ink;
        if (isNumeric(column) || column.numericLook) page.right(x + column.w - 5, base, text, { size, color });
        else page.text(x + 5, base, text, { size, bold: Boolean(column.main), color });
      }
      x += column.w;
    }
    top += rowH;
  });
  page.line(M, top, M + width, top, C.ink200, 0.6);
  return page;
}

/* ══════════════════════════════════════════════════════════════ the file */

function pdfDate(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `D:${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`;
}

/** A text string for the document's own properties, which may carry any character. */
function textString(value) {
  const units = [0xfe, 0xff];
  for (const ch of String(value ?? "")) {
    const code = ch.codePointAt(0);
    if (code > 0xffff) {
      const v = code - 0x10000;
      const hi = 0xd800 + (v >> 10);
      const lo = 0xdc00 + (v & 0x3ff);
      units.push(hi >> 8, hi & 255, lo >> 8, lo & 255);
    } else units.push(code >> 8, code & 255);
  }
  return `<${hex(units)}>`;
}

function serialise(finished, { title, subject, madeAt, outline = [] }) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };

  const catalog = add(null);
  const tree = add(null);
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const f3 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>");
  const resources = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R /F3 ${f3} 0 R >> >>`;

  const kids = [];
  for (const one of finished) {
    const content = add({ stream: one.bytes, dict: `<< /Length ${one.bytes.length} /Filter /FlateDecode >>` });
    kids.push(
      add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${one.width.toFixed(2)} ${one.height.toFixed(2)}] /Resources ${resources} /Contents ${content} 0 R >>`)
    );
  }

  /* ── BOOKMARKS ───────────────────────────────────────────────────────────
     A document of four thousand pages is read from its sidebar: the brief,
     then each table, each a click from its first page. */
  let outlines = null;
  const marks = outline.filter((entry) => entry.page >= 1 && entry.page <= kids.length);
  /* One level of bookmarks under its parent; a table's own groups hang under
     it, folded, so the sidebar opens as a short list. */
  const level = (entries, parent) => {
    const ids = entries.map(() => add(null));
    entries.forEach((entry, index) => {
      const children = (entry.children ?? []).filter((child) => child.page >= 1 && child.page <= kids.length);
      const inner = children.length ? level(children, ids[index]) : null;
      objects[ids[index] - 1] =
        `<< /Title ${textString(entry.title)} /Parent ${parent} 0 R` +
        (index > 0 ? ` /Prev ${ids[index - 1]} 0 R` : "") +
        (index < ids.length - 1 ? ` /Next ${ids[index + 1]} 0 R` : "") +
        (inner ? ` /First ${inner[0]} 0 R /Last ${inner[inner.length - 1]} 0 R /Count -${inner.length}` : "") +
        ` /Dest [${kids[entry.page - 1]} 0 R /Fit] >>`;
    });
    return ids;
  };
  if (marks.length) {
    outlines = add(null);
    const ids = level(marks, outlines);
    objects[outlines - 1] = `<< /Type /Outlines /First ${ids[0]} 0 R /Last ${ids[ids.length - 1]} 0 R /Count ${ids.length} >>`;
  }

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R${outlines ? ` /Outlines ${outlines} 0 R /PageMode /UseOutlines` : ""} /ViewerPreferences << /DisplayDocTitle true >> >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(
    `<< /Title ${textString(title)} /Subject ${textString(subject)} /Author (Poll360) /Creator (Ask Poll360) /Producer (Poll360 · Powered by ${POWERED_BY}) /CreationDate (${pdfDate(madeAt)}) >>`
  );

  const head = latin1("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const chunks = [head];
  const offsets = [];
  let length = head.length;
  objects.forEach((body, index) => {
    offsets.push(length);
    if (body && typeof body === "object") {
      const open = latin1(`${index + 1} 0 obj\n${body.dict}\nstream\n`);
      const close = latin1("\nendstream\nendobj\n");
      chunks.push(open, body.stream, close);
      length += open.length + body.stream.length + close.length;
    } else {
      const part = latin1(`${index + 1} 0 obj\n${body}\nendobj\n`);
      chunks.push(part);
      length += part.length;
    }
  });

  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(latin1(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`));
  return chunks;
}
