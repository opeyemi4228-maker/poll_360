/**
 * Photographs for incidents, and money in the agent ledger.
 *
 * ── WHY THESE WERE MISSING ─────────────────────────────────────────────────
 * Both features were built and neither had any data behind it, so the
 * situation feed showed reports with no evidence and the agent wallet showed
 * a balance of zero. A feature that works and shows nothing looks exactly like
 * a feature that does not work.
 *
 * ── WHAT THE PICTURES ARE, PLAINLY ─────────────────────────────────────────
 * They are drawn, not photographed: a form-shaped image with a header band,
 * ruled lines, blocks where writing would be, and a tally bar in the party
 * colours. At the size the feed shows them they read as a photograph of a
 * result sheet, which is the point, and looked at closely they are obviously
 * generated, which is also the point. Nothing here is passed off as a real
 * document from a real polling unit.
 *
 *   node --env-file=.env.local scripts/seed-evidence.mjs
 */

import { incidents, media, sql, users } from "../lib/db.js";
import { ledger } from "../lib/ledger.js";
import { surface } from "./lib-png.mjs";

const PARTY = [
  [26, 86, 219],
  [22, 128, 68],
  [214, 40, 40],
  [230, 145, 20],
];

/** Deterministic, so re-running draws the same pictures rather than new ones. */
function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/**
 * A result sheet, as photographed on a phone in bad light.
 *
 * The grain and the uneven lighting are not decoration. A perfectly flat
 * rectangle reads as a graphic; a little noise and a corner falling into
 * shadow is what makes the eye accept it as a photograph at thumbnail size.
 */
function sheet(seed) {
  const width = 520;
  const height = 380;
  const random = rng(seed);
  const paper = surface(width, height, [18, 19, 23]);

  /* The sheet itself, sitting slightly off centre on a dark surface. */
  const left = 26 + Math.floor(random() * 10);
  const top = 18 + Math.floor(random() * 8);
  const w = width - left * 2;
  const h = height - top * 2;
  paper.rect(left, top, w, h, [238, 234, 224]);

  /* Header band, where the commission's name and the unit code sit. */
  paper.rect(left, top, w, 34, [32, 36, 48]);
  paper.rect(left + 14, top + 12, 150, 9, [225, 228, 235]);
  paper.rect(left + w - 120, top + 12, 104, 9, [180, 186, 200]);

  /* Ruled rows with blocks where the writing is. */
  for (let row = 0; row < 9; row += 1) {
    const y = top + 60 + row * 26;
    paper.rect(left + 14, y + 16, w - 28, 1, [206, 200, 188]);
    paper.rect(left + 18, y, 60 + Math.floor(random() * 110), 8, [96, 96, 104], 0.75);
    paper.rect(left + w - 90, y, 30 + Math.floor(random() * 34), 8, [70, 72, 80], 0.85);
  }

  /* The tally, in party colours, which is what makes it read as a result. */
  const barTop = top + h - 54;
  let x = left + 18;
  for (const [index, colour] of PARTY.entries()) {
    const bar = 40 + Math.floor(random() * 70) - index * 6;
    paper.rect(x, barTop, Math.max(14, bar), 14, colour);
    x += Math.max(14, bar) + 8;
  }

  /* Uneven light across the page, and grain over everything. */
  for (let y = 0; y < height; y += 1) {
    for (let px = 0; px < width; px += 1) {
      const fall = ((px / width) * 0.5 + (y / height) * 0.5) * 0.28;
      paper.set(px, y, [0, 0, 0], fall * random() * 0.6 + fall * 0.25);
      if (random() > 0.86) paper.set(px, y, [255, 255, 255], random() * 0.05);
    }
  }

  return paper.encode();
}

const force = process.argv.includes("--force");

const feed = await incidents.recent(60);
if (!feed.length) {
  console.log("No incidents to attach anything to. Run the demo seed first.");
  process.exit(0);
}

const already = await sql`SELECT count(*) AS n FROM media`;
if (Number(already[0].n) > 0 && !force) {
  console.log(`${already[0].n} images already attached. Pass --force to add more.`);
} else {
  let attached = 0;
  /* Not every report has a photograph, because not every report does. A feed
     where every single item carries evidence looks staged. */
  for (const [index, incident] of feed.entries()) {
    if (index % 3 === 1) continue;
    await media.attach({
      incidentId: incident.id,
      mime: "image/png",
      bytes: sheet(index * 7919 + 13),
      width: 520,
      height: 380,
    });
    attached += 1;
  }
  console.log(`attached ${attached} photographs to ${feed.length} reports`);
}

/* ── the ledger ───────────────────────────────────────────────────────────── */

const agents = (await sql`SELECT id, name FROM users WHERE role = 'PU_AGENT' ORDER BY id LIMIT 40`);
const existing = await sql`SELECT count(*) AS n FROM ledger`;

if (Number(existing[0].n) > 0 && !force) {
  console.log(`${existing[0].n} ledger entries already. Pass --force to add more.`);
} else {
  const admin = await users.findByEmail("admin@poll360.ng");
  let entries = 0;

  for (const [index, agent] of agents.entries()) {
    /* Kobo, not naira: money is integer everywhere in this system, because a
       balance held in floating point is a balance that is eventually wrong. */
    await ledger.append({
      userId: agent.id,
      kind: "STIPEND",
      amount: 1_500_000,
      note: "Election day stipend",
      actorId: admin?.id ?? null,
    });
    entries += 1;

    if (index % 4 === 0) {
      await ledger.append({
        userId: agent.id,
        kind: "BONUS",
        amount: 250_000,
        note: "Filed before 18:00",
        actorId: admin?.id ?? null,
      });
      entries += 1;
    }

    if (index % 5 === 2) {
      await ledger.append({
        userId: agent.id,
        kind: "WITHDRAWAL_REQUESTED",
        amount: 1_000_000,
        note: "Requested from the phone",
      });
      entries += 1;
    }
  }

  console.log(`wrote ${entries} ledger entries across ${agents.length} agents`);
}

const check = await ledger.verify();
console.log(
  check.ok
    ? `chain verified: ${check.entries} entries, head ${check.head.slice(0, 12)}`
    : `CHAIN BROKEN at ${check.at}: ${check.reason}`
);
