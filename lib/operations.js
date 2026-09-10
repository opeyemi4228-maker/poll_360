import { auditSheet } from "./results.js";
import { screenReturn } from "./anomalies.js";
import { CHANNELS } from "./pulse.js";
import { STATES } from "./units.js";

/**
 * The result pipeline.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE QUESTION THIS FILE EXISTS TO ANSWER: WHERE IS IT STUCK
 *
 *  A count is not a number arriving. It is a number arriving and then being
 *  put through six things before anybody is allowed to say it out loud, and
 *  on a live night the failure is almost never "nothing came in" — it is
 *  "four hundred came in and three hundred of them are sitting behind one
 *  desk that went to lunch". A screen that reports only the top and the
 *  bottom of that ladder cannot see the middle, which is where the whole
 *  night is actually lost.
 *
 *  So every return is placed on the ladder, the ladder is drawn with the
 *  drop between each rung, and each rung carries how long the returns
 *  standing on it have been standing there.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THE RUNGS ARE NESTED AND NOT MERELY ORDERED ───────────────────────
 * The first draft of this defined each rung as its own independent test and
 * then forced the result to decrease. That produced a ladder that was monotone
 * and meaningless: validation is an arithmetic screening that runs whether or
 * not anybody photographed the sheet, so a return with no evidence at all
 * passed it vacuously and was back-filled onto the two evidence rungs it had
 * never been near. The chart then reported that the sheets had been read.
 *
 * Each rung now *contains* the one above it. Validated means confirmed and
 * arithmetically sound; confirmed means read and compared. A return with no
 * photograph stops at Received, which is the truth about it, and the drop is
 * visible where the work actually is.
 *
 * ── THE ONE PLACE A HUMAN OUTRANKS THE LADDER ──────────────────────────────
 * A desk that rings the presiding officer and accepts the figures has done a
 * better job than any reader would have, and it does so without a photograph
 * existing. Verification therefore counts as having cleared everything beneath
 * it — the single back-fill in this file — because the alternative is a funnel
 * that widens at the last rung, which everybody in the room reads as a bug.
 *
 * That back-fill can hide two things, so neither is left to it. `withoutEvidence`
 * counts returns a desk accepted with no sheet ever compared, and
 * `verifiedImpossible` counts the ones accepted despite breaking arithmetic.
 * Both are returned separately and printed beside the ladder.
 * ───────────────────────────────────────────────────────────────────────────
 */

const MIN = 60 * 1000;

/**
 * The rungs, in order, each with the test that puts a return on it.
 *
 * The spec this was built to names eight; there are six here, and the two
 * that are missing are missing on purpose rather than by omission:
 *
 *   APPROVED   this product has one act of acceptance, not two. A desk
 *              verifies, and that is the approval. Drawing an eighth box for
 *              a step nobody performs would put a permanent 0 on the wall and
 *              teach the room to ignore the last box on the chart.
 *   PUBLISHED  every counted return is already on the board — publication is
 *              not a state a return waits in here, it is what the board is.
 *              It appears as the foot of the ladder rather than as a rung.
 */
export const STAGES = [
  {
    id: "expected",
    label: "Expected",
    why: "Booths we have somebody standing at.",
  },
  {
    id: "received",
    label: "Received",
    why: "A return for this contest has arrived from the booth.",
  },
  {
    id: "extracted",
    label: "Sheet read",
    why: "A photograph of the sheet arrived and a reader was run over it.",
  },
  {
    id: "confirmed",
    label: "Agent confirmed",
    why: "The figures on the sheet were held against the ones the agent typed.",
  },
  {
    id: "validated",
    label: "Validated",
    why: "Breaks no arithmetic, and its own sheet adds up.",
  },
  {
    id: "verified",
    label: "Verified",
    why: "A desk has checked it and accepted it into the count.",
  },
];

/** Only the rungs a return itself stands on. "Expected" is the roster. */
const ROW_STAGES = STAGES.slice(1).map((stage) => stage.id);

const STATE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state]));

function stateOf(unitCode) {
  const digits = String(unitCode ?? "").replace(/[^0-9]/g, "").slice(0, 2);
  return STATE_BY_NUMBER.get(digits) ?? null;
}

const channelOf = (source) =>
  CHANNELS[source] ? source : source === "DESK" ? "UPLOAD" : "UNKNOWN";

function percentile(sorted, p) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

/**
 * Which rungs one return has cleared, and where it is standing.
 *
 * Returned as a set of booleans rather than a single index because the caller
 * needs both readings: the ladder wants "has it cleared this or better", and
 * the stuck list wants "what is the next thing that has not happened to it".
 */
export function stageOf(row) {
  const testable =
    row.usedBallots != null || row.statedValid != null || row.ballotsIssued != null;

  /* An impossible figure is the only thing that fails validation outright.
     Implausible and outlying returns are context for a human, not a stop —
     see the four classes in lib/anomalies.js. Holding a legal-but-unusual
     return out of the count would make the product quietly editorial. */
  const impossible = screenReturn(row).some((flag) => flag.severity === "IMPOSSIBLE");
  const balances = testable ? auditSheet(row).balances : true;

  /* Three states on `sheetMatch` and only the first is "no sheet at all" —
     see toResult in lib/db.js. A sheet that arrived and could not be read has
     still been read *at*, which is what the first of these measures. */
  const extracted = row.sheetMatch != null;
  const confirmed = extracted && row.sheetMatch.compared === true;

  const cleared = {
    received: true,
    extracted,
    confirmed,
    /* Nested, not independent: the arithmetic alone is not validation, or a
       return nobody photographed would clear this rung by default. */
    validated: confirmed && !impossible && balances,
    verified: row.status === "VERIFIED",
  };

  /* The one back-fill, and only from the top. See the head of this file. */
  if (cleared.verified) for (const id of ROW_STAGES) cleared[id] = true;

  /* Where it is standing is the last rung it cleared. The one after that is
     what somebody has to do to it next. */
  let reached = "received";
  for (const id of ROW_STAGES) if (cleared[id]) reached = id;

  const next = ROW_STAGES[ROW_STAGES.indexOf(reached) + 1] ?? null;

  return { cleared, reached, next, impossible, balances, testable };
}

/**
 * Assemble the pipeline.
 *
 * `rows` are counted returns, `disputed` the count of rows a desk has thrown
 * out (they are not in `rows` — lib/db.js keeps disputed rows out of every
 * sum, which is right for a tally and wrong for a dashboard about processing,
 * so the figure is passed in beside them).
 */
export function pipeline({
  rows = [],
  disputed = 0,
  assigned = 0,
  unitsRegistered = 0,
  now = Date.now(),
} = {}) {
  const placed = rows.map((row) => ({ row, at: stageOf(row) }));

  /* ── THE LADDER ────────────────────────────────────────────────────────
     "Expected" is the roster and never the registry: a pipeline whose first
     box is 176,846 booths reports 99% loss on a deployment that is doing
     exactly what it planned to. The registry is carried alongside so the
     screen can print the other denominator without ever dividing by it. */
  const expected = Math.max(assigned, rows.length);

  const stages = STAGES.map((stage) => {
    if (stage.id === "expected") {
      return { ...stage, count: expected, held: 0, ages: [], oldest: null, p50: null };
    }

    const here = placed.filter((item) => item.at.cleared[stage.id]);
    /* Held: cleared this rung and not the next one. The drop, made into a
       list of returns somebody can actually go and work on. */
    const held = placed.filter((item) => item.at.reached === stage.id);
    const ages = held
      .map((item) =>
        item.row.submittedAt ? (now - new Date(item.row.submittedAt).getTime()) / MIN : null
      )
      .filter((value) => value !== null)
      .sort((a, b) => a - b);

    return {
      ...stage,
      count: here.length,
      held: held.length,
      oldest: ages.length ? ages.at(-1) : null,
      p50: percentile(ages, 50),
    };
  });

  /* ── WHAT IS STUCK, NAMED ──────────────────────────────────────────────
     A figure on a chart is not actionable; a booth code is. Oldest first,
     because on a night the return that has been waiting longest is the one
     most likely to have been forgotten rather than to be merely slow. */
  const stuck = placed
    .filter((item) => item.at.next !== null)
    .map((item) => ({
      unitCode: item.row.unitCode,
      state: stateOf(item.row.unitCode)?.name ?? item.row.stateCode ?? null,
      stage: item.at.reached,
      next: item.at.next,
      channel: channelOf(item.row.source),
      minutes: item.row.submittedAt
        ? (now - new Date(item.row.submittedAt).getTime()) / MIN
        : null,
      /* Why it stopped, in the words the rung uses, so the list is readable
         without cross-referencing the chart above it. */
      because:
        item.at.next === "extracted"
          ? "No photograph of the sheet"
          : item.at.next === "confirmed"
            ? "Sheet never held against the typed figures"
            : item.at.next === "validated"
              ? item.at.impossible
                ? "Breaks arithmetic"
                : "Its own sheet does not add up"
              : "Waiting for a desk",
    }))
    .sort((a, b) => (b.minutes ?? -1) - (a.minutes ?? -1));

  /* ── HOW LONG THE MIDDLE TAKES ─────────────────────────────────────────
     Submission to verification, which is the only span this product times
     end to end. p50 and p90 rather than a mean: verification queues are
     bursty, and a mean over a night where one return waited six hours reports
     a delay nobody experienced. */
  const waits = rows
    .map((row) =>
      row.verifiedAt && row.submittedAt
        ? (new Date(row.verifiedAt).getTime() - new Date(row.submittedAt).getTime()) / MIN
        : null
    )
    .filter((value) => value !== null && value >= 0)
    .sort((a, b) => a - b);

  /* ── THE HONEST COUNTERWEIGHT TO A MONOTONE LADDER ─────────────────────
     Returns a desk accepted that never had their sheet held against them.
     Nothing is wrong with these — a desk that rang the presiding officer did
     a better job than any reader would have — but a room that cannot see the
     figure cannot tell a well-evidenced count from a trusting one. */
  const withoutEvidence = rows.filter(
    (row) => row.status === "VERIFIED" && row.sheetMatch?.compared !== true
  ).length;

  /* The other thing the back-fill would otherwise swallow: a return a desk
     accepted that breaks arithmetic. It is rare and it is the most serious
     finding this product can produce, so it is counted here as well as on the
     integrity screen rather than being left to a funnel that has just drawn it
     as complete. */
  const verifiedImpossible = placed.filter(
    (item) => item.row.status === "VERIFIED" && item.at.impossible
  ).length;

  const received = rows.length;
  const verified = rows.filter((row) => row.status === "VERIFIED").length;

  /* ── THE SAME LADDER, BY THE TWO CUTS THAT CHANGE A DECISION ───────────
     By state, because that is who gets rung. By channel, because a channel
     stalling and a region stalling look identical on a map and are fixed by
     completely different people — see the note on channels in lib/pulse.js. */
  const byState = rollup(placed, (item) => {
    const state = stateOf(item.row.unitCode);
    return state ? { id: state.code, label: state.name } : null;
  });

  const byChannel = rollup(placed, (item) => {
    const id = channelOf(item.row.source);
    return { id, label: CHANNELS[id].label };
  });

  return {
    at: new Date(now),
    stages,
    stuck,
    byState,
    byChannel,
    withoutEvidence,
    verifiedImpossible,
    unitsRegistered,
    kpis: {
      expected,
      received,
      /* Processed: past the point where a machine or a rule has had its say.
         The figure a processing lead is measured on, and not the same as
         verified. */
      processed: placed.filter((item) => item.at.cleared.validated).length,
      verified,
      rejected: disputed,
      pending: Math.max(0, received - verified),
      complete: expected ? (verified / expected) * 100 : 0,
      wait: { counted: waits.length, p50: percentile(waits, 50), p90: percentile(waits, 90) },
    },
  };
}

/** The ladder within each group of a cut, biggest backlog first. */
function rollup(placed, keyOf) {
  const groups = new Map();

  for (const item of placed) {
    const key = keyOf(item);
    if (!key) continue;
    if (!groups.has(key.id)) {
      groups.set(key.id, {
        ...key,
        received: 0,
        validated: 0,
        verified: 0,
        stuck: 0,
      });
    }
    const entry = groups.get(key.id);
    entry.received += 1;
    if (item.at.cleared.validated) entry.validated += 1;
    if (item.at.cleared.verified) entry.verified += 1;
    else entry.stuck += 1;
  }

  return [...groups.values()].sort((a, b) => b.stuck - a.stuck || b.received - a.received);
}
