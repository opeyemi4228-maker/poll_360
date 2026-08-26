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
    /* ── A SPLIT THAT IS STILL FULLY DETERMINED ──────────────────────────
       Not a sweep: the PDP took 30 of 31 and the APC took one. But the one
       was NAMED — Essien Udim, and its declaration was itself disputed for a
       day — so every council's party is still implied and the whole state can
       be drawn. "Split" and "undrawable" are not the same thing, and treating
       them as the same would have thrown away a state we actually know.

       What makes it drawable is the arithmetic closing: 30 plus the one named
       exception is 31, which is how many councils Akwa Ibom has. A source
       saying "PDP won most" would name nothing and close nothing, and would
       be graded `split` with no exceptions and drawn grey. */
    code: "AKW",
    on: "2024-10-05",
    grade: "split",
    elected: "PDP",
    seats: 31,
    except: { "Essien Udim": "APC" },
    stale: "The governor moved to the APC in June 2025. These councils were elected under the PDP eight months earlier and nothing reports them following him.",
    note: "PDP 30, APC 1. The APC's single seat is Essien Udim, in the Senate President's local government, and its declaration was contested on the night.",
    source: "Premium Times Gazette and Tribune, 5–6 October 2024.",
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
 * ── THE TEST IS "IS EVERY COUNCIL IMPLIED", NOT "WAS IT A SWEEP" ───────────
 * A sweep implies every council trivially. So does a split whose exceptions
 * are named and whose arithmetic closes: Akwa Ibom's PDP 30 / APC 1 names the
 * one, 30 + 1 is 31, and 31 is how many councils the state has, so every one
 * of them is determined. Only a split that leaves councils unaccounted for is
 * undrawable.
 *
 * `councils` is the list of names the map will actually draw. Passing the
 * names rather than a count lets this check two different things: that the
 * source and the map agree on how many places exist, and that every named
 * exception is a place the map has heard of. A typo in an exception would
 * otherwise colour nothing and be invisible.
 *
 * Callers get `partyFor(name)` rather than a single `party`, because for a
 * split those differ council by council. `party` is still returned as the
 * state's majority, for captions.
 */
export function councilsIn(code, councils = null) {
  const nothing = { code, known: false, reason: "not-recorded", party: null, partyFor: () => null };

  const row = BY_CODE.get(code);
  if (!row) return nothing;

  const names = Array.isArray(councils) ? councils : null;
  const count = names ? names.length : typeof councils === "number" ? councils : null;
  const except = row.except ?? {};
  const exceptions = Object.keys(except);

  /* A seat count that disagrees with the map is not a small discrepancy. It
     means the source and the boundaries are describing different places, and
     one of them is wrong, so neither gets to colour anything. */
  const mismatch =
    count !== null && row.seats !== count ? { claimed: row.seats, actual: count } : null;

  /* An exception naming a council the map does not draw. Either the source
     spells it differently or it is not in this state at all; both mean the
     exception would silently fail to apply and the council would be drawn as
     the majority party, which is the wrong answer stated confidently. */
  const unknown = names ? exceptions.filter((name) => !names.includes(name)) : [];

  const grey = (reason, extra = {}) => ({
    ...row,
    known: false,
    reason,
    party: null,
    partyFor: () => null,
    mismatch,
    ...extra,
  });

  if (row.grade === "contested") return grey("contested");
  if (row.grade === "unverified") return grey("unverified");
  if (mismatch) return grey("count-mismatch");
  if (unknown.length) return grey("unknown-council", { unknown });

  /* A split is only drawable if naming the exceptions accounts for every
     council. Anything left over is a council nobody has established. */
  if (row.grade === "split" && exceptions.length === 0) return grey("split");

  const majority = row.current ?? row.elected;
  if (!majority) return grey("split");

  return {
    ...row,
    known: true,
    reason: null,
    mismatch: null,
    unknown: [],
    party: majority,
    /* The party of one named council. Exceptions win; everything else is the
       state's majority. */
    partyFor: (name) => except[name] ?? majority,
    /* How many councils each party holds, for a caption that does not have to
       re-derive it from the map. */
    breakdown: Object.entries(
      (names ?? []).reduce((tally, name) => {
        const party = except[name] ?? majority;
        return { ...tally, [party]: (tally[party] ?? 0) + 1 };
      }, {})
    ).sort((a, b) => b[1] - a[1]),
  };
}

/** How much of the country this file actually covers, for printing on the map. */
export function coverage() {
  /* Drawable, not "swept": a split with named exceptions is drawn too. */
  const drawable = LG_CONTROL.filter(
    (row) => row.grade === "swept" || (row.grade === "split" && row.except)
  );
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
