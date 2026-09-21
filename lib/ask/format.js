/**
 * How Ask Poll360 prints a figure, in one place.
 *
 * The answer card, the PDF, the CSV and the XML all read a cell through here,
 * so "25.3%" on the screen is "25.3%" in the brief somebody prints and the
 * same number, unrounded, in the file somebody sorts. Imports nothing, so it
 * runs in the browser and on the server alike.
 */

const INT = new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 });

export function fmtInt(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return INT.format(Math.round(Number(value)));
}

export function fmtPct(value, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  return `${Number(value).toFixed(digits)}%`;
}

/** A change in points, always signed so a fall is never read as a rise. */
export function fmtPts(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  const sign = n > 0.05 ? "+" : n < -0.05 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(1)} pts`;
}

/** Where a place stands against the line the question drew. */
export const STATUS = {
  held: { tone: "held", rank: 0 },
  cleared: { tone: "cleared", rank: 1 },
  slipped: { tone: "slipped", rank: 2 },
  reach: { tone: "reach", rank: 3 },
  beyond: { tone: "beyond", rank: 4 },
  unknown: { tone: "unknown", rank: 5 },
};

/** Tones as brand colours, for the PDF. The screen uses the same names as classes. */
export const TONE_HEX = {
  held: "#2943c5", // royal blue: cleared every time
  cleared: "#3d5fe3",
  slipped: "#95b1fe",
  reach: "#ec7c0e", // flagged: wants a look, and here, work
  beyond: "#c5c7cd",
  unknown: "#dee0e4",
};

export const TIER_LABEL = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
  TERTIARY: "Tertiary",
};

/** One cell as text a person reads. */
export function fmtCell(column, row) {
  const value = row[column.key];
  switch (column.kind) {
    case "int":
      return fmtInt(value);
    case "pct":
    case "bar":
      return fmtPct(value);
    case "pts":
      return fmtPts(value);
    case "gap":
      return value === null || value === undefined || !Number.isFinite(Number(value)) ? "—" : `${Number(value).toFixed(1)} pts`;
    case "status":
      return row.status_label ?? "—";
    case "bool":
      return value === null || value === undefined ? "—" : value ? "Yes" : "No";
    case "tier":
      return value ? TIER_LABEL[value] ?? value : "—";
    case "score":
      return value === null || value === undefined ? "—" : `${Math.round(value)}`;
    default:
      return value === null || value === undefined || value === "" ? "—" : String(value);
  }
}

/** One cell as a value a spreadsheet sorts: numbers stay numbers. */
export function rawCell(column, row) {
  const value = row[column.key];
  if (column.kind === "status") return row.status_label ?? "";
  if (column.kind === "bool") return value === null || value === undefined ? "" : value ? "yes" : "no";
  if (column.kind === "tier") return value ? TIER_LABEL[value] ?? value : "";
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (column.kind === "int") return Math.round(value);
    return Math.round(value * 100) / 100;
  }
  return value;
}

export const isNumeric = (column) => ["int", "pct", "bar", "pts", "gap", "score"].includes(column.kind);

/** A file name that says what it holds and sorts by when. */
export function fileStem(question, when = new Date()) {
  const slug = String(question ?? "answer")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "");
  const day = when.toISOString().slice(0, 10);
  return `poll360-ask-${slug || "answer"}-${day}`;
}

/** What each level is called, one and many. */
export const LEVEL_WORDS = {
  zone: { one: "zone", many: "zones", title: "Zones" },
  state: { one: "state", many: "states", title: "States" },
  district: { one: "senatorial district", many: "senatorial districts", title: "Senatorial districts" },
  constituency: {
    one: "federal constituency",
    many: "federal constituencies",
    title: "Federal constituencies",
  },
  lga: { one: "local government", many: "local governments", title: "Local governments" },
  ward: { one: "ward", many: "wards", title: "Wards" },
  unit: { one: "polling unit", many: "polling units", title: "Polling units" },
};

/** "1 state", "3 states". */
export function count(n, level) {
  const words = LEVEL_WORDS[level] ?? { one: level, many: `${level}s` };
  return `${fmtInt(n)} ${n === 1 ? words.one : words.many}`;
}

/** "Adamawa, Bauchi and Gombe", with a tail when the list is long. */
export function listOf(names, max = 6) {
  const list = names.filter(Boolean);
  if (!list.length) return "";
  if (list.length === 1) return list[0];
  if (list.length <= max) return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `${list.slice(0, max).join(", ")} and ${fmtInt(list.length - max)} more`;
}
