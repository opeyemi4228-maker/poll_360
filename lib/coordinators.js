import { randomUUID } from "node:crypto";

import { db } from "./db.js";
import { parseUnitCode } from "./units.js";

/**
 * Polling unit coordinators: a separate population, held separately.
 *
 * ── WHY THEY ARE NOT IN `users` ────────────────────────────────────────────
 * Everything about them is different from a Poll360 staff account. There are
 * thousands of them to a newsroom's handful. They are recruited in the
 * fortnight before polling day and are finished the morning after. They sign
 * themselves up rather than being issued a credential down a phone line. They
 * hold exactly one power — file the returns from one booth — where a staff
 * account holds a room. And an account of theirs is approved by a human who
 * checks a booth against an appointment list, which is a decision no staff
 * account ever waits on.
 *
 * Sharing a table meant one sign-in page addressing both audiences and serving
 * neither, and one code path where a mistake made for the four thousand could
 * reach the four. They are separate systems now. They meet in exactly one
 * place: the bridge column on `results`, which records that a return was filed
 * by a coordinator rather than by staff.
 *
 * ── AND THE THING TO WATCH ─────────────────────────────────────────────────
 * This module is a twin of parts of lib/db.js and lib/session.js. Duplication
 * is the actual hazard of the design — a fix made on one side and forgotten on
 * the other — so where a function here has a twin, the comment names it.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * The states an account can be in.
 *
 * ── FOUR, BECAUSE THREE COULD NOT SAY IT ───────────────────────────────────
 * PENDING is "nobody has looked yet". DECLINED is "somebody looked and said
 * no". SUSPENDED is "they were approved and have been switched off since" —
 * which is not the same as declined, because a suspended coordinator was
 * trusted once and their filed returns are still in the count. Collapsing the
 * last two would make a revoked agent indistinguishable from someone who was
 * never let in, and the approval queue would then be a mix of applicants and
 * dismissals.
 */
export const STATUS = {
  PENDING: { label: "Waiting", tone: "warn", canFile: false },
  ACTIVE: { label: "Approved", tone: "good", canFile: true },
  DECLINED: { label: "Turned down", tone: "neutral", canFile: false },
  SUSPENDED: { label: "Suspended", tone: "alert", canFile: false },
};

/**
 * The database row as every screen sees it.
 *
 * ── IT RETURNS null, NOT undefined ────────────────────────────────────────
 * `row && {...}` is the house shorthand elsewhere in lib/db.js, and it passes
 * `undefined` straight through when a query found nothing. That is fine for a
 * reader that only ever asks `if (!found)`, and wrong here: this shape is what
 * `currentCoordinator` returns, its documented contract is "the account or
 * null", and a function that answers `undefined` to "who is signed in" is one
 * `=== null` away from deciding a stranger is signed in. Stated explicitly so
 * there is one answer for "nobody".
 */
const shape = (row) =>
  row ? {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    /* Never the whole number in a list: an approval screen is read over
       somebody's shoulder in an office, and the last four digits are enough to
       match against an appointment list. The full number is on the record and
       is not printed by any component. */
    phoneTail: row.phone ? String(row.phone).slice(-4) : null,
    unitCode: row.unit_code,
    stateCode: row.state_code,
    /* What the applicant called their ward and booth. A claim, never a lookup:
       see the column's own note in lib/db.js. */
    wardName: row.ward_name ?? null,
    unitName: row.unit_name ?? null,
    status: row.status,
    note: row.note,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? new Date(`${row.approved_at}Z`) : null,
    disabledAt: row.disabled_at ? new Date(`${row.disabled_at}Z`) : null,
    lastLoginAt: row.last_login_at ? new Date(`${row.last_login_at}Z`) : null,
    createdAt: row.created_at ? new Date(`${row.created_at}Z`) : null,
    /* The single question every caller actually asks. Derived in one place so
       no screen has to remember which statuses are allowed to file. */
    canFile: Boolean(STATUS[row.status]?.canFile) && !row.disabled_at,
      }
    : null;

export const coordinators = {
  /**
   * A sign-up.
   *
   * Always lands PENDING. There is no argument to make it anything else, and
   * that is deliberate: an account that could be created active is an account
   * that will one day be created active by a code path nobody reviewed.
   */
  async signUp({
    name,
    email,
    phone,
    passwordHash,
    unitCode,
    wardName = null,
    unitName = null,
    note = null,
  }) {
    const id = randomUUID();
    const at = unitCode ? parseUnitCode(unitCode) : null;

    (await db.prepare(
      `INSERT INTO coordinators
         (id, name, email, phone, password_hash, unit_code, state_code, ward_name, unit_name,
          status, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`
    ).run(
      id,
      name,
      email ?? null,
      phone ?? null,
      passwordHash,
      at?.code ?? null,
      at?.stateNumber ?? null,
      wardName,
      unitName,
      note
    ));

    return coordinators.byId(id);
  },

  async byId(id) {
    return shape(await db.prepare("SELECT * FROM coordinators WHERE id = ?").get(id));
  },

  async byEmail(email) {
    return shape(
      await db.prepare("SELECT * FROM coordinators WHERE email = ?").get(String(email).toLowerCase())
    );
  },

  async byPhone(phone) {
    return shape(await db.prepare("SELECT * FROM coordinators WHERE phone = ?").get(phone));
  },

  /**
   * The stored hash, fetched on its own.
   *
   * ── WHY IT IS NOT ON THE SHAPED ROW ────────────────────────────────────
   * `shape` is what every screen receives, and a password hash that rides
   * along on the object the approval queue renders is a password hash one
   * careless `JSON.stringify` away from a browser. It is asked for explicitly,
   * by the one function that verifies a sign-in, and nowhere else.
   */
  async secretFor(id) {
    const row = await db.prepare("SELECT password_hash FROM coordinators WHERE id = ?").get(id);
    return row?.password_hash ?? null;
  },

  /** Oldest first: whoever has waited longest is at the top of the queue. */
  async waiting(take = 100) {
    return (await db
      .prepare(
        "SELECT * FROM coordinators WHERE status = 'PENDING' ORDER BY created_at LIMIT ?"
      )
      .all(take)).map(shape);
  },

  async waitingCount() {
    const row = await db
      .prepare("SELECT COUNT(*) AS n FROM coordinators WHERE status = 'PENDING'")
      .get();
    return Number(row?.n ?? 0);
  },

  /** How many sit in each state, for the counts above the queue. */
  async tally() {
    const rows = await db
      .prepare("SELECT status, COUNT(*) AS n FROM coordinators GROUP BY status")
      .all();
    const out = { PENDING: 0, ACTIVE: 0, DECLINED: 0, SUSPENDED: 0 };
    for (const row of rows) out[row.status] = Number(row.n);
    return out;
  },

  /**
   * Let them in.
   *
   * ── THE BOOTH IS CORRECTABLE ON THE WAY THROUGH ────────────────────────
   * The likeliest error on the sign-up form is the unit code: nine digits
   * copied off a form on a phone, in the dark. The person approving is usually
   * the one holding the appointment list, so they can put it right here rather
   * than declining somebody over a typo and asking them to sign up again.
   *
   * `WHERE status = 'PENDING'` is not decoration. Two administrators working
   * the queue at once would otherwise both approve the same row, and the
   * second would silently overwrite the first's correction to the unit.
   */
  async approve(id, { by, unitCode = null }) {
    const at = unitCode ? parseUnitCode(unitCode) : null;

    (await db.prepare(
      `UPDATE coordinators
          SET status = 'ACTIVE',
              approved_by = ?, approved_at = now(), disabled_at = NULL,
              unit_code  = COALESCE(?, unit_code),
              state_code = COALESCE(?, state_code)
        WHERE id = ? AND status = 'PENDING'`
    ).run(by ?? null, at?.code ?? null, at?.stateNumber ?? null, id));

    return coordinators.byId(id);
  },

  /**
   * Turn them down.
   *
   * The row stays, marked. A refusal that deleted the application is a refusal
   * nobody can see afterwards, and the same person signing up again an hour
   * later would arrive in the queue looking like a name nobody had seen.
   */
  async decline(id, { by, note = null }) {
    (await db.prepare(
      `UPDATE coordinators
          SET status = 'DECLINED', approved_by = ?, approved_at = now(),
              disabled_at = now(), note = COALESCE(?, note)
        WHERE id = ? AND status = 'PENDING'`
    ).run(by ?? null, note, id));

    return coordinators.byId(id);
  },

  async markSignedIn(id) {
    (await db.prepare("UPDATE coordinators SET last_login_at = now() WHERE id = ?").run(id));
  },
};

/* ── sessions ──────────────────────────────────────────────────────────────
   A twin of `sessions` in lib/db.js, against the coordinators' own table. Kept
   separate rather than parameterised because a shared function with a table
   name argument is one typo away from looking a coordinator's token up in the
   staff table, and that typo is a privilege escalation rather than a bug. */

export const coordinatorSessions = {
  async create({ id, coordinatorId, expiresAt, userAgent }) {
    (await db.prepare(
      `INSERT INTO coordinator_sessions (id, coordinator_id, expires_at, user_agent)
       VALUES (?, ?, ?, ?)`
    ).run(id, coordinatorId, expiresAt.toISOString(), userAgent ?? null));
  },

  /**
   * The account behind a token, or null.
   *
   * ── EXPIRY AND STANDING CHECKED IN THE SAME STATEMENT ──────────────────
   * The twin in lib/db.js does the same, for the same reason: if "is this
   * session valid" and "may this account still act" are two queries, they
   * become two code paths, and one of them eventually forgets. A suspended
   * coordinator, a declined one and an expired token are all the same answer
   * here — nobody is signed in — rather than three branches to keep in step.
   *
   * PENDING is deliberately NOT excluded. A pending account signs in and is
   * shown where it stands; refusing it the way a wrong password is refused is
   * how somebody concludes their sign-up failed and does it four more times.
   * What stops them filing is `canFile`, checked by the guard.
   */
  async find(id) {
    const row = await db
      .prepare(
        `SELECT c.* FROM coordinator_sessions s
           JOIN coordinators c ON c.id = s.coordinator_id
          WHERE s.id = ?
            AND s.expires_at > now()
            AND c.status IN ('PENDING', 'ACTIVE')`
      )
      .get(id);
    return shape(row);
  },

  async destroy(id) {
    (await db.prepare("DELETE FROM coordinator_sessions WHERE id = ?").run(id));
  },

  /** Every session this account holds, dropped at once. */
  async destroyAllFor(coordinatorId) {
    (await db
      .prepare("DELETE FROM coordinator_sessions WHERE coordinator_id = ?")
      .run(coordinatorId));
  },

  async sweepExpired() {
    (await db.prepare("DELETE FROM coordinator_sessions WHERE expires_at <= now()").run());
  },
};
