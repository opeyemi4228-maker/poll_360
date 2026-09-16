import { elections } from "./elections.js";
import { STATES } from "./units.js";

/**
 * The election an agent's polling unit files into.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ACTIVE, AND THE AGENT'S OWN STATE — NEVER A STAFF BROWSER'S CHOICE
 *
 *  An agent has no project switcher, so the choice is made from their booth:
 *  an active election fought in their state, or failing that an active one
 *  fought nationwide. Among several, the one results are actually arriving
 *  in. Never a closed election, and never one scoped to other states — a Lagos
 *  booth's return does not belong in an Adamawa governorship.
 *
 *  It deliberately does not read the staff election cookie. The first version
 *  went through `currentElection`, which honours that cookie; on a machine
 *  where a staff dashboard had been opened on the closed 2023 project, an
 *  agent's return was filed into 2023. Every agent page and every agent
 *  action asks this, so what is on screen and where it files cannot disagree.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Projects name their states by short code ("EKI"), and a unit code carries
 * the state's number ("13/..."), so the number is turned into the code here
 * through the one table that defines both — see STATES in lib/units.js.
 */
export async function agentElection(unitCode) {
  const active = (await elections.list()).filter((row) => row.status === "ACTIVE");
  if (!active.length) return null;

  const number = /^\d{2}\//.test(String(unitCode ?? "")) ? unitCode.slice(0, 2) : null;
  const state = STATES.find((row) => row.number === number)?.code ?? null;

  const scope = (row) => row.scopeStates ?? [];
  const inState = state ? active.filter((row) => scope(row).includes(state)) : [];
  const nationwide = active.filter((row) => scope(row).length === 0);
  const eligible = inState.length ? inState : nationwide;
  if (!eligible.length) return null;

  /* The busiest project, but only if it is one this booth may file into. */
  const busiest = await elections.mostActive();
  return eligible.find((row) => row.id === busiest?.id) ?? eligible[0];
}
