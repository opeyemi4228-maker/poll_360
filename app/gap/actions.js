"use server";

import { revalidatePath } from "next/cache";

import { declared, declaredSources } from "@/lib/db";
import { requireCapability, log } from "@/lib/guard";
import { currentElection, currentRace } from "@/lib/election-scope";
import { isRace, raceLabel } from "@/lib/races";
import { parseDeclared, summarise } from "@/lib/declared";
import { addressOf, pull } from "@/lib/declared-feed";

/**
 * Entering what the commission declared.
 *
 * ── TYPED IN, OR FETCHED FROM A SHEET SOMEBODY KEEPS ───────────────────────
 * INEC has no feed of declared totals: it publishes scanned sheets to IReV and
 * reads totals aloud at collation centres. So the desk uploads or pastes what
 * was announced, or gives the address of a shared sheet where announcements
 * are being typed, and that sheet is then read every few minutes on its own.
 * Both come through the same reader. See lib/declared-feed.js.
 *
 * ── WHICH MAKES WHO TYPED IT PART OF THE RECORD ────────────────────────────
 * Every row carries the account that entered it. A declared figure is one half
 * of every comparison this product makes: get it wrong and the system
 * manufactures a divergence that is entirely our own doing, which a newsroom
 * then reads as though it came from the commission. An entry nobody can
 * attribute is a rumour with a table around it — so the capability is held
 * tightly, see "declared:file" in lib/roles.js, and every save is logged.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** Four megabytes of text is roughly 176,000 unit rows. Nothing legitimate is bigger. */
const MAX = 4_000_000;

export async function uploadDeclared(_previous, formData) {
  const officer = await requireCapability("declared:file", "/gap");

  const project = await currentElection();
  if (!project) {
    return { error: "No election project is open, so there is nowhere to file these figures." };
  }

  /* ── PASTED OR UPLOADED, ONE PATH ────────────────────────────────────────
     A file chosen on a laptop and a block of cells pasted out of a browser
     table are the same thing by the time they arrive here. Treating them as
     two features would mean two parsers and, before long, two sets of rules
     about what a valid row is. */
  const file = formData.get("file");
  let text = String(formData.get("pasted") ?? "");

  if (file && typeof file.arrayBuffer === "function" && file.size > 0) {
    if (file.size > MAX) {
      return { error: "That file is too large to read. Split it and upload it in parts." };
    }
    try {
      text = Buffer.from(await file.arrayBuffer()).toString("utf8");
    } catch {
      return {
        error: "That file could not be read as text. A CSV exported from a spreadsheet works.",
      };
    }
  }

  if (!text.trim()) {
    return { error: "Nothing to read. Choose a file or paste the figures in." };
  }

  const { rows, problems, columns } = parseDeclared(text);

  /* ── BAD LINES DO NOT DISCARD THE GOOD ONES ──────────────────────────────
     A file of four thousand wards with three bad lines in it is a good file
     with three bad lines in it. Refusing the whole upload over a stray footer
     row, on a night when collation is running, loses the other three thousand
     nine hundred and ninety-seven. The bad lines are reported by number and
     the rest are saved. */
  if (!rows.length) {
    return { error: "Nothing in that could be read as a declared figure.", problems, columns };
  }

  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  /* ── WHICH CONTEST WAS DECLARED ──────────────────────────────────────────
     A collation sheet announces one contest. Taken from the form where the
     person uploading said so, and falling back to the position they are
     currently looking at — never assumed to be presidential, because a
     governorship figure filed as a presidential one manufactures a divergence
     that is entirely our own doing, and the room would read it as the
     commission's. */
  const race = isRace(formData.get("race"))
    ? String(formData.get("race")).toUpperCase()
    : await currentRace(project);

  const { written } = await declared.save({
    electionId: project.id,
    race,
    rows,
    enteredBy: officer.id,
    note,
  });

  const totals = summarise(rows);

  await log(officer, "declared:entered", project.id, {
    race,
    rows: written,
    byLevel: totals.byLevel,
    /* Rows whose own parties contradict their own stated total, recorded at
       entry: it is a fact about the source sheet, and worth being able to
       point at later when somebody asks why a figure moved. */
    disagreeing: totals.disagreeing.length,
    rejected: problems.length,
  });

  revalidatePath("/gap");
  revalidatePath("/room");

  return { ok: true, written, totals, problems, columns, race, raceLabel: raceLabel(race) };
}

/** Remove one place's declared figure, for an entry made against the wrong code. */
export async function removeDeclared(_previous, formData) {
  const officer = await requireCapability("declared:file", "/gap");

  const project = await currentElection();
  if (!project) return { error: "No election project is open." };

  const level = String(formData.get("level") ?? "");
  const key = String(formData.get("key") ?? "");
  if (!level || !key) return { error: "Nothing named to remove." };

  /* Removed from the contest it was entered against. Without the position a
     correction to a governorship figure would delete whichever row happened to
     share the place code — very possibly the presidential one. */
  const race = await currentRace(project);

  await declared.remove({ electionId: project.id, race, level, key });
  await log(officer, "declared:removed", `${level}:${key}`, { race });

  revalidatePath("/gap");
  revalidatePath("/room");

  return { ok: true, removed: key };
}

/**
 * Start fetching declared figures from a sheet, and read it at once.
 *
 * The first reading happens here, in front of the person who pasted the link,
 * because a link that cannot be read should say so while they are still
 * looking at it and not two minutes later on a screen nobody is watching. An
 * address that could not be read is still kept: a sheet that is not shared yet
 * is the commonest first attempt, and it starts working the moment it is.
 */
export async function setDeclaredSource(_previous, formData) {
  const officer = await requireCapability("declared:file", "/gap");

  const project = await currentElection();
  if (!project) return { error: "No election project is open, so there is nowhere to file these figures." };

  const { address, error } = addressOf(formData.get("address"));
  if (error) return { error };

  const race = await currentRace(project);
  await declaredSources.set({ electionId: project.id, race, address, addedBy: officer.id });
  await log(officer, "declared:source-set", project.id, { race, host: new URL(address).hostname });

  return readNow(officer, project, race);
}

/** Read the sheet now, without waiting for the next reading. */
export async function checkDeclaredSource() {
  const officer = await requireCapability("declared:file", "/gap");
  const project = await currentElection();
  if (!project) return { error: "No election project is open." };
  return readNow(officer, project, await currentRace(project));
}

async function readNow(officer, project, race) {
  /* Read as though for the first time, so pressing the button always says
     what the sheet holds and not only that nothing moved. */
  const source = await declaredSources.forRace(project.id, race);
  if (!source) return { error: "No sheet has been given for this contest." };

  const went = await pull({ ...source, fingerprint: null }, { declared, declaredSources });
  if (went.written) {
    await log(officer, "declared:fetched", project.id, { race, rows: went.written, rejected: went.problems?.length ?? 0 });
  }

  revalidatePath("/gap");
  revalidatePath("/room");

  return went.status === "CHANGED"
    ? { ok: true, said: went.said, problems: went.problems }
    : { ok: false, said: went.said };
}

/**
 * Stop fetching. Figures already brought in stay where they are: the address
 * is an instruction, and withdrawing it is not a correction to anything.
 */
export async function removeDeclaredSource() {
  const officer = await requireCapability("declared:file", "/gap");
  const project = await currentElection();
  if (!project) return { error: "No election project is open." };

  const race = await currentRace(project);
  await declaredSources.remove(project.id, race);
  await log(officer, "declared:source-removed", project.id, { race });

  revalidatePath("/gap");
  return { ok: true, stopped: true };
}
