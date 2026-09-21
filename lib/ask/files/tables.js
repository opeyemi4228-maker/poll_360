import { toCsv } from "../../csv.js";
import { LEVEL_WORDS, rawCell } from "../format.js";

/**
 * The CSV and the XML of an Ask Poll360 answer.
 *
 * ── THE CSV IS ONE TABLE ───────────────────────────────────────────────────
 * An answer about states, local governments, wards and polling units is four
 * tables, and a spreadsheet opens one. So they are stacked, each row saying
 * its level, with the place columns every level shares first and each
 * measure once. Filtering the Level column gives any one of them back, and
 * nothing a person sorts on is a formatted string: shares are numbers, votes
 * are whole numbers, and the basis of every row is in a column of its own.
 *
 * ── THE XML SAYS WHAT IT IS ────────────────────────────────────────────────
 * Written for a system to read, so it carries the question, the answer, the
 * method and the basis beside the rows, and every column is declared with its
 * unit before it is used. A reader never has to guess what "share" means.
 */

const PLACE_KEYS = ["code", "name", "ward", "lga", "state", "zone"];

/* ── A CELL IS NEVER A FORMULA ─────────────────────────────────────────────
   Ward and polling unit names in the party register were typed by members.
   A name that begins "=" or "+" is a formula to Excel, and a formula in a
   file somebody opens is a way into their machine. Text that starts that way
   is written with a leading apostrophe; numbers are left alone. */
const FORMULA = /^[=+\-@\t\r]/;
const safe = (value) => (typeof value === "string" && FORMULA.test(value) ? `'${value}` : value);

export function briefCsv({ sections }) {
  const order = [];
  const seen = new Map();
  for (const section of sections) {
    for (const column of section.columns) {
      if (column.key === "rank" || seen.has(column.key)) continue;
      seen.set(column.key, column);
      order.push(column);
    }
  }
  const place = PLACE_KEYS.map((key) => seen.get(key)).filter(Boolean);
  const measures = order.filter((column) => !PLACE_KEYS.includes(column.key));

  const rows = sections.flatMap((section) =>
    section.rows.map((row) => ({ ...row, __level: LEVEL_WORDS[section.level]?.one ?? section.level, __basis: section.provenanceLabel.label, __title: section.title }))
  );

  return toCsv(rows, [
    ["Level", (row) => row.__level],
    ["Rank", (row) => row.rank],
    ...place.map((column) => [column.key === "name" ? "Place" : column.label, (row) => safe(rawCell(column, row))]),
    ...measures.map((column) => [labelWithUnit(column), (row) => safe(rawCell(column, row))]),
    ["Basis", (row) => row.__basis],
    ["Table", (row) => safe(row.__title)],
  ]);
}

function labelWithUnit(column) {
  if (column.kind === "pct" || column.kind === "bar") return `${column.label} (%)`;
  if (column.kind === "pts" || column.kind === "gap") return `${column.label} (points)`;
  return column.label;
}

/* ══════════════════════════════════════════════════════════════ xml */

const esc = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");

const tag = (key) => key.replace(/_/g, "-");

const UNIT = { int: "count", pct: "percent", bar: "percent", pts: "points", gap: "points", score: "score-out-of-100", bool: "yes-no", status: "text", tier: "text", text: "text" };

export function briefXml({ payload, sections, understood, scopeName, madeAt = new Date() }) {
  const lines = [];
  const out = (depth, text) => lines.push(`${"  ".repeat(depth)}${text}`);

  out(0, '<?xml version="1.0" encoding="UTF-8"?>');
  out(0, "<!--");
  out(0, "  Poll360 · Ask Poll360 brief");
  out(0, "  From the booth to the broadcast. Every figure worked out from the record.");
  out(0, "  Declared results are INEC's. Figures below the state are Poll360's estimates, marked basis=\"estimated\".");
  out(0, "-->");
  out(
    0,
    `<poll360-brief xmlns="https://poll360.ng/schema/ask/1" version="1" reference="${esc(String(payload.id).slice(0, 8).toUpperCase())}" id="${esc(payload.id)}" asked="${esc(payload.askedAt)}" generated="${esc(madeAt.toISOString())}" answered-by="${payload.engine === "model" ? "poll360-with-model-checked" : "poll360"}">`
  );
  out(1, `<question>${esc(payload.question)}</question>`);
  out(1, `<ground>${esc(scopeName)}</ground>`);
  out(1, "<understood>");
  for (const chip of understood) out(2, `<term name="${esc(chip.label)}">${esc(chip.value)}</term>`);
  out(1, "</understood>");

  out(1, "<answer>");
  out(2, `<headline>${esc(payload.answer.headline)}</headline>`);
  out(2, "<reading>");
  for (const item of payload.answer.reading ?? []) out(3, `<finding>${esc(item)}</finding>`);
  out(2, "</reading>");
  out(2, "<plan>");
  (payload.answer.plan ?? []).forEach((item, index) => out(3, `<step n="${index + 1}">${esc(item)}</step>`));
  out(2, "</plan>");
  out(2, "<method>");
  for (const item of payload.answer.method ?? []) out(3, `<note>${esc(item)}</note>`);
  out(2, "</method>");
  out(1, "</answer>");

  out(1, "<tables>");
  sections.forEach((section, index) => {
    const basis = section.provenance.startsWith("estimated") ? "estimated" : section.provenance;
    out(
      2,
      `<table n="${index + 1}" level="${esc(section.level)}" basis="${esc(basis)}" rows="${section.rows.length}" total="${section.total}"${section.rows.length < section.total ? ' truncated="true"' : ""}>`
    );
    out(3, `<title>${esc(section.title)}</title>`);
    out(3, `<basis-note>${esc(section.provenanceLabel.note)}</basis-note>`);
    if (section.tiles?.length) {
      out(3, "<summary>");
      for (const tile of section.tiles) out(4, `<figure label="${esc(tile.label)}" note="${esc(tile.sub ?? "")}">${esc(tile.value)}</figure>`);
      out(3, "</summary>");
    }
    const columns = section.columns.filter((column) => column.key !== "rank");
    out(3, "<columns>");
    for (const column of columns) out(4, `<column key="${tag(column.key)}" unit="${UNIT[column.kind] ?? "text"}">${esc(column.label)}</column>`);
    out(3, "</columns>");
    out(3, "<rows>");
    for (const row of section.rows) {
      const cells = columns
        .map((column) => {
          const value = rawCell(column, row);
          if (value === "" || value === null || value === undefined) return null;
          return `<${tag(column.key)}${column.kind === "status" ? ` status="${esc(row.status)}"` : ""}>${esc(value)}</${tag(column.key)}>`;
        })
        .filter(Boolean)
        .join("");
      out(4, `<row rank="${row.rank}"${row.key ? ` key="${esc(row.key)}"` : ""}>${cells}</row>`);
    }
    out(3, "</rows>");
    out(2, "</table>");
  });
  out(1, "</tables>");
  out(0, "</poll360-brief>");
  return `${lines.join("\n")}\n`;
}
