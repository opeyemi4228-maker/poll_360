import { AlertTriangle, Gauge, Scale, ShieldAlert, Users } from "lucide-react";


import { PartyBars, CoverageBar } from "@/components/dash/Charts";
import { cookies } from "next/headers";

import SituationRoom from "@/components/dash/SituationRoom";
import { listElections } from "@/lib/election-scope";
import { elections } from "@/lib/elections";
import { viewing } from "@/lib/viewing";
import { viewFromCookies } from "@/lib/last-view";
import { IS_VIEW, LANDING } from "@/lib/room-views";
import { lgasOf, resolveTerritory } from "@/lib/constituencies";
import { holdersOf, lastResultFor } from "@/lib/seats";
import { RACES, raceLabel } from "@/lib/races";
import { results, incidents, media, declared, sheetReads, units } from "@/lib/db";
import { watch } from "@/lib/watch";
import { gapReport } from "@/lib/gap-report";
import { nightPulse, sheetAudits } from "@/lib/pulse";
import { pipeline } from "@/lib/operations";
import { boothBoard } from "@/lib/reporting";
import { raiseAlerts } from "@/lib/alerts";
import { nightTimeline } from "@/lib/timeline";
import { unitCards } from "@/lib/unit-card";
import { integrityOf } from "@/lib/anomalies";
import { unseal } from "@/lib/crypto";
import { parties, others, DECLARED, states2023 } from "@/lib/election2023";
import { buildBoard } from "@/lib/replay";
import { liveBoard, liveTree } from "@/lib/live-board";
import nation from "@/public/geo/map/nation.json";
import { register } from "@/lib/site";
import { principalOf } from "@/lib/principal";
import { spreadFor, statesFromView } from "@/lib/spread";
import { snapshot } from "@/lib/replay";
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
  /* ── WHO, WHAT, AND OVER WHAT GROUND, IN ONE CALL ───────────────────────
     The account, the project, which of the day's contests is on the wall, and
     the piece of Nigeria this room may read. The last of those is threaded
     into every query below rather than filtered out of the answers: a board
     built from the country and then narrowed is a board whose totals were
     right for somebody else. See lib/viewing.js. */
  const { user, project, race, territory, ground, pinned, unresolved } = await viewing("/room");

  const allProjects = await listElections();

  const filedByRace = project ? await results.countByRace(project.id, territory) : {};
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
  const [
    rawFeed,
    coordinators,
    divergence,
    declaredRows,
    ourRows,
    readings,
    registrySize,
    statuses,
  ] = await Promise.all([
    incidents.recent(40, project?.id, territory),
    watch.coordinators(project?.id, race, territory),
    /* The same function /gap builds its whole screen from. Two assemblers
       would mean the headline on this wall could disagree with the list on the
       drill-down, and the first time a room reads "3 impossible" here and
       finds four there is the last time anybody believes either. */
    /* The position matters: a night is several counts, not one, and holding
       our presidential returns against a governorship declaration compares two
       different contests. `defaultRace` reads it off the project. */
    gapReport(project?.id, race, territory),
    /* What the commission declared for this project. It is what a board with
       no returns of its own has to draw, and it joins the same wait rather
       than adding a fifth round trip. */
    declared.all(project?.id, race, territory),
    /* ── THE RETURNS THEMSELVES, ONCE ───────────────────────────────────
       Three of the four surfaces added to the monitoring side read the rows
       rather than a rollup of them: the integrity screening needs every
       figure, the sheet audit needs the boxes at the head of each form, and
       the pulse needs every timestamp. Fetched here, once, and handed to all
       of them — three screens each running their own query over the same
       table is how a wall display that refreshes every fifteen seconds turns
       into the reason the database is slow. */
    project ? results.counted(project.id, race, territory) : [],
    /* How the machine readers have done. A summary, not the readings. */
    project ? sheetReads.summary(project.id) : null,
    /* ── THE OTHER DENOMINATOR, AND ONLY WHERE IT IS HONEST ─────────────
       The size of the project's registry. It is not territory-scoped, so a
       room narrowed to a district would be shown the whole project's booth
       count as though it were its own ground's — which is the exact class of
       quietly-wrong figure this product spends most of its comments avoiding.
       A narrowed room is given nothing here, and the screen simply does not
       draw the line. */
    project && !territory ? units.count(project.id) : 0,
    /* ── THE ONE FIGURE `counted` IS RIGHT TO HIDE ───────────────────────
       Returns a desk threw out. They are correctly absent from every tally,
       and they are one of the eight headline figures the results operations
       screen has to print — so they are counted separately rather than
       derived from a list they were filtered out of. */
    project ? results.statusCounts(project.id, race, territory) : {},
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
      ? await liveBoard({ electionId: project.id, race, territory })
      : buildBoard(project, declaredRows);

  /* ══════════════════════════════════════════════════════════════════════
     THE COMMAND DASHBOARD IS NEVER THE DEMONSTRATION

     `board` above falls back to the 2023 replay whenever the open project is
     a demonstration, which is right for Results — that tab is the replay, and
     it is how somebody is shown what the product does before an election.

     It is catastrophic for Command. That screen reports "our share" for a
     named party and a named candidate, and fed the replay it would have
     reported ADC's share of the 2023 presidential election as this campaign's
     live standing: a fabricated claim about a real campaign, on the largest
     type on the screen, with a real person's photograph beside it.

     So Command is built here, from the live count, always. On a demonstration
     project that is a clean slate — every party on the paper at zero, no
     state reporting — which is the honest picture and the one the room asked
     for. It never borrows a figure from the replay, and the two tabs are
     allowed to differ because they are answering about two different
     elections.

     Snapshotted at the end of its own events rather than on a cursor: there
     is nothing to scrub through in a live count, it is simply everything
     filed so far.
     ══════════════════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════════════════
     THE COMMAND FEED IS NOT CONNECTED YET, AND THE SCREEN SAYS SO

     Command is built from returns filed into this database. That is the right
     source and it is not yet the right *data*: what is in the database today
     is seeded — a demonstration count, filed by a script, to exercise the
     screens while they were being built.

     A campaign dashboard carrying a named candidate's photograph beside a
     seeded figure is the one thing this screen must never be, because nothing
     on it says the number was invented and everything about it says the
     number is theirs. So the feed is switched off at the source: the board is
     still built, every state is still drawn, and there is simply nothing in
     it.

     Switching it on is one environment variable and no code change —
     COMMAND_FEED=live — for the day the real transmission arrives. Until
     then the screen reads zero everywhere and says why, which is the honest
     picture and the one that cannot be mistaken for a count.
     ══════════════════════════════════════════════════════════════════════ */
  const commandLive = process.env.COMMAND_FEED === "live";

  const commandBoard = project
    ? await liveBoard({
        /* No election id means no rows — see lib/live-board.js. The states,
           the ballot and the shape of the board are all still there. */
        electionId: commandLive ? project.id : null,
        race,
        territory,
      })
    : null;

  const commandView = commandBoard ? snapshot(commandBoard, commandBoard.events.length) : null;

  const principal = principalOf(project);

  /* Where our party stands against section 134 — see lib/spread.js. Computed
     on the server off the same rows the dashboard draws, so the tiles and the
     state table cannot disagree about how many states have reported. */
  const commandSpread =
    commandView && commandBoard
      ? spreadFor({
          states: statesFromView({
            byState: commandView.byState,
            states: commandBoard.states,
            ballot: commandBoard.parties ?? [],
          }),
          partyId: principal.party,
        })
      : null;

  /* The drill-down reads this instead of apportioning a state's total across
     places nobody has reported from. Only ever built for a live count: there
     is nothing underneath a declared state figure to show. */
  const tree =
    project && !project.isDemo && filed > 0
      ? await liveTree({ electionId: project.id, race, territory })
      : null;

  const feed = rawFeed.map((item) => ({
    ...item,
    /* Decrypted here and nowhere else: the situation room is one of the two
       roles permitted to read an incident narrative. */
    detail: item.detailSealed ? unseal(item.detailSealed) : null,
  }));

  const watchSummary = watch.summary(coordinators);

  /* ── WHAT THE MONITORING SIDE READS ─────────────────────────────────────
     All three are pure functions over rows already in hand — see lib/pulse.js
     and lib/anomalies.js. Computed on the server rather than in the room for
     the ordinary reason: a browser on a wall should be drawing, not screening
     four thousand returns every fifteen seconds. */
  const pulse = nightPulse({
    rows: ourRows,
    watchList: coordinators,
    incidents: feed,
    unitsRegistered: registrySize,
  });
  /* The same screening the administrator's ledger runs, from the same
     function. Two rooms holding two counts of the same findings is how "three
     impossible" here and "four" there ends up on a broadcast. */
  const integrity = integrityOf(ourRows);
  const sheetFindings = sheetAudits(ourRows);

  /* ── THE OTHER THREE, OFF THE SAME ROWS ─────────────────────────────────
     The pipeline, the night's clock and the warning list. All three are pure
     functions over `ourRows`, `coordinators` and `feed` — nothing below costs
     a query, which is the whole reason this room can sit on a wall refreshing
     every fifteen seconds.

     The order matters once: `raiseAlerts` reads the pipeline, so the two
     screens can never disagree about how many returns are stuck. */
  const operations = pipeline({
    rows: ourRows,
    disputed: statuses.DISPUTED ?? 0,
    assigned: coordinators.length,
    unitsRegistered: registrySize,
  });

  /* ── WHO HAS NOT SENT THEIR RESULT, AT EVERY LEVEL ────────────────────
     The Booth dashboard's whole subject, rolled up here rather than in the
     browser for the same reason the pulse and the pipeline are: it is a pure
     function over `ourRows` and `coordinators`, both of which are already in
     hand on this request, and doing it here costs one pass over rows the page
     has already paid to fetch. Doing it in the browser would mean shipping
     both lists across the wire so the client could re-derive what the server
     was holding. See lib/reporting.js for the shape that crosses. */
  /* ══════════════════════════════════════════════════════════════════════
     WHERE THIS READER WAS, DECIDED HERE RATHER THAN IN THE BROWSER

     The room remembers the dashboard somebody was on so a reload does not
     cost them their place. That memory used to live in local storage, which
     does not exist on the server — so the first paint was always the front
     door and the remembered view replaced it a moment later. Every reload
     flashed a screen nobody asked for, and on a wall display a dashboard that
     changes by itself is one somebody walks over to check.

     Read here, it is settled before a single element is drawn. The value is
     never trusted: it is a cookie, which is a string somebody can type, so it
     has to name a view this build actually renders or it is discarded and the
     room opens where it always does. See lib/last-view.js. */
  const remembered = viewFromCookies(await cookies(), { valid: IS_VIEW });

  const booth = boothBoard({ roster: coordinators, rows: ourRows });


  const timeline = nightTimeline({ rows: ourRows, incidents: feed, coordinators });

  const escalations = raiseAlerts({ pulse, integrity, operations, incidents: feed });

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

  /* ── ONE BOOTH, EVERYTHING WE HOLD, INDEXED ONCE ────────────────────────
     Built here rather than fetched when somebody clicks a booth: clicking is
     the commonest interaction in this room and it happens most at the hour the
     connection in the room is worst. One pass over rows already in hand costs
     nothing and makes the card open with no network at all. See
     lib/unit-card.js for what is kept and what is deliberately trimmed. */
  const cards = unitCards({
    rows: ourRows,
    incidents: feed,
    coordinators,
    photos: photoMap,
  });

  return (
    <SituationRoom
      /* Never the first tab in the table — that is a layout decision and this
         is a behavioural one. See LANDING in lib/room-views.js. */
      initialView={remembered ?? LANDING}
      user={user}
      board={board}
      /* ── WHOSE ROOM THIS IS ─────────────────────────────────────────────
         Read here because lib/principal.js consults the environment, which a
         browser cannot. It decides whose figures the command dashboard is
         about; it never decides what those figures are — see the note at the
         head of lib/spread.js, which runs the same arithmetic for every party
         on the paper. */
      principal={principal}
      /* Everything the command dashboard draws, built above from the live
         count and never from the replay. */
      command={
        commandBoard && {
          board: commandBoard,
          spread: commandSpread,
          standings: commandView.standings,
          ticker: commandView.ticker,
          byState: commandView.byState,
          total: commandView.total,
          margin: commandView.margin,
          coverage: commandView.coverage,
          unitsReported: commandView.unitsReported,
          booths: commandView.booths,
          isDemoProject: Boolean(project?.isDemo),
          /* True while the feed is switched off above. The screen draws its
             own notice from this rather than leaving a reader to wonder
             whether a wall of zeroes is a quiet night or a broken page. */
          awaiting: !commandLive,
        }
      }
      /* What the last presidential election was actually won on, from the
         2023 declared record rather than typed as a literal: a benchmark
         written by hand is a benchmark that quietly disagrees with the record
         it came from. Drawn as a mark on our own share. */
      benchmark={(DECLARED.apc / DECLARED.validVotes) * 100}
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
      booth={booth}
      coordinators={coordinators}
      watchSummary={watchSummary}
      photos={photoMap}
      unitCards={cards}
      incidentCount={feed.length}
      scopeStates={project?.scopeStates ?? []}
      /* ── THE ACCOUNT'S OWN GROUND, WHICH IS NOT THE PROJECT'S ──────────
         `scopeStates` is what the contest covers; this is what this room may
         read of it. A project may run the governorship in six states while
         the newsroom looking at it holds one, and the map has to be the
         second. Handed down already resolved — its local governments named —
         because resolving one reads from disk. */
      territory={
        territory && {
          level: territory.level,
          name: territory.name,
          stateCode: territory.stateCode,
          /* The state's name, not only its code. Panels that have to say
             whose figures they are showing were printing the project's title
             instead — "Every figure below is Adamawa State, 2023's" where they
             meant "Adamawa's". */
          stateName: territory.stateName,
          stateNumber: territory.stateNumber,
          lgas: territory.lgas,
          /* The names as well as the codes, because the boundary files are
             keyed by name and turning "18/03" back into "Chikun" rests on an
             alphabetical assumption that lives in lib/lga-names.js. Making it
             twice, once of them in a browser, is how the map and the figures
             come to disagree about which places these are. */
          lgaNames: lgasOf(territory).map((row) => row.name),
          shared: territory.shared ?? null,
        }
      }
      ground={ground}
      racePinned={pinned}
      territoryUnresolved={unresolved}
      /* ── THE SEAT THIS ROOM IS ABOUT ──────────────────────────────────
         Who holds this ground in this contest, and what the last election
         for it came to. Read on the server because the seat tables reach
         lib/lga-names.js, which reads from disk — the same reason the local
         government names above are resolved here. A room that is narrowed
         shows this where an unnarrowed one shows the national ruling-party
         map: 37 states is the right answer to a question a senatorial
         campaign is not asking. */
      seat={{
        race,
        raceLabel: raceLabel(race),
        holders: holdersOf({ race, territory }),
        result: lastResultFor({ race, territory }),
      }}
      /* ── THE LAST GOVERNORSHIP IN THE STATES ON SCREEN ─────────────────
         The analytics screen's baseline. It read lib/offcycle.js alone, which
         holds the eight contests fought outside the general cycle — so for
         Adamawa, whose 2023 declaration this product has transcribed in full,
         it announced "no governorship result loaded" and rested every figure
         on the presidential vote instead. Two modules holding the same fact
         and only one of them consulted.

         Resolved here, from lib/seats.js, which is the one place that answers
         "the last election for this contest on this ground" — and shaped the
         way lib/offcycle.js shapes a row, so the screen reads one kind of
         thing however it was sourced. */
      stateResults={Object.fromEntries(
        (territory?.stateCode ? [territory.stateNumber] : []).flatMap((number) => {
          const whole = resolveTerritory(`STATE:${number}`);
          const last = whole && lastResultFor({ race: "GOVERNORSHIP", territory: whole });
          if (!last?.votes) return [];
          return [[
            whole.stateCode,
            {
              code: whole.stateCode,
              state: whole.name,
              votesOn: last.votesOn,
              winner: last.party,
              candidate: last.candidate,
              votes: last.votes,
              /* The register that election was actually run on, which is not
                 the presidential one: Adamawa's differ by 88,000. */
              registered: last.registered ?? null,
              source: last.source,
            },
          ]];
        })
      )}
      divergence={divergence}
      pulse={pulse}
      integrity={integrity}
      operations={operations}
      timeline={timeline}
      escalations={escalations}
      sheetFindings={sheetFindings}
      sheetReads={readings}
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
