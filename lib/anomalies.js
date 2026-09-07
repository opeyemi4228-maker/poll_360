/**
 * Integrity screening.
 *
 * ── WHY THIS IS THE PRODUCT, NOT A FEATURE ─────────────────────────────────
 * Anybody can show an election result. What a parallel count is *for* is
 * catching the returns that cannot be true, and doing it in the hour they
 * arrive, not in a tribunal eighteen months later when the government has been
 * seated.
 *
 * Every rule below is arithmetic or well-established statistics, never
 * opinion. None of them says "this is fraud". They say "this cannot be right,
 * or is very unlikely to be, and here is exactly why", and then a human
 * decides. A system that accused people automatically would be worse than
 * useless, because the first false accusation would discredit every true one.
 *
 * ── THE FOUR CLASSES ───────────────────────────────────────────────────────
 *   IMPOSSIBLE  breaks arithmetic. There is no innocent explanation.
 *   IMPLAUSIBLE possible on paper, vanishingly rare in reality.
 *   OUTLIER     legal and unusual for where it is. Context, not accusation.
 *   PATTERN     the shape of the digits is wrong across many returns.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const SEVERITY = {
  IMPOSSIBLE: { rank: 3, label: "Impossible", tone: "alert" },
  IMPLAUSIBLE: { rank: 2, label: "Implausible", tone: "warn" },
  OUTLIER: { rank: 1, label: "Outlier", tone: "warn" },
  PATTERN: { rank: 1, label: "Pattern", tone: "neutral" },
};

/**
 * Screen one return.
 *
 * `row` needs: unitCode, registered, accredited, rejected, votes {PARTY: n}.
 */
export function screenReturn(row) {
  const found = [];
  const votes = Object.values(row.votes ?? {});
  const cast = votes.reduce((sum, value) => sum + value, 0);
  const rejected = row.rejected ?? 0;

  /* ---------------------------------------------------------- impossible */

  if (row.accredited > row.registered) {
    found.push({
      severity: "IMPOSSIBLE",
      rule: "accredited-over-register",
      says: `${fmt(row.accredited)} accredited at a booth with ${fmt(row.registered)} registered`,
      why: "More people were accredited than exist on the register for this unit.",
    });
  }

  if (cast + rejected > row.accredited) {
    found.push({
      severity: "IMPOSSIBLE",
      rule: "ballots-over-accredited",
      says: `${fmt(cast + rejected)} ballots from ${fmt(row.accredited)} accredited voters`,
      why: "More ballots came out of the box than people were accredited to put in.",
    });
  }

  if (votes.some((value) => value < 0) || row.accredited < 0 || row.registered < 0) {
    found.push({
      severity: "IMPOSSIBLE",
      rule: "negative",
      says: "A negative figure",
      why: "A negative vote also hides a real one by cancelling it out.",
    });
  }

  /* --------------------------------------------------------- implausible */

  const turnout = row.registered ? (row.accredited / row.registered) * 100 : 0;

  if (turnout > 95 && row.registered > 100) {
    found.push({
      severity: "IMPLAUSIBLE",
      rule: "turnout-near-total",
      says: `${turnout.toFixed(1)}% of the register accredited`,
      why: "Turnout this close to the whole register is almost never observed at booth level; nationally it has never approached it.",
    });
  }

  if (cast > 0 && votes.some((value) => value === cast) && cast > 50) {
    found.push({
      severity: "IMPLAUSIBLE",
      rule: "unanimous",
      says: `All ${fmt(cast)} votes to one party`,
      why: "A booth where nobody at all voted differently is rare enough to be worth a look at the sheet.",
    });
  }

  if (row.registered > 0 && cast === 0 && row.accredited > 0) {
    found.push({
      severity: "IMPLAUSIBLE",
      rule: "accredited-no-votes",
      says: `${fmt(row.accredited)} accredited and no votes recorded`,
      why: "People were accredited but nothing was counted. Usually a filing error; occasionally not.",
    });
  }

  return found.map((item) => ({ ...item, unitCode: row.unitCode, id: `${row.unitCode}:${item.rule}` }));
}

/**
 * Screen a whole set, adding the checks that only exist across returns.
 */
export function screenAll(rows) {
  const found = rows.flatMap(screenReturn);

  /* -------------------------------------------------------------- outlier
     A booth wildly out of step with its own neighbours. Compared within the
     state rather than nationally, because Nigerian turnout varies enormously
     by region and a national yardstick would flag whole states at once. */
  const byState = new Map();
  for (const row of rows) {
    const key = String(row.unitCode ?? "").slice(0, 2);
    if (!byState.has(key)) byState.set(key, []);
    byState.get(key).push(row);
  }

  for (const [, group] of byState) {
    if (group.length < 5) continue; // too few to have a normal to be outside of

    const turnouts = group.map((row) => (row.registered ? row.accredited / row.registered : 0));
    const mean = turnouts.reduce((a, b) => a + b, 0) / turnouts.length;
    const sd = Math.sqrt(
      turnouts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / turnouts.length
    );

    if (sd < 0.01) continue; // no spread; nothing can be an outlier

    group.forEach((row, index) => {
      const z = (turnouts[index] - mean) / sd;
      if (Math.abs(z) > 3) {
        found.push({
          severity: "OUTLIER",
          rule: "turnout-outlier",
          unitCode: row.unitCode,
          id: `${row.unitCode}:turnout-outlier`,
          says: `Turnout ${(turnouts[index] * 100).toFixed(1)}% against ${(mean * 100).toFixed(1)}% nearby`,
          why: `More than three standard deviations from the other ${group.length - 1} booths reporting in this state.`,
        });
      }
    });
  }

  /* -------------------------------------------------------------- pattern
     Last-digit uniformity. Genuine counts spread their final digit roughly
     evenly; figures that were written rather than counted cluster on round
     numbers. Needs volume to mean anything, so it only runs past 30 returns
     and reports once for the batch rather than accusing any single booth. */
  if (rows.length >= 30) {
    const digits = new Array(10).fill(0);
    let counted = 0;
    for (const row of rows) {
      for (const value of Object.values(row.votes ?? {})) {
        if (value >= 10) {
          digits[value % 10] += 1;
          counted += 1;
        }
      }
    }

    if (counted >= 100) {
      const expected = counted / 10;
      const chi = digits.reduce((sum, observed) => sum + (observed - expected) ** 2 / expected, 0);
      /* 9 degrees of freedom, p < 0.001 */
      if (chi > 27.88) {
        const worst = digits.indexOf(Math.max(...digits));
        found.push({
          severity: "PATTERN",
          rule: "last-digit",
          unitCode: `${rows.length} returns`,
          id: "batch:last-digit",
          says: `Final digits cluster on ${worst} across ${counted} figures`,
          why: "In counted totals the last digit is near-uniform. A strong skew suggests figures were composed rather than tallied. It is a signal to audit, never a finding on its own.",
        });
      }
    }
  }

  return found.sort((a, b) => SEVERITY[b.severity].rank - SEVERITY[a.severity].rank);
}

/**
 * A single figure for the top of a dashboard.
 *
 * Deliberately not a "trust score out of 100": a number like that invites
 * somebody to quote it on air as though it measured honesty, and it does not.
 * This counts returns that failed a check, and says so in those words.
 */
/* ══════════════════════════════════════════════════════════════════════════
   THE FOUR ANSWERS A VERIFICATION DESK ACTUALLY NEEDS

   Screening produces findings, and a list of findings is not a job. The desk's
   real question is narrower and never asked in the data until now:

     of the returns this product has questioned, which ones can I do
     something about right now?

   The answer turns on two facts that were computed in two different places
   and never put together — whether the arithmetic failed, and whether the
   result sheet actually arrived:

     · A return that fails its own arithmetic AND came with a photograph of
       the EC8A is a five-minute job. Open the picture, read the boxes, decide.
     · The identical failure with no photograph cannot be checked by anybody
       at a desk at all. It is a telephone call to whoever filed it.

   Those are the same finding and opposite instructions, and until this
   function they looked identical on every screen in the product. So the
   triage is computed once, here, beside the screening it depends on.

   ── AND WHY "IMPOSSIBLE" OUTRANKS BOTH ────────────────────────────────────
   A return that breaks arithmetic is held out of a bulletin whether or not
   its sheet arrived. Evidence changes how quickly it can be resolved; it does
   not change whether the figure may be published in the meantime. So HOLD is
   decided by severity alone, and evidence only sorts what is left.
   ══════════════════════════════════════════════════════════════════════════ */
export const ACTIONS = {
  HOLD: {
    id: "HOLD",
    label: "Hold back",
    verb: "Keep out of any bulletin",
    why: "The arithmetic cannot be true. Publishing it is publishing a figure we already know is wrong.",
    tone: "alert",
  },
  CHECK: {
    id: "CHECK",
    label: "Check the sheet",
    verb: "Somebody at a desk can settle this",
    why: "Questioned, and the result sheet is here. Open the photograph, read the boxes, decide.",
    tone: "warn",
  },
  CHASE: {
    id: "CHASE",
    label: "Chase the sheet",
    verb: "Ring whoever filed it",
    why: "Questioned, and nothing arrived to check it against. Nobody at a desk can resolve this one.",
    tone: "warn",
  },
  CLEAR: {
    id: "CLEAR",
    label: "Passed",
    verb: "Nothing to do",
    why: "Screened against every rule and questioned by none of them.",
    tone: "good",
  },
};

/** The order a desk works them in. Worst and most blocking first. */
export const ACTION_ORDER = ["HOLD", "CHECK", "CHASE", "CLEAR"];

/** Whether anything arrived that a person could actually check the figures against. */
function hasEvidence(row) {
  if (!row) return false;
  /* A photograph of the sheet, or the boxes read off it. Either is enough for
     somebody at a desk to do the job; neither is a claim that the return is
     correct, only that it can be examined. */
  return Boolean(row.sheetMatch) || row.usedBallots != null || row.statedValid != null || row.ballotsIssued != null;
}

export function integrityOf(rows) {
  const flags = screenAll(rows);
  const impossible = flags.filter((flag) => flag.severity === "IMPOSSIBLE").length;
  const flagged = new Set(flags.map((flag) => flag.unitCode)).size;

  /* ── WHAT TO DO WITH EACH QUESTIONED RETURN ──────────────────────────
     Grouped by booth rather than by finding: a booth with three findings is
     one job, not three, and a desk that works a list of findings does the
     same booth three times. */
  const byUnit = new Map();
  for (const flag of flags) {
    const held = byUnit.get(flag.unitCode) ?? { unitCode: flag.unitCode, findings: [], worst: null };
    held.findings.push(flag);
    if (!held.worst || SEVERITY[flag.severity].rank > SEVERITY[held.worst].rank) {
      held.worst = flag.severity;
    }
    byUnit.set(flag.unitCode, held);
  }

  const rowOf = new Map(rows.map((row) => [row.unitCode, row]));

  const work = [...byUnit.values()].map((unit) => {
    const evidence = hasEvidence(rowOf.get(unit.unitCode));
    return {
      ...unit,
      evidence,
      action: unit.worst === "IMPOSSIBLE" ? "HOLD" : evidence ? "CHECK" : "CHASE",
    };
  });

  const counts = Object.fromEntries(ACTION_ORDER.map((id) => [id, 0]));
  for (const unit of work) counts[unit.action] += 1;
  counts.CLEAR = Math.max(0, rows.length - byUnit.size);

  return {
    flags,
    impossible,
    flagged,
    screened: rows.length,
    clean: Math.max(0, rows.length - flagged),
    /* One entry per questioned booth, carrying what to do about it. */
    work: work.sort(
      (a, b) => ACTION_ORDER.indexOf(a.action) - ACTION_ORDER.indexOf(b.action)
    ),
    counts,
  };
}


const fmt = (value) => new Intl.NumberFormat("en-NG").format(value ?? 0);
