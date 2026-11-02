import { parties as PARTIES_2023 } from "./election2023.js";
import { ROOM_CHOICES } from "./principal.js";

/**
 * Who is standing for each party in a presidential contest, where the room
 * knows it without being told: the 2023 candidates on a replay of 2023, and
 * the room's own candidates (ROOM_CHOICES) on a live project.
 *
 * Kept apart from lib/faces.js, which reads files off the disk, so the desk's
 * Candidates screen in the browser can show the same answer the cards use.
 *
 * Nothing below the presidency: who stands for a party in one seat is not
 * something this file knows, and a wrong face on a published card is far
 * worse than a party mark.
 */

/* The 2023 record spells one name shorter than its photograph is filed. */
const LONG_NAME = { "Bola Tinubu": "Bola Ahmed Tinubu" };

/** Party → candidate name, for the contest a card is drawn for. */
export function standingFor({ race, isDemo = false } = {}) {
  if (String(race ?? "").toUpperCase() !== "PRESIDENTIAL") return {};
  if (isDemo) {
    return Object.fromEntries(
      PARTIES_2023.filter((party) => party.candidate).map((party) => [party.id, LONG_NAME[party.candidate] ?? party.candidate])
    );
  }
  return Object.fromEntries(ROOM_CHOICES.map((choice) => [choice.party, choice.candidate]));
}
