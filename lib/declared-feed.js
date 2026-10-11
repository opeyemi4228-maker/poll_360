import { createHash } from "node:crypto";

import { parseDeclared, summarise } from "./declared.js";

/**
 * Declared figures, fetched without anybody pressing anything.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT "AUTOMATIC" CAN HONESTLY MEAN HERE
 *
 *  The commission publishes no table of declared totals: it reads them aloud
 *  at collation centres and posts photographs of sheets. So there is nothing
 *  of INEC's own to connect to, and nothing here pretends there is.
 *
 *  What does exist on every election night is a sheet somebody is keeping: a
 *  collation desk, a newsroom, an observer group, typing each announcement
 *  into a shared spreadsheet as it is read out. That sheet has an address.
 *  Given the address, this reads it every few minutes and files whatever has
 *  changed, so the person at the centre types a figure once, where they
 *  already are, and every Poll360 screen has it without a second upload.
 *
 *  ── IT IS THE SAME DOOR AS THE UPLOAD ────────────────────────────────────
 *  What is fetched goes through `parseDeclared`, the reader the upload uses,
 *  and into the same store. One set of rules about what a valid row is. The
 *  only differences are who is recorded as the source and that nobody was
 *  watching, which is why a reading that cannot be understood changes
 *  nothing: a sheet somebody has half-edited must not empty the comparison.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Four megabytes, the same ceiling the upload has. */
const MAX = 4_000_000;
const TIMEOUT_MS = 12_000;

/** How long an address is left alone between readings. */
export const EVERY_SECONDS = 120;

/**
 * The address to fetch, from whatever was pasted in.
 *
 * ── A SHARED SPREADSHEET'S LINK IS NOT ITS DATA ────────────────────────────
 * What somebody copies out of a browser is the link to the editing screen. The
 * figures are at a different address on the same sheet, and expecting a person
 * at a collation centre to know that is how this feature would go unused. So
 * the link people actually have is turned into the one that returns the cells.
 *
 * ── AND IT MUST BE SOMEWHERE ON THE PUBLIC INTERNET ────────────────────────
 * This runs on the server, so an address is a request the server makes. One
 * that names the machine itself or a private network is refused: the feature
 * reads published sheets, and must not be a way to ask the server to look at
 * things only it can reach.
 */
export function addressOf(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return { error: "Paste the link to the sheet." };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: "That is not a link. It should start with https://" };
  }
  if (url.protocol !== "https:") return { error: "The link must start with https://" };
  if (url.username || url.password) return { error: "The link must not carry a sign-in." };

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const closed =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    host.includes(":") ||
    /^\d+(\.\d+){3}$/.test(host) ||
    /^\d+$/.test(host);
  if (closed) return { error: "That link is not on the public internet, so it cannot be read from here." };

  const sheet = url.hostname === "docs.google.com" && url.pathname.match(/^\/spreadsheets\/d\/(e\/)?([\w-]+)/);
  if (sheet) {
    const tab = (url.hash.match(/gid=(\d+)/) ?? url.search.match(/gid=(\d+)/))?.[1];
    /* A sheet "published to the web" has its own form of address. */
    if (sheet[1]) {
      return { address: `https://docs.google.com/spreadsheets/d/e/${sheet[2]}/pub?output=csv${tab ? `&gid=${tab}` : ""}` };
    }
    return { address: `https://docs.google.com/spreadsheets/d/${sheet[2]}/export?format=csv${tab ? `&gid=${tab}` : ""}` };
  }

  return { address: url.toString() };
}

const fingerprintOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * Read one address once.
 *
 * Never throws and never saves: it returns what it found and the caller
 * decides. `status` is one of
 *
 *   CHANGED      rows to file, and the fingerprint to remember
 *   SAME         the sheet has not changed since the fingerprint given
 *   UNREADABLE   it answered, and nothing in it is a declared figure
 *   UNREACHABLE  it did not answer, or answered with a refusal
 */
export async function readSource({ address, fingerprint = null, fetchImpl = fetch }) {
  let text;
  try {
    /* Redirects are followed by hand, so each place the sheet sends us is
       held to the same rule as the address that was given. A shared sheet
       does redirect, to wherever its cells are served from. */
    let answer;
    let next = address;
    for (let hop = 0; hop < 5; hop += 1) {
      answer = await fetchImpl(next, {
        headers: { accept: "text/csv, text/plain, */*" },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const onward = answer.status >= 300 && answer.status < 400 ? answer.headers.get("location") : null;
      if (!onward) break;
      const allowed = addressOf(new URL(onward, next).toString());
      if (allowed.error) return { status: "UNREACHABLE", said: "The sheet sent us somewhere that cannot be read from here." };
      next = allowed.address;
    }
    if (!answer.ok) {
      return {
        status: "UNREACHABLE",
        said:
          answer.status === 401 || answer.status === 403
            ? "The sheet is not shared publicly. Set it so anyone with the link can view it."
            : `The sheet's address answered ${answer.status}.`,
      };
    }
    text = await answer.text();
  } catch {
    return { status: "UNREACHABLE", said: "The sheet could not be reached." };
  }

  if (text.length > MAX) return { status: "UNREADABLE", said: "The sheet is too large to read." };
  /* A sheet that is not shared answers with a sign-in page, not a refusal. */
  if (/^\s*<(!doctype|html)/i.test(text)) {
    return { status: "UNREADABLE", said: "That link opens a web page, not the figures. Share the sheet so anyone with the link can view it." };
  }

  const print = fingerprintOf(text);
  if (fingerprint && print === fingerprint) return { status: "SAME", said: "No change since the last reading." };

  const { rows, problems } = parseDeclared(text);
  if (!rows.length) {
    return {
      status: "UNREADABLE",
      said: problems[0] ? `${problems[0].says} ${problems[0].why}` : "Nothing in the sheet could be read as a declared figure.",
    };
  }

  return { status: "CHANGED", rows, problems, fingerprint: print, totals: summarise(rows) };
}

/**
 * Read one source and file what changed.
 *
 * `store` is `{ declared, declaredSources }` from lib/db.js, passed in so this
 * can be tested without a database.
 *
 * ── AN UNREADABLE SHEET REMOVES NOTHING ────────────────────────────────────
 * Figures already filed stay exactly as they are when a reading fails or
 * comes back empty. A place that disappears from the sheet also stays: taking
 * a declared figure away is a decision, and it is made by a person on the
 * screen, not inferred from a row somebody may have deleted by accident.
 */
export async function pull(source, store, { fetchImpl = fetch } = {}) {
  const found = await readSource({ address: source.address, fingerprint: source.fingerprint, fetchImpl });

  if (found.status !== "CHANGED") {
    await store.declaredSources.record({ electionId: source.electionId, race: source.race, said: found.said });
    return { status: found.status, said: found.said, written: 0 };
  }

  const { written } = await store.declared.save({
    electionId: source.electionId,
    race: source.race,
    rows: found.rows,
    enteredBy: source.addedBy,
    source: "FETCHED",
    note: `Fetched from ${new URL(source.address).hostname}`,
  });

  const skipped = found.problems.length;
  const said =
    `${written} place${written === 1 ? "" : "s"} read` +
    (skipped ? `, ${skipped} line${skipped === 1 ? "" : "s"} could not be read.` : ".");

  await store.declaredSources.record({
    electionId: source.electionId,
    race: source.race,
    said,
    fingerprint: found.fingerprint,
    places: written,
  });

  return { status: "CHANGED", said, written, totals: found.totals, problems: found.problems };
}

/** Every address that is due a reading, read. One failing does not stop the rest. */
export async function pullDue(store, { fetchImpl = fetch, seconds = EVERY_SECONDS } = {}) {
  const due = await store.declaredSources.due(seconds);
  const went = await Promise.all(
    due.map((source) =>
      pull(source, store, { fetchImpl }).catch(() => ({ status: "UNREACHABLE", written: 0 }))
    )
  );
  return {
    read: went.length,
    changed: went.filter((row) => row.status === "CHANGED").length,
    written: went.reduce((sum, row) => sum + row.written, 0),
  };
}
