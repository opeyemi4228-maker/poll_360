import { ballotFor } from "./races.js";
import { parseUnitCode } from "./units.js";

/**
 * The commission's own figures, as they are given to us.
 *
 * ── WHY THIS IS A SEPARATE STORE AND NOT A COLUMN ──────────────────────────
 * `results.inec_total` already exists and holds one integer. One integer
 * cannot answer the only question worth asking: not "is the total different"
 * but "which party's figure moved, and did it move the winner". A single
 * number also cannot be filed at ward or local-government level, and that is
 * exactly how collation announces — a returning officer reads a ward summary
 * long before any unit sheet is published.
 *
 * So declared figures live in their own table, one row per place per election,
 * carrying the level they were announced at. Our returns are never written
 * into it and it is never written into our returns. Two independently sourced
 * numbers for the same booths is the entire product; merging them, averaging
 * them, or letting one correct the other destroys the only thing worth having.
 *
 * ── AND WHY IT IS UPLOADED RATHER THAN FETCHED ─────────────────────────────
 * There is no feed. INEC publishes scanned sheets to IReV and reads totals
 * aloud at collation centres; neither is an API. So the desk types or uploads
 * what was announced, and every row records who entered it and when, because
 * a declared figure nobody can attribute is a rumour with a table around it.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** The four places a figure can be announced, coarsest last. */
export const LEVELS = {
  UNIT: { rank: 0, label: "Polling unit", plural: "polling units" },
  WARD: { rank: 1, label: "Ward", plural: "wards" },
  LGA: { rank: 2, label: "Local government", plural: "local governments" },
  STATE: { rank: 3, label: "State", plural: "states" },
};

/* Every party that can carry a figure, in the order the rest of the product
   carries them, so a row read here and a row read anywhere else line up. */
/* The ballot, so a declared file may carry a column for every party that has
   a box on the filing form. Matching is per-column and at least one has to be
   present, so a file with only the older four still parses exactly as before —
   this widens what may be read, it does not demand more. */
const COLUMNS = ballotFor().map((party) => party.id);

/**
 * Which level a code names, read off its own shape.
 *
 * ── THE CODE IS THE ADDRESS ────────────────────────────────────────────────
 * lib/units.js already establishes that SS/LL/WW/UUU carries state, local
 * government, ward and unit, and that the separator is a slash because that
 * is what the 487 returns on file already use. A truncation of that code is a
 * perfectly good name for the place it stops at: 01/01/04 is a ward, 01/01 is
 * a local government, 01 is a state. Nothing new is invented here, and a
 * declared row therefore joins to our returns on a key both sides derive from
 * the same string.
 */
export function levelOf(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  /* A full unit code is the only one parseUnitCode will accept, and it also
     normalises the padding, so it is tried first and its answer is trusted. */
  const unit = parseUnitCode(raw);
  if (unit) return { level: "UNIT", key: unit.code, stateNumber: unit.stateNumber };

  const parts = raw.split(/[^0-9A-Za-z]+/).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^\d+$/.test(part))) return null;

  const padded = parts.map((part, index) => part.padStart(index === 3 ? 3 : 2, "0"));
  const stateNumber = padded[0];

  if (padded.length === 3) return { level: "WARD", key: padded.join("/"), stateNumber };
  if (padded.length === 2) return { level: "LGA", key: padded.join("/"), stateNumber };
  if (padded.length === 1) return { level: "STATE", key: stateNumber, stateNumber };

  return null;
}

/**
 * The key our own returns roll up to at a given level.
 *
 * Used on both sides of the comparison so that "the ward this unit is in" is
 * computed by one function rather than by two that can disagree.
 */
export function keyAt(unitCode, level) {
  const at = parseUnitCode(unitCode);
  if (!at) return null;
  if (level === "UNIT") return at.code;
  if (level === "WARD") return at.wardCode;
  if (level === "LGA") return at.lgaCode;
  if (level === "STATE") return at.stateNumber;
  return null;
}

/* ── reading what the desk uploads ─────────────────────────────────────────── */

/**
 * Header names we accept for each field.
 *
 * ── WHY THIS IS GENEROUS AND THE FIGURES ARE NOT ───────────────────────────
 * The file comes from a spreadsheet somebody made at a collation centre. It
 * will say "PU Code" or "Polling Unit" or just "Code"; it will say "Accredited
 * Voters" or "Accredited". Refusing it over a header is refusing the data for
 * a reason that has nothing to do with the data. So the names are matched
 * loosely and the numbers are read strictly, which is the right way round: a
 * misread header is visible in the preview before anything is saved, and a
 * misread figure is not visible at all.
 */
const HEADERS = {
  code: [/^(pu\s*)?code$/i, /polling\s*unit/i, /^unit$/i, /^ward$/i, /^lga$/i, /^state$/i, /^place$/i],
  registered: [/^registered/i, /reg(istered)?\s*voters?/i],
  accredited: [/^accredited/i, /accredited\s*voters?/i],
  rejected: [/^rejected/i, /^invalid/i, /rejected\s*ballots?/i],
  total: [/^total$/i, /total\s*valid/i, /valid\s*votes?/i],
  /* ── THE COLUMN THAT DECIDES WHETHER A COMPARISON IS SOUND ──────────────
     How many polling units this place contains, which a collation sheet
     usually states. It is the difference between "our nine booths disagree
     with this ward" and "our nine booths are nine of its twenty".

     It cannot be derived. The obvious source, our own polling-unit registry,
     is written as returns arrive — it is a record of what has reported, not
     of what exists — so counting it would say a ward has nine units because
     nine have reported, mark our coverage complete, and flag the missing
     eleven booths' worth of votes as a divergence. That is the exact false
     alarm lib/divergence.js is built to avoid, arriving through the back door.

     So it is read where it is given, and where it is not given the place
     stays uncomparable and says so. Not knowing is not the same as covering
     everything, and only one of those is safe to assume. */
  units: [/^units?$/i, /polling\s*units?\s*(count|number|total)?$/i, /^no\.?\s*of\s*(pus?|units?)$/i],
};

/** A figure as a spreadsheet writes it: "1,204", " 87 ", "1204.00", "". */
function figure(raw) {
  const cleaned = String(raw ?? "").replace(/[^0-9.-]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  /* Truncated rather than rounded: a vote is a whole thing, and a file that
     carries "1204.00" means 1204, not "about 1204". */
  return Math.trunc(value);
}

/**
 * Split a line of a delimited file.
 *
 * ── A HAND-ROLLED READER, AND WHY THAT IS DEFENSIBLE HERE ──────────────────
 * This handles quoted fields and doubled quotes inside them, which is the only
 * part of CSV that actually bites, and nothing else. It is not a general CSV
 * library and does not pretend to be. The alternative was a dependency loaded
 * on a page behind a sign-in to read a file with nine numeric columns, and the
 * cost of that dependency is paid by every deploy for the rest of the product's
 * life. Anything this reader cannot handle shows up in the preview as a wrong
 * column, in front of the person who chose the file, before it is saved.
 */
function splitRow(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character === '"') {
        /* A doubled quote inside a quoted field is one literal quote. */
        if (line[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else cell += character;
  }

  cells.push(cell.trim());
  return cells;
}

/**
 * Which character separates the columns.
 *
 * Counted on the header line rather than assumed, because a spreadsheet
 * exported in a locale that uses the comma as a decimal separator writes
 * semicolons, and a tab-separated paste out of a browser table is the single
 * commonest way this data will actually arrive.
 */
function delimiterOf(line) {
  const counts = [
    ["\t", (line.match(/\t/g) ?? []).length],
    [",", (line.match(/,/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
  ].sort((a, b) => b[1] - a[1]);

  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/**
 * Turn an uploaded or pasted table into declared rows.
 *
 * ── IT RETURNS PROBLEMS, IT DOES NOT THROW THEM ────────────────────────────
 * A file of four thousand wards with three bad lines in it is a good file with
 * three bad lines in it. Throwing loses the other three thousand nine hundred
 * and ninety-seven, and on a night when collation is running that is the whole
 * upload gone because somebody left a footer row in the sheet. So every row
 * that cannot be read is reported by line number with what was wrong, the rest
 * come back ready to save, and the desk decides.
 */
export function parseDeclared(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return { rows: [], problems: [], columns: [] };

  const delimiter = delimiterOf(lines[0]);
  const header = splitRow(lines[0], delimiter);

  /* Where each field sits. A column we do not recognise is not an error: a
     collation sheet carries a ward name, a returning officer, a timestamp,
     and none of them are our business. */
  const at = {};
  for (const [field, patterns] of Object.entries(HEADERS)) {
    const index = header.findIndex((name) => patterns.some((pattern) => pattern.test(name)));
    if (index >= 0) at[field] = index;
  }

  /* Party columns are matched on the party's own initials, which is the one
     thing every version of this file agrees on. */
  const partyAt = {};
  for (const id of COLUMNS) {
    const index = header.findIndex((name) => new RegExp(`^${id}$`, "i").test(name.trim()));
    if (index >= 0) partyAt[id] = index;
  }

  const problems = [];

  if (at.code === undefined) {
    problems.push({
      line: 1,
      says: "No column names the place.",
      why: "One column must hold the polling unit, ward, local government or state code. Without it there is nothing to compare against.",
    });
    return { rows: [], problems, columns: header };
  }

  if (!Object.keys(partyAt).length) {
    problems.push({
      line: 1,
      says: "No column carries a party's figures.",
      why: `Expected at least one column headed ${COLUMNS.join(", ")}.`,
    });
    return { rows: [], problems, columns: header };
  }

  const rows = [];
  const seen = new Map();

  for (const [offset, line] of lines.slice(1).entries()) {
    const number = offset + 2; // 1-indexed, and the header is line 1
    const cells = splitRow(line, delimiter);
    const place = levelOf(cells[at.code]);

    if (!place) {
      problems.push({
        line: number,
        says: `"${(cells[at.code] ?? "").slice(0, 40)}" is not a code we can place.`,
        why: "Expected something like 01/01/04/006 for a unit, 01/01/04 for a ward, 01/01 for a local government, or 01 for a state.",
      });
      continue;
    }

    const votes = {};
    let carried = 0;
    for (const [id, index] of Object.entries(partyAt)) {
      const value = figure(cells[index]);
      /* A blank party column is a hole, not a zero, and the difference
         matters: a zero says nobody voted for them there, which is a claim.
         A hole says the sheet did not tell us, which is not. */
      if (value === null) continue;
      votes[id] = value;
      carried += 1;
    }

    if (!carried) {
      problems.push({
        line: number,
        says: `${place.key} carries no figures.`,
        why: "Every party column on this line was empty, so there is nothing to compare.",
      });
      continue;
    }

    if (Object.values(votes).some((value) => value < 0)) {
      problems.push({
        line: number,
        says: `${place.key} has a negative figure.`,
        why: "A negative vote also hides a real one by cancelling it out.",
      });
      continue;
    }

    /* The same place twice in one file is a mistake worth naming rather than
       quietly letting the last line win. */
    if (seen.has(place.key)) {
      problems.push({
        line: number,
        says: `${place.key} appears twice.`,
        why: `Also on line ${seen.get(place.key)}. Only the first has been kept.`,
      });
      continue;
    }
    seen.set(place.key, number);

    rows.push({
      level: place.level,
      key: place.key,
      stateNumber: place.stateNumber,
      /* A unit contains exactly itself, which is knowable without being told
         and is what makes a unit-to-unit comparison always sound. */
      units: place.level === "UNIT" ? 1 : at.units === undefined ? null : figure(cells[at.units]),
      registered: at.registered === undefined ? null : figure(cells[at.registered]),
      accredited: at.accredited === undefined ? null : figure(cells[at.accredited]),
      rejected: at.rejected === undefined ? null : figure(cells[at.rejected]),
      votes,
      /* The stated total is kept beside the parties rather than replacing
         them, because a row whose parties contradict its own total is itself
         a finding — and one this product has already met, in the Kwara and
         Yobe rows of the 2023 source. */
      statedTotal: at.total === undefined ? null : figure(cells[at.total]),
      total: Object.values(votes).reduce((sum, value) => sum + value, 0),
    });
  }

  return { rows, problems, columns: header };
}

/**
 * What the desk is told before anything is saved.
 *
 * Counts by level, so somebody who meant to upload wards and finds they have
 * uploaded four thousand units notices at the point where it is still one
 * click to go back.
 */
export function summarise(rows) {
  const byLevel = {};
  for (const row of rows) byLevel[row.level] = (byLevel[row.level] ?? 0) + 1;

  const disagreeing = rows.filter(
    (row) => row.statedTotal !== null && row.statedTotal !== row.total
  );

  return {
    rows: rows.length,
    byLevel,
    votes: rows.reduce((sum, row) => sum + row.total, 0),
    /* Places that came without a unit count. They are saved and shown, and
       they can only ever be checked for the one thing that holds at any
       coverage — our figure exceeding theirs. The upload screen says so,
       because the moment to mention a missing column is while the person
       still has the spreadsheet open. */
    withoutUnitCount: rows.filter((row) => !row.units).length,
    /* Rows that contradict themselves before we have compared them to
       anything. Shown at upload time, because the moment to ask about it is
       while the person still has the sheet open. */
    disagreeing: disagreeing.map((row) => ({
      key: row.key,
      stated: row.statedTotal,
      adds: row.total,
    })),
  };
}
