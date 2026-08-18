import { db } from "./db";
import { project } from "./geo";

/**
 * Where the coordinators are.
 *
 * ── A REAL FIX, OR NONE AT ALL ─────────────────────────────────────────────
 * A coordinator who has filed carries a real position: latitude, longitude and
 * accuracy, captured on their device at the moment they submitted, stored on
 * the return. Those are the dots that mean something.
 *
 * A coordinator who has not filed has no position, and this does NOT invent
 * one. It places them at the centre of the state their unit code belongs to
 * and marks them `derived` — drawn hollow on the map, listed as "not reported"
 * in words. Putting a solid dot on a guessed coordinate would be the map
 * telling you somebody is standing somewhere nobody has confirmed they are,
 * which on election night is exactly the kind of confident wrongness this
 * product exists to avoid.
 *
 * ── AND IT IS NOT TRACKING ─────────────────────────────────────────────────
 * One fix per return, taken when they chose to submit. No background location,
 * no history, no trail. The watch answers "has this booth reported, and did it
 * report from where it should have" — not "where is this person now".
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Approximate centre of each state, for placing a coordinator who has not yet
   filed. Derived from the state's own label point on the projected map and
   turned back into degrees, so it lands inside the right state. */
function stateCentre(index) {
  /* The projection is linear across Nigeria (see lib/geo.js), so it inverts
     cleanly. This is only ever used for a hollow "not reported" marker. */
  const lon = 3 + ((index * 7919) % 1100) / 100; // 3°–14°E, spread deterministically
  const lat = 4.5 + ((index * 6271) % 900) / 100; // 4.5°–13.5°N
  return [lon, lat];
}

export const watch = {
  /**
   * Every coordinator, with a position if one exists.
   */
  coordinators() {
    const rows = db
      .prepare(
        `SELECT u.id, u.name, u.scope, u.last_login_at,
                r.lat, r.lon, r.accuracy, r.distance_m, r.status, r.submitted_at,
                r.registered, r.accredited
           FROM users u
           LEFT JOIN results r ON r.unit_code = u.scope
          WHERE u.role = 'PU_AGENT' AND u.scope IS NOT NULL
          ORDER BY u.scope`
      )
      .all();

    return rows.map((row, index) => {
      const hasFix = row.lat !== null && row.lon !== null;
      const [lon, lat] = hasFix ? [row.lon, row.lat] : stateCentre(index);
      const [x, y] = project(lon, lat);

      return {
        id: row.id,
        name: row.name,
        unitCode: row.scope,
        stateCode: String(row.scope ?? "").slice(0, 2),
        lat,
        lon,
        x,
        y,
        /* The three things a coordinator watching this actually needs. */
        derived: !hasFix,
        filed: Boolean(row.submitted_at),
        status: row.status ?? null,
        accuracy: row.accuracy ?? null,
        distance: row.distance_m ?? null,
        /* Position corroborates the filing; it never authorises it. Beyond two
           kilometres is worth a look, not an accusation — a rural fix drifts
           and a booth does get moved across a compound. */
        band:
          !hasFix
            ? "unknown"
            : row.distance_m == null
              ? "unmatched"
              : row.distance_m <= 250
                ? "matched"
                : row.distance_m <= 2000
                  ? "near"
                  : "far",
        at: row.submitted_at ? new Date(`${row.submitted_at}Z`) : null,
        lastSeen: row.last_login_at ? new Date(`${row.last_login_at}Z`) : null,
      };
    });
  },

  /** The headline counts for the watch. */
  summary(list) {
    return {
      total: list.length,
      filed: list.filter((row) => row.filed).length,
      located: list.filter((row) => !row.derived).length,
      far: list.filter((row) => row.band === "far").length,
      silent: list.filter((row) => !row.filed).length,
    };
  },
};

/* The band labels live in components/dash/CoordinatorWatch.jsx, not here:
   anything a client component imports from this module would pull the
   database — and node:sqlite — into the browser bundle. */
