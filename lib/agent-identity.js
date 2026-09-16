import { currentCoordinator } from "./coordinator-session.js";

/**
 * Who is signed in to the agents' app, or null.
 *
 * Every agent signs in the same way now — with the code Data Bank confirms —
 * so there is one kind of agent session. Returns null for anybody who may not
 * file: signed out, suspended, or never approved.
 */
export async function currentAgent() {
  const person = await currentCoordinator();
  if (!person?.canFile) return null;
  return { id: person.id, name: person.name, phone: person.phone, unitCode: person.unitCode };
}
