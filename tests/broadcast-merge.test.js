import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { IS_VIEW } from "../lib/room-views.js";

/**
 * The broadcast desk's move into the room, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY A MERGE NEEDS A TEST AND A REFACTOR USUALLY DOES NOT
 *
 *  Twenty-eight surfaces became four dashboards. Nothing was deleted — every
 *  one of them is a section inside one of the four — but that is a claim, and
 *  it is a claim that decays: the next person to tidy this file has no way of
 *  knowing that `socialstats` was ever a screen, so removing the one line
 *  that reaches it looks like removing a dead entry rather than removing a
 *  surface.
 *
 *  Nothing fails when that happens. The room still renders, the tab row still
 *  reads correctly, and the analytics screen the social desk kept is simply
 *  unreachable for ever. The failure is found by a producer at eleven at
 *  night looking for something they used last week.
 *
 *  So the twenty-eight are written down here, once, as the list the desk
 *  actually carried before the move. This file is the only place that
 *  survives it, which is the point: the old six-head component was deleted,
 *  and a proof that lives in the thing being changed is not a proof.
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * Every surface the six-head broadcast desk carried, as its own MODES table
 * named them. Transcribed from components/dash/BroadcastRoom.jsx at the
 * commit that removed it.
 */
const WAS = [
  /* Command */ "centre", "playout", "scheduler", "breaking",
  /* Television */ "control", "liveresults", "graphics", "mapstudio", "ticker", "stream",
  /* Social */ "socialdesk", "content", "multi", "trending", "listening", "socialstats",
  /* Production */ "video", "reporters", "feeds",
  /* Intelligence */ "dataviz", "trends", "resultsintel", "claims",
  /* Management */ "approvals", "audit", "team", "platforms", "health",
];

/**
 * Surfaces built after the merge, which the old desk never had. Listed by
 * name so the check below still catches a typo: an entry must be either
 * something the desk carried or something deliberately added here.
 */
const ADDED = [
  /* The live desk: release stamped updates to every platform. */ "live",
  /* The candidates' names and faces, drawn on every result card. */ "contestants",
];

/* Read rather than imported: the component is a client module that pulls in
   fifteen others and the whole lucide icon set, none of which node can load
   and none of which this test is about. The two tables it needs are plain
   data declared at the top level, so they are parsed out. */
const source = readFileSync(
  new URL("../components/dash/RoomBroadcast.jsx", import.meta.url),
  "utf8"
);

/** The four dashboard ids, and the sections declared inside each. */
function desks() {
  const block = source.slice(source.indexOf("export const DESKS = {"), source.indexOf("export const DESK_IDS"));
  const found = {};
  /* Tolerant about what else a dashboard carries — a `why` line, an icon —
     and strict about the two things this file is checking: its label and the
     sections inside it. */
  for (const match of block.matchAll(/^ {2}([a-z]+): \{\n\s*label: "([^"]+)",[\s\S]*?\n\s*sections: \[([\s\S]*?)\n {4}\],/gm)) {
    found[match[1]] = {
      label: match[2],
      sections: [...match[3].matchAll(/id: "([a-z]+)"/g)].map((row) => row[1]),
    };
  }
  return found;
}

/** Where each old surface landed. */
function where() {
  const block = source.slice(source.indexOf("export const WHERE = {"));
  const found = {};
  for (const match of block.matchAll(/^ {2}([a-z]+): \{ desk: "([a-z]+)", section: "([a-z]+)" \}/gm)) {
    found[match[1]] = { desk: match[2], section: match[3] };
  }
  return found;
}

describe("the broadcast desk, merged into the room", () => {
  it("parses, and finds both tables worth checking", () => {
    assert.equal(Object.keys(desks()).length, 4, "there are four dashboards");
    assert.ok(Object.keys(where()).length > 20, "the redirect table was found");
  });

  it("still reaches every one of the twenty-eight surfaces", () => {
    const found = where();
    assert.equal(WAS.length, 28, "the desk had twenty-eight surfaces");

    for (const surface of WAS) {
      assert.ok(found[surface], `${surface} was dropped by the merge and reaches nothing`);
    }
  });

  it("names nothing the desk never had", () => {
    /* The other direction, and it matters as much. An entry for a surface
       that never existed is a redirect nobody can follow, and it is also how
       a typo in the table above goes unnoticed: `socialstat` would satisfy
       the test above for `socialstats` in neither direction, but only this
       one says which of the two is wrong. */
    for (const surface of Object.keys(where())) {
      assert.ok(
        WAS.includes(surface) || ADDED.includes(surface),
        `${surface} was never a surface on the desk, and is not listed as added since`
      );
    }
  });

  it("sends every surface to a dashboard and a section that exist", () => {
    const board = desks();
    for (const [surface, found] of Object.entries(where())) {
      const desk = board[found.desk];
      assert.ok(desk, `${surface} points at dashboard "${found.desk}", which does not exist`);
      assert.ok(
        desk.sections.includes(found.section),
        `${surface} points at "${found.desk}/${found.section}", and that dashboard has no such section`
      );
    }
  });

  it("leaves no section of a dashboard unreachable", () => {
    /* A section nobody is sent to is a section with nothing in it, which in
       this component means a row of tabs where one draws a blank screen. */
    const landed = new Set(Object.values(where()).map((row) => `${row.desk}/${row.section}`));
    for (const [id, desk] of Object.entries(desks())) {
      for (const section of desk.sections) {
        assert.ok(
          landed.has(`${id}/${section}`),
          `${desk.label} has a "${section}" section that no surface lands on`
        );
      }
    }
  });

  it("makes each of the four a view the room can be returned to", () => {
    /* The room remembers where somebody was in a cookie and refuses any value
       that does not name a view this build renders — see lib/room-views.js.
       A dashboard missing from that list is one a reader is silently bounced
       off on every reload. */
    for (const id of Object.keys(desks())) {
      assert.ok(IS_VIEW.has(id), `${id} is a dashboard the room would not restore`);
    }
  });
});
