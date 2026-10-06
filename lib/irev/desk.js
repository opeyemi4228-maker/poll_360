/**
 * The INEC desk's standing orders: what happens without anybody asking.
 *
 * The screen's buttons are in app/admin/irev/actions.js. This is the part
 * that runs on its own — one turn of the gatherer with everything switched
 * on, and the two things that follow from an election being chosen. It is
 * its own file because two callers need it, the buttons and the heartbeat's
 * route, and a turn must not be a Server Action: the browser sends those one
 * at a time, so a turn in flight would hold up every button on the page
 * behind it for as long as the turn took.
 */

import { results } from "../db.js";
import { listElections } from "../election-scope.js";
import { defaultRace } from "../races.js";
import { STATES } from "../units.js";
import { irev } from "./client.js";
import { projectFor } from "./compare.js";
import { prioritise, turn } from "./gather.js";
import { examineSome, readSome } from "./read.js";
import { inecReader } from "./reader.js";
import * as vault from "./vault.js";

/**
 * Everything that follows from choosing an election, done without being asked:
 * its sheets are read into figures as they arrive, and it is tied to the
 * Poll360 project it plainly belongs with so the two are compared. Either can
 * be undone from the screen; neither has to be remembered.
 */
export async function automatic(db, election) {
  if (inecReader()) await vault.setReading(db, [election.election_id], true);

  const projects = await listElections();
  let project = projects.find((entry) => entry.id === election.project_id) ?? null;
  if (!project) {
    project = projectFor(election, projects, STATES);
    if (project) await vault.linkProject(db, election.election_id, project.id);
  }
  if (project) await ours(db, election.election_id, project);
}

/**
 * Tell the gatherer which polling units we hold returns for, so they are
 * gathered, examined and read before the rest of the election.
 */
async function ours(db, electionId, project) {
  const rows = await results.counted(project.id, defaultRace(project), null);
  await vault.setWanted(db, electionId, rows.map((row) => row.unitCode));
  await prioritise(db, electionId);
  await vault.mark(db, `ours:${electionId}`);
}

/**
 * One turn, and a plain account of it.
 *
 * Returns only numbers and names: this crosses to the browser, and the
 * browser needs to say what happened, not hold the rows. `more` says whether
 * there is work left to do straight away, so the caller knows to come back in
 * seconds and not in a minute.
 */
export async function deskTurn(db) {
  if (!(await vault.ready(db))) return { idle: true };

  /* Elections chosen before reading and comparing were automatic are brought
     into line, once. After that a person's "Stop reading" is respected. */
  if (!(await vault.since(db, "automatic"))) {
    for (const election of (await vault.elections(db)).filter((entry) => entry.units_held > 0 || entry.watching)) {
      await automatic(db, election);
    }
    await vault.mark(db, "automatic");
  }

  /* Returns keep arriving through a night, so the list of our own units is
     brought up to date every few minutes for each election tied to a project. */
  const tied = (await vault.elections(db)).filter((entry) => entry.project_id && (entry.pass_started_at || entry.watching || entry.units_held > 0));
  if (tied.length) {
    const projects = await listElections();
    for (const election of tied) {
      const last = await vault.since(db, `ours:${election.election_id}`);
      const project = projects.find((entry) => entry.id === election.project_id);
      if (project && (!last || last.seconds > 300)) await ours(db, election.election_id, project);
    }
  }

  const reader = inecReader();
  /* Short patience: a turn must end inside a minute, and a ward the portal
     stalls on is simply asked for again on a later turn. */
  const round = await turn(irev({ timeoutMs: 15000, attempts: 2 }), db, {
    /* With a reader, the first part of the turn gathers and the rest reads,
       so it is given long enough for both. */
    budgetMs: reader ? 30000 : 18000,
    /* Sixteen wards at a time. Measured on the 2023 presidential election:
       the portal answers a handful of requests at once and queues the rest,
       so six lanes read 70 wards a minute and twenty-four read 170. Past
       that it gains little, and the portal is everybody else's as well. */
    atOnce: 16,
    readAtOnce: 4,
    /* As many pictures as the clock allows: each is a fraction of a second. */
    examine: (bankDb, election, options) => examineSome(bankDb, election, { limit: 400, atOnce: 8, ...options }),
    readSheets: reader
      ? /* A whole sheet is given three quarters of a minute here, not the
           minute and a half a command with all night gives it. */
        (bankDb, id, options) => readSome(bankDb, id, { ...options, fetchMs: 45000, readSheet: reader.read })
      : null,
  });
  if (round.busy) return { busy: true };

  /* An election a followed year has just gained gets the same treatment as
     one chosen by hand. */
  for (const found of round.found) {
    const election = await vault.election(db, found.election_id);
    if (election) await automatic(db, election);
  }

  return {
    found: round.found.map((election) => election.name),
    wardsRead: round.gathered.reduce((sum, went) => sum + went.wardsRead, 0),
    wardsLeft: round.gathered.reduce((sum, went) => sum + went.left, 0),
    more: round.gathered.some((went) => !went.done) || round.examined > 0 || round.figures > 0,
    sheets: [...round.gathered, ...round.checked].reduce((sum, went) => sum + (went.sheetsChanged ?? 0), 0),
    checked: round.checked.length,
    examined: round.examined,
    figures: round.figures,
    paused: round.paused,
    errors: round.errors.map((went) => `${went.election.name}: ${went.error.message}`).slice(0, 3),
  };
}
