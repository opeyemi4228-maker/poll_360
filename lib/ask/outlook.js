import { project, winCondition } from "../forecast.js";
import { DECLARED } from "../election2023.js";
import { scorePlaces } from "../stronghold-map.js";
import { deepFor, deepRows, indexRows, nameOf, partyIn, stateRows } from "./ground.js";
import { fmtInt, fmtPct, fmtPts } from "./format.js";
import { electionFor } from "./contests.js";

/**
 * A candidate's path to the next election, from the record.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOT A PROBABILITY. A MEASUREMENT OF THE DISTANCE.
 *
 *  "What are his chances" has no honest answer as a percentage: nothing in the
 *  record says how the next campaign will go, and a number invented for the
 *  purpose would be the most confident wrong figure this product could print.
 *
 *  What the record does say is exactly how far there is to go, and where:
 *
 *    THE TWO TESTS    Section 134 asks for the most votes and a quarter of the
 *                     vote in 24 of the 36 states. How far short he was on
 *                     each, in votes and in states.
 *    THE SWING        the smallest uniform swing, run through the product's
 *                     own projection, that closes each test — set beside how
 *                     far he actually moved between his last two runs.
 *    THE GROUND       every state given a role — base, defend, target, out
 *                     of reach — and inside the ones to defend and target,
 *                     the local governments, wards and polling units that
 *                     decide them.
 * ══════════════════════════════════════════════════════════════════════════
 */

const FOUR = ["APC", "PDP", "LP", "NNPP"];

/** The smallest uniform swing, in half points, that meets a test; null if none within 30. */
function swingFor(partyId, test) {
  for (let points = 0; points <= 30; points += 0.5) {
    const all = winCondition(project({ swing: { [partyId]: points } }));
    const verdict = all.find((entry) => entry.id === partyId);
    if (verdict && test(verdict, all)) return points;
  }
  return null;
}

export const ROLES = {
  base: { label: "Base — hold", why: "Carried, and carried comfortably or in both runs." },
  defend: { label: "Defend", why: "Carried narrowly, or just over 25% — can go back." },
  target: { label: "Target", why: "Close enough to win, or to reach 25%." },
  out: { label: "Out of reach", why: "Far from winning and from 25% on the last result." },
};

function roleOf(row, year, prev) {
  const share = row.share?.[year];
  const lead = row.lead?.[year];
  const won = row.won?.[year];
  if (share === null || share === undefined) return "out";
  if (won && (lead >= 10 || row.won?.[prev])) return "base";
  if (won || (share >= 25 && share < 30)) return "defend";
  if ((lead !== null && lead > -15) || share >= 17) return "target";
  if (share >= 25) return "defend";
  return "out";
}

/**
 * @returns {Promise<{ sections: object[], facts: object, notes: string[] }>}
 */
export async function outlookSections(who, scope) {
  const years = [2023, 2019];
  const year = 2023;
  const prev = partyIn(who, 2019) ? 2019 : null;
  const party = partyIn(who, year);
  const notes = [];
  if (!party) return { sections: [], notes: [`${nameOf(who, { long: true })} did not stand in 2023, the last election the path is measured from.`], facts: null };

  /* ── THE TWO TESTS ────────────────────────────────────────────────────── */
  const declared = { APC: DECLARED.apc, PDP: DECLARED.pdp, LP: DECLARED.lp, NNPP: DECLARED.nnpp };
  const mine = declared[party.id] ?? null;
  const leaderId = Object.entries(declared).sort((a, b) => b[1] - a[1])[0][0];
  const gap = mine !== null ? declared[leaderId] - mine : null;
  /* For the one who led: the nearest challenger, and the swing to that
     challenger that would take the lead away. */
  const runnerUpId = Object.entries(declared)
    .filter(([id]) => id !== leaderId)
    .sort((a, b) => b[1] - a[1])[0][0];
  const rows = stateRows(who).filter((row) => !scope.states || scope.states.includes(row.code));
  const allRows = stateRows(who);
  const quarter = allRows.filter((row) => row.code !== "FCT" && (row.share?.[year] ?? 0) >= 25).length;
  const quarterPrev = prev ? allRows.filter((row) => row.code !== "FCT" && (row.share?.[prev] ?? 0) >= 25).length : null;
  const shareNow = mine !== null ? (mine / DECLARED.validVotes) * 100 : null;
  const sharePrevNational = prev ? (() => {
    const election = allRows.reduce((acc, row) => ({ votes: acc.votes + (row.votes?.[prev] ?? 0), cast: acc.cast + (row.castBy?.[prev] ?? 0) }), { votes: 0, cast: 0 });
    return election.cast ? (election.votes / election.cast) * 100 : null;
  })() : null;

  /* ── THE SWING THAT CLOSES EACH ───────────────────────────────────────── */
  const inFour = FOUR.includes(party.id);
  const swingLead = inFour ? swingFor(party.id, (verdict, all) => all[0].id === party.id) : null;
  const swingSpread = inFour ? swingFor(party.id, (verdict) => verdict.quarterStates >= 24) : null;
  const swingBoth = inFour ? swingFor(party.id, (verdict, all) => all[0].id === party.id && verdict.quarterStates >= 24) : null;
  const moved = shareNow !== null && sharePrevNational !== null ? shareNow - sharePrevNational : null;
  const leads = leaderId === party.id;
  const swingToLose = leads ? swingFor(runnerUpId, (verdict, all) => all[0].id === runnerUpId) : null;

  /* ── EVERY STATE, A ROLE ──────────────────────────────────────────────── */
  const stateTable = rows
    .map((row) => {
      const role = roleOf(row, year, prev);
      const cast = row.castBy?.[year] ?? null;
      const votes = row.votes?.[year] ?? null;
      const share = row.share?.[year] ?? null;
      const lead = row.lead?.[year] ?? null;
      /* Votes to reach 25% and to overtake the leader, both counted as new
         voters with everyone else holding theirs — the larger, safer number. */
      const toQuarter = share !== null && share < 25 && cast ? Math.ceil((25 * cast - 100 * votes) / 75) : 0;
      const toLead = lead !== null && lead < 0 && cast ? Math.ceil((-lead / 100) * cast) + 1 : 0;
      return {
        key: row.code,
        code: row.code,
        stateCode: row.code,
        name: row.name,
        state: row.name,
        zone: row.zone,
        role,
        status: { base: "held", defend: "cleared", target: "reach", out: "beyond" }[role],
        status_label: ROLES[role].label,
        share,
        share_prev: prev ? row.share?.[prev] ?? null : null,
        lead,
        to_quarter: toQuarter || null,
        to_lead: toLead || null,
        registered: row.registered,
        turnout: row.turnout,
        cast,
      };
    })
    .sort((a, b) => {
      const order = { base: 0, defend: 1, target: 2, out: 3 };
      if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
      if (a.role === "target") return (a.to_lead ?? a.to_quarter ?? Infinity) - (b.to_lead ?? b.to_quarter ?? Infinity);
      return (b.share ?? 0) - (a.share ?? 0);
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));

  const byRole = (role) => stateTable.filter((row) => row.role === role);
  const focusCodes = stateTable.filter((row) => row.role === "defend" || row.role === "target").map((row) => row.code);

  /* The cheapest states to lift over 25%, in the order a plan short of the
     spread would take them. */
  const cheapestQuarter = stateTable
    .filter((row) => row.code !== "FCT" && row.share !== null && row.share < 25)
    .sort((a, b) => a.to_quarter - b.to_quarter)
    .slice(0, Math.max(0, 24 - quarter) + 3);

  /* ── BELOW THE STATE: EVERY PLACE, IN THE ORDER TO WORK THEM ────────────
     Every local government, ward and polling unit in the ground is kept —
     nothing is cut to a top forty. The order is the plan: places in the
     states to defend and target first, then the base, then the states out of
     reach. Inside each, the places are dealt out state by state — each
     state's best, then each state's second — so a list read from the top is
     spread across the whole path rather than piled into its densest state. */
  const deep = deepFor(who, year);
  const roleOfState = new Map(stateTable.map((row) => [row.code, row.role]));
  const inGround = rows.map((row) => row.code);
  const TIER = { defend: 0, target: 1, base: 2, out: 3 };

  function planOrder(list, score) {
    const tiers = new Map();
    for (const row of list) {
      const tier = TIER[roleOfState.get(row.stateCode) ?? "out"];
      if (!tiers.has(tier)) tiers.set(tier, new Map());
      const byState = tiers.get(tier);
      if (!byState.has(row.stateCode)) byState.set(row.stateCode, []);
      byState.get(row.stateCode).push(row);
    }
    const out = [];
    for (const tier of [...tiers.keys()].sort((a, b) => a - b)) {
      const queues = [...tiers.get(tier).values()]
        .map((queue) => queue.sort((a, b) => score(b) - score(a)))
        .sort((a, b) => score(b[0]) - score(a[0]));
      for (let depth = 0; queues.some((queue) => depth < queue.length); depth += 1) {
        for (const queue of queues) if (depth < queue.length) out.push(queue[depth]);
      }
    }
    return out;
  }
  const roleCell = (row) => {
    const role = roleOfState.get(row.stateCode) ?? "out";
    return { role, status: { base: "held", defend: "cleared", target: "reach", out: "beyond" }[role], status_label: ROLES[role].label };
  };

  /* ── THE TABLES, ARRANGED AS THE GROUND IS ────────────────────────────────
     The tables are read the way a campaign is organised: state by state in
     the order of the state table, then inside each state its local
     governments, inside each local government its wards, and inside each ward
     its polling units — every level, at every step, most important first. An
     answer about one state starts at its local governments. The spread-out
     priority order above is kept for the reading's "focus first" sentences. */
  const stateAt = new Map(stateTable.map((row, index) => [row.code, index]));
  const byScore = (score) => (a, b) => score(b) - score(a) || String(a.name).localeCompare(String(b.name));
  function arrange(list, parentAt, score) {
    return [...list].sort((a, b) => {
      const byState = (stateAt.get(a.stateCode) ?? Infinity) - (stateAt.get(b.stateCode) ?? Infinity);
      if (byState) return byState;
      const byParent = parentAt(a) - parentAt(b);
      return byParent || byScore(score)(a, b);
    });
  }
  const oneState = inGround.length === 1;
  /* The band a table is broken into: states, or the local governments of the
     one state asked about. */
  const bandFor = (level) =>
    !oneState ? { key: "stateCode", name: "state", role: true } : level === "lga" ? null : { key: "lgaKey", name: "lga", role: false };
  /* Inside a band, the levels between it and the row, named once where each
     begins rather than on every line. */
  const nestFor = (level) => {
    const inner = level === "ward" ? ["lga"] : level === "unit" ? ["lga", "ward"] : [];
    return oneState ? inner.filter((key) => key !== "lga") : inner;
  };

  const lgaRows = indexRows("lga", inGround);
  const lgaScored = scorePlaces(lgaRows, { year });
  const priorityLgas = planOrder(lgaScored, (row) => row.score);
  const scoredLgas = arrange(lgaScored, () => 0, (row) => row.score);
  const lgaAt = new Map(scoredLgas.map((row, index) => [row.key, index]));
  const wardRows = await deepRows("ward", { states: inGround });
  const wardScored = scorePlaces(wardRows, { year });
  const priorityWards = planOrder(wardScored, (row) => row.score);
  const scoredWards = arrange(wardScored, (row) => lgaAt.get(row.lgaKey) ?? Infinity, (row) => row.score);
  const wardAt = new Map(scoredWards.map((row, index) => [row.key, index]));

  /* Polling units: the biggest registers where the vote was closest or the
     most people stayed home — where an agent's day moves the most votes. A
     unit whose estimated votes exceed its estimated register keeps its place
     in the list, its turnout left blank rather than printed as impossible. */
  const unitRows = await deepRows("unit", { states: inGround });
  const sane = (row) => row.turnout !== null && row.turnout !== undefined && row.turnout <= 100;
  const unitScore = (row) => {
    const stayedHome = sane(row) ? (1 - row.turnout / 100) * row.registered : row.registered * 0.7;
    const close = deep && row.lead?.[year] !== null && row.lead?.[year] !== undefined ? Math.max(0, 1 - Math.abs(row.lead[year]) / 30) : 0.5;
    return stayedHome * (0.6 + 0.4 * close);
  };
  for (const row of unitRows) row.focusScore = unitScore(row);
  const priorityUnits = planOrder(unitRows, (row) => row.focusScore);
  /* A polling unit's code is its ward's code and its own number: 15-01-01-001. */
  const wardOf = (row) => String(row.key).split("-").slice(0, 3).join("-");
  const orderedUnits = arrange(
    unitRows,
    (row) => (lgaAt.get(row.lgaKey) ?? Infinity) * 1e5 + (wardAt.get(wardOf(row)) ?? 99999),
    (row) => row.focusScore
  );

  const roleColumn = { key: "status", label: "State's role", kind: "status" };
  const lgaSection = {
    level: "lga",
    title: oneState
      ? `Every local government, most important first (${fmtInt(scoredLgas.length)})`
      : `Every local government, state by state (${fmtInt(scoredLgas.length)})`,
    group: bandFor("lga"),
    nest: nestFor("lga"),
    provenance: "estimated",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "Local government", kind: "text", main: true },
      { key: "state", label: "State", kind: "text" },
      roleColumn,
      { key: "score", label: "Priority", kind: "score" },
      { key: "why", label: "Why it ranks", kind: "text" },
      ...(deep ? [{ key: "share", label: `${year} share`, kind: "bar", threshold: 25 }, { key: "lead", label: "Lead", kind: "pts" }] : []),
      { key: "registered", label: "Registered", kind: "int" },
      { key: "turnout", label: "Turnout", kind: "pct" },
    ],
    rows: scoredLgas.map((row, index) => ({
      rank: index + 1,
      key: row.key,
      name: row.name,
      state: row.state,
      stateCode: row.stateCode,
      lga: row.name,
      lgaKey: row.key,
      ...roleCell(row),
      score: row.score,
      why: row.why.join(" · "),
      share: deep ? row.share?.[year] ?? null : null,
      lead: deep ? row.lead?.[year] ?? null : null,
      registered: row.registered,
      turnout: row.turnout,
    })),
    total: scoredLgas.length,
    read: lgaRows.length,
    tiles: [],
    facts: null,
  };
  const wardSection = {
    level: "ward",
    title: oneState
      ? `Every ward, local government by local government (${fmtInt(scoredWards.length)})`
      : `Every ward, by state and local government (${fmtInt(scoredWards.length)})`,
    group: bandFor("ward"),
    nest: nestFor("ward"),
    provenance: "estimated",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "code", label: "Ward code", kind: "text", mono: true },
      { key: "name", label: "Ward", kind: "text", main: true },
      { key: "lga", label: "Local government", kind: "text" },
      { key: "state", label: "State", kind: "text" },
      roleColumn,
      { key: "score", label: "Priority", kind: "score" },
      ...(deep ? [{ key: "share", label: `${year} share`, kind: "bar", threshold: 25 }, { key: "lead", label: "Lead", kind: "pts" }] : []),
      { key: "registered", label: "Registered", kind: "int" },
      { key: "turnout", label: "Turnout", kind: "pct" },
    ],
    rows: scoredWards.map((row, index) => ({
      rank: index + 1,
      key: row.key,
      code: row.code,
      name: row.name,
      ward: row.name,
      lga: row.lga,
      lgaKey: row.lgaKey,
      state: row.state,
      stateCode: row.stateCode,
      ...roleCell(row),
      score: row.score,
      share: deep ? row.share?.[year] ?? null : null,
      lead: deep ? row.lead?.[year] ?? null : null,
      registered: row.registered,
      turnout: row.turnout,
    })),
    total: scoredWards.length,
    read: wardRows.length,
    tiles: [],
    facts: null,
  };
  const unitSection = {
    level: "unit",
    title: oneState
      ? `Every polling unit, by local government and ward (${fmtInt(orderedUnits.length)})`
      : `Every polling unit, by state, local government and ward (${fmtInt(orderedUnits.length)})`,
    group: bandFor("unit"),
    nest: nestFor("unit"),
    provenance: "estimated",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "code", label: "PU code", kind: "text", mono: true },
      { key: "name", label: "Polling unit", kind: "text", main: true },
      { key: "ward", label: "Ward", kind: "text" },
      { key: "lga", label: "Local government", kind: "text" },
      { key: "state", label: "State", kind: "text" },
      roleColumn,
      { key: "registered", label: "Registered", kind: "int" },
      { key: "turnout", label: "Turnout", kind: "pct" },
      { key: "home", label: "Stayed home", kind: "int" },
      ...(deep ? [{ key: "share", label: `${year} share`, kind: "pct" }, { key: "lead", label: "Lead", kind: "pts" }] : []),
    ],
    rows: orderedUnits.map((row, index) => ({
      rank: index + 1,
      key: row.key,
      code: row.code,
      name: row.name,
      ward: row.ward,
      lga: row.lga,
      lgaKey: row.lgaKey,
      state: row.state,
      stateCode: row.stateCode,
      ...roleCell(row),
      registered: row.registered,
      turnout: sane(row) ? row.turnout : null,
      home: sane(row) ? Math.round(row.registered * (1 - row.turnout / 100)) : null,
      share: deep ? row.share?.[year] ?? null : null,
      lead: deep ? row.lead?.[year] ?? null : null,
    })),
    total: orderedUnits.length,
    read: unitRows.length,
    tiles: [],
    facts: null,
  };

  /* The first hundred polling units in priority order are what the plan's
     turnout sentence is about. */
  const homeOf = (row) => (sane(row) ? Math.round(row.registered * (1 - row.turnout / 100)) : null);
  const stayedHomeUnits = priorityUnits.slice(0, 100).reduce((sum, row) => sum + (homeOf(row) ?? 0), 0);
  const focusRegister = stateTable.filter((row) => focusCodes.includes(row.code)).reduce((sum, row) => sum + (row.registered ?? 0), 0);

  const stateSection = {
    level: "state",
    title: "Every state, and its role on the path",
    provenance: "counted",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: "State", kind: "text", main: true },
      { key: "zone", label: "Zone", kind: "text" },
      { key: "status", label: "Role", kind: "status" },
      { key: "share", label: `${year} share`, kind: "bar", threshold: 25 },
      ...(prev ? [{ key: "share_prev", label: `${prev} share`, kind: "pct" }] : []),
      { key: "lead", label: "Lead", kind: "pts" },
      { key: "to_quarter", label: "Votes to 25%", kind: "int" },
      { key: "to_lead", label: "Votes to lead", kind: "int" },
      { key: "registered", label: "Registered", kind: "int" },
      { key: "turnout", label: "Turnout", kind: "pct" },
    ],
    rows: stateTable,
    total: stateTable.length,
    read: stateTable.length,
    tiles: [
      { label: "The count", value: gap > 0 ? `−${fmtInt(gap)}` : "Led", sub: gap > 0 ? `votes behind the ${leaderId}, ${year}` : `first on votes in ${year}`, tone: gap > 0 ? "warn" : "good" },
      { label: "The spread", value: `${quarter} of 36`, sub: quarter >= 24 ? "24 needed, met" : `${24 - quarter} short of the 24 needed`, tone: quarter >= 24 ? "good" : "warn" },
      { label: "Swing to meet both", value: swingBoth === null ? "Over 30 pts" : `${swingBoth} pts`, sub: moved !== null ? `his last change: ${fmtPts(moved)}` : "uniform, on the 2023 result" },
      { label: "States to win or lift", value: `${byRole("defend").length + byRole("target").length}`, sub: `${byRole("defend").length} to defend, ${byRole("target").length} to target` },
    ],
    facts: {
      kind: "outlook",
      who: nameOf(who),
      whoLong: nameOf(who, { long: true }),
      party: party.id,
      year,
      prev,
      mine,
      shareNow,
      sharePrevNational,
      moved,
      leaderId,
      leaderVotes: declared[leaderId],
      leaderShare: (declared[leaderId] / DECLARED.validVotes) * 100,
      gap,
      quarter,
      quarterPrev,
      swingLead,
      swingSpread,
      swingBoth,
      roles: {
        base: byRole("base").map((row) => ({ name: row.name, share: row.share })),
        defend: byRole("defend").map((row) => ({ name: row.name, share: row.share, lead: row.lead })),
        target: byRole("target").map((row) => ({ name: row.name, share: row.share, lead: row.lead, toLead: row.to_lead, toQuarter: row.to_quarter })),
        out: byRole("out").map((row) => ({ name: row.name, share: row.share })),
      },
      cheapestQuarter: cheapestQuarter.map((row) => ({ name: row.name, share: row.share, toQuarter: row.to_quarter })),
      focusRegister,
      lgas: priorityLgas.slice(0, 24).map((row) => ({ name: row.name, state: row.state, score: row.score, why: row.why.join(" · ") })),
      wards: priorityWards.slice(0, 24).map((row) => ({ name: row.name, lga: row.lga, state: row.state, score: row.score })),
      units: priorityUnits.slice(0, 24).map((row) => ({ name: row.name, code: row.code, lga: row.lga, state: row.state, registered: row.registered, home: homeOf(row) })),
      stayedHomeUnits,
      leads,
      runnerUpId,
      runnerUpVotes: declared[runnerUpId],
      swingToLose,
      /* An answer about one state leads with that state. */
      stateFocus: oneState
        ? (() => {
            const row = stateTable[0];
            const race = electionFor(year).rows.find((entry) => entry.code === row.code);
            const winnerId = race ? Object.entries(race.votes).filter(([id]) => id !== "OTH").sort((a, b) => b[1] - a[1])[0]?.[0] : null;
            return { name: row.name, share: row.share, sharePrev: row.share_prev, lead: row.lead, role: row.role, roleLabel: ROLES[row.role].label, toQuarter: row.to_quarter, toLead: row.to_lead, winner: winnerId, carried: winnerId === party.id };
          })()
        : null,
      /* An answer about a region leads with the region. */
      regionFocus:
        !scope.national && !oneState
          ? {
              place: scope.name,
              states: stateTable.length,
              carried: stateTable.filter((row) => row.lead !== null && row.lead > 0).length,
              quarter: stateTable.filter((row) => row.code !== "FCT" && (row.share ?? 0) >= 25).length,
              targets: stateTable.filter((row) => row.role === "target").map((row) => row.name),
              best: stateTable[0] ? { name: stateTable[0].name, share: stateTable[0].share } : null,
            }
          : null,
      deep,
      regional: !scope.national,
      place: scope.name,
    },
  };

  if (!deep) notes.push(`Below the state Poll360 holds Atiku's vote alone, so the local governments, wards and polling units for ${nameOf(who)} are ranked on the register and turnout, not on ${nameOf(who)}'s own vote.`);
  if (!inFour) notes.push(`The projection covers the four largest parties of 2023, so no swing is worked out for the ${party.id}.`);

  return { sections: [stateSection, lgaSection, wardSection, unitSection], facts: stateSection.facts, notes };
}
