import { run } from "./engine.js";
import { PROVENANCE } from "./write.js";

/**
 * Every row of an answer, a page at a time.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY AN ANSWER'S TABLES ARE PAGED FROM HERE
 *
 *  An answer can hold every polling unit in the country — 176,623 rows. That
 *  cannot travel in one response, and it should not have to: the screen shows
 *  a hundred at a time, and a file is assembled in the browser from pages. So
 *  the answer carries its first rows, and everything after them is read from
 *  here: any page, any search across every row, any column sorted — always
 *  worked out again from the sealed plan, inside the ground the account holds
 *  now, never taken from the browser.
 *
 *  The work is held for a few minutes per account and answer, so turning the
 *  pages of a national polling-unit list costs one computation, not one per
 *  page.
 * ══════════════════════════════════════════════════════════════════════════
 */

const TTL_MS = 10 * 60 * 1000;
const HELD = 12;
const held = new Map();

/** The sections of an answer, worked out once and held briefly. */
export async function sectionsOf(plans, territory, key) {
  const now = Date.now();
  for (const [name, entry] of held) if (entry.at + TTL_MS < now) held.delete(name);
  if (held.has(key)) return held.get(key).sections;

  const results = [];
  for (const plan of plans.slice(0, 4)) results.push(await run({ ...plan, limit: plan.limit ?? null }, { territory }));
  const sections = results.flatMap((result) =>
    result.sections.map((section) => ({ ...section, provenanceLabel: PROVENANCE[section.provenance] ?? PROVENANCE.counted }))
  );
  held.set(key, { at: now, sections });
  while (held.size > HELD) held.delete(held.keys().next().value);
  return sections;
}

const TEXT_KEYS = ["name", "code", "ward", "lga", "state", "zone", "status_label", "why", "party", "winner"];

/** One page of one section: searched across every row, sorted on any column. */
export function pageOf(section, { offset = 0, limit = 100, query = "", sort = null } = {}) {
  let rows = section.rows;
  const q = String(query ?? "").trim().toLowerCase();
  if (q) {
    rows = rows.filter((row) => TEXT_KEYS.some((key) => row[key] !== null && row[key] !== undefined && String(row[key]).toLowerCase().includes(q)));
  }
  if (sort?.key && section.columns.some((column) => column.key === sort.key)) {
    const column = section.columns.find((entry) => entry.key === sort.key);
    const pick = (row) => (column.kind === "status" ? row.status_label : row[sort.key]);
    const dir = sort.dir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      const x = pick(a);
      const y = pick(b);
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }
  const start = Math.max(0, Math.floor(offset));
  const size = Math.max(1, Math.min(10000, Math.floor(limit)));
  return { rows: rows.slice(start, start + size), total: section.rows.length, matched: rows.length, offset: start };
}
