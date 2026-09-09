import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * The keys this product sends the hub are the keys the hub reads.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FAILURE THIS CATCHES MAKES NO NOISE ANYWHERE
 *
 *  A registration went to DumpSite under `name`, and DumpSite's registration
 *  handler reads `fullName`. Nothing failed. The post returned 200, the item
 *  was sealed, hashed into the evidence chain and routed to Agent360 — with a
 *  null where the person's name should be. The same three lines sent
 *  `unitCode` where the hub reads `pollingUnitCode`, and a role spelled
 *  `POLLING_UNIT_AGENT` where the register knows `POLLING_AGENT`.
 *
 *  So an agent signs up, sees their code, and never appears on any roster.
 *  Nobody finds out from a log, because nothing went wrong at either end: one
 *  product wrote a key, the other read a different one, and JSON has no
 *  opinion about that.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY IT READS THE SOURCE RATHER THAN CALLING ANYTHING ───────────────────
 * `app/agent/actions.js` is a server action. Node's runner has no path
 * aliases, no Next request context and no database, so it cannot be imported
 * here, and neither can the hub's own handler — it is in a different
 * repository. What both ends do have is a payload literal written out in
 * plain text, and that is what this reads. A crude check that runs beats an
 * exact one that cannot.
 */

const ROOT = new URL("..", import.meta.url).pathname;

/**
 * What DumpSite's registration handler reads out of a payload.
 *
 * Taken from the INSERT in its lib/store/items.js. Restated here because that
 * file is in another repository and cannot be imported — which means this list
 * is a copy, and a copy of a contract can go stale. It is written out in full
 * and named so that the staleness is at least visible to somebody reading it,
 * rather than buried in a regex.
 */
const HUB_READS = ["fullName", "phone", "nin", "pollingUnitCode", "wardCode", "lgaCode", "stateCode", "role"];

/** Of those, the ones this product actually knows at sign-up. */
const MUST_SEND = ["fullName", "phone", "pollingUnitCode", "wardCode", "lgaCode", "stateCode", "role"];

/** The payload object passed to `forwardToDumpSite` for a given kind. */
function payloadFor(source, kind) {
  const start = source.indexOf(`kind: KIND.${kind},`);
  if (start < 0) return null;

  const from = source.indexOf("payload: {", start);
  if (from < 0) return null;

  /* To the matching brace, counted rather than matched with a regex — the
     payload contains nested objects, template literals and comments. */
  let depth = 0;
  for (let index = source.indexOf("{", from); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(from, index);
    }
  }
  return null;
}

/** The keys written at the top level of that literal. */
function keysIn(payload) {
  const found = new Set();
  for (const match of payload.matchAll(/^\s{6}([a-zA-Z][a-zA-Z0-9_]*)\s*[,:]/gm)) found.add(match[1]);
  return found;
}

describe("what this product sends the hub", () => {
  const source = readFileSync(`${ROOT}app/agent/actions.js`, "utf8");

  it("sends a registration under the names the hub reads", () => {
    const payload = payloadFor(source, "REGISTRATION");
    assert.ok(payload, "no REGISTRATION payload found in app/agent/actions.js");

    const sent = keysIn(payload);
    const missing = MUST_SEND.filter((key) => !sent.has(key));

    assert.deepEqual(
      missing,
      [],
      `\n  The hub reads these and this payload does not send them: ${missing.join(", ")}.` +
        `\n  It sends: ${[...sent].sort().join(", ")}\n`
    );
  });

  it("sends a role the register recognises", () => {
    const payload = payloadFor(source, "REGISTRATION");
    /* Agent360 maps POLLING_AGENT and the coordinator roles, and refuses
       anything else rather than defaulting it to an agent — a coordinator
       enrolled as an agent is posted to a booth nobody meant to staff. */
    assert.match(
      payload,
      /role:\s*"(POLLING_AGENT|WARD_COORDINATOR|LGA_COORDINATOR|STATE_COORDINATOR)"/,
      "the role sent is not one Agent360's register maps to an account"
    );
  });

  it("names every key the hub reads, so a new one is noticed here", () => {
    /* `nin` is the one the hub reads and this product does not collect. Stated
       rather than silently absent, so that the day it is collected, the place
       to add it is a failing line in this file. */
    assert.deepEqual(
      HUB_READS.filter((key) => !MUST_SEND.includes(key)),
      ["nin"],
      "HUB_READS and MUST_SEND have drifted apart; one of them is out of date"
    );
  });
});
