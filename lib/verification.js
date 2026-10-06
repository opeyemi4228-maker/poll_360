import { STATES, parseUnitCode } from "./units.js";

/**
 * Verification: three records of one election, held together.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THE VERIFICATION SCREEN IS ACTUALLY ASKING
 *
 *  There are three independent records of every polling unit:
 *
 *    OUR AGENTS   what the person we sent wrote down at the booth
 *    INEC'S SHEETS what the commission photographed and published on IReV,
 *                 read into figures
 *    ANNOUNCED    what the commission then declared
 *
 *  The screen asks one question of every place: do they say the same thing?
 *  Where they do, the place is green. Where any two of them do not, it is red.
 *  Everything else on the screen is the evidence for that one answer.
 *
 *  The three were being compared already, in three different files that never
 *  met — lib/irev/verify.js, lib/divergence.js and lib/anomalies.js — so no
 *  screen could say "this state agrees" and mean all three. This file is where
 *  they meet. It computes nothing new about a return; it reads what those
 *  three already found and puts it in one shape.
 *
 *  ── LIKE FOR LIKE, OR NOT AT ALL ────────────────────────────────────────
 *  Our agents cover some polling units; INEC's sheets cover the ones it has
 *  published; an announcement covers a whole place. Two totals over different
 *  ground always differ, and calling that a disagreement paints the country
 *  red on the first night and teaches a room to ignore the colour. So a pair
 *  is only ever judged where both sides describe exactly the same polling
 *  units, and "not enough to compare yet" is a real answer with its own
 *  colour.
 *
 *  ── AND WHAT THE WORDS DO NOT CLAIM ─────────────────────────────────────
 *  "Signs of rigging" and "signs of fraud" are the names of two families of
 *  finding, in the words a situation room uses. Every one of them is a fact
 *  that can be opened and checked against a sheet. None of them is a verdict
 *  on anybody: a person reads the sheet and decides.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Pure, and safe to run in a browser: everything it needs is handed to it.
 */

/** The families a finding belongs to, in the order a room reads them. */
export const KINDS = {
  rigging: {
    id: "rigging",
    label: "Signs of rigging",
    one: "Sign of rigging",
    what: "More votes than voters, a whole register turning out, or two counts naming different winners.",
  },
  fraud: {
    id: "fraud",
    label: "Signs of fraud",
    one: "Sign of fraud",
    what: "The paper itself is wrong: photographed somewhere else or on another day, replaced, or carrying another polling unit's code.",
  },
  mismatch: {
    id: "mismatch",
    label: "Figures that differ",
    one: "Figures differ",
    what: "The same polling units, written down differently by two of the three records.",
  },
  error: {
    id: "error",
    label: "Counting errors",
    one: "Counting error",
    what: "Figures that do not add up on the sheet itself.",
  },
  missing: {
    id: "missing",
    label: "Missing or late sheets",
    one: "Missing or late sheet",
    what: "INEC has published no sheet for the polling unit, or published it days after polling day.",
  },
  unusual: {
    id: "unusual",
    label: "Worth a second look",
    one: "Worth a second look",
    what: "Legal, and out of step with the places around it.",
  },
};

export const KIND_ORDER = ["rigging", "fraud", "mismatch", "error", "missing", "unusual"];

/** How loud a finding is. The same four words the room's alarm already uses. */
export const LEVEL_RANK = { CRITICAL: 4, SERIOUS: 3, WARNING: 2, INFO: 1 };

/** The three records, by the names printed on the screen. */
export const SOURCES = {
  agents: { id: "agents", label: "Our agents" },
  irev: { id: "irev", label: "INEC's sheets (IReV)" },
  announced: { id: "announced", label: "Announced" },
};

/** What a place can be, worst first. */
export const VERDICTS = {
  differs: { id: "differs", label: "Do not agree", says: "The records do not agree here" },
  agrees: { id: "agrees", label: "Agree", says: "The records agree here" },
  look: { id: "look", label: "Something to look at", says: "Nothing to compare yet, and something to look at" },
  waiting: { id: "waiting", label: "Nothing to compare yet", says: "Nothing to compare here yet" },
};

/**
 * Our own screening rules, sorted into the families above.
 *
 * The rule decides the family, never the severity word it was filed under: an
 * accredited figure above the register and a negative vote are both
 * "impossible", and they are not the same kind of thing at all. One is how a
 * box is stuffed and the other is how a form is mistyped.
 */
const OUR_RULES = {
  "accredited-over-register": ["rigging", "SERIOUS"],
  "ballots-over-accredited": ["rigging", "SERIOUS"],
  "turnout-near-total": ["rigging", "WARNING"],
  unanimous: ["rigging", "WARNING"],
  negative: ["error", "WARNING"],
  "accredited-no-votes": ["error", "WARNING"],
  "turnout-outlier": ["unusual", "INFO"],
  "last-digit": ["unusual", "INFO"],
};

const DECLARED_RULES = {
  IMPOSSIBLE: ["rigging", "CRITICAL"],
  FLIPPED: ["rigging", "CRITICAL"],
  DIVERGENT: ["mismatch", "SERIOUS"],
};

/** The same floor lib/divergence.js uses: a misread digit is not a finding. */
const TOLERANCE = { votes: 10, share: 0.02 };

const DEPTH_WORD = ["state", "lga", "ward", "unit"];

const number = (value) => new Intl.NumberFormat("en-NG").format(Math.round(value ?? 0));
const plural = (count, one, many = `${one}s`) => (count === 1 ? one : many);

/** "05/16" is inside "05", and inside itself. Everything is inside "". */
export function within(code, under) {
  if (!under) return true;
  const text = String(code ?? "");
  return text === under || text.startsWith(`${under}/`);
}

const depthOfKey = (key) => (key ? String(key).split("/").length - 1 : -1);
const stateOf = (code) => STATES.find((state) => state.number === String(code ?? "").slice(0, 2)) ?? null;

function leader(votes) {
  const ranked = Object.entries(votes ?? {})
    .filter(([party]) => party !== "OTH")
    .sort((a, b) => b[1] - a[1]);
  return ranked[0] && ranked[0][1] > 0 ? { party: ranked[0][0], votes: ranked[0][1] } : null;
}

/**
 * INEC's own sheets against INEC's own announcement, for one place.
 *
 * Only where every polling unit in the place has a sheet that was read and
 * adds up: anything less is two totals over different ground. Where it can be
 * judged it is the most serious comparison on the screen, because both sides
 * of it are the commission's.
 */
export function sheetsAgainstAnnounced(place) {
  if (!place?.announced) return { status: "waiting", why: "nothing-announced" };
  if (!place.units || (place.sound ?? 0) < place.units) return { status: "waiting", why: "sheets-unread" };

  const sheets = place.inec?.votes ?? {};
  const announced = place.announced.votes ?? {};
  const parties = [...new Set([...Object.keys(sheets), ...Object.keys(announced)])].filter((party) => party !== "OTH");
  const total = (votes) => parties.reduce((sum, party) => sum + Number(votes[party] ?? 0), 0);
  const scale = Math.max(total(sheets), total(announced), 1);

  const gaps = parties
    .map((party) => ({ what: party, irev: Number(sheets[party] ?? 0), announced: Number(announced[party] ?? 0) }))
    .filter((gap) => {
      const size = Math.abs(gap.irev - gap.announced);
      return size >= TOLERANCE.votes && size / scale >= TOLERANCE.share;
    })
    .sort((a, b) => Math.abs(b.irev - b.announced) - Math.abs(a.irev - a.announced));

  const first = { sheets: leader(sheets), announced: leader(announced) };
  const flipped = Boolean(first.sheets && first.announced && first.sheets.party !== first.announced.party);

  return { status: flipped || gaps.length ? "differs" : "agrees", gaps, flipped, first };
}

/**
 * Our agents against the announcement, for one place, from what
 * lib/divergence.js already worked out. It never judges coverage itself.
 */
function declaredSide(divergence, key) {
  if (!divergence?.ready) return "waiting";

  const flagged = (divergence.flags ?? []).some((flag) => flag.severity !== "UNMATCHED" && within(flag.key, key));
  if (flagged) return "differs";

  /* Held in full, compared, and nothing raised. The only way to say "agrees". */
  const passed = (divergence.checked ?? []).some((entry) => entry.mode === "COMPLETE" && within(entry.key, key));
  return passed ? "agrees" : "waiting";
}

/* ───────────────────────────────────────────────────────────── the updates */

/**
 * Every finding under a place, from all three comparisons, in one list.
 *
 * An update is one thing somebody can open: what was found, where, between
 * which records, how loud it is, and the figures behind it. Its id does not
 * change between refreshes, because the alarm decides what is new by id and
 * an id that moves is an alarm that sounds twice.
 */
export function updatesOf({ account = null, integrity = null, sheetFindings = [], divergence = null, under = "" } = {}) {
  const out = [];
  const place = (code) => {
    const at = parseUnitCode(code);
    const state = stateOf(code);
    return {
      code: at?.code ?? String(code ?? ""),
      level: at ? "unit" : (DEPTH_WORD[depthOfKey(code)] ?? "place"),
      stateNumber: state?.number ?? null,
      stateName: state?.name ?? null,
      stateCode: state?.code ?? null,
    };
  };

  /* ── our agents' own returns, screened ─────────────────────────────── */
  const actionOf = new Map((integrity?.work ?? []).map((unit) => [unit.unitCode, unit.action]));
  for (const flag of integrity?.flags ?? []) {
    const [kind, level] = OUR_RULES[flag.rule] ?? ["unusual", "INFO"];
    const isUnit = Boolean(parseUnitCode(flag.unitCode));
    /* The digit pattern is a finding about the whole batch and names no
       place, so it belongs to the country and to nowhere inside it. */
    if (isUnit ? !within(flag.unitCode, under) : Boolean(under)) continue;

    out.push({
      id: `agents:${flag.id}`,
      kind,
      level,
      between: ["agents"],
      title: flag.says,
      why: flag.why,
      where: isUnit ? place(flag.unitCode) : { code: "", level: "country", stateNumber: null, stateName: null, stateCode: null },
      unitCode: isUnit ? flag.unitCode : null,
      action: actionOf.get(flag.unitCode) ?? null,
      weight: 0,
    });
  }

  /* ── the result sheet's own boxes, which should add up ─────────────── */
  for (const sheet of sheetFindings ?? []) {
    if (!within(sheet.unitCode, under)) continue;
    const [first, ...rest] = sheet.findings ?? [];
    out.push({
      id: `sheet:${sheet.unitCode}`,
      kind: "error",
      level: "WARNING",
      between: ["agents"],
      title: first?.says ?? "The boxes on this result sheet do not add up",
      why:
        [first?.why, ...rest.map((finding) => finding.says)].filter(Boolean).join(" ") ||
        "The figures written on the sheet contradict each other.",
      where: place(sheet.unitCode),
      unitCode: sheet.unitCode,
      action: "CHECK",
      weight: sheet.worst ?? 0,
    });
  }

  /* ── INEC's published sheets, against ours and on their own terms ──── */
  for (const flag of account?.flags ?? []) {
    const seen = {};
    for (const mark of flag.marks ?? []) {
      const nth = (seen[mark.kind] = (seen[mark.kind] ?? 0) + 1);
      out.push({
        id: `irev:${flag.unitCode}:${mark.kind}:${nth}`,
        kind: mark.kind,
        level: mark.level,
        between: mark.kind === "mismatch" || mark.kind === "missing" ? ["agents", "irev"] : ["irev"],
        title: mark.says.charAt(0).toUpperCase() + mark.says.slice(1),
        why: WHY_IREV[mark.kind],
        where: { ...place(flag.unitCode), name: flag.name ?? null },
        unitCode: flag.unitCode,
        unitId: flag.unitId ?? null,
        gaps: mark.gaps ?? null,
        action: mark.kind === "missing" ? "CHASE" : "CHECK",
        weight: flag.weight ?? 0,
      });
    }
  }

  /* ── our agents against what was announced ─────────────────────────── */
  for (const flag of divergence?.flags ?? []) {
    const sorted = DECLARED_RULES[flag.severity];
    if (!sorted || !within(flag.key, under)) continue;
    out.push({
      id: `announced:${flag.id}`,
      kind: sorted[0],
      level: sorted[1],
      between: ["agents", "announced"],
      title: flag.says,
      why: flag.why,
      where: { ...place(flag.key), level: String(flag.level ?? "").toLowerCase() },
      unitCode: flag.level === "UNIT" ? flag.key : null,
      gaps:
        typeof flag.ours === "number" && typeof flag.declared === "number"
          ? [{ what: flag.party ?? "Total", ours: flag.ours, announced: flag.declared }]
          : null,
      action: "CHECK",
      weight: flag.difference ?? 0,
    });
  }

  /* ── INEC's sheets against INEC's announcement ─────────────────────── */
  for (const child of account?.children ?? []) {
    const judged = sheetsAgainstAnnounced(child);
    if (judged.status !== "differs") continue;

    const size = judged.gaps.reduce((sum, gap) => sum + Math.abs(gap.irev - gap.announced), 0);
    out.push({
      id: `cross:${child.key}`,
      kind: judged.flipped ? "rigging" : "mismatch",
      level: "CRITICAL",
      between: ["irev", "announced"],
      title: judged.flipped
        ? `INEC's own sheets put ${judged.first.sheets.party} ahead in ${child.name}; ${judged.first.announced.party} was announced`
        : `INEC's own sheets do not add up to what was announced in ${child.name}`,
      why: `Every one of the ${number(child.units)} polling ${plural(child.units, "unit")} here has a published sheet that was read and adds up, so the two totals describe exactly the same ground. Both of them are the commission's own.`,
      where: { ...place(child.key), name: child.name },
      unitCode: null,
      gaps: judged.gaps,
      action: "CHECK",
      weight: 100000 + size,
    });
  }

  return out.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.weight - a.weight);
}

const WHY_IREV = {
  mismatch:
    "Our agent and INEC's published sheet describe the same polling unit and give different figures. One was copied wrongly or one was changed, and the two photographs settle which.",
  missing:
    "Our agent filed a result here, and there is nothing on INEC's portal to hold it against. Until a sheet is published nobody outside the commission can check this polling unit.",
  fraud:
    "The published sheet is not what it should be for this polling unit. That is a fact about the paper, and a person should open it before anything is said about why.",
  rigging:
    "The figures on INEC's published sheet cannot all be true at once. More votes than voters is not something a slow count or a tired hand produces.",
};

/* ─────────────────────────────────────────────────────────────── the count */

function tally(updates) {
  const by = {};
  for (const update of updates) {
    const source = update.id.slice(0, update.id.indexOf(":"));
    by[source] ??= {};
    by[source][update.kind] = (by[source][update.kind] ?? 0) + 1;
  }
  return (source, kind) => by[source]?.[kind] ?? 0;
}

/**
 * How many of each family there are in one place, exactly.
 *
 * The list of INEC findings is capped at the most serious few dozen, so
 * counting the list would put a number on the screen that is really the
 * length of a page. Where the database has already counted every sheet, that
 * count is used; the list only ever raises it.
 */
function countsFor(listed, aggregate) {
  const count = tally(listed);
  const parts = aggregate?.parts ?? {};
  const shared = aggregate?.shared ?? {};

  const counts = {
    rigging:
      count("agents", "rigging") + count("announced", "rigging") + count("cross", "rigging") +
      Math.max(count("irev", "rigging"), parts.overvote ?? 0),
    fraud: Math.max(count("irev", "fraud"), (parts.picture ?? 0) + (parts.paper ?? 0) + (aggregate?.replaced ?? 0)),
    mismatch:
      count("announced", "mismatch") + count("cross", "mismatch") +
      Math.max(count("irev", "mismatch"), shared.differ ?? 0),
    error: count("agents", "error") + count("sheet", "error"),
    /* Polling units we hold a result for and INEC has published no sheet
       for: the ones somebody here can chase. */
    missing: Math.max(count("irev", "missing"), shared.noSheet ?? 0),
    unusual: count("agents", "unusual"),
  };

  return {
    ...counts,
    total: KIND_ORDER.reduce((sum, kind) => sum + counts[kind], 0),
    /* ── HOW THE COMMISSION PUBLISHED, COUNTED AND KEPT APART ──────────────
       Every polling unit INEC left without a sheet, every sheet that went up
       days late, every one listed with no file behind it. For 2023 that is
       seven sheets in ten. Added into `total` it made the headline "125,963
       irregularities", turned every state the colour of "something to look
       at", and drowned the one finding a person could act on. It is a
       measure of the publishing, with its own strip and its own drill, and
       it never makes a place a finding on its own. */
    published: {
      units: aggregate?.units ?? 0,
      sheets: aggregate?.sheets ?? 0,
      missing: parts.missing ?? 0,
      late: parts.late ?? 0,
      gone: parts.gone ?? 0,
    },
  };
}

/* ───────────────────────────────────────────────────────────── the verdict */

/**
 * The whole verification picture for the place on screen.
 *
 * @param account       lib/irev/verify.js's account for this place, or the
 *                      `{ none: true }` it returns when nothing is gathered
 * @param integrity     lib/anomalies.js `integrityOf`
 * @param sheetFindings lib/pulse.js `sheetAudits`
 * @param divergence    lib/gap-report.js `gapReport`
 * @param sheetFails    how many of our sheets fail their own arithmetic, where
 *                      the caller holds the exact figure (the list is capped)
 */
export function verificationOf({ account = null, integrity = null, sheetFindings = [], divergence = null, sheetFails = null } = {}) {
  const compared = Boolean(account?.children);
  const under = compared ? (account.under ?? "") : "";
  const depth = under ? under.split("/").length : 0;

  const updates = updatesOf({ account: compared ? account : null, integrity, sheetFindings, divergence, under });

  /* The places one step down. Without INEC's sheets there is still a country
     to draw: the states, judged on our returns against the announcement. */
  const below = compared
    ? account.children
    : STATES.map((state) => ({ key: state.number, name: state.name, stateCode: state.code }));

  const places = below.map((child) => {
    const listed = updates.filter((update) => within(update.where.code, child.key));
    const counts = countsFor(listed, child);
    const pairs = {
      "agents-irev": child.shared?.differ > 0 ? "differs" : child.shared?.agree > 0 ? "agrees" : "waiting",
      "agents-announced": declaredSide(divergence, child.key),
      "irev-announced": sheetsAgainstAnnounced(child).status,
    };
    const states = Object.values(pairs);

    return {
      key: child.key,
      name: child.name,
      stateCode: child.stateCode ?? null,
      unitId: child.unitId ?? null,
      pairs,
      counts,
      verdict: states.includes("differs")
        ? "differs"
        : states.includes("agrees")
          ? "agrees"
          : counts.total > 0 || (child.doubt ?? 0) > 0 || (child.shared?.unsure ?? 0) > 0
            ? "look"
            : "waiting",
      raw: compared ? child : null,
    };
  });

  const counts = countsFor(updates, compared ? account.whole : null);
  /* Our own failed sheets are listed worst-first and capped. At the country
     the exact figure is known, so it replaces the length of the list. */
  if (!under && sheetFails != null) {
    const listed = updates.filter((update) => update.id.startsWith("sheet:")).length;
    if (sheetFails > listed) {
      counts.error += sheetFails - listed;
      counts.total += sheetFails - listed;
    }
  }

  const of = (verdict) => places.filter((item) => item.verdict === verdict).length;
  const totals = { agrees: of("agrees"), differs: of("differs"), look: of("look"), waiting: of("waiting"), places: places.length };

  return {
    compared,
    under,
    level: compared ? account.level : "state",
    childWord: DEPTH_WORD[depth] ?? "unit",
    places,
    updates,
    counts,
    totals,
    pairs: scopePairs({ account: compared ? account : null, divergence, under, places }),
    /* One word for the whole screen: is anything wrong. */
    state: totals.differs ? "differs" : totals.agrees ? "agrees" : counts.total ? "look" : "waiting",
  };
}

/** The three pairs for the place on screen, each with a sentence. */
function scopePairs({ account, divergence, under, places }) {
  const whole = account?.whole ?? null;
  const shared = whole?.shared ?? { agree: 0, differ: 0, units: 0 };

  const flags = (divergence?.flags ?? []).filter((flag) => flag.severity !== "UNMATCHED" && within(flag.key, under));
  const passed = (divergence?.checked ?? []).filter((entry) => entry.mode === "COMPLETE" && within(entry.key, under)).length;
  const thin = (divergence?.checked ?? []).filter((entry) => entry.mode === "PARTIAL" && within(entry.key, under)).length;
  const differing = new Set(flags.map((flag) => `${flag.level}:${flag.key}`)).size;

  const cross = { differs: 0, agrees: 0 };
  for (const item of places) if (cross[item.pairs["irev-announced"]] !== undefined) cross[item.pairs["irev-announced"]] += 1;
  const announcedHere = whole?.announced?.places ?? 0;

  return [
    {
      id: "agents-irev",
      between: ["agents", "irev"],
      status: shared.differ > 0 ? "differs" : shared.agree > 0 ? "agrees" : "waiting",
      says:
        shared.agree + shared.differ > 0
          ? `${number(shared.agree)} polling ${plural(shared.agree, "unit")} agree, ${number(shared.differ)} ${plural(shared.differ, "differs", "differ")}`
          : account
            ? "No polling unit is held by both yet"
            : "INEC's sheets have not been gathered yet",
    },
    {
      id: "agents-announced",
      between: ["agents", "announced"],
      status: differing ? "differs" : passed ? "agrees" : "waiting",
      says: !divergence?.ready
        ? "Nothing has been announced yet"
        : differing
          ? `${number(differing)} ${plural(differing, "place")} ${plural(differing, "differs", "differ")} from what was announced`
          : passed
            ? `${number(passed)} ${plural(passed, "place")} held in full, and ${plural(passed, "it agrees", "they agree")}`
            : thin
              ? "We do not hold every polling unit in any announced place yet"
              : "Nothing announced here that we hold returns for",
    },
    {
      id: "irev-announced",
      between: ["irev", "announced"],
      status: cross.differs ? "differs" : cross.agrees ? "agrees" : "waiting",
      says: cross.differs
        ? `${number(cross.differs)} ${plural(cross.differs, "place")} where the sheets do not add up to the announcement`
        : cross.agrees
          ? `${number(cross.agrees)} ${plural(cross.agrees, "place")} fully read, and ${plural(cross.agrees, "it adds", "they add")} up to the announcement`
          : !account
            ? "INEC's sheets have not been gathered yet"
            : announcedHere
              ? "Not every sheet in an announced place has been read yet"
              : "Nothing has been announced here yet",
    },
  ];
}

/**
 * What the alarm is allowed to sound for.
 *
 * A missing sheet or an unusual turnout is worth reading and is not worth
 * turning a room round for. An alarm that sounds for everything is an alarm
 * somebody mutes, and then it is silent for the one that mattered.
 */
export function alarmRows(updates = []) {
  return updates
    .filter((update) => LEVEL_RANK[update.level] >= LEVEL_RANK.WARNING)
    .map((update) => ({ id: update.id, level: update.level }));
}
