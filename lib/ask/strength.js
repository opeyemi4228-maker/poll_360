import { ELECTIONS } from "../strongholds.js";
import { normaliseName } from "../stronghold-map.js";
import { STRONGHOLDS } from "../data/strongholds-index.js";
import { coveredStates, loadDetail, registerFor, strengthBand, STRENGTH_OF } from "../members.js";
import { ZONES } from "../zones.js";
import { LGA_NAMES, STATE_LIST, ZONE_NAMES, deepRows, stateByCode } from "./ground.js";
import { count, fmtInt, fmtPct } from "./format.js";

/**
 * How strong a party is, somewhere: its vote, and its register.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO MEASUREMENTS, SIDE BY SIDE, NEVER SUMMED
 *
 *  lib/members.js is emphatic, and this keeps its rule: a member is somebody
 *  who filled in a form, a vote is a mark on a ballot, and neither is a
 *  forecast of the other. So a strength answer is two tables —
 *
 *    THE VOTE      every party's share, state by state or zone by zone, from
 *                  the declared results. Counted.
 *    THE REGISTER  the party's own members, from its register, down to the
 *                  polling unit — only for a party whose register Poll360
 *                  holds. Members, not votes.
 *
 *  — and the only thing ever set against the register is the number of
 *  registered voters in the same place, as members per thousand voters: a
 *  measure of how organised the party is there, and said as exactly that.
 * ══════════════════════════════════════════════════════════════════════════
 */

const STATE_REGISTERED = new Map(STRONGHOLDS.states.map((state) => [state.code, state.f[0]]));
const LGA_REGISTERED = new Map(
  STRONGHOLDS.states.flatMap((state) => state.lgas.map((lga) => [`${state.code}:${normaliseName(lga.name)}`, lga.f[0]]))
);

export const hasRegister = (party) => coveredStates(party).length > 0;

/* ══════════════════════════════════════════════════════════════ the vote */

function voteSection({ partyId, year, scope, byZone }) {
  const election = ELECTIONS.find((entry) => entry.year === year && entry.stateLevel);
  if (!election) return null;
  const parties = election.parties;
  const own = parties.find((party) => party.id === partyId) ?? null;

  const places = byZone
    ? ZONE_NAMES.map((zone) => ({ code: zone, name: zone, zone, members: ZONES[zone] }))
    : STATE_LIST.filter((state) => !scope.states || scope.states.includes(state.code)).map((state) => ({
        code: state.code,
        name: state.name,
        zone: state.zone,
        members: [state.code],
      }));

  const rows = places.map((place) => {
    const tally = {};
    let total = 0;
    let registered = 0;
    for (const row of election.rows.filter((entry) => place.members.includes(entry.code))) {
      for (const [id, n] of Object.entries(row.votes)) tally[id] = (tally[id] ?? 0) + n;
      total += row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
      registered += row.registered ?? 0;
    }
    const ranked = Object.entries(tally).filter(([id]) => id !== "OTH").sort((a, b) => b[1] - a[1]);
    const shares = Object.fromEntries(parties.map((party) => [`p_${party.id}`, total ? ((tally[party.id] ?? 0) / total) * 100 : null]));
    return {
      key: place.code,
      name: place.name,
      zone: place.zone,
      ...shares,
      votes: own ? tally[own.id] ?? 0 : null,
      winner: ranked[0]?.[0] ?? null,
      margin: total && ranked[1] ? ((ranked[0][1] - ranked[1][1]) / total) * 100 : null,
      turnout: registered && total ? (total / registered) * 100 : null,
      __tally: tally,
      __total: total,
    };
  });

  const subjectKey = own ? `p_${own.id}` : "p_OTH";
  rows.sort((a, b) => (b[subjectKey] ?? -1) - (a[subjectKey] ?? -1));
  rows.forEach((row, index) => (row.rank = index + 1));

  /* The ground as a whole: every party's votes added across it. */
  const tally = {};
  let total = 0;
  for (const row of rows) {
    for (const [id, n] of Object.entries(row.__tally)) tally[id] = (tally[id] ?? 0) + n;
    total += row.__total;
  }
  const standings = parties
    .map((party) => ({ id: party.id, name: party.name, candidate: party.candidate, votes: tally[party.id] ?? 0, share: total ? ((tally[party.id] ?? 0) / total) * 100 : 0 }))
    .sort((a, b) => b.votes - a.votes);
  const carried = Object.fromEntries(parties.map((party) => [party.id, rows.filter((row) => row.winner === party.id).length]));
  const mine = own ? standings.find((entry) => entry.id === own.id) : null;
  const place = standings.findIndex((entry) => entry.id === own?.id) + 1;
  const level = byZone ? "zone" : "state";

  const partyColumns = [
    ...(own ? [own] : []),
    ...parties.filter((party) => party.id !== own?.id),
  ].map((party) => ({
    key: `p_${party.id}`,
    label: party.id === "OTH" ? "Others" : party.id,
    kind: party.id === own?.id ? "bar" : "pct",
    threshold: party.id === own?.id ? 25 : undefined,
  }));

  for (const row of rows) {
    delete row.__tally;
    delete row.__total;
  }

  return {
    level,
    title: `The vote, ${year}: every party ${byZone ? "zone by zone" : "state by state"}`,
    provenance: "counted",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      { key: "name", label: byZone ? "Zone" : "State", kind: "text", main: true },
      ...(byZone ? [] : [{ key: "zone", label: "Zone", kind: "text" }]),
      ...partyColumns,
      { key: "winner", label: "Carried by", kind: "text" },
      { key: "margin", label: "Margin", kind: "pts" },
      { key: "turnout", label: "Turnout", kind: "pct" },
    ],
    rows,
    total: rows.length,
    read: rows.length,
    tiles: own
      ? [
          { label: `${own.id} share, ${year}`, value: fmtPct(mine.share), sub: `${fmtInt(mine.votes)} votes · ${ordinal(place)} of ${standings.length - (tally.OTH ? 1 : 0)}` },
          { label: "Carried", value: fmtInt(carried[own.id] ?? 0), sub: `of ${count(rows.length, level)}` },
          { label: "At 25% or more", value: fmtInt(rows.filter((row) => (row[subjectKey] ?? 0) >= 25).length), sub: `of ${count(rows.length, level)}` },
          { label: "Leads the ground", value: standings[0].id, sub: `${fmtPct(standings[0].share)} across it` },
        ]
      : [
          { label: `Leads the ground, ${year}`, value: standings[0].id, sub: `${fmtPct(standings[0].share)} of the vote` },
          { label: "Other parties together", value: fmtPct(standings.find((entry) => entry.id === "OTH")?.share ?? 0), sub: "where this party's vote is counted" },
          { label: "Second", value: standings[1]?.id ?? "—", sub: standings[1] ? fmtPct(standings[1].share) : "" },
          { label: "Places read", value: fmtInt(rows.length), sub: count(rows.length, level) },
        ],
    facts: {
      kind: "strength-vote",
      year,
      party: partyId,
      standalone: Boolean(own),
      share: mine?.share ?? null,
      votes: mine?.votes ?? null,
      place: own ? place : null,
      carried: carried[own?.id] ?? 0,
      quarter: own ? rows.filter((row) => (row[subjectKey] ?? 0) >= 25).length : null,
      places: rows.length,
      level,
      standings: standings.filter((entry) => entry.id !== "OTH").slice(0, 4),
      others: standings.find((entry) => entry.id === "OTH")?.share ?? null,
      best: own ? rows.slice(0, 5).map((row) => ({ name: row.name, share: row[subjectKey] })) : [],
      /* Never the same place in both lists, however few places there are. */
      worst: own ? rows.slice(Math.max(5, rows.length - 3)).reverse().map((row) => ({ name: row.name, share: row[subjectKey] })) : [],
    },
  };
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/* ══════════════════════════════════════════════════════════════ the register */

const sumOf = (object) => Object.values(object ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

function profileOf(held) {
  const gender = held?.gender ?? {};
  const ages = held?.ages ?? {};
  const sexed = (gender.female ?? 0) + (gender.male ?? 0);
  const aged = sumOf(ages);
  return {
    women: sexed ? ((gender.female ?? 0) / sexed) * 100 : null,
    young: aged ? (((ages["18_25"] ?? 0) + (ages["26_35"] ?? 0)) / aged) * 100 : null,
    minors: ages.u18 ?? null,
    gender,
    ages,
  };
}

function addInto(target, held) {
  for (const [key, n] of Object.entries(held?.gender ?? {})) target.gender[key] = (target.gender[key] ?? 0) + n;
  for (const [key, n] of Object.entries(held?.ages ?? {})) target.ages[key] = (target.ages[key] ?? 0) + n;
}

/* ── PAIRING THE REGISTER'S NAMES WITH INEC'S ──────────────────────────────
   The register spells local governments the way members wrote them —
   "Dambatta", "Yamaltu/Deba", "Shagamu" — and INEC spells them its own way.
   Paired within a state: the same letters first, then the closest spelling,
   and never a pair so far apart it is a guess. An INEC local government left
   unpaired has nobody on the register; a register name left unpaired keeps
   its members under its own name rather than losing them. */
const squash = (text) =>
  String(text ?? "")
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/municipal(ity)?|area council|\bm\.?\s*c\.?$/g, "")
    .replace(/[^a-z]/g, "")
    .replace(/(.)\1+/g, "$1");

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const held = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = held;
    }
  }
  return row[b.length];
}

const RENAMED = { yewanorth: "egbadonorth", yewasouth: "egbadosouth" };

function pairLgas(inecNames, registerNames) {
  const pairs = new Map();
  let free = [...registerNames];
  for (const name of inecNames) {
    const key = squash(name);
    const found = free.find((other) => (RENAMED[squash(other)] ?? squash(other)) === key);
    if (found) {
      pairs.set(name, found);
      free = free.filter((other) => other !== found);
    }
  }
  const options = [];
  for (const name of inecNames.filter((entry) => !pairs.has(entry))) {
    for (const other of free) {
      const a = squash(name);
      const b = squash(other);
      options.push({ name, other, cost: distance(a, b) / Math.max(a.length, b.length, 1), prefix: a.startsWith(b) || b.startsWith(a) });
    }
  }
  options.sort((x, y) => x.cost - y.cost);
  for (const option of options) {
    if (pairs.has(option.name) || !free.includes(option.other)) continue;
    if (option.cost > 0.34 && !option.prefix) continue;
    pairs.set(option.name, option.other);
    free = free.filter((other) => other !== option.other);
  }
  return { pairs, unpaired: free };
}

/* Atiku's 2023 share where it can be read: counted at the state, estimated
   in a local government. The only thing a register is ever set beside. */
function atikuShares() {
  const states = new Map();
  const lgas = new Map();
  const election = ELECTIONS.find((entry) => entry.year === 2023);
  for (const row of election.rows) {
    const total = row.total ?? Object.values(row.votes).reduce((sum, n) => sum + n, 0);
    states.set(row.code, total ? ((row.votes.PDP ?? 0) / total) * 100 : null);
  }
  for (const state of STRONGHOLDS.states) {
    for (const lga of state.lgas) {
      const share = lga.f[3];
      lgas.set(`${state.code}:${lga.name}`, share === null || share === undefined ? null : share / 10);
    }
  }
  return { states, lgas };
}

const median = (values) => {
  const list = values.filter((value) => value !== null && value !== undefined && Number.isFinite(value)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = list.length >> 1;
  return list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
};

/* ── THE REGISTER AGAINST THE VOTE, AS FOUR KINDS OF PLACE ────────────────
   Members per thousand voters against Atiku's share, each read against its
   own middle value across the places listed. Four answers a planner acts on
   differently — and not one of them adds a member to a vote. */
const QUADRANT = {
  both: { label: "Organised and voting", tone: "held" },
  organised: { label: "Organised, not voting", tone: "reach" },
  voting: { label: "Voting, not organised", tone: "slipped" },
  neither: { label: "Neither yet", tone: "beyond" },
};

async function registerSection({ partyId, level, scope, sort = null, against = null }) {
  const states = coveredStates(partyId).filter((code) => !scope.states || scope.states.includes(code));
  if (!states.length) return null;
  const heldLgaKeys = scope.lgas ? new Set(scope.lgas) : null;
  const shares = against === "vote" ? atikuShares() : null;

  const rows = [];
  for (const code of states) {
    if (level === "ward" || level === "unit") await loadDetail(partyId, code);
    const register = registerFor(partyId, code);
    if (!register) continue;
    const state = stateByCode(code);
    const inec = LGA_NAMES.filter((lga) => lga.stateCode === code);
    const { pairs, unpaired } = pairLgas(inec.map((lga) => lga.name), Object.keys(register.lgas ?? {}));
    const inGround = (lga) => !heldLgaKeys || heldLgaKeys.has(lga.key);

    /* Each INEC local government with what the register holds for it —
       nothing, where nobody signed up. */
    const lgas = inec.filter(inGround).map((lga) => ({ inec: lga, name: lga.name, held: pairs.has(lga.name) ? register.lgas[pairs.get(lga.name)] : null }));
    if (!heldLgaKeys) for (const name of unpaired) lgas.push({ inec: null, name, held: register.lgas[name] });

    if (level === "state") {
      const whole = { gender: {}, ages: {} };
      let members = 0;
      for (const { held } of lgas) {
        members += held?.members ?? 0;
        if (held) addInto(whole, held);
      }
      if (!heldLgaKeys) members = register.members ?? members;
      rows.push({
        key: code,
        name: state.name,
        zone: state.zone,
        state: state.name,
        members,
        registered: STATE_REGISTERED.get(code) ?? null,
        atiku: shares?.states.get(code) ?? null,
        ...profileOf(whole),
      });
    } else if (level === "lga") {
      for (const { inec: lga, name, held } of lgas) {
        rows.push({
          key: lga?.key ?? `${code}:${name}`,
          name,
          lga: name,
          state: state.name,
          zone: state.zone,
          members: held?.members ?? 0,
          registered: lga ? LGA_REGISTERED.get(`${code}:${normaliseName(lga.name)}`) ?? null : null,
          atiku: lga && shares ? shares.lgas.get(`${code}:${lga.name}`) ?? null : null,
          empty: !held,
          ...profileOf(held),
        });
      }
    } else {
      for (const { name: lgaName, held } of lgas) {
        for (const [wardName, ward] of Object.entries(held?.wards ?? {})) {
          if (level === "ward") {
            rows.push({ key: `${code}:${lgaName}:${wardName}`, name: wardName, ward: wardName, lga: lgaName, state: state.name, zone: state.zone, members: ward.members ?? 0, registered: null, ...profileOf(ward) });
          } else {
            for (const [unitName, members] of Object.entries(ward.units ?? {})) {
              rows.push({ key: `${code}:${lgaName}:${wardName}:${unitName}`, name: unitName, ward: wardName, lga: lgaName, state: state.name, zone: state.zone, members, registered: null, women: null, young: null, minors: null });
            }
          }
        }
      }
    }
  }

  const whole = rows.reduce((sum, row) => sum + (row.members ?? 0), 0) || 1;
  for (const row of rows) {
    row.share = (row.members / whole) * 100;
    row.band = row.members === 0 ? "BARE" : strengthBand(row.members, row.share, rows.length);
    row.band_label = row.members === 0 ? "No members" : row.band ? STRENGTH_OF[row.band].label : null;
    row.per_thousand = row.registered ? (row.members / row.registered) * 1000 : null;
  }

  if (against === "vote") {
    const midMembers = median(rows.map((row) => row.per_thousand));
    const midShare = median(rows.map((row) => row.atiku));
    for (const row of rows) {
      if (row.per_thousand === null || row.atiku === null || midMembers === null || midShare === null) continue;
      const organised = row.per_thousand >= midMembers;
      const voting = row.atiku >= midShare;
      row.quadrant = organised && voting ? "both" : organised ? "organised" : voting ? "voting" : "neither";
      row.status = QUADRANT[row.quadrant].tone;
      row.status_label = QUADRANT[row.quadrant].label;
    }
  }

  /* ── WEAKEST FIRST, FAIRLY ─────────────────────────────────────────────
     A small local government has fewer members because it has fewer people.
     Weakness is read per thousand registered voters wherever that is known,
     and by count only below it. */
  const weakFirst = sort?.dir === "asc";
  const measure = rows.some((row) => row.per_thousand !== null) ? "per_thousand" : "members";
  rows.sort((a, b) => {
    const x = a[measure] ?? (weakFirst ? Infinity : -Infinity);
    const y = b[measure] ?? (weakFirst ? Infinity : -Infinity);
    return weakFirst ? x - y || a.members - b.members : b.members - a.members;
  });
  rows.forEach((row, index) => (row.rank = index + 1));

  const deep = level === "ward" || level === "unit";

  /* ── THE REGISTER'S WARDS ARE THE PARTY'S SPELLINGS ─────────────────────
     Members wrote their ward by hand, and the register keeps what they wrote,
     so one INEC ward can arrive under several names. The count is compared
     with INEC's so nobody reads 2,298 "wards" in Kano as 2,298 places. */
  let inecPlaces = null;
  if (deep) {
    const official = await deepRows(level, { states, lgaKeys: scope.lgas });
    inecPlaces = official.scanned ?? official.length;
  }

  const placeColumns = {
    state: [{ key: "name", label: "State", kind: "text", main: true }, { key: "zone", label: "Zone", kind: "text" }],
    lga: [{ key: "name", label: "Local government", kind: "text", main: true }, { key: "state", label: "State", kind: "text" }],
    ward: [{ key: "name", label: "Ward", kind: "text", main: true }, { key: "lga", label: "Local government", kind: "text" }, { key: "state", label: "State", kind: "text" }],
    unit: [{ key: "name", label: "Polling unit", kind: "text", main: true }, { key: "ward", label: "Ward", kind: "text" }, { key: "lga", label: "Local government", kind: "text" }, { key: "state", label: "State", kind: "text" }],
  }[level];

  const heavy = rows.filter((row) => row.band === "HEAVY").length;
  const thin = rows.filter((row) => row.band === "BARE" || row.band === "THIN").length;
  const empty = rows.filter((row) => row.members === 0).length;
  const minors = rows.reduce((sum, row) => sum + (row.minors ?? 0), 0);
  const withRegister = rows.filter((row) => row.registered);
  const perThousand = withRegister.length
    ? (withRegister.reduce((sum, row) => sum + row.members, 0) / withRegister.reduce((sum, row) => sum + row.registered, 0)) * 1000
    : null;
  const quadrants = against === "vote"
    ? Object.fromEntries(Object.keys(QUADRANT).map((id) => [id, rows.filter((row) => row.quadrant === id).length]))
    : null;
  const pick = (row) => ({ name: row.name, state: row.state, members: row.members, share: row.share, perThousand: row.per_thousand, atiku: row.atiku ?? null });

  return {
    level,
    title: against === "vote"
      ? `The ${partyId} register against Atiku's 2023 vote, by ${level === "lga" ? "local government" : level}`
      : `The register: ${partyId} members by ${level === "lga" ? "local government" : level === "unit" ? "polling unit" : level}${weakFirst ? ", weakest first" : ""}`,
    provenance: "register",
    columns: [
      { key: "rank", label: "#", kind: "int" },
      ...placeColumns,
      { key: "members", label: "Members", kind: "int" },
      ...(deep ? [] : [{ key: "per_thousand", label: "Per 1,000 voters", kind: "int" }]),
      ...(against === "vote" ? [
        { key: "atiku", label: level === "state" ? "Atiku 2023 (counted)" : "Atiku 2023 (est.)", kind: "bar", threshold: 25 },
        { key: "status", label: "Register against vote", kind: "status" },
      ] : []),
      { key: "share", label: "Share of the ground", kind: "pct" },
      { key: "band_label", label: "Strength", kind: "text" },
      ...(level === "unit" || against === "vote" ? [] : [
        { key: "women", label: "Women", kind: "pct" },
        { key: "young", label: "Aged 18–35", kind: "pct" },
        { key: "minors", label: "Under 18", kind: "int" },
      ]),
    ],
    rows,
    total: rows.length,
    read: rows.length,
    tiles: weakFirst
      ? [
          { label: "Weakest", value: rows[0]?.name ?? "—", sub: rows[0] ? `${fmtInt(rows[0].members)} members${rows[0].per_thousand !== null ? `, ${fmtInt(rows[0].per_thousand)} per 1,000 voters` : ""}` : "", tone: "warn" },
          { label: "Thin or bare", value: fmtInt(thin), sub: `of ${count(rows.length, level)}`, tone: thin ? "warn" : undefined },
          { label: "No members at all", value: fmtInt(empty), sub: empty ? count(empty, level) : "every place has someone" },
          perThousand !== null
            ? { label: "Across the ground", value: `${fmtInt(perThousand)} per 1,000`, sub: `${fmtInt(whole)} members against the voters' register` }
            : { label: `${partyId} members`, value: fmtInt(whole), sub: `across ${count(rows.length, level)}` },
        ]
      : against === "vote"
        ? [
            { label: "Organised and voting", value: fmtInt(quadrants.both), sub: "hold these" },
            { label: "Organised, not voting", value: fmtInt(quadrants.organised), sub: "members to turn into votes", tone: "warn" },
            { label: "Voting, not organised", value: fmtInt(quadrants.voting), sub: "votes with no structure under them" },
            { label: "Neither yet", value: fmtInt(quadrants.neither), sub: count(quadrants.neither, level) },
          ]
        : [
            { label: `${partyId} members`, value: fmtInt(whole), sub: `across ${count(rows.length, level)}` },
            { label: "Heaviest", value: rows[0]?.name ?? "—", sub: rows[0] ? `${fmtInt(rows[0].members)} members, ${fmtPct(rows[0].share)}` : "" },
            perThousand !== null
              ? { label: "Per 1,000 registered voters", value: fmtInt(perThousand), sub: "members against the voters' register" }
              : { label: "Concentrations", value: fmtInt(heavy), sub: "twice the even share or more" },
            { label: "Thin or bare", value: fmtInt(thin), sub: `of ${count(rows.length, level)}`, tone: thin ? "warn" : undefined },
          ],
    facts: {
      kind: "strength-register",
      party: partyId,
      level,
      inecPlaces,
      weakFirst,
      against,
      members: whole,
      places: rows.length,
      heavy,
      thin,
      empty,
      emptyNames: rows.filter((row) => row.members === 0).slice(0, 8).map((row) => `${row.name}${level !== "state" ? ` (${row.state})` : ""}`),
      minors,
      perThousand,
      top: [...rows].sort((a, b) => b.members - a.members).slice(0, 6).map(pick),
      weakest: rows.filter((row) => row.members > 0).sort((a, b) => (a[measure] ?? Infinity) - (b[measure] ?? Infinity)).slice(0, 6).map(pick),
      quadrants,
      organisedNotVoting: against === "vote" ? rows.filter((row) => row.quadrant === "organised").sort((a, b) => b.per_thousand - a.per_thousand).slice(0, 5).map(pick) : [],
      votingNotOrganised: against === "vote" ? rows.filter((row) => row.quadrant === "voting").sort((a, b) => b.atiku - a.atiku).slice(0, 5).map(pick) : [],
      women: rows.length && level !== "unit" ? weighted(rows, "women") : null,
      young: rows.length && level !== "unit" ? weighted(rows, "young") : null,
    },
  };
}

function weighted(rows, key) {
  let top = 0;
  let bottom = 0;
  for (const row of rows) {
    if (row[key] === null || row[key] === undefined) continue;
    top += row[key] * row.members;
    bottom += row.members;
  }
  return bottom ? top / bottom : null;
}

/* ══════════════════════════════════════════════════════════════ both */

/**
 * @param partyId  the party asked about
 * @param levels   the levels asked for; the vote is read at zone or state,
 *                 the register at whatever depth is asked
 */
export async function strengthSections({ partyId, levels, year, scope, sort = null, against = null }) {
  const sections = [];
  const notes = [];
  const register = hasRegister(partyId);

  /* ── THE REGISTER ALONE, UNLESS THE VOTE IS ASKED FOR ──────────────────
     "Where is the party weak on membership" is a question about the register,
     and a vote table beside it answers a question nobody asked. The vote joins
     only when it is asked for — "compare it with Atiku's vote" — or when the
     party has no register and its vote is all there is. */
  if (register) {
    const deepest = ["unit", "ward", "lga", "state"].find((level) => levels.includes(level)) ?? (scope.lgas ? "ward" : scope.states ? "lga" : "state");
    const level = against === "vote" && (deepest === "ward" || deepest === "unit") ? "lga" : deepest;
    if (against === "vote" && level !== deepest) {
      notes.push(`Atiku's vote is set against the register by state and local government; below that the register's own place names do not line up with INEC's.`);
    }
    const section = await registerSection({ partyId, level, scope, sort, against });
    if (section) sections.push(section);
  }

  if (!register || against === "vote") {
    const byZone = scope.national && (levels.includes("zone") || !levels.some((level) => level !== "zone" && level !== "state"));
    const vote = voteSection({ partyId: against === "vote" ? "PDP" : partyId, year, scope, byZone: byZone && !levels.includes("state") });
    if (vote) sections.push(vote);
    if (!register) notes.push(`Poll360 holds a member register for the ADC only, so the ${partyId}'s strength is read from its vote.`);
  }
  return { sections, notes };
}
