import { auditSheet } from "./results.js";
import { STATES } from "./units.js";

/**
 * The night's vital signs.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS ARITHMETIC IN A LIBRARY AND NOT A QUERY IN A SCREEN
 *
 *  Everything below is computed from rows the room already fetches: the
 *  returns, the coordinator watch, the reports from the field. Not one figure
 *  here needs a query of its own, and that is deliberate — the overview is the
 *  screen most likely to end up on a wall refreshing every fifteen seconds,
 *  and a wall that costs six extra round trips a minute is a wall that falls
 *  over at the exact hour it matters.
 *
 *  It is a pure function for the older reason: a room lead reads these numbers
 *  out loud to people who then ring somebody. A figure like that has to be
 *  checkable by a test rather than by staring at a dashboard.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE ONE RULE EVERY DENOMINATOR HERE OBEYS ──────────────────────────────
 * A coverage figure is a fraction, and the fraction is a lie unless the screen
 * says what the bottom of it is. There are two honest denominators on an
 * election night and they answer different questions:
 *
 *   ASSIGNED   booths we have somebody at. "Are our own people reporting?"
 *   REGISTERED booths in the project's registry. "How much of the ground is
 *              this count actually speaking for?"
 *
 * Both are carried, both are named on screen, and neither is ever quietly
 * substituted for the other. The first is usually a far kinder number, which
 * is exactly why it must never appear without its label.
 */

/* How wide "just now" is. Fifteen minutes because that is roughly the span a
   room lead can hold in their head, and because a shorter window on a night
   where booths file in bursts reads as a dead product between bursts. */
export const MOVEMENT_MINUTES = 15;

/* The width of one bar on the arrivals chart. */
const BUCKET_MINUTES = 15;
const BUCKETS = 16; // four hours of them

const MIN = 60 * 1000;

/** Every channel a return can arrive by, in the words the screen uses. */
export const CHANNELS = {
  APP: { label: "Filed at the booth", why: "The agent's own device, with a position on it." },
  WHATSAPP: { label: "WhatsApp", why: "Sent to the bot by an agent with no app and little data." },
  UPLOAD: { label: "Typed at a desk", why: "Entered here from a sheet, a call or a photograph." },
  UNKNOWN: { label: "Channel not recorded", why: "Filed before the column existed." },
};

const channelOf = (source) => (CHANNELS[source] ? source : source === "DESK" ? "UPLOAD" : "UNKNOWN");

/**
 * The state a unit code belongs to, by the two digits it opens with.
 *
 * Off lib/units.js rather than from a table of its own. The ordering of the 37
 * is the one fact in this product that must exist in exactly one place: a
 * second copy one row out files every return from Kaduna against Jigawa, and
 * nothing objects, because 19/… is a perfectly good code.
 */
const STATE_BY_NUMBER = new Map(STATES.map((state) => [state.number, state]));

function stateOf(unitCode) {
  const digits = String(unitCode ?? "").replace(/[^0-9]/g, "").slice(0, 2);
  return STATE_BY_NUMBER.get(digits) ?? null;
}

/** Minutes between two moments, or null where either is missing. */
function minutesBetween(from, to) {
  if (!from || !to) return null;
  return (new Date(to).getTime() - new Date(from).getTime()) / MIN;
}

/** The value at a percentile of a sorted list. Null on an empty one. */
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

/**
 * Assemble the pulse.
 *
 * `rows` are counted returns (lib/db.js results.counted), `watchList` is the
 * coordinator watch (lib/watch.js), `incidents` the field reports the room is
 * already holding, `unitsRegistered` the size of the project's registry.
 *
 * `now` is an argument rather than a call to Date.now so a test can pin it,
 * and so every figure on one render is measured from one instant — a pulse
 * whose windows each read their own clock reports movement that did not
 * happen.
 */
export function nightPulse({
  rows = [],
  watchList = [],
  incidents = [],
  unitsRegistered = 0,
  now = Date.now(),
} = {}) {
  const filed = rows.length;
  const verified = rows.filter((row) => row.status === "VERIFIED").length;
  const awaiting = filed - verified;

  /* ── THE FUNNEL ────────────────────────────────────────────────────────
     Four stages, each a subset of the one above it, so a drop between two of
     them is a real drop and not two differently-sourced numbers disagreeing.
     Everything here is measured against the roster, never against the
     registry: a funnel whose first stage is 176,846 booths is a funnel that
     reports 99% loss on a deployment doing exactly what it planned to. */
  const assigned = watchList.length;
  const signedIn = watchList.filter((row) => row.lastSeen).length;
  const reported = watchList.filter((row) => row.filed).length;

  const funnel = [
    {
      id: "assigned",
      label: "Assigned a booth",
      count: assigned,
      why: "Coordinators and agents holding a polling unit inside this ground.",
    },
    {
      id: "signed",
      label: "Signed in",
      count: signedIn,
      why: "Have opened their account at least once. Not proof they are at the booth.",
    },
    {
      id: "reported",
      label: "Filed a return",
      count: reported,
      why: "A result for this contest has arrived from their booth.",
    },
    {
      id: "verified",
      label: "Verified",
      count: verified,
      why: "A desk has checked the figures against the sheet and accepted them.",
    },
  ];

  /* ── HOW IT ARRIVED ────────────────────────────────────────────────────
     Worth watching by itself: a channel that goes quiet while the others keep
     filing is a broken channel, not a quiet region, and the two look identical
     on a coverage map. */
  const channels = Object.keys(CHANNELS)
    .map((id) => ({
      id,
      label: CHANNELS[id].label,
      why: CHANNELS[id].why,
      count: rows.filter((row) => channelOf(row.source) === id).length,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  /* ── WHEN IT ARRIVED ───────────────────────────────────────────────────
     Buckets ending now, oldest first, so the chart reads left to right the way
     a clock does. Empty buckets are kept: a gap in reporting is the signal, and
     dropping empty bars would draw a smooth line over the hour nothing came in. */
  const edge = Math.floor(now / (BUCKET_MINUTES * MIN)) * BUCKET_MINUTES * MIN;
  const arrivals = Array.from({ length: BUCKETS }, (_, index) => {
    const start = edge - (BUCKETS - 1 - index) * BUCKET_MINUTES * MIN;
    const end = start + BUCKET_MINUTES * MIN;
    return {
      at: new Date(start),
      count: rows.filter((row) => {
        const t = row.submittedAt ? new Date(row.submittedAt).getTime() : null;
        return t !== null && t >= start && t < end;
      }).length,
    };
  });

  /* ── WHAT CHANGED IN THE LAST QUARTER HOUR ─────────────────────────────
     The panel a room lead looks at after being away from the screen. */
  const since = now - MOVEMENT_MINUTES * MIN;
  const recentRows = rows.filter(
    (row) => row.submittedAt && new Date(row.submittedAt).getTime() >= since
  );
  const movement = {
    minutes: MOVEMENT_MINUTES,
    filed: recentRows.length,
    verified: rows.filter(
      (row) => row.verifiedAt && new Date(row.verifiedAt).getTime() >= since
    ).length,
    incidents: incidents.filter(
      (row) => row.createdAt && new Date(row.createdAt).getTime() >= since
    ).length,
    states: [...new Set(recentRows.map((row) => stateOf(row.unitCode)?.name).filter(Boolean))],
  };

  /* ── THE CLOCKS ────────────────────────────────────────────────────────
     Two, and they measure different things. `sinceLast` is how long the count
     has been still, which is the figure that tells a room whether it is
     watching a live night or a stalled one. `toVerify` is how long a return
     waits at a desk, which is the one a verification lead can actually act on. */
  const stamps = rows
    .map((row) => (row.submittedAt ? new Date(row.submittedAt).getTime() : null))
    .filter((value) => value !== null)
    .sort((a, b) => a - b);

  const verifyWaits = rows
    .map((row) => minutesBetween(row.submittedAt, row.verifiedAt))
    .filter((value) => value !== null && value >= 0)
    .sort((a, b) => a - b);

  const clocks = {
    first: stamps.length ? new Date(stamps[0]) : null,
    last: stamps.length ? new Date(stamps.at(-1)) : null,
    quietMinutes: stamps.length ? (now - stamps.at(-1)) / MIN : null,
    verify: {
      counted: verifyWaits.length,
      p50: percentile(verifyWaits, 50),
      p90: percentile(verifyWaits, 90),
    },
  };

  /* ── SILENCE ───────────────────────────────────────────────────────────
     Somebody is at these booths and nothing has come from them. Ranked by how
     long they have been quiet, because a coordinator who signed in this
     morning and then stopped is a different problem from one who never
     appeared at all — and the second is a deployment failure, the first may be
     somebody in trouble. Both belong on this list; the order tells them apart. */
  const silence = watchList
    .filter((row) => !row.filed)
    .map((row) => ({
      id: row.id,
      name: row.name,
      unitCode: row.scope ?? row.unitCode ?? null,
      state: stateOf(row.scope ?? row.unitCode)?.name ?? null,
      lastSeen: row.lastSeen ?? null,
      /* Never signed in at all sorts to the top of its own group rather than
         being given a fake age. */
      quietMinutes: row.lastSeen ? (now - new Date(row.lastSeen).getTime()) / MIN : null,
    }))
    .sort((a, b) => {
      if (a.quietMinutes === null && b.quietMinutes === null) return 0;
      if (a.quietMinutes === null) return -1;
      if (b.quietMinutes === null) return 1;
      return b.quietMinutes - a.quietMinutes;
    });

  /* ── WHERE THE FIXES CAME FROM ─────────────────────────────────────────
     Straight off the watch, which already banded them. Repeated here so the
     overview does not have to reach into the map's data to say whether the
     returns arrived from the booths they claim to be from. */
  const bands = ["matched", "near", "far", "unmatched", "unknown"];
  const positions = Object.fromEntries(
    bands.map((band) => [band, watchList.filter((row) => row.band === band).length])
  );

  /* ── THE PAPER'S OWN ARITHMETIC ────────────────────────────────────────
     Only returns that captured the EC8A boxes can be audited this way, so the
     denominator is those, not every return. A screen that divided by all of
     them would report a falling failure rate every time somebody filed without
     photographing the sheet. */
  let sheeted = 0;
  let balances = 0;
  for (const row of rows) {
    const audit = auditSheet(row);
    /* auditSheet withdraws a check it has no figures for, so a row with no
       boxes at all comes back balanced and empty. Only count the ones where
       at least one identity could actually be tested. */
    const testable =
      row.usedBallots != null || row.statedValid != null || row.ballotsIssued != null;
    if (!testable) continue;
    sheeted += 1;
    if (audit.balances) balances += 1;
  }

  /* ── WHAT EACH RETURN ARRIVED CARRYING ─────────────────────────────────
     Not a quality score. A count of returns that brought each kind of
     corroboration with them, because every check further down this product
     depends on one of these having been captured, and a check that silently
     cannot run looks exactly like a check that passed. */
  const capture = {
    total: filed,
    /* A photographed sheet that was actually compared to the typed figures.
       `sheetMatch` has three states and only one of them is corroboration —
       see toResult in lib/db.js. */
    compared: rows.filter((row) => row.sheetMatch?.compared).length,
    photographed: rows.filter((row) => row.sheetMatch).length,
    boxes: rows.filter(
      (row) => row.usedBallots != null || row.statedValid != null || row.ballotsIssued != null
    ).length,
    serial: rows.filter((row) => row.formSerial).length,
    position: rows.filter((row) => row.position ?? row.lat != null).length,
    signatures: rows.filter((row) => row.agents && Object.keys(row.agents).length).length,
  };

  /* ── THE STATES, ROLLED UP ─────────────────────────────────────────────
     Assigned and filed side by side per state, which is the table a room uses
     to decide where to ring. Only states that have one or the other appear:
     listing all 37 on a six-state project is a table of nothing. */
  const byState = new Map();
  const touch = (code, name) => {
    if (!code) return null;
    if (!byState.has(code)) {
      byState.set(code, { code, name, assigned: 0, filed: 0, verified: 0, registered: 0 });
    }
    return byState.get(code);
  };

  for (const row of watchList) {
    const state = stateOf(row.scope ?? row.unitCode);
    const entry = touch(state?.code, state?.name);
    if (entry) entry.assigned += 1;
  }
  for (const row of rows) {
    const state = stateOf(row.unitCode);
    const entry = touch(state?.code ?? row.stateCode, state?.name ?? row.stateCode);
    if (!entry) continue;
    entry.filed += 1;
    entry.registered += row.registered ?? 0;
    if (row.status === "VERIFIED") entry.verified += 1;
  }

  const states = [...byState.values()].sort((a, b) => b.filed - a.filed || b.assigned - a.assigned);

  /* ── THE REPORTS, BY HOW LOUD THEY ARE ─────────────────────────────────
     Counted rather than listed: the stream is a screen of its own, and what an
     overview owes is the shape of it. */
  const severities = {};
  for (const item of incidents) {
    const key = item.severity ?? "UNKNOWN";
    severities[key] = (severities[key] ?? 0) + 1;
  }

  return {
    at: new Date(now),
    filed,
    verified,
    awaiting,
    /* Both denominators, both named. See the note at the head of this file. */
    assigned,
    unitsRegistered,
    funnel,
    channels,
    arrivals,
    movement,
    clocks,
    silence,
    positions,
    capture,
    sheets: { audited: sheeted, balances, fails: sheeted - balances },
    states,
    incidents: { total: incidents.length, bySeverity: severities },
  };
}

/**
 * The returns whose own sheet does not add up, worst first.
 *
 * ── WHY THIS IS SEPARATE FROM THE ANOMALY SCREEN ───────────────────────────
 * lib/anomalies.js asks whether a return can be true against the register and
 * against its neighbours. This asks something narrower and much harder to
 * argue with: whether the piece of paper it was copied off agrees with itself.
 * A sheet where box #3 less box #4 does not equal box #8 is wrong on its own
 * terms, in the presiding officer's own handwriting, and no amount of context
 * makes it right.
 *
 * It is also the finding a desk can act on fastest, because `culprit` usually
 * names the single box that is out — which turns "this sheet does not balance"
 * into "box #8 says 556 and everything else on the page says 557".
 */
export function sheetAudits(rows = [], take = 24) {
  const found = [];

  for (const row of rows) {
    const testable =
      row.usedBallots != null || row.statedValid != null || row.ballotsIssued != null;
    if (!testable) continue;

    const audit = auditSheet(row);
    if (audit.balances) continue;

    found.push({
      unitCode: row.unitCode,
      state: stateOf(row.unitCode)?.name ?? null,
      formSerial: row.formSerial ?? null,
      culprit: audit.culprit,
      findings: audit.findings,
      /* How far out the worst identity is. Sorting on it puts a sheet that is
         out by four thousand above one that is out by one — and one out by one
         is very often a tired hand, which is worth saying but not worth
         waking anybody for. */
      worst: Math.max(...audit.findings.map((finding) => Math.abs(finding.off ?? 0)), 0),
    });
  }

  return found.sort((a, b) => b.worst - a.worst).slice(0, take);
}

/* ══════════════════════════════════════════════════════════════════════════
   A DURATION, IN THE TWO LENGTHS THE ROOM READS IT AT

   These lived in components/dash/RoomPulse.jsx, which was the command centre.
   That screen is gone, and two other components were importing its helpers —
   so a screen that had been deleted was still being imported for the only two
   functions in it that were never about that screen at all.

   They belong here. A duration in words is a property of the pulse, not of
   any one panel that draws it, and putting them beside the thing that
   produces the minutes means the next screen that needs them does not have to
   know which component happened to define them first.
   ══════════════════════════════════════════════════════════════════════════ */

/** A duration in full words, for a sentence: "under a minute", "3 hours". */
export function quiet(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `${Math.round(minutes)} minute${Math.round(minutes) === 1 ? "" : "s"}`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)} hours`;
  return `${Math.round(hours / 24)} days`;
}

/** The same duration at tile size: two characters and a unit. */
export function clockLabel(minutes) {
  if (minutes === null || minutes === undefined) return "—";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${Math.round(hours / 24)}d`;
}
