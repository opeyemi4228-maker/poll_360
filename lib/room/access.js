import { addressBlocked, requireUser } from "../guard.js";
import { currentUser } from "../session.js";
import { currentElection, currentRace } from "../election-scope.js";
import { holds, interfaceAt, interfacesFor, rolesOf } from "../roles.js";
import { covers, describeGround, readGround, under } from "../ground.js";
import { STATES } from "../units.js";

/**
 * Who is asking, for which project and contest, and over what ground.
 *
 * Every room screen and every room action starts here, so "may they be here"
 * and "which places may they read" are answered once, on the server, from the
 * account as it is stored now. A browser never tells the server its ground.
 */

/* Desks that work the whole project. Everybody else holds exactly the ground
   a super administrator gave them, and an account given none holds none. */
const WHOLE_PROJECT = new Set([
  "SUPER_ADMIN", "DIRECTOR", "LEGAL", "TECH_OPS", "TECH_SECURITY", "BROADCAST_WRITER", "BROADCAST_CLEARER", "WALL_DEVICE",
]);

export function groundOf(user) {
  if (rolesOf(user).some((role) => WHOLE_PROJECT.has(role))) return null;
  return readGround(user?.ground) ?? { zones: [], codes: [] };
}

/**
 * A project fought in one state is that state, for everybody. So the ground
 * a person holds is narrowed to the states the project is fought in: a board
 * of thirty-six states that will never report is a board nobody can read.
 */
export function withinProject(ground, project) {
  const scope = (project?.scopeStates ?? []).map((code) => STATES.find((state) => state.code === code || state.number === code)?.number).filter(Boolean);
  if (!scope.length) return ground;
  if (ground == null) return { zones: [], codes: scope };
  return { zones: [], codes: scope.flatMap((state) => under(ground, state).codes) };
}

function contextFor(user, project, race) {
  const ground = withinProject(groundOf(user), project);
  return {
    user,
    project,
    race,
    ground,
    groundLabel: describeGround(ground),
    faces: interfacesFor(user),
    holds: (capability) => holds(user, capability),
    covers: (code) => covers(ground, code),
  };
}

/** For a page. Redirects a stranger to their own screen. */
export async function roomContext(pathname) {
  const user = await requireUser(pathname);
  const project = await currentElection();
  const race = await currentRace(project);
  return { ...contextFor(user, project, race), face: interfaceAt(pathname) };
}

/**
 * For an action or an API route: never redirects, because a redirect thrown
 * inside either reads as a network failure to whoever is waiting. Returns
 * null when nobody is signed in or the account is not yet let in.
 */
export async function roomActor() {
  const user = await currentUser();
  if (!user || user.status !== "ACTIVE") return null;
  if (await addressBlocked()) return null;
  const project = await currentElection();
  const race = await currentRace(project);
  return contextFor(user, project, race);
}
