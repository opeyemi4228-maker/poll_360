import { LEVEL_WORDS, count, fmtInt, fmtPct, fmtPts, listOf } from "./format.js";

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

export function write(result) {
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
                : list(result);

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
  if (!f.section134 && f.cleared === 0 && f.within === 0 && f.closestBeyond.length) {
    return nothingNear(result, first);
  }

  let headline;
  if (f.section134) {
    const s = f.section134;
    headline = s.shortBy
      ? `${cap(who)} cleared ${T}% in ${s.cleared} of the 36 states in ${year} — ${s.shortBy} short of the 24 Section 134 asks for.`
      : `${cap(who)} cleared ${T}% in ${s.cleared} of the 36 states in ${year}, which meets the 24 Section 134 asks for.`;
  } else {
    headline = `${cap(who)} cleared ${T}% in ${fmtInt(f.cleared)} of ${result.scope.national ? "" : `${result.scope.name}'s `}${count(f.read, level)} in ${year}${
      prev ? `, and held it in ${fmtInt(f.counts.held)} of them in ${prev} as well` : ""
    }.`;
  }

  for (const section of result.sections) {
    reading.push(...reachReading(section, result, section === first));
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
      out.push(`Held ${T}% in both ${prev} and ${year} (${f.counts.held}): ${listOf(f.held.map(shareOf), 8)}.`);
    }
    if (f.newly.length) {
      out.push(`Cleared ${T}% in ${year}${prev ? ` but not in ${prev}` : ""} (${f.counts.cleared}): ${listOf(f.newly.map(shareOf), 8)}.`);
    }
    if (f.slipped.length) {
      out.push(`Held ${T}% in ${prev} and fell short in ${year} (${f.counts.slipped}): ${listOf(f.slipped.map(shareOf), 8)}.`);
    }
    if (f.reach.length) {
      out.push(`Within ${fmtInt(result.band)} points of the line (${f.counts.reach}): ${listOf(f.reach.map(shareOf), 8)}.`);
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
  const [first] = result.sections;
  const f = first.facts;
  const filters = result.plan.filters;
  const wonFilter = filters.find((filter) => filter.field === "won");
  const tierFilter = filters.find((filter) => filter.field === "tier");

  let headline;
  if (wonFilter && f.matched === 0) {
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
      ? `${cap(who)} carried ${fmtInt(f.matched)} of ${count(f.read, first.level)} in ${result.scope.name} in ${year}.`
      : `${cap(who)} lost ${fmtInt(f.matched)} of ${count(f.read, first.level)} in ${result.scope.name} in ${year}.`;
  } else if (tierFilter) {
    headline = `${fmtInt(f.matched)} of ${count(f.read, first.level)} in ${result.scope.name} are ${
      String(tierFilter.value).toLowerCase() === "any" ? "strongholds" : `${String(tierFilter.value).toLowerCase()} strongholds`
    } for ${who}.`;
  } else if (filters.length) {
    headline = `${fmtInt(f.matched)} of ${count(f.read, first.level)} in ${result.scope.name} match.`;
  } else {
    headline = `${cap(who)} in ${result.scope.name}, ${year}: ${fmtInt(f.votes)} votes across ${count(f.read, first.level)}, carrying ${fmtInt(f.carried)}.`;
  }

  for (const section of result.sections) {
    const s = section.facts;
    const by = s.sortedBy?.field === "registered" ? "largest register first" : s.sortedBy?.dir === "asc" ? "weakest first" : "strongest first";
    if (s.top.length) {
      reading.push(
        `${LEVEL_WORDS[section.level].title}, ${by}: ${listOf(
          s.top.slice(0, 6).map((entry) =>
            s.sortedBy?.field === "registered"
              ? `${entry.name}${entry.state && entry.state !== entry.name ? ` (${entry.state})` : ""} ${fmtInt(entry.registered)} voters`
              : shareOf(entry)
          ),
          6
        )}.`
      );
    }
    if (section.limited) reading.push(`The list is cut at ${fmtInt(section.limited)}, as asked.`);
  }

  const plan = [];
  if (wonFilter?.value && first.level !== "state") {
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
    ? `Top of the list for ${who}'s next votes in ${result.scope.name}: ${top.name}${top.state && top.state !== top.name ? `, ${top.state}` : ""} — ${
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
    `The first 20 hold ${fmtInt(f.top20Registered)} registered voters. That is a list a field team can work in a week: coordinator, agents and a turnout plan for each.`,
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
  const headline = `${cap(who)}'s share rose in ${fmtInt(f.gained)} of ${count(f.gained + f.fell, first.level)} between ${prev} and ${year}${
    f.flippedIn || f.flippedOut ? `; he won ${fmtInt(f.flippedIn)} he had lost and lost ${fmtInt(f.flippedOut)} he had won` : ""
  }.`;
  return {
    headline: result.who?.kind === "party" ? headline.replace("; he won", "; it won") : headline,
    reading: [
      `Biggest gains: ${listOf(f.best.map((entry) => `${entry.name} ${fmtPts(entry.change)} to ${fmtPct(entry.share)}`), 5)}.`,
      `Biggest falls: ${listOf(f.worst.map((entry) => `${entry.name} ${fmtPts(entry.change)} to ${fmtPct(entry.share)}`), 5)}.`,
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
    const same = earlier && earlier.subject === latest?.subject;
    const change = latest && earlier ? latest.share - earlier.share : null;
    const headline = latest
      ? `${f.state}: ${who} took ${fmtPct(latest.share)} in ${latest.year}${
          earlier
            ? same
              ? `, ${change >= 0 ? "up" : "down"} from ${fmtPct(earlier.share)} in ${earlier.year}`
              : `, against ${fmtPct(earlier.share)} for ${earlier.subject.split(" (")[0]} in ${earlier.year}`
            : ""
        }. ${latest.winner.split(" · ")[1] ?? latest.winner} of the ${latest.winner.split(" · ")[0]} carried the state.`
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
  const moves = Object.entries(f.swing).map(([id, n]) => `${id} ${n > 0 ? "gains" : "loses"} ${Math.abs(n)} ${Math.abs(n) === 1 ? "point" : "points"}`);
  const premise = `If ${listOf(moves) || "nothing moves"}${f.turnout !== 1 ? ` and turnout moves by ${fmtPts((f.turnout - 1) * 100).replace(" pts", "%")}` : ""}`;

  const spread = f.spreadApplies
    ? f.shortBy
      ? `clears 25% in ${f.quarterStates} states, ${f.shortBy} short of Section 134's 24`
      : `clears 25% in ${f.quarterStates} states, enough for Section 134${f.quarterFct ? " with the FCT as well" : " on the 36 states, though not the FCT"}`
    : `wins on the plurality alone, which is what decides a contest in one state`;
  const headline = `${premise}, ${who} ${spread}, and ${f.leads ? "leads the national count" : `still trails the ${f.leader.id} nationally, ${fmtPct(f.share)} to ${fmtPct(f.leader.share)}`}.`;

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
  if (register && !register.weakFirst && !register.against) {
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
    if (!register.against && register.women !== null) {
      reading.push(`${fmtPct(register.women)} of members are women and ${fmtPct(register.young)} are aged 18 to 35.`);
    }
    if (!register.against && register.minors) reading.push(`${fmtInt(register.minors)} members are under 18 and cannot vote.`);
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
