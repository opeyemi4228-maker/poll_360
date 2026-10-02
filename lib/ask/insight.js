import { LEVEL_WORDS, count, fmtInt, fmtPct, fmtPts, listOf } from "./format.js";

/**
 * The analysis under an answer: the figures that explain it, and nothing the
 * question did not ask about.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE THINGS, ALL COMPUTED, ALL ABOUT THE QUESTION
 *
 *    NUMBERS     the measures that carry the answer — how much of the
 *                register it covers, how close the close ones are, what
 *                turnout looked like on each side of the line.
 *    BREAKDOWN   one picture of how the places spread: by zone, by state or
 *                by band of share, whichever this question is about.
 *    FINDINGS    the sentences those figures support, added to the reading.
 *
 *  Every figure is worked out here from the engine's own rows. A question
 *  about the party register gets register analysis and no vote; a question
 *  about Gombe gets Gombe. The analysis follows the question, never the
 *  data that happens to be lying about.
 * ══════════════════════════════════════════════════════════════════════════
 */

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
const values = (rows, key) => rows.map((row) => row[key]).filter((value) => value !== null && value !== undefined && Number.isFinite(value));
const mean = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);
function median(list) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/* Turnout across a set of places, weighted by who could vote in each. */
function turnoutOf(rows) {
  const withBoth = rows.filter((row) => row.registered && row.turnout !== null && row.turnout !== undefined);
  const registered = sum(withBoth, "registered");
  if (!registered) return null;
  return withBoth.reduce((total, row) => total + row.turnout * row.registered, 0) / registered;
}
const pctOf = (part, whole) => (whole ? (part / whole) * 100 : null);
const named = (row, ground) => `${row.name}${row.state && row.state !== row.name && row.state !== ground && row.level !== "state" ? ` (${row.state})` : ""}`;

const ZONE_ORDER = ["North West", "North East", "North Central", "South West", "South East", "South South"];

/** Places counted into bands of share, with the line marked. */
function bands(rows, key, line = null) {
  const edges = [
    [0, 10, "Under 10%"],
    [10, 20, "10–20%"],
    [20, 25, "20–25%"],
    [25, 35, "25–35%"],
    [35, 50, "35–50%"],
    [50, 101, "50% and over"],
  ];
  const known = rows.filter((row) => row[key] !== null && row[key] !== undefined);
  return edges
    .map(([low, high, label]) => {
      const n = known.filter((row) => row[key] >= low && row[key] < high).length;
      return {
        label,
        value: n,
        display: fmtInt(n),
        tone: line === null ? "ink" : low >= line ? "held" : high <= line - 5 ? "beyond" : "reach",
      };
    })
    .map((bar) => bar)
    .filter((bar, index, all) => {
      /* Empty bands at either end say nothing; empty bands between two full
         ones show the gap, and stay. */
      const first = all.findIndex((entry) => entry.value > 0);
      const last = all.length - 1 - [...all].reverse().findIndex((entry) => entry.value > 0);
      return first >= 0 && index >= first && index <= last;
    });
}

/** Drop empty bars at either end; keep empty ones between full ones. */
function trimmed(bars) {
  const first = bars.findIndex((bar) => bar.value > 0);
  if (first < 0) return [];
  const last = bars.length - 1 - [...bars].reverse().findIndex((bar) => bar.value > 0);
  return bars.slice(first, last + 1);
}

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** How many zones a set of rows spans — a zone breakdown needs two. */
const zonesIn = (rows) => new Set(rows.map((row) => row.zone).filter(Boolean)).size;

function byZone(rows, pick) {
  return ZONE_ORDER.map((zone) => {
    const inZone = rows.filter((row) => row.zone === zone);
    return inZone.length ? { zone, rows: inZone, ...pick(inZone) } : null;
  }).filter(Boolean);
}

/* ══════════════════════════════════════════════════════════════ reach */

function reach(result, section) {
  const f = section.facts;
  const T = f.threshold;
  const rows = section.rows;
  const all = rows.length === f.read ? rows : null;
  const words = LEVEL_WORDS[section.level];
  const ground = result.scope.name;
  const cleared = rows.filter((row) => row.status === "held" || row.status === "cleared");
  const short = rows.filter((row) => !(row.status === "held" || row.status === "cleared") && row.share !== null);
  const narrow = cleared.filter((row) => row.share < T + 5);
  const comfortable = cleared.filter((row) => row.share >= T + 10);
  const numbers = [];
  const findings = [];

  if (all) {
    const register = sum(rows, "registered");
    const clearedRegister = sum(cleared, "registered");
    numbers.push({
      label: `Voters where he cleared ${T}%`,
      value: fmtPct(pctOf(clearedRegister, register)),
      note: `${fmtInt(clearedRegister)} of ${fmtInt(register)} registered`,
    });
  }
  const med = median(values(rows, "share"));
  if (med !== null) numbers.push({ label: `Middle ${words.one}, ${result.year}`, value: fmtPct(med), note: `half the ${words.many} above, half below` });
  numbers.push({ label: `Narrowly over (${T}–${T + 5}%)`, value: fmtInt(narrow.length), note: narrow.length ? "can fall back as easily as others rise" : "none on the edge", tone: narrow.length ? "warn" : undefined });
  numbers.push({ label: `Comfortably over (${T + 10}%+)`, value: fmtInt(comfortable.length), note: `of ${fmtInt(cleared.length)} cleared` });
  const changes = values(rows, "change");
  if (changes.length) {
    const medChange = median(changes);
    numbers.push({ label: `Typical change since ${result.prev}`, value: fmtPts(medChange), note: `${fmtInt(changes.filter((c) => c > 0).length)} rose, ${fmtInt(changes.filter((c) => c < 0).length)} fell` });
  }
  const tIn = turnoutOf(cleared);
  const tOut = turnoutOf(short);
  if (tIn !== null && tOut !== null) {
    numbers.push({ label: "Turnout, cleared against short", value: `${fmtPct(tIn)} / ${fmtPct(tOut)}`, note: "weighted by registered voters" });
    const gap = tIn - tOut;
    if (Math.abs(gap) >= 3) {
      findings.push(
        gap > 0
          ? `Turnout ran higher where he cleared ${T}% (${fmtPct(tIn)}) than where he fell short (${fmtPct(tOut)}): his ground votes, and the short ground stays home — a turnout job there as much as a persuasion job.`
          : `Turnout was lower where he cleared ${T}% (${fmtPct(tIn)}) than where he fell short (${fmtPct(tOut)}): his own ground has votes still to bring out.`
      );
    }
  }
  if (narrow.length) {
    findings.push(`On the edge — over ${T}% by less than five points: ${listOf(narrow.sort((a, b) => a.share - b.share).slice(0, 5).map((row) => `${named(row, ground)} ${fmtPct(row.share)}`), 5)}.`);
  }

  let breakdown = null;
  if (section.level === "state" && zonesIn(rows) >= 2) {
    const zones = byZone(rows, (inZone) => ({ cleared: inZone.filter((row) => row.status === "held" || row.status === "cleared").length }));
    breakdown = {
      title: `States over ${T}%, zone by zone`,
      bars: zones.map((zone) => ({ label: zone.zone, value: zone.cleared, max: zone.rows.length, display: `${zone.cleared} of ${zone.rows.length}`, tone: zone.cleared / zone.rows.length >= 0.5 ? "held" : "reach" })),
    };
    const best = [...zones].sort((a, b) => b.cleared / b.rows.length - a.cleared / a.rows.length);
    if (best.length) {
      findings.push(
        `By zone: ${best[0].zone} is where the line holds (${best[0].cleared} of ${best[0].rows.length} states); ${best[best.length - 1].zone} is where it does not (${best[best.length - 1].cleared} of ${best[best.length - 1].rows.length}).`
      );
    }
  } else if (all) {
    breakdown = { title: `${words.title} by ${result.whoName}'s share, ${result.year}`, bars: bands(rows, "share", T), line: `${T}% line` };
  }
  return { numbers, breakdown, findings };
}

/* ══════════════════════════════════════════════════════════════ list */

function list(result, section) {
  const f = section.facts;
  const rows = section.rows;
  const words = LEVEL_WORDS[section.level];
  const ground = result.scope.name;
  const numbers = [];
  const findings = [];
  const won = rows.filter((row) => row.won);
  const narrowWins = won.filter((row) => row.lead !== null && row.lead < 5);
  const landslides = won.filter((row) => row.lead !== null && row.lead >= 20);
  const closeLosses = rows.filter((row) => row.won === false && row.lead !== null && row.lead > -5);

  if (!section.unfiltered && f.read > rows.length) {
    numbers.push({ label: "Share of the ground", value: fmtPct(pctOf(rows.length, f.read)), note: `${fmtInt(rows.length)} of ${count(f.read, section.level)}` });
  }
  const med = median(values(rows, "share"));
  if (med !== null) numbers.push({ label: `Middle ${words.one}, ${result.year}`, value: fmtPct(med), note: `${result.whoName}'s share` });
  if (won.length) {
    numbers.push({ label: "Narrow wins (under 5 pts)", value: fmtInt(narrowWins.length), note: narrowWins.length ? "the ones that can go back" : "none on a knife-edge", tone: narrowWins.length ? "warn" : undefined });
    numbers.push({ label: "Landslides (20 pts+)", value: fmtInt(landslides.length), note: `of ${fmtInt(won.length)} carried` });
  }
  if (closeLosses.length) numbers.push({ label: "Lost by under 5 pts", value: fmtInt(closeLosses.length), note: "the nearest to turning" });
  const t = turnoutOf(rows);
  if (t !== null) numbers.push({ label: "Turnout across them", value: fmtPct(t), note: "weighted by registered voters" });
  const reg = sum(rows, "registered");
  if (reg) numbers.push({ label: "Registered voters in them", value: fmtInt(reg), note: section.unfiltered ? "all listed" : "on this list" });

  if (narrowWins.length) {
    findings.push(`Carried narrowly, under five points: ${listOf(narrowWins.sort((a, b) => a.lead - b.lead).slice(0, 5).map((row) => `${named(row, ground)} by ${fmtPts(row.lead).replace("+", "")}`), 5)}.`);
  }
  if (closeLosses.length && !section.unfiltered) {
    findings.push(`Lost narrowly, under five points: ${listOf(closeLosses.sort((a, b) => b.lead - a.lead).slice(0, 5).map((row) => `${named(row, ground)} by ${fmtPts(Math.abs(row.lead)).replace("+", "")}`), 5)}.`);
  }

  let breakdown = null;
  const states = new Set(rows.map((row) => row.state));
  if (section.level !== "state" && states.size > 1) {
    const tally = {};
    for (const row of rows) tally[row.state] = (tally[row.state] ?? 0) + 1;
    breakdown = {
      title: `${words.title} listed, by state`,
      bars: Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([state, n]) => ({ label: state, value: n, display: fmtInt(n), tone: "held" })),
    };
  } else if (section.level === "state" && zonesIn(rows) >= 2) {
    const zones = byZone(rows, (inZone) => ({ n: inZone.length }));
    breakdown = { title: "States listed, by zone", bars: zones.map((zone) => ({ label: zone.zone, value: zone.n, display: fmtInt(zone.n), tone: "held" })) };
  } else if (rows.length >= 5) {
    breakdown = { title: `${words.title} by ${result.whoName}'s share, ${result.year}`, bars: bands(rows, "share", 25), line: "25% line" };
  }
  return { numbers, breakdown, findings };
}

/* ══════════════════════════════════════════════════════════════ target */

function target(result, section) {
  const rows = section.rows;
  /* The head of the list: twenty where the ground is large, five where a
     "top twenty" would be the whole of it. */
  const n = rows.length > 40 ? 20 : Math.min(5, rows.length);
  const top = rows.slice(0, n);
  const ground = sum(rows, "registered");
  const numbers = [
    { label: `Registered in the top ${n}`, value: fmtInt(sum(top, "registered")), note: `${fmtPct(pctOf(sum(top, "registered"), ground))} of the ground's register` },
    { label: `Turnout, top ${n}`, value: fmtPct(turnoutOf(top)), note: `against ${fmtPct(turnoutOf(rows))} across all ${fmtInt(rows.length)}` },
    { label: `Carried among the top ${n}`, value: fmtInt(top.filter((row) => row.lead > 0).length), note: `${fmtInt(top.filter((row) => row.lead !== null && row.lead <= 0).length)} lost — to win, not to hold` },
    { label: `Close contests in the top ${n}`, value: fmtInt(top.filter((row) => row.lead !== null && Math.abs(row.lead) < 5).length), note: "decided by under five points" },
  ];
  const findings = [];
  const lost = top.filter((row) => row.lead !== null && row.lead <= 0);
  if (lost.length) {
    findings.push(`Of the top ${n}, ${fmtInt(lost.length)} ${lost.length === 1 ? "was" : "were"} lost in ${result.year} — nearest first: ${listOf(lost.sort((a, b) => b.lead - a.lead).slice(0, 4).map((row) => `${named(row, result.scope.name)}, ${fmtPts(Math.abs(row.lead)).replace("+", "")} behind`), 4)}.`);
  }
  return {
    numbers,
    breakdown: { title: "Priority score, top ten", bars: rows.slice(0, 10).map((row) => ({ label: named(row, result.scope.name), value: row.score, max: 100, display: `${row.score}`, tone: "held" })) },
    findings,
  };
}

/* ══════════════════════════════════════════════════════════════ swing */

function swing(result, section) {
  const rows = section.rows;
  const changes = values(rows, "change");
  const numbers = [
    { label: "Typical change", value: fmtPts(median(changes)), note: `middle ${LEVEL_WORDS[section.level].one}` },
    { label: "Average change", value: fmtPts(mean(changes)), note: `across ${count(changes.length, section.level)}` },
    { label: "Rose 10 pts or more", value: fmtInt(changes.filter((c) => c >= 10).length), note: "big gains" },
    { label: "Fell 10 pts or more", value: fmtInt(changes.filter((c) => c <= -10).length), note: "big losses", tone: changes.some((c) => c <= -10) ? "warn" : undefined },
  ];
  let breakdown = null;
  const findings = [];
  if (section.level === "state" && zonesIn(rows) >= 2) {
    const zones = byZone(rows, (inZone) => ({ change: median(values(inZone, "change")) }));
    breakdown = {
      title: `Typical change by zone, ${result.prev} to ${result.year}`,
      signed: true,
      bars: zones.map((zone) => ({ label: zone.zone, value: zone.change, display: fmtPts(zone.change), tone: zone.change >= 0 ? "held" : "reach" })),
    };
    const sorted = [...zones].sort((a, b) => b.change - a.change);
    findings.push(`By zone, the swing ran from ${sorted[0].zone} (${fmtPts(sorted[0].change)}) to ${sorted[sorted.length - 1].zone} (${fmtPts(sorted[sorted.length - 1].change)}).`);
  } else {
    const edges = [
      [-100, -10, "Fell 10+ pts"],
      [-10, -5, "Fell 5–10"],
      [-5, 0, "Fell under 5"],
      [0, 5, "Rose under 5"],
      [5, 10, "Rose 5–10"],
      [10, 101, "Rose 10+ pts"],
    ];
    breakdown = {
      title: `${LEVEL_WORDS[section.level].title} by change, ${result.prev} to ${result.year}`,
      bars: trimmed(
        edges.map(([low, high, label]) => {
          const n = changes.filter((c) => c >= low && c < high).length;
          return { label, value: n, display: fmtInt(n), tone: low >= 0 ? "held" : "reach" };
        })
      ),
    };
  }
  return { numbers, breakdown, findings };
}

/* ══════════════════════════════════════════════════════════════ profile */

function profile(result, section, all) {
  const f = section.facts;
  if (f.kind !== "profile-state") return null;
  const lgas = all.find((entry) => entry !== section && entry.level === "lga");
  const latest = f.history.find((row) => row.share !== null);
  const numbers = [];
  const findings = [];
  if (f.rank) {
    numbers.push({ label: `Rank among the 37, ${latest.year}`, value: `${f.rank.share} of 37`, note: `by ${result.whoName}'s share` });
    numbers.push({ label: "Turnout rank", value: `${f.rank.turnout} of 37`, note: `${fmtPct(latest?.turnout)} turnout` });
  }
  let breakdown = null;
  if (lgas) {
    const rows = lgas.rows;
    const shares = values(rows, "share");
    numbers.push({ label: "Local governments carried", value: `${fmtInt(rows.filter((row) => row.won).length)} of ${fmtInt(rows.length)}`, note: `${latest?.year ?? 2023}` });
    numbers.push({ label: "Range across them", value: `${fmtPct(Math.min(...shares))} – ${fmtPct(Math.max(...shares))}`, note: "weakest to strongest" });
    numbers.push({ label: "Middle local government", value: fmtPct(median(shares)), note: `${result.whoName}'s share` });
    const narrow = rows.filter((row) => row.lead !== null && Math.abs(row.lead) < 5);
    numbers.push({ label: "Decided by under 5 pts", value: fmtInt(narrow.length), note: "either way" });
    breakdown = { title: `Local governments by ${result.whoName}'s share, 2023`, bars: bands(rows, "share", 25), line: "25% line" };
    if (narrow.length) {
      findings.push(`Decided by under five points either way: ${listOf(narrow.slice(0, 5).map((row) => `${row.name} (${row.won ? "won" : "lost"} by ${fmtPts(Math.abs(row.lead)).replace("+", "")})`), 5)}.`);
    }
  }
  return numbers.length ? { numbers, breakdown, findings } : null;
}

/* ══════════════════════════════════════════════════════════════ strength */

function register(result, section) {
  const f = section.facts;
  const rows = section.rows;
  const words = LEVEL_WORDS[section.level];
  const byMembers = [...rows].sort((a, b) => b.members - a.members);
  const top5 = sum(byMembers.slice(0, 5), "members");
  const numbers = [
    { label: "Members", value: fmtInt(f.members), note: `across ${count(f.places, section.level)}` },
    { label: "Held by the top five", value: fmtPct(pctOf(top5, f.members)), note: "how concentrated the register is" },
    { label: `Middle ${words.one}`, value: fmtInt(median(values(rows, "members"))), note: "members" },
  ];
  if (f.perThousand !== null) numbers.push({ label: "Per 1,000 registered voters", value: fmtInt(f.perThousand), note: "across the ground" });
  numbers.push({ label: "Thin or bare", value: fmtInt(f.thin), note: `of ${count(f.places, section.level)}`, tone: f.thin ? "warn" : undefined });
  if (f.empty) numbers.push({ label: "No members at all", value: fmtInt(f.empty), note: count(f.empty, section.level), tone: "warn" });
  if (!f.weakFirst && !f.against) {
    if (f.women !== null) numbers.push({ label: "Women", value: fmtPct(f.women), note: "of members" });
    if (f.young !== null) numbers.push({ label: "Aged 18 to 35", value: fmtPct(f.young), note: "of members" });
  }

  const findings = [];
  const concentration = pctOf(top5, f.members);
  if (concentration !== null && rows.length > 10) {
    findings.push(
      concentration >= 40
        ? `The register is concentrated: the five largest ${words.many} hold ${fmtPct(concentration)} of all members, so the organisation leans on a few places.`
        : `The register is spread: the five largest ${words.many} hold ${fmtPct(concentration)} of all members.`
    );
  }

  /* Where the register is thin or thick, zone by zone — part of "where" in
     any question about the register across the country. */
  if (section.level === "state" && zonesIn(rows) >= 2) {
    const rated = byZone(rows, (inZone) => ({ rate: (sum(inZone, "members") / (sum(inZone, "registered") || 1)) * 1000 })).sort((a, b) => b.rate - a.rate);
    findings.push(
      `By zone, per 1,000 registered voters: thinnest in ${rated[rated.length - 1].zone} (${fmtInt(rated[rated.length - 1].rate)}), densest in ${rated[0].zone} (${fmtInt(rated[0].rate)}).`
    );
  }

  let breakdown;
  if (section.level === "state" && zonesIn(rows) >= 2 && !f.weakFirst) {
    const zones = byZone(rows, (inZone) => ({ members: sum(inZone, "members"), registered: sum(inZone, "registered") }));
    breakdown = {
      title: f.against ? "Members per 1,000 voters, by zone" : "Members by zone",
      bars: zones.map((zone) =>
        f.against
          ? { label: zone.zone, value: (zone.members / zone.registered) * 1000, display: `${fmtInt((zone.members / zone.registered) * 1000)} per 1,000`, tone: "held" }
          : { label: zone.zone, value: zone.members, display: fmtInt(zone.members), tone: "held" }
      ),
    };
  } else {
    const measure = f.perThousand !== null && section.level !== "ward" && section.level !== "unit" ? "per_thousand" : "members";
    const pick = f.weakFirst ? rows.filter((row) => row.members > 0).slice(0, 10) : byMembers.slice(0, 10);
    breakdown = {
      title: f.weakFirst
        ? `Thinnest ${words.many}, ${measure === "per_thousand" ? "members per 1,000 voters" : "members"}`
        : `Largest ${words.many}, members`,
      bars: pick.map((row) => ({
        label: named(row, result.scope.name),
        value: row[measure],
        display: measure === "per_thousand" ? `${fmtInt(row[measure])} per 1,000` : fmtInt(row[measure]),
        tone: f.weakFirst ? "reach" : "held",
      })),
    };
  }
  return { numbers, breakdown, findings };
}

function vote(result, section) {
  const f = section.facts;
  const rows = section.rows;
  const numbers = [];
  const findings = [];
  const competitive = rows.filter((row) => row.margin !== null && row.margin < 10);
  if (f.standalone) {
    numbers.push({ label: `${f.party} share, ${f.year}`, value: fmtPct(f.share), note: `${fmtInt(f.votes)} votes` });
    numbers.push({ label: "Place across the ground", value: ordinal(f.place), note: "among the parties that stood" });
    numbers.push({ label: `${f.level === "zone" ? "Zones" : "States"} carried`, value: fmtInt(f.carried), note: `of ${fmtInt(f.places)}` });
    numbers.push({ label: "At 25% or more", value: fmtInt(f.quarter), note: `of ${fmtInt(f.places)}` });
  }
  numbers.push({ label: "Competitive (margin under 10 pts)", value: fmtInt(competitive.length), note: `of ${fmtInt(rows.length)}` });
  if (competitive.length && competitive.length <= 8) {
    findings.push(`Competitive — decided by under ten points: ${listOf(competitive.sort((a, b) => a.margin - b.margin).map((row) => `${row.name} (${row.winner} by ${fmtPts(row.margin).replace("+", "")})`), 8)}.`);
  }
  return {
    numbers,
    breakdown: {
      title: `The ${f.year} vote across ${result.scope.name}`,
      bars: [...f.standings, ...(f.others !== null ? [{ id: "Others", share: f.others }] : [])].map((entry) => ({
        label: entry.id,
        value: entry.share,
        max: 100,
        display: fmtPct(entry.share),
        tone: entry.id === f.party ? "held" : "beyond",
      })),
    },
    findings,
  };
}

/* ══════════════════════════════════════════════════════════════ scenario */

function scenario(result, section) {
  const f = section.facts;
  const rows = section.rows;
  const T = 25;
  const nearLine = rows.filter((row) => row.share < T && row.share >= T - 3);
  const numbers = [
    { label: "Projected national share", value: fmtPct(f.share), note: `${fmtInt(f.votes)} votes` },
    { label: "States carried", value: fmtInt(f.states), note: "of 37" },
    { label: "States over 25%", value: `${f.quarterStates} of 36`, note: "24 needed", tone: f.shortBy ? "warn" : undefined },
    { label: "States changing hands", value: fmtInt(f.flipped.length), note: "won that were lost" },
    { label: "Within 3 pts of 25%", value: fmtInt(nearLine.length), note: "the next to fall either way" },
  ];
  const findings = [];
  if (nearLine.length) findings.push(`Just under 25% even after the swing: ${listOf(nearLine.map((row) => `${row.name} ${fmtPct(row.share)}`), 6)}.`);
  const zones = byZone(rows, (inZone) => ({ clears: inZone.filter((row) => row.clears).length }));
  return {
    numbers,
    breakdown: { title: "States over 25% after the swing, by zone", bars: zones.map((zone) => ({ label: zone.zone, value: zone.clears, max: zone.rows.length, display: `${zone.clears} of ${zone.rows.length}`, tone: "held" })) },
    findings,
  };
}

/* ══════════════════════════════════════════════════════════════ outlook */

function outlookInsight(result, section) {
  const f = section.facts;
  const numbers = [
    { label: "Votes behind the leader", value: f.gap > 0 ? fmtInt(f.gap) : "None", note: `${f.leaderId}, ${f.year}`, tone: f.gap > 0 ? "warn" : undefined },
    { label: "States at 25%+", value: `${f.quarter} of 36`, note: "24 needed", tone: f.quarter < 24 ? "warn" : undefined },
    { label: "Swing to lead the count", value: f.swingLead === null ? "Over 30 pts" : `${f.swingLead} pts`, note: "uniform, on 2023" },
    { label: "Swing to meet the spread", value: f.swingSpread === null ? "Over 30 pts" : `${f.swingSpread} pts`, note: "uniform, on 2023" },
    ...(f.moved !== null ? [{ label: `His change, ${f.prev} to ${f.year}`, value: fmtPts(f.moved), note: "national share" }] : []),
    { label: "Registered in the states to defend and target", value: fmtInt(f.focusRegister), note: `${f.roles.defend.length + f.roles.target.length} states` },
    { label: "Stayed home in the top 100 polling units", value: fmtInt(f.stayedHomeUnits), note: "2023, estimated" },
  ];
  return {
    numbers,
    breakdown: {
      title: "Every state, by its role",
      bars: [
        { label: "Base — hold", value: f.roles.base.length, max: 37, display: fmtInt(f.roles.base.length), tone: "held" },
        { label: "Defend", value: f.roles.defend.length, max: 37, display: fmtInt(f.roles.defend.length), tone: "cleared" },
        { label: "Target", value: f.roles.target.length, max: 37, display: fmtInt(f.roles.target.length), tone: "reach" },
        { label: "Out of reach", value: f.roles.out.length, max: 37, display: fmtInt(f.roles.out.length), tone: "beyond" },
      ],
    },
    findings: [],
  };
}

/* ══════════════════════════════════════════════════════════════ ground */

function groundInsight(result, section) {
  const f = section.facts;
  const words = LEVEL_WORDS[f.level];
  const numbers = [
    { label: "Registered voters in the set", value: fmtInt(f.registerSet), note: `of ${fmtInt(f.registerAll)}` },
    { label: "Share of the register", value: fmtPct(pctOf(f.registerSet, f.registerAll)), note: `in ${fmtPct(pctOf(f.size, f.places))} of the ${words.many}` },
    { label: `Average ${words.one} in the set`, value: fmtInt(f.averageSet), note: `against ${fmtInt(f.averageAll)} overall` },
    { label: "Turnout, set against the rest", value: `${fmtPct(f.turnoutSet)} / ${fmtPct(f.turnoutRest)}`, note: "2023" },
    { label: "Votes cast in the set, 2023", value: fmtInt(f.castSet), note: "estimated below the state" },
  ];
  if (f.atiku) numbers.push({ label: "Atiku's votes in the set", value: fmtInt(f.atiku.votesIn), note: `${fmtPct(f.atiku.share)} of the votes cast there` });
  return {
    numbers,
    breakdown: {
      title: `The ${fmtInt(f.size)} by zone`,
      bars: f.byZone.map(([zone, n]) => ({ label: zone, value: n, display: fmtInt(n), tone: "held" })),
    },
    findings: [],
  };
}

/* ══════════════════════════════════════════════════════════════ research */

function researchInsight(result, section) {
  const f = section.facts;
  const runs = f.runs;
  const shares = runs.map((run) => run.share).filter((value) => value !== null);
  const first = runs[0];
  const latest = runs[runs.length - 1];
  const numbers = [
    { label: "Runs", value: fmtInt(runs.length), note: runs.map((run) => run.year).join(", ") },
    { label: "Best share", value: fmtPct(f.best.share), note: `${f.best.year}` },
    { label: "Average share", value: fmtPct(mean(shares)), note: "across every run" },
    ...(runs.length > 1 ? [{ label: `Change, ${first.year} to ${latest.year}`, value: fmtPts(latest.share - first.share), note: "national share" }] : []),
    ...(f.mappedYears.length ? [{ label: "Carried in every mapped run", value: fmtInt(f.always.length), note: f.mappedYears.join(", ") }] : []),
    ...(latest.quarter !== null ? [{ label: `States at 25%+, ${latest.year}`, value: `${latest.quarter} of 36`, note: "24 needed", tone: latest.quarter < 24 ? "warn" : undefined }] : []),
  ];
  return {
    numbers,
    breakdown: {
      title: `${f.short}'s national share, run by run`,
      bars: runs.map((run) => ({ label: `${run.year} ${f.candidate ? run.party : run.candidate.split(" ").pop()}`, value: run.share, max: 100, display: fmtPct(run.share), tone: run.won ? "held" : "reach" })),
    },
    findings: [],
  };
}

/* ══════════════════════════════════════════════════════════════ the door */

/**
 * The analysis for a result, or null where there is nothing more to say than
 * the table already does.
 *
 * @returns {null | { numbers: {label,value,note,tone?}[], breakdown: {title,bars,line?,signed?} | null, findings: string[] }}
 */
export function analyse(result) {
  const found = analyseRaw(result);
  /* A breakdown with one bar is a sentence, not a picture; the numbers say it. */
  if (found?.breakdown && (found.breakdown.bars?.length ?? 0) < 2) found.breakdown = null;
  return found;
}

function analyseRaw(result) {
  const section = result.sections?.[0];
  if (!section) return null;
  try {
    switch (section.facts?.kind) {
      case "reach":
        return reach(result, section);
      case "list":
        return list(result, section);
      case "target":
        return target(result, section);
      case "swing":
        return swing(result, section);
      case "profile-state":
        return profile(result, section, result.sections);
      case "strength-register":
        return register(result, section);
      case "strength-vote":
        return vote(result, section);
      case "scenario":
        return scenario(result, section);
      case "research":
        return researchInsight(result, section);
      case "ground":
        return groundInsight(result, section);
      case "outlook":
        return outlookInsight(result, section);
      case "national":
        return nationalInsight(result, section);
      case "governors":
        return governorInsight(result, section);
      case "coalition":
        return coalitionInsight(result, section);
      case "rules":
        return rulesInsight(result, section);
      default:
        return null;
    }
  } catch (error) {
    /* Analysis explains an answer; it never costs one. */
    console.error("[ask] analysis failed:", error);
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════ contests */

function nationalInsight(result, section) {
  const f = section.facts;
  const [first, second] = f.rows;
  const t = result.sections.find((entry) => entry.facts?.kind === "results")?.facts ?? null;
  const numbers = [
    { label: f.regional ? `Led ${f.place}` : `Won ${f.year}`, value: `${first.party}`, note: first.candidate },
    { label: "Votes", value: fmtInt(first.votes), note: fmtPct(first.share) },
    ...(second ? [{ label: "Margin over second", value: fmtInt(first.votes - second.votes), note: `${second.party}, ${fmtPct(second.share)}` }] : []),
    ...(first.quarter !== null && first.quarter !== undefined && !f.regional ? [{ label: "States at 25%+", value: `${first.quarter} of 36`, note: "24 needed" }] : []),
    ...(t?.closest?.[0] ? [{ label: "Closest state", value: t.closest[0].name, note: `${t.closest[0].winner} by ${fmtPts(t.closest[0].margin).replace("+", "")}` }] : []),
  ];
  return {
    numbers,
    breakdown: {
      title: t ? "States carried, by party" : "Share of the vote",
      bars: t
        ? t.carried.map((entry, index) => ({ label: entry.party, value: entry.states, max: t.carried.reduce((sum, e) => sum + e.states, 0), display: fmtInt(entry.states), tone: index === 0 ? "held" : "cleared" }))
        : f.rows.slice(0, 5).map((row, index) => ({ label: row.party, value: row.share ?? 0, max: 100, display: fmtPct(row.share), tone: index === 0 ? "held" : "cleared" })),
    },
    findings: [],
  };
}

function governorInsight(result, section) {
  const f = section.facts;
  if (f.one) {
    return {
      numbers: [
        { label: "Governor", value: f.one.governor, note: f.one.name },
        { label: "Elected under", value: f.one.elected, note: f.one.voted_on },
        { label: "Sits under", value: f.one.current, note: f.one.moved_on ? `since ${f.one.moved_on}` : "unchanged" },
      ],
      breakdown: null,
      findings: [],
    };
  }
  return {
    numbers: [
      { label: "Largest party", value: f.seatsNow[0].party, note: `${fmtInt(f.seatsNow[0].count)} of ${fmtInt(f.states)} states` },
      { label: "Governors who changed party", value: fmtInt(f.moved.length), note: "since elected, settled moves" },
      { label: "As elected, largest", value: f.seatsElected[0].party, note: `${fmtInt(f.seatsElected[0].count)} states` },
    ],
    breakdown: {
      title: "Governors by party, now",
      bars: f.seatsNow.map((entry, index) => ({ label: entry.party, value: entry.count, max: f.states, display: fmtInt(entry.count), tone: index === 0 ? "held" : "cleared" })),
    },
    findings: [],
  };
}

function coalitionInsight(result, section) {
  const f = section.facts;
  return {
    numbers: [
      { label: "Pooled votes", value: fmtInt(f.pooled), note: `${fmtPct(f.pooledShare)} of the valid vote` },
      ...(f.outside ? [{ label: `Against the ${f.outside.id}`, value: `${f.pooled > f.outside.votes ? "+" : "−"}${fmtInt(Math.abs(f.pooled - f.outside.votes))}`, note: `${fmtInt(f.outside.votes)}, ${fmtPct(f.outside.share)}`, tone: f.pooled > f.outside.votes ? undefined : "warn" }] : []),
      { label: "States at 25%+", value: `${f.quarter} of 36`, note: "24 needed", tone: f.quarter < 24 ? "warn" : undefined },
      { label: "States carried", value: `${fmtInt(f.carried)} of ${fmtInt(f.states)}`, note: "on the pooled vote" },
      ...(f.keepToLead !== null && f.pooled > (f.outside?.votes ?? 0) ? [{ label: "Must keep, to lead", value: fmtPct(f.keepToLead * 100), note: "of the combined vote" }] : []),
    ],
    breakdown: {
      title: "Every state, pooled",
      bars: [
        { label: "Carried", value: section.rows.filter((row) => row.status === "held").length, max: section.rows.length, display: fmtInt(section.rows.filter((row) => row.status === "held").length), tone: "held" },
        { label: "25% or more", value: section.rows.filter((row) => row.status === "cleared").length, max: section.rows.length, display: fmtInt(section.rows.filter((row) => row.status === "cleared").length), tone: "cleared" },
        { label: "Under 25%", value: section.rows.filter((row) => row.status === "beyond").length, max: section.rows.length, display: fmtInt(section.rows.filter((row) => row.status === "beyond").length), tone: "beyond" },
      ],
    },
    findings: [],
  };
}

function rulesInsight(result, section) {
  const f = section.facts;
  return {
    numbers: [
      { label: "States needed at 25%", value: "24 of 36", note: "two-thirds" },
      { label: `Winner, ${f.year}`, value: f.winner.party, note: `${fmtInt(f.winner.votes)} votes` },
      { label: "Winner's spread", value: `${f.winner.quarter} states`, note: "at 25% or more" },
    ],
    breakdown: {
      title: `States at 25% or more, ${f.year}`,
      bars: f.rows.slice(0, 5).map((row) => ({ label: row.party, value: row.quarter, max: 36, display: fmtInt(row.quarter), tone: row.quarter >= 24 ? "held" : "beyond" })),
    },
    findings: [],
  };
}
