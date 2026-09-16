"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, Users, Vote } from "lucide-react";

import UnitMap from "./UnitMap";
import { Meter } from "./Figures";
import { boundsOf } from "@/lib/bbox";
import { PARTY_FILL } from "./Charts";
import {
  AGE_BANDS,
  CANDIDATES,
  ratioAt,
  STRENGTH,
  STRENGTH_OF,
  TIER_LABEL,
  demographicsAt,
  hasDetail,
  loadDetail,
  strengthBand,
  watchDetail,
  childTier,
  childrenOf,
  coverage,
  coveredStates,
  membersAt,
  qualityOf,
  registerFor,
  votesAt,
} from "@/lib/members";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Party strength on the ground, on one big map you walk down.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE MAP IS THE SCREEN, NOT AN ORNAMENT BESIDE IT
 *
 *  The first version of this put a small map in a side column and the drill in
 *  a list. That is backwards. The question this screen answers — where is this
 *  party actually strong — is a question about a shape, and a shape shown at
 *  200 pixels in a sidebar is a decoration next to the list that is doing the
 *  real work.
 *
 *  So the country gets the width, and every tier of the drill is drawn:
 *
 *    NATION   37 states. Only the ones a register covers are coloured.
 *    STATE    that state's local governments, from its real boundary file.
 *    LGA      its wards, as a lattice inside the local government's outline.
 *    WARD     its polling units, the same way.
 *
 *  The first two are real geography. The last two are not, and cannot be:
 *  Nigeria publishes no ward or polling-unit boundary. Drawing invented ones
 *  would be the prettiest lie in the product, so those two tiers are a lattice
 *  of cells inside the true outline of the place that contains them — every
 *  cell a real place with a real count, arranged rather than located. The
 *  caption says so on the tier where it applies.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND THE TWO MEASURES ARE STILL NEVER ADDED UP ──────────────────────────
 * A member filled in a form; a vote was counted. The Sokoto register makes the
 * point better than any argument: 66,474 members, 1,900 of them recorded as
 * under eighteen and unable to cast a vote at all. Two columns, two headings,
 * no third figure combining them — see lib/members.js, which has no field that
 * could produce one.
 */

/* The parties this screen offers. A register and a vote line are independent:
   the ADC has a register and no separate 2023 column, everybody else here has
   a column and no register. */
const OFFERED = [
  { id: "ADC", name: "African Democratic Congress" },
  { id: "APC", name: "All Progressives Congress" },
  { id: "PDP", name: "Peoples Democratic Party" },
  { id: "LP", name: "Labour Party" },
  { id: "NNPP", name: "New Nigeria Peoples Party" },
];

/* ══════════════════════════════════════════════════════════════════════════
   WHAT A PLAN IS BEING DRAWN ON

   Two different things can be planned against and they answer different
   questions:

     REGISTER  how many of our people are in this place. An organisation.
     RESULT    how the place actually voted. Demonstrated support.

   A campaign wants both and wants them apart, because a ward thick with
   members that has never voted for you is a completely different job from one
   that voted for you and where you have nobody. Choosing BOTH shows the ratio
   between them, which is the only figure that says which of the two you are
   looking at.
   ══════════════════════════════════════════════════════════════════════════ */
/* What each strength band means, in the words the key prints under its name.
   The long form is `why` in lib/members.js, shown when a band is hovered. */
const BAND_MEANS = {
  HEAVY: "More than twice an even share",
  ABOVE: "One to two even shares",
  BELOW: "Half to one even share",
  THIN: "Under half an even share",
  BARE: "Fewer than 10 members",
};

const BASIS = [
  { id: "register", label: "Party register", what: "How many of our people are here." },
  { id: "result", label: "Last election", what: "How the place actually voted." },
  { id: "both", label: "Both", what: "The register measured against the vote." },
];

export default function PartyGround({ shapes = null }) {
  const [basis, setBasis] = useState("register");
  /* Whose vote the register is measured against when both are shown. Atiku
     Abubakar by default only because the PDP carried Sokoto in 2023; it is a
     picker, not an opinion. */
  const [against, setAgainst] = useState("PDP");
  const [party, setParty] = useState("ADC");
  const [stateCode, setStateCode] = useState("SOK");
  /* Which tier the map is drawing: the country, or the state above `path`.
     Declared here with the rest of the state because the figures below are
     computed from it — read further down, it was in its temporal dead zone
     and the screen threw before it drew anything.

     ── AND IT OPENS ON THE COUNTRY ────────────────────────────────────────
     It opened on one state when one state was all there was. The register
     covers every state now, so the first thing on the screen is the national
     picture and a state is something you press into. */
  const [atNation, setAtNation] = useState(true);
  const [path, setPath] = useState([]);
  const [hovered, setHovered] = useState(null);
  /* Where the pointer is inside the map frame, so the card can sit beside it
     rather than under it. Held here rather than in the map components because
     both tiers draw the same card. */
  const [pointer, setPointer] = useState(null);

  /* The local government outlines for whichever state is open. Fetched the
     same way and from the same files the room's own map uses, and stamped with
     the state it was fetched for so a late reply for a state we have left
     cannot draw over the one we are on. */
  const [boundaries, setBoundaries] = useState(null);

  /* ── THE WARDS OF THIS STATE, FETCHED WHEN THIS STATE IS OPENED ────────
     The national index ships with the page and carries every state and all
     774 local governments, which is what the map draws. The wards and polling
     units beneath them are a separate file per state, because all of them
     together are megabytes and nobody opens more than one or two.

     `tick` exists only to re-render when one lands. Until it does, the tiers
     below a local government report null rather than nought — see the head of
     lib/members.js — and the screen below says it is still fetching rather
     than drawing a state's wards as empty. */
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    const stop = watchDetail(() => {
      if (live) setTick((seen) => seen + 1);
    });
    loadDetail(party, stateCode);
    return () => {
      live = false;
      stop();
    };
  }, [party, stateCode]);

  const detailed = hasDetail(party, stateCode);

  /* This party's registers only. `coverage()` answers for every party that has
     one, and feeding all of them to the national map, the picker and the
     totals would draw one party's states in another party's colour the moment
     a second register is imported. */
  const held = useMemo(() => coverage().filter((row) => row.party === party), [party]);

  /* What the whole register covers, for a caption that has to be exactly
     true. Summed from the index rather than typed, so it stays right when the
     next register is imported. */
  const national = useMemo(
    () =>
      held.reduce(
        (into, row) => ({
          members: into.members + row.members,
          lgas: into.lgas + row.lgas,
          units: into.units + row.units,
        }),
        { members: 0, lgas: 0, units: 0 }
      ),
    [held]
  );
  const register = registerFor(party, stateCode);
  /* Beside the national map, the whole register's defects; inside a state,
     that state's. The panel sits next to a figure and has to caveat the
     figure that is actually on screen. */
  const quality = useMemo(
    () => qualityOf(party, atNation ? null : stateCode),
    [party, stateCode, atNation]
  );

  /* `tick` is a dependency of every figure below a local government: those
     read from the state file, and the state file arrives after the render
     that asked for it. */
  const rows = useMemo(
    () => childrenOf(party, stateCode, path),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [party, stateCode, path, tick]
  );
  /* ── AND SO DOES THE FIGURE ────────────────────────────────────────────
     At the country this is every member in every register imported, summed
     from the index. Reading it off the selected state instead is what put
     one state's 66,474 under a map of 28. */
  const members = atNation ? national.members : membersAt(party, stateCode, path);
  /* Below a local government with no state file yet: unknown, not empty. */
  const awaitingDetail = path.length >= 1 && !detailed;
  /* No national vote is held for a party here: `votesAt` answers per state,
     and the 2023 table keeps the ADC inside its "other" column, so there is
     nothing to sum that would be this party's. Unknown, and it says why. */
  const votes = atNation ? { known: false, why: "national" } : votesAt(party, stateCode, path);
  const covered = coveredStates(party);
  const ratio = useMemo(
    () => (basis === "register" ? null : ratioAt(party, stateCode, against, path)),
    [basis, party, stateCode, against, path]
  );

  useEffect(() => {
    if (!stateCode || atNation) return undefined;
    let cancelled = false;
    fetch(`/geo/lga/${stateCode}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => !cancelled && setBoundaries({ code: stateCode, data }))
      .catch(() => !cancelled && setBoundaries({ code: stateCode, data: null }));
    return () => {
      cancelled = true;
    };
  }, [stateCode, atNation]);

  const lgaShapes = boundaries?.code === stateCode ? boundaries.data : null;
  const loading = Boolean(stateCode) && !atNation && boundaries?.code !== stateCode;

  /* The same coverage rows in name order. `held` is ranked by size, which is
     right for the caption and wrong for a picker somebody scans for one
     state. */
  const byState = useMemo(
    () => [...held].sort((a, b) => a.state.localeCompare(b.state)),
    [held]
  );

  const byName = useMemo(() => new Map(rows.map((row) => [row.name, row])), [rows]);
  const biggest = rows[0]?.members ?? 1;
  const fill = PARTY_FILL[party] ?? "var(--color-dash-ink)";

  /* ── THE TRAIL ENDS WHERE YOU ARE STANDING ─────────────────────────────
     It used to carry the selected state whether or not the map was showing
     it, so the country view read "Nigeria › Sokoto" over a map of all 37
     states — and the footer under that map, which prints the last crumb and
     the figure beside it, said "Sokoto, 66,474 ADC members" while the reader
     was plainly looking at the whole country. */
  const crumbs = atNation
    ? [{ label: "Nigeria", go: () => setAtNation(true) }]
    : [
        { label: "Nigeria", go: () => setAtNation(true) },
        { label: register?.state ?? stateCode, go: () => { setAtNation(false); setPath([]); } },
        ...path.map((name, index) => ({
          label: name,
          go: () => { setAtNation(false); setPath(path.slice(0, index + 1)); },
        })),
      ];

  /* ── WHAT THE HOVER CARD IS ABOUT ─────────────────────────────────────
     The place under the pointer, at whatever tier is drawn, with its own
     breakdown. Computed here so both the choropleth and the lattice hand the
     same card the same shape, and so the lookup happens once per hover rather
     than once per shape on the map. */
  const under = useMemo(() => {
    if (!hovered) return null;
    const row = byName.get(hovered);
    const deep = [...path, hovered];
    return {
      name: hovered,
      kind: TIER_LABEL[childTier(path)],
      parent: path.length ? path[path.length - 1] : (register?.state ?? null),
      members: row?.members ?? null,
      share: row?.share ?? null,
      demographics: demographicsAt(party, stateCode, deep),
    };
  }, [hovered, byName, path, party, stateCode, register]);

  /* The outline the lattice tiers are drawn inside: the local government when
     showing its wards, and the same one when showing a ward's booths, because
     nothing smaller has a published boundary. */
  const outline = useMemo(() => {
    if (!lgaShapes?.lgas || path.length === 0) return [];
    const shape = lgaShapes.lgas.find((row) => row.name === path[0]);
    return shape ? [shape.d] : [];
  }, [lgaShapes, path]);

  /* ── THE KEY, COUNTED ON THE RULE THE MAP IS PAINTED WITH ──────────────
     At the country a state's share is of every member counted and the even
     split is across the states covered — exactly what `Nation` paints. Inside
     a state it is the rows on screen. One computation, so the number beside a
     colour is always how many shapes on the map carry it. */
  const coveredCount = covered.length;
  const legend = useMemo(() => {
    const whole = held.reduce((sum, row) => sum + row.members, 0) || 1;
    const places = atNation
      ? held.map((row) => ({ members: row.members, share: (row.members / whole) * 100 }))
      : rows;
    const siblings = atNation ? coveredCount : rows.length;
    const counts = Object.fromEntries(STRENGTH.map((band) => [band.id, 0]));
    for (const row of places) {
      const band = strengthBand(row.members, row.share, siblings);
      if (band) counts[band] += 1;
    }
    const tier = atNation ? "state" : TIER_LABEL[childTier(path)].toLowerCase();
    return { counts, siblings, even: siblings > 0 ? 100 / siblings : 100, tier };
  }, [atNation, held, rows, coveredCount, path]);

  return (
    <div className="flex flex-col gap-3">
      {/* ───────────────────────────────────────────────────────── the choosers */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-dash border border-dash-line bg-dash-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Party
          </span>
          <div className="flex flex-wrap gap-1">
            {OFFERED.map((item) => {
              const has = coveredStates(item.id).length > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setParty(item.id);
                    setPath([]);
                    /* Back to the country: a different party is a different
                       register, and which of 37 states to land in is not a
                       question the last one's answer carries over. */
                    setAtNation(true);
                  }}
                  title={
                    has
                      ? `${item.name} — membership register loaded`
                      : `${item.name} — no membership register has been imported`
                  }
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold transition-colors",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                    item.id === party
                      ? "text-white"
                      : "border border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                  )}
                  style={item.id === party ? { background: PARTY_FILL[item.id] ?? "var(--color-dash-ink)" } : undefined}
                >
                  {/* A dot only where a register exists, so the picker itself
                      says which parties this deployment can answer for. */}
                  {has && (
                    <span
                      aria-hidden="true"
                      className={cn("size-1.5 rounded-full", item.id === party ? "bg-white/80" : "bg-emerald-500")}
                    />
                  )}
                  {item.id}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── THE STATE, AS A LIST AS WELL AS A MAP ──────────────────────
            Pressing a state on the map is the nicer way in and it was the only
            way in, which stopped being reasonable the moment the register grew
            from one state to 37: Lagos and Ebonyi are a few pixels across on a
            national outline, and nothing on the map can be reached from a
            keyboard. */}
        <label className="flex items-center gap-2">
          <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            State
          </span>
          <select
            value={atNation ? "" : stateCode}
            onChange={(event) => {
              const code = event.target.value;
              setPath([]);
              setHovered(null);
              if (!code) {
                setAtNation(true);
                return;
              }
              setStateCode(code);
              setAtNation(false);
            }}
            className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
          >
            <option value="">All Nigeria</option>
            {byState.map((row) => (
              <option key={row.stateCode} value={row.stateCode}>
                {row.state} — {formatNumber(row.members)}
              </option>
            ))}
          </select>
        </label>

        {/* ── WHAT TO PLAN ON ────────────────────────────────────────────
            Three states, not a checkbox pair: "both" is its own thing, because
            it does not draw two datasets at once — it draws the ratio between
            them, which is a third figure neither half has on its own. */}
        <div
          role="group"
          aria-label="What to plan on"
          className="flex items-center rounded-full border border-dash-line bg-dash-bg p-1"
        >
          {BASIS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setBasis(item.id)}
              aria-pressed={basis === item.id}
              title={item.what}
              className={cn(
                "rounded-full px-3 py-1 text-[0.75rem] font-bold whitespace-nowrap transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                basis === item.id ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {basis !== "register" && (
          <label className="flex items-center gap-2">
            <span className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              Against
            </span>
            <select
              value={against}
              onChange={(event) => setAgainst(event.target.value)}
              className="rounded-dash-sm border border-dash-line bg-dash-bg px-2 py-1 text-[0.8125rem] font-semibold text-dash-ink"
            >
              {CANDIDATES.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.party})
                </option>
              ))}
            </select>
          </label>
        )}

        <p className="ml-auto text-[0.75rem] text-dash-muted">
          {held.length === 1
            ? `${held[0].party} in ${held[0].state}: ${formatNumber(held[0].members)} members across ${formatNumber(held[0].units)} polling units.`
            : `${party}: ${formatNumber(national.members)} members across ${held.length} states, ${formatNumber(national.lgas)} local governments and ${formatNumber(national.units)} polling units.`}
        </p>
      </div>

      {!register ? (
        /* The state actually selected, not the first row of a coverage list
           that belongs to a different party. The vote quoted underneath is
           this state's, so naming any other state puts a true figure under a
           false heading. */
        <NoRegister
          party={party}
          votes={votes}
          state={byState.find((row) => row.stateCode === stateCode)?.state ?? stateCode}
        />
      ) : (
        <>
          {/* ═══════════════════════════════════════════════════════ the two figures */}
          {/* ── ONE STATEMENT EACH, NOT TWO ─────────────────────────────────
              These were two panels that each said their point twice: once as
              a body and once again as a footnote underneath it. Two sentences
              saying the same thing read as two facts, and a reader spends a
              beat working out which is which before discovering they are the
              same. One figure, one line under it, nothing else. */}
          <div className="grid gap-3 rounded-dash border border-dash-line bg-dash-card p-4 sm:grid-cols-2">
            <Figure
              icon={Users}
              label={`${party} members`}
              value={members === null ? "—" : formatNumber(members)}
              says={
                members === null
                  ? "No register imported for this party."
                  : atNation
                    ? `Across every ${party} register imported — ${held.length} state${held.length === 1 ? "" : "s"}.`
                    : path.length === 0
                      ? `Across the whole ${register.state} register.`
                      : `In ${path[path.length - 1]}.`
              }
            />

            <Figure
              icon={votes.known ? Vote : AlertTriangle}
              label={`${party} votes`}
              value={votes.known ? formatNumber(votes.votes) : "—"}
              muted={!votes.known}
              says={
                votes.known
                  ? `${formatShare(votes.share)} of the ${formatNumber(votes.of)} cast, 2023 presidential.`
                  : votes.why === "below-state"
                    ? `No Nigerian election publishes a vote below the state, so there is none to show. Dividing ${register.state}'s total among its wards would look precise and be invented.`
                    : votes.why === "in-other"
                      ? `Inside the "other" column of the 2023 state table — ${formatNumber(votes.bucket)} votes shared with every minor party.`
                      : votes.why === "national"
                        ? "The published vote is held state by state. Open a state to see its."
                        : "Not held for this place."
              }
            />
          </div>

          {/* ══════════════════════════════════════════════════════════ the map */}
          {/* ── THE MAP IS THE SCREEN ────────────────────────────────────────
              Pinned under the bar and given the full height of the viewport,
              the same way the deployment map is — see components/dash/
              PlanningMap.jsx. The panels beside it change length constantly as
              you drill from 23 local governments to 300 booths; if the page
              scrolled as one document every one of those pushed the country
              off screen and the reader had to hunt for it again.

              Below xl it stacks and the page scrolls normally, because on a
              phone a pinned half-screen map leaves nothing to read in. */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
            <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0">
              {/* ══════════════════════════════════════════ where you are
                  ── THE TRAIL BELONGS IN THE FRAME ──────────────────────────
                  It was a card of its own, floating above the map with a gap
                  between them. That put the one control that says how deep
                  you are outside the thing it is describing: the map pins
                  itself under the bar and keeps the height of the viewport
                  while the page scrolls past it, so on any real screen the
                  breadcrumb scrolled away and left a map with no answer to
                  "where am I".

                  Inside the frame it cannot: it is the frame's top edge, it
                  travels with the map, and it is the same object in the same
                  place as on every other map in this product — see the
                  identical bar in components/dash/SituationRoom.jsx. A reader
                  who has learnt where to look on one map should not have to
                  learn again on another. */}
              <nav
                aria-label="Where you are"
                className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5"
              >
                {/* Keyed by depth rather than by name: a state and one of its
                    own local governments can share a label, and position in
                    the trail is the thing that is actually unique. */}
                {crumbs.map((crumb, index) => (
                  <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight size={13} className="shrink-0 text-white/40" />}
                    <button
                      type="button"
                      onClick={crumb.go}
                      className={cn(
                        "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60",
                        (atNation && index === 0) || (!atNation && index === crumbs.length - 1)
                          ? "text-white"
                          : "text-white/55 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      {crumb.label}
                    </button>
                  </span>
                ))}

                {/* What is one level down, on the right, where the room's map
                    puts its own controls. It is the count a reader is about
                    to drill into, so it belongs on the bar they drill from. */}
                <span className="ml-auto pl-2 text-[0.75rem] text-white/45">
                  {atNation
                    ? `${covered.length} state${covered.length === 1 ? "" : "s"} covered`
                    : `${formatNumber(rows.length)} ${TIER_LABEL[childTier(path)].toLowerCase()}s below`}
                </span>
              </nav>

              {/* What the shading means, under the trail rather than beside
                  it: the trail answers "where", this answers "what am I
                  looking at", and stacking them keeps each to one line. */}
              <p className="border-b border-board-line px-4 py-2 text-[0.75rem] text-white/45">
                {atNation
                  ? `Each state is coloured by how strong the ${party} register is there — the key is under the map. Press one to go in.`
                  : `Each place is coloured by how strong the ${party} register is there — the key is under the map. Press one to go in.`}
              </p>

              <div
                className="relative min-h-0 flex-1 p-2"
                onPointerMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setPointer({
                    x: event.clientX - box.left,
                    y: event.clientY - box.top,
                    width: box.width,
                    height: box.height,
                  });
                }}
                onPointerLeave={() => {
                  setPointer(null);
                  setHovered(null);
                }}
              >
                {loading && !atNation && path.length === 0 && (
                  <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                    <Loader2 size={16} className="animate-spin" />
                    Loading boundaries
                  </p>
                )}

                {/* ── STILL FETCHING, WHICH IS NOT THE SAME AS EMPTY ───────
                    The wards of a state arrive in their own file. Between
                    opening a local government and that file landing there are
                    no rows to draw, and a blank frame would read as a place
                    with no members in it. This says which it is. */}
                {awaitingDetail && !atNation && (
                  <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                    <Loader2 size={16} className="animate-spin" />
                    Loading {register?.state ?? stateCode} wards
                  </p>
                )}

                {atNation ? (
                  /* ── THE COUNTRY ──────────────────────────────────────────
                     Only states a register covers are drawn in the party's
                     colour. The rest are the board, because a state nobody has
                     counted and a state with no members look identical the
                     moment you colour both. */
                  <Nation
                    shapes={shapes}
                    covered={covered}
                    held={held}
                    hovered={hovered}
                    onHover={setHovered}
                    onOpen={(code) => {
                      if (!covered.includes(code)) return;
                      setStateCode(code);
                      setAtNation(false);
                      setPath([]);
                    }}
                  />
                ) : path.length === 0 ? (
                  /* The state's local governments, in their real shapes. */
                  <Choropleth
                    shapes={lgaShapes}
                    byName={byName}
                    siblings={rows.length}
                    hovered={hovered}
                    onHover={setHovered}
                    onOpen={(name) => setPath([name])}
                  />
                ) : (
                  /* ── WARDS AND BOOTHS, ARRANGED RATHER THAN LOCATED ──────
                     Nigeria publishes no ward or polling-unit boundary, so
                     these are cells inside the true outline of the local
                     government that contains them. Every cell is a real place
                     with a real count; where it sits inside the outline is not
                     a claim, and the caption under the frame says so. */
                  <UnitMap
                    outline={outline}
                    parentLabel={path[0]}
                    childWord={TIER_LABEL[childTier(path)].toLowerCase()}
                    tint={fill}
                    hovered={hovered}
                    onHover={setHovered}
                    onOpen={(row) => {
                      if (path.length < 3) setPath([...path, row.name ?? row.key]);
                    }}
                    rows={rows.map((row) => ({
                      key: row.name,
                      name: row.name,
                      value: row.members,
                      note: `${formatNumber(row.members)} members · ${formatShare(row.share)} of ${path[path.length - 1]}`,
                      fix: null,
                      /* The same five bands the choropleth uses, so a
                         reader who learnt the key on the state map does not
                         have to learn it again inside a ward. */
                      paint: {
                        fill: STRENGTH_OF[strengthBand(row.members, row.share, rows.length)]?.fill
                          ?? "var(--color-silent)",
                        opacity: 1,
                      },
                    }))}
                  />
                )}

                {/* Beside the pointer, never under it, and flipped to the other
                    side where it would run off an edge. */}
                {under && pointer && !atNation && (
                  <MemberCard {...under} pointer={pointer} fill={fill} />
                )}
              </div>

              {/* ── THE KEY, AND THE FIGURE THE MAP IS ABOUT ────────────
                  A banded map without a key is a map of colours nobody can
                  read. Every band carries its own count of places, so the key
                  is also the answer to "how many of these are weak". */}
              {/* ── A KEY ON EVERY TIER, INCLUDING THE COUNTRY ─────────────
                  It was a row of band names inside a state and nothing at all
                  on the national map, which is the first thing anybody sees.
                  Every band now says in plain words what it means, how many
                  places on the map carry it, and what "an even share" is at
                  this level — the yardstick every band is measured against. */}
              {(atNation || rows.length > 0) && (
                <div className="border-t border-board-line px-5 py-3">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span className="text-[0.625rem] font-bold tracking-[0.1em] text-white/60 uppercase">
                      What the colours mean
                    </span>
                    <span className="text-[0.6875rem] text-white/50">
                      {party} members in each {legend.tier}, against an even split of{" "}
                      <span className="figure font-bold text-white/80">{formatShare(legend.even)}</span> each
                      across {formatNumber(legend.siblings)} {legend.tier}
                      {legend.siblings === 1 ? "" : "s"}
                    </span>
                  </p>
                  <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 2xl:grid-cols-6">
                    {[...STRENGTH].reverse().map((band) => (
                      <li key={band.id} className="flex items-start gap-2" title={band.why}>
                        <span
                          aria-hidden="true"
                          className="mt-0.5 size-3 shrink-0 rounded-[3px]"
                          style={{ background: band.fill }}
                        />
                        <span className="min-w-0 leading-tight">
                          <span className="flex items-baseline gap-1.5 text-[0.75rem] font-bold text-white">
                            {band.label}
                            <span className="figure text-[0.6875rem] text-white/60 tabular-nums">
                              {formatNumber(legend.counts[band.id])}
                            </span>
                          </span>
                          <span className="block text-[0.625rem] text-white/50">{BAND_MEANS[band.id]}</span>
                        </span>
                      </li>
                    ))}
                    <li className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 size-3 shrink-0 rounded-[3px] ring-1 ring-white/15"
                        style={{ background: "var(--color-silent)" }}
                      />
                      <span className="leading-tight">
                        <span className="block text-[0.75rem] font-bold text-white">
                          {atNation ? "No register" : "None recorded"}
                        </span>
                        <span className="block text-[0.625rem] text-white/50">
                          Not counted — not the same as no members
                        </span>
                      </span>
                    </li>
                  </ul>
                </div>
              )}

              <footer className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-board-line px-5 py-2.5">
                <span className="text-[0.75rem] text-white/55">
                  {crumbs[crumbs.length - 1].label}
                </span>
                <span className="figure text-[0.875rem] font-bold text-white tabular-nums">
                  {members === null ? "—" : `${formatNumber(members)} ${party} members`}
                </span>
              </footer>
            </div>

            {/* ═════════════════════════════════════════ the list beside the map */}
            <div className="flex min-w-0 flex-col gap-3">
            {/* ── THE RATIO SITS ABOVE THE LIST ──────────────────────────
                It is the answer this screen is being opened for once a plan
                is being drawn on both halves, and the list under it is how
                you move to the next place. Answer first, navigation second. */}
            {ratio && <RatioPanel ratio={ratio} party={party} state={register.state} path={path} />}

            <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-dash-line px-5 py-3.5">
                <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">
                  {TIER_LABEL[childTier(path)]}s, biggest first
                </h2>
                <p className="text-[0.8125rem] text-dash-muted">
                  Share is of {crumbs[crumbs.length - 1].label}, not of the state
                </p>
              </header>

              {rows.length === 0 ? (
                <p className="px-5 py-10 text-center text-[0.875rem] text-dash-muted">
                  {path.length >= 3
                    ? "A polling unit is as deep as a register goes."
                    : "Nothing recorded below here."}
                </p>
              ) : (
                <ul className="divide-y divide-dash-line">
                  {rows.map((row) => {
                    const canDrill = path.length < 3;
                    const Tag = canDrill ? "button" : "div";
                    const band = strengthBand(row.members, row.share, rows.length);
                    return (
                      <li key={row.name}>
                        <Tag
                          {...(canDrill ? { type: "button", onClick: () => setPath([...path, row.name]) } : {})}
                          onPointerEnter={() => setHovered(row.name)}
                          onPointerLeave={() => setHovered(null)}
                          className={cn(
                            "flex w-full items-center gap-4 px-5 py-2.5 text-left transition-colors",
                            hovered === row.name && "bg-dash-bg",
                            canDrill && "hover:bg-dash-bg"
                          )}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.875rem] font-semibold text-dash-ink">
                              {row.name}
                            </span>
                            <span aria-hidden="true" className="mt-1 block h-1.5 rounded-full bg-dash-bg">
                              <span
                                className="block h-full rounded-full transition-[width] duration-500"
                                style={{
                                  width: `${(row.members / biggest) * 100}%`,
                                  background: STRENGTH_OF[band]?.fill ?? fill,
                                }}
                              />
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="figure block text-[0.9375rem] font-bold text-dash-ink tabular-nums">
                              {formatNumber(row.members)}
                            </span>
                            <span className="block text-[0.6875rem] text-dash-muted">
                              <span className="figure tabular-nums">{formatShare(row.share)}</span>
                              {band ? ` · ${STRENGTH_OF[band].label.toLowerCase()}` : ""}
                            </span>
                          </span>
                          {canDrill && <ChevronRight size={15} className="shrink-0 text-dash-muted" />}
                        </Tag>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {quality && quality.notes.length > 0 && (
              <QualityPanel quality={quality} />
            )}

            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ the tiers */

/** The country, with only the states a register covers drawn in. */
/**
 * Nigeria, shaded by how many of the party's members are in each state.
 *
 * ── IT USED TO BE ONE FLAT COLOUR, AND THAT WAS RIGHT AT THE TIME ─────────
 * When one state had been imported, "covered" and "not covered" was the only
 * distinction there was to draw, so every covered state was painted the
 * party's colour and the map answered one question: is there a register here.
 *
 * All 37 are imported now, so that map would paint the whole country a single
 * flat block and answer nothing. It is banded instead, on exactly the scale
 * the local government map below it uses — `strengthBand`, measured against
 * the even split of this tier, which for 37 states is 2.7% each. The doctrine
 * at the head of lib/members.js is that the rule travels between tiers, and
 * this is the tier it travels up to.
 */
function Nation({ shapes, covered, held, hovered, onHover, onOpen }) {
  if (!shapes?.states?.length) {
    return <p className="py-16 text-center text-[0.875rem] text-white/50">No national outline loaded.</p>;
  }

  const byCode = new Map(held.map((row) => [row.stateCode, row]));
  /* The denominator is the register, not the country: a state's share is its
     share of the members that have actually been counted. */
  const whole = held.reduce((sum, row) => sum + row.members, 0) || 1;

  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="h-full w-full"
      role="img"
      aria-label="Nigeria. States covered by a membership register are coloured; press one to open it."
    >
      {shapes.states.map((state) => {
        const on = covered.includes(state.code);
        const row = byCode.get(state.code);
        const band = row ? strengthBand(row.members, (row.members / whole) * 100, covered.length) : null;
        const active = hovered === state.code;

        return (
          <g
            key={state.code}
            onPointerEnter={() => on && onHover?.(state.code)}
            onPointerLeave={() => on && onHover?.(null)}
            onClick={() => onOpen?.(state.code)}
          >
            <path
              d={state.d}
              fill={band ? STRENGTH_OF[band].fill : "var(--color-silent)"}
              stroke={active ? "#ffffff" : "var(--color-board)"}
              strokeWidth={active ? 2.6 : 1.2}
              strokeLinejoin="round"
              style={{ opacity: hovered && !active ? 0.55 : 1 }}
              className={cn("transition-opacity duration-150", on && "cursor-pointer")}
            >
              <title>
                {`${state.name}${row ? `, ${row.members.toLocaleString("en-NG")} members` : ", no register"}`}
              </title>
            </path>
            {on && state.at && (
              <text
                x={state.at[0]}
                y={state.at[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fill: "#ffffff",
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.5)",
                  strokeWidth: 3,
                  strokeLinejoin: "round",
                }}
              >
                {state.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One state's local governments, in their real shapes, on a member ramp.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FRAME IS CROPPED TO WHAT IS DRAWN, AND THIS IS NOT A DETAIL
 *
 *  The boundary files carry the NATIONAL projection: every local government in
 *  the country is positioned on one 1000x812 canvas so that a state drawn from
 *  its own file lands in the same place it occupies on a map of Nigeria.
 *
 *  Rendered with that canvas as the viewBox, Sokoto is 5.5% of the frame — a
 *  smudge in the top-left corner with 94% empty board around it. That is
 *  exactly what it looked like, and it is the same trap ScopeMap documents:
 *  an uncropped Lagos is 1/178th of the picture.
 *
 *  So the window is the bounding box of the paths actually being drawn, which
 *  makes the state as large as the panel can hold it without distorting it.
 *  Everything sized in user units — the type, the strokes — is scaled to that
 *  cropped width rather than to a constant, because a 13px label is right on a
 *  1000-unit canvas and enormous on a 223-unit one.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The ramp is the party's own colour at varying opacity rather than a second
 * hue, so a reader who has learnt this screen is about the ADC does not have
 * to learn a separate colour language to read its strength.
 */
function Choropleth({ shapes, byName, siblings, hovered, onHover, onOpen }) {
  const frame = useMemo(
    () => (shapes?.lgas?.length ? boundsOf(shapes.lgas.map((row) => row.d)) : null),
    [shapes]
  );

  if (!shapes?.lgas?.length || !frame) {
    return (
      <p className="flex h-full items-center justify-center px-6 text-center text-[0.875rem] text-white/50">
        No local government boundaries are published for this state.
      </p>
    );
  }

  /* One user unit at this crop. Strokes and type are multiples of it, so they
     look identical whether the frame holds Kano or Bayelsa. */
  const unit = frame.width / 1000;

  return (
    <svg
      viewBox={frame.viewBox}
      className="h-full w-full"
      role="img"
      aria-label="Local governments, shaded by how many party members are in each. The same figures are listed beside the map."
    >
      {shapes.lgas.map((shape) => {
        const row = byName.get(shape.name);
        const band = row ? strengthBand(row.members, row.share, siblings) : null;
        const active = hovered === shape.name;

        return (
          <g
            key={shape.name}
            onPointerEnter={() => onHover?.(shape.name)}
            onPointerLeave={() => onHover?.(null)}
            onClick={() => onOpen?.(shape.name)}
            className="cursor-pointer"
          >
            <path
              d={shape.d}
              /* ── BANDED, NOT A SMOOTH RAMP ────────────────────────────
                 One hue at varying opacity draws a smooth gradient, and a
                 gradient answers "which is bigger" while hiding the question
                 a campaign actually asks: which of these places has an
                 organisation in it and which has nine people. Five named
                 bands, each its own step, and the one below ten members
                 wears the warning colour so it is findable at a glance
                 rather than by reading twenty-three numbers. */
              fill={band ? STRENGTH_OF[band].fill : "var(--color-silent)"}
              stroke={active ? "#ffffff" : "var(--color-board)"}
              strokeWidth={(active ? 2.6 : 1.1) * unit}
              strokeLinejoin="round"
              style={{ opacity: hovered && !active ? 0.55 : 1 }}
              className="transition-opacity duration-150"
            >
              <title>
                {`${shape.name}${row ? `, ${row.members.toLocaleString("en-NG")} members` : ", none recorded"}`}
              </title>
            </path>

            {shape.at && (
              <text
                x={shape.at[0]}
                y={shape.at[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none select-none"
                style={{
                  /* ── SMALL, BECAUSE THE FRAME IS SMALL ──────────────
                     3.2% of the frame was chosen against a 1000-unit national
                     canvas. Cropped to one state the frame is 240 units wide
                     and the same fraction is a name three times the size of
                     the place it names. */
                  fontSize: frame.width * 0.019,
                  fontWeight: 600,
                  fill: "#ffffff",
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.55)",
                  strokeWidth: frame.width * 0.005,
                  strokeLinejoin: "round",
                }}
              >
                {shape.name}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * One figure, with the single line that qualifies it.
 *
 * `muted` is for a figure that is absent rather than small — a dash where no
 * data exists. It is drawn quieter than a real number so a reader scanning the
 * strip does not stop on it as though it were a measurement.
 */
function Figure({ icon: Icon, label, value, says, muted = false }) {
  return (
    <div className="flex gap-3">
      <Icon
        size={16}
        strokeWidth={2.25}
        className={cn("mt-1 shrink-0", muted ? "text-dash-muted" : "text-dash-ink")}
      />
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
        <p
          className={cn(
            "figure mt-0.5 text-[1.75rem] leading-none font-bold tracking-[-0.03em] tabular-nums",
            muted ? "text-dash-muted" : "text-dash-ink"
          )}
        >
          {value}
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-dash-muted">{says}</p>
      </div>
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════ the hover card */

/**
 * Who the members in one place are, beside the pointer.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A CARD AND NOT A COLUMN OF FIGURES BESIDE THE MAP
 *
 *  The question this answers is asked *of a particular place*, while the
 *  pointer is on it. A panel beside the map showing the same breakdown for
 *  whatever is selected makes a reader move their eyes off the shape they are
 *  interrogating, find the panel, and come back — for every one of twenty-three
 *  local governments in turn. The card is the answer where the question was
 *  asked, and it is the same arrangement the deployment map uses.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── UNDER 18 IS DRAWN APART FROM THE OTHER BANDS ───────────────────────────
 * It is not another slice of the electorate. It is the count of people on this
 * register who cannot lawfully vote, and putting it in a row with "26 to 35"
 * invites exactly the reading that makes a campaign plan votes it does not
 * have. So it sits under the bands, in its own line, named for what it means.
 */
function MemberCard({ name, kind, parent, members, share, demographics, pointer, fill }) {
  const WIDTH = 248;
  const GAP = 18;

  /* Measured rather than written down: the card is shorter where a register
     holds no breakdown, and a constant would go on flipping it as though it
     were the full height. Same reason the deployment card measures itself. */
  const card = useRef(null);
  const [height, setHeight] = useState(300);

  useLayoutEffect(() => {
    const box = card.current?.getBoundingClientRect();
    if (box && Math.abs(box.height - height) > 1) setHeight(box.height);
  }, [height, name, demographics]);

  const flipX = pointer.x + GAP + WIDTH > pointer.width;
  const flipY = pointer.y + GAP + height > pointer.height;

  return (
    <div
      ref={card}
      aria-hidden="true"
      className="pointer-events-none absolute z-20 w-62 overflow-hidden rounded-dash border border-white/15 bg-board/95 shadow-e3 backdrop-blur-sm"
      style={{
        left: flipX ? pointer.x - GAP - WIDTH : pointer.x + GAP,
        top: flipY ? Math.max(0, pointer.y - GAP - height) : pointer.y + GAP,
      }}
    >
      <header className="border-b border-white/10 px-3 py-2">
        <p className="truncate font-display text-[0.875rem] font-extrabold text-white">{name}</p>
        <p className="mt-0.5 truncate text-[0.6875rem] text-white/45">
          {kind}
          {parent ? ` · ${parent}` : ""}
        </p>
      </header>

      <div className="px-3 py-2.5">
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-[0.6875rem] text-white/55">Members</span>
          <span className="figure text-[1.25rem] leading-none font-bold text-white tabular-nums">
            {members === null ? "—" : formatNumber(members)}
          </span>
        </p>
        {share !== null && share !== undefined && (
          <p className="mt-1 text-right text-[0.6875rem] text-white/40">
            {formatShare(share)} of {parent ?? "the state"}
          </p>
        )}
      </div>

      {demographics ? (
        <>
          {/* ── MEN AND WOMEN, AS ONE BAR ────────────────────────────────
              Two counts that must reach the whole, so they are two ends of
              one bar rather than two numbers a reader adds up themselves. */}
          <div className="border-t border-white/10 px-3 py-2.5">
            <p className="flex items-baseline justify-between gap-2 text-[0.6875rem]">
              <span className="text-white/55">
                Men <span className="figure font-bold text-white">{formatNumber(demographics.men)}</span>
              </span>
              <span className="text-white/55">
                <span className="figure font-bold text-white">{formatNumber(demographics.women)}</span> Women
              </span>
            </p>
            <span aria-hidden="true" className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-white/10">
              <span className="h-full" style={{ width: `${demographics.menShare}%`, background: fill }} />
              <span
                className="h-full"
                style={{ width: `${demographics.womenShare}%`, background: "rgba(255,255,255,0.45)" }}
              />
            </span>
            <p className="mt-1 flex justify-between text-[0.625rem] text-white/40">
              <span>{formatShare(demographics.menShare)}</span>
              <span>{formatShare(demographics.womenShare)}</span>
            </p>
          </div>

          {/* ── THE AGE BANDS ────────────────────────────────────────────
              Only the four that can vote. Bars scaled to the biggest of the
              four so the shape of the age profile is readable, with the
              figure printed beside each — nobody should have to measure a bar
              against an axis that is not there. */}
          <div className="border-t border-white/10 px-3 py-2.5">
            <p className="text-[0.625rem] font-semibold tracking-[0.08em] text-white/40 uppercase">
              Age
            </p>
            <ul className="mt-1.5 space-y-1">
              {demographics.bands
                .filter((band) => band.canVote)
                .map((band) => {
                  const ceiling = Math.max(
                    ...demographics.bands.filter((row) => row.canVote).map((row) => row.count),
                    1
                  );
                  return (
                    <li key={band.id} className="flex items-center gap-2">
                      <span className="figure w-11 shrink-0 text-[0.6875rem] text-white/55 tabular-nums">
                        {band.short}
                      </span>
                      <span aria-hidden="true" className="h-1.5 flex-1 rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${(band.count / ceiling) * 100}%`, background: fill }}
                        />
                      </span>
                      <span className="figure w-10 shrink-0 text-right text-[0.6875rem] font-bold text-white tabular-nums">
                        {formatNumber(band.count)}
                      </span>
                    </li>
                  );
                })}
            </ul>

            <p className="mt-2 flex items-baseline justify-between gap-2 border-t border-white/10 pt-2 text-[0.6875rem]">
              <span className="text-white/55">Over 50</span>
              <span className="figure font-bold text-white tabular-nums">
                {formatNumber(demographics.over50)} · {formatShare(demographics.over50Share)}
              </span>
            </p>

            {/* Apart from the bands, because it is not one. */}
            {demographics.cannotVote > 0 && (
              <p className="mt-1.5 flex items-baseline justify-between gap-2 text-[0.6875rem]">
                <span className="text-amber-300/80">Under 18, cannot vote</span>
                <span className="figure font-bold text-amber-300 tabular-nums">
                  {formatNumber(demographics.cannotVote)}
                </span>
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="border-t border-white/10 px-3 py-2.5 text-[0.6875rem] leading-relaxed text-white/45">
          The register holds a count for this booth and no breakdown of it. Gender and age are
          counted per ward and per local government.
        </p>
      )}
    </div>
  );
}


/**
 * The register measured against a candidate's vote.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A RATIO OF ORGANISATION TO SUPPORT, AND NOT A FORECAST
 *
 *  66,474 ADC members in a state where Atiku Abubakar took 288,679 votes is a
 *  register 23% the size of that vote. That is a useful thing to know and it
 *  is not a prediction of anything: a register does not become votes, 1,900 of
 *  those people cannot lawfully cast one, and the rest may not turn out or may
 *  vote for somebody else.
 *
 *  So the panel prints both numerators — the whole register and the part of it
 *  old enough to vote — because a reader using this to reason about votes
 *  needs to see which figure a percentage came from. And it says in words what
 *  the ratio is, so nobody reads it as a share of the vote the party won.
 * ══════════════════════════════════════════════════════════════════════════
 */
function RatioPanel({ ratio, party, state, path }) {
  const here = path.length ? path[path.length - 1] : state;

  if (!ratio.known) {
    /* ── AN ABSENCE IN A SENTENCE, NOT A PARAGRAPH ────────────────────────
       Three of these ran to four sentences apiece. A reader who has hit a
       wall wants to know which wall and what they still have, and the long
       version of that is a wall of its own. */
    const why =
      ratio.why === "below-lga"
        ? "Wards in this register do not match INEC's, so no vote can be apportioned to them."
        : ratio.why === "below-state"
          ? "No vote is published below a state."
          : ratio.why === "no-register"
            ? `No ${party} register imported.`
            : "That candidate's vote is not broken out here.";

    return (
      <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
        <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
          <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
            Register vs vote
          </h3>
          <span className="rounded-full bg-dash-bg px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] text-dash-muted uppercase">
            Not held
          </span>
        </header>
        <div className="px-4 py-3.5">
          <p className="text-[0.8125rem] leading-snug text-dash-muted">{why}</p>
          {ratio.members !== null && ratio.members !== undefined && (
            <dl className="mt-3 border-t border-dash-line pt-3">
              <Row label={`${party} members here`} value={formatNumber(ratio.members)} />
            </dl>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
            Register vs vote
          </h3>
          <p className="mt-0.5 truncate text-[0.75rem] text-dash-muted">
            {party} per 100 {ratio.candidate.name.split(" ").pop()} votes · {here}
          </p>
        </div>
        {/* ── COUNTED OR MODELLED, ON THE PANEL ───────────────────────────
            A reader who takes an apportioned vote for a counted one will
            quote it as a fact. It is a badge rather than a sentence because
            a sentence at the foot is a sentence nobody reads. */}
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-bold tracking-[0.08em] uppercase",
            ratio.estimated ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900"
          )}
        >
          {ratio.estimated ? "Estimated" : "Counted"}
        </span>
      </header>

      <div className="px-4 py-3.5">
        {/* The figure, and the bar that puts it on a scale. Nothing restates
            it in words: the header already says what it is a ratio of. */}
        <p className="figure text-[2.5rem] leading-none font-bold tracking-[-0.04em] text-dash-ink tabular-nums">
          {formatShare(ratio.ratio)}
        </p>
        <Meter share={Math.min(100, ratio.ratio)} className="mt-2.5" height={6} />

        <dl className="mt-3.5 space-y-1.5 border-t border-dash-line pt-3">
          <Row label={`${party} members`} value={formatNumber(ratio.members)} />
          {ratio.votingAge !== null && (
            <Row label="Voting age" value={formatNumber(ratio.votingAge)} />
          )}
          <Row
            label={`${ratio.candidate.name.split(" ").pop()}, ${here}`}
            value={`${ratio.estimated ? "~" : ""}${formatNumber(ratio.votes)}`}
          />
        </dl>

        <p className="mt-3 border-t border-dash-line pt-2.5 text-[0.75rem] leading-snug text-dash-muted">
          Organisation against support. <strong className="text-dash-ink">Not a forecast.</strong>
        </p>
      </div>
    </section>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="truncate text-[0.8125rem] text-dash-muted">{label}</dt>
      <dd className="figure shrink-0 text-[0.9375rem] font-bold text-dash-ink tabular-nums">
        {value}
      </dd>
    </div>
  );
}


/**
 * What is wrong with the register.
 *
 * ── THE CLAIM IS ALWAYS VISIBLE; THE REASONING IS ONE PRESS AWAY ───────────
 * Five findings each carrying an explanation is ten lines of prose in a column
 * four hundred pixels wide, and a reader skims all of it. The count and the
 * claim are what somebody needs at a glance — "1,900 members are under
 * eighteen" is the whole finding — and why that matters is what they want the
 * moment they stop and take one seriously.
 */
function QualityPanel({ quality }) {
  const [open, setOpen] = useState(null);

  return (
    <section className="overflow-hidden rounded-dash border border-amber-200 bg-amber-50">
      <header className="flex items-baseline justify-between gap-3 border-b border-amber-200 px-4 py-3">
        {/* Named, because there are 37 of these now and the findings below
            belong to one of them. "About this register" was unambiguous when
            there was only one register to be about. */}
        {/* Named, because there are many of these now and the findings below
            belong to one of them — or, at the country, to all of them. */}
        <h3 className="font-display text-[0.875rem] font-extrabold text-amber-900">
          {quality.state === "national"
            ? `About the ${quality.party} register`
            : `About the ${quality.state} register`}
        </h3>
        <span className="figure text-[0.75rem] font-bold text-amber-900 tabular-nums">
          {formatNumber(quality.votingAge)} of voting age
        </span>
      </header>

      <ul className="divide-y divide-amber-200/70">
        {quality.notes.map((note) => (
          <li key={note.id}>
            <button
              type="button"
              onClick={() => setOpen(open === note.id ? null : note.id)}
              aria-expanded={open === note.id}
              className="w-full px-4 py-2 text-left transition-colors hover:bg-amber-100/60"
            >
              <span className="flex items-baseline gap-2">
                <span className="flex-1 text-[0.8125rem] leading-snug text-amber-900">
                  {note.says}
                </span>
                <ChevronRight
                  size={13}
                  className={cn(
                    "mt-0.5 shrink-0 text-amber-700 transition-transform",
                    open === note.id && "rotate-90"
                  )}
                />
              </span>
              {open === note.id && (
                <span className="mt-1.5 block text-[0.75rem] leading-relaxed text-amber-800">
                  {note.why}
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A party with no register: an absence drawn as an absence. */
function NoRegister({ party, votes, state }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card px-6 py-12 text-center">
      <Users size={24} strokeWidth={2} className="mx-auto text-dash-muted" />
      <p className="mt-3 text-[1rem] font-bold text-dash-ink">No {party} register imported</p>
      {/* One sentence, and it is the one that matters: this is an absence of
          counting, not an absence of members. A blank here read as "they have
          nobody" is a rival a campaign stops watching. */}
      <p className="mx-auto mt-2 max-w-sm text-[0.875rem] leading-relaxed text-dash-muted">
        Nobody has counted them into this product. That is not the same as the {party} having no
        members here, so the figure is blank rather than nought.
      </p>

      {votes.known && (
        <p className="mt-5 border-t border-dash-line pt-4 text-[0.875rem] text-dash-ink">
          <strong className="figure font-bold">{formatNumber(votes.votes)}</strong> votes in {state},
          2023 — {formatShare(votes.share)} of those cast.
        </p>
      )}
    </section>
  );
}
