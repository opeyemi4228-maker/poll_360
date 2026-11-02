import { test, afterEach } from "node:test";
import assert from "node:assert/strict";

/* The code exchange and the authorize URL both read RUN's credentials from the
   environment at module load, so the env is set here before the module is
   imported. A dynamic import after assignment is what makes that order hold. */
process.env.RUN_CLIENT_ID = "cid-123";
process.env.RUN_CLIENT_SECRET = "secret-xyz";
process.env.RUN_REDIRECT_URI = "https://agents.example.org/agent/run/callback";
process.env.RUN_PARTNER_API_URL = "https://run.example.test/partner-api";
process.env.RUN_AUTHORIZE_URL = "https://signin.example.test/oauth/authorize";
process.env.RUN_SCOPE = "agents:read agents:contact";

const { exchangeCode, buildAuthorizeUrl, runConfigured } = await import("../lib/run-oauth.js");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/* A fetch that answers once with a given status and JSON body. */
function fetchReturning({ ok, status, body }) {
  return async () => ({ ok, status, statusText: "", json: async () => body });
}
function fetchThrowing(name) {
  return async () => {
    throw Object.assign(new Error(name), { name });
  };
}

test("the environment makes the flow configured", () => {
  assert.equal(runConfigured(), true);
});

test("buildAuthorizeUrl carries every parameter RUN requires", () => {
  const url = new URL(buildAuthorizeUrl({ challenge: "CHAL", state: "STATE" }));
  assert.equal(url.origin + url.pathname, "https://signin.example.test/oauth/authorize");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), "cid-123");
  assert.equal(url.searchParams.get("redirect_uri"), "https://agents.example.org/agent/run/callback");
  assert.equal(url.searchParams.get("scope"), "agents:read agents:contact");
  assert.equal(url.searchParams.get("state"), "STATE");
  assert.equal(url.searchParams.get("code_challenge"), "CHAL");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
});

test("a missing code or verifier never reaches the network", async () => {
  globalThis.fetch = () => assert.fail("fetch should not be called");
  assert.deepEqual(await exchangeCode({ code: "", verifier: "v" }), { ok: false, reason: "invalid-request" });
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "" }), { ok: false, reason: "invalid-request" });
});

test("a successful exchange returns the agent", async () => {
  const agent = { run_id: "RUN-2026-01234", status: "active", polling_unit: { code: "28-09-05-012" } };
  globalThis.fetch = fetchReturning({ ok: true, status: 200, body: { agent } });
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: true, agent });
});

test("an ok response with no agent is reported, not trusted", async () => {
  globalThis.fetch = fetchReturning({ ok: true, status: 200, body: { token_type: "none" } });
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: false, reason: "no-agent" });
});

test("invalid_grant maps to 'expired' — start again, nothing is broken", async () => {
  globalThis.fetch = fetchReturning({ ok: false, status: 400, body: { error: "invalid_grant" } });
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: false, reason: "expired" });
});

test("another RUN error slug is passed through for the log", async () => {
  globalThis.fetch = fetchReturning({ ok: false, status: 401, body: { error: "invalid_client" } });
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: false, reason: "invalid_client" });
});

test("a non-ok response with no slug becomes http-<status>", async () => {
  globalThis.fetch = fetchReturning({ ok: false, status: 500, body: {} });
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: false, reason: "http-500" });
});

test("a timeout and an unreachable host are named for what they are", async () => {
  globalThis.fetch = fetchThrowing("TimeoutError");
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: false, reason: "timed-out" });

  globalThis.fetch = fetchThrowing("TypeError");
  assert.deepEqual(await exchangeCode({ code: "c", verifier: "v" }), { ok: false, reason: "unreachable" });
});
