import { deflateSync } from "node:zlib";

import { LEVEL_WORDS, TONE_HEX, fmtCell, fmtInt, isNumeric } from "../format.js";

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
  if (widthOf(value, bold, size) <= max) return value;
  let out = value;
  while (out.length > 1 && widthOf(`${out}…`, bold, size) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
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
/* A brief, not a register: the printed table stops here, and the CSV and XML
   carry the rest. */
export const PDF_ROWS = 400;

export function briefPdf({ payload, sections, understood, scopeName, madeAt = new Date() }) {
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

  if (sections.length) {
    label("In the tables that follow");
    for (const section of sections) {
      room(15);
      const shown = Math.min(section.rows.length, PDF_ROWS);
      page.rect(M, top - 1, 3, 11, C.navy);
      page.text(M + 10, top + 7.5, clip(section.title, true, 9, W - 150), { size: 9, bold: true, color: C.ink });
      page.right(M + W, top + 7.5, `${fmtInt(shown)} of ${fmtInt(section.total)} rows · ${section.provenanceLabel.label}`, { size: 8, color: C.ink500 });
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

  /* ── THE TABLES ─────────────────────────────────────────────────────── */
  for (const section of sections) {
    tablePages(section, pages, ref);
  }

  /* ── THE FOOT OF EVERY PAGE ─────────────────────────────────────────── */
  pages.forEach((one, index) => {
    const m = one.width > one.height ? 32 : 44;
    const foot = one.height - 34;
    one.line(m, foot - 10, one.width - m, foot - 10, C.ink200, 0.6);
    one.text(m, foot, `Poll360  ·  Ask Poll360 brief  ·  Ref. ${ref}`, { size: 7, bold: true, color: C.ink500 });
    one.right(one.width - m, foot, `Page ${index + 1} of ${pages.length}`, { size: 7, color: C.ink500 });
    one.text(
      m,
      foot + 11,
      "Poll360 is not the electoral commission. Declared results are INEC's; figures below the state are Poll360's estimates and are marked so.",
      { size: 6.3, italic: true, color: C.ink500 }
    );
  });

  return serialise(pages, {
    title: `Ask Poll360: ${payload.question}`,
    subject: payload.answer.headline,
    madeAt,
  });
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

function tablePages(section, pages, ref) {
  const [W, H] = LANDSCAPE;
  const M = 32;
  const width = W - M * 2;
  const size = 7.4;
  const rowH = 15;
  const rows = section.rows.slice(0, PDF_ROWS);

  /* Each column as wide as its widest cell among the first rows, within limits. */
  let columns = section.columns.map((column) => {
    const sample = rows.slice(0, 250);
    const head = widthOf(column.label, true, size) + 12;
    let body = 0;
    for (const row of sample) body = Math.max(body, widthOf(fmtCell(column, row), column.main, size));
    if (column.kind === "bar") body += 44;
    if (column.kind === "status") body += 12;
    const cap = column.main ? 190 : column.kind === "text" ? 130 : 110;
    return { ...column, w: Math.min(cap, Math.max(head, body + 12)) };
  });
  for (const key of DROP_ORDER) {
    if (columns.reduce((sum, column) => sum + column.w, 0) <= width) break;
    if (columns.length > 4) columns = columns.filter((column) => column.key !== key);
  }
  const natural = columns.reduce((sum, column) => sum + column.w, 0);
  const scale = width / natural;
  columns = columns.map((column) => ({ ...column, w: column.w * scale }));

  let page = null;
  let top = 0;
  let index = 0;

  const start = () => {
    page = new Page(W, H);
    pages.push(page);
    slimHeader(page, LEVEL_WORDS[section.level]?.title ?? "Table");
    page.text(M, 70, clip(section.title, true, 12.5, width - 200), { size: 12.5, bold: true, color: C.navy });
    const basis = `${section.provenanceLabel.label}: ${section.provenanceLabel.note}`;
    page.right(W - M, 70, basis, { size: 7.5, color: C.ink500 });
    const shown = rows.length < section.total ? `The first ${fmtInt(rows.length)} of ${fmtInt(section.total)} rows. The CSV and XML carry the rest.` : `${fmtInt(section.total)} rows.`;
    page.text(M, 83, shown, { size: 7.5, color: C.ink500 });

    top = 94;
    page.rect(M, top, width, 18, C.navy);
    let cx = M;
    for (const column of columns) {
      const labelText = clip(column.label, true, size, column.w - 10);
      if (isNumeric(column)) page.right(cx + column.w - 5, top + 12, labelText, { size, bold: true, color: C.white });
      else page.text(cx + 5, top + 12, labelText, { size, bold: true, color: C.white });
      cx += column.w;
    }
    top += 18;
  };

  start();
  for (const row of rows) {
    if (top + rowH > H - 58) start();
    if (index % 2 === 1) page.rect(M, top, width, rowH, C.ink50);
    let cx = M;
    for (const column of columns) {
      const base = top + 10.3;
      if (column.kind === "status") {
        page.rect(cx + 5, top + 4.5, 6, 6, TONE_HEX[row.status] ?? C.ink200);
        page.text(cx + 15, base, clip(row.status_label ?? "—", false, size, column.w - 20), { size, color: C.ink });
      } else if (column.kind === "bar") {
        const value = row[column.key];
        const text = fmtCell(column, row);
        page.right(cx + column.w - 5, base, text, { size, bold: true, color: C.ink });
        if (value !== null && value !== undefined) {
          const bw = 36;
          const bx = cx + 5;
          page.rect(bx, top + 6, bw, 3.5, C.ink100);
          const clear = column.threshold === null || column.threshold === undefined || value >= column.threshold;
          page.rect(bx, top + 6, (bw * Math.max(0, Math.min(100, value))) / 100, 3.5, clear ? C.royal : C.ink300);
          if (column.threshold !== null && column.threshold !== undefined) {
            page.rect(bx + (bw * column.threshold) / 100 - 0.4, top + 4.5, 0.9, 6.5, C.red);
          }
        }
      } else {
        const text = clip(fmtCell(column, row), Boolean(column.main), size, column.w - 10);
        const color = column.main ? C.ink : column.kind === "text" ? C.ink700 : C.ink;
        if (isNumeric(column) || column.numericLook) page.right(cx + column.w - 5, base, text, { size, color });
        else page.text(cx + 5, base, text, { size, bold: Boolean(column.main), color });
      }
      cx += column.w;
    }
    top += rowH;
    index += 1;
  }
  page.line(M, top, M + width, top, C.ink200, 0.6);
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

function serialise(pages, { title, subject, madeAt }) {
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
  for (const page of pages) {
    const stream = deflateSync(Buffer.from(page.ops.join("\n"), "latin1"));
    const content = add({ stream, dict: `<< /Length ${stream.length} /Filter /FlateDecode >>` });
    kids.push(
      add(
        `<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${page.width.toFixed(2)} ${page.height.toFixed(2)}] /Resources ${resources} /Contents ${content} 0 R >>`
      )
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R /ViewerPreferences << /DisplayDocTitle true >> >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(
    `<< /Title ${textString(title)} /Subject ${textString(subject)} /Author (Poll360) /Creator (Ask Poll360) /Producer (Poll360) /CreationDate (${pdfDate(madeAt)}) >>`
  );

  const chunks = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets = [];
  let length = chunks[0].length;
  objects.forEach((body, index) => {
    offsets.push(length);
    let part;
    if (body && typeof body === "object") {
      part = Buffer.concat([
        Buffer.from(`${index + 1} 0 obj\n${body.dict}\nstream\n`, "latin1"),
        body.stream,
        Buffer.from("\nendstream\nendobj\n", "latin1"),
      ]);
    } else {
      part = Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1");
    }
    chunks.push(part);
    length += part.length;
  });

  const xref = [`xref\n0 ${objects.length + 1}\n`, "0000000000 65535 f \n", ...offsets.map((at) => `${String(at).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${length}\n%%EOF\n`, "latin1"));
  return Buffer.concat(chunks);
}
