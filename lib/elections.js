import { randomUUID } from "node:crypto";

import { prepare } from "./sql.js";

/**
 * Election projects.
 *
 * ── WHY A PROJECT AND NOT A RESET ──────────────────────────────────────────
 * A room runs the presidential in February and the governorship in March, and
 * the second one must start empty without the first one ceasing to exist.
 * "Clear the data" is the wrong shape for that: it is irreversible, it throws
 * away the thing the whole product exists to preserve, and it makes the two
 * nights impossible to compare afterwards.
 *
 * So nothing is ever cleared. Every result, incident, ledger entry and
 * discovered unit carries the id of the election it belongs to, and switching
 * project changes which of them you are looking at. A new project is empty
 * because nothing has been filed against it yet, not because anything was
 * deleted.
 *
 * ── AND WHY A TITLE IS REQUIRED BEFORE ANYTHING ELSE ───────────────────────
 * An untitled project is one nobody can identify three elections later, and
 * the moment there is more than one, "the other one" stops being an answer.
 * The title is the first thing asked for and the create call refuses without
 * it.
 *
 * ── WHY THE COOKIE LIVES NEXT DOOR ─────────────────────────────────────────
 * Which project a browser is looking at is read from a cookie, and `cookies()`
 * comes from next/headers, which cannot be reached from a client component.
 * This module is imported by the switcher's server action, and that action is
 * imported by the switcher, which is a client component — so a next/headers
 * import here is dragged into the browser bundle and the build refuses it.
 * Everything cookie-shaped is in lib/election-scope.js instead.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** Readable, stable, and safe in a URL. */
function slugify(title) {
  const base = String(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "election";
}

export const elections = {
  /** Newest first, with the live one at the top of whatever a room is running. */
  async list() {
    return shapeAll(
      await prepare(
        `SELECT * FROM elections ORDER BY
           CASE status WHEN 'ACTIVE' THEN 0 WHEN 'DRAFT' THEN 1 ELSE 2 END,
           created_at DESC`
      ).all()
    );
  },

  /**
   * The project a headless caller should file into.
   *
   * ── WHY THIS EXISTS BESIDE `currentElection` ───────────────────────────
   * A dashboard knows which project you are looking at because your browser
   * carries a cookie saying so. A WhatsApp webhook has no browser and no
   * reader: a message simply arrives. It belongs to whatever election the
   * organisation is actually running, which is the newest active one, and if
   * none is active there is nothing sensible to file into and the caller must
   * say so rather than guessing at a closed project.
   */
  async active() {
    const row = await prepare(
      "SELECT * FROM elections WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1"
    ).get();
    return shape(row);
  },

  async get(id) {
    if (!id) return null;
    return shape(await prepare("SELECT * FROM elections WHERE id = ?").get(id));
  },

  /**
   * Start a project.
   *
   * The title is checked here rather than only in the form, because a server
   * action is a public endpoint and "the form requires it" is not a rule, it is
   * a suggestion to whoever is using the form.
   */
  async create({ title, kind = "PRESIDENTIAL", votesOn = null, note = null, createdBy = null }) {
    const clean = String(title ?? "").trim();
    if (!clean) throw new Error("An election project needs a title before it can start.");
    if (clean.length > 120) throw new Error("That title is too long — 120 characters at most.");

    const id = `elec_${randomUUID().slice(0, 12)}`;
    let slug = slugify(clean);

    /* Two projects may legitimately be called the same thing in different
       years, so a clash suffixes rather than refuses. */
    const taken = await prepare("SELECT slug FROM elections WHERE slug LIKE ?").all(`${slug}%`);
    if (taken.some((row) => row.slug === slug)) slug = `${slug}-${taken.length + 1}`;

    await prepare(
      `INSERT INTO elections (id, title, slug, kind, votes_on, status, is_demo, note, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', false, ?, ?, now())`
    ).run(id, clean, slug, kind, votesOn, note, createdBy);

    return { id, title: clean, slug, kind, status: "ACTIVE", isDemo: false };
  },

  async close(id) {
    await prepare("UPDATE elections SET status = 'CLOSED', closed_at = now() WHERE id = ?").run(id);
  },

};

/* -------------------------------------------------------------------------- */

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    kind: row.kind,
    votesOn: row.votes_on ? new Date(row.votes_on) : null,
    status: row.status,
    isDemo: row.is_demo === true || row.is_demo === 1,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    closedAt: row.closed_at ? new Date(row.closed_at) : null,
  };
}

const shapeAll = (rows) => rows.map(shape);
