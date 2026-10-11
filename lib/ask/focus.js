import { bank } from "../irev/bank.js";
import { ACCOUNT } from "../irev/vault.js";
import { deepRows } from "./ground.js";
import { FIELD_YEARS, fieldOf } from "./field.js";
import { fmtInt, fmtPct } from "./format.js";

/**
 * The two tables every plan to win ends in: the polling units to cover
 * first, and how many people have voted on this ground at every election on
 * record.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IS KNOWN ABOUT A POLLING UNIT, AND WHAT IS NOT
 *
 *  A polling unit's name, code, ward and local government are INEC's own.
 *  How many people voted there is on record only where a result sheet for it
 *  has been read: INEC publishes those sheets as photographs, election by
 *  election, and the figures exist once Poll360 has read one (lib/irev). So
 *  for each unit this prints two different things and never blends them:
 *
 *    FROM THE SHEETS   accredited voters against the register on each sheet
 *                      read, for every election read — the turnout itself —
 *                      and, across two or more, how steady it has been.
 *    ESTIMATED         its register and its 2023 turnout, from the declared
 *                      state totals spread across the state's real units.
 *                      Right about the state; an estimate for one booth.
 *
 *  Turnout at a single polling unit before the sheets were published — every
 *  election up to 2019 — was never published by anybody, and no estimate of
 *  it is printed here: spread from a state total, one year's guess and the
 *  next would differ by chance, and "steady turnout" read off that would be
 *  a pattern in the arithmetic, not in the voters.
 * ══════════════════════════════════════════════════════════════════════════
 */

const TYPE_WORDS = { PRES: "presidential", GOV: "governorship", SEN: "senate", REP: "House of Representatives", REPS: "House of Representatives" };

/**
 * What the sheets say, unit by unit. Empty wherever Data Bank cannot be
 * reached: a plan is never held up for it.
 *
 * @returns {Promise<Map<string, { year, type, turnout, registered, accredited }[]>>} keyed "NN-NN-NN-NNN"
 */
async function sheetTurnout(ground) {
  const out = new Map();
  const db = bank();
  if (!db || !ground.prefixes.length) return out;
  try {
    const rows = await Promise.race([
      db(
        `SELECT r.pu_code, e.year, e.type_code, e.type_name, r.registered, r.accredited
           FROM ${ACCOUNT.schema}.readings r
           JOIN ${ACCOUNT.schema}.elections e USING (election_id)
          WHERE r.status = 'read' AND r.balanced IS NOT FALSE AND r.code_matches IS NOT FALSE
            AND r.registered > 0 AND r.accredited IS NOT NULL AND r.accredited <= r.registered
            AND r.pu_code LIKE ANY($1::text[])`,
        [ground.prefixes.map((prefix) => `${prefix}/%`)]
      ),
      new Promise((_, fail) => setTimeout(() => fail(new Error("slow")), 4000)),
    ]);
    for (const row of rows) {
      const key = String(row.pu_code).replace(/\//g, "-");
      if (!out.has(key)) out.set(key, []);
      out.get(key).push({
        year: row.year,
        type: TYPE_WORDS[String(row.type_code ?? "").toUpperCase()] ?? String(row.type_name ?? "").replace(/ election$/i, "").toLowerCase(),
        registered: row.registered,
        accredited: row.accredited,
        turnout: (row.accredited / row.registered) * 100,
      });
    }
  } catch {
    /* No Data Bank, or a slow one: the estimates still answer. */
  }
  return out;
}

/**
 * The polling units of a ground in the order to cover them.
 *
 * Ranked by how many voters each holds, then by how crowded its ward is —
 * the two things that decide how much an agent standing there watches. A
 * ground the size of the country is not listed: 176,000 rows is not a focus.
 *
 * @returns {Promise<null | { section: object, facts: object }>}
 */
export async function unitFocus(ground, { goal = null, registered = null } = {}) {
  if (!ground.states?.length || (ground.states.length > 1 && !ground.lgas)) return null;
  const units = await deepRows("unit", { states: ground.states, lgaKeys: ground.lgas });
  if (!units.length) return null;

  const numberOf = (key) => key.split("-")[0];
  const prefixes = ground.lgas ?? [...new Set(units.map((row) => numberOf(row.key)))];
  const sheets = await sheetTurnout({ prefixes });

  const rows = units
    .map((row) => {
      const read = (sheets.get(row.key) ?? []).sort((a, b) => a.year - b.year);
      const turnouts = read.map((entry) => entry.turnout);
      const low = turnouts.length ? Math.min(...turnouts) : null;
      const high = turnouts.length ? Math.max(...turnouts) : null;
      const steady = turnouts.length >= 2 ? (high - low <= 10 ? "held" : high - low <= 20 ? "cleared" : "reach") : "beyond";
      return {
        key: row.key,
        code: row.code,
        name: row.name,
        ward: row.ward,
        lga: row.lga,
        lgaKey: row.lgaKey,
        state: row.state,
        stateCode: row.stateCode,
        level: "unit",
        registered: row.registered,
        density: row.density ? Math.round(row.density) : null,
        turnout: row.turnout,
        stayed: row.cast !== null && row.registered ? Math.max(0, row.registered - row.cast) : null,
        top: row.top ? "Yes" : "—",
        goal: goal !== null && registered ? Math.round((goal * (row.registered ?? 0)) / registered) : null,
        sheets: read.length,
        sheet_turnout: turnouts.length ? turnouts.reduce((sum, value) => sum + value, 0) / turnouts.length : null,
        sheet_detail: read.length ? read.map((entry) => `${entry.year} ${entry.type} ${fmtPct(entry.turnout, 0)}`).join("; ") : "—",
        status: steady,
        status_label: turnouts.length >= 2 ? (steady === "held" ? "Steady — within 10 points" : steady === "cleared" ? "Within 20 points" : "Uneven") : turnouts.length === 1 ? "One sheet read" : "No sheet read yet",
      };
    })
    .sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0) || (b.density ?? 0) - (a.density ?? 0))
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const withSheets = rows.filter((row) => row.sheets > 0).length;
  const elections = [...new Set([...sheets.values()].flat().map((entry) => `${entry.year} ${entry.type}`))].sort();
  const top100 = rows.slice(0, Math.min(100, rows.length));
  const top100Registered = top100.reduce((sum, row) => sum + (row.registered ?? 0), 0);
  const allRegistered = rows.reduce((sum, row) => sum + (row.registered ?? 0), 0);

  return {
    section: {
      level: "unit",
      title: `Polling units to cover first in ${ground.name}: biggest register, then the most crowded wards`,
      provenance: "units",
      columns: [
        { key: "rank", label: "#", kind: "int" },
        { key: "name", label: "Polling unit", kind: "text", main: true },
        { key: "code", label: "Code", kind: "text" },
        { key: "ward", label: "Ward", kind: "text" },
        { key: "lga", label: "Local government", kind: "text" },
        { key: "registered", label: "Registered (est.)", kind: "int" },
        { key: "density", label: "Voters per unit in its ward", kind: "int" },
        { key: "turnout", label: "Turnout, 2023 (est.)", kind: "pct" },
        { key: "stayed", label: "Did not vote, 2023 (est.)", kind: "int" },
        { key: "top", label: "Among the 60,000 biggest", kind: "text" },
        ...(goal !== null ? [{ key: "goal", label: "Vote goal", kind: "int" }] : []),
        { key: "sheets", label: "Elections with a sheet read", kind: "int" },
        { key: "sheet_turnout", label: "Turnout on the sheets", kind: "pct" },
        { key: "sheet_detail", label: "Each election read", kind: "text" },
        { key: "status", label: "Turnout across elections", kind: "status" },
      ],
      rows,
      total: rows.length,
      read: rows.length,
      tiles: [],
      facts: { kind: "focus-units" },
    },
    facts: {
      n: rows.length,
      withSheets,
      elections,
      steady: rows.filter((row) => row.status === "held").length,
      top: rows.slice(0, 5).map((row) => ({ name: row.name, code: row.code, ward: row.ward, lga: row.lga, registered: row.registered, density: row.density })),
      top100: { n: top100.length, registered: top100Registered, part: allRegistered ? (top100Registered / allRegistered) * 100 : null },
    },
  };
}

/**
 * How many people voted on a ground at every election on record: the
 * presidential elections since 1999, and — for a seat — its own elections
 * beside them. Votes cast, not who they were cast for.
 *
 * @param {object} ground  `{ states, lgas, name }`
 * @param {number} registered  Today's register on the ground.
 * @param {{ what: string, elections: { year, total }[] } | null} own  The seat's own counted elections.
 */
export function turnoutRecord(ground, registered, own = null) {
  const field = fieldOf({ states: ground.states ?? null, lgas: ground.lgas ?? null });
  const entries = [
    ...FIELD_YEARS.filter((year) => field.by[year]).map((year) => ({ year, kind: "Presidential", cast: field.by[year].total, basis: field.counted ? "Counted" : "Estimated" })),
    ...(own?.elections ?? []).filter((election) => election.total).map((election) => ({ year: election.year, kind: own.what[0].toUpperCase() + own.what.slice(1), cast: election.total, basis: "Counted" })),
  ].sort((a, b) => a.year - b.year || a.kind.localeCompare(b.kind));

  const lastOf = {};
  const rows = entries.map((entry) => {
    const before = lastOf[entry.kind] ?? null;
    lastOf[entry.kind] = entry.cast;
    return {
      key: `${entry.year}-${entry.kind}`,
      name: `${entry.year} ${entry.kind.toLowerCase()}`,
      year: entry.year,
      election: entry.kind,
      cast: entry.cast,
      /* Against today's register — the only register held. It says how the
         size of each election compares, not what the turnout rate was then. */
      of_register: registered ? (entry.cast / registered) * 100 : null,
      change: before ? ((entry.cast - before) / before) * 100 : null,
      basis: entry.basis,
    };
  });
  const casts = rows.map((row) => row.cast);
  const lowest = rows.reduce((least, row) => (least === null || row.cast < least.cast ? row : least), null);
  const highest = rows.reduce((most, row) => (most === null || row.cast > most.cast ? row : most), null);

  return {
    section: {
      level: ground.lgas || ground.states?.length === 1 ? "lga" : "state",
      title: `Votes cast in ${ground.name} at every election on record`,
      provenance: field.counted ? "turnout" : "turnout-est",
      columns: [
        { key: "name", label: "Election", kind: "text", main: true },
        { key: "cast", label: "Votes cast", kind: "int" },
        { key: "of_register", label: "Against today's register", kind: "pct" },
        { key: "change", label: "Change on the one before (%)", kind: "pts" },
        { key: "basis", label: "Basis", kind: "text" },
      ],
      rows: [...rows].reverse(),
      total: rows.length,
      read: rows.length,
      tiles: [],
      facts: { kind: "focus-turnout" },
    },
    facts: {
      elections: rows.map((row) => ({ name: row.name, cast: row.cast })),
      lowest: lowest ? { name: lowest.name, cast: lowest.cast } : null,
      highest: highest ? { name: highest.name, cast: highest.cast } : null,
      /* How far apart the smallest and largest elections were. */
      spread: casts.length > 1 ? ((Math.max(...casts) - Math.min(...casts)) / Math.max(...casts)) * 100 : null,
      counted: field.counted,
    },
  };
}

/** The sentences both writers print about these two tables. */
export function focusLines(units, turnout, ground) {
  const lines = [];
  if (turnout) {
    lines.push(
      `Votes cast in ${ground} at every election on record: ${turnout.elections.map((entry) => `${fmtInt(entry.cast)} (${entry.name})`).join(", ")}.${
        turnout.lowest && turnout.highest && turnout.elections.length > 1 ? ` Fewest in the ${turnout.lowest.name} election, most in the ${turnout.highest.name}.` : ""
      }`
    );
  }
  if (units) {
    lines.push(
      `Polling units to cover first: ${units.top.map((entry) => `${entry.name} [${entry.code}], ${entry.ward}, ${entry.lga} — ${fmtInt(entry.registered)} registered`).join("; ")}. The ${fmtInt(units.top100.n)} biggest hold ${fmtPct(units.top100.part)} of the register.`
    );
    lines.push(
      units.withSheets
        ? `Turnout from INEC's own result sheets is held for ${fmtInt(units.withSheets)} of the ${fmtInt(units.n)} polling units here (${units.elections.join(", ")})${units.steady ? `; ${fmtInt(units.steady)} have held within 10 points across the elections read` : ""}. The rest show an estimate until their sheets are read.`
        : `No result sheet for these ${fmtInt(units.n)} polling units has been read into figures yet, so each unit's register and 2023 turnout are estimates, and turnout election by election is blank. It fills in as sheets are read on the INEC results screen.`
    );
  }
  return lines;
}
