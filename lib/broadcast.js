import { STATES, parseUnitCode } from "./units.js";

/**
 * The broadcast operation, as arithmetic and as a catalogue.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS FILE IS FOR
 *
 *  A broadcast desk is not one screen. It is a control room, a graphics bench,
 *  a ticker, a social desk, a field roster, an editorial queue and a log — and
 *  all of them are looking at the same election from different chairs. What
 *  they must never do is each work the sums out for themselves: the moment the
 *  ticker computes coverage one way and the full-frame graphic another, the
 *  two go out within a minute of each other saying different things, and the
 *  audience is the one who notices.
 *
 *  So every figure any broadcast surface puts on a screen is computed here,
 *  once, as a pure function over rows the page already fetched. No queries, no
 *  clock reading, no React. That is not tidiness — it is the only way a number
 *  a presenter is about to read out loud can be checked by a test rather than
 *  by staring at a dashboard at 11pm.
 *
 *  ── AND WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────
 *  Nothing here publishes anything anywhere. The catalogues below say what
 *  each platform can carry and what it would need before it could; they do not
 *  pretend a connection exists. A desk that shows a green "connected" light
 *  against an account nobody has authorised is a desk that will one day report
 *  a post as sent that was never made.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────── the journey ── */

/**
 * The five states every item on this desk moves through, and the one it can
 * fall out at.
 *
 * ── WHY A TICKER AND A CLAIM SHARE A STATE MACHINE ─────────────────────────
 * Because the risk is identical. A ticker line saying KANO: 78% VERIFIED and a
 * fact-check saying a viral claim is false are both a sentence going out in
 * the organisation's name off the back of this product's figures. If they had
 * separate workflows, one of them would end up with a shorter one, and it
 * would be whichever was written second under time pressure.
 */
export const JOURNEY = [
  {
    id: "DRAFT",
    label: "Draft",
    tone: "neutral",
    why: "Being written. Visible only to the desk, and to nothing that renders.",
  },
  {
    id: "REVIEW",
    label: "With the editor",
    tone: "warn",
    why: "Submitted for clearance. Waiting on somebody who is not its author.",
  },
  {
    id: "CLEARED",
    label: "Cleared",
    tone: "good",
    why: "An editor has passed it. It may be taken to air; it is not on air.",
  },
  {
    id: "ON_AIR",
    label: "On air",
    tone: "ink",
    why: "Live output. Every renderer is serving this.",
  },
  {
    id: "OFF_AIR",
    label: "Off air",
    tone: "neutral",
    why: "Has been out and has been taken down. Kept, because it went out.",
  },
  {
    id: "REJECTED",
    label: "Rejected",
    tone: "alert",
    why: "An editor refused it. Kept with its reason, never deleted.",
  },
];

const JOURNEY_BY_ID = Object.fromEntries(JOURNEY.map((step) => [step.id, step]));

export const stateLabel = (id) => JOURNEY_BY_ID[id]?.label ?? id;
export const stateTone = (id) => JOURNEY_BY_ID[id]?.tone ?? "neutral";

/** Which states an item may move to from where it is. */
export const MOVES = {
  DRAFT: ["REVIEW"],
  REVIEW: ["CLEARED", "REJECTED", "DRAFT"],
  CLEARED: ["ON_AIR", "REVIEW"],
  ON_AIR: ["OFF_AIR"],
  OFF_AIR: [],
  REJECTED: ["DRAFT"],
};

/** Is this a move the desk is allowed to make at all? */
export const mayMove = (from, to) => Boolean(MOVES[from]?.includes(to));

/**
 * The kinds of thing this desk makes.
 *
 * The word beside each one is what it is called in a gallery, not what it is
 * called in a database, because the person reading it is a producer.
 */
export const KINDS = {
  TICKER: { label: "Ticker", why: "A line crawling along the bottom of the picture.", surface: "ticker" },
  LOWER_THIRD: { label: "Lower third", why: "A name or a figure keyed over the picture.", surface: "ticker" },
  BANNER: { label: "Breaking banner", why: "The red strap. Interrupts whatever is on.", surface: "breaking" },
  FULLSCREEN: { label: "Full frame", why: "The picture itself: a result, a chart, a map.", surface: "graphics" },
  GRAPHIC: { label: "Graphic", why: "Built from a template against real figures.", surface: "graphics" },
  MAP: { label: "Map", why: "The country, or one state, coloured by one question.", surface: "mapstudio" },
  VIDEO: { label: "Video", why: "A cut package, or a live source.", surface: "video" },
  SOCIAL: { label: "Social post", why: "One piece of content, adapted per platform.", surface: "social" },
  PROGRAMME: { label: "Programme", why: "A scheduled slot in the night's running order.", surface: "scheduler" },
  CLAIM: { label: "Claim", why: "Something circulating that somebody will be asked about.", surface: "claims" },
  CLEARANCE: { label: "Figures cleared", why: "A place's returns, passed for reading out.", surface: "liveresults" },
};

export const kindLabel = (id) => KINDS[id]?.label ?? id;

/* ────────────────────────────────────────────────────── result clearance ── */

/**
 * RAW → VERIFIED → CLEARED → ON AIR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE CONTROL THIS WHOLE DESK EXISTS FOR
 *
 *  Everything else here is convenience. This is not. A parallel count that
 *  reaches a transmitter before anybody has checked it against a photographed
 *  sheet is worse than no parallel count, because it carries the authority of
 *  a broadcast and none of the checking, and it cannot be recalled.
 *
 *  So air is not a property of a result. It is a property of a *place*: a
 *  clearance names a ground — the nation, a state, a local government — and
 *  says that the returns inside it, at the coverage they had when it was
 *  cleared, may be read out. Two consequences follow, and both are the point:
 *
 *    A return that arrives after a clearance is not covered by it. The
 *    clearance records the coverage it was granted at, and a screen that has
 *    moved past it says so rather than quietly widening.
 *
 *    Nothing can reach air by accident. There is no state in which a row
 *    filed at a booth becomes broadcast output without a person doing
 *    something, and the person who files can never be the person who clears.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * @param rows       returns for the contest, already narrowed to this ground
 * @param clearances CLEARANCE items off the desk's queue
 * @param expected   booths this ground is expected to produce, or 0 if unknown
 */
export function clearance({ rows = [], clearances = [], expected = 0 } = {}) {
  const received = rows.length;
  const verified = rows.filter((row) => row.status === "VERIFIED").length;

  /* Only clearances that have actually been passed count towards "cleared",
     and only ones on air count towards air. A clearance sitting in review is
     work in progress, not a permission. */
  const passed = clearances.filter((item) => item.state === "CLEARED" || item.state === "ON_AIR");
  const live = clearances.filter((item) => item.state === "ON_AIR");

  /* How many returns each clearance speaks for, counted rather than claimed.
     A clearance for STATE:20 covers the returns whose unit codes begin 20. */
  const coveredBy = (item) => rows.filter((row) => inScope(row.unitCode, item.scope)).length;

  const cleared = countUnique(passed.map(coveredBy));
  const onAir = countUnique(live.map(coveredBy));

  return {
    expected,
    stages: [
      {
        id: "received",
        label: "Received",
        count: received,
        why: "Filed from a booth by an agent, a coordinator or the WhatsApp desk. Not checked.",
        tone: "neutral",
      },
      {
        id: "verified",
        label: "Verified",
        count: verified,
        why: "A desk has held the figures against the photographed sheet and accepted them.",
        tone: "warn",
      },
      {
        id: "cleared",
        label: "Cleared for air",
        count: cleared,
        why: "An editor has passed the place these returns are in. They may be read out.",
        tone: "good",
      },
      {
        id: "air",
        label: "On air",
        count: onAir,
        why: "Being served to a renderer right now.",
        tone: "ink",
      },
    ],
    /* The gap that matters, named so a screen does not have to subtract two
       numbers and hope it got the order right. */
    awaitingVerification: received - verified,
    verifiedNotCleared: Math.max(0, verified - cleared),
    clearances: passed.map((item) => ({
      id: item.id,
      scope: item.scope,
      title: item.title,
      state: item.state,
      returnsThen: item.payload?.returns ?? null,
      returnsNow: coveredBy(item),
      clearedBy: item.clearedName,
      clearedAt: item.clearedAt,
    })),
  };
}

/**
 * Does this booth sit inside this clearance?
 *
 * Scopes are written the way lib/territory.js writes them. "NATION" is
 * everything; "STATE:20" is every code opening 20; "LGA:20/03" is every code
 * opening 20/03. Anything else covers nothing, which is the safe direction to
 * be wrong in: an unrecognised scope clears no returns rather than all of them.
 */
export function inScope(unitCode, scope) {
  if (!scope || scope === "NATION") return true;
  const parsed = parseUnitCode(unitCode);
  if (!parsed) return false;

  const [level, rest] = String(scope).split(":");
  if (level === "STATE") return parsed.stateNumber === String(rest).padStart(2, "0");
  if (level === "LGA") {
    const [state, lga] = String(rest).split("/");
    if (!state || !lga) return false;
    return parsed.lgaCode === `${String(state).padStart(2, "0")}/${String(lga).padStart(2, "0")}`;
  }
  return false;
}

/* Overlapping clearances must not be added up: a national clearance and a
   Kano one both cover Kano's returns, and summing them reports more booths on
   air than exist. The largest single clearance is the honest answer. */
const countUnique = (counts) => (counts.length ? Math.max(...counts) : 0);

/* ──────────────────────────────────────────────────────── the ticker ────── */

/**
 * Lines the desk could put on the bottom of the picture, written from the
 * figures rather than typed.
 *
 * ── WHY THESE ARE SUGGESTIONS AND NOT OUTPUT ───────────────────────────────
 * Every one of them is a draft. It goes into the same queue as everything
 * else, an editor clears it, and only then can it be taken to air. Generating
 * a line and airing it in one motion would be a machine writing broadcast copy
 * with nobody in between, which is exactly the failure this product spends its
 * whole architecture avoiding.
 *
 * ── AND WHY EVERY ONE CARRIES ITS COVERAGE ─────────────────────────────────
 * "PLATEAU — PARTY A 42%" is not a fact. "PLATEAU — PARTY A 42%, 61% OF BOOTHS
 * IN" is. The first is what a desk types when it is in a hurry, so the desk is
 * not given the chance: the generator will not produce a share without the
 * coverage that qualifies it.
 */
export function tickerLines({ places = [], incidents = [], national = null, race = "" } = {}) {
  const lines = [];
  const contest = race ? String(race).replace(/_/g, " ").toLowerCase() : "the count";

  /* ── THE HEADLINE, IF THERE IS ONE ───────────────────────────────────── */
  if (national && national.reporting > 0) {
    lines.push({
      id: "national-coverage",
      kind: "TICKER",
      band: "LOCATION",
      text: `${upper(national.name)} — ${percent(national.reporting)} OF POLLING UNITS REPORTING`,
      why: "Where the whole count stands. The line to run when nothing else has moved.",
      scope: "NATION",
    });
  }

  for (const place of places) {
    if (!place.reporting) continue;

    /* A place with returns in it earns a coverage line. */
    lines.push({
      id: `coverage-${place.code}`,
      kind: "TICKER",
      band: "LOCATION",
      text: `${upper(place.name)} — ${percent(place.reporting)} OF POLLING UNITS REPORTING`,
      why: `${place.filed} of ${place.expected} booths in ${place.name} have filed.`,
      scope: place.scope,
    });

    /* And a standings line, but only where two parties can actually be named
       and the coverage can be stated beside them. */
    const top = (place.parties ?? []).slice(0, 2);
    if (top.length === 2 && top[0].share > 0) {
      lines.push({
        id: `result-${place.code}`,
        kind: "TICKER",
        band: "RESULT",
        text:
          `${upper(place.name)} — ${top[0].id}: ${percent(top[0].share)} | ` +
          `${top[1].id}: ${percent(top[1].share)} · ${percent(place.reporting)} IN`,
        why: "Our agents' count. Never presented as a declaration.",
        scope: place.scope,
      });
    }

    /* Verification, where a place has been properly checked. This is the line
       the user's brief asked for by name, and it is the one that is only true
       when the checking has actually been done. */
    if (place.verified > 0) {
      lines.push({
        id: `verified-${place.code}`,
        kind: "LOWER_THIRD",
        band: "BREAKING",
        text: `${upper(place.name)}: ${percent((place.verified / Math.max(1, place.filed)) * 100)} OF RESULTS VERIFIED`,
        why: `${place.verified} of ${place.filed} returns from ${place.name} have been checked against a sheet.`,
        scope: place.scope,
      });
    }
  }

  /* ── INCIDENTS, WORDED AS AN INCIDENT AND NOT AS A FINDING ───────────── */
  for (const incident of incidents.slice(0, 6)) {
    const where = describeUnit(incident.unitCode);
    lines.push({
      id: `incident-${incident.id}`,
      kind: "TICKER",
      band: "INCIDENT",
      text: `ELECTION INCIDENT REPORTED IN ${upper(where)} — VERIFICATION UNDERWAY`,
      /* The narrative never goes near a ticker. An incident is a report from
         one person until somebody has been to look, and the difference between
         "reported" and "happened" is the whole of this product's credibility. */
      why: "Says a report exists. Says nothing about whether it is true.",
      scope: incident.scope ?? null,
    });
  }

  return lines.map((line) => ({ ...line, contest }));
}

const upper = (text) => String(text ?? "").toUpperCase();
const percent = (value) => `${Math.round(Number(value) || 0)}%`;

/** "Ward 7, Yola North" from a unit code, or the code itself if it will not parse. */
export function describeUnit(unitCode) {
  const parsed = parseUnitCode(unitCode);
  if (!parsed) return String(unitCode ?? "an unnamed place");
  const wardNumber = Number(parsed.wardCode.split("/")[2]);
  const ward = Number.isFinite(wardNumber) ? `Ward ${wardNumber}` : null;
  return [ward, parsed.stateName].filter(Boolean).join(", ") || String(unitCode);
}

/* ───────────────────────────────────────────────── places, rolled up ────── */

const STATE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state]));

/**
 * The count folded up by state, in the shape every broadcast surface wants it.
 *
 * One rollup, used by the ticker generator, the trend board, the map studio
 * and the command centre. They used to be four different loops over the same
 * rows in four different components, which is four chances for one of them to
 * count a disputed return.
 *
 * @param rows     returns for one contest
 * @param booths   state number → booths in the registry, where known
 */
export function byState({ rows = [], booths = {} } = {}) {
  const places = new Map();

  /* ── THE DENOMINATOR IS KEYED THE WAY THE UNIT CODES ARE ────────────────
     INEC numbers the states 01 to 37, zero-padded, and that padding is the
     one thing a caller building this map is likely to lose — an object
     literal keyed `{ 6: 2 }` looks identical and joins to nothing, so every
     state below ten silently reports no coverage at all. Normalised here
     rather than trusted, because the symptom is an em dash on a wall and
     nothing that looks like an error. */
  const expectedBy = new Map(
    Object.entries(booths).map(([key, value]) => [String(key).padStart(2, "0"), value])
  );

  for (const row of rows) {
    const parsed = parseUnitCode(row.unitCode);
    const state = parsed && STATE_BY_NUMBER.get(parsed.stateNumber);
    if (!state) continue;

    let place = places.get(state.number);
    if (!place) {
      place = {
        code: state.code,
        number: state.number,
        name: state.name,
        scope: `STATE:${state.number}`,
        filed: 0,
        verified: 0,
        registered: 0,
        accredited: 0,
        votes: {},
        firstAt: null,
        lastAt: null,
      };
      places.set(state.number, place);
    }

    place.filed += 1;
    if (row.status === "VERIFIED") place.verified += 1;
    place.registered += row.registered ?? 0;
    place.accredited += row.accredited ?? 0;

    for (const [party, count] of Object.entries(row.votes ?? {})) {
      place.votes[party] = (place.votes[party] ?? 0) + count;
    }

    const at = row.submittedAt ? new Date(row.submittedAt).getTime() : null;
    if (at) {
      place.firstAt = place.firstAt === null ? at : Math.min(place.firstAt, at);
      place.lastAt = place.lastAt === null ? at : Math.max(place.lastAt, at);
    }
  }

  return [...places.values()]
    .map((place) => {
      const expected = expectedBy.get(place.number) ?? 0;
      const cast = Object.values(place.votes).reduce((a, b) => a + b, 0);

      return {
        ...place,
        expected,
        /* ── NO DENOMINATOR, NO PERCENTAGE ─────────────────────────────
           A state whose booth count this project does not hold gets null
           rather than a share computed against zero. Null draws an em dash;
           a share computed against zero draws "Infinity%" on a wall. */
        reporting: expected > 0 ? (place.filed / expected) * 100 : null,
        turnout: place.registered > 0 ? (cast / place.registered) * 100 : null,
        cast,
        parties: Object.entries(place.votes)
          .map(([id, count]) => ({ id, count, share: cast > 0 ? (count / cast) * 100 : 0 }))
          .sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => b.filed - a.filed);
}

/**
 * Every place added up into one, in the same shape.
 *
 * ── WHY THE TOTAL IS NOT COMPUTED SEPARATELY ───────────────────────────────
 * A national figure summed straight from the rows and a national figure summed
 * from the states are the same number right up until one return has a unit
 * code that names no state — and then they differ by one, on two screens, and
 * somebody spends an hour finding out why. The total is the states added up,
 * so it cannot disagree with the table above it.
 */
export function rollUp(places = [], name = "Everywhere") {
  const votes = {};
  let filed = 0;
  let verified = 0;
  let registered = 0;
  let accredited = 0;
  let expected = 0;

  for (const place of places) {
    filed += place.filed;
    verified += place.verified;
    registered += place.registered;
    accredited += place.accredited;
    expected += place.expected ?? 0;
    for (const [party, count] of Object.entries(place.votes ?? {})) {
      votes[party] = (votes[party] ?? 0) + count;
    }
  }

  const cast = Object.values(votes).reduce((a, b) => a + b, 0);

  return {
    code: "ALL",
    number: "00",
    name,
    scope: "NATION",
    filed,
    verified,
    registered,
    accredited,
    expected,
    cast,
    votes,
    reporting: expected > 0 ? (filed / expected) * 100 : null,
    turnout: registered > 0 ? (cast / registered) * 100 : null,
    parties: Object.entries(votes)
      .map(([id, count]) => ({ id, count, share: cast > 0 ? (count / cast) * 100 : 0 }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ────────────────────────────────────────────────────────────── trends ──── */

/**
 * What is developing, for the person who has to fill two minutes of live
 * analysis in ten minutes' time.
 *
 * ── EVERY ITEM HERE IS A FACT WITH A DENOMINATOR ───────────────────────────
 * "Fastest reporting" is meaningless as a count — Lagos will always be filing
 * more returns than Bayelsa, because Lagos has more booths. It is a share of
 * that state's own expected booths or it is not a ranking, and a state whose
 * denominator is unknown is left out of the ranking entirely rather than
 * ranked on a number that means something else.
 */
export function reportingTrends({ places = [], rows = [], now = Date.now(), windowMinutes = 60 } = {}) {
  const ranked = places.filter((place) => place.reporting !== null && place.expected > 0);

  const since = now - windowMinutes * 60 * 1000;
  const recent = rows.filter(
    (row) => row.submittedAt && new Date(row.submittedAt).getTime() >= since
  );

  /* Movement, by state, over the window. A state that filed forty returns in
     the last hour is the story; a state that filed four hundred all day and
     none in the last hour is a different and equally reportable story. */
  const moved = new Map();
  for (const row of recent) {
    const parsed = parseUnitCode(row.unitCode);
    if (!parsed) continue;
    moved.set(parsed.stateNumber, (moved.get(parsed.stateNumber) ?? 0) + 1);
  }

  const withMovement = ranked.map((place) => ({
    ...place,
    moved: moved.get(place.number) ?? 0,
  }));

  return {
    windowMinutes,
    fastest: [...ranked].sort((a, b) => b.reporting - a.reporting).slice(0, 6),
    /* Only places that have started. A state at 0% has not stalled, it has not
       begun, and putting the two in one list invites a presenter to say the
       wrong one out loud. */
    slowest: [...ranked]
      .filter((place) => place.filed > 0)
      .sort((a, b) => a.reporting - b.reporting)
      .slice(0, 6),
    stalled: withMovement
      .filter((place) => place.filed > 0 && place.moved === 0 && place.reporting < 90)
      .sort((a, b) => b.filed - a.filed)
      .slice(0, 6),
    surging: withMovement
      .filter((place) => place.moved > 0)
      .sort((a, b) => b.moved - a.moved)
      .slice(0, 6),
    /* Widest and narrowest margins, which is what "biggest vote movements"
       becomes once it is made checkable: a margin between the top two, over
       the returns actually in. */
    closest: ranked
      .filter((place) => place.parties.length >= 2 && place.cast > 0)
      .map((place) => ({
        ...place,
        margin: place.parties[0].share - place.parties[1].share,
      }))
      .sort((a, b) => a.margin - b.margin)
      .slice(0, 6),
    turnout: ranked
      .filter((place) => place.turnout !== null)
      .sort((a, b) => b.turnout - a.turnout)
      .slice(0, 6),
  };
}

/* ────────────────────────────────────────────────── the running order ───── */

/**
 * NOW, NEXT, and what is after that.
 *
 * ── WHY "NOW" IS NOT SIMPLY THE FIRST ROW ──────────────────────────────────
 * A running order that decides what is on air by looking at the clock will,
 * within one late programme, tell a gallery that something is on which is not.
 * What is on air is what somebody put on air — the ON_AIR state — and the
 * schedule is what was *supposed* to happen. Both are shown, and where they
 * disagree the screen says so, because that disagreement is the single most
 * useful thing a master control operator can be told.
 */
export function runningOrder(items = [], now = Date.now()) {
  const programmes = items
    .filter((item) => item.kind === "PROGRAMME" && item.state !== "REJECTED")
    .sort((a, b) => stamp(a.scheduledFor) - stamp(b.scheduledFor));

  const onAir = programmes.find((item) => item.state === "ON_AIR") ?? null;
  const upcoming = programmes.filter(
    (item) => item.state !== "ON_AIR" && item.state !== "OFF_AIR" && stamp(item.scheduledFor) >= now
  );

  /* Due to start and nobody has taken it to air. Not an error — a gallery
     runs late all night — but the operator should be looking at it. */
  const overdue = programmes.filter(
    (item) =>
      item.state !== "ON_AIR" &&
      item.state !== "OFF_AIR" &&
      item.scheduledFor &&
      stamp(item.scheduledFor) < now
  );

  return {
    now: onAir,
    next: upcoming[0] ?? null,
    later: upcoming.slice(1, 6),
    overdue,
    /* The gallery is running something that was never scheduled, or nothing at
       all while a programme is due. Both are worth a word on screen. */
    adrift: Boolean(onAir && overdue.length > 0),
  };
}

const stamp = (value) => (value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER);

/* ────────────────────────────────────────────────────────── the desk ────── */

/**
 * The queue, folded into the buckets each surface asks for.
 *
 * One pass over the items rather than fourteen filters spread across fourteen
 * components — and, more to the point, one definition of "waiting on an
 * editor", which is the number that decides whether anybody looks at the
 * approval screen at all.
 */
export function deskLoad(items = []) {
  const by = (test) => items.filter(test);

  const review = by((item) => item.state === "REVIEW");
  const cleared = by((item) => item.state === "CLEARED");
  const onAir = by((item) => item.state === "ON_AIR");

  const kinds = {};
  for (const item of items) {
    kinds[item.kind] ??= { kind: item.kind, label: kindLabel(item.kind), total: 0, review: 0, onAir: 0 };
    kinds[item.kind].total += 1;
    if (item.state === "REVIEW") kinds[item.kind].review += 1;
    if (item.state === "ON_AIR") kinds[item.kind].onAir += 1;
  }

  return {
    total: items.length,
    review,
    cleared,
    onAir,
    drafts: by((item) => item.state === "DRAFT"),
    rejected: by((item) => item.state === "REJECTED"),
    /* What went out, most recent first. The audit surface reads this and so
       does the command centre, which needs "what did we say in the last hour"
       far more often than it needs "what is on air this second". */
    aired: items
      .filter((item) => item.airedAt)
      .sort((a, b) => new Date(b.airedAt) - new Date(a.airedAt)),
    kinds: Object.values(kinds).sort((a, b) => b.total - a.total),
  };
}

/** Items of one kind, newest first, optionally in one state. */
export const ofKind = (items, kind, state = null) =>
  items.filter((item) => item.kind === kind && (state === null || item.state === state));

/* ───────────────────────────────────────────────────────── catalogues ───── */

/**
 * The graphics bench.
 *
 * Each template names the figures it is built from, and a template whose
 * figures this project does not hold is shown as unavailable rather than
 * offered and then rendered empty. A producer who reaches for a Senate result
 * card on a presidential project should be told why it is not there, at the
 * moment they reach for it.
 */
export const TEMPLATES = [
  { id: "result-presidential", label: "Presidential result", group: "Result", needs: "PRESIDENTIAL", shape: "wide" },
  { id: "result-governorship", label: "Governorship result", group: "Result", needs: "GOVERNORSHIP", shape: "wide" },
  { id: "result-senate", label: "Senate result", group: "Result", needs: "SENATE", shape: "wide" },
  { id: "result-reps", label: "House of Representatives", group: "Result", needs: "HOUSE_OF_REPS", shape: "wide" },
  { id: "result-state", label: "State result", group: "Place", needs: "returns", shape: "wide" },
  { id: "result-lga", label: "Local government result", group: "Place", needs: "returns", shape: "wide" },
  { id: "result-ward", label: "Ward result", group: "Place", needs: "returns", shape: "square" },
  { id: "result-unit", label: "Polling unit result", group: "Place", needs: "returns", shape: "square" },
  { id: "turnout", label: "Turnout", group: "Analysis", needs: "register", shape: "wide" },
  { id: "share", label: "Vote share", group: "Analysis", needs: "returns", shape: "square" },
  { id: "candidates", label: "Candidate comparison", group: "Analysis", needs: "returns", shape: "wide" },
  { id: "parties", label: "Party comparison", group: "Analysis", needs: "returns", shape: "wide" },
  { id: "progress", label: "Reporting progress", group: "Analysis", needs: "registry", shape: "wide" },
  { id: "statistics", label: "Statistical analysis", group: "Analysis", needs: "returns", shape: "wide" },
  { id: "breaking", label: "Breaking news", group: "Alert", needs: "none", shape: "wide" },
  { id: "incident", label: "Incident alert", group: "Alert", needs: "incidents", shape: "wide" },
  { id: "map", label: "Election map", group: "Map", needs: "returns", shape: "wide" },
];

/**
 * What a broadcast map can be coloured by.
 *
 * Four questions, and they are not interchangeable: a map of who is leading
 * and a map of who has reported look identical to somebody glancing at a
 * screen and mean opposite things. Which one is on is stated on the map.
 */
export const MAP_MODES = [
  {
    id: "leading",
    group: "Result",
    label: "Leading party",
    why: "Who is ahead on the returns in. Grey is nobody reporting, not a tie.",
  },
  { id: "share", group: "Result", label: "Vote share", why: "The leader's share of the votes counted." },
  { id: "reporting", group: "Result", label: "Reporting", why: "How much of each place has filed." },
  { id: "turnout", group: "Activity", label: "Turnout", why: "Votes cast against the register, where both are held." },
  { id: "verified", group: "Activity", label: "Verified", why: "How much of what was filed has been checked." },
  { id: "incidents", group: "Incidents", label: "Incidents", why: "Reports from the field. Reports, not findings." },
];

export const MAP_LEVELS = [
  { id: "state", label: "State" },
  { id: "lga", label: "Local government" },
  { id: "ward", label: "Ward" },
  { id: "unit", label: "Polling unit" },
];

/**
 * The platforms, and the truth about each one.
 *
 * ── WHY THERE IS A `needs` COLUMN AND NO `connected` COLUMN ────────────────
 * Nothing in this repository holds a token for any of these. Writing a status
 * light that reads "connected" off a hard-coded true is how a desk comes to
 * believe a post went out. So each row says what it would take, and the screen
 * that draws them says plainly that none are connected, in one place, from one
 * fact.
 *
 * The desk is not blocked by this. Every one of these is reachable by making
 * the file and handing it to a person — which is what the product does today,
 * and which keeps a human being between this software and anything published
 * in a newsroom's name.
 */
export const PLATFORMS = [
  { id: "facebook", label: "Facebook", shape: "square", carries: "Image, video, text", needs: "A Page, an app review, and a page access token." },
  { id: "instagram", label: "Instagram", shape: "square", carries: "Image, reel", needs: "A professional account linked to a Page, plus the Graph API." },
  { id: "x", label: "X", shape: "wide", carries: "Image, video, text", needs: "A paid API tier. The free tier cannot post media." },
  { id: "youtube", label: "YouTube", shape: "wide", carries: "Video, short, live", needs: "A channel and an OAuth grant per upload identity." },
  { id: "tiktok", label: "TikTok", shape: "story", carries: "Short video", needs: "Content Posting API access, granted per app." },
  { id: "whatsapp", label: "WhatsApp", shape: "square", carries: "Image, text, broadcast list", needs: "Already configured for the field channel — see the WhatsApp desk." },
  { id: "telegram", label: "Telegram", shape: "square", carries: "Image, video, text", needs: "A bot token and a channel it administers." },
];

/** The three shapes anything published has to become. */
export const SHAPES = [
  { id: "wide", label: "Wide", size: "1200 × 675", why: "Timelines, X, Facebook, a YouTube thumbnail." },
  { id: "square", label: "Square", size: "1080 × 1080", why: "Feeds. Instagram, Facebook, WhatsApp." },
  { id: "story", label: "Story", size: "1080 × 1920", why: "Full screen. Reels, Shorts, TikTok, status." },
];

/**
 * Who does what on a broadcast desk, and which account each one signs in as.
 *
 * ── TWELVE DUTIES, AND NOT TWELVE ROLES ────────────────────────────────────
 * A newsroom has a dozen job titles. This product has a permission table, and
 * inventing a role per job title would double the size of the thing every
 * future screen has to be audited against while granting exactly the same
 * capabilities twelve times over.
 *
 * So the duties are named — because a producer needs to see their own job on
 * the screen — and each is mapped to the capability that actually governs it.
 * The separation that matters is enforced by a rule rather than by a title:
 * nobody clears their own work. See app/broadcast/actions.js.
 */
export const DUTIES = [
  { id: "director", label: "Broadcast director", does: "Decides what goes to air.", capability: "broadcast:clear" },
  { id: "exec", label: "Executive producer", does: "Owns the running order.", capability: "broadcast:clear" },
  { id: "news-editor", label: "News editor", does: "Clears copy and breaking straps.", capability: "broadcast:clear" },
  { id: "election-editor", label: "Election editor", does: "Clears figures for reading out.", capability: "broadcast:clear" },
  { id: "data-editor", label: "Data editor", does: "Holds the count against the sheets.", capability: "results:verify" },
  { id: "graphics", label: "Graphics producer", does: "Builds the frames.", capability: "broadcast:draft" },
  { id: "video", label: "Video producer", does: "Cuts the packages.", capability: "broadcast:draft" },
  { id: "social", label: "Social media manager", does: "Adapts and schedules for platforms.", capability: "broadcast:draft" },
  { id: "reporter", label: "Reporter", does: "Files from a location.", capability: "results:file" },
  { id: "correspondent", label: "Correspondent", does: "Files from a location.", capability: "results:file" },
  { id: "factcheck", label: "Fact checker", does: "Runs claims against the count.", capability: "broadcast:draft" },
  { id: "mcr", label: "Master control", does: "Takes cleared items to air.", capability: "broadcast:air" },
];

/**
 * The claim workflow, which is the one thing on this desk that can end in
 * three different places rather than one.
 */
export const CLAIM_STEPS = [
  { id: "detected", label: "Detected", why: "Somebody has seen it circulating." },
  { id: "sourced", label: "Source identified", why: "Where it came from, and when." },
  { id: "field", label: "Field check", why: "Somebody at the place it names has been asked." },
  { id: "data", label: "Poll360 data check", why: "Held against the returns this product holds." },
  { id: "editor", label: "Editor review", why: "A person decides what may be said." },
];

export const VERDICTS = [
  { id: "VERIFIED", label: "Verified", tone: "good", why: "Corroborated. May be reported as established." },
  { id: "FALSE", label: "False", tone: "alert", why: "Contradicted by what we hold. May be reported as false." },
  { id: "UNCONFIRMED", label: "Unconfirmed", tone: "warn", why: "Neither. May only be reported as an unverified claim." },
];

/**
 * The one sentence this whole arm is built around, kept here so the screens
 * that state it cannot drift from each other.
 */
export const SPINE = [
  "Live data",
  "Verify",
  "Analyse",
  "Create",
  "Approve",
  "Broadcast",
  "Distribute",
  "Measure",
];
