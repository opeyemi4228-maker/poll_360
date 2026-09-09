import { coordinators } from "./coordinators.js";
import { normaliseAgentCode, unitOfAgentCode } from "./agent-code.js";
import { verifyPassword } from "./password.js";

/**
 * Whose account a code belongs to.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE ANSWER, ASKED FROM TWO PLACES
 *
 *  An agent signs in with their code on the web form and by sending it to the
 *  WhatsApp desk, and those are two entirely different code paths — a server
 *  action with a session, and a bot with a phone number. Both have to answer
 *  the same question, and two implementations of "does this code belong to
 *  anybody" is one implementation too many: the day they drift is the day one
 *  of them accepts something the other refuses, and nobody finds out from a
 *  test.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE BOOTH NARROWS THE SEARCH; IT DOES NOT AUTHORISE ────────────────────
 * A code is hashed with a per-row salt, so there is nothing to look it up by.
 * Checking against every account in the country would be forty thousand slow
 * hashes per attempt — a denial of service anybody could trigger from a
 * handset.
 *
 * So the booth inside the code narrows it to the people at one polling unit.
 * That is arithmetic and not a security decision: the booth half is printed on
 * every result sheet and published in this repository, and anybody can write
 * it. The secret half still has to match a stored hash, and a wrong booth
 * simply finds nobody to check against.
 */
export async function accountForCode(input) {
  const code = normaliseAgentCode(input);
  if (!code) return null;

  const holders = await coordinators.holdersAtUnit(unitOfAgentCode(code));

  let found = null;
  for (const holder of holders) {
    /* Every candidate is checked even after one matches. Returning early would
       take measurably longer for a booth whose first holder is the right one,
       which leaks which position an account sits in — a small leak, and free
       to close. */
    if (await verifyPassword(code, holder.codeHash)) found = found ?? holder;
  }

  if (!found) return null;

  const person = await coordinators.byId(found.id);
  /* A switched-off account is not a match. Said here rather than left to each
     caller, because the WhatsApp path has no screen to show a refusal on and
     would otherwise have bound a chat to a disabled agent. */
  return person?.disabledAt ? null : person;
}
