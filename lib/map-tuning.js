/**
 * How each map layer should be drawn on a real basemap.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A TABLE AND NOT THREE COPIES OF A COMPONENT
 *
 *  Voters, turnout and clusters are not the same kind of quantity, and drawing
 *  them the same way is how a dashboard misleads without stating a single
 *  false figure. The differences between them are decisions, they are
 *  arguable, and an arguable decision belongs somewhere it can be read and
 *  tested rather than buried in a render.
 *
 *  The colours are literals because they are handed to Google's own canvas,
 *  outside this product's stylesheet, where a CSS custom property resolves to
 *  nothing at all.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * What each layer is, and how it should be drawn.
 *
 * Literal colours because this renders through Google's own canvas, outside
 * our stylesheet, where a CSS custom property resolves to nothing.
 */
export const TUNING = {
  register: {
    title: "Registered voters",
    caption: "Where the entitled voters are. The field is a mass, so it spreads.",
    ramp: ["#0b2e4f", "#12507f", "#1b74b0", "#2f9bd8", "#6dc5f0"],
    field: { radius: 62, opacity: 0.55 },
    /* Everybody is on the register, so a place with a tenth of the largest
       register still holds hundreds of thousands of people and should not
       vanish. The floor keeps small states legible. */
    floor: 0.18,
    centres: false,
    unit: "registered",
  },
  turnout: {
    title: "Turnout",
    caption: "A rate, not a quantity — so there is no density field on this layer.",
    ramp: ["#3f2d12", "#6b4a15", "#9c7018", "#c99a1e", "#f5c542"],
    /* No field. Adding one state's percentage to its neighbour's is not a
       measurement of anything. */
    field: null,
    floor: 0.12,
    centres: false,
    unit: "turnout",
  },
  density: {
    title: "Voters per polling unit",
    caption: "Crowding, over what is physically there. Markets are pinned, because that is usually the answer.",
    ramp: ["#3d1508", "#70240c", "#a33413", "#d1471a", "#f97316"],
    /* Tight, because crowding is a local fact and a wide blur turns it into a
       regional one. */
    field: { radius: 38, opacity: 0.7 },
    floor: 0.12,
    centres: true,
    unit: "per unit",
  },
};

export const tuningFor = (layer) => TUNING[layer] ?? TUNING.register;
