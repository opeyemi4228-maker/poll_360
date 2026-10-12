import { roomContext } from "./access.js";
import { resolveTerritory } from "../constituencies.js";
import { statesOf, tidyCode, touches } from "../ground.js";
import { STATES } from "../units.js";

/**
 * The situation room, as each desk is given it.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  The room's dashboards (Command, Results, Voters, Turnout, Situation,
 *  Timeline, Booth, Verification) are the standard, and a desk that needs
 *  one is given the real one, not a likeness of it. This says which heads
 *  and tabs each desk gets, and turns the desk's ground into the territory
 *  the room already knows how to narrow itself to.
 *
 *  A desk with a ground sees one of its states at a time, and only that
 *  state's map. A desk that works the whole project sees the country.
 *
 *  ── WHAT IS NEVER HANDED OVER ───────────────────────────────────────────
 *  The Analytics head: past elections, strongholds, planning. No entry below
 *  names it, and the room refuses a view it was not given. The technical
 *  desk has no entry at all: it is shown no vote figure anywhere.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const MONITOR = {
  director: { heads: ["monitor", "broadcast"], views: null },
  zone: { heads: ["monitor"], views: null },
  observer: { heads: ["monitor"], views: null },
  verify: { heads: ["monitor"], views: ["results", "booth", "integrity"] },
  field: { heads: ["monitor"], views: ["command", "situations", "timeline", "booth"] },
  legal: { heads: ["monitor"], views: ["results", "situations", "integrity"] },
  broadcast: { heads: ["monitor", "broadcast"], views: ["command", "results", "turnout"] },
};

/** Where a desk's copy of the room lives. The observer's is their home. */
export const monitorPath = (desk) => (desk === "observer" ? "/room/observer" : `/room/${desk}/monitor`);
/** Where a desk's own working screen lives. */
export const deskPath = (desk) => (desk === "observer" ? "/room/observer/desk" : `/room/${desk}`);

export async function deskMonitor(desk, searchParams) {
  const given = MONITOR[desk];
  const ctx = await roomContext(monitorPath(desk));
  const asked = (await searchParams) ?? {};
  const want = tidyCode(Array.isArray(asked.at) ? asked.at[0] : asked.at);

  const mine = statesOf(ctx.ground);
  const state = mine == null ? null : (mine.includes(want?.slice(0, 2)) ? want.slice(0, 2) : (mine[0] ?? null));

  let territory = null;
  if (mine != null) {
    const whole = state ? resolveTerritory(`STATE:${state}`) : null;
    territory = whole
      ? /* Only the local governments of that state this desk holds. */
        { ...whole, lgas: whole.lgas.filter((code) => touches(ctx.ground, code)) }
      : { level: "STATE", key: "", name: "No ground assigned yet", stateNumber: null, stateName: null, stateCode: null, lgas: [] };
  }

  return {
    ctx,
    ...given,
    state,
    inecUnder: state ?? "",
    states: (mine ?? []).map((number) => ({ code: number, name: STATES.find((row) => row.number === number)?.name ?? number, current: number === state })),
    view: {
      user: ctx.user,
      project: ctx.project,
      race: ctx.race,
      territory,
      unresolved: false,
      pinned: false,
      consistent: true,
      ground: territory ? territory.name : "Nigeria",
    },
  };
}
