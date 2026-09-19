import { test } from "node:test";
import assert from "node:assert/strict";

/* One arrangement per process: the agents have their own domain. Set before
   the proxy is imported, because the address is read as the module loads. */
process.env.NEXT_PUBLIC_AGENT_URL = "https://poll360agents.com";
const { proxy } = await import("../proxy.js");

function request(url, { method = "GET", headers = {} } = {}) {
  const parsed = new URL(url);
  return { url, method, nextUrl: parsed, headers: new Headers({ host: parsed.host, ...headers }) };
}

test("after signing in, the agents' home is what comes back — not Poll360's website", () => {
  /* A server action's redirect("/") is fetched by Next from the server's own
     origin, carrying the browser's original address in x-forwarded-host. It
     must reach the agent pages, exactly as the browser's own request would. */
  const internal = proxy(
    request("http://localhost:3000/", { headers: { "x-forwarded-host": "poll360agents.com" } })
  );
  assert.equal(rewrittenTo(internal), "/agent");

  const signedOut = proxy(
    request("http://localhost:3000/login", { headers: { "x-forwarded-host": "poll360agents.com, proxy.internal" } })
  );
  assert.equal(rewrittenTo(signedOut), "/agent/login");

  /* The main site's own internal fetches stay on the main site. */
  const staff = proxy(request("http://localhost:3000/", { headers: { "x-forwarded-host": "poll360.ng" } }));
  assert.equal(rewrittenTo(staff), null);
});

const rewrittenTo = (response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
};

test("the agents' address shows the agent pages at its root", () => {
  assert.equal(rewrittenTo(proxy(request("https://poll360agents.com/"))), "/agent");
  assert.equal(rewrittenTo(proxy(request("https://poll360agents.com/login"))), "/agent/login");
  /* A form post is rewritten the same way, so the action runs where it was sent. */
  const post = proxy(request("https://poll360agents.com/login", { method: "POST" }));
  assert.equal(rewrittenTo(post), "/agent/login");
});

test("staff pages do not open on the agents' address", () => {
  /* Rewritten into the agent section, where no such page exists. */
  for (const path of ["/field", "/room", "/admin"]) {
    const response = proxy(request(`https://poll360agents.com${path}`));
    assert.equal(rewrittenTo(response), `/agent${path}`, path);
  }
});

test("the long spelling on the agents' address is tidied to the short one", () => {
  const response = proxy(request("https://poll360agents.com/agent/pending?code=AB"));
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://poll360agents.com/pending?code=AB");
});

test("the main site sends old agent links across, and leaves everything else alone", () => {
  const moved = proxy(request("https://poll360.ng/agent/join?ref=sheet"));
  /* Temporary: a browser must ask again, so a corrected setting reaches it. */
  assert.equal(moved.status, 307);
  assert.equal(moved.headers.get("location"), "https://poll360agents.com/join?ref=sheet");

  assert.equal(proxy(request("https://poll360.ng/agent")).headers.get("location"), "https://poll360agents.com/");

  const room = proxy(request("https://poll360.ng/room"));
  assert.equal(room.headers.get("location"), null);
  assert.equal(rewrittenTo(room), null);

  /* Admins still open /field on the main site; the page guard, not the proxy,
     moves agent accounts off it. */
  assert.equal(proxy(request("https://poll360.ng/field")).headers.get("location"), null);

  const post = proxy(request("https://poll360.ng/agent/login", { method: "POST" }));
  assert.equal(post.headers.get("location"), null);
});
