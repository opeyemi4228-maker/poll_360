/**
 * Which parties are drawn with a texture, and which texture.
 *
 * One table, because the answer has to be the same on the public board, on
 * every dashboard map, in the legend beside them and in the swatch on a card.
 * A party that is hatched on the map and flat in the key is worse than one
 * that is flat in both: the reader learns the texture means something and
 * then meets a place where it does not.
 *
 * See components/ui/PartyPatterns.jsx for why these two and not others, and
 * app/globals.css for the measurements.
 */
export const PATTERNED = {
  /* PDP green against LP red: ΔE 3.5 under protanopia. */
  LP: "diagonal",
  /* APC blue against NDC violet: ΔE 3.0 under protanopia. */
  NDC: "dots",
};

/**
 * The fill for a party on a patterned map.
 *
 * Returns a `url(#…)` for the parties that carry a texture and the plain
 * colour for everyone else, so a caller never has to remember which is which.
 *
 * @param code    party id, or null where nothing has reported
 * @param prefix  the map instance's own id prefix
 * @param colour  the flat fill this party would otherwise have
 */
export function partyFill(code, prefix, colour) {
  return code && PATTERNED[code] ? `url(#${prefix}-pattern-${code})` : colour;
}
