"use client";

import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import PartyPatterns from "@/components/ui/PartyPatterns";
import { boundsOf } from "@/lib/bbox";
import { project } from "@/lib/geo";
import { formatShare } from "@/lib/utils";

/**
 * Wards and polling units, as a map of the place they are actually in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PROBLEM THIS SOLVES, AND THE ONE IT REFUSES TO SOLVE BY LYING
 *
 *  Nigeria has 8,809 wards and 176,623 polling units, and no boundary file
 *  exists for any of them. INEC does not publish ward geometry, and a polling
 *  unit is a table under a tree with a name, not a shape. So the two deepest
 *  levels of this product used to be a grid of boxes: honest, and flat, and
 *  the point at which a map stopped being a map.
 *
 *  The dishonest fix is easy and tempting: scatter the units across the local
 *  government at plausible-looking positions and draw boundaries between
 *  them. It would look like a survey and every line on it would be invented —
 *  worse than the boxes, because a box claims nothing and a boundary claims a
 *  jurisdiction. On a screen where somebody decides which booths to staff, an
 *  invented coordinate is not a graphic flourish, it is a wrong address.
 *
 *  So this draws two genuinely different things and never blends them:
 *
 *    MEASURED   A booth that has reported a real position — an agent's phone
 *               at the booth — is a seed at that position, and its cell is a
 *               true catchment: every point on the map nearer to this booth
 *               than to any other. Its coordinate is readable in the panel.
 *
 *    PLACED     Every other place is a seed on a hexagonal lattice inside the
 *               real outline of the local government. The outline is real and
 *               the tessellation fills it honestly; which cell is which is
 *               not geography, and the frame says so in words.
 *
 *  The result is a map that resolves as the night does: it opens as an even
 *  honeycomb in the true shape of the place and, return by return, cells snap
 *  to the booths that have said where they are.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY A TESSELLATION AND NOT TILES IN A GRID ─────────────────────────────
 * A grid of tiles inside an outline is still a grid; it reads as a chart that
 * has been given a fancy border. Cells that share edges and fill the shape
 * read as a map, which is what this level of the product is for. Hexagonal
 * seeding rather than square is the same reason a hex cartogram exists: six
 * neighbours instead of four, no long straight seams across the country, and
 * nothing that looks like the rectangles this replaced.
 *
 * ── HOW IT IS BUILT, WITH NO GEOMETRY LIBRARY ──────────────────────────────
 * Two browser facilities do the work that would otherwise need one.
 *
 *   1. `isPointInFill` decides which lattice points are inside the outline.
 *      It is the same test the browser uses for hit detection, so the answer
 *      is exactly the shape the reader can see.
 *   2. A `clipPath` of the outline crops the finished cells. Voronoi cells are
 *      convex and easy to build by half-plane clipping; cropping them to a
 *      concave coastline is not, and the renderer already does it perfectly.
 *
 * Each cell is the bounding box clipped by the perpendicular bisector between
 * its seed and every other seed — Sutherland–Hodgman, which stays exact
 * because clipping a convex polygon by a half-plane leaves a convex polygon.
 * That is O(n²) in seeds, and n is a ward's booths or a local government's
 * wards: tens, not thousands.
 */

/** Lattice resolutions across the frame, coarsest first. */
const GRIDS = [6, 8, 11, 15, 20, 27, 36, 48, 64, 84];

/* Five steps, opacity only, on the same convention every other map here
   follows: one hue, and more is darker. */
const RAMP = [0.18, 0.34, 0.54, 0.76, 1];

/** Clip a convex polygon to the half-plane of points nearer `a` than `b`. */
function bisect(polygon, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  /* Positive on `a`'s side of the bisector. */
  const side = (p) => (mx - p[0]) * dx + (my - p[1]) * dy;

  const out = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const here = side(current);
    const there = side(next);

    if (here >= 0) out.push(current);
    if ((here >= 0) !== (there >= 0)) {
      const t = here / (here - there);
      out.push([current[0] + (next[0] - current[0]) * t, current[1] + (next[1] - current[1]) * t]);
    }
  }
  return out;
}

/** Every seed's cell, as a path string. */
function tessellate(seeds, box) {
  const frame = [
    [box.x, box.y],
    [box.x + box.width, box.y],
    [box.x + box.width, box.y + box.height],
    [box.x, box.y + box.height],
  ];

  return seeds.map((seed, index) => {
    let cell = frame;
    for (let other = 0; other < seeds.length && cell.length; other += 1) {
      if (other === index) continue;
      cell = bisect(cell, seed, seeds[other]);
    }
    if (!cell.length) return null;
    return `M${cell.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join("L")}Z`;
  });
}

export default function UnitMap({
  /** Path strings of the real place these rows sit inside. */
  outline = [],
  /**
   * [{ key, name, value, note, fix, paint }]
   *
   * `paint` is `{ fill, opacity }` where the caller has already decided what
   * colour this place is — on the results layer that is the party that carried
   * it, drawn exactly as the choropleth above draws its states, so a ward and
   * the country it is in are never two different colour languages for the same
   * fact. Where it is absent the cell falls back to the single-hue ramp, which
   * is what a magnitude layer wants.
   */
  rows = [],
  tint = "var(--color-red-500)",
  hovered = null,
  picked = null,
  onHover,
  onOpen,
  /** What one row is: "ward", "polling unit". */
  childWord = "polling unit",
  /** The place the outline draws, named in the caption. */
  parentLabel,
}) {
  const clipId = useId();
  const frame = useMemo(() => (outline.length ? boundsOf(outline) : null), [outline]);

  /* Measured and placed are counted apart everywhere, including here: the
     caption says how many of each, and only the placed ones need a lattice
     point found for them. */
  const [fixed, placed] = useMemo(() => {
    const withFix = [];
    const without = [];
    for (const row of rows) {
      if (row.fix && Number.isFinite(row.fix.lat) && Number.isFinite(row.fix.lon)) withFix.push(row);
      else without.push(row);
    }
    return [withFix, without];
  }, [rows]);

  const top = useMemo(() => Math.max(...rows.map((row) => row.value ?? 0), 1), [rows]);

  const svg = useRef(null);
  const [lattice, setLattice] = useState(null);

  /**
   * Where the placed seeds go.
   *
   * Runs in the browser because `isPointInFill` is a question about a rendered
   * path, and as a layout effect because cells appearing a frame after the
   * outline reads as the map flickering rather than as the map drawing.
   *
   * Coarsest lattice first, stopping at the first that holds every row, which
   * keeps cells as large as the shape allows. A long thin local government
   * needs a finer lattice than a round one of the same area, and nothing here
   * has to know which it is looking at.
   */
  useLayoutEffect(() => {
    const node = svg.current;
    if (!node || !frame || !placed.length) {
      setLattice(null);
      return;
    }

    const shapes = [...node.querySelectorAll("path[data-outline]")];
    if (!shapes.length) {
      setLattice(null);
      return;
    }

    const point = node.createSVGPoint();
    const inside = (x, y) => {
      point.x = x;
      point.y = y;
      return shapes.some((shape) => shape.isPointInFill(point));
    };

    let best = null;

    for (const resolution of GRIDS) {
      const step = frame.width / resolution;
      /* Hexagonal rather than square: rows half a step apart horizontally and
         at √3/2 of the step vertically is the lattice whose Voronoi cells are
         regular hexagons. */
      const rise = step * 0.866;
      const found = [];
      let row = 0;
      for (let y = frame.y + rise / 2; y < frame.y + frame.height; y += rise, row += 1) {
        const offset = row % 2 ? step / 2 : 0;
        for (let x = frame.x + offset + step / 2; x < frame.x + frame.width; x += step) {
          if (inside(x, y)) found.push([x, y]);
        }
      }
      best = { points: found, step };
      if (found.length >= placed.length) break;
    }

    if (!best?.points.length) {
      setLattice(null);
      return;
    }

    /* Spread across the whole shape rather than filling from the top: taking
       the first N of the reading order piles every cell into the northern
       third of a place whose lattice had room to spare. */
    const { points, step } = best;
    const seeds = placed.map(
      (_, index) => points[Math.min(points.length - 1, Math.round((index * points.length) / placed.length))]
    );

    setLattice({ seeds, step });
  }, [frame, placed]);

  /* Seeds in one list, measured first, so a cell index maps straight back to
     a row and the tessellation does not care which kind a seed is. */
  const cells = useMemo(() => {
    if (!frame) return null;
    const measured = fixed.map((row) => project(row.fix.lon, row.fix.lat));
    const rest = lattice?.seeds ?? [];
    if (!measured.length && !rest.length) return null;

    const seeds = [...measured, ...rest];
    const paths = tessellate(seeds, frame);

    return [...fixed, ...placed].map((row, index) => ({
      row,
      d: paths[index],
      seed: seeds[index],
      measured: index < measured.length,
    }));
  }, [frame, fixed, placed, lattice]);

  if (!frame) return null;

  const shade = (value) => {
    const strength = (value ?? 0) / top;
    const step = RAMP.findIndex((edge) => strength <= edge);
    return Math.max(0.14, RAMP[step === -1 ? RAMP.length - 1 : step]);
  };

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svg}
        viewBox={frame.viewBox}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${rows.length} ${childWord}s in ${parentLabel ?? "this place"}. ${
          fixed.length
            ? `${fixed.length} drawn at a reported position.`
            : "None has reported a position yet."
        } The same list appears beside this map.`}
        onPointerLeave={() => onHover?.(null)}
      >
        <defs>
          {/* So a caller may hand back a patterned party fill. LP's red and
              PDP's green are the same tone to a protanope; the hatch is what
              separates them, and it has to exist in this document to be
              referenced from it. See lib/party-pattern.js. */}
          <PartyPatterns prefix="unit" surface="light" />
          <clipPath id={clipId}>
            {outline.map((d, index) => (
              <path key={index} d={d} />
            ))}
          </clipPath>
        </defs>

        {/* The real boundary, drawn first as the ground and kept in the
            document because it is also what the lattice is measured against
            and what the cells above are cropped to. */}
        {outline.map((d, index) => (
          <path
            key={index}
            d={d}
            data-outline=""
            fill="var(--color-board-raised)"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={frame.width * 0.002}
            strokeLinejoin="round"
          />
        ))}

        <g clipPath={`url(#${clipId})`}>
          {cells?.map(({ row, d, measured }) => {
            if (!d) return null;
            const active = hovered === row.key || picked === row.key;

            return (
              <path
                key={row.key}
                d={d}
                role="button"
                tabIndex={0}
                aria-label={`${row.name}${row.note ? `, ${row.note}` : ""}${
                  measured ? ", at a reported position" : ""
                }`}
                fill={row.paint?.fill ?? tint}
                fillOpacity={row.paint ? (row.paint.opacity ?? 1) : shade(row.value)}
                stroke={active ? "#ffffff" : "var(--color-board)"}
                strokeWidth={frame.width * (active ? 0.004 : 0.0016)}
                strokeLinejoin="round"
                className="cursor-pointer focus:outline-none"
                onPointerEnter={() => onHover?.(row.key)}
                onFocus={() => onHover?.(row.key)}
                /* The event travels with the row: the map above counts taps
                   to tell "settle" from "open" from "take back out", and it
                   cannot do that without knowing when and where each one
                   landed. See countTap in PlanningMap. */
                onClick={(event) => onOpen?.(row, event)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  onOpen?.(row, event);
                }}
              />
            );
          })}
        </g>

        {/* ── THE BOOTHS THAT SAID WHERE THEY ARE ────────────────────────
            Drawn over their own cell and ringed in white. A cell tells you
            how the place voted; this dot is the separate and much rarer fact
            that somebody stood there with a phone and the coordinate is
            measured rather than assumed. It has to survive being seen from
            across a room, so it is a shape and not a shade. */}
        {cells
          ?.filter((cell) => cell.measured)
          .map(({ row, seed }) => (
            <g key={`fix-${row.key}`} className="pointer-events-none">
              <circle
                cx={seed[0]}
                cy={seed[1]}
                r={frame.width * 0.009}
                fill="#ffffff"
                fillOpacity={0.92}
              />
              <circle
                cx={seed[0]}
                cy={seed[1]}
                r={frame.width * 0.017}
                fill="none"
                stroke="#ffffff"
                strokeOpacity={0.55}
                strokeWidth={frame.width * 0.0022}
              />
            </g>
          ))}
      </svg>

      {/* ── THE CAPTION IS PART OF THE DRAWING ────────────────────────────
          Not a footnote elsewhere on the page. Anybody who can see the cells
          can see the sentence saying what a cell's position means, because
          the two are one graphic and separating them is how a diagram turns
          into a claim. */}
      <p className="pointer-events-none absolute inset-x-3 bottom-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.625rem] leading-tight text-white/45">
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-white ring-2 ring-white/40"
          />
          {fixed.length} at a reported position
        </span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2"
            style={{ background: tint, opacity: 0.8, clipPath: "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)" }}
          />
          {placed.length} placed inside {parentLabel ?? "the outline"} — cells fill the shape, they
          are not where the {childWord} is
        </span>
      </p>
    </div>
  );
}

/** The ramp's steps, for a legend drawn beside one of these. */
export function unitRamp(top) {
  return RAMP.map((step) => ({ opacity: step, label: formatShare(step * top) }));
}

/** A coordinate, written the way a room reads one out. */
export function latLon(fix) {
  if (!fix || !Number.isFinite(fix.lat) || !Number.isFinite(fix.lon)) return null;
  return `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`;
}

export { RAMP as UNIT_RAMP };
