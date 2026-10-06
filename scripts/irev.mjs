/**
 * Gather INEC's Result Viewing Portal (IReV) into Data Bank, from a terminal.
 *
 * The screen at /admin/irev does all of this with buttons and is where it is
 * meant to be driven from. This is the same engine for a machine with nobody
 * at it — above all `watch`, left running through an election night.
 *
 *   npm run irev -- list --type gov --year 2026            what the portal has
 *   npm run irev -- gather --type gov --year 2026 --state osun --commit
 *   npm run irev -- follow --year 2027 --commit            watch a year as it is listed
 *   npm run irev -- watch --commit                         keep everything current, live
 *   npm run irev -- read --id 5008 --limit 20 --commit     sheets into figures
 *   npm run irev -- status                                 what Data Bank holds
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT LOOKS FIRST AND SAVES NOTHING
 *
 *  Without --commit a command only reads and says what it would do. Nothing
 *  is written to Data Bank, and the "INEC Result Datas" account is not
 *  opened, until the same command is given again with --commit.
 *
 *  ── AND IT WILL NOT TAKE, OR SPEND, EVERYTHING BY ACCIDENT ──────────────
 *  `gather` with nothing to narrow it is refused unless --all says that is
 *  meant. `read` costs money for every sheet the reader is shown, so it reads
 *  twenty unless --limit says otherwise, and reports the tokens it used.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Narrowing: --type (pres, gov, sen, reps, assembly, chairman, councillor),
 * --year, --state, --name (a word from the election's name), --id (the
 * portal's own number for one election). Any mix of them.
 */

import { bank, closeBank } from "../lib/irev/bank.js";
import { irev } from "../lib/irev/client.js";
import { gather, list, listing, watch } from "../lib/irev/gather.js";
import { examineSome, readSome } from "../lib/irev/read.js";
import { chosen, typeCode } from "../lib/irev/shape.js";
import * as vault from "../lib/irev/vault.js";

const [command, ...args] = process.argv.slice(2);
const commit = args.includes("--commit");

function valueOf(flag) {
  const at = args.indexOf(flag);
  return at >= 0 ? args[at + 1] : null;
}

const want = {
  type: typeCode(valueOf("--type")),
  year: valueOf("--year"),
  state: valueOf("--state"),
  name: valueOf("--name"),
  id: valueOf("--id"),
};
const narrowed = Object.values(want).some(Boolean);

function stop(message) {
  console.error(message);
  process.exit(1);
}

if (valueOf("--type") && !want.type) {
  stop(`"${valueOf("--type")}" is not an election type. Use pres, gov, sen, reps, assembly, chairman or councillor.`);
}

const number = (value) => (value ?? 0).toLocaleString("en-NG");

function line(election) {
  const up =
    election.expected_units != null
      ? `  ${number(election.sheets_up)} of ${number(election.expected_units)} sheets up`
      : "";
  return `  ${String(election.election_id).padStart(5)}  ${election.held_on ?? "          "}  ${election.name}${up}`;
}

function theBank() {
  const db = bank();
  if (!db) stop("DATABANK_DATABASE_URL is not set, so there is no Data Bank to save into.");
  return db;
}

/** The sheet reader, or a plain reason there is none that can do this. */
async function sheetReader() {
  const { inecReader } = await import("../lib/irev/reader.js");
  const reader = inecReader();
  if (!reader) {
    stop("No reader that can make out handwriting is set up. Set ANTHROPIC_API_KEY, or OCRSPACE_API_KEY, in .env.local.");
  }
  if (!reader.strong) {
    console.log("Reading with the basic reader. Only readings that add up to the sheet's own total are marked as good.\n");
  }
  return reader.read;
}

const reader = irev();

async function matching() {
  const found = await listing(reader, { type: want.type });
  return chosen(found.elections, want);
}

async function withCounts(elections) {
  for (const election of elections) {
    const stats = await reader.stats(election.ref).catch(() => null);
    election.expected_units = stats?.pus ?? null;
    election.sheets_up = stats?.documents ?? null;
  }
  return elections;
}

const commands = {
  async list() {
    if (!commit) {
      const elections = await matching();
      console.log(`${elections.length} election(s) on IReV:\n`);
      elections.forEach((election) => console.log(line(election)));
      console.log("\nNothing saved. Add --commit to save this list into Data Bank.");
      return;
    }

    const db = theBank();
    await vault.open(db);
    const elections = await list(reader, db, want);
    await vault.settle(db);
    console.log(`Saved the list into "${vault.ACCOUNT.name}". ${elections.length} election(s) match:\n`);
    elections.forEach((election) => console.log(line(election)));
  },

  async gather() {
    if (!narrowed && !args.includes("--all")) {
      stop("Say which elections: --type, --year, --state, --name or --id. Or --all for every election on the portal.");
    }

    if (!commit) {
      const elections = await withCounts(await matching());
      const units = elections.reduce((sum, election) => sum + (election.expected_units ?? 0), 0);
      console.log(`Would gather ${elections.length} election(s), ${number(units)} polling units:\n`);
      elections.forEach((election) => console.log(line(election)));
      console.log("\nNothing saved. Add --commit to gather them into Data Bank.");
      return;
    }

    const db = theBank();
    await vault.open(db);
    const elections = await list(reader, db, want);
    if (elections.length === 0) console.log("No election on IReV matches that.");

    for (const election of elections) {
      console.log(`\n${election.name}`);
      const done = await gather(reader, db, election, {
        said: (at) => process.stdout.write(`\r  ${number(at.left)} ward(s) to go   `),
      });
      console.log(
        `\r  ${number(done.unitsSeen)} polling units, ${number(done.sheetsChanged)} sheets new or replaced` +
          (done.done ? "" : `. ${number(done.left)} ward(s) would not load — run the same command again to finish`)
      );
    }

    console.log(`\n"${vault.ACCOUNT.name}" now takes ${((await vault.weight(db)) / 1048576).toFixed(1)} MB in Data Bank.`);
  },

  async follow() {
    if (!want.year && !want.type) stop("Say what to follow: --year 2027, and --type or --state to narrow it.");
    const what = [want.type, want.year, want.state].filter(Boolean).join(" ");

    if (!commit) {
      console.log(`Would follow ${what}: every matching election is watched from the moment IReV lists it.`);
      console.log("\nNothing saved. Add --commit to follow it.");
      return;
    }

    const db = theBank();
    await vault.open(db);
    await vault.follow(db, { year: want.year ? Number(want.year) : null, type: want.type, state: want.state });
    console.log(`Following ${what}. Leave "npm run irev -- watch --commit" running, or the screen open, to act on it.`);
  },

  async watch() {
    if (!commit) {
      console.log("Would keep every watched and followed election current. Add --commit to start.");
      return;
    }

    const db = theBank();
    await vault.open(db);
    if (narrowed) {
      const elections = await list(reader, db, want);
      await vault.setWatching(db, elections.map((election) => election.election_id), !args.includes("--stop"));
      console.log(`${args.includes("--stop") ? "Stopped watching" : "Watching"} ${elections.length} election(s).`);
      if (args.includes("--stop")) return;
    }

    const readSheet = args.includes("--read") ? await sheetReader() : null;
    const every = Number(valueOf("--every")) || 60;
    const stopping = new AbortController();
    process.on("SIGINT", () => stopping.abort());
    console.log(`Watching IReV every ${every} seconds. Ctrl-C to stop.\n`);

    await watch(reader, db, {
      every,
      signal: stopping.signal,
      examine: (bankDb, election, options) => examineSome(bankDb, election, { limit: 200, ...options }),
      readSheets: readSheet ? (bankDb, id, options) => readSome(bankDb, id, { ...options, readSheet }) : null,
      said(round) {
        const at = new Date().toLocaleTimeString("en-NG", { hour12: false });
        if (round.failed) return console.log(`${at}  ${round.failed.message}`);
        if (round.busy) return console.log(`${at}  Another gatherer has the turn.`);
        if (!round.checked) return undefined;

        round.found.forEach((election) => console.log(`${at}  New on IReV, now watched: ${election.name}`));
        round.gathered
          .filter((went) => went.wardsRead)
          .forEach((went) => console.log(`${at}  ${went.election.name}: read ${number(went.wardsRead)} ward(s), ${number(went.left)} to go`));
        round.checked
          .filter((went) => went.moved)
          .forEach((went) => console.log(`${at}  ${went.election.name}: ${number(went.sheetsChanged)} sheet(s) new or replaced, ${number(went.sheetsUp)} up`));
        if (round.examined) console.log(`${at}  Examined ${number(round.examined)} sheet picture(s)`);
        if (round.figures) console.log(`${at}  Read ${number(round.figures)} sheet(s) into figures`);
        round.errors.forEach((went) => console.log(`${at}  ${went.election.name}: ${went.error.message}`));
        return undefined;
      },
    });
  },

  async read() {
    if (!narrowed) stop("Say which election's sheets to read: --id, or --type with --year and --state.");

    const db = theBank();
    if (!(await vault.opened(db))) stop("Nothing has been gathered yet, so there are no sheets to read.");

    const elections = chosen(await vault.elections(db), want).filter((election) => election.sheets_held > 0);
    const limit = Number(valueOf("--limit")) || 20;

    if (!commit) {
      console.log(`Would read up to ${number(limit)} sheet(s) from each of ${elections.length} gathered election(s):\n`);
      elections.forEach((election) =>
        console.log(`${line(election)}\n         ${number(election.sheets_held - election.figures_read)} sheet(s) not yet read`)
      );
      console.log("\nNothing read. The reader is paid for each sheet; add --commit to read them.");
      return;
    }

    const readSheet = await sheetReader();
    for (const election of elections) {
      console.log(`\n${election.name}`);
      const done = await readSome(db, election.election_id, {
        limit,
        readSheet,
        said: (at) => process.stdout.write(`\r  ${number(at.read + at.unreadable + at.gone + at.failed)} of ${number(at.of)}`),
      });
      console.log(
        `\r  ${number(done.read)} read (${number(done.balanced)} add up), ${number(done.unreadable)} unreadable, ` +
          `${number(done.gone)} gone, ${number(done.failed)} to try again\n` +
          `  ${number(done.tokensIn)} tokens in, ${number(done.tokensOut)} out` +
          (done.read ? ` — about ${number(Math.round((done.tokensIn + done.tokensOut) / Math.max(1, done.tried)))} a sheet` : "")
      );
    }
  },

  async status() {
    const db = theBank();
    if (!(await vault.opened(db))) {
      console.log(`The "${vault.ACCOUNT.name}" account has not been opened yet. Any command with --commit opens it.`);
      return;
    }

    const held = (await vault.elections(db)).filter((election) => election.units_held > 0 || election.watching);
    console.log(`"${vault.ACCOUNT.name}" holds ${held.length} election(s), ${((await vault.weight(db)) / 1048576).toFixed(1)} MB:\n`);
    for (const election of held) {
      console.log(
        `${line(election)}\n         held: ${number(election.sheets_held)} sheets across ${number(election.units_held)} units, ` +
          `${number(election.figures_read)} read into figures` +
          `${election.watching ? "  · watching" : ""}${election.pass_started_at ? `  · ${number(election.wards_left)} ward(s) to go` : ""}`
      );
    }

    const followed = await vault.follows(db);
    if (followed.length) {
      console.log(`\nFollowing: ${followed.map((row) => [row.type_code, row.year, row.state_name].filter(Boolean).join(" ")).join(", ")}`);
    }
  },
};

if (!commands[command]) {
  stop("Use one of: list, gather, follow, watch, read, status. See the top of scripts/irev.mjs.");
}

try {
  await commands[command]();
} finally {
  await closeBank();
}
