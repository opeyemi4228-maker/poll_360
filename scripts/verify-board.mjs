/**
 * Check that every board names the party that actually won each place.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The board stores votes as a positional array and the map reads the winner
 * off a position. For as long as every contest had the same four parties that
 * was safe. It stopped being safe the moment a governorship carried a fifth:
 * Accord's 511,067 votes in Osun had no slot, were summed into "other", and
 * the map drew Osun for the APC — the party that LOST it, on 444,815 votes.
 * Anambra was worse: APGA had no slot either, every contender slot was zero,
 * and the state drew as nothing at all.
 *
 * Nothing failed. No exception, no empty screen, no warning. A wrong party in
 * the right colour is the most expensive bug this product can have, because it
 * is the one nobody notices, and it was live.
 *
 * So this compares, for every declared place, the party the map would draw
 * against the party the record says won, and it does it through the real
 * modules rather than a copy of their logic — a check that reimplements what
 * it is checking agrees with itself and proves nothing.
 *
 * It also re-runs the 2023 presidential replay, because the fix widened a
 * shared code path and that board must be untouched: its totals are published
 * INEC figures anybody can check this product against.
 *
 *   node --env-file=.env.local scripts/verify-board.mjs [electionId]
 *
 * Exits non-zero if anything disagrees, so it can gate a deploy.
 */
import { register } from "node:module";

register("./alias-hook.mjs", import.meta.url);

const { buildBoard, snapshot } = await import("../lib/replay.js");
const { leaderOf } = await import("../lib/drill.js");
const { states2023 } = await import("../lib/election2023.js");
const { elections } = await import("../lib/elections.js");
const { prepare } = await import("../lib/sql.js");

let failures = 0;

function report(ok, line) {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`);
}

/* ── the 2023 presidential replay ─────────────────────────────────────────
   Real declared results. Its winners and its total must not move. */
console.log("\n2023 presidential replay");

const replay = buildBoard(null, []);
const finished = snapshot(replay, replay.events.length);

const boardTotal = finished.standings.reduce((sum, row) => sum + row.votes, 0);
const fileTotal = states2023.reduce((sum, row) => sum + row.total, 0);
report(boardTotal === fileTotal, `total ${boardTotal.toLocaleString()} matches the source file`);

let moved = 0;
for (const state of finished.byState) {
  const source = states2023.find((row) => row.code === state.code);
  if (leaderOf(source.votes) !== leaderOf(state.votes)) moved += 1;
}
report(moved === 0, `all ${finished.byState.length} states call the same winner as the source file`);

for (const row of finished.standings.filter((party) => party.votes > 0)) {
  console.log(
    `        ${row.id.padEnd(7)}${row.votes.toLocaleString().padStart(12)}  ${row.share.toFixed(2)}%`
  );
}

/* ── every project board built from declared figures ──────────────────────
   This is where the positional array actually bites, because these are the
   contests fought by parties outside the presidential four. */
const only = process.argv[2] ?? null;
const projects = (await elections.list()).filter((row) => (only ? row.id === only : true));

for (const project of projects) {
  const rows = await prepare(
    `SELECT place_key, level, votes, total, registered
       FROM declared WHERE election_id = ? AND level = 'STATE'`
  ).all(project.id);

  if (!rows.length) continue;

  console.log(`\n${project.title}`);

  const board = buildBoard(
    project,
    rows.map((row) => ({
      level: row.level,
      placeKey: row.place_key,
      key: row.place_key,
      votes: row.votes,
      total: Number(row.total),
      registered: row.registered,
    }))
  );

  console.log(`        slots: ${board.parties.map((party) => party.id).join(" ")}`);

  const view = snapshot(board, board.opening);

  for (const state of view.byState) {
    if (!state.reported) continue;

    /* What the record says. `winner` is read off the stored keyed record, so
       it is independent of the positional array this is checking. */
    const truth = board.states.find((row) => row.code === state.code)?.winner ?? null;

    /* What the map draws: the same call ScopeMap makes. */
    const index = leaderOf(state.votes);
    const drawn = index === null ? null : (board.parties[index]?.id ?? null);

    report(drawn === truth, `${state.code}  draws ${drawn ?? "nothing"}, won by ${truth ?? "nobody"}`);
  }

  const declaredSum = rows.reduce((sum, row) => sum + Number(row.total), 0);
  const boardSum = view.standings.reduce((sum, row) => sum + row.votes, 0);
  report(declaredSum === boardSum, `total ${boardSum.toLocaleString()} matches the declared rows`);
}

console.log(
  failures ? `\n${failures} check${failures === 1 ? "" : "s"} failed\n` : "\nevery check passed\n"
);
process.exit(failures ? 1 : 0);
