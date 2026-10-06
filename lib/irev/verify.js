import { STATES } from "../units.js";
import { bank } from "./bank.js";
import { compare, projectFor } from "./compare.js";
import * as vault from "./vault.js";

/**
 * The verification account: INEC's published sheets for a project's own
 * election, added up by place and held against the returns we filed.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE PROJECT, ONE ELECTION, AND NOTHING FROM ANY OTHER
 *
 *  The 2023 project is held against INEC's 2023 presidential sheets and only
 *  those. The pairing is made once — same contest, same year, same state, and
 *  only where exactly one election fits — and written down, so the room and
 *  the INEC screen can never be looking at two different elections under one
 *  project's name. See `projectFor` in ./compare.js.
 *
 *  ── THREE COLUMNS OF FIGURES, AND WHY THEY ARE NOT TWO ──────────────────
 *  INEC's sheets cover every polling unit it has published. Our returns cover
 *  the units our agents reached. Setting those two totals beside each other
 *  compares different sets of polling units and proves nothing. So every
 *  place carries:
 *
 *    inec     every sheet of INEC's that was read and adds up
 *    shared   the polling units both of us hold, INEC's figures and ours for
 *             exactly those units, party by party
 *
 *  A gap in `shared` is a real gap. A gap between `inec` and our total is
 *  only coverage.
 *
 *  ── WHAT COUNTS AS IRREGULAR ────────────────────────────────────────────
 *  Named, per polling unit, in words: figures that differ from ours; more
 *  votes than accredited voters; more accredited than registered; a sheet
 *  whose own unit code is another unit's; a sheet photographed in another
 *  state, before polling day or days after it; a sheet that was replaced; a
 *  unit we hold a return for with no sheet published. A reading that does not
 *  add up is not on that list — that is the reader's doubt, not INEC's
 *  conduct, and it is counted on its own.
 * ══════════════════════════════════════════════════════════════════════════
 */

const digits = (value) => String(value ?? "").replace(/\D/g, "");

/** How much of a unit's code names each step down: state, LGA, ward, unit. */
const WIDTHS = [2, 5, 8, 12];
const LEVELS = ["state", "lga", "ward", "unit"];
/** What is counted about how INEC published, place by place. */
const PARTS = ["picture", "overvote", "paper", "missing", "late", "gone"];
/** The level an announcement was filed at, as lib/declared.js names it. */
const ANNOUNCED_AT = ["STATE", "LGA", "WARD", "UNIT"];

/** The step a code so far stands at: 0 for the country, 3 for inside a ward. */
export function depthOf(under) {
  const parts = String(under ?? "").split("/").filter(Boolean);
  return Math.min(parts.length, 3);
}

/** "05/16/01" tidied, or "" where it is not a code. */
export function tidyUnder(under) {
  const parts = String(under ?? "").split("/").map((part) => part.replace(/\D/g, "")).filter(Boolean).slice(0, 3);
  if (parts.some((part, index) => part.length !== 2 || (index === 0 && Number(part) > 37))) return "";
  return parts.join("/");
}

const stateName = (number) => STATES.find((state) => state.number === number)?.name ?? `State ${number}`;
const stateCode = (number) => STATES.find((state) => state.number === number)?.code ?? null;

function nameOf(row, depth) {
  if (depth === 0) return stateName(row.key.slice(0, 2));
  if (depth === 1) return row.lga_name ?? row.key;
  if (depth === 2) return row.ward_name ?? row.key;
  return row.unit_name ?? row.key;
}

const tally = (into, votes) => {
  for (const [party, value] of Object.entries(votes ?? {})) {
    if (party !== "OTH") into[party] = (into[party] ?? 0) + Number(value ?? 0);
  }
  return into;
};

/**
 * What is wrong with one flagged unit, in the order it matters.
 *
 * Each line carries the family it belongs to as well as its sentence, so a
 * screen can count "sheets photographed somewhere else" apart from "more
 * votes than voters" without reading the words back. The families are named
 * in lib/verification.js.
 */
function marksFor(flag) {
  const out = [];
  const mark = (kind, level, says) => out.push({ kind, level, says });

  if (flag.place_ok === false) {
    mark("fraud", "SERIOUS", `photographed in ${[flag.taken_lga, flag.taken_state].filter(Boolean).join(", ")}, not where the unit is`);
  }
  if (Number.isInteger(flag.days_from_poll) && flag.days_from_poll < 0) mark("fraud", "SERIOUS", `photographed ${Math.abs(flag.days_from_poll)} day(s) before polling day`);
  if (Number.isInteger(flag.days_from_poll) && flag.days_from_poll > 1) mark("fraud", "WARNING", `photographed ${flag.days_from_poll} days after polling day`);
  if (flag.code_matches === false) mark("fraud", "SERIOUS", `the paper carries another unit's code (${flag.code_on_sheet})`);
  if (flag.sound && flag.valid_votes > flag.accredited) mark("rigging", "SERIOUS", `${flag.valid_votes} valid votes from ${flag.accredited} accredited voters`);
  if (flag.sound && flag.registered != null && flag.accredited > flag.registered) mark("rigging", "SERIOUS", `${flag.accredited} accredited from ${flag.registered} registered`);
  if (flag.earlier_sheets > 0) mark("fraud", "WARNING", `the sheet was replaced ${flag.earlier_sheets} time(s)`);
  /* Listed on the portal as published, and the file is not there. */
  if (flag.no_file || flag.picture_status === "gone" || flag.read_status === "gone") mark("fraud", "WARNING", "listed as published, and the file is no longer there");
  /* The two that are about when, not what. Only ever in the list when it was
     asked for by name: there are thousands, and they would bury the rest. */
  if (flag.sheet_up === false && !flag.no_voters) mark("missing", "INFO", "INEC has published no sheet for this polling unit");
  if (Number.isInteger(flag.days_after) && flag.days_after >= 2) mark("missing", "INFO", `the sheet went up ${flag.days_after} days after polling day`);
  return out;
}

/**
 * The account for one place, from what the database returned and the returns
 * we hold. Pure: everything it needs is handed to it.
 */
export function buildAccount({ under = "", totals = [], votes = [], flags = [], ourRows = [], held = [], announced = [] }) {
  const depth = depthOf(under);
  const width = WIDTHS[depth];
  const keyOf = (code) => String(code ?? "").slice(0, width);
  const inside = (code) => String(code ?? "").startsWith(under);

  const byKey = new Map();
  for (const row of totals) {
    byKey.set(row.key, {
      key: row.key,
      name: nameOf(row, depth),
      stateCode: depth === 0 ? stateCode(row.key.slice(0, 2)) : null,
      unitId: depth === 3 ? row.unit_id : null,
      units: row.units,
      sheets: row.sheets,
      read: row.read,
      sound: row.sound,
      doubt: row.doubt,
      irregular: row.odd_picture + row.overvote + row.wrong_paper,
      replaced: row.replaced,
      /* The same three, kept apart, so a screen can say how many of each. */
      parts: {
        picture: row.odd_picture,
        overvote: row.overvote,
        paper: row.wrong_paper,
        /* How INEC published, counted over every unit and not only ours. */
        missing: row.missing ?? 0,
        late: row.late ?? 0,
        gone: row.gone ?? 0,
      },
      inec: { votes: {}, valid: row.valid, accredited: row.accredited, rejected: row.rejected, registered: row.registered },
      ours: { returns: 0, votes: {} },
      shared: { units: 0, agree: 0, differ: 0, unsure: 0, noSheet: 0, inec: {}, ours: {} },
      /* What INEC announced for exactly this place, where it announced at
         this level. Never rolled up from finer announcements: half a state's
         local governments added together is not the state's result. */
      announced: null,
    });
  }
  for (const row of announced) {
    const place = byKey.get(row.key);
    if (place && row.level === ANNOUNCED_AT[depth]) {
      place.announced = { votes: tally({}, row.votes), accredited: row.accredited ?? null, rejected: row.rejected ?? null };
    }
  }
  for (const row of votes) {
    const place = byKey.get(row.key);
    if (place && row.party !== "OTH") place.inec.votes[row.party] = row.votes;
  }

  /* Our returns, and the comparison unit by unit, filed under the same keys. */
  const ours = ourRows.filter((row) => inside(row.unitCode));
  const theirs = new Map(held.map((unit) => [digits(unit.pu_code), unit]));
  const judged = compare(ours, held.filter((unit) => unit.status === "read"));
  const differing = new Map(judged.differ.map((unit) => [digits(unit.unitCode), unit]));

  const seen = new Set();
  for (const row of ours) {
    const code = digits(row.unitCode);
    if (seen.has(code)) continue;
    seen.add(code);

    const place = byKey.get(keyOf(row.unitCode));
    if (!place) continue;
    place.ours.returns += 1;
    tally(place.ours.votes, row.votes);

    const unit = theirs.get(code);
    if (!unit?.sheet_up) {
      place.shared.noSheet += 1;
      continue;
    }
    if (unit.status !== "read") continue;

    place.shared.units += 1;
    if (!unit.balanced || unit.code_matches === false) {
      place.shared.unsure += 1;
      continue;
    }
    tally(place.shared.inec, unit.party_votes);
    tally(place.shared.ours, row.votes);
    if (differing.has(code)) place.shared.differ += 1;
    else place.shared.agree += 1;
  }

  const children = [...byKey.values()].map((place) => ({
    ...place,
    /* The worst thing known about a place decides how it is drawn. */
    status:
      place.shared.differ > 0 || place.irregular > 0
        ? "irregular"
        : place.doubt > 0 || place.shared.unsure > 0
          ? "doubt"
          : place.shared.agree > 0
            ? "agree"
            : place.sound > 0
              ? "read"
              : place.sheets > 0
                ? "waiting"
                : "none",
  }));

  /* The place itself is the sum of what is under it. */
  const whole = children.reduce(
    (sum, place) => {
      for (const name of ["units", "sheets", "read", "sound", "doubt", "irregular", "replaced"]) sum[name] += place[name];
      for (const name of ["valid", "accredited", "rejected", "registered"]) sum.inec[name] += place.inec[name];
      tally(sum.inec.votes, place.inec.votes);
      sum.ours.returns += place.ours.returns;
      tally(sum.ours.votes, place.ours.votes);
      if (place.announced) {
        sum.announced.places += 1;
        tally(sum.announced.votes, place.announced.votes);
      }
      for (const name of PARTS) sum.parts[name] += place.parts?.[name] ?? 0;
      for (const name of ["units", "agree", "differ", "unsure", "noSheet"]) sum.shared[name] += place.shared[name];
      tally(sum.shared.inec, place.shared.inec);
      tally(sum.shared.ours, place.shared.ours);
      return sum;
    },
    {
      units: 0, sheets: 0, read: 0, sound: 0, doubt: 0, irregular: 0, replaced: 0,
      parts: Object.fromEntries(PARTS.map((name) => [name, 0])),
      inec: { votes: {}, valid: 0, accredited: 0, rejected: 0, registered: 0 },
      ours: { returns: 0, votes: {} },
      shared: { units: 0, agree: 0, differ: 0, unsure: 0, noSheet: 0, inec: {}, ours: {} },
      announced: { places: 0, votes: {} },
    }
  );

  /* Every irregularity under this place, one line a unit. */
  const listed = new Map();
  const add = (code, entry) => {
    const key = digits(code);
    const kept = listed.get(key) ?? { unitCode: code, unitId: entry.unitId ?? null, name: entry.name ?? null, weight: 0, what: [], marks: [] };
    kept.unitId = kept.unitId ?? entry.unitId ?? null;
    kept.name = kept.name ?? entry.name ?? null;
    kept.weight += entry.weight;
    kept.what.push(...entry.marks.map((mark) => mark.says));
    kept.marks.push(...entry.marks);
    listed.set(key, kept);
  };

  for (const unit of judged.differ) {
    add(unit.unitCode, {
      unitId: unit.unitId,
      name: theirs.get(digits(unit.unitCode))?.unit_name,
      weight: 1000 + unit.size,
      marks: [
        {
          kind: "mismatch",
          level: "SERIOUS",
          says: `differs from our return: ${unit.gaps.slice(0, 4).map((gap) => `${gap.what} ${gap.ours} ours, ${gap.inec} INEC`).join("; ")}`,
          /* The figures themselves, for a screen that sets them side by side. */
          gaps: unit.gaps.slice(0, 12),
        },
      ],
    });
  }
  for (const flag of flags) {
    const marks = marksFor(flag);
    if (marks.length) add(flag.pu_code, { unitId: flag.unit_id, name: flag.unit_name, weight: flag.place_ok === false ? 500 : 100, marks });
  }
  for (const row of ours) {
    const unit = theirs.get(digits(row.unitCode));
    if (unit && !unit.sheet_up) add(row.unitCode, { unitId: unit.unit_id, name: unit.unit_name, weight: 50, marks: [{ kind: "missing", level: "INFO", says: "we hold a return, and INEC has published no sheet" }] });
  }

  return {
    under,
    level: LEVELS[depth],
    children,
    whole,
    flags: [...listed.values()].sort((a, b) => b.weight - a.weight).slice(0, 80),
    flagged: listed.size,
  };
}

/** The crumbs from the country down to `under`, each with its name. */
async function crumbs(db, electionId, under) {
  const parts = under ? under.split("/") : [];
  const out = [{ key: "", name: "Nigeria" }];
  for (let depth = 0; depth < parts.length; depth += 1) {
    const key = parts.slice(0, depth + 1).join("/");
    let name = stateName(parts[0]);
    if (depth > 0) {
      const [row] = await vault.placeTotals(db, electionId, key, key.length);
      name = depth === 1 ? (row?.lga_name ?? key) : (row?.ward_name ?? key);
    }
    out.push({ key, name, stateCode: depth === 0 ? stateCode(parts[0]) : null });
  }
  return out;
}

/**
 * The INEC election a project is held against, pairing them where that has
 * not been done and exactly one election fits.
 */
async function electionOf(db, project) {
  const paired = await vault.electionForProject(db, project.id);
  if (paired) return paired;

  const fits = (await vault.elections(db)).filter((election) => !election.project_id && projectFor(election, [project], STATES));
  if (fits.length !== 1) return null;
  await vault.linkProject(db, fits[0].election_id, project.id);
  return vault.electionForProject(db, project.id);
}

/**
 * The whole account for one place under a project.
 *
 * ── IT CAN ONLY EVER ADD TO THE ROOM, NEVER BREAK IT ───────────────────────
 * The situation room must come up whether or not anything was ever gathered
 * from IReV. Every way this can fail — no Data Bank address, no account, no
 * election that fits the project, a query that fails — is caught here and
 * comes back as `{ none: true, why }`, which the screen turns into a sentence
 * and, where there is one, the button that puts it right.
 */
export async function inecAgainstOurs(project, rows, under = "", announced = []) {
  if (!project?.id) return null;

  try {
    const db = bank();
    if (!db) return { none: true, why: "no-bank" };
    /* `ready`, not merely open: an account opened by an earlier version is
       given the tables this reads before it is read. */
    if (!(await vault.ready(db))) return { none: true, why: "not-opened" };

    const election = await electionOf(db, project);
    /* Nothing of INEC's is tied to this project. Said, so the screen can say
       where to go, and not confused with "could not be reached". */
    if (!election) {
      const listed = (await vault.elections(db)).length;
      return { none: true, why: listed ? "no-election" : "not-listed" };
    }
    if (!(election.gathered_at || election.pass_started_at)) {
      return { none: true, why: "not-gathered", election: { id: election.election_id, name: election.name } };
    }

    const at = tidyUnder(under);
    const width = WIDTHS[depthOf(at)];
    const ours = (rows ?? []).filter((row) => String(row.unitCode ?? "").startsWith(at));

    const [totals, votes, flags, held, path, progress] = await Promise.all([
      /* Polling day goes with it: without one nothing can be called late. */
      vault.placeTotals(db, election.election_id, at, width, election.held_on ?? null),
      vault.placeVotes(db, election.election_id, at, width),
      vault.placeFlags(db, election.election_id, at, { heldOn: election.held_on ?? null, limit: 80 }),
      vault.unitsByCode(db, election.election_id, ours.map((row) => row.unitCode)),
      crumbs(db, election.election_id, at),
      vault.progress(db, election.election_id),
    ]);

    return {
      election: {
        id: election.election_id,
        name: election.name,
        heldOn: election.held_on,
        gathering: Boolean(election.pass_started_at),
        /* Whether this election's sheets are being read into figures at all.
           Where they are not, the screen says so and does not wait for them. */
        reading: Boolean(election.reading),
        gathered: Boolean(election.gathered_at),
        progress,
      },
      crumbs: path,
      ...buildAccount({ under: at, totals, votes, flags, ourRows: ours, held, announced }),
    };
  } catch (error) {
    /* The room still comes up. But the reason is carried to the screen: a
       section that silently vanishes cannot be told from one never built. */
    return { none: true, why: "error", message: String(error?.message ?? error).slice(0, 200) };
  }
}
