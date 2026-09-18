import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DYNAMIC_PREFIXES,
  contentSecurityPolicy,
  makeNonce,
  rendersPerRequest,
  requestId,
  securityHeaders,
} from "../lib/security-headers.js";

/**
 * What every response says about how it may be treated.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A POLICY THAT IS REPORT-ONLY IS A POLICY THAT IS OFF
 *
 *  This product carried `Content-Security-Policy-Report-Only` for a long
 *  time, with an honest note saying it should be run for a day and then
 *  enforced. Report-only enforces nothing: an injected script on a dashboard
 *  runs, the browser writes a line to a console nobody has open, and the page
 *  carries on.
 *
 *  These tests hold the enforced version to the two things that make it worth
 *  having — no `'unsafe-inline'` where scripts are concerned, and a nonce
 *  that is different every time — and to the one thing that would make it a
 *  disaster, which is being sent to a page that cannot carry a nonce.
 * ══════════════════════════════════════════════════════════════════════════
 */

const ROOT = new URL("..", import.meta.url).pathname;

describe("which pages can carry a nonce", () => {
  it("names every signed-in surface", () => {
    for (const path of [
      "/admin",
      "/admin/users",
      "/room",
      "/console",
      "/field",
      "/broadcast",
      "/gap",
      "/whatsapp",
      "/governors",
      "/agent/results",
    ]) {
      assert.equal(rendersPerRequest(path), true, path);
    }
  });

  it("leaves the pages built once at deploy time alone", () => {
    /* A nonce has to be in the HTML as well as the header, and a page built
       before any request exists has no nonce to put in it. Sending a nonce
       policy with one of these is a blank page for everybody. */
    for (const path of ["/", "/login", "/join", "/pending", "/offline"]) {
      assert.equal(rendersPerRequest(path), false, path);
    }
  });

  it("does not match a path that merely starts with the same letters", () => {
    /* "/agents-icons/x" is a route, and it is not the agents' app. */
    assert.equal(rendersPerRequest("/agents-icons/badge.png"), false);
    assert.equal(rendersPerRequest("/roommate"), false);
  });

  it("treats every page on the agents' own address as rendered per request", () => {
    /* There, "/" and "/results" are coordinator pages, not the website. */
    assert.equal(rendersPerRequest("/", { onAgentHost: true }), true);
    assert.equal(rendersPerRequest("/results", { onAgentHost: true }), true);
  });

  it("agrees with the pages next.config.mjs keeps out of shared caches", () => {
    /* ── WHY THESE TWO LISTS HAVE TO MATCH ──────────────────────────────
       They answer different questions about the same set of pages: which
       ones are rendered per request, and which ones must never sit in a
       shared cache. A page added to one and not the other is either
       cacheable when it holds somebody's session, or served a policy it
       cannot satisfy. Both are silent failures. */
    const config = readFileSync(`${ROOT}next.config.mjs`, "utf8");
    const rule = /source:\s*"\/:prefix\(([^)]+)\)/.exec(config);
    assert.ok(rule, "the no-store rule in next.config.mjs has moved or been renamed");

    const cached = new Set(rule[1].split("|").map((name) => `/${name}`));
    /* "/login" is in that list and is deliberately not dynamic: it is built
       at deploy time and holds nothing, but a sign-in form has no business in
       a shared cache either. Everything else must appear in both. */
    for (const prefix of DYNAMIC_PREFIXES) {
      assert.ok(
        cached.has(prefix),
        `${prefix} renders per request but is not kept out of shared caches`
      );
    }
  });
});

describe("the policy itself", () => {
  it("allows no inline script at all on a page rendered for a request", () => {
    const policy = contentSecurityPolicy({ nonce: "abc123" });
    const scripts = /script-src ([^;]+)/.exec(policy)[1];

    assert.ok(!scripts.includes("'unsafe-inline'"), "inline scripts are still allowed");
    assert.ok(!scripts.includes("'unsafe-eval'"), "eval is still allowed");
    assert.ok(scripts.includes("'nonce-abc123'"));
    assert.ok(scripts.includes("'strict-dynamic'"));
  });

  it("closes the directives an injected script would actually reach for", () => {
    const policy = contentSecurityPolicy({ nonce: "abc123" });

    /* Where a stolen script would send what it read. */
    assert.match(policy, /connect-src 'self'/);
    /* Where an injected form would post a password. */
    assert.match(policy, /form-action 'self'/);
    /* A <base> an attacker controls rewrites every relative URL on the page. */
    assert.match(policy, /base-uri 'self'/);
    assert.match(policy, /object-src 'none'/);
  });

  it("leaves framing to the per-path rules, because the board is meant to be embedded", () => {
    /* A broadcast board in vMix or OBS is an iframe in somebody else's scene.
       Denying it here would break the feature the product is sold on, and
       would contradict the rule in next.config.mjs that governs it. */
    assert.ok(!contentSecurityPolicy({ nonce: "abc" }).includes("frame-ancestors"));
  });

  it("allows eval in development only, where React needs it for error stacks", () => {
    assert.ok(contentSecurityPolicy({ nonce: "abc", development: true }).includes("'unsafe-eval'"));
    assert.ok(!contentSecurityPolicy({ nonce: "abc", development: false }).includes("'unsafe-eval'"));
  });

  it("names nobody outside this origin when the Google ground is off", async () => {
    /* Which is the default. The room draws its own map from files this
       repository ships and works on a venue's wifi with the uplink down. */
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
    const { contentSecurityPolicy: policyOf } = await import(
      `../lib/security-headers.js?off=${Math.random()}`
    );

    const policy = policyOf({ nonce: "abc" });
    assert.match(policy, /connect-src 'self';/);
    assert.ok(!policy.includes("googleapis"), "named Google with the feature switched off");
  });

  it("lets the Google ground's tiles through when its key is set", async () => {
    /* A strict policy that silently breaks a feature is not a strict policy.
       The Maps script itself is covered by 'strict-dynamic'; its tiles and its
       API calls are not, and without these the layer comes up grey with an
       error only somebody with a console open would ever see. */
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY = "a-browser-key";
    const { contentSecurityPolicy: policyOf } = await import(
      `../lib/security-headers.js?on=${Math.random()}`
    );

    const policy = policyOf({ nonce: "abc" });
    assert.match(policy, /connect-src 'self' https:\/\/maps\.googleapis\.com/);
    assert.match(policy, /img-src [^;]*https:\/\/\*\.googleapis\.com/);

    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  });

  it("falls back to allowing inline scripts only where no nonce is possible", () => {
    const built = contentSecurityPolicy({ nonce: null });
    assert.match(built, /script-src 'self' 'unsafe-inline'/);
    assert.ok(!built.includes("strict-dynamic"), "strict-dynamic without a nonce blocks everything");
  });
});

describe("the headers around it", () => {
  it("promises HTTPS for long enough to matter, and includes the agents' domain", () => {
    const headers = securityHeaders({ nonce: "abc" });
    assert.equal(
      headers["Strict-Transport-Security"],
      "max-age=63072000; includeSubDomains; preload"
    );
  });

  it("makes no promise it cannot keep on a plain connection", () => {
    /* Development, and any internal health check on http. Sending HSTS there
       would pin a browser to HTTPS for a host that has none, and
       upgrade-insecure-requests would break local development outright. */
    const headers = securityHeaders({ nonce: "abc", secure: false });
    assert.equal(headers["Strict-Transport-Security"], undefined);
    assert.ok(!headers["Content-Security-Policy"].includes("upgrade-insecure-requests"));
  });

  it("lets this origin ask for a microphone and a position, and nobody else ask at all", () => {
    /* An empty allowlist is not "ask first", it is "this capability does not
       exist", and it once silently switched off the assistant's hearing and
       the field form's position stamp on every machine. */
    const policy = securityHeaders({ nonce: "abc" })["Permissions-Policy"];
    assert.match(policy, /microphone=\(self\)/);
    assert.match(policy, /geolocation=\(self\)/);
    assert.match(policy, /camera=\(\)/);
  });

  it("stops another tab holding a handle on this one", () => {
    const headers = securityHeaders({ nonce: "abc" });
    assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin");
    assert.equal(headers["Cross-Origin-Resource-Policy"], "same-origin");
  });
});

describe("the nonce", () => {
  it("is different every time, which is the whole of its value", () => {
    const seen = new Set(Array.from({ length: 500 }, makeNonce));
    assert.equal(seen.size, 500);
  });

  it("is long enough that guessing it is hopeless", () => {
    /* Sixteen bytes, base64. Anything shorter is a nonce an attacker can
       work through while the page is still open. */
    assert.ok(atob(makeNonce()).length >= 16);
  });

  it("says nothing about the request it belongs to", () => {
    assert.match(makeNonce(), /^[A-Za-z0-9+/]+=*$/);
  });
});

describe("naming one request", () => {
  it("is unique, short and not a secret", () => {
    const seen = new Set(Array.from({ length: 500 }, requestId));
    assert.equal(seen.size, 500);
    assert.match(requestId(), /^[0-9a-f]{16}$/);
  });
});
