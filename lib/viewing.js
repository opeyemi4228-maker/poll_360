import { cache } from "react";

import { requireUser } from "./guard.js";
import { currentElection, currentRace } from "./election-scope.js";
import { resolveTerritory } from "./constituencies.js";
import { describeTerritory, levelForRace } from "./territory.js";
import { isRace } from "./races.js";

/**
 * Who is looking, at what, and over what ground.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Every room page opened with the same four lines: require the user, read
 *  the project, read the contest, then start asking the database questions.
 *  A fifth has to join them — which piece of Nigeria this account may read —
 *  and adding it to five pages by hand is how a sixth page gets written
 *  without it. A screen that forgot would not look broken. It would show a
 *  district account the whole country, in the right colours, with a coverage
 *  figure measured against booths it has nobody in.
 *
 *  So there is one call, it answers all four questions at once, and a page
 *  that wants figures has to have made it.
 *
 *  ── THE CONTEST IS NOT ALWAYS THE READER'S TO CHOOSE ────────────────────
 *  A room switches between the day's contests with a cookie. An account
 *  issued for one of them does not: a newsroom given the Kaduna Central
 *  senate race holds a senatorial district, and a district is not an extent
 *  the presidential count is read over — switching would show them a seventh
 *  of a national board and call it their coverage.
 *
 *  Where an account names a contest, that is the contest, the switcher is
 *  told not to offer the others, and `pinned` says which of the two is true
 *  so a screen can say so rather than silently ignoring a click.
 *
 *  ── AND WHY A TERRITORY THAT WILL NOT RESOLVE IS AN ERROR, NOT A DEFAULT ─
 *  `resolveTerritory` returns null for a district key that no longer exists.
 *  Reading that as "the federation" would silently promote the account, which
 *  is the one outcome this whole feature exists to prevent, so it comes back
 *  as `unresolved` and the page says so instead of drawing a map.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const viewing = cache(async function viewing(pathname) {
  const user = await requireUser(pathname);
  const project = await currentElection();

  /* Bound to the account where the account says so, and chosen by the reader
     where it does not. An administrator holds neither and holds everything. */
  const pinned = Boolean(user.race && isRace(user.race));
  const race = pinned ? String(user.race).toUpperCase() : await currentRace(project);

  const resolved = user.territory ? resolveTerritory(user.territory) : null;
  const unresolved = Boolean(user.territory && !resolved);

  /* ── AN UNRESOLVED GROUND SEES NOTHING, NOT EVERYTHING ──────────────────
     A district key that no longer names a place comes back null, and null is
     the federation — which would silently promote exactly the account whose
     narrowing has just broken. So it is replaced by a territory that contains
     no local governments, which every query narrows to nothing (see `within`
     in lib/db.js), and `unresolved` below tells the screen to say why it is
     empty rather than leaving somebody to conclude that nobody has reported.

     Empty and explained beats full and wrong. It is not the safer-looking
     choice — an empty room at 9pm is alarming — but the alternative is a room
     reading a country's returns and believing they are its district's. */
  const territory = unresolved
    ? { level: "UNRESOLVED", key: user.territory, name: "a place we no longer hold", stateNumber: null, stateName: null, stateCode: null, lgas: [] }
    : resolved;

  return {
    user,
    project,
    race,
    /* Null is the whole federation. Stated once, here and in lib/territory.js,
       and never re-decided at a call site. */
    territory,
    /* An account whose stored ground names nowhere. The pages that read this
       refuse to draw rather than falling back to the country. */
    unresolved,
    pinned,
    /* What to print in a title bar. "Nigeria" for an unnarrowed account, which
       is the truth about what it is looking at. */
    ground: unresolved ? "a place we no longer hold" : describeTerritory(resolved),
    /* Whether the account's contest and its ground agree. They are set
       together and checked when issued, so a false here means the pairing was
       changed underneath — worth saying rather than worth assuming away. */
    consistent: !pinned || !resolved || levelForRace(race) === resolved.level,
  };
});
