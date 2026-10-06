/**
 * INEC's published sheet against the return our own agent filed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO RECORDS OF ONE PIECE OF PAPER, MADE BY TWO PARTIES
 *
 *  The presiding officer writes Form EC8A once. The commission's device
 *  photographs it and the photograph goes up on IReV. Our agent, standing at
 *  the same table, files what the same form says. If both are honest and both
 *  were read correctly they are the same numbers.
 *
 *  So a difference is one of three things, and this cannot say which: our
 *  agent mistyped, the reading of INEC's photograph is wrong, or the sheet
 *  that went up is not the sheet our agent saw. All three want a person to
 *  open both and look. That is the whole output of this file: which polling
 *  units a person should open, and exactly which figures disagree.
 *
 *  ── ONLY A READING THAT ADDS UP IS HELD AGAINST ANYTHING ────────────────
 *  A reading whose party figures do not sum to accredited less rejected is
 *  wrong somewhere by its own arithmetic. Comparing it would report the
 *  reader's mistake as a discrepancy between INEC and us. Those are counted
 *  separately as "could not be compared" and left out of the differences.
 * ══════════════════════════════════════════════════════════════════════════
 */

const code = (value) => String(value ?? "").replace(/\D/g, "");

/**
 * One unit: every figure where the two records differ.
 * `ours` is a Poll360 return; `theirs` a row of the IReV readings.
 */
export function differences(ours, theirs) {
  const out = [];
  const inec = theirs.party_votes ?? {};
  const mine = ours.votes ?? {};

  /* A party absent from one record is a zero there only if the other record
     has it as a real number: both sides list only the rows that carried one. */
  for (const party of new Set([...Object.keys(inec), ...Object.keys(mine)])) {
    if (party === "OTH") continue;
    const a = Number(mine[party] ?? 0);
    const b = Number(inec[party] ?? 0);
    if (a !== b) out.push({ what: party, ours: a, inec: b });
  }

  for (const [what, a, b] of [
    ["Accredited", ours.accredited, theirs.accredited],
    ["Rejected", ours.rejected, theirs.rejected],
    ["Registered", ours.registered, theirs.registered],
  ]) {
    if (a != null && b != null && Number(a) !== Number(b)) out.push({ what, ours: Number(a), inec: Number(b) });
  }

  /* Largest gap first: that is the one somebody will be asked about. */
  return out.sort((x, y) => Math.abs(y.ours - y.inec) - Math.abs(x.ours - x.inec));
}

/**
 * A whole election: our returns against INEC's readings, by polling unit.
 *
 * Returns the counts a desk needs and the units that differ, worst first.
 */
export function compare(ourRows = [], readings = []) {
  const theirs = new Map();
  for (const reading of readings) {
    if (reading.status === "read") theirs.set(code(reading.pu_code), reading);
  }

  const out = { inec: theirs.size, ours: 0, both: 0, agree: 0, unsure: 0, differ: [], onlyOurs: 0, onlyInec: 0 };
  const seen = new Set();

  for (const row of ourRows) {
    const key = code(row.unitCode);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.ours += 1;

    const reading = theirs.get(key);
    if (!reading) {
      out.onlyOurs += 1;
      continue;
    }

    out.both += 1;
    if (!reading.balanced || reading.code_matches === false) {
      out.unsure += 1;
      continue;
    }

    const gaps = differences(row, reading);
    if (gaps.length === 0) out.agree += 1;
    else {
      out.differ.push({
        unitCode: row.unitCode,
        unitId: reading.unit_id,
        gaps,
        size: gaps.reduce((sum, gap) => sum + Math.abs(gap.ours - gap.inec), 0),
      });
    }
  }

  out.onlyInec = [...theirs.keys()].filter((key) => !seen.has(key)).length;
  out.differ.sort((a, b) => b.size - a.size);
  return out;
}

/**
 * What a sheet's own file says, held against where and when it should have
 * been made. Returns the plain sentences worth a person's attention; an empty
 * list means nothing stood out, not that the sheet is proven.
 */
export function pictureFlags(picture, { heldOn = null } = {}) {
  const flags = [];
  if (!picture) return flags;

  if (picture.place_ok === false) {
    flags.push(
      `Photographed in ${[picture.taken_lga, picture.taken_state].filter(Boolean).join(", ")}, which is not where this polling unit is.`
    );
  }
  if (Number.isInteger(picture.days_from_poll) && heldOn) {
    if (picture.days_from_poll < 0) {
      flags.push(`The file says it was photographed ${Math.abs(picture.days_from_poll)} day(s) before polling day.`);
    } else if (picture.days_from_poll > 1) {
      flags.push(`The file says it was photographed ${picture.days_from_poll} days after polling day.`);
    }
  }
  return flags;
}

const KINDS = { PRES: "PRESIDENTIAL", GOV: "GOVERNORSHIP", SEN: "SENATE", REPS: "REPRESENTATIVES", ASSEMBLY: "ASSEMBLY" };

/**
 * The Poll360 project an INEC election plainly belongs with, or null.
 *
 * Same contest, same year, and — for anything narrower than the country — a
 * project that names the same state, by its scope or in its title. It answers
 * only when exactly one project fits. Two candidates is a decision for a
 * person, and tying an election to the wrong project would hold one night's
 * returns against another's sheets.
 */
export function projectFor(election, projects = [], states = []) {
  const kind = KINDS[election?.type_code];
  if (!kind || !election.year) return null;

  const state = String(election.state_name ?? "").toLowerCase();
  const code = states.find((entry) => String(entry.name).toLowerCase() === state)?.code ?? null;

  const fits = projects.filter((project) => {
    if (project.isDemo && election.year !== 2023) return false;
    if (String(project.kind ?? "").toUpperCase() !== kind) return false;

    const year = project.votesOn ? new Date(project.votesOn).getFullYear() : Number(String(project.title).match(/\b(20\d{2})\b/)?.[1]);
    if (year !== election.year) return false;

    if (!state) return true;
    const title = String(project.title ?? "").toLowerCase();
    return (code && project.scopeStates?.includes(code)) || title.includes(state);
  });

  return fits.length === 1 ? fits[0] : null;
}
