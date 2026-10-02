import { LEVEL_WORDS, count, fmtInt, fmtPct, fmtPts, listOf } from "./format.js";
import { filterWords } from "./engine.js";

/**
 * The answer, written the way Poll360 writes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FOUR PARTS, ALWAYS IN THIS ORDER
 *
 *    HEADLINE   the answer in one sentence, with the one figure that matters.
 *    READING    what the record shows, place by place, in plain words.
 *    FOR THE PLAN  what a campaign does with it — only where there is
 *               something to do, and never dressed up as a finding.
 *    METHOD     how it was worked out, and what is counted against what is
 *               estimated, on the same card as the answer and never in a
 *               footnote.
 *
 *  Every figure here is read off the engine's `facts`. This file adds words
 *  and nothing else, which is what lets lib/ask/verify.js hold the model's
 *  version of an answer to the same standard.
 * ══════════════════════════════════════════════════════════════════════════
 */

const shareOf = (entry, ground = null) =>
  `${entry.name}${entry.state && entry.state !== entry.name && entry.state !== ground ? ` (${entry.state})` : ""} ${fmtPct(entry.share)}`;
const cap = (text) => (text ? text[0].toUpperCase() + text.slice(1) : text);
/** "Kano's", "Rivers'". */
const own = (name) => (/s$/.test(name) ? `${name}'` : `${name}'s`);

/**
 * "19 states and the FCT", not "20 states": the FCT is not a state, and the
 * North is always said that way. Anything that is not a count of states that
 * includes the FCT is counted as usual.
 */
function placesOf(result, n, level) {
  if (level !== "state") return count(n, level);
  const withFct = result.scope?.national ? n === 37 : Boolean(result.scope?.states?.includes("FCT"));
  if (!withFct || n < 2) return count(n, level);
  return `${fmtInt(n - 1)} ${n - 1 === 1 ? "state" : "states"} and the FCT`;
}

export function write(result) {
  if (result.help) return help();
  if (result.research?.unknown) return unknownAspirant(result.research.unknown);
  if (!result.sections.length) {
    return {
      headline: result.notes[0] ?? "Poll360 has nothing on record that answers that.",
      reading: result.notes.slice(1),
      plan: [],
      method: [],
      followups: STARTER_FOLLOWUPS,
    };
  }

  const intent = result.plan.intent;
  const body =
    intent === "reach"
      ? reach(result)
      : intent === "target"
        ? target(result)
        : intent === "swing"
          ? swing(result)
          : intent === "profile"
            ? profile(result)
            : intent === "scenario"
              ? scenario(result)
              : intent === "strength"
                ? strength(result)
                : intent === "national"
                  ? national(result)
                  : intent === "versus"
                    ? versus(result)
                    : intent === "research"
                      ? research(result)
                      : intent === "ground"
                        ? ground(result)
                        : intent === "outlook"
                          ? outlook(result)
                          : intent === "governor"
                            ? governor(result)
                            : intent === "coalition"
                              ? coalition(result)
                              : intent === "rules"
                                ? rules(result)
                                : list(result);

  /* "The ADC's chances in 2027": its presidential vote in 2023 is too small to
     measure a path from, so the answer is its register, and it says why. */
  if (intent === "strength" && result.plan.focus === "path") {
    body.reading = [
      `The ${result.partyId ?? "party"}'s 2023 presidential vote is too small to measure a path to 2027 from — it sits inside "other parties" in the declared record — so its measure here is its own register of members. For the path of a coalition, ask for the candidates together, for example "Atiku and Obi together".`,
      ...body.reading,
    ];
  }

  return {
    ...body,
    reading: [...result.notes, ...body.reading],
    method: [...(body.method ?? []), ...provenanceLines(result)],
  };
}

const STARTER_FOLLOWUPS = [
  "List of states Atiku can get 25%",
  "Where should we focus in Kano?",
  "What if Atiku gains 5 points?",
];

/* ══════════════════════════════════════════════════════════════ reach */

function reach(result) {
  const { whoName: who, year, prev } = result;
  const [first, ...rest] = result.sections;
  const f = first.facts;
  const T = f.threshold;
  const level = first.level;
  const reading = [];
  const plan = [];

  /* ── NOTHING NEAR THE LINE ─────────────────────────────────────────────
     "0 of 44, needing 0 votes" is true and tells a campaign nothing. Where no
     place has cleared the line or come within reach of it, the answer is the
     nearest places, what each would take, and the nearer line the record
     does support. */
  if (f.read === 1 && first.rows.length === 1 && first.rows[0].share !== null && first.rows[0].share !== undefined) {
    /* One place: a yes or no, and the figure. */
    const row = first.rows[0];
    const clears = row.share >= T;
    return {
      headline: clears
        ? `Yes — ${who} took ${fmtPct(row.share)} in ${row.name} in ${year}, over the ${T}% line by ${fmtPts(row.share - T).replace("+", "")}.`
        : `No — ${who} took ${fmtPct(row.share)} in ${row.name} in ${year}, ${fmtPts(T - row.share).replace("+", "")} short of ${T}%${row.need ? `, about ${fmtInt(row.need)} votes on that turnout` : ""}.`,
      reading: [
        ...(prev && row.share_prev !== null && row.share_prev !== undefined ? [`In ${prev}: ${fmtPct(row.share_prev)}${row.share_prev >= T ? `, over the line` : ""}.`] : []),
        ...(row.key === "FCT" ? ["Whether 25% in the FCT is needed on top of 24 states was argued before the courts in 2023; the Supreme Court upheld the result without it."] : []),
      ],
      plan: [],
      method: [`Share is ${who}'s share of the valid vote.`],
      followups: reachFollowups(result),
    };
  }
  if (!f.section134 && f.cleared === 0 && f.within === 0 && f.closestBeyond.length) {
    return nothingNear(result, first);
  }

  let headline;
  const path = result.plan.focus === "path" && f.section134?.national;
  if (path) {
    /* ── WHAT IT TAKES TO WIN ────────────────────────────────────────────
       Two tests, both required, and the answer says where he stood on each. */
    const s = f.section134;
    const n = s.national;
    headline = n.leads
      ? `On the ${year} result ${who} led the count; the test he did not meet was the spread — 25% in ${s.cleared} of the 36 states, ${s.shortBy} short of the 24 needed.`
      : `To win, ${who} needs two things ${year} did not give him: the most votes — he trailed the ${n.leader} by ${fmtInt(n.gap)} (${fmtPct(n.share)} to ${fmtPct(n.leaderShare)}) — and 25% in 24 of the 36 states, where he reached ${s.cleared}${s.shortBy ? `, ${s.shortBy} short` : ""}.`;
    reading.push(
      `The count: ${fmtInt(n.votes)} votes, ${fmtPct(n.share)}, against the ${n.leader}'s ${fmtInt(n.leaderVotes)}, ${fmtPct(n.leaderShare)}.`
    );
    plan.push(
      n.leads
        ? `Hold the lead and close the spread: the states nearest 25% are listed below with the votes each needs.`
        : `Both tests at once: ${fmtInt(n.gap)} more votes than the leader nationally, and ${s.shortBy} more states over 25%. The spread states listed below are also where some of the count comes from.`
    );
  } else if (f.section134) {
    const s = f.section134;
    headline = s.shortBy
      ? `${cap(who)} cleared ${T}% in ${s.cleared} of the 36 states in ${year} — ${s.shortBy} short of the 24 Section 134 asks for.`
      : `${cap(who)} cleared ${T}% in ${s.cleared} of the 36 states in ${year}, which meets the 24 Section 134 asks for.`;
  } else {
    const ofWhat =
      level === "state" && !result.scope.national && result.scope.states?.includes("FCT")
        ? `${result.scope.name}'s ${fmtInt(f.read)} (${placesOf(result, f.read, level)})`
        : `${result.scope.national ? "" : `${result.scope.name}'s `}${placesOf(result, f.read, level)}`;
    headline = `${cap(who)} cleared ${T}% in ${fmtInt(f.cleared)} of ${ofWhat} in ${year}${
      prev ? `, and held it in ${fmtInt(f.counts.held)} of them in ${prev} as well` : ""
    }.`;
  }

  for (const section of result.sections) {
    reading.push(...reachReading(section, result, section === first));
  }
  /* A region's states are part of the national spread test, and a campaign
     reading about the South wants to know how much of the 24 it carries. */
  if (result.scope.region && level === "state") {
    const outside = f.counts.held + f.counts.cleared - (first.rows.some((row) => row.key === "FCT" && (row.status === "held" || row.status === "cleared")) ? 1 : 0);
    reading.push(`Toward Section 134: these ${fmtInt(outside)} count toward the 24 of 36 states needed across the country; the FCT is counted apart.`);
  }

  /* ── WHAT A CAMPAIGN DOES WITH IT ──────────────────────────────────── */
  if (f.section134?.shortBy) {
    const cheapest = f.cheapest.filter((entry) => entry.name !== "Federal Capital Territory").slice(0, f.section134.shortBy);
    if (cheapest.length) {
      plan.push(
        `The spread test is ${f.section134.shortBy} ${f.section134.shortBy === 1 ? "state" : "states"} away. The cheapest to lift to ${T}% on the last turnout: ${listOf(
          cheapest.map((entry) => `${entry.name} (${fmtInt(entry.need)} votes)`)
        )}.`
      );
    }
  }
  if (f.counts.held) {
    plan.push(
      `Protect the base first: the ${count(f.counts.held, level)} held in both ${prev} and ${year} ${f.counts.held === 1 ? "is" : "are"} where a lost polling unit costs most, so ${f.counts.held === 1 ? "it is" : "they are"} where agents and result sheets have to be complete.`
    );
  }
  if (f.within) {
    plan.push(
      `Then the ${count(f.within, level)} within reach: ${fmtInt(f.needWithin)} votes to find in all${
        f.perUnitWithin ? `, about ${fmtInt(f.perUnitWithin)} for each of their polling units` : ""
      }. Small per unit, which makes it a turnout job before it is a persuasion job.`
    );
  }
  const deepest = rest[rest.length - 1];
  if (deepest && (deepest.level === "unit" || deepest.level === "ward") && deepest.facts.within) {
    plan.push(
      `The ${LEVEL_WORDS[deepest.level].many} list is the working list: sort it by "Votes to find" and hand each coordinator their own rows.`
    );
  }

  const method = [
    `Share is ${who}'s share of the valid vote. ${prev ? `Each place is set against ${T}% in ${prev} and ${year}.` : ""}`.trim(),
    `Within reach means short of ${T}% by ${fmtInt(result.band)} points or less in ${year}${prev ? `, or cleared in ${prev} and lost in ${year}` : ""}.`,
    `Votes to find assumes everybody else keeps the votes they had and the extra come from people who did not vote last time. A vote won over from another party goes further than that.`,
  ];
  if (f.section134) {
    method.push(
      `Section 134 of the Constitution asks the winner for a quarter of the vote in at least two-thirds of the states — 24 of 36. The FCT is counted apart, as it was argued in 2023.`
    );
  }

  return { headline, reading, plan, method, followups: reachFollowups(result) };
}

function nothingNear(result, section) {
  const { whoName: who, year, prev } = result;
  const f = section.facts;
  const T = f.threshold;
  const where = result.scope.name;
  const words = LEVEL_WORDS[section.level];
  const nearest = f.closestBeyond[0];
  const five = f.closestBeyond.slice(0, 5);
  const needFive = five.reduce((sum, entry) => sum + (entry.need ?? 0), 0);
  const context = result.stateContext;
  const nearer = Math.max(5, Math.floor((nearest.share ?? 0) / 5) * 5);

  const reading = [
    `Nearest to the line: ${listOf(five.map((entry) => `${entry.name} ${fmtPct(entry.share)} (${fmtInt(entry.need)} votes to find)`), 5)}.`,
  ];
  if (context?.share?.[year] !== undefined) {
    reading.push(
      `${context.name} as a whole, counted: ${fmtPct(context.share[year])} for ${who} in ${year}${
        prev && context.share[prev] !== undefined ? `, against ${fmtPct(context.share[prev])} in ${prev}` : ""
      }.`
    );
  }
  const plan = [
    `${T}% is not a line ${where}'s ${words.many} are near: the nearest five need ${fmtInt(needFive)} votes between them on the last turnout.`,
  ];
  if (context?.share?.[prev] !== undefined && context.share[prev] > (context.share[year] ?? 0)) {
    plan.push(`The line the record supports is ${who}'s own ${prev} share of ${fmtPct(context.share[prev])}: win back what he held before, then build on it.`);
  }
  plan.push(`Work from the list below, nearest first. Ask where ${who} can get ${nearer}% to see the realistic ground.`);

  return {
    headline: `${cap(who)} cleared ${T}% in none of ${where}'s ${fmtInt(f.read)} ${words.many} in ${year}; the nearest is ${nearest.name} at ${fmtPct(nearest.share)}, ${fmtPts(T - nearest.share).replace("+", "")} short.`,
    reading,
    plan,
    method: [
      `Share is ${who}'s share of the valid vote in ${year}.`,
      `Votes to find assumes everybody else keeps the votes they had and the extra come from people who did not vote last time.`,
    ],
    followups: [
      `Where can ${who} get ${nearer}% in ${where}?`,
      `Where should ${who} focus in ${where}?`,
      `How did ${who} change since 2019 in ${where}?`,
    ],
  };
}

function reachReading(section, result, lead) {
  const f = section.facts;
  const { year, prev } = result;
  const T = f.threshold;
  const words = LEVEL_WORDS[section.level];
  const out = [];

  if (section.level === "state" || section.level === "zone") {
    if (f.held.length) {
      out.push(`Held ${T}% in both ${prev} and ${year} (${f.counts.held}): ${listOf(f.held.map(shareOf), 40)}.`);
    }
    if (f.newly.length) {
      out.push(`Cleared ${T}% in ${year}${prev ? ` but not in ${prev}` : ""} (${f.counts.cleared}): ${listOf(f.newly.map(shareOf), 40)}.`);
    }
    if (f.slipped.length) {
      out.push(`Held ${T}% in ${prev} and fell short in ${year} (${f.counts.slipped}): ${listOf(f.slipped.map(shareOf), 40)}.`);
    }
    if (f.reach.length) {
      out.push(`Within ${fmtInt(result.band)} points of the line (${f.counts.reach}): ${listOf(f.reach.map(shareOf), 40)}.`);
    }
    if (f.counts.beyond) {
      out.push(`Out of reach on the last result (${f.counts.beyond}), nearest first: ${listOf(f.closestBeyond.map(shareOf), 5)}.`);
    }
    if (f.section134 && f.section134.fctShare !== null) {
      out.push(
        `The FCT, counted apart: ${fmtPct(f.section134.fctShare)}, ${f.section134.fct ? "over" : "under"} the ${T}% line.`
      );
    }
    return out;
  }

  const closest = [...f.reach, ...f.slipped].sort((a, b) => (b.share ?? 0) - (a.share ?? 0)).slice(0, 3);
  out.push(
    `${words.title}: ${fmtInt(f.cleared)} of ${fmtInt(f.read)} cleared ${T}% in ${year}${prev ? ` (${fmtInt(f.counts.held)} in both runs)` : ""}. ${fmtInt(f.within)} more ${
      f.within === 1 ? "is" : "are"
    } within reach, needing ${fmtInt(f.needWithin)} votes between them${
      f.perUnitWithin ? `, about ${fmtInt(f.perUnitWithin)} per polling unit` : ""
    }.${closest.length ? ` Closest to the line: ${listOf(closest.map((entry) => shareOf(entry, result.scope.name)), 3)}.` : ""}`
  );
  if (!lead && f.show === "can" && f.counts.beyond) {
    out.push(
      `The ${words.many} list holds the ${fmtInt(section.total)} that cleared ${T}% or are within reach; the ${fmtInt(f.counts.beyond)} out of reach are left off it.`
    );
  }
  return out;
}

function reachFollowups(result) {
  const out = [];
  const levels = result.plan.levels;
  if (!levels.includes("lga")) out.push("Now the local governments within reach");
  if (!levels.includes("ward") && result.sections[0]?.facts?.slipped?.[0]) {
    out.push(`Which wards in ${result.sections[0].facts.slipped[0].state} are within reach?`);
  }
  out.push(`What if ${result.whoName} gains 3 points?`);
  out.push(`Where should ${result.whoName} focus next?`);
  return out.slice(0, 4);
}

/* ══════════════════════════════════════════════════════════════ list */

function list(result) {
  const { whoName: who, year } = result;
  const reading = [];
  const plan = [];
  const [first] = result.sections;
  const f = first.facts;
  const filters = result.plan.filters;
  const wonFilter = filters.find((filter) => filter.field === "won");
  const tierFilter = filters.find((filter) => filter.field === "tier");

  let headline;
  const ground = result.scope.national ? "" : `${result.scope.name}'s `;
  const prev = result.prev;
  const focus = result.plan.focus;
  const whereName = result.scope.national ? "Nigeria" : result.scope.name;
  const words = LEVEL_WORDS[first.level];
  if (focus === "count" && !filters.length) {
    headline = `${whereName} has ${count(f.read, first.level)}${
      f.registered ? `, with ${fmtInt(f.registered)} registered voters between them` : ""
    }.`;
  } else if (focus === "turnout" && f.byTurnout?.length) {
    const high = f.byTurnout[0];
    const low = f.byTurnout[f.byTurnout.length - 1];
    const lowestFirst = f.sortedBy?.dir === "asc";
    headline = `Turnout across ${whereName} in ${year}: ${fmtPct(f.turnoutOf)} — ${
      lowestFirst ? `lowest in ${low.name} (${fmtPct(low.turnout)}), highest in ${high.name} (${fmtPct(high.turnout)})` : `highest in ${high.name} (${fmtPct(high.turnout)}), lowest in ${low.name} (${fmtPct(low.turnout)})`
    }.`;
    reading.push(
      `${lowestFirst ? "Lowest" : "Highest"} five: ${listOf((lowestFirst ? [...f.byTurnout].reverse() : f.byTurnout).slice(0, 5).map((entry) => `${entry.name} ${fmtPct(entry.turnout)}`), 5)}.`
    );
  } else if (focus === "register" && f.top10?.length) {
    const biggest = [...f.top10].sort((a, b) => (b.registered ?? 0) - (a.registered ?? 0))[0];
    headline = `${whereName} has ${fmtInt(f.registered)} registered voters across ${placesOf(result, f.read, first.level)}; the largest register is ${biggest.name}${
      biggest.state && biggest.state !== biggest.name && biggest.state !== whereName ? `, ${biggest.state},` : ""
    } with ${fmtInt(biggest.registered)}.`;
    if (f.turnoutOf !== null && f.turnoutOf !== undefined) reading.push(`Turnout across them in ${year}: ${fmtPct(f.turnoutOf)}.`);
  } else if (focus === "top" && f.top10?.length) {
    const n = result.plan.limit ?? f.top10.length;
    headline = `${cap(who)}'s ${n === 1 ? "strongest" : `${n} strongest`} ${n === 1 ? words.one : words.many} in ${whereName}, ${year}, led by ${f.top10[0].name} on ${fmtPct(f.top10[0].share)}.`;
  } else if (focus === "winnable") {
    const carried = f.carried;
    headline = `${cap(who)} carried ${fmtInt(carried)} of ${ground}${count(f.read, first.level)} in ${year} and came within five points in ${fmtInt(f.matched - carried)} more — ${fmtInt(f.matched)} ${words.many} where a win is on the record or within reach.`;
  } else if (focus === "close") {
    const wonFlag = filters.find((filter) => filter.field === "won");
    const band = Math.abs(filters.find((filter) => filter.field === "lead" || filter.field === "margin")?.value ?? 5);
    const within = `by under ${band === 5 ? "five" : band === 10 ? "ten" : fmtInt(band)} points`;
    const names = f.matched && f.top10?.length ? `: ${listOf(f.top10.slice(0, 8).map((entry) => `${entry.name}${entry.lead !== null && entry.lead !== undefined ? ` (${fmtPts(entry.lead)})` : ""}`), 8)}` : "";
    headline = wonFlag
      ? wonFlag.value
        ? `${cap(who)} carried ${fmtInt(f.matched)} of ${ground}${count(f.read, first.level)} ${within} in ${year} — the ones that can go back${names}.`
        : `${cap(who)} lost ${fmtInt(f.matched)} of ${ground}${count(f.read, first.level)} ${within} in ${year} — the nearest to turning${names}.`
      : `${fmtInt(f.matched)} of ${ground}${count(f.read, first.level)} were decided ${within} in ${year}.`;
  }
  if (headline) {
    /* led by the focus above; the rest of the reading follows as usual */
  } else
  if (tierFilter && f.matched === 0 && f.shown) {
    /* ── WHY NOTHING QUALIFIED ──────────────────────────────────────────
       The levels are defined by two runs, so an empty answer almost always
       has one plain reason: he did not carry the ground in one of them. */
    const tier = String(tierFilter.value).toLowerCase();
    const context = result.stateContext;
    const lostPrev = f.carriedPrev === 0 && prev;
    headline = !prev && f.carried
      ? `${cap(who)} has one run in this record, so no ${first.level === "state" ? "state" : words.one} is a stronghold across runs yet; in ${year} ${who} carried ${fmtInt(f.carried)} of ${ground}${count(f.read, first.level)}.`
      : tier === "primary" && lostPrev
        ? `None of ${ground}${count(f.read, first.level)} is a primary stronghold for ${who}: a primary stronghold is carried in both ${prev} and ${year}, and he carried ${f.carried === f.shown ? "all" : fmtInt(f.carried)} of them in ${year} but none in ${prev}.`
        : tier === "secondary"
          ? `None of ${ground}${count(f.read, first.level)} is a secondary stronghold for ${who}: a secondary stronghold is carried once, on ground the PDP carried at least twice in 1999, 2003 and 2015.`
          : tier === "tertiary"
            ? `None of ${ground}${count(f.read, first.level)} is a tertiary stronghold for ${who}: a tertiary stronghold is carried once, with no older PDP base behind it.`
            : `None of ${ground}${count(f.read, first.level)} is a stronghold for ${who}: he carried none of them in ${prev ?? "2019"} or ${year}.`;
    if (context && lostPrev && context.share?.[prev] !== undefined) {
      reading.push(`${context.name} as a whole, counted: ${fmtPct(context.share[prev])} for ${who} in ${prev}, ${context.won?.[prev] ? "carried" : "not carried"}; ${fmtPct(context.share[year])} in ${year}, ${context.won?.[year] ? "carried" : "not carried"}.`);
    }
    const levelParts = [
      f.tiers.PRIMARY && `${fmtInt(f.tiers.PRIMARY)} primary`,
      f.tiers.SECONDARY && `${fmtInt(f.tiers.SECONDARY)} secondary (carried once, on ground the PDP has held before)`,
      f.tiers.TERTIARY && `${fmtInt(f.tiers.TERTIARY)} tertiary (carried once)`,
    ].filter(Boolean);
    if (levelParts.length) {
      reading.push(`What they are instead: ${listOf(levelParts, 3)}. Every one is listed below with its level.`);
    }
    if (f.strongest?.length) {
      reading.push(`Strongest in ${year}: ${listOf(f.strongest.map((entry) => shareOf(entry, result.scope.name)), 5)}.`);
    }
    if (lostPrev && f.carried) {
      plan.push(`Ground won once is ground that can go back. Holding what was carried in ${year} is the job here — agents at every polling unit, and the result sheets watched.`);
    }
  } else if (f.matched === 0 && f.shown && !wonFilter) {
    headline = `None of ${ground}${count(f.read, first.level)} ${f.read === 1 ? "matches" : "match"} ${listOf(filters.map((filter) => filterWords(filter, year)))}; all ${fmtInt(f.shown)} are listed below.`;
    if (f.strongest?.length) reading.push(`Strongest in ${year}: ${listOf(f.strongest.map((entry) => shareOf(entry, result.scope.name)), 5)}.`);
  } else if (wonFilter && f.matched === 0) {
    headline = wonFilter.value
      ? `${cap(who)} carried none of ${result.scope.name}'s ${count(f.read, first.level)} in ${year}.`
      : `${cap(who)} lost none of ${result.scope.name}'s ${count(f.read, first.level)} in ${year}.`;
    if (f.strongest?.length) {
      reading.push(
        `Where he ran strongest: ${listOf(
          f.strongest.map((entry) => `${entry.name}${entry.state && entry.state !== entry.name && result.scope.name !== entry.state ? `, ${entry.state},` : ""} ${fmtPct(entry.share)}${entry.lead !== null ? ` (${fmtPts(Math.abs(entry.lead)).replace("+", "")} behind)` : ""}`),
          5
        )}.`
      );
    }
    if (result.stateContext?.share?.[year] !== undefined) {
      reading.push(`${result.stateContext.name} as a whole, counted: ${fmtPct(result.stateContext.share[year])} for ${who} in ${year}.`);
    }
  } else if (wonFilter) {
    headline = wonFilter.value
      ? `${cap(who)} carried ${fmtInt(f.matched)} of ${
          first.level === "state" && result.scope.national && f.read === 37 ? "the 36 states and the FCT" : `${placesOf(result, f.read, first.level)} in ${result.scope.name}`
        } in ${year}.`
      : `${cap(who)} lost ${fmtInt(f.matched)} of ${count(f.read, first.level)} in ${result.scope.name} in ${year}.`;
  } else if (tierFilter) {
    headline = `${fmtInt(f.matched)} of ${count(f.read, first.level)} in ${result.scope.name} are ${
      String(tierFilter.value).toLowerCase() === "any" ? "strongholds" : `${String(tierFilter.value).toLowerCase()} strongholds`
    } for ${who}.`;
  } else if (filters.length && f.matched === f.read) {
    headline = `All ${fmtInt(f.read)} of ${result.scope.national ? "the" : `${result.scope.name}'s`} ${LEVEL_WORDS[first.level].many} match: ${listOf(filters.map((filter) => filterWords(filter, year)))}.`;
  } else if (filters.length) {
    headline = `${fmtInt(f.matched)} of ${result.scope.national ? "" : `${result.scope.name}'s `}${count(f.read, first.level)} ${f.matched === 1 ? "matches" : "match"}: ${listOf(filters.map((filter) => filterWords(filter, year)))}.`;
  } else if (f.sortedBy?.field === "registered" && f.top[0]) {
    headline = `The biggest of ${result.scope.national ? "Nigeria's" : `${result.scope.name}'s`} ${count(f.read, first.level)} by registered voters is ${f.top[0].name}${
      f.top[0].state && f.top[0].state !== result.scope.name && f.top[0].state !== f.top[0].name ? `, ${f.top[0].state}` : ""
    }, with ${fmtInt(f.top[0].registered)}.`;
  } else if (f.sortedBy?.field === "lead" && f.top10?.[0]) {
    const led = f.top10.filter((entry) => entry.lead !== null && entry.lead > 0);
    headline = led.length
      ? `${cap(who)}'s widest margins in ${year}: ${listOf(led.slice(0, 5).map((entry) => `${entry.name} (${fmtPts(entry.lead)})`), 5)}; every one of ${ground}${count(f.read, first.level)} is ranked below, the narrowest and the losses after.`
      : `${cap(who)} led in none of ${ground}${count(f.read, first.level)} in ${year}; ranked by margin, the nearest was ${f.top10[0].name} (${fmtPts(f.top10[0].lead)}).`;
  } else if (f.sortedBy?.field === "votes" && f.top10?.[0]) {
    headline = `${cap(who)}'s most votes in ${year} came from ${listOf(f.top10.slice(0, 5).map((entry) => entry.name), 5)}; all ${fmtInt(f.read)} are ranked below.`;
  } else if (f.sortedBy?.field === "share" && f.sortedBy.dir === "asc" && f.top[0]) {
    headline = `${cap(who)}'s weakest of ${result.scope.national ? "the" : `${result.scope.name}'s`} ${LEVEL_WORDS[first.level].many} in ${year} is ${f.top[0].name}, on ${fmtPct(f.top[0].share)}.`;
  } else {
    headline = `${cap(who)} in ${result.scope.name}, ${year}: ${fmtInt(f.votes)} votes across ${placesOf(result, f.read, first.level)}, carrying ${fmtInt(f.carried)}.`;
  }

  for (const section of result.sections) {
    const s = section.facts;
    const by = s.sortedBy?.field === "registered" ? "largest register first" : s.sortedBy?.dir === "asc" ? "weakest first" : "strongest first";
    /* Where every place is in one state, the state is said once, not after
       every name. */
    const states = new Set(s.top.map((entry) => entry.state));
    const oneState = states.size === 1 ? [...states][0] : null;
    if (s.top.length && !s.unfiltered) {
      reading.push(
        `${LEVEL_WORDS[section.level].title}, ${by}: ${listOf(
          s.top.slice(0, 6).map((entry) =>
            s.sortedBy?.field === "registered"
              ? `${entry.name}${entry.state && entry.state !== entry.name && entry.state !== oneState ? ` (${entry.state})` : ""} ${fmtInt(entry.registered)} voters`
              : shareOf(entry, oneState)
          ),
          6
        )}.`
      );
    }
    if (section.limited) reading.push(`The list is cut at ${fmtInt(section.limited)}, as asked.`);
  }

  if (wonFilter?.value && first.level !== "state" && f.matched) {
    plan.push(`These are ground to hold: every one needs an agent at every polling unit, because they are where the count is most likely to be his.`);
  }
  if (wonFilter && !wonFilter.value) {
    plan.push(`Sort the list by registered voters: the largest losses are where a small swing moves the most votes.`);
  }

  return {
    headline,
    reading,
    plan,
    method: [`Share is ${who}'s share of the valid vote in ${year}. Lead is that share less the next party's.`],
    followups: [
      `Where can ${who} get 25% in ${result.scope.name === "Nigeria" ? "the North Central" : result.scope.name}?`,
      `Where should ${who} focus in ${result.scope.name}?`,
      `How did ${who} change since 2019 in ${result.scope.name}?`,
    ],
  };
}

/* ══════════════════════════════════════════════════════════════ target */

function target(result) {
  const { whoName: who } = result;
  const [first] = result.sections;
  const f = first.facts;
  const top = f.top[0];
  const one = LEVEL_WORDS[first.level].one;

  const headline = top
    ? `Top of the list for ${who}'s next votes in ${result.scope.name}: ${top.name}${top.state && top.state !== top.name && top.state !== result.scope.name ? `, ${top.state}` : ""} — ${
        top.why ? top.why.toLowerCase().replace(" · ", " and ") : "the strongest mix of the factors weighed"
      }.`
    : `Nothing in ${result.scope.name} can be ranked on those factors.`;

  const reading = [
    `Ranked by ${listOf(f.factors.map((label) => label.toLowerCase()))}, each scored against every other ${one} in the list, so the top is the top of this ground.`,
    `The first five: ${listOf(
      f.top.slice(0, 5).map((entry) => `${entry.name} (${entry.score}${entry.share !== null ? `, ${fmtPct(entry.share)} for ${who}` : ""})`),
      5
    )}.`,
  ];
  const plan = [
    f.ranked > 20
      ? `The first 20 hold ${fmtInt(f.top20Registered)} registered voters. That is a list a field team can work in a week: coordinator, agents and a turnout plan for each.`
      : `Work the list top down: a coordinator, agents and a turnout plan for each ${one}, the highest scores first.`,
    `A high score is a reason to look, not a verdict. Open each one on the Strongholds map before money follows it.`,
  ];
  return {
    headline,
    reading,
    plan,
    method: [
      `Registered voters: the most people to reach. Voter clusters: many voters in few polling units, so one agent covers more. Turnout gap: registered voters who stayed home. Close contest: a narrow result either way.`,
      `Each factor is ranked among the places listed, then the ranks are averaged into a score out of 100. The same method as the Strongholds tab's "Where to target".`,
    ],
    followups: [
      `Now the wards in ${top?.state ?? result.scope.name}`,
      `Where can ${who} get 25% in ${top?.state ?? result.scope.name}?`,
      `Biggest polling units in ${top?.state ?? result.scope.name}`,
    ],
  };
}

/* ══════════════════════════════════════════════════════════════ swing */

function swing(result) {
  const { whoName: who, year, prev } = result;
  const [first] = result.sections;
  const f = first.facts;
  const places = f.gained + f.fell;
  const direction =
    f.gained === 0
      ? `fell in all ${fmtInt(places)} of ${result.scope.national ? "the" : `${result.scope.name}'s`} ${LEVEL_WORDS[first.level].many}`
      : f.fell === 0
        ? `rose in all ${fmtInt(places)} of ${result.scope.national ? "the" : `${result.scope.name}'s`} ${LEVEL_WORDS[first.level].many}`
        : f.gained >= f.fell
          ? `rose in ${fmtInt(f.gained)} of ${count(places, first.level)}`
          : `fell in ${fmtInt(f.fell)} of ${count(places, first.level)}`;
  const pronoun = result.who?.kind === "party" ? "it" : "he";
  if (result.plan.focus === "flipped") {
    const lost = f.flippedOutNames ?? [];
    const won = f.flippedInNames ?? [];
    return {
      headline: lost.length
        ? `${cap(who)} carried ${fmtInt(lost.length)} ${lost.length === 1 ? LEVEL_WORDS[first.level].one : LEVEL_WORDS[first.level].many} in ${prev} that ${result.who?.kind === "party" ? "it" : "he"} lost in ${year}: ${listOf(lost, 20)}.`
        : `${cap(who)} lost none of the ${LEVEL_WORDS[first.level].many} carried in ${prev} in ${year}.`,
      reading: [
        ...(won.length ? [`The other way — lost in ${prev}, carried in ${year}: ${listOf(won, 20)}.`] : []),
        `Biggest falls: ${listOf(f.worst.map((entry) => `${entry.name} ${fmtPts(entry.change)} to ${fmtPct(entry.share)}`), 5)}.`,
      ],
      plan: lost.length ? [`Ground carried once can be carried again: these are the first places to ask what changed.`] : [],
      method: [`Carried means first on the declared vote. Change is the share in ${year} less the share in ${prev}.`],
      followups: [`Where can ${who} get 25%?`, `Chances of ${who} winning 2027`],
    };
  }
  const gainsFirst = result.plan.focus === "gains";
  const asked = gainsFirst && f.gained
    ? `rose in ${fmtInt(f.gained)} of ${count(places, first.level)}${f.best.length ? `, most in ${listOf(f.best.slice(0, 3).map((entry) => `${entry.name} (${fmtPts(entry.change)})`), 3)}` : ""}`
    : gainsFirst
      ? `rose in none of ${count(places, first.level)}`
      : direction;
  const headline = `${cap(who)}'s share ${asked} between ${prev} and ${year}${
    f.flippedIn && f.flippedOut
      ? `; ${pronoun} won ${fmtInt(f.flippedIn)} ${pronoun} had lost and lost ${fmtInt(f.flippedOut)} ${pronoun} had carried`
      : f.flippedOut
        ? `, and ${pronoun} lost ${fmtInt(f.flippedOut)} ${pronoun} had carried`
        : f.flippedIn
          ? `, and ${pronoun} won ${fmtInt(f.flippedIn)} ${pronoun} had lost`
          : ""
  }.`;
  return {
    headline,
    reading: [
      `${f.gained === 0 ? "Held up best" : "Biggest gains"}: ${listOf(f.best.map((entry) => `${entry.name} ${fmtPts(entry.change)} to ${fmtPct(entry.share)}`), 5)}.`,
      `${f.fell === 0 ? "Smallest gains" : "Biggest falls"}: ${listOf(f.worst.map((entry) => `${entry.name} ${fmtPts(entry.change)} to ${fmtPct(entry.share)}`), 5)}.`,
    ],
    plan: f.fell
      ? [`Where the share fell, find out why before spending there: a lost ally, a new candidate, or a turnout collapse each need a different answer.`]
      : [],
    method: [`Change is ${who}'s share of the valid vote in ${year} less the share in ${prev}, in percentage points.`],
    followups: [`Where can ${who} get 25%?`, `Where should ${who} focus next?`],
  };
}

/* ══════════════════════════════════════════════════════════════ profile */

function profile(result) {
  const [first] = result.sections;
  const f = first.facts;
  const who = result.whoName;

  if (f.kind === "profile-state") {
    const latest = f.history.find((row) => row.share !== null);
    const earlier = f.history.filter((row) => row.share !== null && row !== latest)[0];
    /* "Who won Kano in 2015": the year asked, and who carried it. */
    const askedYear = result.plan.year;
    const asked = askedYear ? f.history.find((row) => row.year === askedYear) : null;
    if (asked) {
      const [party, candidate] = asked.winner.split(" · ");
      return {
        headline: `${f.state}, ${asked.year}: ${candidate ?? party} of the ${party} carried it with ${fmtPct(asked.winner_share)}, a margin of ${fmtPts(asked.margin).replace("+", "")}.`,
        reading: f.history.map(
          (row) =>
            `${row.year}: carried by ${row.winner} on ${fmtPct(row.winner_share)}${row.share !== null ? `; ${row.subject} ${fmtPct(row.share)}` : ""}${row.turnout !== null ? `, turnout ${fmtPct(row.turnout)}` : ""}.`
        ),
        plan: [],
        method: [`Every presidential election since 1999 that published a table by state. 2007 and 2011 published national totals only.`],
        followups: [`How did Atiku do in ${f.state}?`, `Where can Atiku get 25% in ${f.state}?`],
      };
    }
    const same = earlier && earlier.subject === latest?.subject;
    const change = latest && earlier ? latest.share - earlier.share : null;
    const headline = latest
      ? `${f.state}: ${who} took ${fmtInt(latest.votes)} votes, ${fmtPct(latest.share)}, in ${latest.year}${
          earlier
            ? same
              ? `, ${change >= 0 ? "up" : "down"} from ${fmtPct(earlier.share)} in ${earlier.year}`
              : `, against ${fmtPct(earlier.share)} for ${earlier.subject.split(" (")[0]} in ${earlier.year}`
            : ""
        }. ${
          latest.subject.startsWith(latest.winner.split(" · ")[1] ?? "\u0000")
            ? `He carried the state.`
            : `${latest.winner.split(" · ")[1] ?? latest.winner} of the ${latest.winner.split(" · ")[0]} carried the state.`
        }`
      : `${f.state}: no run for ${who} in the record.`;
    const reading = f.history.map(
      (row) =>
        `${row.year}: ${row.share !== null ? `${row.subject} ${fmtPct(row.share)}` : `${who} did not stand`}; carried by ${row.winner} on ${fmtPct(row.winner_share)}${
          row.turnout !== null ? `, turnout ${fmtPct(row.turnout)}` : ""
        }.`
    );
    const plan = [];
    if (f.lgas?.top?.length) {
      reading.push(`Strongest local governments in 2023: ${listOf(f.lgas.top.slice(0, 5).map((entry) => shareOf(entry, f.state)), 5)}.`);
      reading.push(`Carried ${fmtInt(f.lgas.carried)} of ${fmtInt(f.lgas.read)} local governments in 2023.`);
    }
    if (latest && latest.share < 25) {
      plan.push(`Below 25% here on the last result. Ask where ${who} can get 25% in ${f.state} for what each local government would take.`);
    }
    return {
      headline,
      reading,
      plan,
      method: [`Every presidential election since 1999 that published a table by state. 2007 and 2011 published national totals only.`],
      followups: [
        `Where can ${who} get 25% in ${f.state}?`,
        `Where should ${who} focus in ${f.state}?`,
        `Wards ${who} won in ${f.state}`,
      ],
    };
  }

  const where = `${f.place}${f.lga && f.level !== "lga" ? `, ${f.lga}` : ""}, ${f.state}`;
  const headline =
    f.share23 !== null
      ? `${where}: ${who} ${fmtPct(f.share23)} in 2023${f.share19 !== null ? `, from ${fmtPct(f.share19)} in 2019` : ""}${
          f.won23 === null ? "" : f.won23 ? " — carried" : " — not carried"
        }.`
      : `${where}: no readable result for 2023.`;
  return {
    headline,
    reading: [
      `${f.state} as a whole, counted: ${fmtPct(f.stateShare23)} for ${who} in 2023.`,
      `${fmtInt(f.registered)} registered voters, ${fmtPct(f.turnout)} turnout in 2023.`,
    ],
    plan: [],
    method: [],
    followups: [`Where can ${who} get 25% in ${f.state}?`, `Where should ${who} focus in ${f.state}?`],
  };
}

/* ══════════════════════════════════════════════════════════════ scenario */

function scenario(result) {
  const [first] = result.sections;
  const f = first.facts;
  const who = result.whoName;
  const person = { PDP: "Atiku", APC: "Tinubu", LP: "Obi", NNPP: "Kwankwaso" };
  const moves = Object.entries(f.swing).map(
    ([id, n]) => `${person[id] ?? `the ${id}`} ${n > 0 ? "gains" : "loses"} ${Math.abs(n)} ${Math.abs(n) === 1 ? "point" : "points"}`
  );
  const turnoutMove = f.turnout !== 1 ? `turnout ${f.turnout > 1 ? "rises" : "falls"} ${fmtInt(Math.abs(f.turnout - 1) * 100)}%` : null;
  const premise = moves.length
    ? `If ${listOf(moves)}${turnoutMove ? ` and ${turnoutMove}` : ""}`
    : turnoutMove
      ? `If ${turnoutMove} and every party keeps its 2023 share`
      : "On the 2023 result as it stands";

  /* ── ONE STATE ────────────────────────────────────────────────────────
     A contest read in one state is decided there: who carries it. Turnout on
     its own moves no share — every party's vote grows by the same measure —
     so what decides it is who the new voters choose. */
  if (f.single) {
    const s1 = f.single;
    const carries = s1.winner === f.party;
    return {
      headline: `${premise}, ${carries ? `${who} carries ${s1.name}` : `${s1.name} still goes to the ${s1.winner}, on ${fmtPct(s1.winnerShare)}; ${who} takes ${fmtPct(f.share)}`}${
        f.turnout !== 1 && !moves.length ? ` — the order does not change, because turnout alone moves every party's vote by the same measure` : ""
      }.`,
      reading: [
        `${who} in ${s1.name}: ${fmtInt(s1.votesBefore)} votes in 2023, ${fmtInt(f.votes)} on this projection.`,
        ...(s1.extraVoters > 0
          ? [
              `The extra turnout is about ${fmtInt(s1.extraVoters)} voters. ${
                carries
                  ? `${who} leads on the projection.`
                  : s1.needOfExtra !== null && s1.needOfExtra <= 100
                    ? `To carry ${s1.name}, ${who} would need about ${fmtPct(s1.needOfExtra)} of them, with nobody else's voters moving.`
                    : `Even all of them would not close the gap to the ${s1.winner}; ${who} needs voters won over as well as new ones.`
              }`,
            ]
          : []),
        ...(s1.gap > 0 ? [`The gap to the ${s1.winner} on this projection: ${fmtInt(s1.gap)} votes.`] : []),
      ],
      plan: [],
      method: [
        `Every party's 2023 share in ${s1.name}${moves.length ? ", moved by the swing," : ""} applied to ${f.turnout !== 1 ? `a turnout ${f.turnout > 1 ? "raised" : "cut"} by ${fmtInt(Math.abs(f.turnout - 1) * 100)}%` : "the 2023 turnout"}.`,
        `A projection measures the size of the task, not the result.`,
      ],
      followups: [`Where should ${who} focus in ${s1.name}?`, `Chances of ${who} winning 2027 in ${s1.name}`, `Biggest polling units in ${s1.name}`],
    };
  }

  const spread = f.spreadApplies
    ? f.shortBy
      ? `clears 25% in ${f.quarterStates} states, ${f.shortBy} short of Section 134's 24`
      : `clears 25% in ${f.quarterStates} states, enough for Section 134${f.quarterFct ? " with the FCT as well" : " on the 36 states, though not the FCT"}`
    : `wins on the plurality alone, which is what decides a contest in one state`;
  const subject = moves.some((move) => move.startsWith(`${who} `)) ? "he" : who;
  if (f.regional) {
    const r = f.regional;
    return {
      headline: `${premise}, ${subject} carries ${fmtInt(r.carried)} of ${r.place}'s ${placesOf(result, r.states, "state")} and clears 25% in ${fmtInt(r.quarter)} of its states; nationally that is 25% in ${f.quarterStates} states, against the 24 Section 134 asks for.`,
      reading: [
        `Nationally: ${fmtPct(f.share)} of the vote, ${f.states} states carried, ${f.leads ? "first on the count" : `behind the ${f.leader.id} on ${fmtPct(f.leader.share)}`}.`,
        ...(f.flipped.length ? [`States in ${r.place} that change hands to ${who}: ${listOf(f.flipped, 8)}.`] : []),
      ],
      plan: [],
      method: [
        `The swing is applied to the whole country, as a presidential swing would be, and ${r.place}'s states are shown. Each party's swing is added to its 2023 share and the shares are scaled back to 100.`,
        `A uniform swing is a planning instrument: the same move everywhere, which no campaign gets.`,
      ],
      followups: [`List of states in ${r.place} Atiku can get 25%`, `Where should Atiku focus in ${r.place}?`],
    };
  }
  const headline = `${premise}, ${subject} ${spread}, and ${f.leads ? "leads the national count" : `still trails the ${f.leader.id} nationally, ${fmtPct(f.share)} to ${fmtPct(f.leader.share)}`}.`;

  return {
    headline,
    reading: [
      `Projected: ${fmtPct(f.share)} of the vote, ${fmtInt(f.votes)} votes, ${f.states} states carried.`,
      ...(f.flipped.length ? [`States that change hands to ${who}: ${listOf(f.flipped, 8)}.`] : []),
    ],
    plan: f.spreadApplies && f.shortBy
      ? [`Winning the count is not the whole test. Plan the spread in the same breath: the states nearest 25% are on the reach list.`]
      : [],
    method: [
      `Each party's swing is added to its 2023 share in every state and the shares are scaled back to 100. Turnout is the 2023 turnout${f.turnout !== 1 ? ` times ${f.turnout}` : ""}.`,
      `A uniform swing is a planning instrument: the same move everywhere, which no campaign gets. It shows the shape of the task, not a forecast.`,
    ],
    followups: [`What if ${who} gains 8 points?`, `List of states ${who} can get 25%`],
  };
}

/* ══════════════════════════════════════════════════════════════ national */

/** What the state-by-state table says: who carried how many, and the closest. */
function byStateReading(result) {
  const t = result.sections.find((section) => section.facts?.kind === "results")?.facts;
  if (!t) return [];
  return [
    `States carried: ${listOf(t.carried.map((entry) => `${entry.party} ${fmtInt(entry.states)}`), 8)}.`,
    `Closest states: ${listOf(t.closest.map((entry) => `${entry.name} (${entry.winner} over the ${entry.runnerUp} by ${fmtPts(entry.margin).replace("+", "")}, ${fmtInt(entry.votes)} votes)`), 5)}.`,
    `Widest: ${listOf(t.widest.map((entry) => `${entry.name} (${entry.winner}, ${fmtPts(entry.margin).replace("+", "")})`), 5)}.`,
  ];
}

function national(result) {
  const f = result.sections[0].facts;
  const [first, second, third] = f.rows;
  if (f.regional) {
    return {
      headline: `${cap(f.place)}, ${f.year}: ${first.candidate} of the ${first.party} led with ${fmtInt(first.votes)} votes, ${fmtPct(first.share)}, and carried ${first.carried} of its ${f.states} states${
        second ? `; ${second.candidate} (${second.party}) was second on ${fmtPct(second.share)}` : ""
      }.`,
      reading: [
        ...f.rows.slice(0, 4).map(
          (row) => `${row.candidate} (${row.party}): ${fmtInt(row.votes)} votes, ${fmtPct(row.share)}; carried ${fmtInt(row.carried)} of ${f.states} states, 25% or more in ${fmtInt(row.quarter)}.`
        ),
        ...byStateReading(result),
      ],
      plan: [],
      method: [`Summed from the declared results of ${f.place}'s ${f.states} states.`],
      followups: [`List of states in ${f.place} Atiku can get 25%`, `atiku vs tinubu in ${f.place}`],
    };
  }
  const t = result.sections.find((section) => section.facts?.kind === "results")?.facts;
  if (result.plan.focus === "count" && t?.carried?.length) {
    const most = t.carried[0].states;
    const tied = t.carried.filter((entry) => entry.states === most).map((entry) => entry.party);
    return {
      headline:
        tied.length > 1
          ? `In ${f.year}, ${listOf(tied)} carried ${fmtInt(most)} states each${t.carried.length > tied.length ? `, then ${listOf(t.carried.filter((entry) => entry.states < most).map((entry) => `the ${entry.party} ${fmtInt(entry.states)}`))}` : ""}; the ${first.party} won the election on votes, ${fmtInt(first.votes)}.`
          : `The ${tied[0]} carried the most states in ${f.year}: ${fmtInt(most)}${t.carried.length > 1 ? `, then ${listOf(t.carried.slice(1).map((entry) => `the ${entry.party} ${fmtInt(entry.states)}`))}` : ""}.`,
      reading: [`The count of states includes the FCT where it was carried.`, ...byStateReading(result).slice(1)],
      plan: [],
      method: ["Carried means first on the declared vote in the state."],
      followups: [`Who won the ${f.year} presidential election?`, "Swing states in 2023", "List of states Atiku can get 25%"],
    };
  }
  return {
    headline: `${f.year}: ${first.candidate} of the ${first.party} won with ${fmtInt(first.votes)} votes, ${fmtPct(first.share)}${
      second ? `, ahead of ${second.candidate} (${second.party}) on ${fmtPct(second.share)}` : ""
    }.`,
    reading: [
      ...f.rows.slice(0, 4).map(
        (row) =>
          `${row.candidate} (${row.party}): ${fmtInt(row.votes)} votes, ${fmtPct(row.share)}${
            f.stateLevel ? `; carried ${count(row.carried, "state")}, 25% or more in ${fmtInt(row.quarter)} of 36` : ""
          }.`
      ),
      ...(third && second ? [`The margin: ${fmtInt(first.votes - second.votes)} votes between first and second.`] : []),
      ...(f.stateLevel ? [] : [`${f.year} published national totals only, so there is no state table for it.`]),
      ...byStateReading(result),
    ],
    plan: [],
    method: [f.year === 2023 ? "INEC's declared national totals. The state table sums a few hundred votes higher; the declared figure is the one printed." : "The declared national totals."],
    followups: [`List of states Atiku can get 25%`, `What does Atiku need to win?`, `Which states did ${first.candidate.split(" ").pop()} win?`],
  };
}

/* ══════════════════════════════════════════════════════════════ versus */

function versus(result) {
  const f = result.sections[0].facts;
  if (f.kind === "versus-state") {
    const latest = f.rows[0];
    return {
      headline: `${f.place}, ${latest.name}: ${latest.ahead} ahead — ${f.nameA} ${fmtPct(latest.a)}, ${f.nameB} ${fmtPct(latest.b)}, ${fmtInt(Math.abs(latest.votes_a - latest.votes_b))} votes apart.`,
      reading: f.rows.map((row) => `${row.name}: ${f.nameA} ${fmtPct(row.a)} (${fmtInt(row.votes_a)}), ${f.nameB} ${fmtPct(row.b)} (${fmtInt(row.votes_b)}).`),
      plan: [],
      method: ["Each candidate's share of the valid vote, from the declared results, in every election both stood."],
      followups: [`Where can ${f.nameA} get 25% in ${f.place}?`, `Where should ${f.nameA} focus in ${f.place}?`],
    };
  }
  const where = result.scope.national ? "the 36 states and the FCT" : result.scope.name;
  return {
    headline: `${f.year}, ${where}: ${f.nameB} ahead in ${fmtInt(f.aheadB)}, ${f.nameA} in ${fmtInt(f.aheadA)}; ${f.nameA} ${fmtInt(f.votesA)} votes to ${f.nameB}'s ${fmtInt(f.votesB)}.`,
    reading: [
      `Closest: ${listOf(f.closest.map((entry) => `${entry.name} (${fmtPct(entry.a)} to ${fmtPct(entry.b)})`), 5)}.`,
      `Widest for ${f.nameA}: ${listOf(f.bestA.map((entry) => `${entry.name} by ${fmtPts(entry.gap).replace("+", "")}`), 3)}.`,
      `Widest for ${f.nameB}: ${listOf(f.bestB.map((entry) => `${entry.name} by ${fmtPts(Math.abs(entry.gap)).replace("+", "")}`), 3)}.`,
    ],
    plan: [`The closest states are where a small move changes who is ahead — the top of any shared target list.`],
    method: ["Each candidate's share of the valid vote, from the declared results. \"Ahead by\" is the first less the second."],
    followups: [`Where can ${f.nameA} get 25%?`, `What does ${f.nameA} need to win?`],
  };
}

/* ══════════════════════════════════════════════════════════════ outlook */

/**
 * The path to the next election, written as a campaign brief: where he
 * stands on each test, what swing would close them against how far he has
 * actually moved, and where — state, local government, ward and polling unit
 * — the distance is covered.
 */
/** The first `n` of a ranked list, one per state before any state gets a second. */
function varied(list, n) {
  const seen = new Set();
  const first = [];
  const rest = [];
  for (const entry of list) {
    if (!seen.has(entry.state)) {
      seen.add(entry.state);
      first.push(entry);
    } else rest.push(entry);
  }
  return [...first, ...rest].slice(0, n);
}

function outlook(result) {
  const f = result.sections[0].facts;
  /* The places to name first come from the priority order, not the head of
     the tables — those are arranged state by state, so their first rows are
     all one state's. */
  const lgas = varied(f.lgas, 6);
  const wards = varied(f.wards, 6);
  const units = varied(f.units, 5);
  const who = f.who;
  const name = (list, n = 10) => listOf(list.slice(0, n).map((entry) => entry.name), n);
  const behind = f.gap > 0;
  const short = Math.max(0, 24 - f.quarter);

  const swingLine =
    f.swingBoth === null
      ? "no uniform swing under 30 points closes both tests"
      : `a uniform swing of about ${f.swingBoth} points would close both${f.swingSpread !== null && f.swingSpread < f.swingBoth ? ` (${f.swingSpread} points closes the spread alone)` : ""}`;

  const national = f.leads
    ? `${who} goes into the next election as the one to beat — first on the count by ${fmtInt(f.mine - f.runnerUpVotes)} votes over the ${f.runnerUpId}, and 25% in ${f.quarter} of the 36 states${
        short ? `, ${short} short of the 24` : ""
      }; ${f.swingToLose === null ? "no uniform swing under 30 points to a single challenger takes the lead away" : `a uniform swing of about ${f.swingToLose} points to the ${f.runnerUpId} would take the lead away`}${
        f.moved !== null ? `; ${f.moved >= 0 ? "his share rose" : "his share moved"} ${fmtPts(f.moved)} between ${f.prev} and ${f.year}` : ""
      }`
    : `${who} goes into the next election ${behind ? `${fmtInt(f.gap)} votes behind the ${f.leaderId}` : "level with the leader"} and ${
        short ? `${short} ${short === 1 ? "state" : "states"} short of the 24 at 25%` : "with the spread met"
      } — ${swingLine}${f.moved !== null ? `, against a change of ${fmtPts(f.moved)} between ${f.prev} and ${f.year}` : ""}`;
  const sf = f.stateFocus;
  const rf = f.regionFocus;
  const headline = rf
    ? `In ${rf.place}, ${who} carried ${fmtInt(rf.carried)} of ${placesOf(result, rf.states, "state")} in ${f.year} and took 25% in ${fmtInt(rf.quarter)}${
        rf.targets.length ? `; within reach: ${listOf(rf.targets, 6)}` : ""
      }. Nationally, ${national.replace(`${who} goes`, "he goes")}.`
    : sf
    ? `In ${sf.name}, ${who} took ${fmtPct(sf.share)} in ${f.year}${sf.carried ? `, carrying it by ${fmtPts(sf.lead).replace("+", "")}` : `, ${fmtPts(Math.abs(sf.lead)).replace("+", "")} behind the ${sf.winner}`}${
        sf.carried ? "" : sf.toLead ? ` — ${fmtInt(sf.toLead)} votes short of the lead` : ""
      }${sf.share < 25 && sf.toQuarter ? ` and ${fmtInt(sf.toQuarter)} short of 25%` : ""}; its role on the path: ${sf.roleLabel.toLowerCase()}. Nationally, ${national.replace(`${who} goes`, "he goes")}.`
    : `On the record, not by guess: ${national}.`;

  const reading = [
    ...(f.regional
      ? [`The two tests are national; the roles and focus lists below are ${f.place}'s ${sf ? "local governments, wards and polling units" : "states and places"}.`]
      : []),
    ...(sf && sf.sharePrev !== null && sf.sharePrev !== undefined ? [`${sf.name}, ${f.prev} to ${f.year}: ${fmtPct(sf.sharePrev)} to ${fmtPct(sf.share)}.`] : []),
    `The count, ${f.year}: ${fmtInt(f.mine)} votes, ${fmtPct(f.shareNow)}, against the ${f.leaderId}'s ${fmtInt(f.leaderVotes)}, ${fmtPct(f.leaderShare)}${
      f.sharePrevNational !== null ? `; in ${f.prev} he took ${fmtPct(f.sharePrevNational)}` : ""
    }.`,
    `The spread: 25% in ${f.quarter} of the 36 states in ${f.year}${f.quarterPrev !== null ? `, from ${f.quarterPrev} in ${f.prev}` : ""}. Section 134 asks for 24.`,
    ...(f.cheapestQuarter.length && short
      ? [`The cheapest states${f.regional ? ` in ${f.place}` : ""} to lift over 25%: ${listOf(f.cheapestQuarter.slice(0, short + 2).map((entry) => `${entry.name} (${fmtInt(entry.toQuarter)} votes)`), short + 2)}.`]
      : []),
    `Base — hold (${f.roles.base.length}): ${name(f.roles.base, 12)}.`,
    `Defend — carried narrowly or just over 25% (${f.roles.defend.length}): ${name(f.roles.defend, 12)}.`,
    `Target — close enough to win or to reach 25% (${f.roles.target.length}): ${listOf(
      f.roles.target.slice(0, 10).map((entry) => `${entry.name}${entry.toLead ? ` (${fmtInt(entry.toLead)} votes to lead)` : entry.toQuarter ? ` (${fmtInt(entry.toQuarter)} to 25%)` : ""}`),
      10
    )}.`,
    `Out of reach on the last result (${f.roles.out.length}): ${name(f.roles.out, 12)}.`,
    `Local governments to focus on first: ${listOf(lgas.map((entry) => `${entry.name} (${entry.state})`), 6)}.`,
    `Wards: ${listOf(wards.map((entry) => `${entry.name} (${entry.lga}, ${entry.state})`), 6)}.`,
    `Polling units: ${listOf(units.map((entry) => `${entry.name} [${entry.code}] in ${entry.lga}, ${entry.state} — ${fmtInt(entry.registered)} registered, ${fmtInt(entry.home)} stayed home`), 5)}.`,
    `Every list is capped per state, so the focus is spread across the states on the path rather than piled into one; the full lists are in the tables and the files.`,
  ];

  const plan = [
    `Hold the ${f.roles.base.length} base states first: every polling unit covered, every result sheet watched. The path starts from not losing what was won.`,
    `Defend the ${f.roles.defend.length} won narrowly or just over 25% — they carry the spread already and can go back.`,
    short && f.regional && f.cheapestQuarter.length < short
      ? `Close the spread: ${short} more ${short === 1 ? "state" : "states"} over 25% are needed nationally, and ${f.place} has ${f.cheapestQuarter.length} under the line — ${listOf(f.cheapestQuarter.map((entry) => `${entry.name} (${fmtInt(entry.toQuarter)} votes)`), 6)}. The rest have to come from elsewhere.`
      : short && f.regional && f.cheapestQuarter.length === short
      ? `Close the spread: ${short} more ${short === 1 ? "state" : "states"} over 25% are needed nationally, and ${f.place} has exactly ${short} under the line — ${listOf(f.cheapestQuarter.map((entry) => `${entry.name} (${fmtInt(entry.toQuarter)} votes)`), 6)}. Every one of them would be needed, with no margin.`
      : short
      ? `Close the spread: ${short} more ${short === 1 ? "state" : "states"} over 25% are needed. The cheapest ${short + 1} — one more than needed, for margin — are ${listOf(f.cheapestQuarter.slice(0, short + 1).map((entry) => entry.name), short + 1)}: ${fmtInt(f.cheapestQuarter.slice(0, short + 1).reduce((sum, entry) => sum + (entry.toQuarter ?? 0), 0))} votes between them on the last turnout.`
      : `Keep the spread: it was met on the last result; guard the states nearest 25%.`,
    f.leads
      ? `Guard the lead where it was made: the base states' turnout is the margin, and the ${f.runnerUpId}'s best states are where it is contested.`
      : behind
      ? `Close the count where the voters are: the ${fmtInt(f.stayedHomeUnits)} registered voters who stayed home in the top 100 polling units alone are ${fmtPct((f.stayedHomeUnits / f.gap) * 100)} of the gap. Turnout in the focus list is the cheapest vote there is.`
      : `Hold the count: turnout in the base is the lead.`,
  ];

  return {
    headline,
    reading,
    plan,
    method: [
      "Poll360 does not put a percentage on a chance: nothing in the record says how the next campaign will go. What it measures is the distance — on the two tests Section 134 sets — and where it can be covered.",
      "The swing is uniform: the same move added to the 2023 share in every state, shares scaled back to 100, the product's own projection. No campaign gets a uniform swing; it measures the size of the task.",
      "State figures are INEC's declared results. Local governments, wards and polling units are estimated below the state; the focus lists rank them by register, turnout and how close the contest was.",
      ...(result.who?.kind === "candidate"
        ? [`Measured on ${who}'s ${f.year} vote as the ${f.party} candidate. Standing for a different party does not carry that vote with it automatically.`]
        : []),
    ],
    followups: [`Where can ${who} get 25%?`, `The 60,000 biggest polling units`, `Research ${who}`],
  };
}

/* ══════════════════════════════════════════════════════════════ ground */

const millions = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} million` : fmtInt(n));

function ground(result) {
  const f = result.sections[0].facts;
  const words = LEVEL_WORDS[f.level];
  const where = result.scope.national ? "Nigeria" : result.scope.name;
  const registerShare = (f.registerSet / (f.registerAll || 1)) * 100;
  const placeShare = (f.size / (f.places || 1)) * 100;
  const byRegister = f.measure === "registered" || (f.measure === "density" && f.level === "unit");

  const headline = byRegister
    ? `The ${fmtInt(f.size)} biggest ${words.many} in ${where} hold ${millions(f.registerSet)} of its ${millions(f.registerAll)} registered voters — ${fmtPct(registerShare)} of the register in ${fmtPct(placeShare)} of the ${words.many}; every one has at least ${fmtInt(f.threshold)}.`
    : f.measure === "turnout"
      ? `The ${fmtInt(f.size)} ${words.many} in ${where} with the highest turnout in 2023 all reached ${fmtPct(f.threshold)} or more, against ${fmtPct(f.turnoutRest)} across the rest; between them they hold ${millions(f.registerSet)} registered voters.`
      : `The ${fmtInt(f.size)} densest ${words.many} in ${where} average ${fmtInt(f.registerSet / Math.max(1, f.size))} voters and have at least ${fmtInt(f.threshold)} voters per polling unit — the places where one agent covers the most people.`;

  const reading = [
    `Where they are, by zone: ${listOf(f.byZone.map(([zone, n]) => `${zone} ${fmtInt(n)}`), 6)}.`,
    `Most of them: ${listOf(f.byState.slice(0, 6).map(([state, n]) => `${state} ${fmtInt(n)}`), 6)}.`,
    `Size: ${fmtInt(f.averageSet)} registered voters on average in the set, against ${fmtInt(f.averageAll)} across all ${fmtInt(f.places)} ${words.many}.`,
    `Turnout in 2023: ${fmtPct(f.turnoutSet)} in the set, ${fmtPct(f.turnoutRest)} outside it${
      f.turnoutSet !== null && f.turnoutRest !== null
        ? f.turnoutSet < f.turnoutRest - 1
          ? " — the biggest places vote least, so the votes left unclaimed are concentrated there"
          : f.turnoutSet > f.turnoutRest + 1
            ? " — the biggest places also turn out more"
            : ""
        : ""
    }.`,
    `${f.measure === "turnout" ? "Highest turnout" : f.measure === "density" && f.level !== "unit" ? "Densest" : "The largest"}: ${listOf(
      f.top.slice(0, 5).map((row) => {
        const figure = f.measure === "turnout" ? fmtPct(row.turnout) : f.measure === "density" && f.level !== "unit" ? `${fmtInt(row.density)} per unit` : fmtInt(row.registered);
        const code = f.level === "unit" && row.code ? ` [${row.code}]` : "";
        return `${row.name}${code}${row.lga && f.level !== "lga" ? `, ${row.lga}` : ""} (${row.state}) ${figure}`;
      }),
      5
    )}.`,
  ];
  if (f.overCount) {
    reading.push(`${fmtInt(f.overCount)} ${f.overCount === 1 ? words.one : words.many} whose estimated votes exceed their estimated register are left out — an artefact of the estimate below the state, not a finding.`);
  }
  if (f.turnoutFloor !== null && f.turnoutFloor !== undefined) {
    reading.push(`Only ${words.many} with at least ${fmtInt(f.turnoutFloor)} registered voters are ranked by turnout; below that a handful of votes swings it to 100%.`);
  }
  if (f.atiku) {
    reading.push(
      `Atiku in these ${words.many}, 2023: ${fmtInt(f.atiku.votesIn)} votes, ${fmtPct(f.atiku.share)} of the votes cast in them — ${fmtPct((f.atiku.votesIn / (f.atiku.votesAll || 1)) * 100)} of all his votes in ${where}.`
    );
  }
  const plan = [
    `Cover these first on the day: an agent at each of the ${fmtInt(f.size)} watches ${fmtPct(registerShare)} of the register.`,
  ];
  if (f.turnoutSet !== null && f.turnoutRest !== null && f.turnoutSet < f.turnoutRest - 1) {
    plan.push(`Low turnout in the biggest ${words.many} is the cheapest vote there is: the voters are registered and close together, and most of them stayed home.`);
  }

  return {
    headline,
    reading,
    plan,
    method: [
      f.level === "state"
        ? "State registers are INEC's."
        : `Below the state, each ${words.one}'s register and turnout are estimated: the declared state totals spread across the real ${words.many} inside it. The ranking is right about the shape of a state and an estimate for any one named ${words.one}.`,
      `The set is the ${fmtInt(f.size)} ${words.many} ranked highest by ${f.measureLabel}, out of ${fmtInt(f.places)}.`,
    ],
    followups: [
      `The ${fmtInt(f.size)} biggest ${words.many} in the North`,
      `${cap(words.many)} with the highest turnout in Kano`,
      `Densest wards in Lagos`,
    ],
  };
}

/* ══════════════════════════════════════════════════════════════ research */

function research(result) {
  const f = result.sections[0].facts;
  const runs = f.runs;
  const person = f.candidate;
  const who = f.short;
  const runWords = runs.map((run) => `${run.year} (${person ? run.party : run.candidate})`);
  const wins = runs.filter((run) => run.won);
  const reading = [];
  const plan = [];

  const headline = person
    ? `${f.long} has stood for president ${runs.length === 1 ? "once" : `${fmtInt(runs.length)} times`} — ${listOf(runWords, 8)} — and ${
        wins.length ? `won ${wins.length === runs.length ? (runs.length === 1 ? "it" : "every one") : `${fmtInt(wins.length)}`}` : runs.length === 1 ? "lost" : "lost each"
      }; ${runs.length > 1 ? `his best was ${f.best.year}, ${fmtPct(f.best.share)} and ${fmtInt(f.best.votes)} votes` : `${fmtPct(f.best.share)} and ${fmtInt(f.best.votes)} votes`}.`
    : `The ${f.long} has put up a presidential candidate ${fmtInt(runs.length)} times since ${runs[0].year}, winning ${fmtInt(wins.length)}; its best was ${f.best.year}, ${fmtPct(f.best.share)}.`;

  for (const run of runs) {
    reading.push(
      `${run.year}: ${person ? `${run.partyName} (${run.party})` : run.candidate} — ${fmtInt(run.votes)} votes, ${fmtPct(run.share)}, ${run.won ? "won" : `${ordinalWord(run.place)}${run.winner ? `; won by ${run.winner}` : ""}`}${
        run.stateLevel ? `. Carried ${fmtInt(run.carried)} states; 25% or more in ${fmtInt(run.quarter)} of 36` : ". No state table that year"
      }.`
    );
  }
  if (person && f.parties.length > 1) {
    reading.push(`Parties: ${listOf(f.parties, 6)} — ${fmtInt(f.parties.length)} across ${fmtInt(runs.length)} runs.`);
  }
  if (f.always.length) {
    reading.push(`Carried in every run with a state table (${f.mappedYears.join(", ")}): ${listOf(f.always.map((entry) => entry.name), 12)}.`);
  } else if (f.mappedYears.length >= 2) {
    reading.push(`No state was carried in every run with a state table (${f.mappedYears.join(", ")}).`);
  }
  if (f.strongest.length) {
    reading.push(`Strongest on average across those runs: ${listOf(f.strongest.slice(0, 5).map((entry) => `${entry.name} ${fmtPct(entry.average)}`), 5)}.`);
  }
  if (f.weakest.length) {
    reading.push(`Weakest: ${listOf(f.weakest.map((entry) => `${entry.name} ${fmtPct(entry.average)}`), 5)}.`);
  }
  if (f.firstMapped && f.gained.length) {
    reading.push(
      `Between ${f.firstMapped} and ${f.latestMapped} the biggest gains were ${listOf(f.gained.slice(0, 3).map((entry) => `${entry.name} (${fmtPts(entry.change)})`), 3)}; the biggest falls ${listOf(f.lost.slice(0, 3).map((entry) => `${entry.name} (${fmtPts(entry.change)})`), 3)}.`
    );
  }
  if (f.governorships.length) {
    reading.push(`Governorships won in the record: ${listOf(f.governorships.map((row) => `${row.label} (${row.party})`), 6)}.`);
  }
  if (f.always.length) {
    plan.push(`The states carried every time are ${who}'s base: they are where a campaign starts, and where a lost polling unit costs most.`);
  }
  if (f.latestMapped && f.latest?.quarter !== null && f.latest?.quarter !== undefined && f.latest.quarter < 24 && !f.latest.won) {
    plan.push(`On the last run the spread was ${f.latest.quarter} of the 24 states Section 134 asks for. Ask where ${who} can get 25% for the states nearest the line.`);
  }

  return {
    headline,
    reading,
    plan,
    method: [
      "INEC's declared results: national totals for every presidential election since 1999, and state tables for every year that published one (2007 and 2011 did not).",
      "Shares are of the valid vote. A candidate is followed across the parties they stood for; a party across the candidates it put up.",
      "Governorships since 2023 are off-cycle and name the winner only.",
    ],
    followups: person
      ? [`Where can ${who} get 25%?`, `${who} vs ${runs[runs.length - 1].won ? "Atiku" : "Tinubu"}`, `Where should ${who} focus in the North Central?`]
      : [`Research Atiku`, `Research Peter Obi`],
  };
}

function unknownAspirant(name) {
  return {
    headline: `${name} has not stood for president in the record, 1999 to 2023, and has no governorship win in it since 2023.`,
    reading: [
      "Poll360's record holds every presidential election since 1999 and the off-cycle governorships since 2023. An aspirant who has not stood in one has no results of their own to research.",
      "What the record can still answer for a first-time aspirant is the ground: where their party ran strongest, which states and zones are close, and where the biggest polling units are.",
    ],
    plan: [],
    method: [],
    followups: ["How strong is the ADC in the North West?", "The 60,000 biggest polling units", "Research Atiku"],
  };
}

/* ══════════════════════════════════════════════════════════════ help */

function help() {
  return {
    headline: "Ask Poll360 answers election analytics and planning questions, from the declared results and the party's register.",
    reading: [
      "Where a candidate can reach 25% — by state, local government, ward or polling unit — and what it would take.",
      "Where a candidate won, lost, or ran close; strongholds; turnout; the biggest places.",
      "Where to focus next; what a swing would do; what it takes to win under Section 134.",
      "How strong a party is in a region, from its vote or its member register.",
      "A candidate's chances and plan for the next election — nationally, in a region or in one state — with every state, local government, ward and polling unit in the order to work them.",
      "How every state voted in any election from 1999; any aspirant's or party's record; who governs each state.",
      "What a coalition adds up to on the declared votes, and what the Constitution asks of a winner.",
    ],
    plan: [],
    method: [],
    followups: ["Chances of Atiku winning 2027", "Can Atiku win if Obi joins him?", "Which states can Atiku flip in 2027?"],
  };
}

/* ══════════════════════════════════════════════════════════════ strength */

function strength(result) {
  const vote = result.sections.find((section) => section.facts.kind === "strength-vote")?.facts ?? null;
  const register = result.sections.find((section) => section.facts.kind === "strength-register")?.facts ?? null;
  const party = result.partyId;
  const where = result.scope.name;
  const reading = [];
  const plan = [];
  const words = register ? LEVEL_WORDS[register.level] : null;
  const named = (entry) => `${entry.name}${entry.state && entry.state !== entry.name && register?.level !== "state" && entry.state !== where ? ` (${entry.state})` : ""}`;

  let headline;

  /* ── WHERE THE PARTY IS WEAK ON ITS REGISTER ───────────────────────── */
  if (register?.weakFirst && !register.against) {
    const weakest = register.weakest[0];
    headline = register.empty
      ? `In ${where}, the ${party} has nobody on its register in ${count(register.empty, register.level)}, and ${fmtInt(register.thin)} of ${fmtInt(register.places)} ${words.many} are thin or bare.`
      : `The ${party} is weakest on its register in ${named(weakest)}: ${fmtInt(weakest.members)} members${
          weakest.perThousand !== null ? `, ${fmtInt(weakest.perThousand)} for every 1,000 registered voters` : ""
        }.`;
    if (register.emptyNames.length) {
      reading.push(`No members at all: ${listOf(register.emptyNames, 8)}.`);
    }
    reading.push(
      `Thinnest on the register${register.perThousand !== null ? ", per 1,000 registered voters" : ""}: ${listOf(
        register.weakest.map((entry) => `${named(entry)} ${entry.perThousand !== null ? `${fmtInt(entry.perThousand)} per 1,000` : `${fmtInt(entry.members)} members`}`),
        6
      )}.`
    );
    if (register.perThousand !== null) {
      reading.push(`Across ${where} as a whole: ${fmtInt(register.perThousand)} members per 1,000 registered voters, ${fmtInt(register.members)} in all.`);
    }
    plan.push(
      `Recruit before you mobilise here: a ${words.one} with no structure cannot deliver agents, turnout or a watched result sheet on the day.`
    );
    plan.push(`Start with the ${words.many} at the top of the list, and match each to the nearest ${words.one} where the register is heavy — that is where the organisers are.`);
  } else if (register?.strongFirst && !register.against) {
    const best = register.strongest[0];
    headline = `The ${party} is strongest on its register in ${named(best)}: ${fmtInt(best.members)} members${
      best.perThousand !== null ? `, ${fmtInt(best.perThousand)} for every 1,000 registered voters` : ""
    }.`;
    reading.push(
      `Densest on the register${register.perThousand !== null ? ", per 1,000 registered voters" : ""}: ${listOf(
        register.strongest.map((entry) => `${named(entry)} ${entry.perThousand !== null ? `${fmtInt(entry.perThousand)} per 1,000` : `${fmtInt(entry.members)} members`}`),
        6
      )}.`
    );
    if (register.perThousand !== null) reading.push(`Across ${where} as a whole: ${fmtInt(register.perThousand)} per 1,000, ${fmtInt(register.members)} members in all.`);
    plan.push(`Where the register is densest, the organisers already exist: base coordinators there and send them into the thin places nearby.`);
  } else if (register?.against) {
    const q = register.quadrants;
    headline = `Set against Atiku's 2023 vote, the ${party} register in ${where} lines up in ${fmtInt(q.both + q.neither)} of ${count(register.places, register.level)}: in ${fmtInt(q.organised)} it is organised where he polled little, and in ${fmtInt(q.voting)} he polled well where it is thin.`;
    reading.push(
      `Organised and voting (${fmtInt(q.both)}), organised but not voting (${fmtInt(q.organised)}), voting but not organised (${fmtInt(q.voting)}), neither yet (${fmtInt(q.neither)}). Each place is read against the middle of the ${words.many} listed, on both measures.`
    );
    if (register.organisedNotVoting.length) {
      reading.push(
        `Members, few votes: ${listOf(register.organisedNotVoting.map((entry) => `${named(entry)} (${fmtInt(entry.perThousand)} per 1,000; Atiku ${fmtPct(entry.atiku)})`), 5)}.`
      );
    }
    if (register.votingNotOrganised.length) {
      reading.push(
        `Votes, few members: ${listOf(register.votingNotOrganised.map((entry) => `${named(entry)} (Atiku ${fmtPct(entry.atiku)}; ${fmtInt(entry.perThousand)} per 1,000)`), 5)}.`
      );
    }
    plan.push(`Organised, not voting: the members are there and the vote was not. Turn the register into a turnout operation — these are the cheapest votes to find.`);
    plan.push(`Voting, not organised: the support is there with nothing under it. Recruit and appoint agents before the vote is taken for granted.`);
    plan.push(`Members are not votes. The two are set side by side and never added together.`);
  } else if (vote?.standalone) {
    const leader = vote.standings[0];
    headline = `In ${where}, the ${party} took ${fmtPct(vote.share)} of the ${vote.year} presidential vote, ${ordinalWord(vote.place)}${
      leader && leader.id !== party ? ` behind the ${leader.id} on ${fmtPct(leader.share)}` : ""
    }, and carried ${fmtInt(vote.carried)} of ${count(vote.places, vote.level)}.`;
  } else if (register) {
    headline = `The ${party} holds ${fmtInt(register.members)} members on its register in ${where}, across ${count(register.places, register.level)}${
      register.perThousand !== null ? ` — ${fmtInt(register.perThousand)} for every 1,000 registered voters` : ""
    }.`;
  } else {
    headline = `The ${party} has no presidential column of its own in ${vote?.year ?? "the record"} for ${where}.`;
  }

  if (vote?.standalone && !register) {
    reading.push(`Strongest ${vote.level === "zone" ? "zones" : "states"}: ${listOf(vote.best.map((entry) => `${entry.name} ${fmtPct(entry.share)}`), 5)}.`);
    if (vote.worst.length) reading.push(`Weakest: ${listOf(vote.worst.map((entry) => `${entry.name} ${fmtPct(entry.share)}`), 3)}.`);
    reading.push(`At 25% or more in ${fmtInt(vote.quarter)} of ${count(vote.places, vote.level)}.`);
  }
  if (register && !register.weakFirst && !register.against && !register.strongFirst) {
    reading.push(`Heaviest on the register: ${listOf(register.top.map((entry) => `${named(entry)} ${fmtInt(entry.members)}`), 6)}.`);
    if (register.empty) reading.push(`Nobody on the register in ${listOf(register.emptyNames, 6)}.`);
    if (register.thin) {
      plan.push(`${fmtInt(register.thin)} of the ${fmtInt(register.places)} ${words.many} are thin or bare on the register: the party exists there on paper and not yet as an organisation. Ask where it is weakest for the list.`);
    }
    if (register.heavy) {
      plan.push(`${fmtInt(register.heavy)} carry more than twice their even share of members. Put coordinators there first: the people to work with are already signed up.`);
    }
  }
  if (register) {
    if (register.inecPlaces && register.places > register.inecPlaces * 1.1) {
      reading.push(
        `The register names ${fmtInt(register.places)} ${words.many} where INEC delimits ${fmtInt(register.inecPlaces)}: members wrote their ${words.one} by hand, and one place often arrives under several spellings. The member counts are right; the list of names is longer than the ground.`
      );
    }
    if (!register.against && !register.weakFirst && register.women !== null) {
      reading.push(`${fmtPct(register.women)} of members are women and ${fmtPct(register.young)} are aged 18 to 35.`);
    }
    if (!register.against && !register.weakFirst && register.minors) reading.push(`${fmtInt(register.minors)} members are under 18 and cannot vote.`);
  }

  const inWhere = where === "Nigeria" ? "" : ` in ${where}`;
  return {
    headline,
    reading,
    plan,
    method: [
      ...(register
        ? [
            `The register is the ${party}'s own membership, counted from its published state registers. Weakness is read per 1,000 registered voters where that is known, so a small place is not called weak for being small.`,
            `Strength compares each place's share of members with an even share across the places listed: "Concentration" is more than twice it, "Thin" less than half, "Under ten" fewer than ten members.`,
            ...(register.against
              ? [`Atiku's vote is his 2023 share: counted for a state, estimated for a local government. It is set beside the register and never added to it.`]
              : []),
          ]
        : [`The vote is every party's share of the valid presidential vote, from the declared results.`]),
    ],
    followups: register
      ? register.weakFirst
        ? [`Where is the ${party} strongest${inWhere}?`, `Compare ${party} membership with Atiku's vote${inWhere}`, `${party} members${inWhere || " in Kano"} by ward, weakest first`]
        : register.against
          ? [`Where is the ${party} weakest on membership${inWhere}?`, `Where should Atiku focus${inWhere}?`]
          : [`Where is the ${party} weakest on membership${inWhere}?`, `Compare ${party} membership with Atiku's vote${inWhere}`, `${party} members${inWhere || " in Kano"} by ward`]
      : [`How strong is our party${inWhere}?`, `Where should Atiku focus${inWhere}?`],
  };
}

/* ══════════════════════════════════════════════════════════════ governors */

function governor(result) {
  const [first, races] = result.sections;
  const f = first.facts;
  const seatsLine = (list) => listOf(list.map((entry) => `${entry.party} ${fmtInt(entry.count)}`), 8);
  if (f.one) {
    const g = f.one;
    const race = f.races.find((entry) => entry.stateCode === g.code);
    return {
      headline: `${own(g.name)} governor is ${g.governor}, elected under the ${g.elected} on ${g.voted_on}${
        g.current !== g.elected ? ` and sitting under the ${g.current} since ${g.moved_on}` : ""
      }.`,
      reading: [
        ...(race ? [`The last governorship election, ${race.name.split(", ")[1]}: ${race.candidate} (${race.winner}) won with ${fmtInt(race.votes)} votes, ${fmtPct(race.share)}, ${fmtInt(race.margin_votes)} ahead of the ${race.runner_up}.`] : []),
        ...(!race
          ? [`Poll360 holds the results of the governorship elections held since the 2023 general election; ${own(g.name)} ${g.voted_on.slice(0, 4)} governorship result is not in the record, only its winner.`]
          : []),
        ...(g.reported !== "—" ? [`${g.reported.replace("Reported: to", "A move to the")} has been reported but not settled, so it is not applied here.`] : []),
        `Party changes are applied only once settled; reported moves are listed apart.`,
      ],
      plan: [],
      method: ["Governors as elected, with defections applied only when settled — dated and attested — and reported ones listed apart. Verify before broadcast."],
      followups: [`Who won ${g.name} in 2023?`, `Chances of Atiku winning 2027 in ${g.name}`, `ADC membership in ${g.name}`],
    };
  }
  const now = f.seatsNow;
  const lead = now[0];
  if (f.party) {
    const p = f.party;
    const left = p.elected.filter((entry) => entry.now !== p.id);
    return {
      headline: p.now.length
        ? `The ${p.id} has ${fmtInt(p.now.length)} ${p.now.length === 1 ? "governor" : "governors"} now: ${listOf(p.now.map((entry) => `${entry.governor} (${entry.name})`), 12)}.`
        : `The ${p.id} has no sitting governor${result.scope.national ? "" : ` in ${result.scope.name}`} now${p.elected.length ? `: it won ${fmtInt(p.elected.length)} ${p.elected.length === 1 ? "governorship" : "governorships"}, and ${p.elected.length === left.length ? "every one" : fmtInt(left.length)} of those governors has since changed party` : ""}.`,
      reading: [
        ...(p.elected.length ? [`Elected under the ${p.id}: ${listOf(p.elected.map((entry) => `${entry.governor} (${entry.name}${entry.now !== p.id ? `, now ${entry.now}` : ""})`), 12)}.`] : []),
        `By party now: ${seatsLine(now)}.`,
      ],
      plan: [],
      method: ["Governors as elected, with defections applied only when settled — dated and attested — and reported ones listed apart. Verify before broadcast."],
      followups: [`Where is the ${p.id} strong?`, "Who governs each state?", "Chances of Atiku winning 2027"],
    };
  }
  return {
    headline: `${lead.party} governors hold ${fmtInt(lead.count)} of ${result.scope.national ? "the 36 states" : `${result.scope.name}'s ${placesOf(result, f.states, "state")}`}${
      f.moved.length ? `, after ${fmtInt(f.moved.length)} ${f.moved.length === 1 ? "governor" : "governors"} changed party since the elections` : ""
    }; by party now: ${seatsLine(now)}.`,
    reading: [
      `As elected: ${seatsLine(f.seatsElected)}.`,
      ...(f.moved.length ? [`Changed party: ${listOf(f.moved.map((entry) => `${entry.governor} of ${entry.name} (${entry.from} to ${entry.to}, ${entry.on})`), 10)}.`] : []),
      ...(races?.rows?.length ? [`Governorship elections since 2023: ${listOf(races.rows.slice(0, 6).map((row) => `${row.name.split(", ")[0]} — ${row.winner}, ${fmtPct(row.share)}`), 6)}.`] : []),
      ...(result.scope.national ? ["The FCT has no governor; it is run by a federal minister."] : []),
    ],
    plan: [],
    method: ["Governors as elected, with defections applied only when settled — dated and attested — and reported ones listed apart. Verify before broadcast."],
    followups: ["Which states did Atiku win in 2023?", "Where is the ADC strongest?", "Chances of Atiku winning 2027"],
  };
}

/* ══════════════════════════════════════════════════════════════ coalition */

function coalition(result) {
  const f = result.sections[0].facts;
  const names = f.partners.map((partner) => `${partner.short} (${partner.id})`);
  const together = listOf(names);
  const o = f.outside;
  const ahead = o && f.pooled > o.votes;
  const spreadMet = f.quarter >= 24;
  const r = f.regional;
  const headline = `On paper, ${together} together had ${fmtInt(f.pooled)} votes in ${f.year}, ${fmtPct(f.pooledShare)} — ${
    o ? `${ahead ? `${fmtInt(f.pooled - o.votes)} more than` : `${fmtInt(o.votes - f.pooled)} fewer than`} the ${o.id}'s ${fmtInt(o.votes)}` : "unopposed by any large party"
  } — and 25% in ${f.quarter} of the 36 states: ${ahead && spreadMet ? "both tests met" : ahead ? "the count met, the spread not" : spreadMet ? "the spread met, the count not" : "neither test met"}${
    r ? `; in ${r.place}, ${fmtInt(r.carried)} of ${placesOf(result, r.states, "state")} carried` : ""
  }.`;
  const reading = [
    `The partners in ${f.year}: ${listOf(f.partners.map((partner) => `${partner.candidate} (${partner.id}) ${fmtInt(partner.votes)}`))}.`,
    `Pooled, they carry ${fmtInt(f.carried)} of ${placesOf(result, f.states, "state")} against the strongest party left outside in each${f.gained.length ? `, ${fmtInt(f.gained.length)} of them won in ${f.year} by a party outside the coalition: ${listOf(f.gained, 10)}` : ""}.`,
    ...(ahead && f.keepToLead !== null
      ? [`Votes do not transfer whole. The count holds as long as the coalition keeps more than ${fmtPct(f.keepToLead * 100)} of the partners' combined vote, with none of it going to the ${o.id}.`]
      : []),
    ...(f.keepToSpread !== null
      ? [spreadMet ? `The spread holds while it keeps more than ${fmtPct(f.keepToSpread * 100)} of the pooled vote in its 24th-best state.` : `Even pooled, the 24th-best state is under 25%.`]
      : []),
    ...(f.closestLost.length ? [`Nearest states still lost: ${listOf(f.closestLost.map((entry) => `${entry.name} (${fmtPts(Math.abs(entry.lead)).replace("+", "")} behind the ${entry.rival})`), 5)}.`] : []),
    ...(f.weakest.length ? [`Weakest ground even pooled: ${listOf(f.weakest.map((entry) => `${entry.name} ${fmtPct(entry.share)}`), 5)}.`] : []),
  ];
  return {
    headline,
    reading,
    plan: [
      "A pooled vote is the ceiling, not the forecast: every partner loses some of its voters in a merger, and the ground where the partners were rivals is where the loss is largest.",
      ...(f.closestLost.length ? [`The states nearest to turning are where a coalition's campaign would start: ${listOf(f.closestLost.slice(0, 3).map((entry) => entry.name), 3)}.`] : []),
    ],
    method: [
      `The ${f.year} declared votes of each partner, added state by state, set against the largest party outside the coalition in each state. Nationally, the declared totals.`,
      "Arithmetic on the record, not a claim that voters follow their candidates. The retention figures say how much of the combined vote the coalition could lose and still hold each test.",
    ],
    followups: ["Chances of Atiku winning 2027", `Where should the coalition focus?`, "Compare Atiku and Obi by state"],
  };
}

/* ══════════════════════════════════════════════════════════════ the rules */

function rules(result) {
  const f = result.sections[0].facts;
  const w = f.winner;
  const others = f.rows.filter((row) => row !== f.rows[0]).slice(0, 3);
  return {
    headline: `To be declared President on the first ballot, a candidate needs the most votes and at least 25% in two-thirds of the states — 24 of the 36; in ${f.year}, ${w.candidate} (${w.party}) had ${fmtInt(w.votes)} votes, ${fmtPct(w.share)}, and 25% in ${w.quarter} states.`,
    reading: [
      "There is no fixed number of votes that wins: the test is to be first, not to pass a total, and a spread of the vote across the states.",
      `What it took to be first: ${listOf(f.minimumWins.map((entry) => `${fmtInt(entry.votes)} in ${entry.year} (${entry.party})`), 6)}.`,
      ...others.map((row) => `${row.candidate} (${row.party}): ${fmtInt(row.votes)} votes, 25% in ${row.quarter} of 36 states${row.fct ? " and the FCT" : ""}.`),
      "If nobody meets both tests, Section 134 provides a second election between the leader and the candidate with the next widest spread, and then a third, decided on a simple majority.",
      "Whether 25% in the FCT is required on top of the 24 states was argued before the courts in 2023; the Supreme Court upheld the result without it. Poll360 counts the FCT apart.",
    ],
    plan: [],
    method: [`Section 134 of the 1999 Constitution, as amended, measured on INEC's declared results for ${f.year}.`],
    followups: ["List of states Atiku can get 25%", "Chances of Atiku winning 2027", "Who won the 2023 presidential election?"],
  };
}

function ordinalWord(n) {
  return ["", "first", "second", "third", "fourth", "fifth", "sixth"][n] ?? `${n}th`;
}

/* ══════════════════════════════════════════════════════════════ provenance */

function provenanceLines(result) {
  const kinds = new Set(result.sections.map((section) => section.provenance));
  const lines = [];
  if (kinds.has("counted")) lines.push("Counted: state and zone figures are INEC's declared results.");
  if (kinds.has("estimated") || kinds.has("estimated-anambra")) {
    lines.push(
      "Estimated: below the state, the declared state total is spread across real local governments, wards and polling units. It is right about the state and an estimate for any one named place."
    );
  }
  if (kinds.has("estimated-anambra")) {
    lines.push("Anambra's 2023 polling units are the exception: those with a readable result sheet carry the figures transcribed from it.");
  }
  if (kinds.has("scenario")) lines.push("Scenario: a projection from the 2023 result, not a result.");
  if (kinds.has("register")) lines.push("Register: the party's own member register. Counts only; no names or numbers leave it.");
  return lines;
}

/** Labels for the provenance badge. */
export const PROVENANCE = {
  counted: { label: "Counted", note: "Declared results" },
  estimated: { label: "Estimated", note: "Declared totals spread across real places" },
  "estimated-anambra": { label: "Estimated", note: "Declared totals spread across real places; Anambra read from sheets" },
  scenario: { label: "Scenario", note: "A projection, not a result" },
  register: { label: "Register", note: "The party's own members, not votes" },
};
