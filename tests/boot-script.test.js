import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { BOOT_SCRIPTS, BOOT_SCRIPT_HASHES, bootScript } from "../lib/boot-script.js";
import { contentSecurityPolicy } from "../lib/security-headers.js";

/**
 * The boot script's hashes, kept equal to the script.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A STALE HASH DOES NOT ERROR
 *
 *  The content security policy allows the boot script by the hash of its
 *  text. Edit the text and forget the hash, and nothing fails anywhere: the
 *  build passes, the page renders, and the browser quietly declines to run
 *  the script. The rail snaps on load again and the service worker is never
 *  registered — which means no offline support, on the product whose users
 *  are at a booth on a network that barely works. That has happened to this
 *  script once already, by a different route.
 *
 *  So the hashes are recomputed here from the text and compared. Editing the
 *  script without the hash turns this red, and the message says what to write.
 * ══════════════════════════════════════════════════════════════════════════
 */

const sha = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

describe("the boot script", () => {
  for (const variant of ["production", "development"]) {
    it(`carries the right hash for the ${variant} build`, () => {
      assert.equal(
        BOOT_SCRIPT_HASHES[variant],
        sha(BOOT_SCRIPTS[variant]),
        `lib/boot-script.js changed and its ${variant} hash did not. Set it to ${sha(BOOT_SCRIPTS[variant])}`
      );
    });
  }

  it("is allowed by the policy on every page that carries a nonce", () => {
    /* Both, whatever the environment: the layout and the proxy test NODE_ENV
       differently, and a policy allowing only one variant would block the
       other the first time they disagree. */
    const policy = contentSecurityPolicy({ nonce: "abc", development: false });
    const script = policy.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src"));
    for (const variant of ["production", "development"]) {
      assert.ok(script.includes(BOOT_SCRIPT_HASHES[variant]), `the ${variant} boot script would be blocked`);
    }
  });

  it("does not change with the deploy, so the hash does not have to", () => {
    /* The build id is read off <html data-build> at run time. Written into
       the script, every deploy would be a new script and a new hash, and the
       first deploy after this was merged would have shipped with the worker
       blocked. */
    for (const variant of ["production", "development"]) {
      assert.ok(!/NEXT_PUBLIC_BUILD_ID/.test(BOOT_SCRIPTS[variant]));
    }
    assert.match(BOOT_SCRIPTS.production, /dataset\.build/);
  });

  it("picks the production script only for a production build", () => {
    assert.equal(bootScript({ production: true }), BOOT_SCRIPTS.production);
    assert.equal(bootScript({ production: false }), BOOT_SCRIPTS.development);
  });

  it("is rendered by the layout without next/script", () => {
    /* next/script's `beforeInteractive` queues an inline script for the
       framework to run after its bundle loads, and puts a nonce on it that
       the client render cannot match. Either one is the bug this replaced. */
    const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
    assert.ok(!/from "next\/script"/.test(layout), "the layout imports next/script again");
    assert.match(layout, /<BootScript html=\{bootScript\(\)\} \/>/);
    assert.match(layout, /data-build=/);
  });
});
