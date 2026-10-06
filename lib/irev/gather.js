/**
 * Gathering from IReV into Data Bank: the list, a whole election, and the
 * turn that keeps everything current.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERYTHING IS DONE IN SHORT STEPS, SO ANYTHING CAN DRIVE IT
 *
 *  Reading a nationwide election is 8,809 wards and the best part of an hour.
 *  Nothing that answers a web request may run that long, and a job that only
 *  works when started from a terminal is a job the person who wants it cannot
 *  start. So a read-through is a mark on the election — "begun at this
 *  moment" — and a ward not read since that moment is still to do. `step`
 *  reads as many as fit in a few seconds and stops. Whoever calls next carries
 *  on from where it stopped: the screen left open, the command on a machine,
 *  a server answering a health check. None of them owns the job.
 *
 *  ── AND WATCHING IS ONE SMALL QUESTION, ASKED OFTEN ─────────────────────
 *  `check` asks the portal for its own count. Where the count has not moved,
 *  that is the whole of it. Where it has, the latest uploads are read. Only
 *  when more went up between two checks than the portal's latest list can
 *  show is a read-through begun again.
 *
 *  `turn` is one round of all of it — the list, the read-throughs under way,
 *  the watched elections, the sheets waiting to be read — inside a time
 *  budget, and it is the only thing the screen, the command and the server
 *  ever call.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { inTurn } from "./client.js";
import { chosen, electionRow, placeRows, sheetRows, typeRow } from "./shape.js";
import { STATES } from "../units.js";
import * as vault from "./vault.js";

/** How long a reader in trouble is left alone before it is tried again. */
const READER_REST = 10 * 60;

/** How stale the list of elections may get while a year is being followed. */
const LIST_EVERY = 15 * 60;

/**
 * Every election the portal publishes, as rows. Reads only; saves nothing.
 * `type` narrows it to one of the commission's codes and saves six requests.
 */
export async function listing(reader, { type = null } = {}) {
  const types = (await reader.types()).map(typeRow);
  const wanted = type ? types.filter((entry) => entry.code === type) : types;

  /* Seven small requests, asked together: the wait is the slowest of them
     and not the sum. */
  const answers = await Promise.all(wanted.map((entry) => reader.elections(entry.ref)));
  const elections = answers.flat().map(electionRow);

  return { types, elections };
}

/** The listing, saved into the account. Returns the elections that match `want`. */
export async function list(reader, db, want = {}) {
  const found = await listing(reader, { type: want.type ?? null });
  await vault.saveTypes(db, found.types);
  await vault.saveElections(db, found.elections);
  if (!want.type) await vault.mark(db, "listed");
  return chosen(found.elections, want);
}

const letters = (value) =>
  String(value ?? "").toLowerCase().replace(/federal capital territory/, "fct").replace(/[^a-z]/g, "");

/**
 * Put the wards holding our own polling units at the front of the queue.
 * Safe to call at any time: it does nothing until the places are known.
 */
export async function prioritise(db, electionId) {
  const names = await vault.stateNames(db, electionId);
  const states = names
    .map((name) => ({ name, number: STATES.find((state) => letters(state.name) === letters(name))?.number ?? null }))
    .filter((state) => state.number);
  if (states.length) await vault.prioritise(db, electionId, states);
}

/** Fetch an election's places, and put our own wards first among them. */
async function places(reader, db, election) {
  const id = election.election_id;
  await vault.savePlaces(db, placeRows(id, await reader.places(election.ref)));
  await prioritise(db, id);
}

/** Begin reading an election through: its count, its places, and the mark. */
export async function start(reader, db, election) {
  const id = election.election_id;
  await vault.portalCount(db, id, await reader.stats(election.ref));
  await places(reader, db, election);
  await vault.startPass(db, id);
}

/**
 * Read as many of an election's remaining wards as fit in the budget.
 *
 * Returns how many are left. When none are, the read-through is closed and
 * the election marked whole. A ward that will not load is left unread and
 * tried again on a later step; `stuck` says a step got nowhere at all, so a
 * caller looping on this knows to stop rather than spin.
 */
export async function step(reader, db, election, { budgetMs = 20000, atOnce = 4, said = () => {} } = {}) {
  const startedAt = new Date();
  const deadline = Date.now() + budgetMs;
  const id = election.election_id;
  const total = { wardsRead: 0, unitsSeen: 0, sheetsChanged: 0, failures: 0 };

  /* The portal can take twenty seconds over this one answer. It is asked for
     once per election and the clock below is checked straight after it. */
  if ((await vault.wardCount(db, id)) === 0) await places(reader, db, election);

  let left = await vault.wardsLeft(db, id);
  const all = left.length;
  /* A ward that failed in this step is not asked for again in this step. */
  const failed = new Set();

  while (left.length && Date.now() < deadline) {
    /* One lane's worth at a time, so the clock is looked at between every
       few wards: a nationwide election's wards can take seconds each. */
    const batch = left.filter((ward) => !failed.has(ward.ward_id)).slice(0, atOnce);
    if (batch.length === 0) break;

    const lost = await inTurn(
      batch,
      async (ward) => {
        const rows = sheetRows(id, await reader.ward(election.ref, ward.ref));
        const written = await vault.saveSheets(db, rows);
        await vault.wardRead(db, id, ward.ward_id, {
          units: rows.length,
          sheets: rows.filter((row) => row.sheet_url).length,
        });
        total.wardsRead += 1;
        total.unitsSeen += rows.length;
        total.sheetsChanged += written.sheets;
        said({ ...total, left: all - total.wardsRead });
      },
      { atOnce }
    );

    lost.forEach((loss) => failed.add(loss.item.ward_id));
    total.failures = failed.size;
    left = await vault.wardsLeft(db, id);
  }

  const done = left.length === 0;
  if (done) await vault.finishPass(db, id);

  if (total.wardsRead || done) {
    await vault.logRun(db, {
      electionId: id,
      kind: done ? "gathered" : "gathering",
      startedAt,
      ...total,
      note: failed.size ? `${failed.size} ward(s) would not load and will be tried again` : null,
    });
    await vault.settle(db);
  }

  return { ...total, left: left.length, done, stuck: !done && total.wardsRead === 0 };
}

/** Read an election through from start to finish. For a caller with no clock on it. */
export async function gather(reader, db, election, options = {}) {
  await start(reader, db, election);

  const total = { wardsRead: 0, unitsSeen: 0, sheetsChanged: 0, failures: 0, left: 0, done: false };
  let stalls = 0;

  while (!total.done && stalls < 3) {
    const went = await step(reader, db, election, { budgetMs: 60000, ...options });
    total.wardsRead += went.wardsRead;
    total.unitsSeen += went.unitsSeen;
    total.sheetsChanged += went.sheetsChanged;
    total.failures = went.failures;
    total.left = went.left;
    total.done = went.done;
    stalls = went.stuck ? stalls + 1 : 0;
  }

  return total;
}

/**
 * Has anything gone up? The question the watch repeats.
 *
 * `election.sheets_up` is the portal's count as of the last check. Where the
 * count has not moved nothing else is asked for.
 */
export async function check(reader, db, election) {
  const startedAt = new Date();
  const id = election.election_id;

  const stats = await reader.stats(election.ref);
  const up = stats?.documents ?? null;
  if (up !== null && up === election.sheets_up) {
    await vault.portalCount(db, id, stats);
    return { moved: false, sheetsUp: up };
  }

  const rows = sheetRows(id, await reader.recent(election.ref));
  const written = await vault.saveSheets(db, rows);
  await vault.portalCount(db, id, stats);

  /* More went up than the latest list holds, or this election was never
     gathered. Either way the only way to be whole again is to read it all,
     and that is begun here and carried on by the steps. */
  const behind = up !== null && (await vault.sheetsHeld(db, id)) < up;
  if (behind) await vault.startPass(db, id);

  await vault.logRun(db, {
    electionId: id,
    kind: "check",
    startedAt,
    unitsSeen: rows.length,
    sheetsChanged: written.sheets,
    note: behind ? "More went up than the latest list shows; reading the election through" : null,
  });
  if (written.sheets) await vault.settle(db);

  return { moved: true, sheetsUp: up, sheetsChanged: written.sheets, behind };
}

/**
 * One round of everything, inside a time budget.
 *
 * In order: pick up elections a followed year has just gained; carry on any
 * read-through under way; ask each watched election whether anything went
 * up; look at the files of sheets not yet examined; read a few waiting sheets
 * into figures. Each part gives way to the
 * clock, and what is not reached this turn is first in line on the next.
 *
 * Only one turn runs at a time across every caller. A second caller is told
 * `busy` and comes back later.
 */
export async function turn(
  reader,
  db,
  { budgetMs = 25000, every = 60, atOnce = 4, examine = null, readSheets = null, readAtOnce = 3, said = () => {} } = {}
) {
  if (!(await vault.takeTurn(db, Math.ceil(budgetMs / 1000) + 90))) return { busy: true };

  const deadline = Date.now() + budgetMs;
  /* ── EVERY PART OF THE WORK GETS ITS OWN SHARE OF THE TURN ──────────────
     Measured on the 2023 presidential election: gathering alone will fill
     any turn it is given for hours, and so will examining 176,000 pictures.
     Left to run in order until the clock ran out, the first two took all of
     it and not one sheet was ever read. So the turn is cut into shares, and
     a part that has nothing to do hands its time on:

       gathering and checking   the first two fifths
       examining pictures       the next fifth
       reading sheets           everything that is left

     Our own polling units are first in each queue, so the share each part
     gets goes to them before anything else. */
  const started = Date.now();
  const early = examine || readSheets ? started + budgetMs * 0.4 : deadline;
  const examineUntil = readSheets ? started + budgetMs * 0.6 : deadline;
  const out = { found: [], gathered: [], checked: [], examined: 0, figures: 0, paused: null, errors: [] };

  try {
    /* A followed year is the reason to keep the list fresh: an election in it
       is watched from the turn it first appears on the portal. */
    if ((await vault.follows(db)).length) {
      const listed = await vault.since(db, "listed");
      if (!listed || listed.seconds > LIST_EVERY) await list(reader, db);
      out.found = await vault.applyFollows(db);
    }

    const all = await vault.elections(db);

    for (const election of all.filter((entry) => entry.pass_started_at)) {
      if (Date.now() >= early) break;
      try {
        const went = await step(reader, db, election, { budgetMs: early - Date.now(), atOnce, said });
        out.gathered.push({ election, ...went });
      } catch (error) {
        out.errors.push({ election, error });
      }
    }

    for (const election of all.filter((entry) => entry.watching && !entry.pass_started_at)) {
      if (Date.now() >= early) break;
      const last = election.checked_at ? (Date.now() - new Date(election.checked_at).getTime()) / 1000 : Infinity;
      if (last < every) continue;
      try {
        out.checked.push({ election, ...(await check(reader, db, election)) });
      } catch (error) {
        out.errors.push({ election, error });
      }
    }

    /* Each gathered sheet's own file: what took it, when and where. Free, so
       it is done for every election without being asked. */
    if (examine) {
      /* Asked for again, because this turn may just have gathered them. */
      const now = await vault.elections(db);
      for (const election of now.filter((entry) => entry.sheets_held > entry.pictures_examined)) {
        if (Date.now() >= examineUntil) break;
        try {
          out.examined += (await examine(db, election, { until: examineUntil })).tried;
        } catch (error) {
          out.errors.push({ election, error });
        }
      }
    }

    /* A reader that said it was over its allowance, or busy, is left alone
       for a while and then tried again. */
    const rested = await vault.since(db, "reading-paused");
    if (rested && rested.seconds < READER_REST) out.paused = rested.value;

    if (readSheets && !out.paused) {
      for (const election of all.filter((entry) => entry.reading)) {
        if (Date.now() >= deadline) break;
        /* Round after round until the clock runs out or nothing is waiting. */
        let went;
        do {
          went = await readSheets(db, election.election_id, { limit: readAtOnce, atOnce: readAtOnce, until: deadline });
          out.figures += went.read;
        } while (went.tried === readAtOnce && !went.paused && Date.now() < deadline);

        if (went.paused) {
          out.paused = went.paused;
          await vault.mark(db, "reading-paused", went.paused);
          break;
        }
      }
    }

    await vault.mark(db, "turned");
  } finally {
    await vault.endTurn(db);
  }

  return out;
}

/** Take turns until told to stop. For the command left running on a machine. */
export async function watch(reader, db, { every = 60, signal = null, said = () => {}, ...options } = {}) {
  while (!signal?.aborted) {
    try {
      said(await turn(reader, db, { every, budgetMs: Math.max(20000, every * 800), ...options }));
    } catch (error) {
      said({ failed: error });
    }

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, every * 1000);
      signal?.addEventListener("abort", () => (clearTimeout(timer), resolve()), { once: true });
    });
  }
}
