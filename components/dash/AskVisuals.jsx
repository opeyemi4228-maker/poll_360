"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { matchLgaNames } from "@/lib/stronghold-map";
import { fmtPct, fmtPts, niceAxis } from "@/lib/ask/format";
import { cn } from "@/lib/utils";

/**
 * Ask Poll360's map and chart.
 *
 * Both are drawn from a spec the server wrote (lib/ask/visual.js) — which
 * regions, what colour, what each says on hover — so the screen and the PDF
 * brief show the same picture. This file fetches the outlines and draws.
 *
 * ── THE OUTLINES ARE THE ROOM'S OWN ────────────────────────────────────────
 * public/geo/map/nation.json for the states and public/geo/lga/<code>.json for
 * one state's local governments, the same files every map in the room reads,
 * held as promises for the life of the page so a second answer about Kano
 * does not fetch Kano again.
 */

const cache = new Map();
function outlines(url) {
  if (!cache.has(url)) {
    cache.set(
      url,
      fetch(url)
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error(url))))
        .catch((error) => {
          cache.delete(url);
          throw error;
        })
    );
  }
  return cache.get(url);
}

/** The box around some paths, from their own coordinates. */
function boxOf(paths) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of paths) {
    const numbers = d.match(/-?\d+(\.\d+)?/g) ?? [];
    for (let i = 0; i + 1 < numbers.length; i += 2) {
      const x = Number(numbers[i]);
      const y = Number(numbers[i + 1]);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.04;
  return [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2];
}

/* The country behind a regional answer: lighter than any colour in a legend. */
const BACKDROP = "#f3f4f6";

export function AnswerMap({ map }) {
  const [shapes, setShapes] = useState(null);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState(null);
  const frame = useRef(null);
  const url = map.level === "lga" ? `/geo/lga/${map.state}.json` : "/geo/map/nation.json";

  useEffect(() => {
    let live = true;
    outlines(url)
      .then((data) => live && setShapes(data))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [url]);

  /* Each outline with its fill. Local government names are paired with the
     boundary file's own spellings the way the Strongholds map pairs them. */
  const regions = useMemo(() => {
    if (!shapes) return [];
    if (map.level === "state") {
      return shapes.states.map((state) => ({ key: state.code, name: state.name, d: state.d, fill: map.fills[state.code] ?? null }));
    }
    const names = shapes.lgas.map((lga) => lga.name);
    const pairs = matchLgaNames(Object.keys(map.fills), names);
    const byShape = new Map([...pairs.entries()].map(([ours, theirs]) => [theirs, ours]));
    return shapes.lgas.map((lga) => {
      const ours = byShape.get(lga.name);
      return { key: lga.name, name: ours ?? lga.name, d: lga.d, fill: ours ? map.fills[ours] : null };
    });
  }, [shapes, map]);

  /* ── THE WHOLE COUNTRY, ALWAYS ───────────────────────────────────────
     A question about the South is shown on Nigeria, with the South lit and
     the rest drawn faintly behind it — never cropped to a box with its
     neighbours cut in half at the edges. A question about one state shows
     that state's local governments, drawn whole on their own. */
  const viewBox = useMemo(() => {
    if (!shapes) return "0 0 1000 812";
    if (map.level === "state") return `0 0 ${shapes.width ?? 1000} ${shapes.height ?? 812}`;
    return boxOf(regions.map((region) => region.d)).join(" ");
  }, [shapes, regions, map.level]);

  const move = (event, region) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    setHover({ region, x: event.clientX - box.left, y: event.clientY - box.top, width: box.width });
  };

  return (
    <figure className="min-w-0">
      <figcaption className="text-[0.8125rem] font-semibold text-dash-ink">{map.title}</figcaption>
      <div ref={frame} className="relative mt-2" onMouseLeave={() => setHover(null)}>
        {failed ? (
          <p className="py-10 text-center text-[0.8125rem] text-dash-muted">The map could not be drawn just now. The table below carries every figure.</p>
        ) : !shapes ? (
          <div className="aspect-[1000/812] w-full animate-pulse rounded-dash-sm bg-ink-100" aria-hidden="true" />
        ) : (
          <svg viewBox={viewBox} className="h-auto max-h-[26rem] w-full" role="img" aria-label={map.title}>
            {/* The rest of the country first, faint and silent: context, not content. */}
            {regions
              .filter((region) => !region.fill)
              .map((region) => (
                <path key={region.key} d={region.d} fill={BACKDROP} stroke="#ffffff" strokeWidth={0.75} vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />
              ))}
            {regions
              .filter((region) => region.fill)
              .map((region) => (
                <path
                  key={region.key}
                  d={region.d}
                  fill={region.fill.color}
                  stroke="#ffffff"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className={cn("cursor-pointer transition-opacity", hover && hover.region.key !== region.key && "opacity-80")}
                  onMouseMove={(event) => move(event, region)}
                  onMouseLeave={() => setHover(null)}
                >
                  <title>{region.fill.tip}</title>
                </path>
              ))}
            {hover && <path d={hover.region.d} fill="none" stroke="#0c0e14" strokeWidth={1.75} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
          </svg>
        )}
        {hover && (
          <div
            role="status"
            className="pointer-events-none absolute z-10 max-w-[16rem] rounded-dash-sm border border-dash-line bg-white px-2.5 py-1.5 text-[0.75rem] leading-snug text-dash-ink shadow-[0_6px_20px_-8px_rgb(9_20_77/0.35)]"
            style={{ left: Math.min(hover.x + 12, hover.width - 200), top: hover.y + 12 }}
          >
            {hover.region.fill.tip}
          </div>
        )}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1">
        {map.legend.map((entry) => (
          <li key={entry.label} className="flex items-center gap-1.5 text-[0.6875rem] text-dash-muted">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: entry.color }} aria-hidden="true" />
            {entry.label}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[0.6875rem] text-dash-muted/80">
        {map.note ? `${map.note} ` : ""}Boundaries: geoBoundaries (CC BY 4.0).
      </p>
    </figure>
  );
}

/* ══════════════════════════════════════════════════════════════ the chart */

const ROW = 18;
const LABEL = 132;
const RIGHT = 12;
const WIDTH = 560;
const FALL = "#e4013b";
const RISE = "#2943c5";

/**
 * Two runs, one row per place: an open dot where it was, a filled dot where it
 * is, the line between them. Blue where it rose, red where it fell, and the
 * 25% line drawn through every row.
 */
export function Dumbbell({ chart }) {
  const [all, setAll] = useState(false);
  const [hover, setHover] = useState(null);
  const rows = all ? chart.rows : chart.rows.slice(0, 20);
  const { top, ticks } = niceAxis(Math.min(100, Math.max(...chart.rows.flatMap((row) => [row.from, row.to]), chart.line ?? 0)));
  const plot = WIDTH - LABEL - RIGHT;
  const x = (value) => LABEL + (Math.max(0, Math.min(top, value)) / top) * plot;
  const height = rows.length * ROW + 28;

  return (
    <figure className="min-w-0">
      <figcaption className="text-[0.8125rem] font-semibold text-dash-ink">{chart.title}</figcaption>
      <ul className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-[0.6875rem] text-dash-muted">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-ink-400 bg-white" aria-hidden="true" /> {chart.fromLabel}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: RISE }} aria-hidden="true" /> {chart.toLabel}, higher
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: FALL }} aria-hidden="true" /> {chart.toLabel}, lower
        </li>
        {chart.line !== null && (
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-px bg-red-500" aria-hidden="true" /> {chart.line}% line
          </li>
        )}
      </ul>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} className="mt-2 h-auto w-full" role="img" aria-label={chart.title} onMouseLeave={() => setHover(null)}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={x(tick)} x2={x(tick)} y1={4} y2={height - 20} stroke="#edeef1" strokeWidth={1} />
            <text x={x(tick)} y={height - 6} textAnchor="middle" fontSize={10} fill="#6e7278">
              {tick}%
            </text>
          </g>
        ))}
        {chart.line !== null && chart.line <= top && (
          <line x1={x(chart.line)} x2={x(chart.line)} y1={2} y2={height - 20} stroke="#e4013b" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {rows.map((row, index) => {
          const y = 12 + index * ROW;
          const rose = row.to >= row.from;
          const on = hover === index;
          return (
            <g key={`${row.label}-${index}`} onMouseEnter={() => setHover(index)} className="cursor-default">
              <rect x={0} y={y - ROW / 2} width={WIDTH} height={ROW} fill={on ? "#eff3fe" : "transparent"} />
              <text x={LABEL - 8} y={y + 3.5} textAnchor="end" fontSize={11} fill={on ? "#0c0e14" : "#35383e"} fontWeight={on ? 600 : 400}>
                {row.label.length > 20 ? `${row.label.slice(0, 19)}…` : row.label}
              </text>
              <line x1={x(row.from)} x2={x(row.to)} y1={y} y2={y} stroke="#c5c7cd" strokeWidth={2} strokeLinecap="round" />
              <circle cx={x(row.from)} cy={y} r={4} fill="#ffffff" stroke="#95989f" strokeWidth={2} />
              <circle cx={x(row.to)} cy={y} r={4.5} fill={rose ? RISE : FALL} stroke="#ffffff" strokeWidth={1.5} />
              <title>{`${row.label}: ${fmtPct(row.from)} → ${fmtPct(row.to)} (${fmtPts(row.to - row.from)})`}</title>
            </g>
          );
        })}
      </svg>
      {hover !== null && rows[hover] && (
        <p className="mt-1 text-[0.75rem] text-dash-ink" role="status">
          <strong>{rows[hover].label}</strong>: {chart.fromLabel} {fmtPct(rows[hover].from)} → {chart.toLabel} {fmtPct(rows[hover].to)} ({fmtPts(rows[hover].to - rows[hover].from)})
        </p>
      )}
      {chart.rows.length > 20 && (
        <button
          type="button"
          onClick={() => setAll((open) => !open)}
          className="mt-1.5 text-[0.75rem] font-semibold text-blue-700 hover:text-blue-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dash-ink"
        >
          {all ? "Show the first 20" : `Show all ${chart.rows.length}`}
        </button>
      )}
    </figure>
  );
}

/** The map and the chart, side by side where there is room. */
export default function AskVisuals({ visual }) {
  if (!visual?.map && !visual?.chart) return null;
  return (
    <div className={cn("grid gap-5 border-b border-dash-line px-4 py-4 sm:px-5", visual.map && visual.chart && "lg:grid-cols-2")}>
      {visual.map && <AnswerMap map={visual.map} />}
      {visual.chart && <Dumbbell chart={visual.chart} />}
    </div>
  );
}
