import { UPDATE_STEPS } from "./agent-day.js";
import { STATES } from "./units.js";

/**
 * The night, as one operational clock.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT HAPPENED, WHERE, AND WHEN — WITHOUT A SCHEDULE
 *
 *  Every timeline of an election day starts life as a printed plan: agents
 *  deploy at five, polls open at half past eight, counting at half past two.
 *  A screen that draws that plan is drawing a document, not a night. It looks
 *  identical whether the deployment happened or not, and on the one morning
 *  the lorries did not arrive it will still say 05:00 Agents deploy.
 *
 *  So nothing on this timeline is scheduled. Every entry is a moment this
 *  product actually observed — a sign-in, a position, a return, a check, a
 *  report from the field — and a phase that has not happened has no time
 *  beside it and says so. The commission's own timetable is carried as a
 *  nominal hour for context and is never mistaken for an observation.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND IT IS BUCKETS, NOT A LOG ───────────────────────────────────────────
 * Four thousand returns is not a timeline, it is a printout. The night is cut
 * into half-hours, each carrying what moved in it, and only the moments that
 * are singular — the first of something, a report at the top severity — are
 * named individually. That is the shape somebody can read across a room.
 * ───────────────────────────────────────────────────────────────────────────
 */

const MIN = 60 * 1000;

/** The width of one row of the timeline. */
export const SLOT_MINUTES = 30;

/** How far back the timeline will reach when the night is a long one. */
const MAX_SLOTS = 40;

const STATE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state]));

/* ══════════════════════════════════════════════════════════════════════════
   WHAT AN AGENT'S UPDATE IS EVIDENCE OF

   ── THE PHASES USED TO BE INFERRED FROM THE WRONG THING ──────────────────
   "Polling under way" was timed from the first *incident* — the first thing
   that went wrong. On a good morning that is hours late, and on a perfect one
   it never happens at all, so the phase that says polling started stayed blank
   through an entire day of successful voting. Meanwhile every agent in the
   country was pressing "Voting has started" at the booth, and nothing read it.

   An update is a direct observation of a phase beginning, which is the
   strongest evidence this product can hold. So where one exists it is used,
   and the older inference stays underneath it as a fallback for a deployment
   with no agents' app — see `observedFrom` below.

   A step that is not evidence of a phase is absent here on purpose. It still
   counts in the buckets and can still be a moment; it simply does not time a
   phase.
   ══════════════════════════════════════════════════════════════════════════ */
const STEP_PHASE = {
  arrival: "deploy",
  polls_open: "opened",
  counting_start: "counting",
};

/** Every step, by type, for labelling a moment in the words the agent saw. */
const STEP_LABEL = new Map(UPDATE_STEPS.map((step) => [step.type, step.label]));

/* The day's order, so "the first booth to reach this step" is a sentence about
   progress rather than about whichever button happens to be pressed. */
const STEP_ORDER = new Map(UPDATE_STEPS.map((step, index) => [step.type, index]));

function stateOf(unitCode) {
  const digits = String(unitCode ?? "").replace(/[^0-9]/g, "").slice(0, 2);
  return STATE_BY_NUMBER.get(digits) ?? null;
}

/**
 * The phases of an election day, and the evidence that each one began.
 *
 * `nominal` is the commission's timetable, in Nigerian local hours, and is
 * printed greyed as context. `evidence` names, in words the screen shows, what
 * this product would have to see for the phase to be observed — so a phase
 * with no time beside it is legible as "we have not seen this yet" rather than
 * as a gap in the data.
 */
export const PHASES = [
  {
    id: "deploy",
    label: "Agents on the ground",
    nominal: "05:00",
    evidence: "The first agent to say they had arrived, or to open their account.",
  },
  {
    id: "located",
    label: "First location reports",
    nominal: "06:30",
    evidence: "The first position sent in from a booth.",
  },
  {
    id: "opened",
    label: "Polling under way",
    nominal: "08:30",
    evidence: "The first agent to report that voting had started.",
  },
  {
    id: "counting",
    label: "Counting at the booths",
    nominal: "14:30",
    evidence: "The first agent to report counting, or the first return to arrive.",
  },
  {
    id: "arriving",
    label: "Returns arriving in volume",
    nominal: "18:00",
    evidence: "The first half-hour to reach a quarter of the busiest one.",
  },
  {
    id: "peak",
    label: "Busiest half-hour",
    nominal: null,
    evidence: "The half-hour the most returns landed in.",
  },
  {
    id: "verifying",
    label: "Verification under way",
    nominal: "20:00",
    evidence: "The first return a desk accepted.",
  },
  {
    id: "latest",
    label: "Most recent return",
    nominal: null,
    evidence: "The last thing to arrive.",
  },
];

/** The smallest date in a list, ignoring anything missing. */
function earliest(values) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : null))
    .filter((value) => value !== null && Number.isFinite(value));
  return times.length ? new Date(Math.min(...times)) : null;
}

function latest(values) {
  const times = values
    .map((value) => (value ? new Date(value).getTime() : null))
    .filter((value) => value !== null && Number.isFinite(value));
  return times.length ? new Date(Math.max(...times)) : null;
}

/**
 * Build the timeline.
 *
 * Pure, over rows the room already holds, and `now` is an argument for the
 * same reason it is one in lib/pulse.js: a timeline whose buckets each read
 * their own clock draws a boundary that moved while it was being drawn.
 */
export function nightTimeline({
  rows = [],
  incidents = [],
  coordinators = [],
  /* What the agents sent from their booths: one row per press, with a position
     where the phone had one. See `unitUpdates.recent` in lib/db.js. */
  updates = [],
  now = Date.now(),
} = {}) {
  /* ── THE BUCKETS ───────────────────────────────────────────────────────
     Aligned to the half hour so two renders a minute apart draw the same
     boundaries, and running to now rather than to the last return — a night
     that has gone quiet for two hours should show two hours of empty rows,
     because that emptiness is the finding. */
  const width = SLOT_MINUTES * MIN;
  const edge = Math.floor(now / width) * width;

  const firstFiled = earliest(rows.map((row) => row.submittedAt));
  const firstIncident = earliest(incidents.map((row) => row.createdAt));
  const firstSeen = earliest(coordinators.map((row) => row.lastSeen));
  const firstFix = earliest(coordinators.map((row) => row.seenAt));

  /* The first of each step, nationally. An update is the only direct
     observation of a phase this product receives. */
  const firstStep = firstOfEachStep(updates);
  /* An update carrying a position places an agent at a booth as surely as a
     coordinator fix does, and usually earlier — it is sent standing there. */
  const firstPlaced = earliest(
    updates.filter((row) => row.lat != null && row.lon != null).map((row) => row.at)
  );
  const firstUpdate = earliest(updates.map((row) => row.at));

  const opening = earliest([firstFiled, firstIncident, firstSeen, firstFix, firstUpdate]);

  const span = opening
    ? Math.min(MAX_SLOTS, Math.max(1, Math.ceil((edge - Math.floor(opening.getTime() / width) * width) / width) + 1))
    : 1;

  const slots = Array.from({ length: span }, (_, index) => {
    const start = edge - (span - 1 - index) * width;
    const end = start + width;

    const filedHere = rows.filter((row) => inside(row.submittedAt, start, end));
    const verifiedHere = rows.filter((row) => inside(row.verifiedAt, start, end));
    const reportedHere = incidents.filter((row) => inside(row.createdAt, start, end));
    const seenHere = coordinators.filter(
      (row) => inside(row.lastSeen, start, end) || inside(row.seenAt, start, end)
    );
    const updatedHere = updates.filter((row) => inside(row.at, start, end));

    return {
      at: new Date(start),
      filed: filedHere.length,
      verified: verifiedHere.length,
      incidents: reportedHere.length,
      /* Reports at the top two severities counted apart, because a row with
         four reports in it and a row with four *serious* reports in it are not
         the same half-hour and must not draw the same bar. */
      loud: reportedHere.filter((row) => row.severity === "CRITICAL" || row.severity === "SERIOUS")
        .length,
      signedIn: seenHere.length,
      /* ── THE MORNING HAS A SHAPE TOO ──────────────────────────────────
         Returns arrive in the evening, so every bucket before about two in
         the afternoon used to draw as empty — which read as a dead night
         rather than as the hours when the whole field was actually working.
         Updates are what happened in them. */
      updates: updatedHere.length,
      /* The booths heard from in this half-hour, by any means. It is the
         honest denominator for "is the field alive right now", which neither
         returns nor reports answer on their own. */
      booths: new Set(
        [...updatedHere, ...reportedHere, ...filedHere].map((row) => row.unitCode).filter(Boolean)
      ).size,
      /* Where it came from, so the row can be read without opening it. A
         morning bucket has no returns in it, so its states come from the
         updates instead and the row is still legible. */
      states: [
        ...new Set(
          (filedHere.length ? filedHere : updatedHere)
            .map((row) => stateOf(row.unitCode)?.name)
            .filter(Boolean)
        ),
      ],
    };
  });

  const peak = slots.reduce(
    (best, slot) => (slot.filed > (best?.filed ?? -1) ? slot : best),
    null
  );

  /* The first half-hour that got properly busy: a quarter of the peak. It is
     the moment a room stops waiting and starts working, and it is nowhere in
     any timetable. */
  const threshold = Math.max(1, Math.ceil((peak?.filed ?? 0) / 4));
  const ramp = slots.find((slot) => slot.filed >= threshold && slot.filed > 0) ?? null;

  /* ── OBSERVED, PREFERRING THE DIRECT OBSERVATION ────────────────────────
     Where an agent said a phase began, that is the time. Where none did, the
     older inference stands — a deployment running without the agents' app is
     exactly as it was. `earliest` ignores nulls, so a phase with both takes
     whichever actually happened first, which is the honest answer when a booth
     filed a report before anyone pressed anything. */
  const observed = {
    deploy: earliest([firstStep.arrival, firstSeen]),
    located: earliest([firstPlaced, firstFix]),
    opened: earliest([firstStep.polls_open, firstIncident]),
    counting: earliest([firstStep.counting_start, firstFiled]),
    arriving: ramp?.at ?? null,
    peak: peak?.filed ? peak.at : null,
    verifying: earliest(rows.map((row) => row.verifiedAt)),
    latest: latest([...rows.map((row) => row.submittedAt), ...updates.map((row) => row.at)]),
  };

  /* ══════════════════════════════════════════════════════════════════════
     THE SAME PHASE, STATE BY STATE

     ── ONE TIME AGAINST A PHASE IS THE LEAST USEFUL TRUE THING ────────────
     "Polling under way, 08:12" is a real observation and it is the *first*
     one, which on a national timeline means it describes one state and is
     silently wrong about the other thirty-six. Polls open at half past eight
     in some places and at eleven in others — because the materials were late,
     or the queue had not formed, or nobody had arrived to open the booth —
     and that spread is the single most operationally useful fact on this
     screen. It is the difference between a slow morning and a problem in one
     region, and the national first-observation hides it completely.

     So every phase carries the same observation per state, and the screen
     opens one to show all of them. A state that has not reached a phase is
     present with a null time rather than absent: "we have not seen this in
     Bayelsa" is the finding, and a list that omitted Bayelsa would read as
     though Bayelsa were not in the election.
     ══════════════════════════════════════════════════════════════════════ */
  const perState = byStateFor({ rows, incidents, coordinators, updates, slots, width });

  const phases = PHASES.map((phase) => ({
    ...phase,
    at: observed[phase.id] ?? null,
    /* Every state, earliest first, with the ones still waiting at the end. */
    byState: perState[phase.id] ?? [],
    spread: spreadOf(perState[phase.id] ?? []),
    /* What the phase is worth beyond its time. A phase nobody can put a
       figure against reads as decoration. */
    figure:
      phase.id === "peak" && peak?.filed
        ? `${peak.filed} in ${SLOT_MINUTES} minutes`
        : phase.id === "counting" && rows.length
          ? `${rows.length} in total`
          : phase.id === "verifying"
            ? `${rows.filter((row) => row.status === "VERIFIED").length} accepted`
            : phase.id === "deploy" && coordinators.length
              ? `${coordinators.filter((row) => row.lastSeen).length} of ${coordinators.length} signed in`
              : phase.id === "opened"
                ? stepCount(updates, "polls_open")
                  ? `${stepCount(updates, "polls_open")} booths voting`
                  : incidents.length
                    ? `${incidents.length} reports since`
                    : null
                : phase.id === "located" && firstPlaced
                  ? `${new Set(
                      updates
                        .filter((row) => row.lat != null && row.lon != null)
                        .map((row) => row.unitCode)
                    ).size} booths placed`
                  : null,
  }));

  /* ── THE MOMENTS ───────────────────────────────────────────────────────
     What a person would actually write in a log. Two kinds only: the first
     time something happened somewhere, and anything at the top severity.
     Everything else is in the buckets, where volume belongs. */
  const moments = [];

  const seenState = new Set();
  for (const row of [...rows].sort(byTime("submittedAt"))) {
    const state = stateOf(row.unitCode);
    if (!state || seenState.has(state.code)) continue;
    seenState.add(state.code);
    moments.push({
      id: `first-${state.code}`,
      at: row.submittedAt,
      kind: "first",
      headline: `First return from ${state.name}`,
      detail: row.unitCode,
    });
  }

  /* ── THE FIRST BOOTH TO REACH EACH STEP ────────────────────────────────
     One moment per step, not one per press. Four thousand agents pressing
     "Voting has started" is a bucket; the first of them is a moment, and it is
     the one a room writes in its log. Ordered by the day rather than by the
     clock so a step sent late still reads as the step it is. */
  for (const [type, first] of Object.entries(firstStep)) {
    if (!first) continue;
    const from = updates.find((row) => row.step === type && sameTime(row.at, first));
    moments.push({
      id: `step-${type}`,
      at: first,
      kind: "step",
      headline: `First booth: ${(STEP_LABEL.get(type) ?? type).toLowerCase()}`,
      detail: [from?.unitCode, from?.reporter].filter(Boolean).join(" · ") || null,
    });
  }

  for (const item of incidents) {
    if (item.severity !== "CRITICAL") continue;
    moments.push({
      id: `incident-${item.id}`,
      at: item.createdAt,
      kind: "critical",
      headline: item.kind ?? "Report at the top severity",
      detail: [item.unitCode, item.reporter].filter(Boolean).join(" · ") || null,
    });
  }

  moments.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return {
    at: new Date(now),
    slots,
    phases,
    /* Newest first, because a timeline read during a night is read from the
       top. The chart above it runs the other way, left to right, the way a
       clock does — the two orderings are deliberate and each matches how its
       own form is read. */
    moments: moments.slice(0, 40),
    span: { from: slots[0]?.at ?? null, to: new Date(edge + width) },
    quietFor: observed.latest ? (now - new Date(observed.latest).getTime()) / MIN : null,
  };
}

/**
 * Every phase, observed separately in every state.
 *
 * The same evidence the national phase uses, applied inside one state's own
 * returns. `peak` and `arriving` are shapes of a night rather than single
 * events, so they are computed per state too: a state's busiest half-hour is
 * a real thing about that state and is rarely the country's.
 */
function byStateFor({ rows, incidents, coordinators, updates = [], slots, width }) {
  const held = new Map();

  const bucket = (code, name) => {
    if (!held.has(code)) {
      held.set(code, {
        code,
        name,
        filed: [],
        verified: [],
        reported: [],
        seen: [],
        fixed: [],
        /* Keyed by step, because a state reaches "voting has started" at its
           own hour and that spread is the whole point of this list. */
        stepped: new Map(),
        placed: [],
      });
    }
    return held.get(code);
  };

  /* Every state in the country, whether or not anything has happened in it.
     A phase list that only carried the states that had reached it would read
     as though the rest were not in the election. */
  for (const state of STATES) bucket(state.number, state.name);

  for (const row of rows) {
    const state = stateOf(row.unitCode);
    if (!state) continue;
    const into = bucket(state.number, state.name);
    if (row.submittedAt) into.filed.push(new Date(row.submittedAt));
    if (row.verifiedAt) into.verified.push(new Date(row.verifiedAt));
  }

  for (const item of incidents) {
    const state = stateOf(item.unitCode);
    if (!state) continue;
    if (item.createdAt) bucket(state.number, state.name).reported.push(new Date(item.createdAt));
  }

  for (const person of coordinators) {
    const state = stateOf(person.unitCode) ?? STATE_BY_NUMBER.get(person.stateCode);
    if (!state) continue;
    const into = bucket(state.number, state.name);
    if (person.lastSeen) into.seen.push(new Date(person.lastSeen));
    if (person.seenAt) into.fixed.push(new Date(person.seenAt));
  }

  for (const update of updates) {
    const state = stateOf(update.unitCode);
    if (!state || !update.at) continue;
    const into = bucket(state.number, state.name);
    const at = new Date(update.at);
    if (!into.stepped.has(update.step)) into.stepped.set(update.step, []);
    into.stepped.get(update.step).push(at);
    if (update.lat != null && update.lon != null) into.placed.push(at);
  }

  const out = {};
  for (const phase of PHASES) out[phase.id] = [];

  for (const state of held.values()) {
    /* This state's own half-hours, so its peak and its ramp are about it and
       not about whichever state happened to be busiest nationally. */
    const counts = slots.map(
      (slot) =>
        state.filed.filter((at) => at.getTime() >= slot.at.getTime() && at.getTime() < slot.at.getTime() + width)
          .length
    );
    const most = Math.max(0, ...counts);
    const peakIndex = most > 0 ? counts.indexOf(most) : -1;
    const rampFloor = Math.max(1, Math.ceil(most / 4));
    const rampIndex = most > 0 ? counts.findIndex((count) => count >= rampFloor && count > 0) : -1;

    const stepAt = (type) => min(state.stepped.get(type) ?? []);

    const at = {
      deploy: earliest([stepAt("arrival"), min(state.seen)]),
      located: earliest([min(state.placed), min(state.fixed)]),
      opened: earliest([stepAt("polls_open"), min(state.reported)]),
      counting: earliest([stepAt("counting_start"), min(state.filed)]),
      arriving: rampIndex >= 0 ? slots[rampIndex].at : null,
      peak: peakIndex >= 0 ? slots[peakIndex].at : null,
      verifying: min(state.verified),
      latest: max(state.filed),
    };

    const voting = (state.stepped.get("polls_open") ?? []).length;

    const figure = {
      deploy: state.seen.length ? `${state.seen.length} signed in` : null,
      located: state.placed.length || state.fixed.length
        ? `${state.placed.length + state.fixed.length} placed`
        : null,
      opened: voting
        ? plural(voting, "booth") + " voting"
        : state.reported.length
          ? plural(state.reported.length, "report")
          : null,
      counting: state.filed.length ? plural(state.filed.length, "return") : null,
      arriving: null,
      peak: most > 0 ? `${most} in ${SLOT_MINUTES} minutes` : null,
      verifying: state.verified.length ? `${state.verified.length} accepted` : null,
      latest: state.filed.length ? plural(state.filed.length, "return") : null,
    };

    for (const phase of PHASES) {
      out[phase.id].push({
        code: state.code,
        name: state.name,
        at: at[phase.id] ?? null,
        figure: figure[phase.id] ?? null,
      });
    }
  }

  /* Earliest first; everything still waiting falls to the end in its own
     alphabetical order, so a reader scanning for a state can find it. */
  for (const phase of PHASES) {
    out[phase.id].sort((a, b) => {
      if (a.at && b.at) return a.at.getTime() - b.at.getTime();
      if (a.at) return -1;
      if (b.at) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return out;
}

/**
 * How far apart the first state and the last were.
 *
 * The whole reason the per-state list exists: "polls opened at 08:12" is one
 * state, and "the earliest was 08:12 and the latest 11:47, three and a half
 * hours apart, and nine states have not got there" is the morning.
 */
function spreadOf(states) {
  const seen = states.filter((row) => row.at);
  if (!seen.length) return { seen: 0, waiting: states.length, first: null, last: null, minutes: null };

  const first = seen[0];
  const last = seen[seen.length - 1];
  return {
    seen: seen.length,
    waiting: states.length - seen.length,
    first,
    last,
    minutes: (last.at.getTime() - first.at.getTime()) / MIN,
  };
}

/**
 * The first time each step was sent, by step type.
 *
 * One pass. Returned as a plain object keyed by type so a caller can ask for a
 * step by name without knowing whether anybody has reached it.
 */
function firstOfEachStep(updates = []) {
  const first = {};
  for (const row of updates) {
    if (!row?.step || !row.at) continue;
    const at = new Date(row.at);
    if (!Number.isFinite(at.getTime())) continue;
    if (!first[row.step] || at < first[row.step]) first[row.step] = at;
  }
  /* In the day's order, so `Object.entries` reads down the day rather than in
     whatever order the rows happened to arrive. */
  return Object.fromEntries(
    Object.entries(first).sort(
      ([a], [b]) => (STEP_ORDER.get(a) ?? 99) - (STEP_ORDER.get(b) ?? 99)
    )
  );
}

/** How many distinct booths have sent this step. */
function stepCount(updates, type) {
  return new Set(updates.filter((row) => row.step === type).map((row) => row.unitCode)).size;
}

const sameTime = (a, b) => a && b && new Date(a).getTime() === new Date(b).getTime();

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

const min = (values) => (values.length ? new Date(Math.min(...values.map((at) => at.getTime()))) : null);
const max = (values) => (values.length ? new Date(Math.max(...values.map((at) => at.getTime()))) : null);

function inside(value, start, end) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= start && time < end;
}

const byTime = (field) => (a, b) => new Date(a[field]).getTime() - new Date(b[field]).getTime();
