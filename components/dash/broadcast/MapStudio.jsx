"use client";

import { useMemo, useState } from "react";
import { Loader2, Map as MapIcon } from "lucide-react";

import { Card, Empty } from "@/components/dash/DashCard";
import StateMap from "@/components/dash/StateMap";
import { PARTY_FILL } from "@/components/dash/Charts";
import { Queue, Said, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { MAP_LEVELS, MAP_MODES } from "@/lib/broadcast";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The broadcast map bench.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SIX MAPS, AND THEY ARE NOT INTERCHANGEABLE
 *
 *  A map of who is leading and a map of who has finished counting look
 *  identical from across a studio — same country, same shapes, similar
 *  colours — and mean opposite things. The single most common way an election
 *  map misleads is that it is on air with the wrong caption, and nobody in the
 *  gallery can tell, because the picture is right either way.
 *
 *  So the mode is not a hidden setting. It is drawn on the map, it goes into
 *  the item's title when the map is drafted, and the legend changes with it.
 *
 *  ── GREY IS AN ABSENCE, NOT A LOW NUMBER ────────────────────────────────
 *  The rule this product applies everywhere else applies hardest here. A state
 *  nobody has reported from is flat paper grey with no label: it has not voted
 *  badly, it has not voted for nobody, it has not been counted. On a numeric
 *  mode the same state is left out of the ramp entirely rather than drawn at
 *  the bottom of it, which would put it in the same visual class as a state
 *  genuinely reporting near zero.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function MapStudio({ shapes, places, items, race, raceLabel }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  const [mode, setMode] = useState("leading");
  const [level, setLevel] = useState("state");
  const [selected, setSelected] = useState(null);

  const maps = items.filter((item) => item.kind === "MAP");
  const chosen = MAP_MODES.find((row) => row.id === mode) ?? MAP_MODES[0];

  const byCode = useMemo(() => new Map(places.map((place) => [place.code, place])), [places]);

  /* ── WHAT EACH STATE IS WORTH UNDER THE CURRENT MODE ────────────────────
     Null everywhere means "nothing to say about this place", which every draw
     path below treats as grey rather than as zero. */
  const values = useMemo(() => {
    const out = new Map();
    for (const place of places) {
      const value =
        mode === "share"
          ? (place.parties[0]?.share ?? null)
          : mode === "reporting"
            ? place.reporting
            : mode === "turnout"
              ? place.turnout
              : mode === "verified"
                ? (place.filed > 0 ? (place.verified / place.filed) * 100 : null)
                : null;
      if (value !== null && Number.isFinite(value)) out.set(place.code, value);
    }
    return out;
  }, [places, mode]);

  const leaders = useMemo(() => {
    const out = {};
    for (const place of places) {
      if (place.parties[0] && place.filed > 0) out[place.code] = place.parties[0].id;
    }
    return out;
  }, [places]);

  const picked = selected ? byCode.get(selected) : null;

  return (
    <div className="space-y-4">
      <Card
        title="Map studio"
        subtitle={`${raceLabel} · ${chosen.label.toLowerCase()}`}
        action={
          <span className="hidden text-[0.75rem] text-dash-muted sm:block">{chosen.why}</span>
        }
      >
        {/* ── THE CONTROLS ─────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <fieldset>
            <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
              Colour it by
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MAP_MODES.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setMode(row.id)}
                  aria-pressed={mode === row.id}
                  title={row.why}
                  className={cn(
                    "h-9 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                    mode === row.id
                      ? "border-dash-ink bg-dash-ink text-white"
                      : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                  )}
                >
                  {row.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
              Down to
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {MAP_LEVELS.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setLevel(row.id)}
                  aria-pressed={level === row.id}
                  disabled={row.id !== "state"}
                  title={
                    row.id === "state"
                      ? "The country by state."
                      : "Boundaries below state level are not in this repository yet — see the note under the map."
                  }
                  className={cn(
                    "h-9 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    level === row.id
                      ? "border-dash-ink bg-dash-ink text-white"
                      : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                  )}
                >
                  {row.label}
                </button>
              ))}
            </div>
          </fieldset>
        </div>

        {/* ── THE MAP ──────────────────────────────────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_18rem]">
          <div className="rounded-dash-sm border border-dash-line bg-dash-card p-3">
            {mode === "leading" ? (
              <StateMap
                shapes={shapes}
                leaders={leaders}
                selected={selected}
                onSelect={setSelected}
              />
            ) : mode === "incidents" ? (
              <Choropleth
                shapes={shapes}
                values={new Map()}
                selected={selected}
                onSelect={setSelected}
                empty="Incident density by state needs the feed joined to the map, which is the room's surface rather than this one."
              />
            ) : (
              <Choropleth
                shapes={shapes}
                values={values}
                selected={selected}
                onSelect={setSelected}
                suffix="%"
              />
            )}

            {/* The caption is part of the picture, not a note beside it. */}
            <p className="mt-2 border-t border-dash-line pt-2 text-[0.75rem] leading-relaxed text-dash-muted">
              <span className="font-bold text-dash-ink uppercase">{chosen.label}</span> · {chosen.why}{" "}
              Grey is a state nobody has reported from — an absence, not a low figure.
            </p>
          </div>

          {/* ── THE PLACE UNDER THE FINGER ─────────────────────────────── */}
          <div>
            {picked ? (
              <div className="rounded-dash-sm border border-dash-line p-4">
                <h3 className="font-display text-[1.0625rem] font-extrabold tracking-[-0.02em] text-dash-ink">
                  {picked.name}
                </h3>
                <dl className="mt-3 space-y-2 text-[0.875rem]">
                  <Row label="Filed" value={formatNumber(picked.filed)} />
                  <Row label="Verified" value={formatNumber(picked.verified)} />
                  <Row
                    label="Booths in"
                    value={picked.reporting === null ? "—" : formatShare(picked.reporting)}
                  />
                  <Row
                    label="Turnout"
                    value={picked.turnout === null ? "—" : formatShare(picked.turnout)}
                  />
                </dl>
                {picked.parties.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-dash-line pt-3">
                    {picked.parties.slice(0, 4).map((party) => (
                      <li key={party.id} className="flex items-center gap-2 text-[0.8125rem]">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: PARTY_FILL[party.id] ?? PARTY_FILL.OTH }}
                        />
                        <span className="font-semibold text-dash-ink">{party.id}</span>
                        <span className="ml-auto tabular-nums text-dash-muted">
                          {formatShare(party.share)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <Empty>Press a state to see what it holds. On a touch wall, press rather than hover.</Empty>
            )}

            {may.draft && (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () =>
                      draftItem({
                        kind: "MAP",
                        title: `${picked ? picked.name : "Nigeria"} — ${chosen.label.toLowerCase()}`,
                        body: chosen.why,
                        race,
                        scope: picked ? picked.scope : "NATION",
                        payload: { mode, level },
                      }),
                    {
                      onDone: () =>
                        setSaid({ tone: "good", text: "Drafted. It needs clearing before it can go out." }),
                    }
                  )
                }
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-dash-sm border-2 border-dash-ink bg-dash-ink px-4 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-black disabled:opacity-40"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : <MapIcon size={15} strokeWidth={2.5} />}
                Draft this map
              </button>
            )}
            <Said said={said} />
          </div>
        </div>

        {/* ── WHY THE LOWER LEVELS ARE GREYED, SAID PLAINLY ─────────────── */}
        <p className="mt-4 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          Local government, ward and polling-unit maps are switched off rather than drawn from
          approximate boundaries. This repository holds one boundary file, the state outlines, and
          a map drawn from guessed shapes below that level would be wrong in exactly the way
          nobody would notice on air.
        </p>
      </Card>

      <Card title="Maps tonight" subtitle="Every map this desk has built, and where it got to">
        <Queue items={maps} empty="No maps have been built tonight." />
      </Card>
    </div>
  );
}

/**
 * The same country, coloured by a number rather than a party.
 *
 * A single-hue ramp, because these are all "more of one thing" scales and a
 * multi-hue one would invite a reader to see categories that are not there.
 * Scaled to the highest value actually present rather than to 100: on a night
 * where nowhere is past 30% reporting, a ramp anchored at 100 draws a country
 * of identical pale shapes and says nothing.
 */
function Choropleth({ shapes, values, selected, onSelect, suffix = "", empty = null }) {
  const top = Math.max(1, ...[...values.values()]);

  if (values.size === 0 && empty) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">{empty}</p>
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${shapes.width} ${shapes.height}`}
      className="w-full"
      role="img"
      aria-label="Map of Nigeria, shaded by the selected figure. The same figures are listed beside it."
    >
      {shapes.states.map((state) => {
        const value = values.get(state.code) ?? null;
        const active = selected === state.code;
        /* 0.12 floor so a reporting state is never indistinguishable from one
           that has not started — the two must not look the same. */
        const weight = value === null ? 0 : 0.12 + 0.88 * (value / top);

        return (
          <g key={state.code} onClick={() => onSelect?.(active ? null : state.code)}>
            <path
              d={state.d}
              fill={value === null ? "var(--color-dash-bg)" : `rgba(11, 13, 17, ${weight.toFixed(3)})`}
              stroke={active ? "var(--color-dash-ink)" : "#ffffff"}
              strokeWidth={active ? 3 : 1.5}
              strokeLinejoin="round"
              className={cn(
                "cursor-pointer transition-opacity",
                selected && !active ? "opacity-45" : "opacity-100"
              )}
            >
              <title>
                {`${state.name}${value === null ? ", nothing reported" : `, ${Math.round(value)}${suffix}`}`}
              </title>
            </path>
            {value !== null && (
              <text
                x={state.at[0]}
                y={state.at[1]}
                textAnchor="middle"
                dominantBaseline="middle"
                className="pointer-events-none font-mono select-none"
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  fill: weight > 0.55 ? "#ffffff" : "#0B0D11",
                  paintOrder: "stroke",
                  stroke: weight > 0.55 ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.6)",
                  strokeWidth: 3,
                  strokeLinejoin: "round",
                }}
              >
                {Math.round(value)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-dash-muted">{label}</dt>
      <dd className="figure font-bold text-dash-ink">{value}</dd>
    </div>
  );
}
