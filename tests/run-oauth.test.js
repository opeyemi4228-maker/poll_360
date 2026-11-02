import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  challengeFor,
  createState,
  createVerifier,
  mapAgentToIdentity,
  signInDecision,
} from "../lib/run-oauth.js";

/* These are the pure parts of "Sign in with RUN": the PKCE pair, the mapping of
   RUN's Agent object onto what coordinators.mirrorAgent reads, and the
   active/paused/inactive decision. The network exchange and the route handlers
   are not exercised here — node --test has no database or RUN behind it. */

test("the PKCE verifier is URL-safe and within RFC 7636's 43–128 characters", () => {
  for (let i = 0; i < 50; i += 1) {
    const verifier = createVerifier();
    assert.ok(verifier.length >= 43 && verifier.length <= 128, `length ${verifier.length}`);
    assert.match(verifier, /^[A-Za-z0-9\-_]+$/);
  }
});

test("the challenge is base64url( sha256( verifier ) ), the S256 method", () => {
  const verifier = createVerifier();
  const expected = createHash("sha256").update(verifier).digest("base64url");
  assert.equal(challengeFor(verifier), expected);
  /* base64url: no +, /, or = padding. */
  assert.doesNotMatch(challengeFor(verifier), /[+/=]/);
});

test("state is random each time", () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) seen.add(createState());
  assert.equal(seen.size, 100);
});

test("a RUN agent maps onto the mirrorAgent shape, run_id prefixed", () => {
  const identity = mapAgentToIdentity({
    run_id: "RUN-2026-01234",
    status: "active",
    full_name: "Ada Example",
    phone: "+2348000000000",
    polling_unit: { code: "28-09-05-012" },
  });
  assert.equal(identity.id, "run:RUN-2026-01234");
  assert.equal(identity.fullName, "Ada Example");
  assert.equal(identity.phone, "+2348000000000");
  /* The dash code is passed through as RUN wrote it; lib/units.parseUnitCode
     normalises it to the slash key when mirrorAgent places the booth. */
  assert.equal(identity.pollingUnitCode, "28-09-05-012");
});

test("the SERVING booth is taken, never the voting one", () => {
  /* RUN's sign-in response carries both: the booth the agent works
     (polling_unit) and where they personally vote (voting.polling_unit). The
     two differ here on purpose; the identity must carry the serving booth. */
  const identity = mapAgentToIdentity({
    run_id: "RUN-2026-00042",
    status: "active",
    full_name: "Serves Here Votes There",
    phone: "+2348000000000",
    email: "agent@example.com",
    polling_unit: { code: "28-09-05-012", name: "Serving School" },
    voting: {
      vin: "00A0A0000000000000",
      polling_unit: { code: "09-01-02-003", name: "Home Town Hall" },
    },
  });
  assert.equal(identity.pollingUnitCode, "28-09-05-012");
  assert.notEqual(identity.pollingUnitCode, "09-01-02-003");
  /* Identity is kept minimal: email and the voter id are read past, not held. */
  assert.deepEqual(Object.keys(identity).sort(), ["fullName", "id", "phone", "pollingUnitCode"]);
  assert.ok(!("email" in identity) && !("vin" in identity) && !("voting" in identity));
});

test("mapping fails closed without a run_id or a polling unit", () => {
  assert.equal(mapAgentToIdentity(null), null);
  assert.equal(mapAgentToIdentity({ run_id: "RUN-1", status: "active" }), null);
  assert.equal(mapAgentToIdentity({ status: "inactive" }), null);
  assert.equal(mapAgentToIdentity({ run_id: "RUN-1", polling_unit: {} }), null);
});

test("a name is supplied when RUN omits one, keyed to the run_id", () => {
  const identity = mapAgentToIdentity({ run_id: "RUN-7", polling_unit: { code: "01-01-01-001" } });
  assert.equal(identity.fullName, "Agent RUN-7");
  assert.equal(identity.phone, null);
});

test("only an active agent may sign in", () => {
  assert.deepEqual(signInDecision({ status: "active" }), { allow: true, status: "active" });
  assert.deepEqual(signInDecision({ status: "paused" }), { allow: false, status: "paused", reason: "paused" });
  assert.deepEqual(signInDecision({ status: "inactive" }), { allow: false, status: "inactive", reason: "inactive" });
  /* An unknown or missing status is treated as not-an-agent, never as active. */
  assert.deepEqual(signInDecision({}), { allow: false, status: "inactive", reason: "inactive" });
  assert.deepEqual(signInDecision({ status: "something-new" }), {
    allow: false,
    status: "something-new",
    reason: "inactive",
  });
});
