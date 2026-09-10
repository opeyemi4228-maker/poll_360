import BroadcastRoom from "@/components/dash/BroadcastRoom";
import { viewing } from "@/lib/viewing";
import { listElections } from "@/lib/election-scope";
import { lgasOf } from "@/lib/constituencies";
import { RACES, raceLabel } from "@/lib/races";
import { results, incidents, media, declared, audit, broadcastItems } from "@/lib/db";
import { watch } from "@/lib/watch";
import { byState, reportingTrends, rollUp } from "@/lib/broadcast";
import { capabilitiesOf, can } from "@/lib/roles";
import { states2023 } from "@/lib/election2023";
import { STATES } from "@/lib/units";
import nation from "@/public/geo/map/nation.json";

export const metadata = { title: "Broadcast", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The broadcast arm.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT MAKES THIS DIFFERENT FROM A NEWSROOM SYSTEM
 *
 *  A conventional broadcast system receives results from somewhere else. It
 *  has no idea whether the number it is about to key over a picture came from
 *  a polling unit or from a wire that got it from somebody who got it from a
 *  polling unit, and it certainly cannot tell whether anybody has checked it
 *  against the sheet it was written on.
 *
 *  This one sits on top of the count. The return, the agent who filed it, the
 *  position their phone reported, the photographed sheet and the desk that
 *  verified it are all in the same database as the strap that is about to go
 *  out about them. That is the whole argument for building this here rather
 *  than integrating with something, and it is why the clearance control on the
 *  live results screen can be real rather than ceremonial.
 *
 *  ── ONE WAIT, NOT SEVEN ─────────────────────────────────────────────────
 *  Twenty-eight surfaces are drawn from what this function fetches, and it
 *  fetches each thing once. A desk left open on a wall re-runs this every
 *  twenty seconds; a page that asked seven separate questions in sequence
 *  would be the reason the database is slow at the hour it matters.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default async function BroadcastPage() {
  /* Who, what contest, and over what ground — in one call, threaded into every
     query below rather than filtered out of the answers. See lib/viewing.js. */
  const { user, project, race, territory, ground, pinned, unresolved } = await viewing("/broadcast");

  const lgaNames = territory ? lgasOf(territory).map((row) => row.name) : [];

  const [
    allProjects,
    filedByRace,
    rows,
    rawFeed,
    coordinators,
    declaredRows,
    items,
    log,
  ] = await Promise.all([
    listElections(),
    project ? results.countByRace(project.id, territory) : {},
    /* The returns themselves, once. Nine surfaces read them — the clearance
       funnel, the state table, the ticker generator, the map, the charts, the
       trend lists, the source mix, the comparison and the health screen — and
       nine queries over one table is how a wall display becomes the reason the
       database is slow. */
    project ? results.counted(project.id, race, territory) : [],
    incidents.recent(40, project?.id, territory),
    /* The roster. It is the coordinator watch, read as a newsroom's field
       list: the person filing the return is the person a producer wants a
       two-way with, and keeping two lists would let the desk be told somebody
       is live while the count says their booth is silent. */
    watch.coordinators(project?.id, race, territory),
    /* What the commission has declared, where it has. The broadcast desk holds
       `gap:read` and deliberately not `declared:file` — it reads the
       comparison and does not get to decide what our count is held against. */
    project ? declared.all(project.id, race, territory) : [],
    /* Everything this desk has made tonight, in one query — see the note above
       `broadcastItems.all` in lib/db.js. */
    broadcastItems.all(project?.id),
    audit.recent(120),
  ]);

  /* ── THE FEED, WITHOUT THE NARRATIVE ────────────────────────────────────
     The broadcast desk holds `incidents:read` and not the key. What it is
     given is that a report exists, of what kind, how serious and where — which
     is what it needs to decide whether to send somebody, and not what somebody
     said. The sealed column is dropped here rather than passed down and
     ignored, so nothing downstream can accidentally render it. */
  const feed = rawFeed.map(({ detailSealed, ...row }) => row);

  /* How many of those carried a photograph. A count, not the bytes: a result
     sheet names a booth and an agent in one frame and stays with the room
     running the count. */
  const photos = await media.forIncidents(feed.map((row) => row.id));
  const photoCount = Object.keys(photos).length;

  /* ── THE DENOMINATOR, NAMED ─────────────────────────────────────────────
     How many polling units each state had at the last general election, keyed
     by INEC's state number so it joins to the unit codes the returns carry.
     It is the right order of magnitude and it is not this election's register,
     which is why every screen quoting it says what it is measured against. */
  const boothsByState = Object.fromEntries(
    STATES.map((state) => [
      state.number,
      states2023.find((row) => row.code === state.code)?.booths ?? 0,
    ])
  );

  const places = byState({ rows, booths: boothsByState });
  const national = rollUp(places, ground);
  const trends = reportingTrends({ places, rows });

  const watchSummary = watch.summary(coordinators);

  return (
    <BroadcastRoom
      user={user}
      project={project ? { title: project.title, isDemo: project.isDemo } : null}
      projects={{
        current: project,
        all: allProjects,
        canCreate: ["SUPER_ADMIN", "SITUATION_ROOM"].includes(user.role),
        canDelete: user.role === "SUPER_ADMIN",
      }}
      race={race}
      raceLabel={raceLabel(race)}
      races={RACES.map((row) => ({ id: row.id, label: row.label }))}
      filedByRace={filedByRace}
      racePinned={pinned}
      ground={ground}
      territoryUnresolved={unresolved}
      territory={
        territory && {
          level: territory.level,
          name: territory.name,
          stateCode: territory.stateCode,
          stateName: territory.stateName,
          stateNumber: territory.stateNumber,
          lgas: territory.lgas,
          shared: territory.shared ?? null,
        }
      }
      lgaNames={lgaNames}
      shapes={nation}
      items={items}
      /* ── THE DESK'S OWN LOG, NOT THE PRODUCT'S ──────────────────────────
         The audit table is global and holds account issuance, verification and
         everything else. A broadcast account has no business reading who was
         issued a key, and a timeline full of somebody else's work is a
         timeline nobody reads. Narrowed to this desk's own actions, which is
         also exactly what the question "how did that get on air" needs. */
      audit={log.filter((row) => String(row.action ?? "").startsWith("broadcast:"))}
      rows={rows}
      places={places}
      national={national}
      trends={trends}
      incidents={feed}
      photoCount={photoCount}
      coordinators={coordinators}
      watchSummary={watchSummary}
      declaredRows={declaredRows}
      capabilities={capabilitiesOf(user.role)}
      /* Read from the same table the guard consults, so a control is never
         offered that the action would refuse. The action checks again: a
         hidden button is a courtesy, not a permission. */
      may={{
        draft: can(user.role, "broadcast:draft"),
        clear: can(user.role, "broadcast:clear"),
        air: can(user.role, "broadcast:air"),
      }}
    />
  );
}
