/**
 * What colour each party is drawn in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS NOT IN components/dash/Charts.jsx ANY MORE
 *
 *  It lived there, which was reasonable while charts were the only thing that
 *  needed it. Then components/dash/PartyMark.jsx started drawing a party's
 *  mark — its logo where one exists, its colour where one does not — and the
 *  charts wanted to use the mark. Charts importing PartyMark importing Charts
 *  is a cycle, and an ES module cycle resolves to `undefined` at exactly the
 *  wrong moment: the constant is read while the module that defines it is
 *  still initialising, every party comes out with no fill, and the bars draw
 *  black on black.
 *
 *  A shared constant that two components need belongs under neither of them.
 *  Charts still re-exports it, so nothing that imports it today has to change.
 * ══════════════════════════════════════════════════════════════════════════
 */
/** Party fills for a white surface. See the tokens in globals.css. */
export const PARTY_FILL = {
  APC: "var(--color-apc-l)",
  PDP: "var(--color-pdp-l)",
  LP: "var(--color-lp-l)",
  NNPP: "var(--color-nnpp-l)",
  OTH: "var(--color-party-other-l)",
  /* Off-cycle parties. Without these APGA holding Anambra would be drawn
     as "other", which on a governorship map is the one thing that must not
     be grey. */
  APGA: "var(--color-apga-l)",
  SDP: "var(--color-sdp-l)",
  ADC: "var(--color-adc-l)",
  ACCORD: "var(--color-accord-l)",
  APM: "var(--color-apm-l)",
  /* On the ballot rather than only off-cycle: see lib/races.js. It is drawn
     with a dot texture wherever a shape is filled, because its violet and
     APC's blue are the same colour to a protanope. */
  NDC: "var(--color-ndc-l)",
};
