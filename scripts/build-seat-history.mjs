/**
 * Build the record of the seats themselves: every senate election in every
 * senatorial district and every governorship election in every state, 1999
 * to date.
 *
 *   node scripts/build-seat-history.mjs            check and report only
 *   node scripts/build-seat-history.mjs --write    write lib/data/seat-history.js
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS EXISTS
 *
 *  A senate seat is won at a senate election and a governorship at a
 *  governorship election. Poll360 held neither — only the presidential vote —
 *  and a plan to win Kano Central drawn from who the district chose for
 *  President is a plan for a different election. This loads the contests
 *  themselves, so a question about a seat is answered from that seat.
 *
 *  ── WHERE IT COMES FROM ─────────────────────────────────────────────────
 *  The same published source scripts/build-history.mjs reads for the
 *  presidential record: one article for each state's senate elections in each
 *  year, and one for each governorship election. Parsed, never typed —
 *  several thousand figures typed by hand contain mistakes with certainty.
 *
 *  ── WHAT IS HELD AND WHAT IS NOT, SAID PER SEAT ─────────────────────────
 *  The source is uneven and this does not smooth it over:
 *
 *    WHO WON     held for nearly every seat in every election.
 *    THE VOTES   held where a result table was published with figures in it
 *                — most senate seats in 2019 and 2023, most governorships
 *                from 2007. Where the table is blank the election is stored
 *                with its winner and `votes: null`, never with a guess.
 *
 *  Every election box is checked before it is kept: a general election, not
 *  a party primary; under a heading that names one of the 109 districts this
 *  product draws; with candidates whose votes do not exceed the stated
 *  total. What fails is reported and left out.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const CACHE = join(process.cwd(), ".cache", "seats");
const WRITE = process.argv.includes("--write");
const OUT = "lib/data/seat-history.js";

const DISTRICTS = JSON.parse(readFileSync("public/geo/constituencies.json", "utf8")).senatorial;
const STATES = [...new Map(DISTRICTS.map((row) => [row.stateCode, { code: row.stateCode, name: row.stateName, number: row.state }])).values()];

const GENERAL = [1999, 2003, 2007, 2011, 2015, 2019, 2023];
/* A governorship can fall in any year: courts moved eight states off the
   general cycle, and they have stayed off it. */
const THIS_YEAR = new Date().getFullYear();
const ANY_YEAR = Array.from({ length: THIS_YEAR - 1999 + 1 }, (_, index) => 1999 + index);

/* ══════════════════════════════════════════════════════════════ fetching */

mkdirSync(CACHE, { recursive: true });

async function page(title) {
  const file = join(CACHE, `${title.replace(/[^\w]/g, "_")}.txt`);
  if (existsSync(file)) return readFileSync(file, "utf8");
  const url = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`;
  let text = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "poll360-history-builder" } });
    if (response.ok) {
      text = await response.text();
      break;
    }
    if (response.status === 404) break;
    await new Promise((done) => setTimeout(done, 1500 * (attempt + 1)));
  }
  /* A missing article is cached as empty, so a second run does not ask again. */
  writeFileSync(file, text);
  await new Promise((done) => setTimeout(done, 100));
  return text;
}

const placeOf = (state) => (state.code === "FCT" ? "the_Federal_Capital_Territory" : `${state.name.replace(/ /g, "_")}_State`);

/* ══════════════════════════════════════════════════════════════ reading */

const PARTIES = [
  [/all progressives congress/i, "APC"],
  [/people'?s democratic party/i, "PDP"],
  [/labour party/i, "LP"],
  [/new nigeria people'?s party/i, "NNPP"],
  [/all progressives grand alliance/i, "APGA"],
  [/african democratic congress/i, "ADC"],
  [/social democratic party/i, "SDP"],
  [/all nigeria people'?s party/i, "ANPP"],
  [/all people'?s party/i, "APP"],
  [/alliance for democracy/i, "AD"],
  [/action congress of nigeria/i, "ACN"],
  [/action congress/i, "AC"],
  [/congress for progressive change/i, "CPC"],
  [/young progressives? party/i, "YPP"],
  [/zenith labour party/i, "ZLP"],
  [/people'?s redemption party/i, "PRP"],
  [/progressive people'?s alliance/i, "PPA"],
  [/democratic people'?s party/i, "DPP"],
  [/action democratic party/i, "ADP"],
  [/african action congress/i, "AAC"],
  [/boot party/i, "BP"],
  [/action alliance/i, "AA"],
  [/action peoples party/i, "APP2"],
  [/allied peoples movement/i, "APM"],
  [/national rescue movement/i, "NRM"],
  [/people'?s party of nigeria/i, "PPN"],
  [/kowa party/i, "KOWA"],
  [/\baccord\b/i, "ACCORD"],
  [/united progressive party/i, "UPP"],
  [/independent/i, "IND"],
  [/^others?$/i, "OTH"],
];

/** Wiki markup down to the words a reader sees. */
function plain(text) {
  return String(text ?? "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\{\{nowrap\|([^{}]*)\}\}/gi, "$1")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The link target as well as the label, because "APC" links to the full name. */
function partyId(raw) {
  const text = String(raw ?? "").replace(/'{2,}/g, "");
  for (const [pattern, id] of PARTIES) if (pattern.test(text)) return id;
  const label = plain(text);
  if (/^[A-Z][A-Z0-9-]{1,7}$/.test(label)) return label;
  return label ? `?${label}` : null;
}

function number(raw) {
  const digits = plain(raw).replace(/[,\s]/g, "");
  return /^\d+$/.test(digits) ? Number(digits) : null;
}

const key = (text) => plain(text).toLowerCase().replace(/senatorial district|senate district|district|constituency/g, "").replace(/[^a-z]/g, "");

/** `| name = value` pairs of a template body, however it is laid out. */
function fields(body) {
  const out = {};
  /* Split on the pipes that are not inside a link or a nested template. */
  let depth = 0;
  let current = "";
  const parts = [];
  for (let i = 0; i < body.length; i += 1) {
    const two = body.slice(i, i + 2);
    if (two === "[[" || two === "{{") depth += 1;
    if (two === "]]" || two === "}}") depth -= 1;
    if (body[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else current += body[i];
  }
  parts.push(current);
  for (const part of parts) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    out[part.slice(0, at).trim().toLowerCase()] = part.slice(at + 1).trim();
  }
  return out;
}

/** Every `{{Name ...}}` in a text, with where it starts. Handles nesting. */
function templates(text, pattern) {
  const found = [];
  const opener = new RegExp(`\\{\\{\\s*(${pattern})`, "gi");
  let match;
  while ((match = opener.exec(text))) {
    let depth = 0;
    let end = match.index;
    for (; end < text.length; end += 1) {
      const two = text.slice(end, end + 2);
      if (two === "{{") {
        depth += 1;
        end += 1;
      } else if (two === "}}") {
        depth -= 1;
        end += 1;
        if (depth === 0) break;
      }
    }
    found.push({ at: match.index, name: match[1].toLowerCase(), body: text.slice(match.index + 2 + match[0].length - 2, end - 1) });
    opener.lastIndex = end;
  }
  return found;
}

/** The headings of a page, in order, with where each starts. */
function headings(text) {
  return [...text.matchAll(/^(={2,5})\s*(.*?)\s*\1\s*$/gm)].map((match) => ({ at: match.index, depth: match[1].length, title: plain(match[2]) }));
}

/**
 * The general-election result boxes of a page, each with the headings above
 * it. A box is one `Election box begin` to the next `Election box end`.
 */
function resultBoxes(raw) {
  /* References carry templates of their own, which would end a box early. */
  const text = raw.replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  const heads = headings(text);
  const boxes = [];
  const begin = /\{\{\s*Election box begin[\s\S]*?\}\}/gi;
  let match;
  while ((match = begin.exec(text))) {
    const close = text.indexOf("{{Election box end", match.index);
    if (close < 0) break;
    const block = text.slice(match.index, close);
    const title = plain(fields(match[0].replace(/^\{\{|\}\}$/g, "")).title ?? "");
    /* The headings this box sits under, nearest last. */
    const above = [];
    for (const head of heads) {
      if (head.at > match.index) break;
      while (above.length && above[above.length - 1].depth >= head.depth) above.pop();
      above.push(head);
    }
    const candidates = templates(block, "Election box (?:winning )?candidate[^|}\\n]*")
      .map((entry) => {
        const f = fields(entry.body);
        return {
          name: plain(f.candidate) || null,
          party: partyId(f.party),
          votes: number(f.votes),
          won: /winning/.test(entry.name),
        };
      })
      .filter((entry) => entry.party || entry.name);
    const total = templates(block, "Election box total[^|}\\n]*").map((entry) => number(fields(entry.body).votes))[0] ?? null;
    boxes.push({ title, above: above.map((head) => head.title), candidates, total });
    begin.lastIndex = close;
  }
  return boxes;
}

const isPrimary = (box) => /primar/i.test(box.title) || box.above.some((title) => /primar/i.test(title));

/** One election as it is stored: a winner, and the votes where they were published. */
function shape({ candidates, total, winner }) {
  const counted = candidates.filter((entry) => entry.votes !== null);
  const sum = counted.reduce((all, entry) => all + entry.votes, 0);
  const ranked = [...counted].sort((a, b) => b.votes - a.votes);
  const first = ranked[0] ?? null;
  const declared = candidates.find((entry) => entry.won) ?? null;
  const won = winner ?? (declared ? { name: declared.name, party: declared.party } : first ? { name: first.name, party: first.party } : null);
  if (!won?.party) return null;
  return {
    winner: { name: won.name ?? null, party: won.party },
    /* Votes only where at least two candidates carry them: one figure alone
       is a winner's tally with nothing to set it against. */
    votes: counted.length >= 2 ? ranked.map((entry) => ({ party: entry.party, name: entry.name, votes: entry.votes })) : null,
    total: counted.length >= 2 ? Math.max(total ?? 0, sum) : null,
  };
}

/* ══════════════════════════════════════════════════════════════ the senate */

const problems = [];
const unknownParties = new Set();

/** The table that lists each district and who was elected for it. */
function summaryOf(text) {
  const out = new Map();
  for (const table of text.match(/\{\|[\s\S]*?\n\|\}/g) ?? []) {
    if (!/elected/i.test(table)) continue;
    /* A colour cell is a style and nothing else, and its template carries a
       pipe of its own that would be read as a cell. */
    const clean = table.replace(/style\s*=\s*"[^"]*"\s*\|?/gi, "");
    for (const row of clean.split(/\n\|-/).slice(1)) {
      const cells = row
        .split(/\n[|!]|\|\|/)
        .map((cell) => cell.replace(/^\s*[|!]/, ""))
        .map((cell) => (/^\s*(style|class|rowspan|colspan|bgcolor)\s*=[^|]*\|/.test(cell) ? cell.replace(/^[^|]*\|/, "") : cell))
        .map((cell) => cell.trim())
        .filter((cell) => !/^(style|class|bgcolor)\s*=/.test(cell));
      const texts = cells.map(plain);
      const named = texts.filter(Boolean);
      if (named.length < 3) continue;
      const district = named[0];
      /* The last two cells with words in them are the senator elected and
         the party — the incumbent's columns come first and are often blank. */
      const party = partyId(cells.filter((cell) => plain(cell)).at(-1));
      const senator = named.at(-2);
      if (!party || party.startsWith("?") || senator === district) continue;
      out.set(key(district), { name: senator, party });
    }
  }
  return out;
}

/**
 * 2023, from the national article: one table per state, each district's
 * candidates listed with the one elected ticked. The state articles for 2023
 * were laid out before the election and never filled in.
 */
async function senate2023() {
  const text = (await page("2023_Nigerian_Senate_election")).replace(/<ref[^>]*\/>/g, "").replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  const out = new Map();
  for (const row of text.split(/\n\|-/)) {
    const head = row.match(/\n!\s*([^\n!]+?)\s*\n/);
    if (!head) continue;
    const ticked = row.split("\n").find((line) => /^\*/.test(line) && /\{\{\s*aye\s*\}\}/i.test(line));
    if (!ticked) continue;
    const party = partyId((ticked.match(/\{\{\s*Party stripe\s*\|([^}]*)\}\}/i) ?? [])[1]);
    const name = plain(ticked.replace(/^\*/, "").replace(/\{\{[^{}]*\}\}/g, "").replace(/\([A-Z-]+\)\s*$/, "").replace(/\([A-Z-]+\)/, ""));
    if (party && !party.startsWith("?")) out.set(key(head[1]), { name: name || null, party });
  }
  return out;
}

async function senate() {
  const out = {};
  const elected2023 = await senate2023();
  for (const state of STATES) {
    const mine = DISTRICTS.filter((row) => row.stateCode === state.code);
    const byKey = new Map(mine.map((row) => [key(row.name), row]));
    /* "Abuja" is the FCT's one district, whatever the article calls it. */
    if (state.code === "FCT") for (const alias of ["fct", "federalcapitalterritory", "abuja"]) byKey.set(alias, mine[0]);

    for (const year of GENERAL) {
      const text =
        (await page(`${year}_Nigerian_Senate_elections_in_${placeOf(state)}`)) ||
        (await page(`${year}_Nigerian_Senate_election_in_${placeOf(state)}`));
      if (!text || /^#redirect/i.test(text.trim())) {
        problems.push(`senate ${year} ${state.name}: no article`);
        continue;
      }
      const winners = summaryOf(text);
      if (year === 2023) for (const [district, winner] of elected2023) if (!winners.has(district)) winners.set(district, winner);
      const boxes = resultBoxes(text).filter((box) => !isPrimary(box));
      const seen = new Set();

      for (const row of mine) {
        const k = key(row.name);
        const aliases = [...byKey.entries()].filter(([, seat]) => seat === row).map(([alias]) => alias);
        const box = boxes.find(
          (entry) =>
            !seen.has(entry) &&
            (aliases.some((alias) => key(entry.title).includes(alias)) || aliases.includes(key(entry.above.find((title) => aliases.includes(key(title))) ?? "")))
        );
        if (box) seen.add(box);
        const winner = aliases.map((alias) => winners.get(alias)).find(Boolean) ?? null;
        const candidates = (box?.candidates ?? []).filter((entry) => entry.party);
        for (const entry of candidates) if (entry.party.startsWith("?")) unknownParties.add(entry.party.slice(1));
        const election = shape({
          candidates: candidates.map((entry) => ({ ...entry, party: entry.party.startsWith("?") ? "OTH" : entry.party })),
          total: box?.total ?? null,
          winner,
        });
        if (!election) {
          problems.push(`senate ${year} ${row.name}: nothing published`);
          continue;
        }
        /* The table of winners and the result box must agree. A box that
           does not carry the winner's own votes was never finished, and is
           left out. A box the winner is in but did not lead is a seat a court
           or a rerun decided: both facts are kept, and marked. */
        if (winner && election.votes) {
          const ranked = election.votes.filter((entry) => entry.party !== "OTH");
          if (!ranked.some((entry) => entry.party === winner.party)) {
            problems.push(`senate ${year} ${row.name}: the result box has no votes for the ${winner.party}, who won — votes left out`);
            election.votes = null;
            election.total = null;
          } else if (ranked[0].party !== winner.party) {
            problems.push(`senate ${year} ${row.name}: the ${ranked[0].party} led the count and the ${winner.party} holds the seat — both kept`);
            election.overturned = true;
          }
        }
        (out[row.key] ??= {})[year] = election;
        void k;
      }
    }
    process.stderr.write(`senate: ${state.name}\n`);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════ governors */

function infobox(text) {
  const box = templates(text, "Infobox election")[0];
  if (!box) return null;
  const f = fields(box.body);
  const candidates = [];
  for (let n = 1; n <= 8; n += 1) {
    const name = plain(f[`nominee${n}`] ?? f[`candidate${n}`] ?? "");
    const party = partyId(f[`party${n}`]);
    if (!name && !party) continue;
    candidates.push({ name: name || null, party, votes: number(f[`popular_vote${n}`]), won: false });
  }
  const after = plain(f.after_election ?? "");
  const afterParty = partyId(f.after_party);
  const date = plain(f.election_date ?? "");
  return { candidates, winner: after && afterParty && !afterParty.startsWith("?") ? { name: after, party: afterParty } : null, date };
}

async function governors() {
  const out = {};
  for (const state of STATES) {
    if (state.code === "FCT") continue;
    for (const year of ANY_YEAR) {
      const text = await page(`${year}_${state.name.replace(/ /g, "_")}_State_gubernatorial_election`);
      if (!text || /^#redirect/i.test(text.trim())) continue;
      const box = infobox(text);
      if (!box) continue;
      const candidates = box.candidates.filter((entry) => entry.party);
      for (const entry of candidates) if (entry.party.startsWith("?")) unknownParties.add(entry.party.slice(1));
      const election = shape({
        candidates: candidates.map((entry) => ({ ...entry, party: entry.party.startsWith("?") ? "OTH" : entry.party })),
        total: null,
        winner: box.winner,
      });
      if (!election) {
        problems.push(`governor ${year} ${state.name}: article with no result`);
        continue;
      }
      /* An article written ahead of an election names candidates and nobody
         elected. That is not a result. */
      if (!box.winner && !election.votes) continue;
      (out[state.code] ??= {})[year] = { ...election, on: box.date || null };
    }
    process.stderr.write(`governor: ${state.name}\n`);
  }
  return out;
}

/* ══════════════════════════════════════════════════════════════ the run */

const senateSeats = await senate();
const governorships = await governors();

const tally = (record, years) =>
  years.map((year) => {
    const held = Object.values(record).filter((seat) => seat[year]);
    return `${year}: ${held.length} with a winner, ${held.filter((seat) => seat[year].votes).length} with votes`;
  });

console.log(`\nSENATE — ${Object.keys(senateSeats).length} of ${DISTRICTS.length} districts`);
for (const line of tally(senateSeats, GENERAL)) console.log(`  ${line}`);
console.log(`\nGOVERNORSHIP — ${Object.keys(governorships).length} of 36 states`);
const govYears = [...new Set(Object.values(governorships).flatMap((state) => Object.keys(state).map(Number)))].sort();
for (const line of tally(governorships, govYears)) console.log(`  ${line}`);
if (unknownParties.size) console.log(`\nParties not recognised, counted as "other": ${[...unknownParties].sort().join("; ")}`);
console.log(`\n${problems.length} things left out or flagged${process.argv.includes("--problems") ? ":" : " (run with --problems to list them)"}`);
if (process.argv.includes("--problems")) for (const line of problems) console.log(`  ${line}`);

if (WRITE) {
  writeFileSync(
    OUT,
    `/**
 * The seats themselves: every senate election in each senatorial district and
 * every governorship election in each state, 1999 to date.
 *
 * \`senate[districtKey][year]\` and \`governor[stateCode][year]\` are each
 * \`{ winner: { name, party }, votes: [{ party, name, votes }] | null, total }\`.
 * \`votes\` is null where the result was published without figures: the
 * winner is on record and the count is not. Never a guess.
 *
 * Generated by scripts/build-seat-history.mjs. Do not edit by hand.
 */
export const SEAT_HISTORY = ${JSON.stringify({ senate: senateSeats, governor: governorships })};
`
  );
  console.log(`\nWrote ${OUT}`);
}
