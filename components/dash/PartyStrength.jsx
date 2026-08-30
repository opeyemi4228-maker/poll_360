"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, MapPin, Target, TrendingDown, TrendingUp } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import PartyBreakdown from "./PartyBreakdown";
import { boundsOf } from "@/lib/bbox";
import { apportion, unitCount, wardCount } from "@/lib/drill";
import { allParties, states2023 } from "@/lib/election2023";
import { ZONES } from "@/lib/zones";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * How strong a party is, everywhere, at every level.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT THE RESULTS MAP WITH A FILTER ON IT
 *
 *  The results map answers "who won here", and it answers it by colouring
 *  each place with its leader. That is the right question on election night
 *  and the wrong one for a party planning a campaign, because it renders
 *  every place a party did not win in exactly the same colour — the colour of
 *  somebody else. A state lost by four points and a state lost by sixty look
 *  identical, and those are the two most different states on the map to
 *  anybody deciding where to spend a week.
 *
 *  So this map has one party on it at a time, and colours by how much of the
 *  vote that party actually took. Losing well and losing badly stop looking
 *  the same, which is the entire point.
 *
 * ── AND WHY IT DRILLS ─────────────────────────────────────────────────────
 *  "Where is the party strong" has a different answer at every level. A state
 *  that looks uniformly hostile is usually two or three local governments
 *  that are not, and a ward inside those is usually where the vote actually
 *  is. Strength that cannot be drilled is a headline, not a plan.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* A single hue, stepped, so more is unmistakably more. The party's own colour
   supplies the hue; only the lightness moves. */
const RAMP = [0.14, 0.3, 0.5, 0.72, 1];

/* The same parties in their board hues rather than their white-sheet ones.
   PARTY_FILL is stepped for a white panel and goes muddy on near-black; these
   are the tokens the dark board already uses everywhere else. */
const PARTY_TOKEN = Object.fromEntries(allParties.map((item) => [item.id, item.token]));

export default function PartyStrength({ shapes, territory = null, ground = null }) {
  const [party, setParty] = useState("APC");
  /* A room that holds a ground opens inside it. There is no country above a
     senatorial district that this account may read, so there is nowhere to
     zoom out to and the trail starts at the state. */
  const [path, setPath] = useState(() =>
    territory?.stateCode
      ? [{ code: territory.stateCode, name: territory.stateName ?? territory.name }]
      : []
  );
  const [boundaries, setBoundaries] = useState(null);

  /* The one place inside the current level the reader has asked about. It
     carries every party's figure, not just the chosen one: "how strong are we
     in this polling unit" is nearly always followed by "and who took it", and
     a screen that can answer the first and not the second sends the reader to
     another tab and loses their place. */
  const [picked, setPicked] = useState(null);

  /**
   * ── ALWAYS THE WHOLE FEDERATION, WHATEVER PROJECT IS OPEN ────────────────
   * This screen was built taking the project's scope, the way every other
   * screen in the room does, and that was wrong on the one screen where it
   * matters. Every other surface answers a question about the contest being
   * run: an Ekiti governorship draws Ekiti, correctly.
   *
   * "Where is this party strong" is not a question about the contest. It is
   * a question about the party, and a party's spread is the whole point of
   * the word — the reason the constitution has a spread test at all. Cropping
   * it to the states of whatever project happens to be open answers a
   * different and far less useful question, and it does it silently: the
   * screen would look complete while showing one state.
   *
   * So this one ignores the PROJECT's scope by design, and says so on the
   * trail.
   *
   * ── AND WHY AN ACCOUNT'S GROUND IS THE ONE EXCEPTION ─────────────────────
   * The reasoning above is about a project — a contest being run — and it does
   * not survive being applied to an account that may not read the rest of the
   * country. "Where is this party strong" is still the question, but for a
   * campaign holding seven local governments the useful answer is inside those
   * seven, and the federal map is a screen full of places they cannot file
   * from and will never be asked about. A ground is not a scope: it is the
   * limit of what this account is permitted to see, and no screen gets to
   * ignore it on the grounds of being more interesting.
   */
  const inScope = useMemo(
    () => (territory?.stateCode ? states2023.filter((row) => row.code === territory.stateCode) : states2023),
    [territory]
  );

  const [state, lga, ward] = path;
  const level = ["nation", "state", "lga", "ward"][path.length];
  const index = allParties.findIndex((item) => item.id === party);

  /* ------------------------------------------------------------ boundaries */
  const code = state?.code ?? null;
  useEffect(() => {
    if (!code) return undefined;
    let live = true;
    fetch(`/geo/lga/${code}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => live && setBoundaries({ code, data }))
      .catch(() => live && setBoundaries({ code, data: null }));
    return () => {
      live = false;
    };
  }, [code]);

  const lgaShapes = boundaries?.code === code ? boundaries.data : null;
  const loading = Boolean(code) && boundaries?.code !== code;

  /* ------------------------------------------------------------- the rows
     Each level is divided out of the one above it, so every share on screen
     is a share of a real declared total however far down it is read. */
  const stateRow = useMemo(
    () => (state ? states2023.find((row) => row.code === state.code) : null),
    [state]
  );

  const lgaRows = useMemo(() => {
    if (!stateRow || !lgaShapes?.lgas) return [];
    /* Narrowed with everything else: an account holding a district must not be
       shown its state's other sixteen local governments, here or on the map. */
    const held = territory?.lgaNames?.length
      ? lgaShapes.lgas.filter((row) => territory.lgaNames.includes(row.name))
      : lgaShapes.lgas;
    return apportion({
      names: held.map((row) => row.name),
      votes: stateRow.votes,
      booths: stateRow.booths,
      registered: stateRow.registered,
      parentKey: stateRow.code,
    });
  }, [stateRow, lgaShapes, territory]);

  const wardRows = useMemo(() => {
    if (!lga) return [];
    const parent = lgaRows.find((row) => row.name === lga.name);
    if (!parent) return [];
    return apportion({
      names: Array.from({ length: wardCount(lga.name) }, (_, i) => `Ward ${String(i + 1).padStart(2, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: `${state.code}:${lga.name}`,
    });
  }, [lga, lgaRows, state]);

  const unitRows = useMemo(() => {
    if (!ward) return [];
    const parent = wardRows.find((row) => row.name === ward.name);
    if (!parent) return [];
    const key = `${state.code}:${lga.name}:${ward.name}`;
    return apportion({
      names: Array.from({ length: unitCount(key) }, (_, i) => `PU ${String(i + 1).padStart(3, "0")}`),
      votes: parent.votes,
      booths: parent.booths,
      registered: parent.registered,
      parentKey: key,
    });
  }, [ward, wardRows, state, lga]);

  const children = useMemo(() => {
    const source =
      level === "nation"
        ? inScope.map((row) => ({ key: row.code, name: row.name, votes: row.votes, total: row.total, registered: row.registered, booths: row.booths }))
        : level === "state"
          ? lgaRows
          : level === "lga"
            ? wardRows
            : unitRows;

    return source
      .map((row) => {
        const mine = row.votes?.[index] ?? 0;
        const total = row.total || row.votes?.reduce((sum, value) => sum + value, 0) || 0;
        const ranked = [...(row.votes ?? [])]
          .map((votes, at) => ({ id: allParties[at].id, votes }))
          .sort((a, b) => b.votes - a.votes);
        const best = ranked[0];
        return {
          key: row.key ?? row.name,
          name: row.name,
          votes: mine,
          /* Every party's figure for this place, so the panel beside the map
             can open the whole contest without re-deriving it. */
          all: row.votes ?? [],
          turnout: row.turnout ?? 0,
          total,
          share: total ? (mine / total) * 100 : 0,
          registered: row.registered ?? 0,
          booths: row.booths ?? 0,
          won: best?.id === party && best.votes > 0,
          /* How far off winning it, in points. Negative means holding it. */
          behind: best?.id === party ? 0 : total ? ((best.votes - mine) / total) * 100 : 0,
        };
      })
      .sort((a, b) => b.share - a.share);
  }, [level, inScope, lgaRows, wardRows, unitRows, index, party]);

  /* ---------------------------------------------------------- the summary */
  const scope = useMemo(() => {
    const mine = children.reduce((sum, row) => sum + row.votes, 0);
    const total = children.reduce((sum, row) => sum + row.total, 0);
    return {
      votes: mine,
      total,
      /* Every party across this level, so the panel can open the whole
         contest for the place being looked at and not only for a child of
         it. Summed from the children rather than read off the parent so it
         is the same arithmetic at every level, including the country. */
      all: children.reduce(
        (sum, row) => sum.map((value, at) => value + (row.all?.[at] ?? 0)),
        allParties.map(() => 0)
      ),
      registered: children.reduce((sum, row) => sum + (row.registered ?? 0), 0),
      booths: children.reduce((sum, row) => sum + (row.booths ?? 0), 0),
      turnout: (() => {
        const register = children.reduce((sum, row) => sum + (row.registered ?? 0), 0);
        return register ? (total / register) * 100 : 0;
      })(),
      share: total ? (mine / total) * 100 : 0,
      won: children.filter((row) => row.won).length,
      quarter: children.filter((row) => row.share >= 25).length,
      places: children.length,
    };
  }, [children]);

  const zones = useMemo(() => {
    if (level !== "nation") return [];
    const zoneOf = {};
    for (const [zone, codes] of Object.entries(ZONES)) for (const item of codes) zoneOf[item] = zone;

    return Object.keys(ZONES)
      .map((zone) => {
        const rows = inScope.filter((row) => zoneOf[row.code] === zone);
        if (!rows.length) return null;
        const mine = rows.reduce((sum, row) => sum + row.votes[index], 0);
        const total = rows.reduce((sum, row) => sum + row.total, 0);
        return { zone, share: total ? (mine / total) * 100 : 0, votes: mine, states: rows.length };
      })
      .filter(Boolean)
      .sort((a, b) => b.share - a.share);
  }, [level, inScope, index]);

  /* ------------------------------------------------------------- the trail
     A narrowed room's trail starts at its own ground, and its root goes back
     to the ground rather than to the country: "Nigeria" on a trail an account
     may not open is a control that looks like "start again" and lands on
     thirty-six states of nothing. */
  const home = territory?.stateCode
    ? { code: territory.stateCode, name: territory.stateName ?? territory.name }
    : null;

  const crumbs = [
    home
      ? { label: ground ?? territory.name, go: () => setPath([home]) }
      : { label: "Nigeria", go: () => setPath([]) },
    !home && state && { label: state.name, go: () => setPath([state]) },
    lga && { label: lga.name, go: () => setPath([state, lga]) },
    ward && { label: ward.name, go: () => setPath([state, lga, ward]) },
  ].filter(Boolean);

  const drill = useCallback(
    (row) => {
      /* A pick belongs to the level it was made in. Carrying it down would
         leave the panel describing a ward while the map draws its units. */
      setPicked(null);
      if (level === "nation") setPath([{ code: row.key, name: row.name }]);
      else if (level === "state") setPath([state, { name: row.name }]);
      else if (level === "lga") setPath([state, lga, { name: row.name }]);
    },
    [level, state, lga]
  );

  /* Tapping a place asks about it; tapping the same place again asks about the
     level as a whole, which is what the panel shows with nothing picked. */
  const pick = useCallback(
    (row) => setPicked((current) => (current?.key === row.key ? null : row)),
    []
  );

  const pickedRow = picked ? children.find((row) => row.key === picked.key) ?? null : null;

  /* The shapes follow the rows: a panel ranking three local governments beside
     a map drawing twenty-one is two answers to one question. */
  const mapShapes =
    level === "nation"
      ? shapes
      : level === "state" && lgaShapes
        ? {
            paths: territory?.lgaNames?.length
              ? lgaShapes.lgas.filter((row) => territory.lgaNames.includes(row.name))
              : lgaShapes.lgas,
          }
        : null;

  const strongest = children[0];
  const weakest = children[children.length - 1];

  /* What the darkest step on the ramp means here. The same figure the map
     divides by, so the legend cannot drift from the shapes it explains. */
  const topShare = Math.max(...children.map((row) => row.share), 1);
  const apportioned = level !== "nation";

  return (
    <div className="space-y-3">
      {/* ── THE MAP IS THE FIRST THING ON THE PAGE ────────────────────────
          It used to be the third: a party picker, then four figure cards, then
          the map — about eleven rem of chrome above the only object on the
          screen anybody came here to look at, which on a 1080p wall display
          left the country in the bottom half of its own dashboard.

          Both of those things belong to the map rather than above it. The
          picker is the map's control *and* its legend, so it now lives in the
          map's own header, where a reader looking at a colour is already
          looking. The figures describe whatever the map is showing, so they
          moved beside it and scroll with the rest of the reading. */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem] xl:items-start">
        {/* ───────────────────────────────────────────────────────── the map */}
        {/* Pinned under the bar, at the height of what is left of the screen,
            so the column beside it scrolls without ever taking the map with
            it. `--dash-top` is the bar's measured height. See TopShell. */}
        <div className="on-board flex min-h-[30rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:sticky xl:top-[calc(var(--dash-top,4.5rem)+0.75rem)] xl:h-[calc(100vh-var(--dash-top,4.5rem)-1.5rem)] xl:min-h-0">
          <nav
            aria-label="Where you are"
            className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5"
          >
            {crumbs.map((crumb, at) => (
              <span key={`${at}-${crumb.label}`} className="flex items-center gap-1">
                {at > 0 && <ChevronRight size={13} className="shrink-0 text-white/40" />}
                <button
                  type="button"
                  onClick={crumb.go}
                  className={cn(
                    "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
                    at === crumbs.length - 1 ? "text-white" : "text-white/55 hover:bg-white/10 hover:text-white"
                  )}
                >
                  {crumb.label}
                </button>
              </span>
            ))}

            {/* ── ONE PARTY AT A TIME, AND SAY WHICH ───────────────────────
                A picker that allowed several at once would put the screen
                straight back to colouring by whoever leads, which is the thing
                this screen exists not to do. Comparison is done by switching,
                which keeps the scale and the place fixed and moves only the
                party — the only way to see a difference honestly. */}
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {allParties.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setParty(item.id)}
                  aria-pressed={party === item.id}
                  title={item.name}
                  className={cn(
                    "figure flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.75rem] font-bold transition-colors",
                    party === item.id
                      ? "text-white"
                      : "text-white/50 hover:bg-white/10 hover:text-white"
                  )}
                  style={
                    party === item.id
                      ? { background: PARTY_TOKEN[item.id] ?? "var(--color-red-500)" }
                      : undefined
                  }
                >
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{
                      background:
                        party === item.id
                          ? "rgba(255,255,255,0.92)"
                          : PARTY_TOKEN[item.id] ?? "var(--color-silent)",
                    }}
                  />
                  {item.id}
                </button>
              ))}
            </div>
          </nav>

          <div className="relative min-h-0 flex-1 p-2">
            {loading && (
              <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
                <Loader2 size={16} className="animate-spin" />
                Loading boundaries…
              </p>
            )}

            {mapShapes ? (
              <ShareMap
                shapes={mapShapes}
                level={level}
                rows={children}
                party={party}
                onOpen={drill}
              />
            ) : (
              <div className="grid h-full grid-cols-2 content-start gap-2 overflow-y-auto sm:grid-cols-3 lg:grid-cols-4">
                {children.map((row) => (
                  <button
                    key={row.key}
                    type="button"
                    /* Above the floor a tap goes down a level; at the floor
                       there is nowhere further to go, so it opens the unit's
                       own ballot in the panel instead of doing nothing. */
                    onClick={() => (level === "lga" ? drill(row) : pick(row))}
                    className={cn(
                      "cursor-pointer rounded-dash-sm border p-3 text-left transition-colors",
                      pickedRow?.key === row.key
                        ? "border-white bg-white/10"
                        : "border-board-line hover:border-white/60"
                    )}
                  >
                    <p className="truncate text-[0.8125rem] font-bold text-white">{row.name}</p>
                    <p className="figure mt-1.5 text-[1.125rem] leading-none font-bold text-white">
                      {formatShare(row.share)}
                    </p>
                    <p className="mt-1 truncate text-[0.6875rem] text-white/45">
                      {formatNumber(row.votes)} votes
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── THE LEGEND, ON THE INSTRUMENT ──────────────────────────────
              The ramp is relative: the darkest step is whatever the strongest
              place in view holds, because a national ramp fixed at 0–100%
              renders every local government inside a state the same shade.
              That is the right choice and it is unreadable unpublished — a
              reader cannot tell 4% from 40% without the breaks printed. So
              they are printed, and they move when the scope does. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-board-line px-4 py-2.5">
            <span className="shrink-0 text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
              {party} share
            </span>
            <div className="flex items-center gap-2">
              {RAMP.map((step, at) => (
                <span key={step} className="flex items-center gap-1">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-[2px]"
                    style={{
                      background: PARTY_TOKEN[party] ?? "#ffffff",
                      opacity: Math.max(0.12, step),
                    }}
                  />
                  <span className="figure text-[0.625rem] text-white/45 tabular-nums">
                    {formatShare(step * topShare)}
                  </span>
                </span>
              ))}
            </div>
            <span className="figure ml-auto text-[0.625rem] text-white/35">
              {pickedRow
                ? `${pickedRow.name} · ${formatShare(pickedRow.share)}`
                : `Tap a ${childWord(level)}`}
            </span>
          </div>
        </div>

        {/* ────────────────────────────────────────────── the ranked column */}
        {/* Ordinary page flow: this is the column the scroll is for. */}
        <div className="flex flex-col gap-3">
          {/* ── THE FIGURES, BESIDE WHAT THEY DESCRIBE ────────────────────
              Two by two rather than a four-across band over the map. They
              answer "how is this party doing here", which is a question about
              the thing on the left, so they belong next to it. */}
          <div className="grid grid-cols-2 gap-2.5">
            <Metric
              icon={Target}
              label={`${party} share`}
              value={formatShare(scope.share)}
              foot={`${formatNumber(scope.votes)} of ${formatNumber(scope.total)}`}
              tint={PARTY_FILL[party]}
            />
            <Metric
              icon={TrendingUp}
              label={`${childWord(level)}s led`}
              value={`${scope.won}`}
              foot={`of ${scope.places}${scope.quarter ? ` · ${scope.quarter} above a quarter` : ""}`}
            />
            <Metric
              icon={MapPin}
              label="Strongest"
              value={strongest?.name ?? "n/a"}
              foot={strongest ? formatShare(strongest.share) : ""}
              small
            />
            <Metric
              icon={TrendingDown}
              label="Weakest"
              value={weakest?.name ?? "n/a"}
              foot={weakest ? formatShare(weakest.share) : ""}
              small
            />
          </div>

          {/* ── THE WHOLE CONTEST, WHEREVER YOU ARE STANDING ──────────────
              One party at a time is the right way to read strength and the
              wrong way to read a place: "we took 31% of this polling unit" is
              only half a fact until you know whether that was first or fourth.
              So the full ballot for the place in front of the reader sits
              here — the picked one if there is one, the level itself if not —
              and it goes all the way down to a single polling unit. */}
          <PartyBreakdown
            /* The 2023 declared record, whose vote arrays are positional over
               exactly these five slots. Nothing wider exists to pass. */
            slots={allParties}
            place={pickedRow?.name ?? crumbs.at(-1).label}
            level={pickedRow ? childWord(level) : levelWord(level)}
            row={{
              votes: pickedRow?.all ?? scope.all,
              registered: pickedRow?.registered ?? scope.registered,
              turnout: pickedRow?.turnout ?? scope.turnout,
              booths: pickedRow?.booths ?? scope.booths,
            }}
          />

          <Panel
            title={`${party} by ${childWord(level)}`}
            foot={`${children.length} ${childWord(level)}${children.length === 1 ? "" : "s"}`}
          >
            <ul className="space-y-2.5">
              {/* ── EVERY ROW, NOT THE FIRST FORTY ────────────────────────
                  This was capped at 40, which is invisible at national level,
                  where there are 37 states, and quietly wrong one level down:
                  Kano has 44 local governments and four of them were simply
                  not in the list. A ranking that silently ends early is worse
                  than a long list, because nothing on screen says it ended. */}
              {children.map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => (level === "ward" ? pick(row) : drill(row))}
                    className={cn(
                      "w-full cursor-pointer rounded-dash-sm text-left transition-opacity hover:opacity-80",
                      pickedRow?.key === row.key && "ring-2 ring-dash-ink ring-offset-2"
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                        {row.name}
                        {row.won && (
                          <span className="ml-1.5 text-[0.625rem] font-bold text-emerald-700 uppercase">
                            led
                          </span>
                        )}
                      </span>
                      <span className="figure shrink-0 text-[0.75rem] text-dash-muted tabular-nums">
                        {formatShare(row.share)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-dash-bg">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, row.share)}%`,
                          background: PARTY_FILL[party] ?? "var(--color-dash-ink)",
                        }}
                      />
                    </div>
                    {!row.won && row.behind > 0 && (
                      <p className="mt-0.5 text-[0.625rem] text-dash-muted">
                        {formatShare(row.behind)} behind the leader
                      </p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {zones.length > 0 && (
            <Panel title={`${party} by zone`} foot="Share of the vote cast">
              <ul className="space-y-2.5">
                {zones.map((zone) => (
                  <li key={zone.zone}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                        {zone.zone}
                      </span>
                      <span className="figure shrink-0 text-[0.75rem] text-dash-muted tabular-nums">
                        {formatShare(zone.share)}
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-dash-bg">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, zone.share)}%`,
                          background: PARTY_FILL[party] ?? "var(--color-dash-ink)",
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>

      {/* ── WHERE THE FIGURES BELOW A STATE COME FROM ──────────────────────
          Said on the screen, not only in a comment. A ward share that looks
          like a measurement and is not is the single most dangerous thing
          this product could draw. */}
      <p className="rounded-dash border border-dash-line bg-dash-card px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
        {apportioned ? (
          <>
            <span className="font-bold text-dash-ink">
              Below state level these shares are apportioned, not measured.
            </span>{" "}
            Nigeria publishes results as scanned polling-unit sheets, not as a machine-readable
            breakdown, so each state&rsquo;s real declared figures are divided across its local
            governments deterministically. Every level still sums back exactly to the declared
            state total, and the same place is the same size every time — but a ward figure here is
            a modelled division of a real number, not a count of one. Once your own returns are
            filed they replace this.
          </>
        ) : (
          <>Every figure here is the declared 2023 presidential result, as published by INEC.</>
        )}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const childWord = (level) =>
  level === "nation" ? "state" : level === "state" ? "local government" : level === "lga" ? "ward" : "polling unit";

/** What the reader is standing *in*, as opposed to what they can open. */
const levelWord = (level) =>
  level === "nation"
    ? "Federation"
    : level === "state"
      ? "State"
      : level === "lga"
        ? "Local government"
        : "Ward";

/**
 * One party's share, on a map.
 *
 * The ramp is built from the party's own colour with only the lightness
 * moving, so a strong place and a weak place are the same hue at different
 * strengths. Two hues would invite the reader to think they meant two things.
 */
function ShareMap({ shapes, level, rows, party, onOpen }) {
  const byName = useMemo(() => new Map(rows.map((row) => [row.key ?? row.name, row])), [rows]);
  /* Memoised because the frame below depends on it, and a fresh array identity
     every render would re-measure every path on every pointer move. */
  const list = useMemo(() => shapes.paths ?? shapes.states ?? [], [shapes]);

  const frame = useMemo(() => {
    if (level === "nation") return `0 0 ${shapes.width} ${shapes.height}`;
    return boundsOf(list.map((shape) => shape.d)).viewBox;
  }, [level, shapes, list]);

  const top = Math.max(...rows.map((row) => row.share), 1);

  return (
    <svg viewBox={frame} className="h-full w-full" role="img" aria-label={`${party} share by place`}>
      {list.map((shape) => {
        const row = byName.get(shape.code ?? shape.name);
        const strength = row ? row.share / top : 0;
        const step = RAMP.findIndex((edge) => strength <= edge);
        const opacity = row ? RAMP[step === -1 ? RAMP.length - 1 : step] : 0;

        return (
          <path
            key={shape.code ?? shape.name}
            d={shape.d}
            /* The board hue, not the white-sheet one: PARTY_FILL is stepped
               dark for a white panel, and dark-on-near-black at 14% opacity is
               indistinguishable from empty. */
            fill={row ? (PARTY_TOKEN[party] ?? "#ffffff") : "var(--color-board-raised)"}
            fillOpacity={row ? Math.max(0.12, opacity) : 1}
            stroke="var(--color-board)"
            strokeWidth={0.9}
            strokeLinejoin="round"
            className="cursor-pointer transition-opacity hover:stroke-white"
            onClick={() => row && onOpen(row)}
          >
            <title>
              {`${shape.name}${row ? `, ${party} ${row.share.toFixed(1)}%` : ", not in this election"}`}
            </title>
          </path>
        );
      })}
    </svg>
  );
}

function Metric({ icon: Icon, label, value, foot, small, tint }) {
  return (
    <div className="rounded-dash border border-dash-line bg-dash-card px-4 py-3">
      <div className="flex items-center gap-2">
        <Icon size={14} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          {label}
        </p>
      </div>
      <p
        className={cn(
          "figure mt-1.5 leading-none font-bold tracking-[-0.03em] tabular-nums",
          small ? "truncate text-[1.0625rem]" : "text-[1.5rem]"
        )}
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </p>
      <p className="mt-1 truncate text-[0.6875rem] text-dash-muted">{foot}</p>
    </div>
  );
}

function Panel({ title, foot, children }) {
  return (
    <section className="rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-baseline justify-between gap-3 border-b border-dash-line px-4 py-3">
        <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">{title}</h3>
        {foot && <span className="figure text-[0.6875rem] text-dash-muted">{foot}</span>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}
