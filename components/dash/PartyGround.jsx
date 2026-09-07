"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronRight, Loader2, Users, Vote } from "lucide-react";

import UnitMap from "./UnitMap";
import { Panel } from "./Figures";
import { PARTY_FILL } from "./Charts";
import {
  TIER_LABEL,
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

export default function PartyGround({ shapes = null }) {
  const [party, setParty] = useState("ADC");
  const [stateCode, setStateCode] = useState("SOK");
  const [path, setPath] = useState([]);
  const [hovered, setHovered] = useState(null);

  /* The local government outlines for whichever state is open. Fetched the
     same way and from the same files the room's own map uses, and stamped with
     the state it was fetched for so a late reply for a state we have left
     cannot draw over the one we are on. */
  const [boundaries, setBoundaries] = useState(null);

  const held = useMemo(() => coverage(), []);
  const register = registerFor(party, stateCode);
  const quality = useMemo(() => qualityOf(party, stateCode), [party, stateCode]);

  const rows = useMemo(() => childrenOf(party, stateCode, path), [party, stateCode, path]);
  const members = membersAt(party, stateCode, path);
  const votes = votesAt(party, stateCode, path);
  const covered = coveredStates(party);

  /* Which tier the map is drawing. `path` is [] at the country, [lga] inside a
     state, [lga, ward] inside a local government. The state itself is fixed by
     the picker, so the country tier is only reachable as a way back out. */
  const [atNation, setAtNation] = useState(false);

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

  const byName = useMemo(() => new Map(rows.map((row) => [row.name, row])), [rows]);
  const biggest = rows[0]?.members ?? 1;
  const fill = PARTY_FILL[party] ?? "var(--color-dash-ink)";

  const crumbs = [
    { label: "Nigeria", go: () => setAtNation(true) },
    { label: register?.state ?? stateCode, go: () => { setAtNation(false); setPath([]); } },
    ...path.map((name, index) => ({
      label: name,
      go: () => { setAtNation(false); setPath(path.slice(0, index + 1)); },
    })),
  ];

  /* The outline the lattice tiers are drawn inside: the local government when
     showing its wards, and the same one when showing a ward's booths, because
     nothing smaller has a published boundary. */
  const outline = useMemo(() => {
    if (!lgaShapes?.lgas || path.length === 0) return [];
    const shape = lgaShapes.lgas.find((row) => row.name === path[0]);
    return shape ? [shape.d] : [];
  }, [lgaShapes, path]);

  return (
    <div className="flex flex-col gap-3">
      {/* ══════════════════════════════════════════════ what this screen is for */}
      <section className="rounded-dash border-l-4 border-l-dash-ink bg-dash-card px-5 py-4">
        <h1 className="font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
          Where a party actually is
        </h1>
        <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-dash-muted">
          Members from the party&rsquo;s own register, and votes from the published result, from the
          whole country down to a single polling unit.{" "}
          <strong className="font-semibold text-dash-ink">They are never added together</strong> — a
          member filled in a form, a vote was counted, and one is not a forecast of the other.
        </p>
      </section>

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
                    setAtNation(false);
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

        <p className="ml-auto text-[0.75rem] text-dash-muted">
          {held.length === 1
            ? `${held[0].party} in ${held[0].state}: ${formatNumber(held[0].members)} members across ${formatNumber(held[0].units)} polling units.`
            : `${held.length} registers loaded.`}
        </p>
      </div>

      {!register ? (
        <NoRegister party={party} votes={votes} state={held[0]?.state ?? stateCode} />
      ) : (
        <>
          {/* ══════════════════════════════════════════════════════ where you are */}
          <nav
            aria-label="Where you are"
            className="flex flex-wrap items-center gap-1 rounded-dash border border-dash-line bg-dash-card px-4 py-2.5"
          >
            {crumbs.map((crumb, index) => (
              <span key={`${index}-${crumb.label}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight size={13} className="shrink-0 text-dash-muted" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    (atNation && index === 0) || (!atNation && index === crumbs.length - 1)
                      ? "text-dash-ink"
                      : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
            <span className="ml-auto text-[0.75rem] text-dash-muted">
              {atNation ? "The country" : `${formatNumber(rows.length)} ${TIER_LABEL[childTier(path)].toLowerCase()}s below`}
            </span>
          </nav>

          {/* ═══════════════════════════════════════════════════════ the two figures */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Panel
              title={`${party} members here`}
              figure={members === null ? "—" : formatNumber(members)}
              foot={path.length === 0 ? `The whole ${register.state} register.` : `In ${path[path.length - 1]}.`}
            >
              <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
                <Users size={14} strokeWidth={2.5} className="shrink-0" />
                People who filled in a membership form. Not a vote, and not a promise of one.
              </p>
            </Panel>

            <Panel
              title={`${party} votes here`}
              figure={votes.known ? formatNumber(votes.votes) : "—"}
              foot={
                votes.known
                  ? `${formatShare(votes.share)} of the ${formatNumber(votes.of)} cast, 2023 presidential.`
                  : votes.why === "below-state"
                    ? "No published vote exists below a state."
                    : votes.why === "in-other"
                      ? `${party} is inside the "other" column of the 2023 state table.`
                      : "Not held."
              }
            >
              {votes.known ? (
                <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
                  <Vote size={14} strokeWidth={2.5} className="shrink-0" />
                  Marks on ballots, counted and declared.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-dash-muted">
                  <AlertTriangle size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
                  {votes.why === "below-state" ? (
                    <>
                      No Nigerian election publishes a vote table below the state, so this is not a
                      figure that exists to be looked up. Dividing {register.state}&rsquo;s total
                      among its wards would look precise and be invented.
                    </>
                  ) : votes.why === "in-other" ? (
                    <>
                      The 2023 state table has four parties and one bucket. {party} contested and its
                      vote is inside that bucket — {formatNumber(votes.bucket)} votes shared with
                      every other minor party.
                    </>
                  ) : (
                    <>Not held for this place.</>
                  )}
                </p>
              )}
            </Panel>
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
              <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-board-line px-5 py-3">
                <h2 className="font-display text-[1rem] font-extrabold tracking-[-0.01em] text-white">
                  {atNation
                    ? "Nigeria"
                    : path.length === 0
                      ? `${register.state}, by local government`
                      : `${path[path.length - 1]}, by ${TIER_LABEL[childTier(path)].toLowerCase()}`}
                </h2>
                <p className="text-[0.8125rem] text-white/55">
                  {atNation
                    ? `${covered.length} state${covered.length === 1 ? "" : "s"} covered by a register`
                    : `Darker is more ${party} members · press a place to go in`}
                </p>
              </header>

              <div className="relative min-h-0 flex-1 p-2">
                {loading && !atNation && path.length === 0 && (
                  <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                    <Loader2 size={16} className="animate-spin" />
                    Loading boundaries
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
                    fill={fill}
                    held={held}
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
                    biggest={biggest}
                    fill={fill}
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
                      paint: {
                        fill,
                        /* Opacity carries the magnitude, so one party colour
                           reads as a ramp without inventing a second hue for a
                           party that already has one. */
                        opacity: 0.25 + 0.75 * (row.members / (biggest || 1)),
                      },
                    }))}
                  />
                )}
              </div>

              {/* The one figure the map is about, on the map, so a reader
                  looking at the shape never has to look away to read it. */}
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
                                style={{ width: `${(row.members / biggest) * 100}%`, background: fill }}
                              />
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="figure block text-[0.9375rem] font-bold text-dash-ink tabular-nums">
                              {formatNumber(row.members)}
                            </span>
                            <span className="figure block text-[0.6875rem] text-dash-muted tabular-nums">
                              {formatShare(row.share)}
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
              <section className="overflow-hidden rounded-dash border border-amber-200 bg-amber-50">
                <header className="flex items-baseline justify-between gap-3 border-b border-amber-200 px-4 py-3">
                  <h3 className="font-display text-[0.875rem] font-extrabold text-amber-900">
                    About this register
                  </h3>
                  <span className="figure text-[0.75rem] font-bold text-amber-900 tabular-nums">
                    {formatNumber(quality.votingAge)} of voting age
                  </span>
                </header>
                <ul className="divide-y divide-amber-200/70">
                  {quality.notes.map((note) => (
                    <li key={note.id} className="px-4 py-2.5">
                      <p className="text-[0.8125rem] leading-snug font-semibold text-amber-900">{note.says}</p>
                      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-amber-800">{note.why}</p>
                    </li>
                  ))}
                </ul>
                <footer className="border-t border-amber-200 px-4 py-2.5 text-[0.75rem] leading-relaxed text-amber-800">
                  None of these is an accusation. A repeated identification number is far more often
                  a typing error at registration than anything else.
                </footer>
              </section>
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
function Nation({ shapes, covered, fill, held, onOpen }) {
  if (!shapes?.states?.length) {
    return <p className="py-16 text-center text-[0.875rem] text-white/50">No national outline loaded.</p>;
  }

  const byCode = new Map(held.map((row) => [row.stateCode, row]));

  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="h-[26rem] w-full"
      role="img"
      aria-label="Nigeria. States covered by a membership register are coloured; press one to open it."
    >
      {shapes.states.map((state) => {
        const on = covered.includes(state.code);
        const row = byCode.get(state.code);
        return (
          <g key={state.code} onClick={() => onOpen?.(state.code)}>
            <path
              d={state.d}
              fill={on ? fill : "var(--color-silent)"}
              stroke="var(--color-board)"
              strokeWidth={1.2}
              strokeLinejoin="round"
              className={cn("transition-opacity", on ? "cursor-pointer hover:opacity-85" : "opacity-60")}
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
                className="pointer-events-none font-mono select-none"
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  fill: "#ffffff",
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.4)",
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
 * The ramp is the party's own colour at varying opacity rather than a second
 * hue, so a reader who has learnt that this screen is about the ADC does not
 * have to learn a separate colour language to read its strength.
 */
function Choropleth({ shapes, byName, biggest, fill, hovered, onHover, onOpen }) {
  if (!shapes?.lgas?.length) {
    return (
      <p className="py-16 text-center text-[0.875rem] text-white/50">
        No local government boundaries are published for this state.
      </p>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="h-[26rem] w-full"
      role="img"
      aria-label="Local governments, shaded by how many party members are in each. The same figures are listed below."
    >
      {shapes.lgas.map((shape) => {
        const row = byName.get(shape.name);
        const strength = row ? row.members / (biggest || 1) : 0;
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
              fill={row ? fill : "var(--color-silent)"}
              fillOpacity={row ? 0.25 + 0.75 * strength : 1}
              stroke={active ? "#ffffff" : "var(--color-board)"}
              strokeWidth={active ? 2.4 : 1}
              strokeLinejoin="round"
              className="transition-[stroke-width]"
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
                  fontSize: 13,
                  fontWeight: 700,
                  fill: "#ffffff",
                  paintOrder: "stroke",
                  stroke: "rgba(0,0,0,0.45)",
                  strokeWidth: 3,
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

/** A party with no register: an absence drawn as an absence. */
function NoRegister({ party, votes, state }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card px-6 py-12 text-center">
      <Users size={24} strokeWidth={2} className="mx-auto text-dash-muted" />
      <p className="mt-3 text-[1rem] font-bold text-dash-ink">
        No {party} membership register has been imported
      </p>
      <p className="mx-auto mt-2 max-w-prose text-[0.875rem] leading-relaxed text-dash-muted">
        That is not the same as the {party} having no members here — it means nobody has counted them
        into this product. The figure is left blank rather than drawn at nought, because a zero on
        this screen would be read as a rival who is not there.
      </p>
      <p className="mx-auto mt-3 max-w-prose text-[0.8125rem] leading-relaxed text-dash-muted">
        A register arrives as a PDF and is imported by{" "}
        <span className="figure">scripts/import-register.py</span>, which keeps the counts and
        discards every name, telephone number and identification number in it.
      </p>

      {votes.known && (
        <p className="mt-5 border-t border-dash-line pt-4 text-[0.875rem] text-dash-ink">
          What is known: {party} took{" "}
          <strong className="figure font-bold">{formatNumber(votes.votes)}</strong> votes in {state} at
          the 2023 presidential election — {formatShare(votes.share)} of the{" "}
          {formatNumber(votes.of)} cast.
        </p>
      )}
    </section>
  );
}
