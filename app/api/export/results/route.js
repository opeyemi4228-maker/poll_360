import { currentUser } from "@/lib/session";
import { log } from "@/lib/guard";
import { can } from "@/lib/roles";
import { results } from "@/lib/db";
import { currentElection, currentRace } from "@/lib/election-scope";
import { ballotFor, isRace, raceLabel } from "@/lib/races";
import { auditSheet } from "@/lib/results";
import { printedAs } from "@/lib/party-register";
import { parseUnitCode } from "@/lib/units";

/**
 * The count, as a file somebody else can check.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS BUTTON HAS BEEN ON THE BROADCAST DESK AND HAS NEVER WORKED
 *
 *  app/broadcast/page.jsx has offered "CSV" pointing at this address for as
 *  long as that screen has existed, and this route did not exist: it returned
 *  404. The capability governing it — `results:export`, held by the
 *  administrator, the broadcast desk and the situation room — was written,
 *  granted and never checked by anything.
 *
 *  That is worse than a missing feature. The entire claim of a parallel vote
 *  tabulation is that its figures can be handed to somebody else and checked
 *  against the commission's, and the one control that hands them over was a
 *  dead link.
 *
 * ── WHAT A ROW HAS TO CARRY TO BE WORTH ANYTHING ──────────────────────────
 *  Not just the votes. A figure with no provenance is an assertion, and an
 *  assertion is what this product exists not to publish. So every row carries
 *  where it came from, when, who filed it, how it arrived, whether a human
 *  checked it against the photographed sheet — and all eight numbered boxes
 *  of Form EC8A, with the verdict of the arithmetic that checks them against
 *  each other.
 *
 *  A reader with this file can re-derive every total on the board, and can
 *  find the booths whose paper does not add up without being told which they
 *  are. That is the difference between publishing a number and publishing a
 *  count.
 *
 * ── DISPUTED ROWS ARE IN IT ───────────────────────────────────────────────
 *  They are out of every sum on every screen, and they belong in the export
 *  with their status against them. A file that quietly dropped them would let
 *  somebody reconcile it against the board and conclude nothing was ever
 *  disputed, which is the opposite of the truth and the opposite of the point.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* A ceiling rather than a stream, and an honest one: the whole federation is
   176,623 units, and a file that size is a job rather than a click. This
   covers any single state comfortably and says so in a header when it has
   been reached, so nobody mistakes a truncated file for a complete one. */
const LIMIT = 20_000;

export async function GET(request) {
  const user = await currentUser();
  if (!user) {
    return new Response("Sign in to export the count.", { status: 401 });
  }

  /* A 403, not a redirect. The page guard redirects because a person who took
     a wrong turn should land somewhere useful; a file download that answers
     with somebody's dashboard HTML is a corrupt spreadsheet and a mystery. */
  if (!can(user.role, "results:export")) {
    await log(user, "capability:denied", "results:export");
    return new Response("This account may not export the count.", { status: 403 });
  }

  const project = await currentElection();
  if (!project) {
    return new Response("No election project is open, so there is nothing to export.", {
      status: 409,
    });
  }

  /* The position may be named on the query string so a desk can pull all five
     without clicking through them, and falls back to whatever the screen the
     button was on is showing. */
  const asked = String(new URL(request.url).searchParams.get("race") ?? "").toUpperCase();
  const race = isRace(asked) ? asked : await currentRace(project);

  const rows = await results.recent(LIMIT, project.id, race);
  const ballot = ballotFor(race);

  const header = [
    "unit_code",
    "state",
    "lga_code",
    "ward_code",
    "unit_no",
    "position",
    /* Form EC8A, box by box and in the order it prints them. */
    "form_serial",
    "sheet_date",
    "registered_1",
    "accredited_2",
    "papers_issued_3",
    "unused_4",
    "spoiled_5",
    "rejected_6",
    "stated_valid_7",
    "used_8",
    /* Each party under the code the commission prints, so a column heading
       matches the row on the paper rather than our internal id. */
    ...ballot.map((party) => `votes_${printedAs(party.id)}`),
    "votes_total",
    /* The verdict, so a reader can sort by it. */
    "sheet_balances",
    "sheet_suspect_box",
    "sheet_findings",
    "contested",
    /* Provenance. Without this the rest is an assertion. */
    "status",
    "source",
    "presiding_officer",
    "agents_signed",
    "sheet_compared",
    "sheet_agrees",
    "filed_at",
    "verified_at",
    "latitude",
    "longitude",
    "distance_m",
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    const place = parseUnitCode(row.unitCode);
    const audit = auditSheet(row);
    const total = Object.values(row.votes ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0);

    lines.push(
      [
        row.unitCode,
        place?.stateName ?? row.stateCode,
        place?.lgaCode,
        place?.wardCode,
        place?.unitNo,
        raceLabel(row.race),

        row.formSerial,
        row.sheetDate,
        row.registered,
        row.accredited,
        row.ballotsIssued,
        row.unusedBallots,
        row.spoiled,
        row.rejected,
        row.statedValid,
        row.usedBallots,

        ...ballot.map((party) => row.votes?.[party.id]),
        total,

        /* Only a claim where there was something to check. A sheet with none
           of its boxes captured is not a sheet that balances, and writing
           TRUE here would be the export's own version of a tick nobody
           earned. */
        capturedBoxes(row) ? (audit.balances ? "TRUE" : "FALSE") : "",
        audit.culprit ?? "",
        audit.findings.map((finding) => finding.why).join(" "),
        row.contested === null || row.contested === undefined ? "" : row.contested ? "TRUE" : "FALSE",

        row.status,
        row.source,
        row.repName,
        row.agents ? Object.entries(row.agents).map(([id, name]) => `${printedAs(id)}: ${name}`).join("; ") : "",
        row.sheetMatch ? (row.sheetMatch.compared ? "TRUE" : "FALSE") : "",
        row.sheetMatch?.compared ? (row.sheetMatch.agrees ? "TRUE" : "FALSE") : "",
        row.submittedAt?.toISOString?.() ?? row.submittedAt,
        row.verifiedAt?.toISOString?.() ?? row.verifiedAt,
        row.lat,
        row.lon,
        row.distanceM,
      ]
        .map(cell)
        .join(",")
    );
  }

  await log(user, "results:export", `${project.id}:${race}`, { rows: rows.length });

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `poll360-${slug(project.title)}-${race.toLowerCase()}-${stamp}.csv`;

  /* A byte-order mark, then CRLF line endings: between them they are what
     makes Excel on Windows open this as UTF-8 without being asked. Without
     the mark it guesses the local codepage and renders Nigerian names with
     accents as mojibake, and a file that mangles the presiding officer's name
     is evidence somebody will reasonably distrust. */
  return new Response(`\uFEFF${lines.join("\r\n")}\r\n`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      /* A count changes by the minute. A cached export is a wrong export. */
      "cache-control": "no-store",
      "x-poll360-rows": String(rows.length),
      "x-poll360-truncated": rows.length >= LIMIT ? "true" : "false",
    },
  });
}

/** Did this return capture any of the boxes the audit reads? */
function capturedBoxes(row) {
  return (
    row.ballotsIssued !== null ||
    row.unusedBallots !== null ||
    row.usedBallots !== null ||
    row.statedValid !== null
  );
}

/**
 * One CSV cell.
 *
 * ── A SPREADSHEET IS A PROGRAM, AND THIS FILE IS UNTRUSTED INPUT ──────────
 * Excel, Numbers and Sheets all treat a cell beginning `=`, `+`, `-` or `@`
 * as a formula. Several fields here are typed by a polling unit agent at two
 * in the morning — the presiding officer's name, an agent's signature — and
 * one beginning with `=` becomes an executable cell in whatever spreadsheet
 * a newsroom opens the count in. Prefixed with an apostrophe, which every
 * spreadsheet reads as "this is text" and strips on display.
 *
 * Null and undefined are written as nothing at all, never as 0 and never as
 * the word "null": an empty cell is the honest rendering of a figure nobody
 * captured, and it is what every tool reads back as missing.
 */
function cell(value) {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return /[",\r\n]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded;
}

/** A filename somebody can find again in a downloads folder. */
function slug(title) {
  return (
    String(title ?? "count")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "count"
  );
}
