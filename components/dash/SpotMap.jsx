/**
 * The spot a picture was taken, drawn on its state.
 *
 * The state is cut into its local governments, the one the point falls in is
 * filled, and the point itself is the red mark. Faint marks are the other
 * sheets of the same election, where there are any to show: a sheet taken
 * where forty others were taken is a collation centre, and a sheet taken
 * alone in the next state is something else.
 *
 * No hooks and no data fetching, so the same drawing serves a page rendered
 * on the server and a result that arrives in the browser. `map` is built by
 * `spotMap` in lib/place.js.
 */
export default function SpotMap({ map, className }) {
  if (!map) return null;

  const [x, y, width, height] = map.box;
  /* Sizes are in the map's own units, so the marks stay the same size on a
     small state and a large one. */
  const unit = Math.max(width, height) / 100;

  return (
    <figure className={className}>
      <svg
        viewBox={`${x} ${y} ${width} ${height}`}
        role="img"
        aria-label={`Map of ${map.state}${map.pin ? " with the spot marked" : ""}${map.lga ? `, ${map.lga} shaded` : ""}.`}
        className="block max-h-[26rem] w-full rounded-dash-sm border border-dash-line bg-dash-bg"
      >
        {map.shapes.map((shape) => (
          <path
            key={shape.name}
            d={shape.d}
            fillRule="evenodd"
            className={shape.here ? "fill-red-100 stroke-red-400" : "fill-white stroke-dash-line"}
            strokeWidth={unit * 0.25}
            strokeLinejoin="round"
          >
            <title>{shape.name}</title>
          </path>
        ))}

        {/* Every local government is named, small enough to sit inside it. */}
        {map.shapes.map((shape) =>
          shape.at ? (
            <text
              key={`name-${shape.name}`}
              x={shape.at[0]}
              y={shape.at[1]}
              textAnchor="middle"
              fontSize={unit * (shape.here ? 2.3 : 1.7)}
              className={shape.here ? "fill-red-900 font-bold" : "fill-dash-muted"}
              pointerEvents="none"
            >
              {shape.name}
            </text>
          ) : null
        )}

        {map.others.map(([px, py], index) => (
          <circle key={index} cx={px} cy={py} r={unit * 0.7} className="fill-dash-ink" opacity="0.28" />
        ))}

        {map.pin && (
          <>
            <circle cx={map.pin[0]} cy={map.pin[1]} r={unit * 3.2} className="fill-red-500" opacity="0.18" />
            <circle cx={map.pin[0]} cy={map.pin[1]} r={unit * 1.3} className="fill-red-600 stroke-white" strokeWidth={unit * 0.45} />
          </>
        )}
      </svg>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-dash-muted">
        {map.pin && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-red-600" /> where this picture was taken
          </span>
        )}
        {map.lga && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 border border-red-400 bg-red-100" /> {map.lga}
          </span>
        )}
        {map.others.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full bg-dash-ink opacity-30" /> where the election&rsquo;s other
            sheets were taken
          </span>
        )}
        <span>{map.state} State, by local government</span>
      </figcaption>
    </figure>
  );
}
