import { roomContext } from "./access.js";
import { lights, staff } from "./store.js";
import { unitView } from "./unit.js";
import { placeName } from "./places.js";
import { levelOf, readGround, tidyCode, touches, under, describeGround, covers } from "../ground.js";

/**
 * What every room page needs before it draws anything: who is asking, where
 * on their ground they are looking, and what they may do there.
 *
 * `?at=` is the place drilled into and `?unit=` the polling unit opened. Both
 * arrive from the address bar, so both are checked against the ground here:
 * a code off the ground is dropped, not shown as an error, exactly as a
 * stranger is sent to their own screen and not told the other one exists.
 */
export async function roomPage(pathname, searchParams) {
  const ctx = await roomContext(pathname);
  const asked = (await searchParams) ?? {};
  const one = (value) => (Array.isArray(value) ? value[0] : value) ?? "";

  let at = tidyCode(one(asked.at)) ?? "";
  if (at && (levelOf(at) === "pu" || !touches(ctx.ground, at))) at = "";
  let unit = tidyCode(one(asked.unit));
  if (unit && (levelOf(unit) !== "pu" || !ctx.covers(unit))) unit = null;

  const query = { at: at || null, unit, sort: one(asked.sort) || null, tab: one(asked.tab) || null, section: one(asked.section) || null, q: one(asked.q) || null, person: one(asked.person) || null, preview: one(asked.preview) || null };
  const caps = {
    red: ctx.holds("items:resolve-red"),
    yellow: ctx.holds("items:resolve-yellow"),
    field: ctx.holds("items:resolve-field"),
    closeDispute: ctx.holds("items:close-dispute"),
    escalate: ctx.holds("items:escalate"),
    lead: ctx.holds("items:lead"),
    dispute: ctx.holds("results:dispute"),
    check: ctx.holds("results:verify"),
    correct: ctx.holds("results:correct"),
    second: ctx.holds("results:second-check"),
    act: ctx.holds("field:act"),
    sheets: ctx.holds("sheets:read"),
    phonedIn: ctx.holds("results:upload"),
  };

  const parts = at ? at.split("/") : [];
  const trail = [{ code: "", name: "Nigeria" }, ...parts.map((_, index) => {
    const code = parts.slice(0, index + 1).join("/");
    return { code, name: placeName(code) };
  })];

  /* Read once here, so every "12 min ago" on a page is measured from the
     same moment and no component reaches for the clock while it draws. */
  return { ctx, query, caps, at, unit, trail, here: under(ctx.ground, at), now: Date.now() };
}

/** The light on the place being looked at, and on the places under it. */
export async function lightsFor(ctx, at) {
  if (!ctx.project) return { light: null, below: [] };
  const args = { electionId: ctx.project.id, race: ctx.race, code: at, ground: ctx.ground };
  const [light, below] = await Promise.all([lights.at(args), lights.under(args)]);
  return { light, below };
}

export async function openUnit(ctx, unit) {
  return unit && ctx.project ? unitView(ctx, unit) : null;
}

/**
 * The room's people, each with their ground read and described, narrowed to
 * those whose ground reaches a place. `roles` narrows to desks.
 */
export async function rosterFor({ at = "", roles = null } = {}) {
  const all = await staff.all();
  return all
    .filter((person) => !roles || person.roles.some((role) => roles.includes(role)))
    .map((person) => {
      const ground = readGround(person.ground);
      return { ...person, groundRead: ground, groundLabel: person.ground == null ? "No ground assigned yet" : describeGround(ground) };
    })
    .filter((person) => !at || (person.groundRead && touches(person.groundRead, at)));
}

/** State numbers no online observer covers. */
export function unobservedStates(people, states) {
  const watching = people.filter((person) => person.online && person.roles.includes("STATE_OBSERVER") && person.groundRead);
  return new Set(states.filter((state) => !watching.some((person) => touches(person.groundRead, state))));
}

export { covers };
