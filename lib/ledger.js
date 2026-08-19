import { createHash, randomUUID } from "node:crypto";

import { db } from "./db.js";

/**
 * The agent payment ledger.
 *
 * ── WHAT WAS ASKED FOR, AND WHAT THIS IS INSTEAD ───────────────────────────
 * The ask was payments "hashed so they are impossible to trace". That is not
 * built here and will not be, for three reasons worth stating plainly:
 *
 *   1. Untraceable cash moving to polling unit agents during a Nigerian
 *      election is, on its face, indistinguishable from vote-buying. The
 *      product's credibility rests on being able to prove it is not doing
 *      that, and an untraceable rail destroys exactly that proof.
 *   2. It is illegal. Money transmission to identified people carries KYC and
 *      AML obligations; a system designed to defeat tracing is a system
 *      designed to defeat those.
 *   3. It contradicts everything else here. This is a product whose schema
 *      refuses to delete a disputed return because deleting it would be the
 *      most suspicious thing it could do. An untraceable payment is that same
 *      suspicion, with money attached.
 *
 * ── WHAT A HASH CHAIN ACTUALLY BUYS YOU ────────────────────────────────────
 * The valuable half of the request is real, and it is this: every entry
 * carries the hash of the entry before it, so the ledger is tamper-EVIDENT.
 * Change one figure in row 400 and every hash from 400 onward stops matching, * `verify()` finds it in one pass. Nobody, including whoever runs the database,
 * can quietly alter what an agent was paid. That is the property people mean
 * when they say "blockchain", and it needs no chain, no token and no network.
 *
 * Privacy is served by pseudonymity rather than by untraceability: the ledger
 * view shows a stable payment reference instead of a name, so a screen can be
 * shown in a room without exposing who is being paid, while the mapping stays
 * inside the authenticated system and remains fully auditable.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** The first link. Fixed and public, so a chain can be verified from scratch. */
const GENESIS = "0".repeat(64);

/**
 * What each kind does to a balance: +1 credits, -1 debits, 0 is a note in the
 * margin. Explicit rather than inferred, because a kind that is not listed
 * here must move nothing, the safe failure for money is "no effect", never
 * "assume it pays".
 */
export const KINDS = {
  STIPEND: 1,
  BONUS: 1,
  ADJUSTMENT: 1,
  WITHDRAWAL: -1,
  /* Recorded when an agent asks. It is spoken for, not gone: it does not touch
     the balance until somebody settles it and writes the WITHDRAWAL. */
  WITHDRAWAL_REQUESTED: 0,
  WITHDRAWAL_DECLINED: 0,
};

export const CREDIT_KINDS = Object.keys(KINDS).filter((kind) => KINDS[kind] > 0);

const digest = (value) => createHash("sha256").update(value).digest("hex");

/**
 * The canonical string an entry is hashed over.
 *
 * Field order is fixed here and must never change: the hash of every existing
 * entry depends on it, so a reordering would invalidate the whole chain.
 */
function canonical(entry) {
  return [
    entry.id,
    entry.userId,
    entry.kind,
    entry.amount,
    entry.reference,
    entry.note ?? "",
    entry.createdAt,
    entry.previousHash,
  ].join("|");
}

export const ledger = {
  /**
   * Append an entry. There is no update and no delete, by design and by
   * absence: nothing in this module can modify a row once written.
   */
  append({ userId, kind, amount, note = null, actorId = null }) {
    const previous = db
      .prepare("SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1")
      .get();

    const entry = {
      id: randomUUID(),
      userId,
      kind,
      amount: Math.round(amount),
      /* A stable, opaque reference derived from the account and the entry, enough to look a payment up and discuss it in a room, useless for
         working out who the agent is. */
      reference: digest(`${userId}:${Date.now()}`).slice(0, 12).toUpperCase(),
      note,
      createdAt: new Date().toISOString(),
      previousHash: previous?.hash ?? GENESIS,
    };

    entry.hash = digest(canonical(entry));

    db.prepare(
      `INSERT INTO ledger (id, user_id, kind, amount, reference, note, created_at, previous_hash, hash, actor_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      entry.id,
      entry.userId,
      entry.kind,
      entry.amount,
      entry.reference,
      entry.note,
      entry.createdAt,
      entry.previousHash,
      entry.hash,
      actorId
    );

    return entry;
  },

  /**
   * What an account is owed, in kobo. Derived on every read, never stored.
   *
   * The sign of an entry comes from KINDS below rather than from "is it a
   * withdrawal". The first version tested for one debit kind and treated
   * everything else as a credit, which meant the moment a
   * WITHDRAWAL_REQUESTED entry existed it *increased* the agent's balance, * the request to take money out paid them again. Anything not named here
   * counts for nothing, so a new informational kind can never silently move
   * somebody's money.
   */
  balanceFor(userId) {
    const rows = db
      .prepare("SELECT kind, amount FROM ledger WHERE user_id = ?")
      .all(userId);

    return rows.reduce((sum, row) => sum + (KINDS[row.kind] ?? 0) * row.amount, 0);
  },

  /** Requested but not yet settled, money spoken for, not money gone. */
  pendingFor(userId) {
    const rows = db
      .prepare("SELECT amount FROM ledger WHERE user_id = ? AND kind = 'WITHDRAWAL_REQUESTED'")
      .all(userId);
    return rows.reduce((sum, row) => sum + row.amount, 0);
  },

  forUser(userId, take = 20) {
    return db
      .prepare("SELECT * FROM ledger WHERE user_id = ? ORDER BY seq DESC LIMIT ?")
      .all(userId, take)
      .map(shape);
  },

  recent(take = 25) {
    return db.prepare("SELECT * FROM ledger ORDER BY seq DESC LIMIT ?").all(take).map(shape);
  },

  /**
   * Walk the whole chain and prove it has not been touched.
   *
   * Recomputes every hash from the genesis link forward. Returns the first
   * broken link rather than a bare false, because "the ledger is wrong" is
   * useless and "row 412 was altered" is actionable.
   */
  verify() {
    const rows = db.prepare("SELECT * FROM ledger ORDER BY seq ASC").all();

    let previousHash = GENESIS;
    for (const [index, row] of rows.entries()) {
      const entry = {
        id: row.id,
        userId: row.user_id,
        kind: row.kind,
        amount: row.amount,
        reference: row.reference,
        note: row.note,
        createdAt: row.created_at,
        previousHash: row.previous_hash,
      };

      if (row.previous_hash !== previousHash) {
        return { ok: false, at: index + 1, reason: "chain broken: previous hash does not match" };
      }
      if (digest(canonical(entry)) !== row.hash) {
        return { ok: false, at: index + 1, reason: "entry altered after it was written" };
      }

      previousHash = row.hash;
    }

    return { ok: true, entries: rows.length, head: previousHash };
  },
};

function shape(row) {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    amount: row.amount,
    reference: row.reference,
    note: row.note,
    createdAt: new Date(row.created_at),
    hash: row.hash,
    previousHash: row.previous_hash,
  };
}
