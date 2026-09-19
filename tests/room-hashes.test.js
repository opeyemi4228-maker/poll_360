import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { IS_VIEW, VIEWS } from "../lib/room-views.js";

/**
 * The situation room's hash table, kept honest.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO SILENT BREAKAGES, NEITHER OF WHICH THREW ANYTHING
 *
 *  The room's views are local state rather than routes, so a hash is the only
 *  thing a link from elsewhere in the product can carry into one. That makes
 *  `HASH_LAYERS` a routing table, and it is maintained entirely by hand.
 *
 *  It has failed twice, both times without a symptom anybody could see:
 *
 *    "#overview" was declared twice in the same object literal. That is not
 *    an error in JavaScript — the later wins, silently — so the sidebar's own
 *    "Overview" link had been landing on the analytics dashboard rather than
 *    the room's front door, and nothing said so.
 *
 *    "#governs" pointed at a layer that had been folded into another screen
 *    and no longer existed. A hash naming a missing layer is not an error
 *    either; it falls through to the map. So every account that could open
 *    the room pressed "Who governs" in the sidebar and arrived at a map of
 *    the count. The accounts that could *not* open the room were served the
 *    standalone page correctly, which meant the break was invisible to
 *    precisely the people most likely to notice it.
 *
 *  Both are one assertion each, and neither can be caught by a type, a lint
 *  rule or a render. So they are caught here.
 *
 *  ── WHY THIS READS SOURCE TEXT RATHER THAN IMPORTING ────────────────────
 *  components/dash/SituationRoom.jsx is a client component full of JSX, and
 *  this repository's tests run on node's own runner with nothing installed —
 *  which is a deliberate property, worth more than the elegance of an import.
 *  So the table is parsed out of the file, and the parse is asserted to have
 *  found something before anything else is checked: a regex that silently
 *  matches nothing would turn this file into a test that always passes, which
 *  is worse than no test at all.
 * ══════════════════════════════════════════════════════════════════════════
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, "..", "components", "dash", "SituationRoom.jsx"), "utf8");

/** The literal body of `HASH_LAYERS`, or a loud failure. */
function tableBody() {
  const opens = source.indexOf("const HASH_LAYERS = {");
  assert.notEqual(opens, -1, "HASH_LAYERS has been renamed or removed — this test needs updating, not deleting");
  const closes = source.indexOf("\n};", opens);
  assert.notEqual(closes, -1, "could not find the end of HASH_LAYERS");
  return source.slice(opens, closes);
}

const literalEntries = () =>
  [...tableBody().matchAll(/^\s*"(#[a-z-]+)":\s*"([a-z]+)"/gm)].map((m) => ({ hash: m[1], layer: m[2] }));

/**
 * The broadcast desk's names, which are spread in rather than written out.
 *
 * ── AND WHY THE TEST HAS TO KNOW THAT ──────────────────────────────────────
 * Twenty-six of this table's entries are not in it: they are spread from the
 * desk's own redirect table, so that the surface names and the doors into
 * them cannot drift apart. That is the right way to build the table and it
 * makes it unparseable by a regex over the literal, which is how this test
 * started reporting that the sidebar's "#centre" link had no door when it has
 * one.
 *
 * Read from the same place the room reads it, and the two stay in step. The
 * one thing asserted about the spread separately is that it is still there:
 * a table that stopped spreading would leave this list empty and quietly
 * shrink the test back to what it used to cover.
 */
function spreadEntries() {
  const desk = readFileSync(path.join(here, "..", "components", "dash", "RoomBroadcast.jsx"), "utf8");
  const where = desk.slice(desk.indexOf("export const WHERE = {"));
  const found = [...where.matchAll(/^ {2}([a-z]+): \{ desk: "([a-z]+)"/gm)].map((m) => ({
    hash: `#${m[1]}`,
    layer: m[2],
  }));
  assert.ok(found.length > 20, "the broadcast desk's redirect table was not found");

  /* The room keeps its own meaning for any name it already used — see
     ROOM_OWNS in the room. Those are filtered out of the spread there, so
     they are filtered out here, or this would assert a door the room
     deliberately did not open. */
  const owns = new Set(
    [...source.matchAll(/const ROOM_OWNS = new Set\(\[([^\]]*)\]\)/g)]
      .flatMap((m) => [...m[1].matchAll(/"([a-z]+)"/g)].map((row) => row[1]))
  );
  return found.filter((row) => !owns.has(row.hash.slice(1)));
}

const entries = () => [...literalEntries(), ...spreadEntries()];

/** Every `{ value: "…" }` in the tab table: the layers that actually exist. */
const tabs = () => new Set([...source.matchAll(/\{\s*value:\s*"([a-z]+)"/g)].map((m) => m[1]));

describe("the room's hash table", () => {
  it("parses, and finds a table worth checking", () => {
    /* The guard on the guard. Everything below is vacuously true against an
       empty list, so the count is asserted first. */
    assert.ok(entries().length > 20, `only found ${entries().length} entries — the parse is probably wrong`);
    assert.ok(tabs().size > 5, `only found ${tabs().size} tabs — the parse is probably wrong`);
  });

  it("names each hash exactly once", () => {
    /* A duplicate key is not two doors. The later wins and the earlier is
       dead, and nothing anywhere reports it. */
    const seen = new Map();
    for (const { hash, layer } of entries()) {
      const already = seen.get(hash);
      assert.equal(
        already,
        undefined,
        `"${hash}" is declared twice — as "${already}" and as "${layer}". The later wins silently, so one of them is a door that does not open.`
      );
      seen.set(hash, layer);
    }
  });

  it("points every hash at a surface that exists", () => {
    /* A hash naming a layer nothing renders falls through to the map. That is
       the one outcome this table exists to prevent, and it is exactly what
       happened to "#governs" when the ruling-party tab moved. */
    const real = tabs();
    for (const { hash, layer } of entries()) {
      assert.ok(
        real.has(layer),
        `"${hash}" points at "${layer}", which is not a tab in this room. A link carrying it lands on the map instead, and nothing reports it.`
      );
    }
  });

  it("keeps a door open for every name the sidebar links to", () => {
    /* The rail links into this room by hash — see components/dash/DashNav.jsx.
       A name in the rail with no entry here is a line in the navigation that
       goes somewhere nobody chose. */
    const nav = readFileSync(path.join(here, "..", "components", "dash", "DashNav.jsx"), "utf8");
    const linked = [...nav.matchAll(/href:\s*"\/room#([a-z-]+)"/g)].map((m) => `#${m[1]}`);
    assert.ok(linked.length > 0, "the rail no longer links into the room by hash — this check needs updating");

    const known = new Set(entries().map((row) => row.hash));
    for (const hash of linked) {
      assert.ok(known.has(hash), `the sidebar links to /room${hash}, which this table does not name`);
    }
  });
});

describe("the shared list of views", () => {
  /* lib/room-views.js exists because the server has to validate a cookie
     naming a view, and it cannot read the tab table out of a client
     component. Two hand-kept lists of the same thing is exactly the shape
     that rots, so neither may move without the other. */
  it("names every tab the room actually has", () => {
    for (const tab of tabs()) {
      assert.ok(
        IS_VIEW.has(tab),
        `"${tab}" is a tab in the room and is not in VIEWS, so a reload while somebody is on it will drop them at the front door`
      );
    }
  });

  it("does not name a view the room no longer has", () => {
    /* The dangerous direction. A stale id here is one the server will happily
       restore from a cookie, and the room will render nothing for it. */
    const real = tabs();
    for (const view of VIEWS) {
      assert.ok(
        real.has(view),
        `VIEWS names "${view}", which is not a tab in the room — the server would restore a blank frame`
      );
    }
  });
});
