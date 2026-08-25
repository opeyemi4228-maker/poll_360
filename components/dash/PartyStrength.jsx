"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Loader2, MapPin, Target, TrendingDown, TrendingUp } from "lucide-react";

import { PARTY_FILL } from "./Charts";
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

export default function PartyStrength({ shapes }) {
  const [party, setParty] = useState("APC");
  const [path, setPath] = useState([]);
  const [boundaries, setBoundaries] = useState(null);

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
   * So this one ignores scope by design, and says so on the trail.
   */
  const inScope = states2023;

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
    return apportion({
      names: lgaShapes.lgas.map((row) => row.name),
      votes: stateRow.votes,
      booths: stateRow.booths,
      registered: stateRow.registered,
      parentKey: stateRow.code,
    });
  }, [stateRow, lgaShapes]);

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

  /* ------------------------------------------------------------- the trail */
  const crumbs = [
    { label: "Nigeria", go: () => setPath([]) },
    state && { label: state.name, go: () => setPath([state]) },
    lga && { label: lga.name, go: () => setPath([state, lga]) },
    ward && { label: ward.name, go: () => setPath([state, lga, ward]) },
  ].filter(Boolean);

  const drill = useCallback(
    (row) => {
      if (level === "nation") setPath([{ code: row.key, name: row.name }]);
      else if (level === "state") setPath([state, { name: row.name }]);
      else if (level === "lga") setPath([state, lga, { name: row.name }]);
    },
    [level, state, lga]
  );

  const mapShapes =
    level === "nation" ? shapes : level === "state" && lgaShapes ? { paths: lgaShapes.lgas } : null;

  const strongest = children[0];
  const weakest = children[children.length - 1];
  const apportioned = level !== "nation";

  return (
    <div className="space-y-3">
      {/* ───────────────────────────────────────────────────── the selector */}
      {/* ── ONE PARTY AT A TIME, AND SAY WHICH ─────────────────────────────
          A picker that allowed several at once would put the screen straight
          back to colouring by whoever leads, which is the thing this screen
          exists not to do. Comparison is done by switching, which keeps the
          scale and the place fixed and moves only the party — the only way to
          see a difference honestly. */}
      <div className="flex flex-wrap items-center gap-2 rounded-dash border border-dash-line bg-dash-card p-2">
        <span className="px-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
          Party
        </span>
        {allParties.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setParty(item.id)}
            aria-pressed={party === item.id}
            className={cn(
              "flex items-center gap-2 rounded-full border px-3.5 py-2 text-[0.8125rem] font-bold transition-colors",
              party === item.id
                ? "border-transparent text-white"
                : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
            )}
            style={party === item.id ? { background: PARTY_FILL[item.id] ?? "var(--color-dash-ink)" } : undefined}
          >
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-full"
              style={{
                background: party === item.id ? "rgba(255,255,255,0.9)" : PARTY_FILL[item.id] ?? "var(--color-dash-muted)",
              }}
            />
            {item.id}
          </button>
        ))}
        <span className="ml-auto hidden truncate px-2 text-[0.75rem] text-dash-muted lg:block">
          {allParties.find((item) => item.id === party)?.name}
        </span>
      </div>

      {/* ──────────────────────────────────────────────────────── the figures */}
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={Target}
          label={`${party} share`}
          value={formatShare(scope.share)}
          foot={`${formatNumber(scope.votes)} of ${formatNumber(scope.total)} in ${crumbs.at(-1).label}`}
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

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_23rem]">
        {/* ───────────────────────────────────────────────────────── the map */}
        <div className="on-board flex min-h-[30rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board">
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
            <span className="ml-auto figure text-[0.75rem] text-white/45">
              {party} share, darkest is strongest
            </span>
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
                    onClick={() => level === "lga" && drill(row)}
                    className={cn(
                      "rounded-dash-sm border border-board-line p-3 text-left",
                      level === "lga" ? "cursor-pointer hover:border-white" : "cursor-default"
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
        </div>

        {/* ────────────────────────────────────────────── the ranked column */}
        <div className="flex flex-col gap-3 xl:min-h-0 xl:overflow-y-auto">
          <Panel
            title={`${party} by ${childWord(level)}`}
            foot={`${children.length} ${childWord(level)}${children.length === 1 ? "" : "s"}`}
          >
            <ul className="space-y-2.5">
              {children.slice(0, 40).map((row) => (
                <li key={row.key}>
                  <button
                    type="button"
                    onClick={() => level !== "ward" && drill(row)}
                    className={cn(
                      "w-full text-left",
                      level !== "ward" && "cursor-pointer hover:opacity-80"
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
            fill={row ? (PARTY_FILL[party] ?? "#ffffff") : "var(--color-board-raised)"}
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
