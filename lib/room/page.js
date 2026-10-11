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

/** "Good afternoon", by the clock in Lagos. Asked here so no component reads the time as it draws. */
export function greetingNow() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Lagos" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/**
 * What the big map draws for the place being looked at: the country's states,
 * or one state's local governments. Deeper than that, the map stays on the
 * state and the list beside it carries the detail.
 */
export async function mapFor(ctx, at, nation, here) {
  if (!at) return { rows: nation.below, title: ctx.ground == null ? "Nigeria" : "Your ground", at: "" };
  const state = at.slice(0, 2);
  if (at.length === 2 && here) return { rows: here.below, title: here.light.name, at };
  const inside = await lightsFor(ctx, state);
  return { rows: inside.below, title: inside.light.name, at: state };
}

/** The four figures every desk that watches a ground opens with. */
export function groundStats(light, extra = []) {
  const arrived = light.reported;
  return [
    { label: "Polling units reporting", value: `${light.coveragePct.toFixed(1)}%`, note: arrived ? `${arrived.toLocaleString("en")} of ${light.total.toLocaleString("en")}` : `No returns yet · ${light.total.toLocaleString("en")} units` },
    { label: "Of that, checked", value: arrived ? `${((light.checked / arrived) * 100).toFixed(1)}%` : "0%", note: `${light.checked.toLocaleString("en")} of ${arrived.toLocaleString("en")} that arrived`, tone: arrived && light.checked === arrived ? "green" : "ink" },
    ...extra,
  ].slice(0, 4);
}

/**
 * A map layer that counts something per place: reports open, results
 * waiting, units silent. Red where there is a lot of it, yellow where there
 * is any, green where the place has reported and there is none.
 *
 * `codes` are the place codes of the things being counted; a place counts
 * every one that lies inside it.
 */
export function countLayer({ id, name, codes = null, countOf = null, word, many = 5, none = "none" }) {
  const count = countOf ?? ((row) => codes.filter((code) => code === row.code || code.startsWith(`${row.code}/`)).length);
  return {
    id,
    name,
    tone: (row) => (count(row) >= many ? "RED" : count(row) > 0 ? "YELLOW" : row.reported ? "GREEN" : "GREY"),
    label: (row) => (count(row) ? `${count(row).toLocaleString("en")} ${word}` : none),
    says: (row) => (count(row) ? `${count(row).toLocaleString("en")} ${word}` : `Nothing ${word} here`),
    show: (row) => count(row) > 0,
    legend: { RED: `${many} or more ${word}`, YELLOW: `Some ${word}`, GREEN: `None ${word}`, GREY: "No returns yet" },
  };
}
