import { test } from "node:test";
import assert from "node:assert/strict";

/* The address is read once, as the module loads, the way the build inlines it.
   So it is set before the import and each arrangement gets a fresh copy. The
   proxy that uses it is tested in tests/agent-proxy.test.js, in its own
   process, because its import of this module cannot be refreshed the same way. */
async function load(value) {
  if (value === undefined) delete process.env.NEXT_PUBLIC_AGENT_URL;
  else process.env.NEXT_PUBLIC_AGENT_URL = value;
  return import(`../lib/agent-address.js?${Math.random()}`);
}

test("without an agents' address, nothing moves", async () => {
  const address = await load(undefined);
  assert.equal(address.agentHost, null);
  assert.equal(address.agentPath("/"), "/agent");
  assert.equal(address.agentPath("/pending?code=X"), "/agent/pending?code=X");
  assert.equal(address.agentUrl("/join"), "/agent/join");
});

test("a mistyped address is ignored rather than taking the site down", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const address = await load("poll360agents.com");
    assert.equal(address.agentHost, null);
    assert.equal(address.agentUrl("/login"), "/agent/login");
  } finally {
    console.error = original;
  }
});

test("with an agents' address, links are short there and full from the main site", async () => {
  const address = await load("https://poll360agents.com/");
  assert.equal(address.agentHost, "poll360agents.com");
  assert.equal(address.agentPath("/"), "/");
  assert.equal(address.agentPath("/login"), "/login");
  assert.equal(address.agentUrl("/"), "https://poll360agents.com");
  assert.equal(address.agentUrl("/join"), "https://poll360agents.com/join");
});
