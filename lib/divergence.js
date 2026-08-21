import { parties, others } from "./election2023.js";
import { LEVELS, keyAt } from "./declared.js";

/**
 * Holding our count against the declared one.
 *
 * ── WHAT A PARALLEL COUNT IS ACTUALLY FOR ──────────────────────────────────
 * Not speed. A second, independently sourced figure for the same booths, so
 * that when the commission announces a number there is something to hold it
 * against other than trust. lib/anomalies.js asks whether a return can be true
 * on its own terms. This asks a different question: two people wrote down the
 * same sheet, and they wrote different things — which figure moved, by how
 * much, and did the movement change who won.
 *
 * ── THE COVERAGE TRAP, AND WHY MOST OF THIS FILE IS ABOUT IT ───────────────
 * The obvious implementation compares our ward total to the declared ward
 * total and flags the difference. It is wrong, and it is wrong in the most
 * dangerous possible direction: if we have agents in nine of a ward's twenty
 * booths, our total is *supposed* to be lower. Flagging that produces a
 * dashboard where every ward in the country is red on election night, which
 * means the three wards that are genuinely wrong are invisible, and the first
 * person to notice that the alarm fires for everything stops believing it.
 *
 * So aggregates are compared in one of two modes and the mode is always
 * stated on screen:
 *
 *   COMPLETE  every unit under this place has both a return from us and a
 *             declared figure. The two totals are answering the same
 *             question, so every rule below applies.
 *
 *   PARTIAL   we cover some of it. Exactly one rule survives, and it survives
 *             because it does not depend on coverage at all: what we counted
 *             cannot exceed what was declared for a place that contains it.
 *             Nine booths cannot produce more APC votes than the whole ward
 *             was announced as producing, at any level of coverage, ever.
 *             Everything else is reported as "not enough coverage to compare",
 *             in those words, rather than as a finding.
 *
 * A dashboard that says "I cannot tell you yet" is worth more than one that
 * guesses, because the second one is only wrong once before nobody reads it.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const DIVERGENCE = {
  /* Arithmetic that cannot hold whatever the coverage. No innocent reading. */
  IMPOSSIBLE: { rank: 4, label: "Impossible", tone: "alert" },
  /* The two sources name different winners. The most consequential thing this
     file can find, and the reason anybody funds a parallel count. */
  FLIPPED: { rank: 3, label: "Winner differs", tone: "alert" },
  /* Same winner, different figures, beyond what transcription explains. */
  DIVERGENT: { rank: 2, label: "Figures differ", tone: "warn" },
  /* One side has a figure and the other has none. Usually timing. */
  UNMATCHED: { rank: 1, label: "Unmatched", tone: "neutral" },
};

const PARTY_IDS = [...parties.map((party) => party.id), others.id];
const NAMED = new Map([...parties, others].map((party) => [party.id, party.name]));

/**
 * How much difference is transcription and how much is a finding.
 *
 * ── WHY THERE IS A FLOOR AND A SHARE, AND BOTH MUST BE CLEARED ─────────────
 * Two people copying the same handwritten sheet will disagree occasionally: a
 * 3 read as an 8 moves a figure by five. A rule with only a percentage flags
 * that at a tiny booth (5 votes out of 40 is 12%) and misses a stolen thousand
 * at a large one. A rule with only a flat floor flags every large unit and no
 * small one. So a difference has to clear both to be reported: at least this
 * many votes, *and* at least this share of the place's total.
 *
 * A single misread digit is left alone. Two hundred votes is not a misread.
 */
const TOLERANCE = { votes: 10, share: 0.02 };

/* ── the shapes going in ──────────────────────────────────────────────────── */

/** Our returns, rolled up to a level, keyed by that level's code. */
function ourTotals(rows, level) {
  const map = new Map();

  for (const row of rows) {
    const key = keyAt(row.unitCode, level);
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, {
        key,
        units: new Set(),
        registered: 0,
        accredited: 0,
        rejected: 0,
        votes: {},
      });
    }

    const node = map.get(key);
    node.units.add(row.unitCode);
    node.registered += row.registered ?? 0;
    node.accredited += row.accredited ?? 0;
    node.rejected += row.rejected ?? 0;

    for (const [party, count] of Object.entries(row.votes ?? {})) {
      const id = voteName(party);
      node.votes[id] = (node.votes[id] ?? 0) + count;
    }
  }

  for (const node of map.values()) node.total = sum(node.votes);
  return map;
}

/** A party id, whether the record was keyed by name or by position. */
function voteName(key) {
  if (!/^\d+$/.test(key)) return key;
  return [...parties, others][Number(key)]?.id ?? key;
}

const sum = (votes) => Object.values(votes ?? {}).reduce((total, value) => total + (value ?? 0), 0);

/** Who leads, and by how much, ignoring parties neither source carries. */
function leader(votes) {
  const ranked = Object.entries(votes ?? {})
    .filter(([id]) => id !== others.id)
    .sort((a, b) => b[1] - a[1]);

  if (!ranked.length || ranked[0][1] <= 0) return null;
  return {
    id: ranked[0][0],
    votes: ranked[0][1],
    margin: ranked[0][1] - (ranked[1]?.[1] ?? 0),
  };
}

/* ── the comparison ───────────────────────────────────────────────────────── */

/**
 * Compare one place, given both sides and how much of it we cover.
 *
 * `mode` is "COMPLETE" or "PARTIAL", decided by the caller, and it is the only
 * thing standing between this function and a dashboard full of false alarms.
 */
function comparePlace({ level, key, ours, declared, mode, coverage }) {
  const found = [];
  const place = `${LEVELS[level].label} ${key}`;

  const at = (severity, rule, says, why, extra = {}) =>
    found.push({
      severity,
      rule,
      level,
      key,
      coverage,
      mode,
      says,
      why,
      id: `${level}:${key}:${rule}${extra.party ? `:${extra.party}` : ""}`,
      ...extra,
    });

  /* ---------------------------------------------------------- impossible
     True at any coverage: a part cannot be larger than the whole that
     contains it. This is the one rule that runs while collation is still
     coming in, and it is the one most likely to catch a figure that was
     written rather than counted. */
  for (const id of PARTY_IDS) {
    const mine = ours.votes[id] ?? 0;
    const theirs = declared.votes[id];
    if (theirs === undefined || mine <= theirs) continue;

    at(
      "IMPOSSIBLE",
      "ours-exceed-declared",
      `Our agents counted ${fmt(mine)} for ${id} where ${fmt(theirs)} was declared`,
      level === "UNIT"
        ? `Both figures describe the same sheet at the same booth, and they do not agree. One of them was copied wrongly, and the photographed sheet settles which.`
        : `We hold returns from ${coverage.oursUnits} of the ${coverage.declaredUnits || "unknown"} ${LEVELS.UNIT.plural} here, so our figure should be lower than the declared one, not higher. A part cannot exceed the whole regardless of how much of it we cover.`,
      { party: id, ours: mine, declared: theirs, difference: mine - theirs }
    );
  }

  if (declared.accredited !== null && declared.accredited !== undefined && ours.accredited > declared.accredited) {
    at(
      "IMPOSSIBLE",
      "accredited-exceed-declared",
      `${fmt(ours.accredited)} accredited on our returns against ${fmt(declared.accredited)} declared`,
      "More people were accredited on the returns we hold than the declared figure says were accredited in the whole place.",
      { ours: ours.accredited, declared: declared.accredited, difference: ours.accredited - declared.accredited }
    );
  }

  /* Beyond this point every rule assumes the two totals are answering the
     same question, which is only true when we hold the whole place. */
  if (mode !== "COMPLETE") return found;

  /* ------------------------------------------------------------- flipped
     Reported before the figure-by-figure differences, because a room that
     reads one line of this dashboard should read this one. */
  const mine = leader(ours.votes);
  const theirs = leader(declared.votes);

  if (mine && theirs && mine.id !== theirs.id) {
    at(
      "FLIPPED",
      "winner-differs",
      `Our count leads ${mine.id}, the declared figures lead ${theirs.id}`,
      `Across every ${LEVELS.UNIT.plural.slice(0, -1)} in this ${LEVELS[level].label.toLowerCase()}, our returns put ${NAMED.get(mine.id) ?? mine.id} ahead by ${fmt(mine.margin)} and the declared figures put ${NAMED.get(theirs.id) ?? theirs.id} ahead by ${fmt(theirs.margin)}. Two independently sourced counts of the same booths naming different winners is the finding this system exists to produce, and it is a reason to read the sheets, not a conclusion about anybody's conduct.`,
      { ours: mine.id, declared: theirs.id }
    );
  }

  /* ----------------------------------------------------------- divergent */
  const scale = Math.max(declared.total, ours.total, 1);

  for (const id of PARTY_IDS) {
    const a = ours.votes[id] ?? 0;
    const b = declared.votes[id];
    if (b === undefined) continue;

    const difference = Math.abs(a - b);
    /* Already reported as impossible above; saying it twice in two tones
       makes the more serious line look like the less serious one. */
    if (a > b) continue;
    if (difference < TOLERANCE.votes || difference / scale < TOLERANCE.share) continue;

    at(
      "DIVERGENT",
      "party-figure",
      `${id}: ${fmt(a)} on our returns, ${fmt(b)} declared, a difference of ${fmt(difference)}`,
      `That is ${pct(difference / scale)} of the ${fmt(scale)} votes recorded here, across booths we hold a complete set of returns for.`,
      { party: id, ours: a, declared: b, difference }
    );
  }

  const totalGap = Math.abs(ours.total - declared.total);
  if (totalGap >= TOLERANCE.votes && totalGap / scale >= TOLERANCE.share) {
    at(
      "DIVERGENT",
      "total-votes",
      `${fmt(ours.total)} votes on our returns against ${fmt(declared.total)} declared`,
      `A difference of ${fmt(totalGap)}, ${pct(totalGap / scale)}, over a complete set of returns for this ${LEVELS[level].label.toLowerCase()}.`,
      { ours: ours.total, declared: declared.total, difference: totalGap }
    );
  }

  return found;
}

/**
 * Screen everything, at every level a declared figure was given at.
 *
 * `ours` is our returns (unitCode, registered, accredited, rejected, votes).
 * `declared` is what the desk uploaded (level, key, votes, accredited…).
 * `expected` optionally maps a place key to how many units it should contain,
 * which is what lets a place be called complete rather than merely covered.
 */
export function screenDivergence(ours, declared, expected = new Map()) {
  return run(ours, declared, expected).flags;
}

/**
 * The pass itself, returning both what it found and what it was able to look
 * at.
 *
 * ── WHY THE LEDGER OF COMPARISONS COMES BACK TOO ───────────────────────────
 * The summary needs to say "eleven places compared, four too thinly covered
 * to compare". Deriving that from the findings cannot work: a ward we hold in
 * full and which agrees perfectly produces no finding at all, so counting
 * distinct keys among the flags reports the one number a reader must be able
 * to trust — how much was actually checked — as zero precisely when
 * everything checked out. The pass knows what it looked at; it says so.
 */
function run(ours, declared, expected) {
  const found = [];
  const compared = [];

  /* Which levels were actually declared at. No point rolling our returns up
     to local government if nobody has announced one. */
  const levels = [...new Set(declared.map((row) => row.level))].sort(
    (a, b) => LEVELS[a].rank - LEVELS[b].rank
  );

  for (const level of levels) {
    const mine = ourTotals(ours, level);

    for (const row of declared.filter((entry) => entry.level === level)) {
      const node = mine.get(row.key);

      if (!node) {
        /* Declared, and we have nothing there. Not a finding about the
           figures — a statement about our own coverage, which is the room's
           problem to solve and not the commission's. */
        found.push({
          severity: "UNMATCHED",
          rule: "no-return",
          level,
          key: row.key,
          id: `${level}:${row.key}:no-return`,
          mode: "NONE",
          coverage: { oursUnits: 0, declaredUnits: expected.get(row.key) ?? null, share: 0 },
          says: `${fmt(row.total)} votes declared, nothing filed by us`,
          why: "We hold no return from this place, so there is nothing to hold the declared figure against. This is a gap in our coverage, not a fault in the figure.",
          declared: row.total,
          ours: 0,
        });
        continue;
      }

      const declaredUnits = expected.get(row.key) ?? null;
      const oursUnits = node.units.size;

      /* ── WHEN IS A PLACE "COMPLETE"? ──────────────────────────────────
         Only when we know how many units it holds and we hold that many.
         Not knowing is not the same as being complete, and defaulting the
         unknown case to complete is precisely how a partial ward gets
         reported as a divergence. A unit compares to itself and is always
         complete: one sheet, two transcriptions. */
      const mode =
        level === "UNIT"
          ? "COMPLETE"
          : declaredUnits && oursUnits >= declaredUnits
            ? "COMPLETE"
            : "PARTIAL";

      const coverage = {
        oursUnits,
        declaredUnits,
        share: declaredUnits ? oursUnits / declaredUnits : null,
      };

      compared.push({ level, key: row.key, mode, coverage });

      found.push(
        ...comparePlace({
          level,
          key: row.key,
          ours: node,
          declared: row,
          mode,
          coverage,
        })
      );
    }
  }

  return {
    compared,
    flags: found.sort(
      (a, b) =>
        DIVERGENCE[b.severity].rank - DIVERGENCE[a.severity].rank ||
        (b.difference ?? 0) - (a.difference ?? 0)
    ),
  };
}

/**
 * The figure at the top of the dashboard, and the one the alarm listens to.
 *
 * ── DELIBERATELY NOT A PERCENTAGE ──────────────────────────────────────────
 * The same reasoning as lib/anomalies.js: a "confidence score" is a number
 * somebody reads on air as though it measured honesty. These are counts of
 * places that failed a named check, and each one can be opened and read
 * against its sheet.
 */
export function divergenceOf(ours, declared, expected = new Map()) {
  const { flags, compared } = run(ours, declared, expected);
  const places = new Set(flags.map((flag) => `${flag.level}:${flag.key}`));

  const complete = compared.filter((entry) => entry.mode === "COMPLETE");
  const partial = compared.filter((entry) => entry.mode === "PARTIAL");

  return {
    flags,
    /* The three the room reads first, in the order it reads them. */
    impossible: flags.filter((flag) => flag.severity === "IMPOSSIBLE").length,
    flipped: flags.filter((flag) => flag.severity === "FLIPPED").length,
    divergent: flags.filter((flag) => flag.severity === "DIVERGENT").length,
    unmatched: flags.filter((flag) => flag.severity === "UNMATCHED").length,
    places: places.size,
    declared: declared.length,
    /* Stated plainly so the panel never has to imply a clean result it has
       not actually established. */
    compared: complete.length,
    tooThin: partial.length,
    /* Places held in full that raised nothing at all. The only honest way to
       print a reassuring number: it counts what was checked and passed,
       rather than inferring calm from an absence of findings. */
    agreeing: complete.filter(
      (entry) => !flags.some((flag) => flag.level === entry.level && flag.key === entry.key)
    ).length,
  };
}

/**
 * Everything the alarm should make a noise about.
 *
 * Impossible arithmetic and a changed winner. Not the figure-by-figure
 * differences: those are worth reading and are not worth waking a room for,
 * and an alarm that fires for everything is an alarm somebody mutes.
 */
export function alarming(flags) {
  return flags.filter((flag) => flag.severity === "IMPOSSIBLE" || flag.severity === "FLIPPED");
}

const fmt = (value) => new Intl.NumberFormat("en-NG").format(Math.round(value ?? 0));
const pct = (value) => `${Math.round(value * 1000) / 10}%`;
