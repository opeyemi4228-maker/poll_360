import assert from "node:assert/strict";
import { test } from "node:test";

import { AGENTS_APP, agentsManifest } from "../lib/agents-app.js";

/**
 * The agents' app installs as its own app. A manifest that borrowed Poll360's
 * name, id or start page would put a second "Poll360" on an agent's home screen
 * that opens the staff site.
 */

test("installs under its own name, never Poll360's", () => {
  const manifest = agentsManifest();
  assert.equal(manifest.name, AGENTS_APP.name);
  assert.equal(manifest.short_name, "Agents");
  assert.ok(!JSON.stringify(manifest).includes("Poll360"), "the agents' manifest mentions Poll360");
});

test("without its own domain it opens and scopes to the agent pages, under its own id", () => {
  /* The test runner sets no NEXT_PUBLIC_AGENT_URL, so this is the main-site
     arrangement. Poll360's own manifest has id "/"; this one must not. */
  const manifest = agentsManifest();
  assert.equal(manifest.start_url, "/agent");
  assert.equal(manifest.id, "/agent");
  assert.equal(manifest.scope, "/agent/");
  for (const shortcut of manifest.shortcuts) assert.match(shortcut.url, /^\/agent\//);
});

test("carries a maskable icon, so Android launchers do not crop the mark", () => {
  const manifest = agentsManifest();
  assert.ok(manifest.icons.some((icon) => icon.purpose === "maskable"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "any"));
});
