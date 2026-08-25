import nation from "../public/geo/map/nation.json";

import { db, positions } from "./db";
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

/**
 * Positions that arrived over WhatsApp, newest per unit.
 *
 * ── WHY THESE OUTRANK A FILING'S OWN FIX ───────────────────────────────────
 * The fix stored on a return is where the coordinator was when they filed,
 * which by definition is in the past and may be hours old. A WhatsApp position
 * is where they are now, and it arrives whether or not they have filed
 * anything, so it is the only thing that can show somebody arriving at a booth
 * before their first return. Where both exist the newer one wins, which is
 * almost always this one.
 */
async function whatsappFixes() {
  const map = new Map();
  for (const fix of await positions.latest()) {
    if (!fix.unitCode) continue;
    const held = map.get(fix.unitCode);
    if (!held || fix.at > held.at) map.set(fix.unitCode, fix);
  }
  return map;
}

export const watch = {
  /**
   * Every coordinator, with a position if one exists.
   */
  /**
   * Every coordinator, with a position if one exists.
   *
   * ── THE JOIN NAMES A CONTEST, AND A PENDING ACCOUNT IS NOT ON THE MAP ───
   * A booth now files several returns in one evening, one per position, so a
   * join on the unit code alone returned the same coordinator once per ballot
   * they had sent and the watch list counted each of them as a person. It
   * reads the position being looked at, like everything else.
   *
   * Accounts waiting for approval are left out on purpose: nobody has agreed
   * they are covering that booth yet, and a map that showed them would be
   * claiming coverage the count does not have.
   */
  async coordinators(electionId, race) {
    /* ── TWO KINDS OF ACCOUNT NOW STAND AT BOOTHS ─────────────────────────
       Polling unit coordinators have their own table and their own sign-in.
       Staff accounts with role PU_AGENT still exist — they were the only way
       in before that, and some are still appointed to booths — so the watch
       has to read both or it goes half empty on the night, showing coverage
       the count does have as coverage it does not.

       Unioned in SQL rather than fetched as two lists and concatenated,
       because both halves need the same LEFT JOIN to the same filing and
       writing that join twice in JavaScript is how the two halves drift into
       disagreeing about what "has reported" means. `kind` rides along so the
       desk can tell which system somebody signed in through. */
    const rows = await db
      .prepare(
        `SELECT u.id, u.name, u.scope, u.last_login_at, 'staff' AS kind,
                r.lat, r.lon, r.accuracy, r.distance_m, r.status, r.submitted_at,
                r.registered, r.accredited
           FROM users u
           LEFT JOIN results r
             ON r.unit_code = u.scope AND r.election_id = ? AND r.race = ?
          WHERE u.role = 'PU_AGENT' AND u.scope IS NOT NULL
            AND u.status = 'ACTIVE' AND u.disabled_at IS NULL

          UNION ALL

         SELECT c.id, c.name, c.unit_code AS scope, c.last_login_at, 'coordinator' AS kind,
                r.lat, r.lon, r.accuracy, r.distance_m, r.status, r.submitted_at,
                r.registered, r.accredited
           FROM coordinators c
           LEFT JOIN results r
             ON r.unit_code = c.unit_code AND r.election_id = ? AND r.race = ?
          WHERE c.unit_code IS NOT NULL
            /* Approved only, for the same reason the staff half filters on
               ACTIVE: nobody has agreed a pending applicant is covering that
               booth, and a map that drew them would be claiming coverage the
               count does not have. */
            AND c.status = 'ACTIVE' AND c.disabled_at IS NULL

          ORDER BY scope`
      )
      .all(
        electionId ?? null,
        String(race ?? "PRESIDENTIAL").toUpperCase(),
        electionId ?? null,
        String(race ?? "PRESIDENTIAL").toUpperCase()
      );

    const live = await whatsappFixes();

    /* ── ONE BOOTH, ONE MARKER ────────────────────────────────────────────
       A unit can legitimately be held on both sides at once: a staff PU_AGENT
       account appointed before coordinators had their own table, and a
       coordinator who has since signed up for the same booth. Both are real
       accounts, and drawing both would put two dots on one polling unit and
       count it twice in `summary` — which is the exact duplication this file
       has been bitten by before, and it shows up as coverage above 100%.

       Where both exist the one that has actually filed wins, because the
       question this map answers is "has this booth reported", not "how many
       people could have reported it". With neither filed the coordinator wins,
       as that is the system agents are created in now. */
    const byUnit = new Map();
    for (const row of rows) {
      const held = byUnit.get(row.scope);
      if (!held) {
        byUnit.set(row.scope, row);
        continue;
      }
      const heldFiled = Boolean(held.submitted_at);
      const rowFiled = Boolean(row.submitted_at);
      if (rowFiled && !heldFiled) byUnit.set(row.scope, row);
      else if (rowFiled === heldFiled && row.kind === "coordinator") byUnit.set(row.scope, row);
    }

    return [...byUnit.values()].map((row) => {
      const sent = live.get(row.scope);
      /* A live position replaces the filing's own, and brings its own clock so
         the desk can see how fresh it is. */
      const lat = sent?.lat ?? row.lat;
      const lon = sent?.lon ?? row.lon;
      const hasFix = lat !== null && lat !== undefined && lon !== null && lon !== undefined;
      const prefix = String(row.scope ?? "").slice(0, 2);

      /* A real fix is projected. Everything else falls back to the state's own
         label point, and a unit code that names no state we know gets no
         coordinates at all rather than a plausible-looking wrong one, the map
         simply leaves it out, and the list still carries the person. */
      const [x, y] = hasFix ? project(lon, lat) : (CENTRE.get(prefix) ?? [null, null]);

      return {
        id: row.id,
        name: row.name,
        unitCode: row.scope,
        stateCode: prefix,
        /* Which account system they signed in through: "coordinator" for the
           separate polling unit accounts, "staff" for a PU_AGENT issued from
           the console. The desk reads it when somebody rings and it needs to
           say where to reset a password. */
        kind: row.kind,
        /* Null, not a guess: these two are printed as coordinates, and there
           are none to print for somebody who has not reported. */
        lat: hasFix ? lat : null,
        lon: hasFix ? lon : null,
        /* Where it came from, so the map can say "live from WhatsApp" rather
           than implying every dot is equally current. */
        via: sent ? "whatsapp" : row.lat !== null ? "filing" : null,
        seenAt: sent?.at ?? null,
        x,
        y,
        /* The three things a coordinator watching this actually needs. */
        derived: !hasFix,
        filed: Boolean(row.submitted_at),
        status: row.status ?? null,
        accuracy: sent?.accuracy ?? row.accuracy ?? null,
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
