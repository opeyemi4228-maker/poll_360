import { PATTERNED } from "@/lib/party-pattern";

/**
 * The textures that carry the parties colour cannot separate.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A PARTY NEEDS A PATTERN AT ALL
 *
 *  Two pairs in this palette are invisible to the commonest forms of colour
 *  blindness, and neither is fixable by choosing a better hex:
 *
 *    PDP green / LP red    ΔE 3.5 under protanopia
 *    APC blue / NDC violet ΔE 3.0 under protanopia
 *
 *  The first is a property of the Nigerian party colours: separating the two
 *  by lightness immediately collapses LP against NNPP, because LP sits
 *  between the two greens. The second is a property of violet — it is blue
 *  plus red, and taking the red channel away leaves blue. A full search of
 *  the gamut for an eleventh fill that clears every existing one on both
 *  surfaces returned five candidates, all pale blue-violets separated from
 *  APC by lightness alone, which trades a machine failure for a human one:
 *  nobody reads "light blue" and "blue" as two parties across a room.
 *
 *  So the failing member of each pair carries a texture as well as a colour,
 *  and the pair becomes separable for every reader, in print, in greyscale
 *  and under forced colours.
 *
 * ── WHY THIS IS ONE FILE AND NOT SIX ──────────────────────────────────────
 *  It was six. Every map defined its own <pattern> and then decided which
 *  party got it in its own way — some tested a `hatch` flag on the party,
 *  others compared the code against the string "LP". Adding a second
 *  patterned party to that meant six edits in six dialects, and the failure
 *  mode of missing one is silent: a map that draws NDC as a flat violet
 *  looks completely fine to anybody who can see the difference.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every map needs its own copy of the defs with its own `prefix`, because SVG
 * ids are document-global and two maps on one page would otherwise share — and
 * silently take the first one's colours.
 *
 * @param prefix   unique per map instance, e.g. "scope", "room"
 * @param surface  "board" for the near-black board, "light" for the dashboard
 */
export default function PartyPatterns({ prefix, surface = "board" }) {
  const suffix = surface === "light" ? "-l" : "";
  /* The rule is drawn in white on the board and on paper alike: it reads as a
     texture over the party's own colour rather than as a second colour, which
     is the point — a hatched LP must still be unmistakably LP. */
  const ink = surface === "light" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.42)";

  return (
    <>
      {Object.entries(PATTERNED).map(([id, kind]) => {
        const fill = `var(--color-${id.toLowerCase()}${suffix})`;

        if (kind === "dots") {
          return (
            <pattern
              key={id}
              id={`${prefix}-pattern-${id}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
            >
              <rect width="6" height="6" fill={fill} />
              {/* Offset rows rather than a square grid: a grid at this size
                  moirés against the state outlines and reads as noise. */}
              <circle cx="1.5" cy="1.5" r="1.15" fill={ink} />
              <circle cx="4.5" cy="4.5" r="1.15" fill={ink} />
            </pattern>
          );
        }

        return (
          <pattern
            key={id}
            id={`${prefix}-pattern-${id}`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" fill={fill} />
            <line x1="0" y1="0" x2="0" y2="6" stroke={ink} strokeWidth="2" />
          </pattern>
        );
      })}
    </>
  );
}
