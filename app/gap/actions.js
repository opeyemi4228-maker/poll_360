"use server";

import { revalidatePath } from "next/cache";

import { declared } from "@/lib/db";
import { requireCapability, log } from "@/lib/guard";
import { currentElection, currentRace } from "@/lib/election-scope";
import { isRace, raceLabel } from "@/lib/races";
import { parseDeclared, summarise } from "@/lib/declared";

/**
 * Entering what the commission declared.
 *
 * ── WHY THIS IS TYPED IN RATHER THAN FETCHED ───────────────────────────────
 * There is no feed. INEC publishes scanned sheets to IReV and reads totals
 * aloud at collation centres, and neither is an interface a program can ask a
 * question of. So the desk uploads or pastes what was announced.
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
