import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { ENDPOINTS } from "../lib/endpoints.js";
import { CAPABILITIES, CAPABILITY_LABEL, ROLE_KEYS, capabilitiesOf, rolesWith } from "../lib/roles.js";

/**
 * The system console's two hand-written lists, kept honest.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Both lists exist for good reasons and both are the kind of list that rots.
 *
 *  The endpoint table in lib/system.js is written down rather than walked off
 *  disk, because a serverless build does not ship its own source tree and a
 *  filesystem walk could never say who is allowed through a route anyway.
 *  The capability labels in lib/roles.js are written down because
 *  "results:verify" is a good key and a terrible sentence.
 *
 *  A hand-written list is only worth having if it cannot go stale silently.
 *  So the walk that would have been wrong at request time is exactly right at
 *  test time: it runs here, against the real directory, and the build goes
 *  red the day somebody adds a route or a permission and forgets the screen
 *  that describes it.
 * ══════════════════════════════════════════════════════════════════════════
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(here, "..", "app", "api");

/**
 * Every route the application actually serves, read off disk.
 *
 * A route in the app router is a directory containing a `route` file; the
 * path is the directory's position under app/. Dynamic segments keep their
 * brackets, because that is how the endpoint table names them and because
 * "/api/media/[id]" is the honest description of an address that takes an id.
 */
async function routesOnDisk(dir = apiRoot, prefix = "/api") {
  const found = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      found.push(...(await routesOnDisk(path.join(dir, entry.name), `${prefix}/${entry.name}`)));
    } else if (/^route\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      found.push(prefix);
    }
  }

  return found.sort();
}

describe("the endpoint table", () => {
  it("names every route the application actually serves", async () => {
    const onDisk = await routesOnDisk();
    const described = ENDPOINTS.map((endpoint) => endpoint.path).sort();

    for (const route of onDisk) {
      assert.ok(
        described.includes(route),
        `${route} is served and is not on the API and webhooks screen. An address nobody can see is an address nobody audits.`
      );
    }
  });

  it("does not describe a route that no longer exists", async () => {
    const onDisk = await routesOnDisk();

    for (const endpoint of ENDPOINTS) {
      assert.ok(
        onDisk.includes(endpoint.path),
        `${endpoint.path} is described on the API screen and is not served. A console that lists doors that are not there is worse than no console.`
      );
    }
  });

  it("says who gets through every one of them", () => {
    for (const endpoint of ENDPOINTS) {
      assert.ok(endpoint.who?.length > 0, `${endpoint.path} does not say who may use it`);
      assert.ok(endpoint.what?.length > 0, `${endpoint.path} does not say what it is for`);
      assert.ok(endpoint.methods?.length > 0, `${endpoint.path} lists no methods`);
      /* There is no third kind of door. Anything anonymous would have to be a
         deliberate decision, and it would have to be argued for here first. */
      assert.ok(
        ["session", "signature"].includes(endpoint.guard),
        `${endpoint.path} is guarded by "${endpoint.guard}", which is neither a session nor a signature`
      );
    }
  });
});

describe("the permission labels", () => {
  it("gives every capability a sentence a person can read", () => {
    for (const capability of CAPABILITIES) {
      const label = CAPABILITY_LABEL[capability];
      assert.ok(
        label?.length > 0,
        `${capability} has no plain-language label, so it renders as a blank line on the roles screen — which reads as "this role may do nothing" rather than "somebody forgot"`
      );
      assert.ok(
        !label.includes(":"),
        `${capability}'s label still looks like an identifier: "${label}"`
      );
    }
  });

  it("does not label a capability that no longer exists", () => {
    for (const capability of Object.keys(CAPABILITY_LABEL)) {
      assert.ok(
        CAPABILITIES.includes(capability),
        `${capability} is described on the roles screen and is not in the grant table`
      );
    }
  });

  it("describes a role with the permissions the product enforces", () => {
    /* The roles screen must not be able to disagree with the guard. Checked
       both ways round: everything the screen lists for a role is genuinely
       granted, and everything granted is genuinely listed. */
    for (const role of ROLE_KEYS) {
      const listed = capabilitiesOf(role).map((entry) => entry.id);

      for (const capability of CAPABILITIES) {
        const granted = rolesWith(capability).includes(role);
        assert.equal(
          listed.includes(capability),
          granted,
          `the roles screen ${listed.includes(capability) ? "claims" : "denies"} ${role} holds ${capability}, and the grant table says otherwise`
        );
      }
    }
  });
});
