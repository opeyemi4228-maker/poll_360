import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { covers, describeGround, levelOf, prefixesOf, readGround, statesOf, tidyCode, touches, under, whereGround, writeGround } from "../lib/ground.js";
import { INTERFACES, ROLES, can, dashboardsFor, holds, interfacesFor, mayOpen, mayOpenAs, roomOnly } from "../lib/roles.js";

/**
 * Whose ground a place is on, and which desk opens which screen.
 *
 * Written out as facts, like tests/access.test.js, and for the same reason:
 * a scoping bug renders a perfectly good screen for the person who should
 * not be looking at it, and nobody reports that.
 */
describe("ground", () => {
  const kano = { zones: [], codes: ["19"] };
  const wards = { zones: [], codes: ["19/04/11", "19/04/12"] };
  const northEast = { zones: ["North East"], codes: [] };

  it("null is the whole project and an empty ground is nowhere", () => {
    assert.equal(covers(null, "19/04/11/003"), true);
    assert.equal(covers({ zones: [], codes: [] }, "19/04/11/003"), false);
    assert.equal(whereGround({ zones: [], codes: [] }).sql, " AND 1 = 0");
    assert.equal(whereGround(null).sql, "");
  });

  it("a state covers everything inside it and nothing beside it", () => {
    assert.equal(covers(kano, "19/04/11/003"), true);
    assert.equal(covers(kano, "19"), true);
    assert.equal(covers(kano, "18/04/11/003"), false);
    /* 19 must not swallow a code that merely begins with the same digits. */
    assert.equal(covers({ zones: [], codes: ["01"] }, "019"), false);
  });

  it("an observer with two wards covers those wards only, and may open what leads to them", () => {
    assert.equal(covers(wards, "19/04/11/003"), true);
    assert.equal(covers(wards, "19/04/13/001"), false);
    assert.equal(covers(wards, "19/04"), false);
    assert.equal(touches(wards, "19/04"), true);
    assert.equal(touches(wards, "19"), true);
    assert.equal(touches(wards, "19/05"), false);
    assert.deepEqual(statesOf(wards), ["19"]);
  });

  it("a zone is its states", () => {
    assert.equal(covers(northEast, "05/01/01/001"), true);
    assert.equal(covers(northEast, "19/01/01/001"), false);
    assert.equal(statesOf(northEast).length, 6);
  });

  it("the database is asked the same question the application answers", () => {
    const where = whereGround(wards, "unit_code");
    assert.match(where.sql, /unit_code = \? OR unit_code LIKE \?/);
    assert.deepEqual(where.params, ["19/04/11", "19/04/11/%", "19/04/12", "19/04/12/%"]);
  });

  it("a prefix already inside another is dropped", () => {
    assert.deepEqual(prefixesOf({ zones: [], codes: ["19", "19/04", "20/01"] }), ["19", "20/01"]);
  });

  it("drilling into a place narrows the ground to what is held there", () => {
    assert.deepEqual(under(kano, "19/04").codes, ["19/04"]);
    assert.deepEqual(under(wards, "19/04").codes, ["19/04/11", "19/04/12"]);
    assert.deepEqual(under(wards, "20").codes, []);
  });

  it("codes are tidied to INEC's shape, and nonsense is refused", () => {
    assert.equal(tidyCode("19-4-11-3"), "19/04/11/003");
    assert.equal(tidyCode("19"), "19");
    assert.equal(tidyCode("99"), null);
    assert.equal(tidyCode("19/04/11/003/7"), null);
    assert.equal(levelOf("19/04/11"), "ward");
    assert.equal(levelOf(""), "national");
  });

  it("a stored ground that does not parse is nowhere, never everywhere", () => {
    assert.deepEqual(readGround("{not json"), { zones: [], codes: [] });
    assert.equal(readGround(null), null);
    assert.deepEqual(readGround(writeGround(wards)), wards);
    assert.equal(describeGround({ zones: [], codes: [] }), "No ground assigned yet");
  });
});

describe("the room's desks", () => {
  const ROOM = ["DIRECTOR", "ZONE_LEAD", "STATE_OBSERVER", "VERIFIER", "LEAD_VERIFIER", "TECH_OPS", "TECH_SECURITY", "BROADCAST_WRITER", "BROADCAST_CLEARER", "FIELD_OPS", "WHATSAPP_DESK", "LEGAL"];

  it("there are ten interfaces", () => {
    assert.equal(INTERFACES.length, 10);
  });

  it("no room desk opens analytics, planning, the old room or another desk's screen", () => {
    for (const role of ROOM) {
      for (const path of ["/room", "/governors", "/gap", "/admin", "/console", "/field"]) {
        assert.equal(mayOpen(role, path), false, `${role} must not open ${path}`);
      }
      const own = dashboardsFor(role);
      for (const face of INTERFACES) {
        assert.equal(mayOpen(role, face.route), own.includes(face.route), `${role} and ${face.route}`);
      }
    }
  });

  it("the old room's account does not open the Director's console through the shared prefix", () => {
    assert.equal(mayOpen("SITUATION_ROOM", "/room"), true);
    assert.equal(mayOpen("SITUATION_ROOM", "/room/director"), false);
    assert.equal(mayOpen("SITUATION_ROOM", "/room/admin"), false);
    assert.equal(mayOpen("SITUATION_ROOM", "/room/stage"), true);
  });

  it("the permission table says what the specification says", () => {
    const row = (capability) => [...ROOM, "SUPER_ADMIN"].filter((role) => can(role, capability)).sort();
    assert.deepEqual(row("assignments:manage"), ["SUPER_ADMIN"]);
    assert.deepEqual(row("results:correct"), ["LEAD_VERIFIER", "SUPER_ADMIN", "VERIFIER"]);
    assert.deepEqual(row("results:second-check"), ["LEAD_VERIFIER", "SUPER_ADMIN", "VERIFIER"]);
    assert.deepEqual(row("results:verify"), ["LEAD_VERIFIER", "STATE_OBSERVER", "SUPER_ADMIN", "VERIFIER", "ZONE_LEAD"]);
    assert.deepEqual(row("results:dispute"), ["DIRECTOR", "LEAD_VERIFIER", "SUPER_ADMIN", "ZONE_LEAD"]);
    assert.deepEqual(row("items:resolve-red"), ["DIRECTOR", "LEAD_VERIFIER", "SUPER_ADMIN", "ZONE_LEAD"]);
    assert.deepEqual(row("broadcast:draft"), ["BROADCAST_WRITER", "DIRECTOR", "SUPER_ADMIN"]);
    assert.deepEqual(row("broadcast:clear"), ["BROADCAST_CLEARER", "DIRECTOR", "SUPER_ADMIN"]);
    assert.deepEqual(row("broadcast:call"), ["DIRECTOR", "SUPER_ADMIN"]);
    assert.deepEqual(row("broadcast:air"), ["BROADCAST_CLEARER", "DIRECTOR", "SUPER_ADMIN"]);
    assert.deepEqual(row("security:act"), ["SUPER_ADMIN", "TECH_SECURITY"]);
    assert.deepEqual(row("evidence:pack"), ["DIRECTOR", "LEGAL", "SUPER_ADMIN"]);
    assert.deepEqual(row("accounts:issue"), ["SUPER_ADMIN"]);
    /* The technical desk never sees a sheet, and neither does broadcast. */
    for (const role of ["TECH_OPS", "TECH_SECURITY", "BROADCAST_WRITER", "BROADCAST_CLEARER"]) assert.equal(can(role, "sheets:read"), false);
    /* The Director runs the room and edits no figure. */
    assert.equal(can("DIRECTOR", "results:correct"), false);
    assert.equal(can("DIRECTOR", "results:verify"), false);
  });

  it("an account may hold two desks, and gets both screens and both sets of powers", () => {
    const both = { role: "VERIFIER", roles: ["STATE_OBSERVER"], grants: [] };
    assert.deepEqual(interfacesFor(both).map((face) => face.id), ["observer", "verify"]);
    assert.equal(mayOpenAs(both, "/room/observer"), true);
    assert.equal(holds(both, "results:correct"), true);
    assert.equal(mayOpenAs(both, "/room/director"), false);
    assert.equal(roomOnly(both), true);
  });

  it("phoned-in entry is handed to one person, and only to an observer or field operator", () => {
    const observer = { role: "STATE_OBSERVER", roles: [], grants: [] };
    assert.equal(holds(observer, "results:upload"), false);
    assert.equal(holds({ ...observer, grants: ["phoned_in_entry"] }, "results:upload"), true);
    assert.equal(mayOpenAs({ ...observer, grants: ["phoned_in_entry"] }, "/field"), true);
    assert.equal(mayOpenAs(observer, "/field"), false);
    /* The grant means nothing on a desk it was never meant for. */
    assert.equal(holds({ role: "LEGAL", roles: [], grants: ["phoned_in_entry"] }, "results:upload"), false);
  });

  it("every room role has a home that is one of its own screens", () => {
    for (const role of ROOM) assert.ok(dashboardsFor(role).includes(ROLES[role].home), role);
  });
});
