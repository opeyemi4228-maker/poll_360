"use client";

import { useMemo, useState } from "react";
import { BarChart3, LineChart, Target } from "lucide-react";

import Executive from "./Executive";
import Strongholds from "./Strongholds";
import PartyStrength from "./PartyStrength";
import RulingParty from "./RulingParty";
import SeatBrief from "./SeatBrief";
import { PARTY_FILL } from "./Charts";
import { Panel, Readout, Split } from "./Figures";
import { TIMELINE, partyRecord } from "@/lib/record";
import { ADAMAWA, SEATS as ADAMAWA_SEATS } from "@/lib/adamawa";
import { cn, formatShare } from "@/lib/utils";

/**
 * Election Analytics: one dashboard, six questions.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY SEVEN TABS BECAME ONE
 *
 *  The analytics head held seven surfaces — the brief, party ground, the
 *  ruling party, clusters, trends, the projection, the sample — and they were
 *  seven answers to one question asked seven ways. Worse, they were seven
 *  *entry points*, so a person wanting to know how a state has behaved since
 *  1999 had to guess which of the seven the answer was on, and the guess was
 *  wrong about half the time.
 *
 *  One dashboard, in the order the questions are actually asked:
 *
 *    Overview     where we stand, in twelve figures
 *    Candidates   the parties, their runs, and who holds what now
 *    Strongholds  Atiku's ground, zone by zone, down to the polling unit
 *
 *  Planning is deliberately NOT here. "Where should we focus" is a different
 *  job with a different reader and a different output — a plan somebody is
 *  going to be asked to pay for — and mixing it into analysis is how a
 *  finding becomes a commitment nobody costed. See StrategicPlanning.jsx.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── 1999 TO THE LAST ELECTION HELD, AND THE JOIN BETWEEN THEM ──────────────
 * The record runs from the 1999 presidential to the Osun governorship of
 * August 2026, and it is two series rather than one: seven presidential
 * elections, and the off-cycle governorships that run underneath them on
 * their own cycle. Every screen here keeps them apart, because a presidential
 * share and a governorship share are two different offices on two different
 * ballots and subtracting one from the other produces a confident sentence
 * about a swing that never happened. See lib/record.js.
 */

/* ── GEOGRAPHY, TURNOUT AND TRENDS HAVE GONE ──────────────────────────────
   Removed on the room's own instruction. Two of the three were also the
   longest way round to something this product answers better elsewhere:
   turnout is a layer on the live map, where it drills, and the classified
   ground each campaign stands on is the strategic brief's own subject. What
   is left is the record — the count, the candidates, and what happened
   before — which is what somebody opens an analytics head to read. */
const TABS = [
  { id: "overview", label: "Overview", icon: BarChart3 },
  { id: "candidates", label: "Candidates", icon: LineChart },
  /* ── HISTORICAL HAS GONE ───────────────────────────────────────────────
     Removed on the room's instruction. Strongholds reads the same record and
     answers the question it was opened for — where the vote has held — on a
     map that goes down to the polling unit. Links to /room#historical still
     arrive here; see HASH_LAYERS in SituationRoom. */
  { id: "strongholds", label: "Strongholds", icon: Target },
];

export default function ElectionAnalytics({
  /* The brief and its assumptions, from `useBrief` — the same computation the
     map is coloured by, so the Overview and Geography tabs cannot disagree. */
  brief: briefState,
  slots = [],
  place = "Nigeria",
  shapes = null,
  territory = null,
  ground = null,
  /* Who governs each state, and how they got there — built in the room, which
     is the only place that reads lib/governors.js. */
  governing = null,
  /* The room's map at the depth it is standing, for the Overview to draw on.
     See `map` in components/dash/Executive.jsx. */
  map = null,
  /* ── WHICH CONTEST THE THREE TABS ARE ABOUT ────────────────────────────
     The count on the Overview is already this contest's. The other two follow
     it: a Senate room is shown who holds the seats and its districts' ground,
     never a presidential ranking dressed as its own. */
  race = "PRESIDENTIAL",
  /* Who holds this ground in this contest, and the last result for it. Built
     on the server — see `seat` in app/room/page.jsx. */
  seat = null,
  onOpen,
  onGo,
  pathOf,
}) {
  const [tab, setTab] = useState(TABS[0].id);
  const presidential = race === "PRESIDENTIAL";

  return (
    <div className="flex flex-col gap-3">
      {/* ── SIX TABS, NOT A DROPDOWN ───────────────────────────────────────
          Every one of these is somewhere a person arrives wanting to be, and
          a destination behind a menu is a destination that stops being used.
          The same argument the room's own tab bar makes one level up. */}
      <div
        role="tablist"
        aria-label="Election analytics"
        className="flex flex-wrap gap-1 rounded-dash border border-dash-line bg-dash-card p-1"
      >
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              <item.icon size={15} strokeWidth={2.25} />
              {item.id === "candidates" && !presidential ? "Seats" : item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <Executive
          state={briefState}
          slots={slots}
          place={place}
          onOpen={onOpen}
          pathOf={pathOf}
          map={map}
        />
      )}

      {tab === "candidates" && (
        <Candidates
          shapes={shapes}
          territory={territory}
          ground={ground}
          governing={governing}
          race={race}
          seat={seat}
        />
      )}

      {tab === "strongholds" && (
        <Strongholds shapes={shapes} race={race} territory={territory} ground={ground} />
      )}

    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ candidates */

/**
 * The parties: their runs, and who holds what now.
 *
 * ── A PARTY WITH NO PRESIDENTIAL RUN HAS NO NATIONAL SHARE ─────────────────
 * Accord has held Osun since August 2026 and has never stood a presidential
 * candidate in this record. Drawing it at 0% would put it at the bottom of a
 * ranking as though it had contested and lost. It has a governorship and no
 * national share, and those are two different facts.
 */
function Candidates({ shapes, territory, ground, governing, race = "PRESIDENTIAL", seat = null }) {
  const record = useMemo(() => partyRecord(), []);
  const contested = record.filter((party) => party.latest !== null);
  const seatsOnly = record.filter((party) => party.latest === null && party.governorships.length);
  const presidential = race === "PRESIDENTIAL";
  /* A presidential room opens on one party's ground. Every other contest
     opens on who holds office, which is the record those contests have. */
  const [half, setHalf] = useState(presidential ? "record" : "ruling");
  const hasSeat = Boolean(seat && (seat.holders?.length || seat.result));

  const halves = [
    { id: "record", label: presidential ? "One party's ground" : "One party's presidential vote" },
    { id: "ruling", label: "Who governs now" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {!presidential && territory && hasSeat && (
        <SeatBrief
          race={seat.race}
          raceLabel={seat.raceLabel}
          ground={ground ?? territory.name}
          holders={seat.holders}
          result={seat.result}
        />
      )}

      {race === "GOVERNORSHIP" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <GovernorsPanel governing={governing} />
          <GovernorshipsPanel seatsOnly={seatsOnly} />
        </div>
      ) : !presidential ? (
        <SeatsPanel race={race} territory={territory} ground={ground} hasSeat={hasSeat} />
      ) : (
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel
          title="Presidential share, most recent"
          figure={`${contested.length} parties`}
          foot="Share of the valid vote at the last presidential election."
        >
          <Split
            segments={contested.slice(0, 5).map((party) => ({
              id: party.id,
              label: party.id,
              value: Math.round(party.latest * 10),
              color: PARTY_FILL[party.id] ?? "var(--color-party-other)",
            }))}
          />
          <ul className="mt-4 space-y-0.5">
            {contested.slice(0, 6).map((party) => (
              <li key={party.id}>
                <Readout
                  label={party.name}
                  value={formatShare(party.latest)}
                  sub={
                    party.drift === null
                      ? `${party.elections} election${party.elections === 1 ? "" : "s"}`
                      : `${party.drift > 0 ? "+" : "−"}${formatShare(Math.abs(party.drift))} since ${party.run[0].year}`
                  }
                />
              </li>
            ))}
          </ul>
        </Panel>

        <GovernorshipsPanel seatsOnly={seatsOnly} />
      </div>
      )}

      {/* The two big party surfaces, kept whole, behind a switch: one is a
          party's ground across the country, the other is who governs where.
          Outside a presidential room the office comes first. */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {(presidential ? halves : [...halves].reverse()).map((item) => {
          const active = half === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setHalf(item.id)}
              aria-pressed={active}
              className={cn(
                "flex-1 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {half === "record" ? (
        <PartyStrength shapes={shapes} territory={territory} ground={ground} />
      ) : governing ? (
        <RulingParty
          rows={governing.rows}
          shapes={shapes}
          fct={governing.fct}
          seats={governing.seats}
          moves={governing.moves}
        />
      ) : (
        <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-8 text-center text-[0.875rem] text-dash-muted">
          Who governs each state is not loaded for this contest.
        </p>
      )}
    </div>
  );
}

/** Every off-cycle governorship in the record, newest first. */
function GovernorshipsPanel({ seatsOnly = [] }) {
  const rows = TIMELINE.filter((row) => row.kind === "GOVERNORSHIP");
  return (
    <Panel
      title="Governorships in the record"
      figure={`${rows.length} contests`}
      foot="Off-cycle governorships, November 2023 to the most recent. Counted apart from any presidential share: different office, different ballot."
    >
      <ul className="space-y-0.5">
        {rows
          .slice()
          .reverse()
          .map((row) => (
            <li key={row.id}>
              <Readout label={`${row.place} ${row.year}`} value={row.winner} sub={row.candidate} />
            </li>
          ))}
      </ul>

      {seatsOnly.length > 0 && (
        <p className="mt-3 border-t border-dash-line pt-2.5 text-[0.75rem] leading-relaxed text-dash-muted">
          <strong className="text-dash-ink">{seatsOnly.map((party) => party.name).join(", ")}</strong>{" "}
          {seatsOnly.length === 1 ? "holds a state" : "hold states"} and has never stood a presidential
          candidate in this record, so {seatsOnly.length === 1 ? "it has" : "they have"} no national share —
          which is a different thing from a national share of nothing.
        </p>
      )}
    </Panel>
  );
}

/**
 * Governors by party, today and at the ballot.
 *
 * The two differ since 2025, and the difference is governorships no voter was
 * asked about — so both are printed, the party they sit with first.
 */
function GovernorsPanel({ governing }) {
  if (!governing) return null;
  const current = governing.seats.current;
  const elected = new Map(governing.seats.elected.map((row) => [row.party, row.seats]));

  return (
    <Panel
      title="Who governs the states"
      figure={`${governing.rows.length} states`}
      foot="Each governor under the party they sit with today. The number they won at the ballot is beside it — the gap is governors who changed party after the vote."
    >
      <Split
        segments={current.map((row) => ({
          id: row.party,
          label: row.party,
          value: row.seats,
          color: PARTY_FILL[row.party] ?? "var(--color-party-other)",
        }))}
      />
      <ul className="mt-4 space-y-0.5">
        {current.map((row) => (
          <li key={row.party}>
            <Readout
              label={row.party}
              value={`${row.seats} ${row.seats === 1 ? "state" : "states"}`}
              sub={`won ${elected.get(row.party) ?? 0} at the ballot`}
            />
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* How many seats each contest has, and what one is called. */
const SEAT_WORDS = {
  SENATE: { office: "Senate", seat: "senatorial district", total: 109 },
  REPRESENTATIVES: { office: "House of Representatives", seat: "federal constituency", total: 360 },
  ASSEMBLY: { office: "House of Assembly", seat: "state constituency", total: 990 },
  LGA: { office: "local government chairmanship", seat: "local government", total: 774 },
};

/**
 * The seats of a Senate, House or council contest that are on record.
 *
 * ── WHAT IS HELD, SAID PLAINLY ──────────────────────────────────────────
 * Who holds each seat is transcribed state by state, and Adamawa is the state
 * done so far. No vote totals are published for any of these seats, so none
 * are shown — a seat's winner is printed with no figure rather than a figure
 * borrowed from another election.
 */
function SeatsPanel({ race, territory, ground, hasSeat }) {
  const words = SEAT_WORDS[race] ?? { office: "this contest", seat: "seat", total: null };
  const inGround = !territory?.stateNumber || territory.stateNumber === ADAMAWA.number;
  const onRecord = inGround ? ADAMAWA_SEATS.filter((row) => row.race === race) : [];

  /* A room narrowed to its own seat already has the seat card above. */
  if (territory && hasSeat) return null;

  const byParty = Object.entries(
    onRecord.reduce((tally, row) => ({ ...tally, [row.party]: (tally[row.party] ?? 0) + 1 }), {})
  ).sort((a, b) => b[1] - a[1]);

  return (
    <Panel
      title={`${words.office[0].toUpperCase()}${words.office.slice(1)} seats on record`}
      figure={words.total ? `${onRecord.length} of ${words.total}` : `${onRecord.length}`}
      foot={`Holders are added state by state, and Adamawa is on record so far. No ${words.office} vote totals are published for any seat, so none are shown. The Strongholds tab reads the presidential vote on the same ground, and says so.`}
    >
      {onRecord.length ? (
        <>
          <Split
            segments={byParty.map(([party, seats]) => ({
              id: party,
              label: party,
              value: seats,
              color: PARTY_FILL[party] ?? "var(--color-party-other)",
            }))}
          />
          <ul className="mt-4 grid gap-x-6 gap-y-0.5 lg:grid-cols-2">
            {onRecord.map((row) => (
              <li key={row.territory}>
                <Readout label={row.place} value={row.party} sub={row.holder} />
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
          {territory
            ? `Who holds ${ground ?? territory.name} is not on record here yet.`
            : `No ${words.seat} holder is on record here yet.`}{" "}
          The count on the Overview tab fills in as returns arrive, and the Strongholds tab shows where the
          vote has held on this ground.
        </p>
      )}
    </Panel>
  );
}
