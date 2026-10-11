import { broadcastDispatches, broadcastItems, declared, results } from "../db.js";
import { latestDeliveries, programmeOnAir } from "../broadcast.js";
import { inecAgainstOurs } from "../irev/verify.js";
import { ballotFor } from "../races.js";

/**
 * Three things several room screens read and none of them owns: the
 * broadcast desk's items, the three-record comparison, and the running count.
 * Each is built from the accessor the rest of Poll360 already uses, so the
 * room cannot show a figure the count does not hold.
 */

export async function broadcastDesk(project) {
  const [items, dispatches] = await Promise.all([broadcastItems.all(project.id, 200), broadcastDispatches.all(project.id, 600)]);
  const posts = items.filter((item) => item.kind === "SOCIAL");
  let live = null;
  try {
    live = programmeOnAir(items) ?? null;
  } catch {
    live = null;
  }
  return { posts: posts.sort((a, b) => new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt)), deliveries: latestDeliveries(dispatches), live };
}

/**
 * Our agents, INEC's sheets and the announcement for the places under one
 * place. Never throws: with nothing to compare it answers `{ none: true }`.
 */
export async function threeRecords(ctx, at = "") {
  try {
    const [rows, announced] = await Promise.all([
      results.counted(ctx.project.id, ctx.race),
      declared.all(ctx.project.id, ctx.race),
    ]);
    return (await inecAgainstOurs(ctx.project, rows, at, announced)) ?? { none: true };
  } catch (error) {
    console.error("three records:", error?.message ?? error);
    return { none: true };
  }
}

/**
 * The running count: every result that counts, by party, for a place. Its
 * coverage travels with it in the light drawn beside it.
 */
export async function runningCount(ctx, at = "") {
  const rows = (await results.counted(ctx.project.id, ctx.race)).filter((row) => !at || row.unitCode === at || row.unitCode.startsWith(`${at}/`));
  const totals = Object.fromEntries(ballotFor(ctx.race).map((party) => [party.id, 0]));
  let checked = 0;
  for (const row of rows) {
    if (row.status === "VERIFIED") checked += 1;
    for (const [party, value] of Object.entries(row.votes ?? {})) totals[party] = (totals[party] ?? 0) + (Number(value) || 0);
  }
  const all = Object.values(totals).reduce((sum, value) => sum + value, 0);
  return {
    units: rows.length,
    checked,
    all,
    parties: Object.entries(totals).filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]).map(([party, votes]) => ({ party, votes, share: all ? (votes / all) * 100 : 0 })),
  };
}
