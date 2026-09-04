/**
 * The strategic brief: one party's position, everywhere, in twelve figures.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS IS FOR, AND WHY IT IS NOT ANOTHER MAP
 *
 *  Every other analytical surface in this room answers a question about the
 *  country: who won here, how many voted there, what happened in 2011. The
 *  person who runs a campaign does not open a dashboard to ask a question
 *  about the country. They open it to ask one question about themselves —
 *  "where do we stand, and what should we do on Monday" — and they have
 *  perhaps ninety seconds before somebody wants an answer out loud.
 *
 *  Answering that from the existing screens took four of them and a
 *  calculator: the result map for the share, Behaviour for the last election,
 *  Projection for the model, Planning for the ground. Worse, each was
 *  computed against a different denominator, so the four answers did not
 *  reconcile, and reconciling them by hand at eleven at night is how a wrong
 *  number reaches a microphone.
 *
 *  So the arithmetic lives here, once, and every figure on the executive
 *  screen comes out of one call. Twelve figures, one denominator each, all
 *  stated. If two of them disagree it is a bug in this file and a test below
 *  will say so.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE RULES THIS FILE OBEYS ──────────────────────────────────────────────
 *  · A place that has not reported is never a zero. It is `null`, it is
 *    classified Unknown, and it is kept out of every denominator. Silence and
 *    defeat look identical in a percentage and mean opposite things.
 *  · Nothing here invents a figure. Where the data does not exist — history
 *    below a state, accreditation on the replay — the answer is null and the
 *    screen says so in words.
 *  · A measurement and a model estimate never share a field. Everything under
 *    `projected` is modelled, everything above it is counted, and the two are
 *    not added together anywhere in this file.
 *  · Shares are percentages, 0–100, never fractions. One convention, because
 *    the two mixed is how a margin becomes ten thousand percent.
 */

/* ------------------------------------------------------------- the classes */

/**
 * How a place is classified, and what each class is for.
 *
 * ── WHY FIVE, AND WHY UNKNOWN IS ONE OF THEM ───────────────────────────────
 * Four classes describe a place we have figures for. The fifth describes a
 * place we do not, and it is the most important one on election night: a map
 * with four classes has to put silence somewhere, and wherever it puts it the
 * map is lying. Unknown is a class with its own colour so that "we have not
 * heard from Zamfara" can never be read as "we are weak in Zamfara".
 *
 * The dot is carried here rather than chosen by the screen, because these
 * classifications get quoted in messages, on paper and out loud, and the
 * legend has to be the same in all four places.
 *
 * ── AND SO IS THE FILL, FOR THE SAME REASON ────────────────────────────────
 * The map draws these and so does the brief beside it, and a legend that
 * disagrees with the map next to it is worse than no legend at all. One
 * definition, read by both.
 *
 * Green, yellow, orange, red is the ramp the specification asked for and the
 * one every reader already knows. It is also the ramp red-green colour
 * blindness damages most: green and red are the pair that collapses. So they
 * are set two dozen points of lightness apart — see app/globals.css — which
 * separates them for a dichromatic reader and under a bad projector, and
 * everywhere they are drawn the class is written out in words and carries its
 * own dot as well. The fill is never the only signal. That is the same relief
 * this palette already documents for NDC against APC.
 */
export const CLASSES = [
  {
    id: "STRONGHOLD",
    label: "Stronghold",
    dot: "🟢",
    fill: "var(--color-class-stronghold)",
    tone: "good",
    why: "Held comfortably. Protect the turnout and spend the effort elsewhere.",
  },
  {
    id: "COMPETITIVE",
    label: "Competitive",
    dot: "🟡",
    fill: "var(--color-class-competitive)",
    tone: "warn",
    why: "Either side can take this. The margin here decides the result.",
  },
  {
    id: "OPPORTUNITY",
    label: "Opportunity",
    dot: "🟠",
    fill: "var(--color-class-opportunity)",
    tone: "warn",
    why: "Behind, but moving our way or close enough to move.",
  },
  {
    id: "WEAK",
    label: "Weak",
    dot: "🔴",
    fill: "var(--color-class-weak)",
    tone: "alert",
    why: "Behind by a distance and not improving. Defend the base first.",
  },
  {
    id: "UNKNOWN",
    label: "Unknown",
    dot: "⚫",
    /* Silence borrows the colour the whole product already uses for it, so a
       place nobody has heard from looks the same on every map in the room. */
    fill: "var(--color-silent)",
    tone: "muted",
    why: "Nothing reported from here. Not a low figure — no figure.",
  },
];

export const CLASS_OF = Object.fromEntries(CLASSES.map((item) => [item.id, item]));

/**
 * The two boundaries every classification turns on.
 *
 * ── WHY THESE NUMBERS AND NOT OTHERS ──────────────────────────────────────
 * `competitive` is the margin inside which a place is genuinely in play. Ten
 * points is the figure Nigerian state results actually move by between two
 * presidential elections often enough to matter — Kaduna, Benue, Plateau and
 * Kano have each swung further than that since 2015 — so a place held by less
 * than ten is a place that has changed hands in living memory.
 *
 * `commanding` is where a lead stops being a contest. Twenty-five points is
 * deliberately conservative: it is wide enough that no realistic swing closes
 * it in one cycle, which is the only honest basis for telling a campaign to
 * stop spending money somewhere.
 *
 * They are arguments, not facts, so they are arguments the screen can change.
 * Both are parameters everywhere below and these are only the defaults.
 */
export const BOUNDS = { competitive: 10, commanding: 25 };

/**
 * Which class a place falls in.
 *
 * Ordered by how much the answer matters, not by margin: silence first,
 * because a missing figure must never be classified on the strength of the
 * figures it is missing; then the contest; then the two kinds of behind.
 *
 * `margin` is signed from this party's point of view — positive is a lead.
 * `swing` is the change against the same place's last comparable election, and
 * may be null, in which case a place that is behind is judged on distance
 * alone. That is the right default: without history there is no evidence of
 * movement, and a campaign should not be told a place is an opportunity
 * because nothing is known about it.
 */
export function classOf({ reported = true, margin = null, swing = null } = {}, bounds = BOUNDS) {
  if (!reported || margin === null || margin === undefined) return "UNKNOWN";

  if (margin >= bounds.commanding) return "STRONGHOLD";
  if (Math.abs(margin) <= bounds.competitive) return "COMPETITIVE";
  if (margin > 0) return "STRONGHOLD";

  /* Behind. The question is whether it is closing. A place losing by twenty
     with a five-point swing towards us is a different instruction from a place
     losing by twenty that has not moved in eight years. */
  if (swing !== null && swing > 0) return "OPPORTUNITY";
  if (-margin < bounds.commanding) return "OPPORTUNITY";
  return "WEAK";
}

/* ---------------------------------------------------------------- workings */

const share = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/** Keep a 0–1 weight inside its range without pretending a NaN is a zero. */
const clamp01 = (value) => (Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0);

/**
 * Where a party's votes sit in a row's `votes` array.
 *
 * A governorship board carries the parties that actually contested it — Accord
 * won Osun, APGA won Anambra, and neither is one of the presidential four — so
 * the position of a party is a property of the board and never a constant.
 * Returns -1 when this party did not stand, which is a real answer: it is why
 * the brief can say "not on this ballot" rather than "0%".
 */
export function slotOf(slots = [], party) {
  return slots.findIndex((item) => (item?.id ?? item) === party);
}

/**
 * The opportunity score: where an extra week of effort is worth most.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY IT IS A WEIGHTED SUM AND NOT A PRODUCT
 *
 *  The obvious model multiplies the factors together. It is wrong for this
 *  job, and wrong in a way that quietly deletes the best targets: any factor
 *  at zero zeroes the whole score, so a ward where we already poll 50% —
 *  headroom near nothing — scores zero however many non-voters it holds, and
 *  a dead-safe stronghold with a collapsing turnout never appears on a list
 *  whose entire purpose is to find places worth visiting.
 *
 *  A weighted sum degrades instead of collapsing, and every term survives
 *  into the answer where it can be shown. Each component is returned beside
 *  the score for exactly that reason: a planner who cannot see why a ward
 *  ranks fourth will not act on it being fourth.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The five terms, each normalised to 0–1:
 *
 *   reach        how many voters are physically there, against the largest
 *                register on screen. A perfect campaign in an empty ward
 *                wins nothing.
 *   closeness    how winnable, from the margin. Full weight at level pegging,
 *                nothing at the commanding boundary and beyond.
 *   turnoutRoom  how many registered voters did not vote. The cheapest votes
 *                in Nigerian politics are the ones already on the register.
 *   headroom     how much of the vote that was cast is not ours.
 *   momentum     whether the place is moving our way, from the swing. Zero
 *                when there is no history to compare against — an unknown
 *                trend must not read as a good one.
 *
 * The weights are the strategy, so they are a parameter. These defaults put
 * the most on reach and closeness, because those two are the terms a campaign
 * cannot change by trying harder.
 */
export const WEIGHTS = { reach: 0.3, closeness: 0.25, turnoutRoom: 0.2, headroom: 0.15, momentum: 0.1 };

export function opportunityOf(
  { registered = 0, turnout = null, margin = null, mineShare = null, swing = null },
  { ceiling = 1, expectedTurnout = null, bounds = BOUNDS, weights = WEIGHTS } = {}
) {
  const reach = clamp01(registered / Math.max(ceiling, 1));

  /* Closeness runs from 1 at a dead heat to 0 at the commanding boundary, and
     is measured on the absolute margin: a place we hold by four is as much a
     contest as one we lose by four, and both need watching. */
  const closeness =
    margin === null ? 0 : clamp01(1 - Math.abs(margin) / Math.max(bounds.commanding, 1));

  /* Against the expected turnout where one is given, so the term means "worse
     than this place should be" rather than "not 100%", which no election on
     earth reaches. Without an expectation it falls back to the plain share of
     the register that stayed home. */
  const turnoutRoom =
    turnout === null
      ? 0
      : expectedTurnout
        ? clamp01((expectedTurnout - turnout) / Math.max(expectedTurnout, 1))
        : clamp01((100 - turnout) / 100);

  const headroom = mineShare === null ? 0 : clamp01((100 - mineShare) / 100);

  /* Only movement towards us counts. A place sliding away is a defence
     problem, and it is already on the Weak list; scoring it as an opportunity
     would send the field team to the one place least likely to reward them. */
  const momentum = swing === null ? 0 : clamp01(swing / 10);

  const score =
    100 *
    (weights.reach * reach +
      weights.closeness * closeness +
      weights.turnoutRoom * turnoutRoom +
      weights.headroom * headroom +
      weights.momentum * momentum);

  return {
    score: Math.round(score * 10) / 10,
    reach: Math.round(reach * 100),
    closeness: Math.round(closeness * 100),
    turnoutRoom: Math.round(turnoutRoom * 100),
    headroom: Math.round(headroom * 100),
    momentum: Math.round(momentum * 100),
  };
}

/**
 * One place, fully worked out.
 *
 * The row this takes is whatever the room has on screen — a state at national
 * level, a local government inside a state, a ward, a polling unit — so the
 * same arithmetic serves all four levels rather than four near-copies of it
 * disagreeing at the edges.
 */
function intelFor(row, { slot, slots, myId, baseline, ceiling, expectedTurnout, bounds, weights }) {
  const key = row.key ?? row.code ?? row.name;
  const total = row.total ?? 0;
  const reported = row.reported !== false && total > 0;

  /* ── SILENCE, HANDLED ONCE, AT THE TOP ────────────────────────────────
     Everything below this line assumes there are figures. A place with none
     gets nulls and the Unknown class, and appears in no ranking, no
     denominator and no average. */
  if (!reported) {
    return {
      key,
      name: row.name ?? key,
      code: row.code ?? null,
      reported: false,
      votes: null,
      cast: 0,
      registered: row.registered ?? row.fullRegister ?? 0,
      turnout: null,
      share: null,
      margin: null,
      swing: null,
      leader: null,
      class: "UNKNOWN",
      opportunity: null,
    };
  }

  const votes = slot >= 0 ? (row.votes?.[slot] ?? 0) : null;
  const mineShare = votes === null ? null : share(votes, total);

  /* Who is actually winning here, and by how much over the next one. Computed
     from the board's own party positions, so it is right on a governorship
     ballot the presidential four never appear on. */
  const ranked = (row.votes ?? [])
    .map((count, index) => ({ id: slots[index]?.id ?? String(index), votes: count ?? 0 }))
    .sort((a, b) => b.votes - a.votes);

  const first = ranked[0] ?? null;
  const second = ranked[1] ?? null;

  /* The margin, from this party's point of view: how far ahead of the nearest
     rival we are, or how far behind the leader. Positive is a lead. Both
     directions are the same subtraction, which is why there is one field and
     not two. */
  /* ── AND WHEN THERE IS NOBODY TO MEASURE AGAINST ──────────────────────
     A board with a single party on it, or a place where only one party was
     given a column, has no runner-up. That is not "no margin" — it is the
     largest margin there is, and returning null would classify a place we
     hold outright as Unknown, which on this map means nobody has reported.
     So the absent rival is nought votes rather than no rival. */
  const rival = (first && first.id === myId ? second : first) ?? { votes: 0 };
  const margin = votes === null ? null : share(votes - (rival.votes ?? 0), total);

  const registered = row.registered ?? 0;
  const turnout = registered > 0 ? share(total, registered) : (row.turnout ?? null);

  /* The same place, last time. Null everywhere history is not recorded at this
     grain — which is everywhere below a state — and the screen says so rather
     than drawing a swing of zero. */
  const was = baseline?.[key] ?? (row.code ? baseline?.[row.code] : null) ?? null;
  const swing = was && mineShare !== null && was.share !== null ? mineShare - was.share : null;

  return {
    key,
    name: row.name ?? key,
    code: row.code ?? null,
    reported: true,
    votes,
    cast: total,
    registered,
    turnout,
    share: mineShare,
    margin,
    swing,
    was: was ? { share: was.share, votes: was.votes ?? null, cast: was.total ?? 0 } : null,
    leader: first ? { id: first.id, votes: first.votes, share: share(first.votes, total) } : null,
    class: classOf({ reported: true, margin, swing }, bounds),
    opportunity: opportunityOf(
      { registered, turnout, margin, mineShare, swing },
      { ceiling, expectedTurnout, bounds, weights }
    ),
  };
}

/* ------------------------------------------------------------- the baseline */

/**
 * The last comparable election, by state, as this file wants it.
 *
 * ── WHY THIS TAKES THE ELECTION AND NOT A YEAR ─────────────────────────────
 * It used to be tempting to hard-code "the 2023 result" as the baseline. That
 * is right for exactly one contest. The comparison a campaign wants is against
 * the last election *of the same kind*, and for a governorship that is not a
 * presidential year at all. So the caller hands in the election it wants
 * compared and this only reshapes it.
 *
 * Elections with no by-state table published — 2007 and 2011 — carry national
 * figures and no rows. They produce an empty baseline rather than a baseline
 * of zeroes, which would draw a swing of plus-everything on every state in the
 * country. See lib/history.js.
 */
export function baselineFrom(election, party) {
  if (!election?.rows?.length) return {};

  const index = {};
  for (const row of election.rows) {
    const total = row.total ?? Object.values(row.votes ?? {}).reduce((sum, n) => sum + n, 0);
    const votes = row.votes?.[party] ?? null;
    index[row.code] = {
      votes,
      total,
      share: votes === null ? null : share(votes, total),
    };
  }
  return index;
}

/* ---------------------------------------------------------------- the brief */

/**
 * How far a projection is allowed to be wrong, and why it is not a textbook
 * standard error.
 *
 * The returns arriving are not a random sample of voters. They are whole
 * polling units, and people in one unit vote alike — that is what a stronghold
 * is. Treating 200,000 votes from 400 booths as 200,000 independent draws
 * gives an interval so tight it is a lie: a fraction of a point, on a night
 * when the real spread between an early count and a final result is routinely
 * several points.
 *
 * So the sample size is the number of *booths*, not the number of votes, and
 * the interval is widened again by how much of the ground has not reported.
 * The result is a band wide enough to be honest and narrow enough to be worth
 * printing. It is still a model, it is still labelled one, and it narrows as
 * the night goes on, which is the behaviour anybody reading it expects.
 */
const DESIGN = 1.96;

function bandFor({ shareNow, booths, coverage }) {
  if (shareNow === null || booths < 2) return null;

  const p = shareNow / 100;
  const se = Math.sqrt(Math.max(p * (1 - p), 0.0001) / booths);

  /* What is not in yet. At full coverage this is 1 and the band is the
     sampling interval alone; at 10% reported it triples it. */
  const unseen = 1 + 2 * (1 - clamp01(coverage / 100));
  const width = DESIGN * se * 100 * unseen;

  return {
    low: Math.max(0, shareNow - width),
    high: Math.min(100, shareNow + width),
    width,
  };
}

/**
 * The executive brief.
 *
 * @param rows        whatever is on screen: states, local governments, wards or
 *                    booths. Each needs `name`, `votes[]`, `total`,
 *                    `registered` and `reported`; `code`, `booths`,
 *                    `fullRegister` and `fullBooths` are used where present.
 * @param slots       the party at each position in `votes`, from the board.
 * @param forParty    the party this brief is written for.
 * @param baseline    keyed by row key or state code — see `baselineFrom`.
 * @param baselineLabel  what the baseline is, in words, for the screen.
 * @param targetShare the share this campaign is aiming at, 0–100.
 * @param expectedTurnout  the turnout this contest should reach, 0–100.
 * @param bounds      the two classification boundaries.
 * @param weights     the opportunity model's weights.
 */
export function executiveBrief({
  rows = [],
  slots = [],
  forParty = null,
  baseline = null,
  baselineLabel = null,
  targetShare = null,
  expectedTurnout = null,
  bounds = BOUNDS,
  weights = WEIGHTS,
} = {}) {
  const slot = slotOf(slots, forParty);
  const onBallot = slot >= 0;

  /* The largest register on screen, which every reach term is measured
     against. Taken from the full register where a row carries one, so a state
     that has barely reported is still recognised as a big state. */
  const ceiling = Math.max(
    1,
    ...rows.map((row) => row.fullRegister ?? row.registered ?? 0)
  );

  const myId = slot >= 0 ? (slots[slot]?.id ?? forParty) : forParty;

  /* Each row is worked out once and kept beside its own figures, so every
     total below is one pass. An earlier version looked each place's row back
     up by name inside a loop over the parties, which is a search inside a
     search: on the 774 local governments of a national plan that is half a
     million comparisons to add up five columns. */
  const worked = rows.map((row) => ({
    row,
    place: intelFor(row, { slot, slots, myId, baseline, ceiling, expectedTurnout, bounds, weights }),
  }));

  const places = worked.map((item) => item.place);
  const counted = places.filter((place) => place.reported);

  /* ── THE DENOMINATORS, ALL OF THEM, IN ONE PLACE ────────────────────────
     Everything below is a fraction of one of these three, and each one is
     built only from places that have actually reported. The full register and
     the full booth count are kept separately: they are the size of the job,
     not the size of what has been done, and confusing the two is how a
     turnout figure ends up a third of what it should be. */
  const cast = counted.reduce((sum, place) => sum + place.cast, 0);
  const registered = counted.reduce((sum, place) => sum + place.registered, 0);
  const votes = onBallot ? counted.reduce((sum, place) => sum + (place.votes ?? 0), 0) : null;

  const fullRegister = rows.reduce((sum, row) => sum + (row.fullRegister ?? row.registered ?? 0), 0);
  const boothsIn = rows.reduce((sum, row) => sum + (row.booths ?? 0), 0);
  const fullBooths = rows.reduce((sum, row) => sum + (row.fullBooths ?? row.booths ?? 0), 0);

  const shareNow = votes === null ? null : share(votes, cast);
  const turnout = registered > 0 ? share(cast, registered) : null;

  /* Who is winning across everything on screen, and by how much. Summed from
     the rows rather than averaged from their shares — an average of
     percentages weights Bayelsa like Kano. */
  const totals = slots.map(() => 0);
  for (const { row, place } of worked) {
    if (!place.reported) continue;
    for (let index = 0; index < totals.length; index += 1) totals[index] += row.votes?.[index] ?? 0;
  }

  const ranked = totals
    .map((count, index) => ({ id: slots[index]?.id ?? String(index), votes: count, share: share(count, cast) }))
    .sort((a, b) => b.votes - a.votes);

  const leader = ranked[0] ?? null;
  /* As in `intelFor` above: an absent runner-up is nought votes, not an
     absent margin. The name is null in that case and the screen says
     "no rival to measure against" rather than printing a party that is not
     there. */
  const rival = (leader && leader.id === forParty ? ranked[1] : leader) ?? { id: null, votes: 0 };

  const margin =
    votes === null
      ? null
      : { share: share(votes - rival.votes, cast), votes: votes - rival.votes, against: rival.id };

  const standing =
    margin === null ? "unknown" : margin.share > 0 ? "leading" : margin.share < 0 ? "trailing" : "tied";

  /* ── THE RECORD, THE SAME GROUND, LAST TIME ─────────────────────────────
     Summed over the places that have a baseline *and* have reported, so the
     comparison is like for like. Comparing this year's 40 reporting states
     against last time's 37 is the commonest way to manufacture a swing that
     is not there. */
  const withHistory = counted.filter((place) => place.was && place.was.share !== null);
  const historical = withHistory.length
    ? {
        places: withHistory.length,
        votes: withHistory.reduce((sum, place) => sum + (place.was.votes ?? 0), 0),
        cast: withHistory.reduce((sum, place) => sum + (place.was.cast ?? 0), 0),
        label: baselineLabel,
      }
    : null;

  if (historical) historical.share = share(historical.votes, historical.cast);

  const swing = historical && shareNow !== null ? shareNow - historical.share : null;

  /* ── THE PROJECTION, WHICH IS THE ONLY MODELLED FIGURE HERE ─────────────
     Two assumptions, both stated on the screen: the ground that has not
     reported votes like the ground that has, and turnout finishes where it is
     expected to. Everything modelled is under this key and nothing above it
     is, so a reader can never take one for the other. */
  const coverage = fullBooths > 0 ? share(boothsIn, fullBooths) : (fullRegister > 0 ? share(registered, fullRegister) : 0);
  const band = bandFor({ shareNow, booths: boothsIn, coverage });

  const projectedCast =
    expectedTurnout && fullRegister > 0
      ? Math.round((expectedTurnout / 100) * fullRegister)
      : coverage > 0
        ? Math.round(cast / (coverage / 100))
        : null;

  const projected =
    shareNow === null || !projectedCast
      ? null
      : {
          cast: projectedCast,
          share: shareNow,
          votes: Math.round((shareNow / 100) * projectedCast),
          low: band ? Math.round((band.low / 100) * projectedCast) : null,
          high: band ? Math.round((band.high / 100) * projectedCast) : null,
          shareLow: band?.low ?? null,
          shareHigh: band?.high ?? null,
          coverage,
          basis: expectedTurnout
            ? `${Math.round(expectedTurnout)}% turnout on a register of ${fullRegister}`
            : `the ${Math.round(coverage)}% of booths that have reported`,
        };

  /* ── THE TARGET, WHICH IS A DECISION AND NOT A MEASUREMENT ──────────────
     Somebody chooses it. It is counted against the projected total vote where
     there is one, because a target expressed as a share has to be turned into
     votes against some assumption about how many people turn out, and saying
     which assumption is the difference between a target and a wish. */
  const targetBase = projectedCast ?? cast;
  const target =
    targetShare === null || targetShare === undefined || !targetBase
      ? null
      : (() => {
          const wanted = Math.round((targetShare / 100) * targetBase);
          const have = projected?.votes ?? votes ?? 0;
          return {
            share: targetShare,
            votes: wanted,
            of: targetBase,
            gap: wanted - have,
            met: have >= wanted,
            /* How much of the target is already in hand, so the screen can
               draw one bar instead of asking somebody to subtract. */
            progress: share(have, wanted),
          };
        })();

  /* The four lists a campaign actually acts on. Each is the same set of places
     sorted by the question it answers, never a re-classification: a place is
     in exactly one class, and these are views of that. */
  const inClass = (id) => places.filter((place) => place.class === id);

  const strongholds = inClass("STRONGHOLD").sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0));
  const battlegrounds = inClass("COMPETITIVE").sort(
    (a, b) => Math.abs(a.margin ?? 0) - Math.abs(b.margin ?? 0)
  );
  const weak = inClass("WEAK").sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0));

  /* Growth is the one list that is not a class. It is every place worth an
     extra week ranked by the opportunity model, strongholds included — a safe
     seat with a collapsing turnout is a growth opportunity, and a list that
     excluded it would be a list of places we are losing. */
  const growth = places
    .filter((place) => place.reported && place.opportunity)
    .sort((a, b) => b.opportunity.score - a.opportunity.score);

  return {
    forParty,
    onBallot,
    slot,

    /* Counted. */
    votes,
    cast,
    share: shareNow,
    registered,
    fullRegister,
    turnout,
    leader,
    margin,
    standing,
    ranked,

    /* Recorded. */
    historical,
    swing,

    /* Modelled. */
    projected,

    /* Chosen. */
    target,

    /* The ground. */
    places,
    reporting: {
      places: rows.length,
      reported: counted.length,
      silent: rows.length - counted.length,
      booths: boothsIn,
      fullBooths,
      coverage,
    },
    counts: Object.fromEntries(CLASSES.map((item) => [item.id, inClass(item.id).length])),
    strongholds,
    battlegrounds,
    weak,
    growth,
    bounds,
  };
}

/**
 * The same ground, folded up one class per row, for the legend and the bar.
 *
 * Returned rather than derived on the screen because two surfaces draw it —
 * the executive brief and the classification map — and a legend that disagrees
 * with the map beside it is worse than no legend.
 */
export function classBreakdown(brief) {
  return CLASSES.map((item) => {
    const places = brief.places.filter((place) => place.class === item.id);
    return {
      ...item,
      places: places.length,
      registered: places.reduce((sum, place) => sum + (place.registered ?? 0), 0),
      votes: places.reduce((sum, place) => sum + (place.votes ?? 0), 0),
      cast: places.reduce((sum, place) => sum + (place.cast ?? 0), 0),
    };
  });
}

/**
 * What one more point of turnout is worth, here.
 *
 * ── THE QUESTION A SCENARIO SCREEN IS REALLY ASKED ─────────────────────────
 * "What happens if turnout goes up five points" is never asked in the
 * abstract. It is asked because somebody is deciding whether to spend the last
 * fortnight knocking doors or persuading. The answer is only useful if it
 * comes back in votes on our side, against the margin we are trying to close.
 *
 * The assumption is stated and deliberately neutral: extra voters split the
 * way the counted vote has split. That is not a claim about who stayed home —
 * nobody knows that — it is the null hypothesis, and it makes the figure a
 * floor for a mobilisation strategy rather than a forecast.
 */
export function turnoutScenario(brief, points) {
  const register = brief.fullRegister || brief.registered;
  if (!register || brief.share === null) return null;

  const extraVotes = Math.round((points / 100) * register);
  const mine = Math.round((brief.share / 100) * extraVotes);

  return {
    points,
    extraVotes,
    mine,
    /* And what it does to the gap, which is the only reason anybody asked. */
    closes: brief.margin && brief.margin.votes < 0 ? Math.min(1, mine / Math.abs(brief.margin.votes)) : null,
  };
}

/**
 * What a swing of `points` in these places does to the total.
 *
 * The other half of the scenario question — "what if we put three points on in
 * these six local governments" — and the reason it takes a list of keys rather
 * than a level: the places somebody wants to move are the ones they just
 * selected on a map, and they are never a whole tier.
 */
export function swingScenario(brief, keys, points) {
  const wanted = new Set(keys);
  const moved = brief.places.filter((place) => place.reported && wanted.has(place.key));
  if (!moved.length) return null;

  const gained = moved.reduce((sum, place) => sum + Math.round((points / 100) * place.cast), 0);
  const votes = (brief.votes ?? 0) + gained;

  return {
    points,
    places: moved.length,
    gained,
    votes,
    share: share(votes, brief.cast),
    /* The swing is inside these places, so the total vote does not change and
       the shift in the overall share is smaller than the shift asked for. That
       gap is the single most useful thing this function tells anybody. */
    shift: share(votes, brief.cast) - (brief.share ?? 0),
  };
}
