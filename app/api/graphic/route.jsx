import { currentUser } from "@/lib/session";
import { log } from "@/lib/guard";
import { can } from "@/lib/roles";
import { results } from "@/lib/db";
import { currentElection, currentRace } from "@/lib/election-scope";
import { ballotFor, isRace } from "@/lib/races";
import { countGraphic, SHAPES } from "@/lib/graphic";

/**
 * The count, as a picture somebody can post.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A DESK NEEDS THIS AND WHY IT HAS TO BE GENERATED, NOT PHOTOGRAPHED
 *
 *  On the night the count moves every few minutes and the audience is on a
 *  phone, not in front of the wall board. What actually happens without this
 *  is somebody photographs the screen with their own phone and posts that: a
 *  skewed, glare-lit crop with no timestamp, no coverage figure, and nothing
 *  saying whether it is our parallel count or a declaration. That image then
 *  outlives the bulletin and gets quoted back for a week.
 *
 *  So the desk makes the picture instead, from the same figures the board is
 *  drawing, carrying the three things a screenshot never can. This file
 *  decides who may ask and what the figures are; lib/graphic.jsx decides what
 *  the picture looks like.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IT WILL NOT DO ────────────────────────────────────────────────────
 * It does not post anything anywhere. Publishing to X, Facebook or Instagram
 * needs an app, an OAuth grant and a token per account, and an election desk
 * handing that token to a piece of software is handing it the ability to
 * publish a result in the organisation's name unattended. The desk downloads
 * the file or shares it through the phone's own share sheet, and a person
 * decides what is posted. That person is the editorial control, and this
 * product should not be trying to replace them.
 */

export const dynamic = "force-dynamic";

export async function GET(request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to make a graphic.", { status: 401 });

  /* The same capability the CSV export needs: both publish the count in a form
     that leaves the building. */
  if (!can(user.role, "results:export")) {
    await log(user, "capability:denied", "results:export");
    return new Response("This account may not publish the count.", { status: 403 });
  }

  const url = new URL(request.url);
  const shape = SHAPES[url.searchParams.get("shape")] ?? SHAPES.wide;

  const project = await currentElection();
  const asked = url.searchParams.get("race");
  const race = isRace(asked) ? asked : await currentRace(project);

  const tally = project ? await results.tally(project.id, race) : { units: 0, totals: {} };

  /* Every party that has taken a vote, largest first. Named, never bucketed: a
     graphic that folds ADC into "other" is the same lie as a card that does,
     and this is the version that gets posted. */
  const standings = ballotFor(race)
    .map((party) => ({ id: party.id, votes: tally.totals?.[party.id] ?? 0 }))
    .filter((party) => party.votes > 0)
    .sort((a, b) => b.votes - a.votes);

  return countGraphic({ project, race, tally, standings, shape });
}
