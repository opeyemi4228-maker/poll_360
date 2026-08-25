import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ROLES, ROLE_KEYS, can, dashboardsFor, homeFor, mayOpen } from "../lib/roles.js";

/**
 * Who can open what, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Access control is the one part of this product whose bugs are invisible
 *  from the inside. Every screen renders correctly for the person who should
 *  not be looking at it — that is what the bug *is*. Nobody reports it,
 *  because the person seeing too much has no way to know they are, and the
 *  person who should have caught it is looking at their own dashboard where
 *  everything is fine.
 *
 *  So the matrix is written out here as a fact rather than derived from the
 *  implementation. A test that computes the expected answer the same way the
 *  code does agrees with the code by construction and checks nothing.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Every capability the product grants, written out rather than imported.
   The grants map is private to lib/roles.js, and reading it here would make
   this file agree with the implementation by construction — which is exactly
   what a test of an access matrix must not do. A capability added there and
   not here is a capability nobody decided the rules for. */
const CAPABILITIES = [
  "accounts:issue",
  "results:file",
  "results:upload",
  "results:verify",
  "sheets:read",
  "incidents:file",
  "incidents:read",
  "broadcast:render",
  "results:export",
  "gap:read",
  "declared:file",
  "whatsapp:read",
  "whatsapp:claim",
];

/* Every route the application actually serves behind a sign-in. Written out
   rather than globbed: a new dashboard should have to be added here, which is
   the moment somebody decides who may open it. */
const GUARDED = [
  "/admin",
  "/admin/coordinators",
  "/field",
  "/broadcast",
  "/room",
  "/whatsapp",
  "/gap",
  "/governors",
  "/console",
];

/** What each role is allowed to open, and nothing else. */
const MATRIX = {
  SUPER_ADMIN: GUARDED,
  PU_AGENT: ["/field", "/governors"],
  BROADCASTER: ["/broadcast", "/gap", "/governors"],
  SITUATION_ROOM: ["/room", "/whatsapp", "/gap", "/governors"],
  WHATSAPP_DESK: ["/whatsapp", "/governors"],
  VIEWER: ["/console", "/governors"],
};

describe("the role list", () => {
  it("gives every role a home it is allowed to open", () => {
    for (const role of ROLE_KEYS) {
      const home = homeFor(role);
      assert.ok(home, `${role} has no home`);
      assert.ok(mayOpen(role, home), `${role} is sent home to ${home} and refused there`);
    }
  });

  it("describes every role, because the label is what a user is told they are", () => {
    for (const role of ROLE_KEYS) {
      assert.ok(ROLES[role].label?.length > 0, `${role} has no label`);
      assert.ok(ROLES[role].blurb?.length > 0, `${role} has no description`);
    }
  });

  it("treats an unknown role as having nothing", () => {
    /* A role string that is not in the list must fail closed. A row with a
       typo in its role column is the likeliest way this is ever exercised. */
    for (const nonsense of ["ADMIN", "super_admin", "", null, undefined, "PU_AGENT "]) {
      assert.equal(mayOpen(nonsense, "/admin"), false, `"${nonsense}" opened /admin`);
      assert.equal(mayOpen(nonsense, "/room"), false, `"${nonsense}" opened /room`);
    }
  });
});

describe("the access matrix", () => {
  for (const [role, allowed] of Object.entries(MATRIX)) {
    it(`lets ${role} open exactly what it should`, () => {
      for (const route of GUARDED) {
        const should = allowed.includes(route) || allowed.some((open) => route.startsWith(`${open}/`));
        assert.equal(
          mayOpen(role, route),
          should,
          `${role} ${mayOpen(role, route) ? "opened" : "was refused"} ${route}, expected ${should ? "allowed" : "refused"}`
        );
      }
    });
  }

  it("never lets a desk into the administrator's rooms", () => {
    for (const role of ["PU_AGENT", "BROADCASTER", "SITUATION_ROOM", "WHATSAPP_DESK", "VIEWER"]) {
      assert.equal(mayOpen(role, "/admin"), false, `${role} opened /admin`);
      assert.equal(mayOpen(role, "/admin/coordinators"), false, `${role} opened the coordinator queue`);
    }
  });

  it("never lets a coordinator read anybody else's room", () => {
    /* The account that produces the data is the one held by the most people
       and the least verified. It sees its own booth and nothing else. */
    for (const route of ["/room", "/broadcast", "/whatsapp", "/gap", "/admin"]) {
      assert.equal(mayOpen("PU_AGENT", route), false, `a coordinator opened ${route}`);
    }
  });

  it("does not let a name that merely starts the same way stand in for a route", () => {
    /* A path is the route itself, or something beneath it. "Begins with the
       same letters" is not a third case, and treating it as one grants a room
       to the wrong desk the day somebody adds a route whose name happens to
       start with an existing one. */
    assert.equal(mayOpen("SITUATION_ROOM", "/room"), true);
    assert.equal(mayOpen("SITUATION_ROOM", "/room/anything"), true);
    assert.equal(mayOpen("VIEWER", "/console/settings"), true);

    assert.equal(mayOpen("PU_AGENT", "/fieldwork"), false, "a coordinator opened /fieldwork");
    assert.equal(mayOpen("BROADCASTER", "/broadcasting-house"), false);
    assert.equal(mayOpen("SITUATION_ROOM", "/roomier"), false);
    assert.equal(mayOpen("WHATSAPP_DESK", "/administration"), false);
    assert.equal(mayOpen("VIEWER", "/governors-private"), false);
  });
});

describe("capabilities", () => {
  it("grants nothing to an unknown role", () => {
    for (const capability of CAPABILITIES) {
      assert.equal(can("NOBODY", capability), false, `an unknown role held ${capability}`);
    }
  });

  it("lets only coordinators file a result or an incident", () => {
    for (const role of ROLE_KEYS) {
      const expected = role === "PU_AGENT";
      assert.equal(can(role, "results:file"), expected, `${role} and results:file`);
      assert.equal(can(role, "incidents:file"), expected, `${role} and incidents:file`);
    }
  });

  it("lets only the administrator issue accounts", () => {
    for (const role of ROLE_KEYS) {
      assert.equal(can(role, "accounts:issue"), role === "SUPER_ADMIN", `${role} and accounts:issue`);
    }
  });

  it("never lets a broadcaster write a result", () => {
    /* A newsroom reads and renders; it must never be able to change a figure
       it is about to put on air. */
    for (const capability of ["results:file", "results:upload", "results:verify", "declared:file"]) {
      assert.equal(can("BROADCASTER", capability), false, `a broadcaster held ${capability}`);
    }
  });

  it("gives a viewer nothing at all", () => {
    for (const capability of CAPABILITIES) {
      assert.equal(can("VIEWER", capability), false, `a viewer held ${capability}`);
    }
  });

  it("keeps the route for a capability and the capability itself together", () => {
    /* The lesson the WhatsApp desk taught: a screen whose route and capability
       are decided separately becomes a screen a role is entitled to read and
       is sent home from. */
    for (const role of ROLE_KEYS) {
      if (can(role, "whatsapp:read")) {
        assert.ok(dashboardsFor(role).includes("/whatsapp"), `${role} may read WhatsApp and cannot open it`);
      }
      if (can(role, "gap:read")) {
        assert.ok(dashboardsFor(role).includes("/gap"), `${role} may read the gap and cannot open it`);
      }
    }
  });
});
