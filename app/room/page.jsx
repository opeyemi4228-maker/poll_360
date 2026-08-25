import { AlertTriangle, Gauge, Scale, ShieldAlert, Users } from "lucide-react";


import { PartyBars, CoverageBar } from "@/components/dash/Charts";
import SituationRoom from "@/components/dash/SituationRoom";
import { currentElection, currentRace, listElections } from "@/lib/election-scope";
import { elections } from "@/lib/elections";
import { requireUser } from "@/lib/guard";
import { RACES } from "@/lib/races";
import { results, incidents, media, declared } from "@/lib/db";
import { watch } from "@/lib/watch";
import { gapReport } from "@/lib/gap-report";
import { unseal } from "@/lib/crypto";
import { parties, others, DECLARED, states2023 } from "@/lib/election2023";
import { buildBoard } from "@/lib/replay";
import { liveBoard, liveTree } from "@/lib/live-board";
import nation from "@/public/geo/map/nation.json";
import { register } from "@/lib/site";
import { formatNumber, formatShare } from "@/lib/utils";

export const metadata = { title: "Situation room", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The party or coalition situation room.
 *
 * It gets everything the broadcast desk gets, plus the two things a campaign
 * needs and a newsroom is not given: the incident feed in full, unsealed, and
 * the gap between what our agents filed and what has been declared.
 *
 * ── WHY THE GAP IS THE POINT ───────────────────────────────────────────────
 * A parallel count is not useful because it is faster. It is useful because it
 * is a second, independently sourced number to hold the declared one against.
 * Averaging the two destroys the only thing worth having, so they sit in
 * separate columns and the difference is computed rather than smoothed.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function RoomPage() {
  const user = await requireUser("/room");

  const [project, allProjects] = await Promise.all([currentElection(), listElections()]);

  /* Which of the day's contests is on the wall. A project holds five and they
     are five separate counts, so this is as much a part of "what am I looking
     at" as the project is — and it decides which returns the board is built
     from. */
  const race = await currentRace(project);
  const filedByRace = project ? await results.countByRace(project.id) : {};
  const filed = filedByRace[race] ?? 0;

  /* ── ONE WAIT, NOT THREE ────────────────────────────────────────────────
     The database is across a network now, and these three ask it different
     questions that have nothing to do with each other. Awaited in sequence
     they cost the sum of three round trips; awaited together they cost the
     slowest one. On a warm connection that is the difference between a page
     in half a second and a page in two, and on a cold one it was the
     difference between twelve seconds and sixty.

     Only the photographs have to wait, because they are fetched by the ids
     of the incidents above and cannot be asked for until those are known. */
  const [rawFeed, coordinators, divergence, declaredRows] = await Promise.all([
    incidents.recent(40, project?.id),
    watch.coordinators(project?.id, race),
    /* The same function /gap builds its whole screen from. Two assemblers
       would mean the headline on this wall could disagree with the list on the
       drill-down, and the first time a room reads "3 impossible" here and
       finds four there is the last time anybody believes either. */
    /* The position matters: a night is several counts, not one, and holding
       our presidential returns against a governorship declaration compares two
       different contests. `defaultRace` reads it off the project. */
    gapReport(project?.id, race),
    /* What the commission declared for this project. It is what a board with
       no returns of its own has to draw, and it joins the same wait rather
       than adding a fifth round trip. */
    declared.all(project?.id, race),
  ]);

  /* ── THREE THINGS A MAP CAN BE, AND THEY ARE NOT INTERCHANGEABLE ─────────
     The 2023 project is a replay: a finished election played back on a timer,
     marked as a demonstration on its own row in the switcher.

     A project our agents have filed into is a parallel count, and that is what
     this room is for. The board is built from those returns and from nothing
     else, so a state colours when a booth in it reports and stays grey until
     one does.

     A project with no returns of its own falls back to what the commission
     declared, which is what makes the off-cycle governorships legible: those
     contests finished years ago and no agent of ours was at them. It is never
     mixed with the first — the moment a real return lands, the board becomes
     the count, because a map that blended our figures into a declaration would
     make the product agree with itself by construction.

     What each one is showing is carried on the board itself rather than worked
     out again by the screen, so the room can say so out loud. */
  const board =
    project && !project.isDemo && filed > 0
      ? await liveBoard({ electionId: project.id, race })
      : buildBoard(project, declaredRows);

  /* The drill-down reads this instead of apportioning a state's total across
     places nobody has reported from. Only ever built for a live count: there
     is nothing underneath a declared state figure to show. */
  const tree =
    project && !project.isDemo && filed > 0
      ? await liveTree({ electionId: project.id, race })
      : null;

  const feed = rawFeed.map((item) => ({
    ...item,
    /* Decrypted here and nowhere else: the situation room is one of the two
       roles permitted to read an incident narrative. */
    detail: item.detailSealed ? unseal(item.detailSealed) : null,
  }));

  const watchSummary = watch.summary(coordinators);

  /* The board's states, in the shape the map expects. Turnout is derived
     rather than carried: a declared figure gives votes and a register, and the
     percentage between them is arithmetic, not another fact to get wrong. */
  const boardStates = board.states.map((row) => ({
    code: row.code,
    name: row.name,
    votes: row.declared,
    total: row.declaredTotal,
    registered: row.registered,
    booths: row.booths,
    turnout: row.registered ? (row.declaredTotal / row.registered) * 100 : 0,
  }));
  const photoMap = Object.fromEntries(await media.forIncidents(feed.map((item) => item.id)));

  return (
    <SituationRoom
      user={user}
      board={board}
      shapes={nation}
      /* ── THE MAP HAS ITS OWN DATA PATH, AND IT ALSO HAD TO BE SCOPED ────
         The headline figures come from `board` and the map rows come from
         here, and fixing only the first left the country's outline correct
         and every figure inside it wrong: the off-cycle board reported the
         right six states and drew 2023 presidential votes on them, so Edo
         showed LP 581,266 where the declared result is APC 291,667.

         The demo keeps its own table, because the replay is built from it and
         the two must not drift. Every other project takes its rows from the
         board, which is already the project's own declared figures. */
      states={project?.isDemo ? states2023 : boardStates}
      incidents={feed}
      coordinators={coordinators}
      watchSummary={watchSummary}
      photos={photoMap}
      incidentCount={feed.length}
      scopeStates={project?.scopeStates ?? []}
      divergence={divergence}
      liveTree={tree}
      race={race}
      races={RACES.map((row) => ({ id: row.id, label: row.label }))}
      filedByRace={filedByRace}
      project={project ? { title: project.title, isDemo: project.isDemo } : null}
      /* ── WHAT THE MAP IS, IN ONE WORD, DECIDED HERE ────────────────────
         The room draws whichever of these it is handed and must say which,
         and only this page knows: it is the difference between "no returns
         have arrived" and "nothing was declared", which look identical on a
         grey map and mean entirely different things to the person watching. */
      boardSource={
        project?.isDemo
          ? "replay"
          : filed > 0
            ? "returns"
            : declaredRows.length > 0
              ? "declared"
              : "empty"
      }
      /* ── DATA, NOT A READY-MADE ELEMENT ────────────────────────────────
         This used to hand the switcher across already rendered. The switcher
         is a client component, so building it here bought nothing, and the
         element arrived on the other side as a plain child in an array React
         could not key, warning on every render of the room. The same mistake
         was made once before with LiveRefresh and fixed the same way: send
         the data and let the client component that needs it build the
         element. */
      projects={{
        current: project,
        all: allProjects,
        canCreate: ["SUPER_ADMIN", "SITUATION_ROOM"].includes(user.role),
        canDelete: user.role === "SUPER_ADMIN",
      }}
    />
  );
}
