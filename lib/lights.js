/**
 * The traffic lights: red, yellow, green, and the grey that is not a light.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A LIGHT IS A COUNT OF OPEN ITEMS, NEVER A SWITCH
 *
 *  Nobody sets a light. A polling unit is red because something red is open
 *  on it, and it stops being red when a person who did not raise that thing
 *  resolves it. So this file holds two tables and four small functions, and
 *  no storage: what can be open on a unit (ITEMS), how an item may be closed
 *  (RESOLUTIONS), what is open on one unit given the facts about it
 *  (`itemsForUnit`), and what colour a count of open items makes (`lightOf`,
 *  `rollUp`). lib/room/store.js keeps the items; this decides what they are.
 *
 *  ── GREY IS SILENCE, AND SILENCE IS NOT ZERO ────────────────────────────
 *  A unit with no result and nothing open is grey, "No returns yet". It is
 *  never green for having nothing wrong with it, because nothing has been
 *  looked at. An area is green only when at least one result is in, every
 *  result in is checked by a second person, and nothing is open. Green says
 *  "cleared", not "complete", which is why every light travels with its
 *  coverage and no screen may print one without it.
 * ══════════════════════════════════════════════════════════════════════════
 */

export const LIGHTS = {
  RED: { rank: 3, label: "RED · Malpractice / critical", short: "Red", icon: "x-circle" },
  YELLOW: { rank: 2, label: "YELLOW · Error / under review", short: "Yellow", icon: "alert-triangle" },
  GREEN: { rank: 1, label: "GREEN · Cleared", short: "Green", icon: "check-circle" },
  GREY: { rank: 0, label: "No returns yet", short: "No returns yet", icon: "circle" },
};

export const LIGHT_ORDER = ["RED", "YELLOW", "GREEN", "GREY"];

/**
 * Everything that can be open on a place.
 *
 * `closes` says how an item ends. "person" needs somebody to resolve it with
 * a reason. "event" closes when the thing it was waiting for happens (a
 * second person checks the result, the SOS is dealt with), and the person who
 * did that is recorded as the one who closed it.
 *
 * `desk` is who owns it first: "verify" lands in the verification queue,
 * "field" on the field operations desk, "observe" with the state's observers.
 *
 * `area` items attach to a ward or above and never to one polling unit. A
 * pattern in the digits of a batch is the case that matters: it is a fact
 * about many results and accuses none of them.
 */
export const ITEMS = {
  R_OVERVOTE: { light: "RED", closes: "person", desk: "verify", title: "More ballots than BVAS accredited" },
  R_ACCRED_OVER_REG: { light: "RED", closes: "person", desk: "verify", title: "BVAS accredited above registered voters" },
  R_IMPOSSIBLE: { light: "RED", closes: "person", desk: "verify", title: "Figures that cannot be true" },
  R_WINNER_MISMATCH: { light: "RED", closes: "person", desk: "verify", title: "Our agent and INEC's sheet name different winners" },
  R_ANNOUNCED_WINNER_MISMATCH: { light: "RED", closes: "person", desk: "observe", area: true, title: "Announced winner differs from the checked count" },
  R_PAPER_FRAUD: { light: "RED", closes: "person", desk: "verify", title: "The sheet itself is wrong" },
  R_SOS: { light: "RED", closes: "event", desk: "field", person: true, title: "SOS from the agent" },
  R_CRITICAL_SITUATION: { light: "RED", closes: "event", desk: "field", person: true, title: "Critical report from the field" },
  R_DISPUTED: { light: "RED", closes: "person", desk: "verify", top: true, title: "Result disputed" },

  Y_FIGURE_DIFF: { light: "YELLOW", closes: "person", desk: "verify", title: "Our figures and INEC's differ, same winner" },
  Y_IMPLAUSIBLE: { light: "YELLOW", closes: "person", desk: "verify", title: "Possible on paper, almost never real" },
  Y_OUTLIER: { light: "YELLOW", closes: "person", desk: "verify", title: "Unusual for this area" },
  Y_PATTERN: { light: "YELLOW", closes: "person", desk: "verify", area: true, title: "The digits across these results look made up" },
  Y_BVAS_MISSING: { light: "YELLOW", closes: "event", desk: "verify", title: "No BVAS accredited figure" },
  Y_BVAS_SOURCE_DIFF: { light: "YELLOW", closes: "person", desk: "verify", title: "Agent's and INEC's BVAS figures differ" },
  Y_BVAS_MANUAL_DIFF: { light: "YELLOW", closes: "person", desk: "verify", title: "BVAS and manual accreditation differ" },
  Y_SIGNATURE_STAMP: { light: "YELLOW", closes: "person", desk: "verify", title: "Signature, stamp or officer's name absent" },
  Y_COULD_NOT_TELL: { light: "YELLOW", closes: "person", desk: "verify", title: "Signature or stamp could not be told from the photograph" },
  Y_UNREADABLE: { light: "YELLOW", closes: "person", desk: "verify", title: "Part of the sheet could not be read" },
  Y_CONFLICTING_SUBMISSION: { light: "YELLOW", closes: "person", desk: "verify", title: "Two assigned agents filed different figures" },
  Y_CORRECTION_REQUEST: { light: "YELLOW", closes: "person", desk: "verify", title: "An agent asked for a correction" },
  Y_AWAITING_CHECK: { light: "YELLOW", closes: "event", desk: "verify", title: "Waiting to be checked by a second person" },
  Y_AWAITING_SECOND_CHECK: { light: "YELLOW", closes: "event", desk: "verify", title: "Corrected, waiting for a different verifier" },
  Y_INEC_MISSING: { light: "YELLOW", closes: "event", desk: "observe", title: "INEC has published no sheet" },
  Y_INEC_LATE: { light: "YELLOW", closes: "person", desk: "observe", title: "INEC's sheet went up late" },
  Y_OVERDUE_RETURN: { light: "YELLOW", closes: "event", desk: "field", field: true, title: "Our agent has not sent the result" },
  Y_SITUATION: { light: "YELLOW", closes: "event", desk: "field", field: true, title: "Report from the field" },
  Y_FIELD_CONFIRM: { light: "YELLOW", closes: "person", desk: "field", field: true, title: "Waiting for the field to confirm" },
};

export const ITEM_CODES = Object.keys(ITEMS);

export const lightOfCode = (code) => ITEMS[code]?.light ?? null;

/** How an item may be closed by a person. */
export const RESOLUTIONS = {
  CLERICAL_ERROR_CORRECTED: { label: "Clerical error, corrected" },
  CONFIRMED_GENUINE_NO_ISSUE: { label: "Checked, genuine, nothing wrong" },
  CONFIRMED_MALPRACTICE_ESCALATED: { label: "Malpractice confirmed, sent to legal", malpractice: true, needsNote: true },
  FIELD_CONFIRMED: { label: "Confirmed by the field" },
  DUPLICATE: { label: "Duplicate of another item" },
  SITUATION_RESOLVED: { label: "Situation dealt with" },
  DISPUTED: { label: "Dispute the result", disputes: true, needsNote: true },
};

export const RESOLUTION_KEYS = Object.keys(RESOLUTIONS);

/** What a super administrator may change per election project. */
export const DEFAULT_SETTINGS = {
  /* Turnout at or above this share of the register is implausible. */
  turnoutPercent: 95,
  /* When our own agent's result is overdue, and when INEC's sheet is. Empty
     means no deadline is set, and nothing is overdue against no deadline. */
  returnDeadline: "",
  inecDeadline: "",
  /* A sheet published this many days after the poll is late. */
  inecLateDays: 2,
  /* A red item nobody owns reaches the Director after this long. */
  unownedRedMinutes: 20,
  /* Nothing is called below this share counted. */
  callFloorPercent: 25,
  /* An agent who has not checked in by this time (HH:MM, Lagos) is a gap. */
  checkInBy: "09:00",
};

export function readSettings(stored) {
  const out = { ...DEFAULT_SETTINGS };
  const given = stored && typeof stored === "object" ? stored : {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (given[key] == null) continue;
    if (typeof DEFAULT_SETTINGS[key] === "number") {
      const value = Number(given[key]);
      if (Number.isFinite(value) && value >= 0) out[key] = value;
    } else {
      out[key] = String(given[key]).trim().slice(0, 40);
    }
  }
  out.turnoutPercent = Math.min(100, Math.max(50, out.turnoutPercent));
  /* The floor can be raised and never lowered: 25% is the product's rule. */
  out.callFloorPercent = Math.min(100, Math.max(25, out.callFloorPercent));
  return out;
}

/* ------------------------------------------------------------ the figures */

const sum = (votes) => Object.values(votes ?? {}).reduce((total, value) => total + (Number(value) || 0), 0);

/** The party in front, or null on a tie or an empty count. A tie names nobody. */
export function winnerOf(votes) {
  const ranked = Object.entries(votes ?? {})
    .map(([party, value]) => [party, Number(value) || 0])
    .sort((a, b) => b[1] - a[1]);
  if (!ranked.length || ranked[0][1] === 0) return null;
  if (ranked[1] && ranked[1][1] === ranked[0][1]) return null;
  return ranked[0][0];
}

const present = (value) => value != null && value !== "" && Number.isFinite(Number(value));

/**
 * What accreditation says about one result.
 *
 * `headroom` is BVAS accredited less every ballot that came out of the box.
 * Negative headroom is over-voting. Null means there is no BVAS figure, which
 * is never read as zero accredited: a check against a figure nobody wrote is
 * withdrawn, not failed.
 */
export function bvasOf(result) {
  if (!result) return { accredited: null, headroom: null, overvote: false, turnout: null };
  const accredited = present(result.accredited) ? Number(result.accredited) : null;
  const cast = sum(result.votes);
  const rejected = Number(result.rejected) || 0;
  const headroom = accredited == null ? null : accredited - (cast + rejected);
  const registered = Number(result.registered) || 0;
  return {
    accredited,
    cast,
    rejected,
    registered,
    headroom,
    overvote: headroom != null && headroom < 0,
    turnout: accredited != null && registered > 0 ? (accredited / registered) * 100 : null,
  };
}

/**
 * Everything open on one polling unit, from the facts about it.
 *
 * Pure: the same facts always give the same items, so the store can call
 * this after any change and reconcile what is open against what should be.
 *
 *   result        the stored result, or null when none has been filed
 *   inec          what INEC's published sheet says: { published, late,
 *                 accredited, votes, faults: [] }, or null when not gathered
 *   certification { signature, stamp, officer }: "present", "absent", "unknown"
 *   findings      lib/anomalies.js findings for this result
 *   incidents     open reports from the field at this unit
 *   pending       { conflicting, correctionRequests, fieldConfirm, unreadable }
 *   overdue       our agent's deadline has passed with nothing filed
 *   inecOverdue   INEC's deadline has passed with no sheet
 */
export function itemsForUnit({
  result = null,
  inec = null,
  certification = null,
  findings = [],
  incidents = [],
  pending = {},
  overdue = false,
  inecOverdue = false,
  settings = DEFAULT_SETTINGS,
} = {}) {
  const found = [];
  const add = (code, says, ref = null) => found.push({ code, says, ref });

  for (const incident of incidents) {
    if (incident.sos) add("R_SOS", "An agent pressed SOS", incident.id);
    else if (isCritical(incident)) add("R_CRITICAL_SITUATION", wordsOf(incident.kind), incident.id);
    else add("Y_SITUATION", wordsOf(incident.kind), incident.id);
  }

  if (!result) {
    if (overdue) add("Y_OVERDUE_RETURN", "Past the deadline with no result");
    return found;
  }

  const bvas = bvasOf(result);

  if (result.status === "DISPUTED") add("R_DISPUTED", "Marked disputed. It has stopped counting");

  if (bvas.accredited == null) {
    add("Y_BVAS_MISSING", "The filing carries no BVAS accredited figure");
  } else {
    if (bvas.overvote) add("R_OVERVOTE", `Over-voted by ${-bvas.headroom}: ${bvas.cast + bvas.rejected} ballots, ${bvas.accredited} accredited`);
    if (bvas.registered > 0 && bvas.accredited > bvas.registered) {
      add("R_ACCRED_OVER_REG", `${bvas.accredited} accredited, ${bvas.registered} registered`);
    }
    if (bvas.turnout != null && bvas.turnout >= settings.turnoutPercent && bvas.accredited <= bvas.registered) {
      add("Y_IMPLAUSIBLE", `${bvas.turnout.toFixed(1)}% of the register accredited`);
    }
    if (present(result.accreditedManual) && Number(result.accreditedManual) !== bvas.accredited) {
      add("Y_BVAS_MANUAL_DIFF", `BVAS ${bvas.accredited}, manual register ${Number(result.accreditedManual)}`);
    }
  }

  /* The screening that already runs on every result. The two arithmetic
     rules above are the same facts under the names this room uses, so they
     are not raised twice; turnout is governed by the room's own threshold. */
  const SAID = new Set(["accredited-over-register", "ballots-over-accredited", "turnout-near-total"]);
  for (const finding of findings) {
    if (SAID.has(finding.rule)) continue;
    if (finding.severity === "IMPOSSIBLE") add("R_IMPOSSIBLE", finding.says, finding.rule);
    else if (finding.severity === "IMPLAUSIBLE") add("Y_IMPLAUSIBLE", finding.says, finding.rule);
    else if (finding.severity === "OUTLIER") add("Y_OUTLIER", finding.says, finding.rule);
    /* PATTERN is deliberately not here. It never attaches to one unit. */
  }

  if (inec?.published) {
    const ours = winnerOf(result.votes);
    const theirs = winnerOf(inec.votes);
    const differs = inec.votes && sameKeysDiffer(result.votes, inec.votes);
    if (ours && theirs && ours !== theirs) add("R_WINNER_MISMATCH", `Our agent has ${ours} in front, INEC's sheet has ${theirs}`);
    else if (differs) add("Y_FIGURE_DIFF", "The figures differ and the winner is the same");

    if (present(inec.accredited) && bvas.accredited != null && Number(inec.accredited) !== bvas.accredited) {
      /* Raised to red when INEC's figure would turn a clean unit into an
         over-voted one, or the other way about: then the difference is not a
         slip of the pen, it decides whether the result can stand. */
      const theirHeadroom = Number(inec.accredited) - (bvas.cast + bvas.rejected);
      const flips = theirHeadroom < 0 !== bvas.overvote;
      if (flips && !bvas.overvote) add("R_OVERVOTE", `Over-voted against INEC's BVAS figure of ${Number(inec.accredited)}`, "inec");
      else add("Y_BVAS_SOURCE_DIFF", `Agent ${bvas.accredited}, INEC ${Number(inec.accredited)}`);
    }
    if (inec.late) add("Y_INEC_LATE", "Published after the deadline");
    for (const fault of inec.faults ?? []) add("R_PAPER_FRAUD", fault.says ?? wordsOf(fault.kind ?? fault), fault.kind ?? String(fault));
  } else if (inec && !inec.published && inecOverdue) {
    add("Y_INEC_MISSING", "INEC lists this unit and has published no sheet");
  }

  if (certification) {
    const marks = [certification.signature, certification.stamp, certification.officer];
    if (marks.includes("absent")) add("Y_SIGNATURE_STAMP", absentWords(certification));
    else if (marks.includes("unknown")) add("Y_COULD_NOT_TELL", "Could not tell from this photograph");
  }

  if (pending.unreadable) add("Y_UNREADABLE", "One or more boxes could not be read");
  if (pending.conflicting) add("Y_CONFLICTING_SUBMISSION", "A second assigned agent filed different figures");
  if (pending.correctionRequests) add("Y_CORRECTION_REQUEST", "An assigned agent asked for the result to be corrected");
  if (pending.fieldConfirm) add("Y_FIELD_CONFIRM", "A verifier asked the field to confirm");

  if (result.status === "CORRECTED") add("Y_AWAITING_SECOND_CHECK", "Corrected. A different verifier must check it");
  else if (result.status === "SUBMITTED") add("Y_AWAITING_CHECK", "Filed. Nobody else has checked it yet");

  return found;
}

/**
 * A report that means a person may be in danger.
 *
 * Read from the urgency the agent's own form already gives each kind of
 * report (lib/agent-day.js): violence, armed people at the unit, a ballot box
 * snatched or destroyed. One list of what is critical, kept where the kinds
 * are, and not a second one here to drift from it.
 */
export function isCritical(incident) {
  return Boolean(incident?.sos) || String(incident?.severity ?? "").toUpperCase() === "CRITICAL";
}

const wordsOf = (value) => {
  const text = String(value ?? "").replace(/[_-]+/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

function absentWords(certification) {
  const missing = [
    certification.signature === "absent" && "signature",
    certification.stamp === "absent" && "stamp",
    certification.officer === "absent" && "officer's name",
  ].filter(Boolean);
  return `No ${missing.join(", no ")} on the sheet`;
}

function sameKeysDiffer(ours = {}, theirs = {}) {
  /* Only the parties both records carry are compared. A party one side never
     read is not a disagreement. */
  return Object.keys(ours).some((party) => party in theirs && Number(ours[party]) !== Number(theirs[party]));
}

/* --------------------------------------------------------------- the light */

/**
 * The light on one polling unit.
 *
 * Red beats yellow beats green, and grey only when there is no result and
 * nothing open. A unit with no result and an open SOS is red.
 */
export function lightOf({ red = 0, yellow = 0, hasResult = false, checked = false } = {}) {
  if (red > 0) return "RED";
  if (yellow > 0) return "YELLOW";
  if (hasResult && checked) return "GREEN";
  /* A result is in and nothing is open against it, yet it is unchecked. That
     cannot normally happen, because an unchecked result carries its own
     yellow item. If it does, yellow is the honest answer: not cleared. */
  if (hasResult) return "YELLOW";
  return "GREY";
}

/**
 * The light on an area, from the counts of the units inside it.
 *
 * `counts` is how many units stand at each light; `areaRed` and `areaYellow`
 * are items open on the area itself. Returns the worst open light.
 */
export function rollUp({ red = 0, yellow = 0, green = 0, grey = 0, areaRed = 0, areaYellow = 0 } = {}) {
  if (red + areaRed > 0) return "RED";
  if (yellow + areaYellow > 0) return "YELLOW";
  if (green > 0) return "GREEN";
  return "GREY";
}

/** "Reported 74.4% of 8,655". Coverage as a figure, never implied by a colour. */
export function coverageOf(reported, total) {
  if (!total) return 0;
  return Math.round((reported / total) * 1000) / 10;
}

/* ------------------------------------------------------------ who may close */

/**
 * May this person resolve this item this way?
 *
 * `holds` answers "does this person hold this capability" and `covers`
 * answers "is this place on their ground", so this file stays free of the
 * roles table and of storage. Returns `{ ok }` or `{ ok: false, why }` in
 * words a person can be shown.
 *
 * The rule that survives every role: nobody resolves an item they raised or
 * an item on a result they filed.
 */
export function mayResolve({ item, resolution, userId, holds, covers }) {
  const kind = ITEMS[item?.code];
  const how = RESOLUTIONS[resolution];
  if (!kind || item.status !== "OPEN") return { ok: false, why: "That item is no longer open." };
  if (!how) return { ok: false, why: "Choose how it was resolved." };
  if (kind.closes === "event") {
    return { ok: false, why: "This one closes itself when the thing it is waiting for happens." };
  }
  if (item.raisedBy && item.raisedBy === userId) {
    return { ok: false, why: "You raised this. Somebody else has to resolve it." };
  }
  if (item.filedBy && item.filedBy === userId) {
    return { ok: false, why: "You filed this result. Somebody else has to resolve it." };
  }
  if (!covers(item.areaCode)) return { ok: false, why: "That place is not on your ground." };

  if (kind.top && !holds("items:close-dispute")) {
    return { ok: false, why: "Only the Director or the Super Admin can close a disputed result." };
  }
  if (how.disputes && !holds("results:dispute")) {
    return { ok: false, why: "You cannot mark a result disputed." };
  }
  if (kind.light === "RED") {
    return holds("items:resolve-red") ? { ok: true } : { ok: false, why: "Red items go to a zone lead, a lead verifier or the Director." };
  }
  if (holds("items:resolve-yellow")) return { ok: true };
  if (kind.field && holds("items:resolve-field")) return { ok: true };
  return { ok: false, why: "You cannot resolve this kind of item." };
}

/** Counts by light, for a badge. */
export function tally(items = []) {
  const out = { red: 0, yellow: 0 };
  for (const item of items) {
    if (lightOfCode(item.code) === "RED") out.red += 1;
    else if (lightOfCode(item.code) === "YELLOW") out.yellow += 1;
  }
  return out;
}
