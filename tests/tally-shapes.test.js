import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The two shapes a return's votes can be stored in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE ROW OF THE WRONG SHAPE TAKES THE WHOLE BOARD DOWN, NOT ONE BOOTH
 *
 *  Returns are stored keyed by party. A handful were written as bare *arrays*
 *  before that was settled, which is why `voteName` in lib/db.js exists at
 *  all — it turns "0", "1", "2" back into party ids so that either shape adds
 *  up to the same thing.
 *
 *  `results.tally` reads the rows and applies that in JavaScript, so an array
 *  row costs it nothing. `results.totals` asks the database to do the adding,
 *  and there the shapes are not interchangeable: `jsonb_each_text` on an
 *  array does not skip it, it raises an error — so a single such row anywhere
 *  in a project would fail the totals for every booth in it, on the busiest
 *  query in the product, with a message naming a function nobody called.
 *
 *  There are no array rows on the current database. This is not speculative:
 *  a restored backup or another deployment's database is one command away
 *  from having them, and the failure is total rather than partial.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS READS THE SOURCE RATHER THAN RUNNING THE QUERY ────────────────
 * Node's runner has no database, and the whole test suite is deliberately
 * runnable on a machine that has none — which matters more than usual for
 * software that has to build on somebody else's machine on the morning of an
 * election. The same approach tests/databank-contract.test.js takes, and for
 * the same reason: a crude check that runs beats an exact one that cannot.
 */

const SOURCE = readFileSync(new URL("../lib/db.js", import.meta.url), "utf8");

/** The body of `results.totals`, which is the only statement this is about. */
function totalsQuery() {
  const from = SOURCE.indexOf("async totals(electionId, race, territory = null)");
  assert.ok(from > 0, "results.totals has been renamed or removed");
  const to = SOURCE.indexOf("\n  async ", from + 1);
  return SOURCE.slice(from, to === -1 ? undefined : to);
}

describe("adding up votes in the database", () => {
  it("reads a return stored as an object", () => {
    assert.match(totalsQuery(), /jsonb_each_text/);
    assert.match(totalsQuery(), /jsonb_typeof\(results\.votes::jsonb\) = 'object'/);
  });

  it("also reads one stored as an array, rather than raising on it", () => {
    const query = totalsQuery();
    assert.match(query, /jsonb_array_elements_text/);
    assert.match(query, /jsonb_typeof\(results\.votes::jsonb\) = 'array'/);
    /* The position is the party, one-based from ORDINALITY and zero-based in
       the record — which is what `voteName` reads. An off-by-one here would
       silently attribute every vote to the wrong party. */
    assert.match(query, /\(item\.ord - 1\)::text/);
  });

  it("sums a number rather than concatenating text", () => {
    /* `jsonb_each_text` hands back strings. Postgres will not sum text, and a
       silent cast is not something to leave to chance on a vote total. */
    const query = totalsQuery();
    assert.match(query, /each\.value::numeric/);
    assert.match(query, /item\.value::numeric/);
  });

  it("counts registered and accredited in a separate statement", () => {
    /* Joining the rows to their unfolded votes counts `registered` once per
       party on the ballot, which is the classic way to produce a turnout
       figure eighteen times too large. */
    const query = totalsQuery();
    assert.match(query, /SUM\(registered\)/);
    assert.ok(
      query.indexOf("SUM(registered)") < query.indexOf("jsonb_each_text"),
      "the summary and the party totals are no longer separate statements"
    );
  });

  it("narrows both halves to the same ground", () => {
    /* One half filtered and the other not would add a state's votes to a
       ward's, which is a total that is wrong in the direction nobody checks. */
    const query = totalsQuery();
    assert.equal(
      (query.match(/\$\{ours\}/g) ?? []).length,
      2,
      "the two halves of the union are not narrowed to the same ground"
    );
  });
});
