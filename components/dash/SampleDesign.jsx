"use client";

import { useMemo, useState } from "react";

import { Meter, Panel, Split, Tile } from "./Figures";
import { ZONES } from "@/lib/zones";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Sizing the sample a quick count is entitled to project from.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A PLANNING TOOL SITS INSIDE A LIVE ROOM
 *
 *  Because the number it produces decides whether anything else here may be
 *  said out loud. A projection is only a projection if it comes off a sample
 *  drawn at random, from a frame written down beforehand, at a size chosen
 *  before anybody saw a result. Off any other set of booths it is a
 *  description of wherever the agents happened to be, and no interval makes
 *  that honest.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE FORMULA, AND WHY EVERY TERM IS ON SCREEN ───────────────────────────
 *      n = DEFF × z² × p(1−p) / e²
 *
 * then corrected for a finite population, because Nigeria's booths are many
 * and not infinite. A sample size handed down as one number is a number nobody
 * can argue with — and the design effect in particular is where an honest
 * 1,500 quietly becomes a dishonest 400.
 *
 * ── WHAT THIS WILL NOT DO ──────────────────────────────────────────────────
 * Select the booths. Selection has to be a documented draw from the registry
 * with a recorded seed, made once — a button that reshuffles the sample every
 * time it is pressed is the opposite of defensible.
 */

/* Two-sided z for the three confidence levels anybody uses. */
const Z = { 90: 1.645, 95: 1.96, 99: 2.576 };

const DESIGNS = [
  { id: "national", label: "One national figure", why: "Cheapest defensible design. Says nothing about any state." },
  { id: "zone", label: "Six zones", why: "Nigerian swings are zonal. Survives most newsroom questions." },
  { id: "state", label: "Every state", why: "Each sized separately. What people assume they have." },
];

export default function SampleDesign({ states = [], pulse = null, ground = null }) {
  const [moe, setMoe] = useState(2);
  const [confidence, setConfidence] = useState(95);
  const [deff, setDeff] = useState(2);
  const [design, setDesign] = useState("national");

  /* The frame: booths where we know them, and the register behind them. */
  const frame = useMemo(() => {
    const rows = states.map((row) => ({
      code: row.code,
      name: row.name,
      booths: row.booths ?? 0,
      registered: row.registered ?? 0,
    }));
    return {
      rows,
      booths: rows.reduce((sum, row) => sum + row.booths, 0),
      registered: rows.reduce((sum, row) => sum + row.registered, 0),
    };
  }, [states]);

  const plan = useMemo(() => {
    /* The formula, then the finite-population correction. Where a stratum's
       population is unknown the correction is not applied rather than applied
       against a guess: uncorrected is too big, which is the safe direction.
       Inside the memo because it closes over all three dials. */
    const sizeFor = (population) => {
      const z = Z[confidence];
      const e = moe / 100;
      const raw = (deff * z * z * 0.25) / (e * e);
      if (!population) return Math.ceil(raw);
      return Math.ceil((raw * population) / (raw + population - 1));
    };

    if (design === "national") {
      const n = sizeFor(frame.booths);
      return {
        total: n,
        strata: [
          { id: "NG", name: ground ?? "The federation", population: frame.booths, registered: frame.registered, n },
        ],
      };
    }

    if (design === "zone") {
      const strata = Object.entries(ZONES)
        .map(([zone, codes]) => {
          const rows = frame.rows.filter((row) => codes.includes(row.code));
          if (!rows.length) return null;
          const booths = rows.reduce((sum, row) => sum + row.booths, 0);
          const registered = rows.reduce((sum, row) => sum + row.registered, 0);
          return { id: zone, name: zone, population: booths, registered, n: sizeFor(booths) };
        })
        .filter(Boolean);
      return { total: strata.reduce((sum, row) => sum + row.n, 0), strata };
    }

    const strata = frame.rows
      .filter((row) => row.booths || row.registered)
      .map((row) => ({
        id: row.code,
        name: row.name,
        population: row.booths,
        registered: row.registered,
        n: sizeFor(row.booths),
      }));
    return { total: strata.reduce((sum, row) => sum + row.n, 0), strata };
  }, [design, frame, moe, confidence, deff, ground]);

  /* The comparison the screen exists for, stated as a shortfall in booths —
     never as "you are at 34% of the sample", which invites somebody to project
     from 34% of it. */
  const assigned = pulse?.assigned ?? 0;
  const short = Math.max(0, plan.total - assigned);
  const covered = Math.min(assigned, plan.total);

  return (
    <div className="flex flex-col gap-3">
      {/* --------------------------------------------------------- KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Booths this design needs"
          value={formatNumber(plan.total)}
          size="lg"
          foot={`${formatNumber(plan.strata.length)} stratum${plan.strata.length === 1 ? "" : "s"}, ±${moe.toFixed(1)} points at ${confidence}%`}
        />
        <Tile
          label="Booths covered"
          value={formatNumber(assigned)}
          of={formatNumber(plan.total)}
          share={plan.total ? (covered / plan.total) * 100 : 0}
          tone={short ? "warn" : "good"}
          foot={short ? `${formatNumber(short)} short` : "Enough booths — if they were the sampled ones"}
        />
        <Tile
          label="Frame"
          value={frame.booths ? formatNumber(frame.booths) : "—"}
          foot={frame.registered ? `${formatNumber(frame.registered)} on the register` : "Registry not loaded"}
        />
        <Tile
          label="Sampling fraction"
          value={frame.booths ? formatShare((plan.total / frame.booths) * 100) : "—"}
          foot="Of every booth in the frame"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[21rem_minmax(0,1fr)]">
        {/* ------------------------------------------------------------ dials */}
        <div className="flex flex-col gap-3">
          <Panel title="What the estimate must do">
            <div className="space-y-4">
              <Dial label="Margin of error" value={`±${moe.toFixed(1)} pts`} why="Halving it costs four times the sample">
                <input
                  type="range"
                  min="0.5"
                  max="5"
                  step="0.5"
                  value={moe}
                  onChange={(event) => setMoe(Number(event.target.value))}
                  className="w-full accent-red-500"
                  aria-label="Margin of error in percentage points"
                />
              </Dial>

              <Dial label="Confidence" value={`${confidence}%`} why="99% before contradicting a declaration">
                <div className="flex gap-1.5">
                  {Object.keys(Z).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConfidence(Number(level))}
                      aria-pressed={confidence === Number(level)}
                      className={cn(
                        "h-8 flex-1 rounded-dash-sm border text-[0.75rem] font-bold transition-colors",
                        confidence === Number(level)
                          ? "border-dash-ink bg-dash-ink text-white"
                          : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                      )}
                    >
                      {level}%
                    </button>
                  ))}
                </div>
              </Dial>

              <Dial label="Design effect" value={`× ${deff.toFixed(1)}`} why="Setting this to 1 is how a count is undersized">
                <input
                  type="range"
                  min="1"
                  max="4"
                  step="0.1"
                  value={deff}
                  onChange={(event) => setDeff(Number(event.target.value))}
                  className="w-full accent-red-500"
                  aria-label="Design effect"
                />
              </Dial>
            </div>
          </Panel>

          <Panel title="What it must be able to say">
            <div className="space-y-2">
              {DESIGNS.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setDesign(row.id)}
                  aria-pressed={design === row.id}
                  className={cn(
                    "block w-full rounded-dash-sm border p-2.5 text-left transition-colors",
                    design === row.id ? "border-dash-ink bg-dash-bg" : "border-dash-line hover:border-dash-ink"
                  )}
                >
                  <span className="block text-[0.8125rem] font-bold text-dash-ink">{row.label}</span>
                  <span className="mt-0.5 block text-[0.6875rem] text-dash-muted">{row.why}</span>
                </button>
              ))}
            </div>
          </Panel>
        </div>

        {/* ----------------------------------------------------------- answer */}
        <div className="flex flex-col gap-3">
          <Panel
            title="Covered against needed"
            figure={short ? `${formatNumber(short)} short` : "met"}
            foot="n = DEFF × z² × 0.25 ÷ e², corrected for a finite population."
          >
            <Split
              segments={[
                { id: "have", label: "Covered", value: covered, color: "var(--color-ink-800)" },
                { id: "short", label: "Short", value: short, color: "var(--color-flag-500)" },
              ]}
              total={plan.total || 1}
            />
            {/* One line, because this is the sentence that stops a bad call. */}
            <p className="mt-3 text-[0.75rem] leading-relaxed text-dash-muted">
              Size is the easy half. These booths were deployed where we could recruit — a sensible
              way to deploy, and not a random draw. Until a drawn sample is reporting, the
              projection describes the booths we have, and the room must say so.
            </p>
          </Panel>

          <Panel
            title="How it divides"
            figure={`${formatNumber(plan.total)} booths`}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-dash-line text-left text-[0.625rem] tracking-[0.08em] text-dash-muted uppercase">
                    <th className="pb-2 font-semibold">Stratum</th>
                    <th className="pb-2 text-right font-semibold">Booths</th>
                    <th className="pb-2 text-right font-semibold">Register</th>
                    <th className="pb-2 text-right font-semibold">Sample</th>
                    <th className="w-[26%] pb-2 pl-4 font-semibold">Fraction</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.strata.map((row) => {
                    const fraction = row.population ? (row.n / row.population) * 100 : null;
                    return (
                      <tr key={row.id} className="border-b border-dash-line/60 last:border-0">
                        <td className="py-1.5 font-semibold text-dash-ink">{row.name}</td>
                        <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                          {row.population ? formatNumber(row.population) : "—"}
                        </td>
                        <td className="figure py-1.5 text-right text-dash-muted tabular-nums">
                          {row.registered ? formatNumber(row.registered) : "—"}
                        </td>
                        <td className="figure py-1.5 text-right font-bold text-dash-ink tabular-nums">
                          {formatNumber(row.n)}
                        </td>
                        <td className="py-1.5 pl-4">
                          {fraction === null ? (
                            <span className="text-[0.6875rem] text-dash-muted">no frame</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <Meter share={Math.min(100, fraction)} height={6} className="w-full" />
                              <span className="figure w-11 shrink-0 text-right text-[0.6875rem] text-dash-muted tabular-nums">
                                {formatShare(fraction)}
                              </span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!frame.booths && (
              <p className="mt-2.5 text-[0.6875rem] text-dash-muted">
                No booth counts loaded, so these are the uncorrected formula — always the larger number.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function Dial({ label, value, why, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[0.8125rem] font-semibold text-dash-ink">{label}</span>
        <span className="figure text-[0.8125rem] font-bold text-dash-ink tabular-nums">{value}</span>
      </div>
      <div className="mt-2">{children}</div>
      <p className="mt-1 text-[0.6875rem] text-dash-muted">{why}</p>
    </div>
  );
}
