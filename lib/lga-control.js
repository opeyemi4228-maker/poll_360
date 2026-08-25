/**
 * Who controls each local government council.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS FILE IS MOSTLY EMPTY, AND THAT IS THE POINT.
 *
 *  There are 774 local governments. This file has verified results for a
 *  handful of states, and says nothing at all about the rest. It would have
 *  been trivial to fill every row by copying the governor's party downward,
 *  and the map would have looked complete and been fiction.
 *
 *  It would also have been demonstrably wrong, three times over. Kano has an
 *  APC governor sitting above 44 NNPP councils. Sokoto's councils were swept
 *  by the PDP while its governor is APC. Oyo's were swept by the PDP a year
 *  before its governor left the PDP for the APM. A state and its councils are
 *  elected years apart, by different commissions, and they do not always
 *  agree. Any rule that derives one from the other is a guess wearing the
 *  costume of a dataset.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS DATA IS SO HARD TO GET ────────────────────────────────────────
 * Council elections are not run by INEC. Each state has its own State
 * Independent Electoral Commission, appointed by the governor, and none of
 * the 36 publishes machine-readable results. What exists is press reporting
 * of the aggregate: "the ruling party won all 20 seats". So the unit this
 * file can honestly record is the STATE-WIDE OUTCOME, not the individual
 * council, and it can only colour individual councils when one party took
 * every single seat, because only then is each council's party implied.
 *
 * ── THREE GRADES, AND ONLY ONE OF THEM COLOURS A MAP ───────────────────────
 *   `swept`     One party took every chairmanship. Every council in the state
 *               is that party, and each one can be drawn.
 *   `split`     Seats went more than one way. The totals are known, which
 *               council went which way is not, so NOTHING is drawn.
 *   `contested` The result is under legal challenge or was annulled. Drawn as
 *               disputed, never as a winner.
 *   (absent)    Not verified. Drawn as unknown. Most of the country.
 *
 * ── AND CHAIRMEN DEFECT TOO ────────────────────────────────────────────────
 * Enugu's seventeen chairmen crossed to the APC with the governor in October
 * 2025, having been elected under the PDP. So the same two questions apply
 * here as apply to the governors, and the same two answers are carried:
 * `elected` and `current`. See lib/governors.js.
 *
 * Verify before broadcast. This is a transcription of public reporting, not a
 * feed from any commission's registry.
 */

/**
 * Council control, by state. Only rows that could be dated and sourced.
 *
 * `seats` is what the reporting said. It is checked against the real council
 * count at load, because a source that says 25 for a state with 26 councils
 * is a source that has not been read carefully enough to colour a map with.
 */
export const LG_CONTROL = [
  {
    code: "OND",
    on: "2025-01-18",
    grade: "swept",
    elected: "APC",
    seats: 18,
    note: "Every chairmanship and all 203 councillorship seats.",
    source: "AllAfrica, 20 January 2025.",
  },
  {
    /* ── THE SECOND COUNTER-EXAMPLE, AND THE SHARPEST ────────────────────
       Elected under the PDP in April 2025. In May 2026 the governor left
       the PDP for the APM. Whether the chairmen followed him has not been
       reported either way, so this state's councils are recorded as PDP,
       which is the last thing anybody actually verified, and flagged as
       possibly stale rather than quietly moved to match the governor. */
    code: "OYO",
    on: "2025-04-28",
    grade: "swept",
    elected: "PDP",
    seats: 33,
    stale: "The governor moved to the APM on 2 May 2026. No reporting establishes whether the council chairmen went with him.",
    note: "Every chairmanship, elected under the PDP.",
    source: "Reported April 2025.",
  },
  {
    code: "LAG",
    on: "2025-07-12",
    grade: "swept",
    elected: "APC",
    seats: 20,
    note: "All 20 councils, plus all 37 LCDAs, and 375 of 376 councillorship seats. The LCDAs are not local governments in federal law and are not drawn here.",
    source: "BusinessDay, July 2025.",
  },
  {
    code: "EBO",
    on: "2025-08-22",
    grade: "swept",
    elected: "APC",
    seats: 13,
    note: "Every chairmanship and all 171 councillorship seats.",
    source: "The Whistler, 22 August 2025.",
  },
  {
    /* ── THE ONE THAT PROVES THE RULE ────────────────────────────────────
       Elected under the PDP, then moved as a bloc with the governor. A map
       keyed on the election alone would show Enugu's councils PDP today,
       which is false; one keyed on the governor alone would never have
       shown them PDP at all. Both facts are kept. */
    code: "ENU",
    on: "2025-02-15",
    grade: "swept",
    elected: "PDP",
    current: "APC",
    movedOn: "2025-10-01",
    seats: 17,
    note: "All seventeen chairmen crossed to the APC with the governor in October 2025, having been elected under the PDP.",
    source: "Premium Times, October 2025.",
  },
  {
    /* ── THE SHARPEST CASE IN THE FILE ───────────────────────────────────
       Kano's 44 councils were swept by the NNPP in October 2024. In February
       2026 the governor left the NNPP for the APC. The councils did not: they
       are not up again until 2028, and no reporting says the chairmen moved.

       So Kano today is an APC governor sitting above 44 NNPP councils, and it
       is the single clearest reason this file exists. Deriving council control
       from the governor would repaint all 44 blue on the strength of one man's
       membership card. */
    code: "KAN",
    on: "2024-10-26",
    grade: "swept",
    elected: "NNPP",
    seats: 44,
    stale: "The governor left the NNPP for the APC on 17 February 2026. Nothing reports the council chairmen going with him, and they are not up for election again until 2028.",
    note: "All 44 chairmanships and 484 councillorship seats. Sworn in the next day.",
    source: "Daily Trust and Channels Television, 26–27 October 2024.",
  },
  {
    /* ── ADMITTED ONLY AFTER THE MAP WAS FIXED ──────────────────────────
       Both of these were held out of this file for a while, because the
       boundary data drew Kebbi with 20 councils and Niger with 26 while every
       source said 21 and 25. The guard below refused to colour either, which
       was the right call: a source and a map that disagree about how many
       places exist are describing different places.

       The cause was one LGA. Ngaski is Kebbi's and was filed under Niger in
       the upstream ADM2 set — 63% of its outline draws inside Kebbi. Moving it
       made both counts agree with the record, and only then were these rows
       allowed in. */
    code: "KEB",
    on: "2024-08-31",
    grade: "swept",
    elected: "APC",
    seats: 21,
    note: "Every chairmanship and every councillorship seat.",
    source: "AllAfrica, 3 September 2024.",
  },
  {
    code: "NIG",
    on: "2025-11-03",
    grade: "swept",
    elected: "APC",
    seats: 25,
    note: "All 25 chairmanships.",
    source: "Legit.ng, November 2025.",
  },
  {
    /* Annulled, re-run, and still disputed. Nigeria's most litigated council
       election, and the only honest colour for it is none. */
    code: "RIV",
    on: "2025-08-30",
    grade: "contested",
    elected: null,
    seats: 23,
    note: "The October 2024 poll was upturned by the Supreme Court. The August 2025 re-run is itself disputed, and reporting on who holds these councils does not agree with itself.",
    source: "Channels Television, 30 August 2025.",
  },
  {
    /* Kept deliberately, ungraded, because it is the counter-example the
       header is built on: PDP councils under an APC governor. Without a
       verified date it cannot colour anything, but it must not be dropped —
       dropping it would leave the file looking like the shortcut works. */
    code: "SOK",
    on: null,
    grade: "unverified",
    elected: "PDP",
    seats: 23,
    note: "Reported as a PDP sweep of all 23 councils, under a governor elected on the APC platform. No reliable date was found, so nothing is drawn.",
    source: "Leadership and Tribune, date not established.",
  },
];

/* Council counts come from the boundary files, which are the same shapes the
   map draws. Passed in rather than imported so this stays a data module with
   no opinion about geography. */
const BY_CODE = new Map(LG_CONTROL.map((row) => [row.code, row]));

/**
 * What is known about one state's councils.
 *
 * `party` is non-null only when every council in the state is that party and
 * the source has been reconciled against the real council count. Everything
 * else returns a reason instead of a colour.
 */
export function councilsIn(code, councilCount = null) {
  const row = BY_CODE.get(code);
  if (!row) return { code, known: false, reason: "not-recorded", party: null };

  /* A seat count that disagrees with the map is not a small discrepancy. It
     means the source and the boundaries are describing different places, and
     one of them is wrong, so neither gets to colour anything. */
  const mismatch =
    councilCount !== null && row.seats !== councilCount
      ? { claimed: row.seats, actual: councilCount }
      : null;

  if (row.grade === "contested") {
    return { ...row, known: false, reason: "contested", party: null, mismatch };
  }
  if (row.grade === "unverified") {
    return { ...row, known: false, reason: "unverified", party: null, mismatch };
  }
  if (row.grade === "split") {
    return { ...row, known: false, reason: "split", party: null, mismatch };
  }
  if (mismatch) {
    return { ...row, known: false, reason: "count-mismatch", party: null, mismatch };
  }

  return {
    ...row,
    known: true,
    reason: null,
    mismatch: null,
    party: row.current ?? row.elected,
  };
}

/** How much of the country this file actually covers, for printing on the map. */
export function coverage() {
  const drawable = LG_CONTROL.filter((row) => row.grade === "swept");
  return {
    states: drawable.length,
    councils: drawable.reduce((sum, row) => sum + row.seats, 0),
    recorded: LG_CONTROL.length,
    ofStates: 36,
    ofCouncils: 774,
  };
}

/** Councils that changed party without a council election. */
export function chairmenCrossedFloor() {
  return LG_CONTROL.filter((row) => row.current && row.current !== row.elected);
}
