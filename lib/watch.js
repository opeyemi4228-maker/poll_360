import nation from "../public/geo/map/nation.json";

import { db } from "./db";
import { states2023 } from "./election2023";
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
 * and marks them `derived`, drawn hollow on the map, listed as "not reported"
 * in words. Putting a solid dot on a guessed coordinate would be the map
 * telling you somebody is standing somewhere nobody has confirmed they are,
 * which on election night is exactly the kind of confident wrongness this
 * product exists to avoid.
 *
 * ── AND IT IS NOT TRACKING ─────────────────────────────────────────────────
 * One fix per return, taken when they chose to submit. No background location,
 * no history, no trail. The watch answers "has this booth reported, and did it
 * report from where it should have", not "where is this person now".
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Where to draw a coordinator nobody has heard from.
 *
 * ── THIS USED TO PUT PEOPLE IN THE SEA ─────────────────────────────────────
 * The previous version spread placeholders across a 3°, 14°E, 4.5°, 13.5°N
 * rectangle keyed on the row's position in the result set. Two things were
 * wrong with that, and both were visible on the screen: a lat/lon rectangle
 * around Nigeria contains a great deal of the Gulf of Guinea and a corner of
 * Chad, so hollow markers appeared offshore and outside the country; and
 * keying on the row index rather than on the unit code meant a coordinator was
 * not even placed in their own state.
 *
 * The map file already carries the answer. Every state shape has an `at`, the
 * point the map uses to write that state's own label, which is inside the
 * polygon by construction. A placeholder goes exactly there, so it is always
 * in the right state and always on land.
 *
 * It is still a placeholder, and still drawn hollow and listed as "not
 * reported": the point is that we know which state their booth is in, which is
 * true, and nothing more, which is also true.
 * ───────────────────────────────────────────────────────────────────────────
 */
const CENTRE = new Map(
  states2023.map((state, index) => {
    const shape = nation.states.find((row) => row.code === state.code);
    /* The unit code's two-digit prefix is the state's position in the declared
       table, the same mapping the broadcast desk uses to read our returns. */
    return [String(index + 1).padStart(2, "0"), shape?.at ?? null];
  })
);

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

    return rows.map((row) => {
      const hasFix = row.lat !== null && row.lon !== null;
      const prefix = String(row.scope ?? "").slice(0, 2);

      /* A real fix is projected. Everything else falls back to the state's own
         label point, and a unit code that names no state we know gets no
         coordinates at all rather than a plausible-looking wrong one, the map
         simply leaves it out, and the list still carries the person. */
      const [x, y] = hasFix ? project(row.lon, row.lat) : (CENTRE.get(prefix) ?? [null, null]);

      return {
        id: row.id,
        name: row.name,
        unitCode: row.scope,
        stateCode: prefix,
        /* Null, not a guess: these two are printed as coordinates, and there
           are none to print for somebody who has not reported. */
        lat: hasFix ? row.lat : null,
        lon: hasFix ? row.lon : null,
        x,
        y,
        /* The three things a coordinator watching this actually needs. */
        derived: !hasFix,
        filed: Boolean(row.submitted_at),
        status: row.status ?? null,
        accuracy: row.accuracy ?? null,
        distance: row.distance_m ?? null,
        /* Position corroborates the filing; it never authorises it. Beyond two
           kilometres is worth a look, not an accusation, a rural fix drifts
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
        /* Whether this fix arrived in the last ten minutes. The room refreshes
           every fifteen seconds, so a dot that has just moved should look like
           it has just moved, otherwise a live map and a printed one are the
           same picture. Ten minutes rather than one: booths file in bursts, and
           a marker that stops pulsing after sixty seconds is a marker nobody in
           the room ever catches. */
        fresh: row.submitted_at
          ? Date.now() - new Date(`${row.submitted_at}Z`).getTime() < 10 * 60 * 1000
          : false,
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
   database, and node:sqlite, into the browser bundle. */
