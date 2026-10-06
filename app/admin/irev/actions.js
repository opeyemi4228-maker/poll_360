"use server";

import { revalidatePath } from "next/cache";

import { requireCapability, log } from "@/lib/guard";
import { bank } from "@/lib/irev/bank";
import { inTurn, irev } from "@/lib/irev/client";
import { automatic } from "@/lib/irev/desk";
import { list } from "@/lib/irev/gather";
import { examineUnit, readOne } from "@/lib/irev/read";
import { listElections } from "@/lib/election-scope";
import { typeCode } from "@/lib/irev/shape";
import * as vault from "@/lib/irev/vault";
import { inecReader } from "@/lib/irev/reader";

/**
 * What the IReV screen can do.
 *
 * Every action here is short. Pressing "Gather" does not gather: it marks the
 * election as begun, and the heartbeat (POST /api/irev/turn) reads it through
 * a few seconds at a time. That is what lets a nationwide election
 * be started from a button on a host that ends a request after a minute. See
 * lib/irev/gather.js.
 */

const PATH = "/admin/irev";

async function desk() {
  const admin = await requireCapability("system:read", PATH);
  const db = bank();
  if (!db) throw new Error("Data Bank's database address is not set on this deployment.");
  return { admin, db };
}

async function electionFrom(db, formData) {
  const id = Number(formData.get("election"));
  return Number.isInteger(id) ? vault.election(db, id) : null;
}

/** Whether any reader that can make out handwriting is set up. See lib/irev/reader.js. */
function canRead() {
  return inecReader() !== null;
}

const readSheet = (bytes) => inecReader().read(bytes);

/** Open the account if it is not open, and bring the list of elections up to date. */
export async function refreshList() {
  const { admin, db } = await desk();
  await vault.open(db);
  const found = await list(irev(), db);
  await vault.applyFollows(db);
  await vault.settle(db);
  await log(admin, "irev.list", "IReV", { elections: found.length });
  revalidatePath("/room");
  revalidatePath(PATH);
}

/** Begin reading one election through. The heartbeat carries it on. */
export async function gatherElection(formData) {
  const { admin, db } = await desk();
  const election = await electionFrom(db, formData);
  if (!election) return;

  /* Only the mark. Fetching the election's places can take the portal twenty
     seconds, and a button that sits for twenty seconds looks broken; the
     next turn fetches them, a few seconds from now. */
  await vault.startPass(db, election.election_id);
  await automatic(db, election);
  await log(admin, "irev.gather", election.name, { election: election.election_id });
  revalidatePath("/room");
  revalidatePath(PATH);
}

export async function watchElection(formData) {
  const { admin, db } = await desk();
  const election = await electionFrom(db, formData);
  if (!election) return;

  const on = formData.get("on") === "1";
  await vault.setWatching(db, [election.election_id], on);
  /* Watching something never gathered would only ever see the latest hundred
     sheets, so turning it on begins a read-through as well. */
  if (on && !election.gathered_at) await vault.startPass(db, election.election_id);
  if (on) await automatic(db, election);
  await log(admin, on ? "irev.watch" : "irev.unwatch", election.name, { election: election.election_id });
  revalidatePath(PATH);
}

/** Read this election's sheets into figures as they arrive, or stop doing so. */
export async function readElection(formData) {
  const { admin, db } = await desk();
  const election = await electionFrom(db, formData);
  if (!election || !canRead()) return;

  const on = formData.get("on") === "1";
  await vault.setReading(db, [election.election_id], on);
  await log(admin, on ? "irev.read" : "irev.unread", election.name, { election: election.election_id });
  revalidatePath(PATH);
}

/** Follow a year: every matching election is watched from the moment IReV lists it. */
export async function followYear(formData) {
  const { admin, db } = await desk();
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2015 || year > 2100) return;

  const type = typeCode(formData.get("type"));
  const state = String(formData.get("state") ?? "").trim().slice(0, 40) || null;
  const readSheets = canRead();

  await vault.open(db);
  await vault.follow(db, { year, type, state, readSheets });
  await vault.applyFollows(db);
  await log(admin, "irev.follow", String(year), { type, state, readSheets });
  revalidatePath(PATH);
}

export async function unfollowYear(formData) {
  const { admin, db } = await desk();
  const row = Number(formData.get("row"));
  if (!Number.isInteger(row)) return;

  await vault.unfollow(db, row);
  await log(admin, "irev.unfollow", String(row));
  revalidatePath(PATH);
}

/** Choose which Poll360 project an election's figures are compared with. */
export async function linkProject(formData) {
  const { admin, db } = await desk();
  const election = await electionFrom(db, formData);
  if (!election) return;

  const wanted = String(formData.get("project") ?? "").trim();
  const project = wanted ? (await listElections()).find((entry) => entry.id === wanted) : null;
  await vault.linkProject(db, election.election_id, project?.id ?? null);
  await log(admin, "irev.link", election.name, { project: project?.id ?? null });
  revalidatePath(PATH, "layout");
}

/** Read one polling unit's sheet into figures, now. */
export async function readUnit(formData) {
  const { admin, db } = await desk();
  const election = await electionFrom(db, formData);
  const unitId = Number(formData.get("unit"));
  if (!election || !Number.isInteger(unitId) || !canRead()) return;

  const held = await vault.unit(db, election.election_id, unitId);
  if (!held?.sheet_url) return;

  await readOne(db, { ...held, attempts: held.reading?.attempts ?? 0 }, { readSheet });
  await log(admin, "irev.read-unit", held.pu_code, { election: election.election_id });
  revalidatePath(PATH, "layout");
}

/**
 * Make one sheet ready to look at: its file examined, and its figures read.
 *
 * Called by the sheet's own page when it is opened and finds either missing,
 * so nobody has to wait for the gatherer to reach this unit or press anything.
 * Says what it did, so the page can redraw or explain why it could not.
 */
export async function prepareUnit(electionId, unitId) {
  const { db } = await desk();
  if (!Number.isInteger(electionId) || !Number.isInteger(unitId)) return { done: false };

  const [election, held] = await Promise.all([vault.election(db, electionId), vault.unit(db, electionId, unitId)]);
  if (!election || !held?.sheet_url) return { done: false };

  const out = { done: true, examined: false, read: false, problem: null };

  if (held.picture?.status !== "examined" && held.picture?.status !== "gone") {
    const row = await examineUnit(db, election, { ...held, attempts: held.picture?.attempts ?? 0 });
    out.examined = row.status === "examined";
    if (!out.examined) out.problem = row.notes;
  }

  if (canRead() && !held.reading) {
    const row = await readOne(db, { ...held, attempts: 0 }, { readSheet });
    out.read = row.status === "read";
    if (row.status === "failed") out.problem = row.problems;
    if (row.status === "paused") {
      out.problem = `the figures could not be read just now (${row.problems}). It will be tried again by itself.`;
      await vault.mark(db, "reading-paused", row.problems);
    }
  }

  if (out.examined || out.read) revalidatePath(PATH, "layout");
  return out;
}

/**
 * The polling units on screen go first.
 *
 * The gatherer works through an election newest sheet first, which for a
 * large one is hours. Somebody looking at a page of fifty units should not
 * wait behind the other hundred thousand, so the page asks for its own rows:
 * every picture on it is examined at once, and a few of its sheets are read.
 * Returns how many are still to do, and the page asks again until none are.
 */
export async function prepareUnits(electionId, unitIds) {
  const { db } = await desk();
  const ids = (Array.isArray(unitIds) ? unitIds : []).map(Number).filter(Number.isInteger).slice(0, 60);
  if (!Number.isInteger(electionId) || ids.length === 0) return { left: 0 };

  const election = await vault.election(db, electionId);
  if (!election) return { left: 0 };

  const waiting = await vault.unitsToPrepare(db, electionId, ids);
  /* Not while the reader is resting: see lib/irev/gather.js. */
  const rested = await vault.since(db, "reading-paused");
  const reader = canRead() && !(rested && rested.seconds < 600);
  /* Short rounds: the page's own buttons wait behind this while it runs. */
  const until = Date.now() + 8000;
  let did = 0;

  await inTurn(
    waiting.filter((unit) => unit.needs_examining),
    async (unit) => {
      await examineUnit(db, election, unit);
      did += 1;
    },
    { atOnce: 8, until }
  );

  if (reader) {
    await inTurn(
      waiting.filter((unit) => unit.needs_reading).slice(0, 4),
      async (unit) => {
        const row = await readOne(db, { ...unit, attempts: unit.read_attempts }, { readSheet });
        if (row.status === "paused") await vault.mark(db, "reading-paused", row.problems);
        else did += 1;
      },
      { atOnce: 4, until }
    );
  }

  const left = (await vault.unitsToPrepare(db, electionId, ids)).filter(
    (unit) => unit.needs_examining || (reader && unit.needs_reading)
  ).length;

  if (did) revalidatePath(PATH, "layout");
  /* Nothing done and something left means every attempt failed. The page
     stops asking and the rows say why. */
  return { left: did ? left : 0, did };
}
