import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { siteAddress } from "../lib/site.js";

/**
 * A deployment that cannot say where it lives must still build.
 *
 * The failure this pins: NEXT_PUBLIC_SITE_URL set to an empty string in a
 * hosting dashboard reached `new URL("")` in app/layout.js, and every page of
 * the production build failed at once with "Invalid URL".
 */
describe("the address this deployment answers on", () => {
  it("passes over anything that is not an address", () => {
    assert.equal(siteAddress(""), "https://poll360.ng");
    assert.equal(siteAddress("   "), "https://poll360.ng");
    assert.equal(siteAddress(undefined, null), "https://poll360.ng");
    assert.equal(siteAddress("not an address"), "https://poll360.ng");
  });

  it("takes the first candidate that is one", () => {
    assert.equal(siteAddress("", "poll-360.vercel.app"), "https://poll-360.vercel.app");
    assert.equal(siteAddress("https://agents.example.ng", "poll-360.vercel.app"), "https://agents.example.ng");
  });

  it("keeps only the origin, however it was written", () => {
    /* A trailing path or slash pasted into a dashboard must not end up doubled
       inside every canonical link on the site. */
    assert.equal(siteAddress("https://poll360.ng/"), "https://poll360.ng");
    assert.equal(siteAddress("https://poll360.ng/home?ref=1"), "https://poll360.ng");
    assert.equal(siteAddress("poll360.ng"), "https://poll360.ng");
  });
});
