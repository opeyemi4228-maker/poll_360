"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, Minus, Plus, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The room's map, as an instrument a person works with their hands.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IT DOES THAT A PICTURE DOES NOT
 *
 *  · Points: move over a place and a card follows the pointer with its name,
 *    its light and every figure behind it. No waiting for a browser tooltip.
 *  · Opens: press a state and the map goes into it, to its local
 *    governments, while every panel on the page narrows to the same place.
 *    The map dims and names where it is going until the new figures land.
 *  · Changes its question: the control in its header recolours the same map
 *    by another measure (the light, how much is in, turnout, what is open)
 *    at once, with no round trip, and the legend follows.
 *  · Moves: zoom with the buttons, a pinch or a double press, and drag when
 *    zoomed. One press returns it.
 *  · Is live: when a place's colour changes under the reader, it flashes
 *    once, so a change is seen and not merely present.
 *
 *  Everything it draws arrives from the server already narrowed to the
 *  reader's ground. It decides nothing about who may see what.
 * ══════════════════════════════════════════════════════════════════════════
 */
const INK = { RED: "#ff4d4d", YELLOW: "#ffd21f", GREEN: "#2fd67b", GREY: "#56608a" };
const MARK = { RED: "✖", YELLOW: "▲", GREEN: "✔", GREY: "○" };

export default function LiveMap({ shapes, box, layers, title, hint, up = null, still = false, inside = false, footnote = null, tall = false }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [going, setGoing] = useState(null);
  const [layerId, setLayerId] = useState(layers[0].id);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(null);
  const [armed, setArmed] = useState(false);
  const frame = useRef(null);
  const drag = useRef(null);

  const layer = layers.find((each) => each.id === layerId) ?? layers[0];
  const seen = view ?? box;
  const zoomed = Boolean(view);
  const unit = box.w / 1000;

  /* A place flashes when its colour changes, but not on the first paint:
     a whole map flashing as it opens says nothing. */
  useEffect(() => {
    const timer = setTimeout(() => setArmed(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const open = (shape) => {
    if (still || !shape.href) return;
    setGoing(shape.name);
    setView(null);
    start(() => router.push(shape.href, { scroll: false }));
  };

  const zoom = (factor, at = null) => {
    const cx = at?.x ?? seen.x + seen.w / 2;
    const cy = at?.y ?? seen.y + seen.h / 2;
    const w = Math.min(box.w, Math.max(box.w / 12, seen.w * factor));
    const h = (w / box.w) * box.h;
    if (w >= box.w) return setView(null);
    const x = Math.min(box.x + box.w - w, Math.max(box.x, cx - ((cx - seen.x) / seen.w) * w));
    const y = Math.min(box.y + box.h - h, Math.max(box.y, cy - ((cy - seen.y) / seen.h) * h));
    setView({ x, y, w, h });
  };

  const pointOf = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scale = Math.max(seen.w / rect.width, seen.h / rect.height);
    const left = (rect.width - seen.w / scale) / 2;
    const top = (rect.height - seen.h / scale) / 2;
    return { x: seen.x + (event.clientX - rect.left - left) * scale, y: seen.y + (event.clientY - rect.top - top) * scale, scale };
  };

  const point = (code, event) => {
    const svg = event.currentTarget.ownerSVGElement;
    const rect = svg.getBoundingClientRect();
    setHover({ code, x: event.clientX - rect.left, y: event.clientY - rect.top, wide: rect.width, tall: rect.height });
  };

  const fullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.current?.requestFullscreen?.();
  };

  const labelled = shapes
    .filter((shape) => layer.paint[shape.code] && (layer.paint[shape.code].tone === "RED" || layer.paint[shape.code].tone === "YELLOW" || layer.paint[shape.code].show))
    .slice(0, inside ? 30 : 16);
  const tally = { RED: 0, YELLOW: 0, GREEN: 0, GREY: 0 };
  for (const shape of shapes) if (layer.paint[shape.code]) tally[layer.paint[shape.code].tone] += 1;
  const busy = pending && going;

  return (
    <section ref={frame} className="group/map overflow-hidden rounded-dash bg-[#090c17] text-white" aria-label={`Map of ${title}`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-white/10 px-5 py-3">
        <h2 className="flex items-center gap-2 text-[0.9375rem] font-bold">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#2fd67b] opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-[#2fd67b]" />
          </span>
          {title}
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-[0.8125rem]">
          {up && !still && (
            <button type="button" onClick={() => open({ name: up.name, href: up.href })} className="rounded-full border border-white/15 px-3 py-1.5 font-semibold text-white/85 hover:border-white/40">
              ← {up.name}
            </button>
          )}
          {layers.length > 1 ? (
            <div role="tablist" aria-label="What the map shows" className="flex rounded-full border border-white/15 p-0.5">
              {layers.map((each) => (
                <button key={each.id} type="button" role="tab" aria-selected={each.id === layer.id} onClick={() => setLayerId(each.id)} className={cn("rounded-full px-3 py-1 font-semibold whitespace-nowrap", each.id === layer.id ? "bg-white text-[#090c17]" : "text-white/70 hover:text-white")}>
                  {each.name}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-white/50">{hint}</span>
          )}
        </div>
      </header>

      <div className="relative" style={{ height: tall ? "min(78vh, 60rem)" : "clamp(20rem, 64vh, 46rem)" }}>
        <svg
          viewBox={`${seen.x} ${seen.y} ${seen.w} ${seen.h}`}
          preserveAspectRatio="xMidYMid meet"
          className={cn("size-full touch-none select-none transition-opacity duration-200", busy && "opacity-35", zoomed ? "cursor-grab active:cursor-grabbing" : "")}
          role="img"
          aria-label={`Map of ${title}, coloured by ${layer.name.toLowerCase()}`}
          onDoubleClick={(event) => zoom(0.5, pointOf(event))}
          onWheel={(event) => {
            /* Only a pinch or a held key zooms. A plain wheel scrolls the page,
               as it should when the pointer merely happens to be over the map. */
            if (!event.ctrlKey && !event.metaKey) return;
            zoom(event.deltaY > 0 ? 1.25 : 0.8, pointOf(event));
          }}
          onPointerDown={(event) => {
            if (!zoomed) return;
            drag.current = { x: event.clientX, y: event.clientY, view: seen, moved: false };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const scale = Math.max(seen.w / rect.width, seen.h / rect.height);
            const dx = (event.clientX - drag.current.x) * scale;
            const dy = (event.clientY - drag.current.y) * scale;
            if (Math.abs(dx) + Math.abs(dy) > 3 * scale) drag.current.moved = true;
            const from = drag.current.view;
            setView({ ...from, x: Math.min(box.x + box.w - from.w, Math.max(box.x, from.x - dx)), y: Math.min(box.y + box.h - from.h, Math.max(box.y, from.y - dy)) });
          }}
          onPointerUp={() => {
            /* Left for the click that follows to read, then cleared. */
            setTimeout(() => (drag.current = null), 0);
          }}
        >
          <defs>
            <pattern id="room-grid" width={40 * unit} height={40 * unit} patternUnits="userSpaceOnUse">
              <path d={`M ${40 * unit} 0 L 0 0 0 ${40 * unit}`} fill="none" stroke="#ffffff" strokeOpacity="0.035" strokeWidth={unit} />
            </pattern>
            {Object.entries(INK).map(([tone, ink]) => {
              const size = (tone === "GREY" ? 9 : 7) * unit;
              return (
                <pattern key={tone} id={`room-dots-${tone}`} width={size} height={size} patternUnits="userSpaceOnUse">
                  <rect width={size} height={size} fill="#090c17" />
                  {tone === "YELLOW" ? (
                    <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill="none" stroke={ink} strokeWidth={size * 0.2} />
                  ) : tone === "GREY" ? (
                    <circle cx={size / 2} cy={size / 2} r={size * 0.2} fill={ink} />
                  ) : tone === "GREEN" ? (
                    <circle cx={size / 2} cy={size / 2} r={size * 0.3} fill={ink} />
                  ) : (
                    <rect x={size * 0.12} y={size * 0.12} width={size * 0.76} height={size * 0.76} rx={size * 0.2} fill={ink} />
                  )}
                </pattern>
              );
            })}
          </defs>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="url(#room-grid)" />

          {shapes.map((shape) => {
            const paint = layer.paint[shape.code];
            const active = hover?.code === shape.code;
            return (
              <path
                key={`${shape.code ?? shape.name}:${paint?.tone ?? "none"}`}
                d={shape.d}
                fill={paint ? `url(#room-dots-${paint.tone})` : "#0e1220"}
                stroke={active ? "#ffffff" : paint ? (paint.tone === "GREY" ? "#2c3454" : "#090c17") : "#1b2136"}
                strokeWidth={(active ? 3 : inside ? 1.2 : 2) * unit}
                strokeLinejoin="round"
                opacity={paint ? 1 : 0.55}
                tabIndex={paint && !still ? 0 : undefined}
                role={paint && !still ? "link" : undefined}
                aria-label={paint ? `${shape.name}: ${paint.says}` : `${shape.name}: not on your ground`}
                className={cn("outline-none transition-[stroke] duration-100", paint && !still && "cursor-pointer", armed && paint && "room-flash")}
                onPointerEnter={(event) => paint && point(shape.code, event)}
                onPointerMove={(event) => paint && point(shape.code, event)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => paint && setHover({ code: shape.code, x: 24, y: 24, wide: 9999 })}
                onBlur={() => setHover(null)}
                onClick={() => !drag.current?.moved && paint && open(shape)}
                onKeyDown={(event) => (event.key === "Enter" || event.key === " ") && paint && open(shape)}
              />
            );
          })}

          {labelled.map((shape) => {
            const paint = layer.paint[shape.code];
            const k = unit * (inside ? 1.9 : 1) * Math.max(0.45, seen.w / box.w);
            const text = inside ? shape.name : (shape.short ?? shape.name);
            const w = Math.max(inside ? text.length * 8.4 + 18 : 96, String(paint.label).length * 8.6 + 34) * k;
            const h = 38 * k;
            const [x, y] = shape.centre;
            return (
              <g key={`label-${shape.code}`} pointerEvents="none">
                <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={5 * k} fill="#11131c" fillOpacity="0.92" stroke={INK[paint.tone]} strokeWidth={1.2 * k} />
                <text x={x} y={y - 3 * k} textAnchor="middle" fontSize={10.5 * k} fontWeight="600" fill="#ffffff" fillOpacity="0.75" style={{ textTransform: "uppercase", letterSpacing: `${0.4 * k}px` }}>{text}</text>
                <text x={x} y={y + 12 * k} textAnchor="middle" fontSize={13 * k} fontWeight="800" fill={INK[paint.tone]}>{MARK[paint.tone]} {paint.label}</text>
              </g>
            );
          })}
        </svg>

        {/* The card that follows the pointer. */}
        {hover && layer.paint[hover.code] && (() => {
          const shape = shapes.find((each) => each.code === hover.code);
          const paint = layer.paint[hover.code];
          const flip = hover.x > hover.wide - 280;
          return (
            <div className="pointer-events-none absolute z-10 w-64 rounded-xl border border-white/15 bg-[#11131c]/95 p-3 shadow-2xl" style={{ left: flip ? hover.x - 272 : hover.x + 16, top: Math.max(8, Math.min(hover.y - 20, (hover.tall ?? 9999) - 230)) }} role="status">
              <p className="flex items-center justify-between gap-2 text-[0.9375rem] font-bold">
                {shape?.name}
                <span style={{ color: INK[paint.tone] }}>{MARK[paint.tone]}</span>
              </p>
              <p className="text-[0.8125rem] font-semibold" style={{ color: paint.tone === "GREY" ? "#9aa3c0" : INK[paint.tone] }}>{paint.says}</p>
              <dl className="mt-2 space-y-1 text-[0.8125rem]">
                {(paint.facts ?? []).map(([name, value]) => (
                  <div key={name} className="flex justify-between gap-3">
                    <dt className="text-white/55">{name}</dt>
                    <dd className="font-semibold tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              {!still && shape?.href && <p className="mt-2 text-[0.75rem] text-white/45">Press to open {shape.name}</p>}
            </div>
          );
        })()}

        {busy && (
          <p className="absolute inset-0 flex items-center justify-center text-[1rem] font-bold" role="status">
            <span className="rounded-full bg-white px-4 py-2 text-[#090c17]">Opening {going}…</span>
          </p>
        )}

        <div className="absolute right-3 bottom-3 flex flex-col gap-1">
          <Tool name="Zoom in" onClick={() => zoom(0.6)}><Plus size={16} /></Tool>
          <Tool name="Zoom out" onClick={() => zoom(1.6)}><Minus size={16} /></Tool>
          <Tool name="Whole map" onClick={() => setView(null)}><RotateCcw size={16} /></Tool>
          <Tool name="Full screen" onClick={fullScreen}><Maximize2 size={16} /></Tool>
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-white/10 px-5 py-3 text-[0.8125rem] font-semibold">
        {["RED", "YELLOW", "GREEN", "GREY"].filter((tone) => layer.legend[tone]).map((tone) => (
          <span key={tone} className="inline-flex items-center gap-1.5" style={{ color: tone === "GREY" ? "#9aa3c0" : INK[tone] }}>
            {MARK[tone]} {layer.legend[tone]}
            <span className="tabular-nums text-white/60">{tally[tone]}</span>
          </span>
        ))}
        {footnote && <span className="text-white/45">{footnote}</span>}
      </footer>
    </section>
  );
}

function Tool({ name, onClick, children }) {
  return (
    <button type="button" onClick={onClick} aria-label={name} title={name} className="flex size-9 items-center justify-center rounded-lg border border-white/15 bg-[#11131c]/90 text-white/80 hover:border-white/40 hover:text-white">
      {children}
    </button>
  );
}
