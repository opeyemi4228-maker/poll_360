/**
 * The warning system.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT REQUIRES ATTENTION RIGHT NOW
 *
 *  Everything else in this room answers a question somebody asked. This
 *  answers the one nobody asked, because they were looking at a different
 *  screen: the room lead has eleven surfaces and two eyes, and the thing that
 *  is on fire is reliably on the surface they are not looking at.
 *
 *  So every rule here reads figures the room already computed and turns them
 *  into one sentence with a number in it — "47 booths in Kano have not
 *  reported" — ranked, with a door to the screen that shows the detail.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── EVERY ALERT NAMES A NUMBER AND A PLACE, OR IT IS NOT AN ALERT ──────────
 * "Reporting is low" is not an alert. It cannot be acted on, it cannot be
 * closed, and after the second one nobody reads the panel again. A rule that
 * cannot say how many and where does not belong in this file.
 *
 * ── AND NOTHING HERE ACCUSES ANYBODY ───────────────────────────────────────
 * The integrity rules say a return cannot be arithmetically true. They never
 * say it was falsified. That distinction is the product's whole credibility
 * and it survives only if it is kept in the wording as well as in the logic —
 * see the head of lib/anomalies.js.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * The five levels, loudest first.
 *
 * `rank` orders them. `tone` is the room's status vocabulary, not a fresh set
 * of colours — amber and red mean "somebody has to look at this" everywhere in
 * this product and they mean it here too.
 */
export const LEVELS = {
  CRITICAL: { rank: 5, label: "Critical", tone: "alert", why: "Somebody has to act on this now." },
  SERIOUS: { rank: 4, label: "Serious", tone: "serious", why: "It will cost the night if it is left." },
  WARNING: { rank: 3, label: "Warning", tone: "warn", why: "Worth a call in the next few minutes." },
  INFO: { rank: 2, label: "Information", tone: "muted", why: "Worth knowing. Nothing to do yet." },
  NORMAL: { rank: 1, label: "Normal", tone: "good", why: "Nothing is above the line." },
};

/** Loudest first. The one ordering every screen that draws these must use. */
export const LEVEL_ORDER = ["CRITICAL", "SERIOUS", "WARNING", "INFO", "NORMAL"];

/**
 * Where each line is drawn.
 *
 * Exported and named rather than buried as literals, for two reasons: a room
 * that cannot see the threshold cannot argue with the alert, and a threshold
 * a test cannot pin is a threshold that drifts.
 */
export const THRESHOLDS = {
  /* A count is "stalled" once nothing has arrived for this long. Thirty
     minutes because booths file in bursts and a shorter line cries wolf
     between them. */
  stallMinutes: 30,
  /* A coordinator who has not been seen for this long is a coordinator
     somebody rings. An hour is the spec's own figure. */
  quietMinutes: 60,
  /* Booths assigned in one state with nothing filed. Below this it is the
     ordinary shape of an evening; above it, it is a region. */
  silentPerState: 10,
  /* Returns waiting at a desk before the queue itself is the problem. */
  awaitingBacklog: 20,
  /* Reports from one booth before the repetition is worth a look in itself. */
  repeatReports: 3,
  /* How long a return may sit on one rung of the pipeline before it is stuck
     rather than in progress. */
  stuckMinutes: 90,
};

/**
 * Raise everything that is above the line.
 *
 * Every argument is something the room already holds: the pulse (lib/pulse.js),
 * the integrity screening (lib/anomalies.js), the pipeline (lib/operations.js)
 * and the field reports. Nothing here queries anything, so the panel costs
 * nothing to refresh on a wall.
 */
export function raiseAlerts({
  pulse = null,
  integrity = null,
  operations = null,
  incidents = [],
  now = Date.now(),
} = {}) {
  const raised = [];
  const add = (alert) => raised.push({ ...alert, at: new Date(now) });

  /* ── REPORTS FROM THE FIELD ────────────────────────────────────────────
     First, always. A return that is late costs a bulletin; an agent being
     obstructed costs somebody their evening or worse. */
  const bySeverity = pulse?.incidents?.bySeverity ?? {};
  const critical = bySeverity.CRITICAL ?? 0;
  const serious = bySeverity.SERIOUS ?? 0;

  if (critical > 0) {
    add({
      id: "incidents-critical",
      level: "CRITICAL",
      count: critical,
      headline: `${critical} ${plural(critical, "report")} at the top severity`,
      detail: statesOf(incidents.filter((item) => item.severity === "CRITICAL")),
      act: "Open the report, find who filed it, ring them.",
      goto: "alerts",
    });
  }

  if (serious > 0) {
    add({
      id: "incidents-serious",
      level: "SERIOUS",
      count: serious,
      headline: `${serious} ${plural(serious, "report")} needing attention`,
      detail: statesOf(incidents.filter((item) => item.severity === "SERIOUS")),
      act: "Triage and assign before they age.",
      goto: "alerts",
    });
  }

  /* ── THE SAME BOOTH, OVER AND OVER ─────────────────────────────────────
     Several reports from one polling unit is either a booth in real trouble
     or one person filing the same thing repeatedly, and both are worth a look
     before either is counted as evidence. */
  const perUnit = new Map();
  for (const item of incidents) {
    if (!item.unitCode) continue;
    perUnit.set(item.unitCode, (perUnit.get(item.unitCode) ?? 0) + 1);
  }
  const repeated = [...perUnit.entries()]
    .filter(([, count]) => count >= THRESHOLDS.repeatReports)
    .sort((a, b) => b[1] - a[1]);

  if (repeated.length) {
    add({
      id: "incidents-repeat",
      level: "WARNING",
      count: repeated.length,
      headline: `${repeated.length} ${plural(repeated.length, "booth")} with ${THRESHOLDS.repeatReports} or more reports`,
      detail: repeated.slice(0, 4).map(([unit, count]) => `${unit} ×${count}`).join(" · "),
      act: "Check whether it is one situation or one sender.",
      goto: "alerts",
    });
  }

  /* ── FIGURES THAT CANNOT BE TRUE ───────────────────────────────────────*/
  if (integrity?.impossible > 0) {
    add({
      id: "integrity-impossible",
      level: "CRITICAL",
      count: integrity.impossible,
      headline: `${integrity.impossible} ${plural(integrity.impossible, "return")} that cannot be arithmetically true`,
      detail: `Of ${integrity.screened} screened. ${integrity.flagged} flagged in total.`,
      act: "Pull the sheet before any of it reaches a bulletin.",
      goto: "integrity",
    });
  }

  if (pulse?.sheets?.fails > 0) {
    add({
      id: "sheets-unbalanced",
      level: "SERIOUS",
      count: pulse.sheets.fails,
      headline: `${pulse.sheets.fails} result ${plural(pulse.sheets.fails, "sheet")} that do not add up`,
      detail: `Of ${pulse.sheets.audited} where the boxes were captured.`,
      act: "The sheet disagrees with itself in the officer's own hand.",
      goto: "integrity",
    });
  }

  /* ── THE COUNT ITSELF ──────────────────────────────────────────────────*/
  const quiet = pulse?.clocks?.quietMinutes;

  if (quiet !== null && quiet !== undefined && quiet >= THRESHOLDS.stallMinutes) {
    add({
      id: "count-stalled",
      level: quiet >= THRESHOLDS.stallMinutes * 2 ? "SERIOUS" : "WARNING",
      count: Math.round(quiet),
      unit: "minutes",
      headline: `Nothing has arrived for ${Math.round(quiet)} minutes`,
      detail: `${pulse.filed} returns in from ${pulse.assigned} booths assigned.`,
      act: "A quiet channel and a quiet region look the same. Check both.",
      goto: "operations",
    });
  }

  /* Whole states with people deployed and nothing coming back. The spec's
     own example, and the alert most likely to save a night. */
  for (const state of pulse?.states ?? []) {
    const missing = state.assigned - state.filed;
    if (missing < THRESHOLDS.silentPerState) continue;
    add({
      id: `silent-${state.code}`,
      level: missing >= THRESHOLDS.silentPerState * 4 ? "SERIOUS" : "WARNING",
      count: missing,
      headline: `${missing} booths in ${state.name} have not reported`,
      detail: `${state.filed} of ${state.assigned} assigned have filed.`,
      act: "Ring the state coordinator before the collation centre closes.",
      goto: "coverage",
    });
  }

  /* ── THE PEOPLE ────────────────────────────────────────────────────────*/
  const stale = (pulse?.silence ?? []).filter(
    (row) => row.quietMinutes !== null && row.quietMinutes >= THRESHOLDS.quietMinutes
  ).length;
  const never = (pulse?.silence ?? []).filter((row) => row.quietMinutes === null).length;

  if (stale > 0) {
    add({
      id: "coordinators-stale",
      level: "WARNING",
      count: stale,
      headline: `${stale} ${plural(stale, "coordinator")} not seen for ${THRESHOLDS.quietMinutes} minutes`,
      detail: "Signed in earlier and nothing since.",
      act: "Somebody who stopped is a different problem from somebody who never started.",
      goto: "watch",
    });
  }

  if (never > 0) {
    add({
      id: "coordinators-absent",
      level: never >= 10 ? "SERIOUS" : "WARNING",
      count: never,
      headline: `${never} assigned ${plural(never, "booth")} with nobody signed in`,
      detail: "Never opened an account today.",
      act: "A deployment failure, not a reporting one. Reassign.",
      goto: "watch",
    });
  }

  /* ── THE DESK ──────────────────────────────────────────────────────────*/
  const awaiting = pulse?.awaiting ?? 0;
  if (awaiting >= THRESHOLDS.awaitingBacklog) {
    add({
      id: "verification-backlog",
      level: awaiting >= THRESHOLDS.awaitingBacklog * 5 ? "SERIOUS" : "WARNING",
      count: awaiting,
      headline: `${awaiting} ${plural(awaiting, "return")} waiting for a check`,
      detail:
        pulse.clocks?.verify?.p50 != null
          ? `Half are checked within ${Math.round(pulse.clocks.verify.p50)} minutes.`
          : "None have been checked yet.",
      act: "Add a verifier or the queue outruns the night.",
      goto: "operations",
    });
  }

  /* Returns aground on one rung of the pipeline for longer than a rung
     should take. Distinct from the backlog above: that is a queue moving too
     slowly, this is returns that have stopped moving at all. */
  const aground = (operations?.stuck ?? []).filter(
    (row) => row.minutes !== null && row.minutes >= THRESHOLDS.stuckMinutes
  );
  if (aground.length) {
    add({
      id: "pipeline-stuck",
      level: "WARNING",
      count: aground.length,
      headline: `${aground.length} ${plural(aground.length, "return")} stuck over ${THRESHOLDS.stuckMinutes} minutes`,
      detail: topReasons(aground),
      act: "Each one names the step it is waiting on.",
      goto: "operations",
    });
  }

  /* ── WHERE THE RETURNS SAY THEY CAME FROM ──────────────────────────────
     A return filed nowhere near the booth it claims is not fraud — a phone
     with no signal at the booth is filed from the road, and that is most of
     these. It is still the check that has to be run. */
  const far = pulse?.positions?.far ?? 0;
  const unmatched = pulse?.positions?.unmatched ?? 0;
  if (far + unmatched > 0) {
    add({
      id: "positions-off",
      level: "INFO",
      count: far + unmatched,
      headline: `${far + unmatched} ${plural(far + unmatched, "return")} filed away from the booth`,
      detail: `${far} far from it, ${unmatched} with no booth to match against.`,
      act: "Usually a signal problem. Worth knowing which.",
      goto: "integrity",
    });
  }

  /* Verified with nothing behind it. Never a fault — see the note in
     lib/operations.js — and always worth the room knowing the size of. */
  if (operations?.withoutEvidence > 0) {
    add({
      id: "evidence-thin",
      level: "INFO",
      count: operations.withoutEvidence,
      headline: `${operations.withoutEvidence} verified with no sheet compared`,
      detail: "Accepted by a desk without a photograph held against the figures.",
      act: "Fine on the night. Not fine in a tribunal.",
      goto: "integrity",
    });
  }

  /* ── NOTHING IS WRONG, SAID OUT LOUD ───────────────────────────────────
     An empty panel is ambiguous: it reads as "all clear" and as "this is
     broken" equally well, and at two in the morning people assume the second.
     So the quiet case is a row like any other. */
  if (!raised.length) {
    add({
      id: "normal",
      level: "NORMAL",
      count: 0,
      headline: "Nothing is above the line",
      detail: pulse?.filed
        ? `${pulse.filed} returns in, ${pulse.verified} verified.`
        : "No returns have arrived yet.",
      act: null,
      goto: null,
    });
  }

  const sorted = raised.sort(
    (a, b) => LEVELS[b.level].rank - LEVELS[a.level].rank || b.count - a.count
  );

  const counts = Object.fromEntries(
    Object.keys(LEVELS).map((level) => [level, sorted.filter((row) => row.level === level).length])
  );

  /* ── WHERE THE ROOM SITS AGAINST EACH LINE, AS A READING ───────────────
     The thresholds used to be printed as a list of sentences. A list of
     sentences is not something anybody reads twice, and it answers the wrong
     question anyway: a room does not want to know that the stall line is at
     thirty minutes, it wants to know how close to it the night currently is.
     A reading is a figure and a limit, which a screen can draw as a bullet
     and a reader can take in without reading anything. */
  const dials = [
    {
      id: "stall",
      label: "Since the last return",
      value: quiet ?? 0,
      limit: THRESHOLDS.stallMinutes,
      unit: "min",
      why: "A count that has stopped.",
    },
    {
      id: "backlog",
      label: "Waiting for a check",
      value: awaiting,
      limit: THRESHOLDS.awaitingBacklog,
      unit: "",
      why: "A queue rather than a lull.",
    },
    {
      id: "quiet",
      label: "Coordinators unseen an hour",
      value: stale,
      limit: 1,
      unit: "",
      why: "Signed in earlier, nothing since.",
    },
    {
      id: "absent",
      label: "Booths with nobody signed in",
      value: never,
      limit: 1,
      unit: "",
      why: "A deployment failure, not a reporting one.",
    },
    {
      id: "impossible",
      label: "Returns that cannot be true",
      value: integrity?.impossible ?? 0,
      limit: 1,
      unit: "",
      why: "Arithmetic, not an accusation.",
    },
    {
      id: "stuck",
      label: `Stuck over ${THRESHOLDS.stuckMinutes} minutes`,
      value: aground.length,
      limit: 1,
      unit: "",
      why: "Stopped moving, not moving slowly.",
    },
  ].map((dial) => ({
    ...dial,
    /* How far past the line it is, capped for drawing. A bullet whose bar is
       forty times its marker is a bullet with no marker on it. */
    over: dial.value >= dial.limit,
    share: dial.limit ? Math.min(200, (dial.value / dial.limit) * 100) : 0,
  }));

  return {
    at: new Date(now),
    alerts: sorted,
    dials,
    /* The one word the room is in. Read by the header, so it must never be
       computed a second way anywhere else. */
    level: sorted[0]?.level ?? "NORMAL",
    counts,
  };
}

/** The places a set of reports came from, as a line. */
function statesOf(rows) {
  const names = [...new Set(rows.map((row) => row.stateCode).filter(Boolean))];
  if (!names.length) return "No location recorded.";
  return names.slice(0, 5).join(" · ") + (names.length > 5 ? ` +${names.length - 5}` : "");
}

/** What the stuck returns are stuck on, commonest first. */
function topReasons(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.because, (counts.get(row.because) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${reason} (${count})`)
    .join(" · ");
}

const plural = (count, word) => (count === 1 ? word : `${word}s`);
