import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ballotFor } from "../lib/races.js";

/**
 * The premise behind a bug that drew a live map blank.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT WENT WRONG
 *
 *  `snapshot` in lib/replay.js decided whether a state had a leader worth
 *  colouring with `leader.party < 4` — the presidential four, with the
 *  `others` bucket at index 4. True of the 2023 replay that function was
 *  written for. False of every live board.
 *
 *  The live presidential ballot is nineteen slots in alphabetical order. APC
 *  is 5, LP is 10, NDC is 11, NNPP is 12, PDP is 13, SDP is 15. Every one of
 *  those is `>= 4`, so on a live count every state led by any of them was
 *  reported as "leading unknown" and drawn grey. The map was blank on the one
 *  night it exists for, and nothing failed, logged, or looked broken.
 *
 *  It is fixed by finding the bucket by its id instead of its position.
 *
 *  ── WHY THIS TESTS THE BALLOT AND NOT `snapshot` ────────────────────────
 *  Because `snapshot` cannot be imported here. lib/replay.js line 1 is
 *  `import nation from "@/public/geo/map/nation.json"`, and the `@/` alias is
 *  resolved by the bundler, not by node — so the module cannot be loaded by
 *  `node --test`, which is the whole test harness this product deliberately
 *  runs on (see the note in package.json about needing nothing installed on
 *  the morning of an election). That is why this file has no sibling: none of
 *  the board's assembly has ever been unit-tested.
 *
 *  Making it testable is a two-line change — a relative path plus a
 *  `with { type: "json" }` attribute, which node requires and which this
 *  build has not been verified against. It is worth doing, and it is not
 *  worth doing blind.
 *
 *  So what is pinned here is the premise: that the ballot is wide and that
 *  the parties which can paint a state sit past any small fixed cutoff. Any
 *  positional assumption about party indices is wrong, and this file is where
 *  that is written down.
 * ══════════════════════════════════════════════════════════════════════════
 */

describe("the live presidential ballot", () => {
  const ballot = ballotFor("PRESIDENTIAL");
  const indexOf = (id) => ballot.findIndex((party) => party.id === id);

  it("is far wider than the presidential four", () => {
    assert.ok(
      ballot.length > 5,
      `a positional cutoff assumes a short ballot; this one is ${ballot.length} slots`
    );
  });

  it("keeps the bucket last, which is the only stable thing about its position", () => {
    assert.equal(ballot.at(-1).id, "OTH");
  });

  it("puts every party that can paint a state past a cutoff of four", () => {
    /* The exact parties the bug hid. If a future change reintroduces a
       positional test, this list is the evidence of what it costs. */
    for (const id of ["APC", "PDP", "LP", "NNPP", "NDC", "APM", "SDP"]) {
      const at = indexOf(id);
      assert.ok(at >= 0, `${id} is not on the ballot at all`);
      assert.ok(
        at >= 4,
        `${id} sits at ${at}; a cutoff of 4 would have happened to include it, ` +
          `which makes the bug invisible in a test rather than absent`
      );
    }
  });

  it("carries the parties this deployment's principal and its opponents need", () => {
    /* ADC is the configured principal (lib/principal.js). It happens to sit
       at index 3 — inside the old cutoff — which is exactly why the bug
       survived: our own party drew correctly and every opponent went grey. */
    assert.equal(indexOf("ADC"), 3);
    for (const id of ["ADC", "APC", "NDC", "APM", "SDP"]) {
      assert.ok(indexOf(id) >= 0, `${id} must be on the paper`);
    }
  });
});
