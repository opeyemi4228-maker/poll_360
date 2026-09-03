/**
 * Lists that leave the building.
 *
 * ── WHY EVERY WORKING SCREEN NEEDS THIS ────────────────────────────────────
 * A campaign runs on phones and printouts. The chase list is worked by four
 * people with handsets, the incident log is read by somebody who is not in
 * front of this screen, and the coverage plan is argued over by whoever signs
 * for the agents. None of those people are looking at a dashboard, so every
 * list this product builds has to be able to become a file.
 *
 * ── THE ESCAPING IS THE WHOLE JOB ──────────────────────────────────────────
 * Nigerian place names contain commas (Ile Oluji/Oke Igbo is fine, but "Aba
 * North, Abia" is a cell), names contain apostrophes and quotes, and an
 * incident note contains newlines and whatever somebody typed at 2am. A CSV
 * writer that forgets any of those produces a file that opens misaligned, and
 * a misaligned chase list means somebody rings the wrong number.
 */

/** One cell, quoted whenever quoting is what keeps it one cell. */
export function cell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  /* Quote if it contains anything that would otherwise split or break the
     row, and double any quote inside it, which is how CSV escapes a quote. */
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A table as CSV text.
 *
 * `columns` is [[header, pick]] rather than an object, because the order of
 * the columns is part of the file and an object's key order is not something
 * to rely on for something somebody prints.
 */
export function toCsv(rows, columns) {
  const lines = [columns.map(([header]) => cell(header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map(([, pick]) => cell(pick(row))).join(","));
  }
  /* CRLF and a BOM, because these files are opened in Excel on a Windows
     laptop more often than anywhere else, and without the BOM every accented
     or Naira-signed cell arrives as mojibake. */
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Hand a file to the browser. No-op on the server. */
export function download(name, text, type = "text/csv") {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** A filename that sorts by when it was made and says what it holds. */
export function stamped(what) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return `poll360-${what}-${day}-${time}.csv`;
}
