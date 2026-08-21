"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Layers, Loader2, RotateCcw, Target } from "lucide-react";

import { boundsOf, extentOf } from "@/lib/bbox";
import { apportion, wardCount } from "@/lib/drill";
import { FACTOR_ROWS } from "@/lib/forecast";
import { states2023 } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The planning map.
 *
 * ── A MAP WITH NO RESULT ON IT, DELIBERATELY ───────────────────────────────
 * Every other map in this product answers "what happened". This one answers
 * "where are we going to work", and that is a different question with a
 * different failure mode: a planning map coloured by last result quietly
 * argues for fighting the previous election again. So it starts blank, and
 * the only colour on it is the territory you have chosen.
 *
 * ── WHAT SELECTION IS FOR ──────────────────────────────────────────────────
 * Choosing places is not the output. The output is the running cost of
 * covering them: how many booths, how many agents at one each, and how much
 * of the country that reaches. A plan that names twelve states without those
 * numbers is a wish.
 *
 * ── AND THE PLANNER DECIDES WHAT "REACH" MEANS ─────────────────────────────
 * Coverage measured against the register is one answer, and often the wrong
 * one: a state with two million registered and a 17% turnout is not the same
 * prize as a state with two million registered and 40%. So the basis is a
 * control, not a constant. Register, accredited voters, votes actually cast,
 * or polling units to staff. The same selection, costed four ways, and the
 * ranking underneath it changes with the choice.
 * ───────────────────────────────────────────────────────────────────────────
 */

const NATIONAL = {
  registered: states2023.reduce((sum, state) => sum + state.registered, 0),
  booths: states2023.reduce((sum, state) => sum + state.booths, 0),
  cast: states2023.reduce((sum, state) => sum + state.total, 0),
};

/**
 * INEC declared 25,286,616 accredited against 24,025,940 valid votes in 2023.
 * We hold the second figure per state and not the first, so accreditation is
 * carried at the national ratio rather than invented state by state. It is
 * labelled Derived everywhere it appears for exactly that reason: the shape is
 * right, the per-state detail is an assumption, and a planner is entitled to
 * know which is which before they budget against it.
 */
const ACCREDITATION = 25_286_616 / 24_025_940;
NATIONAL.accredited = Math.round(NATIONAL.cast * ACCREDITATION);

/** What coverage is measured against. The planner picks. */
const BASES = [
  {
    key: "registered",
    label: "Registered voters",
    short: "Register",
    unit: "voters",
    real: true,
    note: "Everybody entitled to vote. The widest measure, and the one that counts people who have never turned out.",
    of: (row) => row.registered ?? 0,
  },
  {
    key: "accredited",
    label: "Accredited voters",
    short: "Accredited",
    unit: "voters",
    real: false,
    note: "The people who actually turned up and were verified. Carried at the 2023 national accreditation ratio, because we hold valid votes per state and not accreditation.",
    of: (row) => Math.round((row.total ?? 0) * ACCREDITATION),
  },
  {
    key: "cast",
    label: "Votes cast",
    short: "Votes cast",
    unit: "votes",
    real: true,
    note: "Valid votes declared in 2023. The hardest measure of where the votes really are.",
    of: (row) => row.total ?? 0,
  },
  {
    key: "booths",
    label: "Polling units",
    short: "Booths",
    unit: "units",
    real: true,
    note: "What you have to physically staff. The measure that decides whether a plan is affordable.",
    of: (row) => row.booths ?? 0,
  },
];

const FACTOR_OF = new Map(FACTOR_ROWS.map((row) => [row.code, row]));

/**
 * How the shortlist is ranked. Every lens answers "where next", and they
 * disagree with each other on purpose: the argument between them is the
 * planning conversation.
 */
const LENSES = [
  {
    key: "size",
    label: "Size",
    real: true,
    note: "Simply the largest places on the basis you chose.",
    score: (state, basis) => basis.of(state),
    show: (state, basis) => formatNumber(basis.of(state)),
  },
  {
    key: "close",
    label: "Competitiveness",
    real: true,
    note: "Where 2023 was closest. A tight state is worth more per agent than a safe one.",
    score: (state) => 100 - marginOf(state),
    show: (state) => `${marginOf(state).toFixed(1)}% margin`,
  },
  {
    key: "headroom",
    label: "Voters not reached",
    real: true,
    note: "The register that did not vote. Almost always a bigger pool than the voters anybody hopes to persuade.",
    score: (state) => state.registered - state.total,
    show: (state) => `${formatNumber(state.registered - state.total)} stayed home`,
  },
  {
    key: "density",
    label: "Voters per unit",
    real: true,
    note: "Crowded booths mean long queues and a slow count. High density is where the day goes wrong.",
    score: (state) => state.registered / Math.max(state.booths, 1),
    show: (state) => `${formatNumber(Math.round(state.registered / Math.max(state.booths, 1)))} per unit`,
  },
  {
    key: "security",
    label: "Security pressure",
    real: false,
    note: "Where polling is under most pressure. Synthetic, and the strongest single depressant on turnout in the model.",
    score: (state) => FACTOR_OF.get(state.code)?.security ?? 0,
    show: (state) => `${FACTOR_OF.get(state.code)?.security ?? 0} of 100`,
  },
  {
    key: "hardship",
    label: "Economic hardship",
    real: false,
    note: "Where the cost of getting to a booth bites hardest. Synthetic.",
    score: (state) => FACTOR_OF.get(state.code)?.hardship ?? 0,
    show: (state) => `${FACTOR_OF.get(state.code)?.hardship ?? 0} of 100`,
  },
  {
    key: "rainRisk",
    label: "Rain on the day",
    real: false,
    note: "Chance of rain during polling hours. Synthetic, and it suppresses rural turnout hardest.",
    score: (state) => FACTOR_OF.get(state.code)?.rainRisk ?? 0,
    show: (state) => `${FACTOR_OF.get(state.code)?.rainRisk ?? 0}% chance`,
  },
];

/** The 2023 winning margin in a state, as a share of the votes cast there. */
function marginOf(state) {
  const order = [...state.votes].sort((a, b) => b - a);
  return ((order[0] - order[1]) / Math.max(state.total, 1)) * 100;
}

export default function PlanningMap({ shapes }) {
  const [openState, setOpenState] = useState(null);
  const [lgaShapes, setLgaShapes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(null);
  const [basisKey, setBasisKey] = useState("registered");
  const [lensKey, setLensKey] = useState("close");

  /**
   * ── HOW A SELECTION IS KEYED, AND WHY IT HAS THREE FORMS ─────────────────
   * A state is not a peer of its local governments, it *is* them. Picking Kano
   * means all 44 of Kano's local governments, and the total has to say Kano
   * once however many of its parts are also ticked.
   *
   * The first version stored a whole state and its local governments as two
   * independent kinds of pick and added both. Taking Kano and then ticking
   * three places inside Kano counted Kano's register once, and three
   * forty-fourths of it a second time. Enough of that and the reach went past
   * 100%, which is not a rounding problem, it is the model being wrong.
   *
   *   "KAN"           the whole state
   *   "KAN:Nassarawa" one local government, where the state is not taken whole
   *   "KAN!Nassarawa" one local government carved OUT of a whole state
   *
   * The third form is what makes tapping inside a selected state do the only
   * thing it can sensibly mean. The state is already covered, so the tap takes
   * that place back out and the figures go down. Adding it again would be
   * adding something you already have.
   */
  const [picked, setPicked] = useState(() => new Set());

  /* Local government figures for every state opened so far. A carve-out has to
     be costed exactly, and the rows are only derivable while their state is
     open, so they are kept once loaded rather than re-estimated from an
     average after the reader has moved on. */
  const [lgaCache, setLgaCache] = useState(() => new Map());

  const byCode = useMemo(() => new Map(states2023.map((row) => [row.code, row])), []);
  const basis = BASES.find((item) => item.key === basisKey) ?? BASES[0];
  const lens = LENSES.find((item) => item.key === lensKey) ?? LENSES[0];

  useEffect(() => {
    let cancelled = false;
    if (!openState) {
      const frame = requestAnimationFrame(() => setLgaShapes(null));
      return () => cancelAnimationFrame(frame);
    }
    const started = requestAnimationFrame(() => setLoading(true));
    fetch(`/geo/lga/${openState.code}.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLgaShapes(data);
        const state = byCode.get(openState.code);
        if (!data || !state) return;
        const rows = apportion({
          names: data.lgas.map((row) => row.name),
          votes: state.votes,
          booths: state.booths,
          registered: state.registered,
          parentKey: state.code,
        });
        setLgaCache((current) =>
          current.get(state.code) ? current : new Map(current).set(state.code, rows)
        );
      })
      .catch(() => !cancelled && setLgaShapes(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      cancelAnimationFrame(started);
    };
  }, [openState, byCode]);

  const lgaRows = useMemo(() => {
    if (!openState || !lgaShapes) return [];
    return lgaCache.get(openState.code) ?? [];
  }, [openState, lgaShapes, lgaCache]);

  const inState = openState !== null;

  const frame = useMemo(() => {
    if (!inState) return { viewBox: `0 0 ${shapes.width} ${shapes.height}`, width: shapes.width };
    return boundsOf(lgaShapes?.lgas.map((row) => row.d) ?? []);
  }, [inState, shapes, lgaShapes]);

  const fits = useMemo(() => {
    const shown = inState ? (lgaShapes?.lgas ?? []) : shapes.states;
    const map = new Map();
    for (const shape of shown) {
      map.set(shape.name, extentOf(shape.d).width > frame.width * 0.075);
    }
    return map;
  }, [inState, lgaShapes, shapes, frame]);

  /* ---------------------------------------------------------------- totals */
  /**
   * Every state contributes exactly once, and never more than itself.
   *
   * The plan is folded into one entry per state first, whole or a named set of
   * parts, and only then costed. That ordering is the fix: by the time
   * anything is added up, each state has a single answer for what is covered
   * inside it, so there is no path left where a place can be counted twice.
   */
  const plan = useMemo(() => {
    const cover = new Map();
    const entry = (code) => {
      if (!cover.has(code)) cover.set(code, { whole: false, include: new Set(), exclude: new Set() });
      return cover.get(code);
    };

    for (const key of picked) {
      if (key.includes("!")) entry(key.split("!")[0]).exclude.add(key.split("!")[1]);
      else if (key.includes(":")) entry(key.split(":")[0]).include.add(key.split(":")[1]);
      else entry(key).whole = true;
    }

    let value = 0;
    let booths = 0;
    let states = 0;
    let lgas = 0;

    for (const [code, scope] of cover) {
      const state = byCode.get(code);
      if (!state) continue;
      const rows = lgaCache.get(code);

      if (scope.whole) {
        value += basis.of(state);
        booths += state.booths;
        states += 1;
        lgas += rows?.length ?? 0;

        /* Carve-outs come straight back off the state's own figures, so a
           state minus everything inside it lands at zero rather than at some
           remainder an average left behind. */
        for (const name of scope.exclude) {
          const row = rows?.find((item) => item.name === name);
          if (!row) continue;
          value -= basis.of(row);
          booths -= row.booths;
          lgas -= 1;
        }
        continue;
      }

      /* Parts only. An exclusion with no whole state behind it is meaningless,
         so it is ignored rather than allowed to subtract from a neighbour. */
      if (!scope.include.size) continue;
      states += 1;

      for (const name of scope.include) {
        lgas += 1;
        const row = rows?.find((item) => item.name === name);
        if (row) {
          value += basis.of(row);
          booths += row.booths;
        } else {
          /* Never opened, so cost it at the state's own average. */
          const parts = Math.max(wardCount(code) * 2, 1);
          value += Math.round(basis.of(state) / parts);
          booths += Math.round(state.booths / parts);
        }
      }
    }

    /* Guarding the arithmetic as well as the model. If these ever clamp, the
       fold above has a hole in it and the figure on screen would be a lie. */
    const total = NATIONAL[basis.key] || 1;
    value = Math.max(0, Math.min(value, total));
    booths = Math.max(0, Math.min(booths, NATIONAL.booths));

    return {
      cover,
      states,
      lgas: Math.max(0, lgas),
      value,
      booths,
      /* One agent per booth is the product's own rule: seatsPerUnit is 1. */
      agents: booths,
      reach: (value / total) * 100,
      boothShare: (booths / NATIONAL.booths) * 100,
    };
  }, [picked, byCode, lgaCache, basis]);

  /* ------------------------------------------------------------- shortlist */
  /** The places not yet covered, ranked by the chosen lens. */
  const shortlist = useMemo(() => {
    const scope = plan.cover;
    return states2023
      .filter((state) => {
        const held = scope.get(state.code);
        return !held || (!held.whole && !held.include.size);
      })
      .map((state) => ({ state, score: lens.score(state, basis), note: lens.show(state, basis) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
  }, [plan.cover, lens, basis]);

  /* ------------------------------------------------------------- gestures */
  /** Taking or dropping a whole state, and clearing whatever was set inside it. */
  const toggleState = (code) =>
    setPicked((current) => {
      const next = new Set(current);
      const had = next.has(code);
      /* Either direction wipes the parts. Dropping a state must not leave
         carve-outs behind to reappear next time it is taken, and taking one
         must not leave individual ticks that now mean nothing. */
      for (const key of [...next]) {
        if (key.startsWith(`${code}:`) || key.startsWith(`${code}!`)) next.delete(key);
      }
      if (had) next.delete(code);
      else next.add(code);
      return next;
    });

  /**
   * Taking or dropping one local government.
   *
   * Inside a state already taken whole this carves the place out instead of
   * adding it, because you cannot add what you already have. That is the
   * behaviour the arithmetic depends on, and it is the only reading of the
   * gesture that leaves the reader in control: tap to remove, tap to put back.
   */
  const toggleLga = (code, name) =>
    setPicked((current) => {
      const next = new Set(current);
      const whole = next.has(code);
      const key = `${code}${whole ? "!" : ":"}${name}`;

      if (next.has(key)) next.delete(key);
      else next.add(key);

      /* Carving out the last place leaves a state covering nothing, so it
         stops being selected at all rather than sitting at zero. */
      if (whole) {
        const rows = lgaCache.get(code);
        const carved = [...next].filter((item) => item.startsWith(`${code}!`)).length;
        if (rows && carved >= rows.length) {
          for (const item of [...next]) {
            if (item === code || item.startsWith(`${code}!`)) next.delete(item);
          }
        }
      }

      return next;
    });

  /** Is this place counted in the plan right now? */
  const isPicked = (key) => {
    if (!key.includes(":")) return picked.has(key);
    const [code, name] = key.split(":");
    /* Inside a whole state everything counts except what has been carved out. */
    if (picked.has(code)) return !picked.has(`${code}!${name}`);
    return picked.has(key);
  };

  /** Some of this state is covered, but not the whole of it. */
  const statePartly = (code) =>
    picked.has(code)
      ? [...picked].some((key) => key.startsWith(`${code}!`))
      : [...picked].some((key) => key.startsWith(`${code}:`));

  /**
   * The plan as a file, written from the same fold the totals use, so the
   * export and the screen can never disagree about what is covered.
   */
  const exportPlan = () => {
    const lines = [`scope,state,local government,${basis.short.toLowerCase()},booths`];

    for (const [code, scope] of [...plan.cover.entries()].sort()) {
      const state = byCode.get(code);
      if (!state) continue;
      const rows = lgaCache.get(code);
      const figures = (name) => {
        const row = rows?.find((item) => item.name === name);
        return row ? `${basis.of(row)},${row.booths}` : ",";
      };

      if (scope.whole) {
        lines.push(`State,${state.name},,${basis.of(state)},${state.booths}`);
        for (const name of [...scope.exclude].sort()) {
          lines.push(`Excluded,${state.name},"${name}",${figures(name)}`);
        }
        continue;
      }
      for (const name of [...scope.include].sort()) {
        lines.push(`LGA,${state.name},"${name}",${figures(name)}`);
      }
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "poll360-coverage-plan.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const list = inState ? (lgaShapes?.lgas ?? []) : shapes.states;

  return (
    <div className="grid gap-3 xl:h-[calc(100vh-12.5rem)] xl:grid-cols-[minmax(0,1fr)_22rem]">
      {/* ------------------------------------------------------------- map */}
      <div className="on-board flex min-h-[32rem] flex-col overflow-hidden rounded-dash border border-board-line bg-board xl:min-h-0">
        <nav className="flex flex-wrap items-center gap-1 border-b border-board-line px-4 py-2.5">
          <button
            type="button"
            onClick={() => setOpenState(null)}
            className={cn(
              "rounded-dash-sm px-2 py-1 text-[0.8125rem] font-semibold transition-colors",
              inState ? "text-white/55 hover:bg-white/10 hover:text-white" : "text-white"
            )}
          >
            Nigeria
          </button>
          {inState && (
            <>
              <ChevronRight size={13} className="shrink-0 text-white/35" />
              <span className="px-2 py-1 text-[0.8125rem] font-semibold text-white">
                {openState.name}
              </span>
            </>
          )}
          <span className="ml-auto text-[0.75rem] text-white/45">
            {inState
              ? picked.has(openState.code)
                ? "This state is covered. Tap a local government to take it back out"
                : "Tap a local government to add it"
              : "Tap a state to add it, twice to open it"}
          </span>
        </nav>

        <div className="relative min-h-0 flex-1 p-1.5">
          {loading && (
            <p className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-board/80 text-[0.875rem] text-white/60">
              <Loader2 size={16} className="animate-spin" />
              Loading boundaries
            </p>
          )}

          <svg
            viewBox={frame.viewBox}
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={
              inState
                ? `${openState.name} by local government. Selected places are listed beside this map.`
                : "Nigeria. Tap a state to add it to the plan."
            }
            onPointerLeave={() => setHovered(null)}
          >
            <defs>
              <pattern id="plan-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M40 0H0V40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              </pattern>
              {/* Carved-out places read as a hole in the plan rather than as
                  never-chosen, because those are different facts and a planner
                  needs to see the difference at a glance. */}
              <pattern
                id="plan-carved"
                width="7"
                height="7"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="7" height="7" fill="var(--color-silent)" />
                <line x1="0" y1="0" x2="0" y2="7" stroke="var(--color-red-900)" strokeWidth="3" />
              </pattern>
            </defs>
            <rect
              x={frame.x ?? 0}
              y={frame.y ?? 0}
              width={frame.width ?? shapes.width}
              height={frame.height ?? shapes.height}
              fill="url(#plan-grid)"
            />

            {list.map((shape) => {
              const key = inState ? `${openState.code}:${shape.name}` : shape.code;
              const chosen = isPicked(key);
              const carved =
                inState && picked.has(openState.code) && picked.has(`${openState.code}!${shape.name}`);
              const partly = !inState && statePartly(shape.code);
              const active = hovered === key;
              const unit = frame.width / 1000;

              return (
                <g
                  key={key}
                  onPointerEnter={() => setHovered(key)}
                  onClick={() => {
                    if (inState) {
                      toggleLga(openState.code, shape.name);
                      return;
                    }
                    if (chosen) {
                      /* Second tap on a chosen state opens it, so one gesture
                         covers both "take the whole state" and "take part". */
                      setOpenState({ code: shape.code, name: shape.name });
                      return;
                    }
                    toggleState(shape.code);
                  }}
                  className="cursor-pointer"
                >
                  <path
                    d={shape.d}
                    fill={
                      carved
                        ? "url(#plan-carved)"
                        : chosen
                          ? "var(--color-red-500)"
                          : partly
                            ? "var(--color-red-900)"
                            : "var(--color-silent)"
                    }
                    stroke={active || chosen ? "#ffffff" : "var(--color-board)"}
                    strokeWidth={(active ? 2.4 : 1.1) * unit}
                    strokeLinejoin="round"
                    className="transition-[fill] duration-200"
                  >
                    {/* One string: adjacent text nodes inside a <title> are
                        merged by the DOM and never match what React rendered. */}
                    <title>
                      {`${shape.name}${
                        carved
                          ? " (taken out of the plan)"
                          : chosen
                            ? " (in the plan)"
                            : partly
                              ? " (partly covered)"
                              : ""
                      }`}
                    </title>
                  </path>

                  {fits.get(shape.name) && (
                    <text
                      x={shape.at[0]}
                      y={shape.at[1]}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="pointer-events-none select-none"
                      style={{
                        fontSize: frame.width * 0.017,
                        fontWeight: 700,
                        fill: chosen ? "#ffffff" : "rgba(255,255,255,0.55)",
                        paintOrder: "stroke",
                        stroke: "rgba(0,0,0,0.45)",
                        strokeWidth: frame.width * 0.004,
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
        </div>

        {/* The running cost of the plan, along the foot. */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-board-line px-4 py-2.5">
          {[
            ["States", plan.states],
            ["Local govts", plan.lgas],
            ["Booths", formatNumber(plan.booths)],
            ["Agents needed", formatNumber(plan.agents)],
          ].map(([label, value]) => (
            <span key={label} className="flex items-baseline gap-2">
              <span className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
                {label}
              </span>
              <span className="figure text-[0.75rem] font-bold text-white tabular-nums">
                {value}
              </span>
            </span>
          ))}
          <span className="figure ml-auto text-[0.625rem] text-white/35">One agent per booth</span>
        </div>
      </div>

      {/* ------------------------------------------------------------ plan */}
      <div className="flex min-h-0 flex-col gap-3">
        {/* ------------------------------------------------------ the basis */}
        <section className="rounded-dash border border-dash-line bg-dash-card p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Plan against
          </p>

          <div className="mt-2 grid grid-cols-2 gap-1">
            {BASES.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setBasisKey(item.key)}
                className={cn(
                  "rounded-dash-sm px-2.5 py-1.5 text-[0.75rem] font-bold transition-colors",
                  basisKey === item.key
                    ? "bg-dash-ink text-white"
                    : "border border-dash-line text-dash-muted hover:text-dash-ink"
                )}
              >
                {item.short}
                {!item.real && <span className="ml-1 text-[0.5625rem] opacity-70">derived</span>}
              </button>
            ))}
          </div>

          <p className="mt-2 text-[0.6875rem] leading-relaxed text-dash-muted">{basis.note}</p>

          <p className="figure mt-3 text-[2rem] leading-none font-bold tracking-[-0.03em] text-dash-ink tabular-nums">
            {formatShare(plan.reach)}
          </p>
          <p className="mt-1.5 text-[0.8125rem] text-dash-muted">
            {formatNumber(plan.value)} of {formatNumber(NATIONAL[basis.key])} {basis.unit}
          </p>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-dash-bg">
            <div
              className="h-full rounded-full bg-dash-ink transition-[width] duration-300"
              style={{ width: `${Math.min(100, plan.reach)}%` }}
            />
          </div>

          <dl className="mt-4 space-y-2 border-t border-dash-line pt-3 text-[0.8125rem]">
            <div className="flex justify-between gap-3">
              <dt className="text-dash-muted">Share of all booths</dt>
              <dd className="figure font-bold text-dash-ink">{formatShare(plan.boothShare)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-dash-muted">Agents to recruit</dt>
              <dd className="figure font-bold text-dash-ink">{formatNumber(plan.agents)}</dd>
            </div>
          </dl>
        </section>

        {/* --------------------------------------------------- where next */}
        <section className="rounded-dash border border-dash-line bg-dash-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-dash-line px-4 py-3">
            <Target size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
            <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
              Where to work next
            </h3>
            {!lens.real && (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase text-amber-900">
                Synthetic
              </span>
            )}
          </header>

          <div className="border-b border-dash-line px-4 py-2.5">
            <label
              htmlFor="plan-lens"
              className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
            >
              Prioritise by
            </label>
            <select
              id="plan-lens"
              value={lensKey}
              onChange={(event) => setLensKey(event.target.value)}
              className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-bg px-2.5 py-2 text-[0.8125rem] font-semibold text-dash-ink outline-none focus:border-dash-ink"
            >
              {LENSES.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                  {item.real ? "" : " (synthetic)"}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[0.6875rem] leading-relaxed text-dash-muted">{lens.note}</p>
          </div>

          <ul className="divide-y divide-dash-line">
            {shortlist.length === 0 ? (
              <li className="px-4 py-4 text-center text-[0.8125rem] text-dash-muted">
                Every state is in the plan.
              </li>
            ) : (
              shortlist.map(({ state, note }) => (
                <li key={state.code}>
                  <button
                    type="button"
                    onClick={() => toggleState(state.code)}
                    onMouseEnter={() => setHovered(state.code)}
                    onMouseLeave={() => setHovered(null)}
                    className="flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors hover:bg-dash-bg"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                        {state.name}
                      </span>
                      <span className="figure block text-[0.6875rem] text-dash-muted">{note}</span>
                    </span>
                    <span className="figure shrink-0 text-[0.75rem] font-bold text-dash-ink tabular-nums">
                      {formatNumber(basis.of(state))}
                    </span>
                    <span className="shrink-0 text-[0.6875rem] font-bold text-dash-muted">add</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </section>

        {/* ---------------------------------------------------- in the plan */}
        <section className="flex min-h-0 flex-1 flex-col rounded-dash border border-dash-line bg-dash-card">
          <header className="flex items-center gap-2 border-b border-dash-line px-4 py-3">
            <Layers size={15} strokeWidth={2.25} className="shrink-0 text-dash-muted" />
            <h3 className="font-display text-[0.875rem] font-extrabold text-dash-ink">
              In the plan
            </h3>
            <span className="figure ml-auto text-[0.6875rem] text-dash-muted">
              {plan.states} {plan.states === 1 ? "state" : "states"}
            </span>
          </header>

          {plan.cover.size === 0 ? (
            <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
              Nothing chosen yet. Tap a state to add it whole, or tap it twice to open it and take
              only the local governments you want.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 divide-y divide-dash-line overflow-y-auto">
              {[...plan.cover.entries()]
                .sort()
                .filter(([, scope]) => scope.whole || scope.include.size)
                .map(([code, scope]) => {
                  const state = byCode.get(code);
                  const detail = scope.whole
                    ? scope.exclude.size
                      ? `whole state, less ${scope.exclude.size} local ${scope.exclude.size === 1 ? "government" : "governments"}`
                      : "whole state"
                    : `${scope.include.size} local ${scope.include.size === 1 ? "government" : "governments"}`;

                  return (
                    <li key={code}>
                      <button
                        type="button"
                        onClick={() => toggleState(code)}
                        onMouseEnter={() => setHovered(code)}
                        onMouseLeave={() => setHovered(null)}
                        className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left transition-colors hover:bg-dash-bg"
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "size-2.5 shrink-0 rounded-full",
                            scope.whole && !scope.exclude.size ? "bg-red-500" : "bg-red-900"
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-semibold text-dash-ink">
                            {state?.name ?? code}
                          </span>
                          <span className="block text-[0.6875rem] text-dash-muted">{detail}</span>
                        </span>
                        <span className="shrink-0 text-[0.6875rem] text-dash-muted">remove</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          )}

          <footer className="flex gap-2 border-t border-dash-line p-3">
            <button
              type="button"
              onClick={exportPlan}
              disabled={plan.cover.size === 0}
              className="flex flex-1 items-center justify-center gap-2 rounded-dash-sm bg-dash-ink px-3 py-2.5 text-[0.8125rem] font-bold text-white transition-colors hover:bg-red-600 disabled:opacity-40"
            >
              <Download size={14} strokeWidth={2.5} />
              Export plan
            </button>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              disabled={plan.cover.size === 0}
              aria-label="Clear the plan"
              className="inline-flex size-10 items-center justify-center rounded-dash-sm border border-dash-line text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-40"
            >
              <RotateCcw size={15} strokeWidth={2.5} />
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
