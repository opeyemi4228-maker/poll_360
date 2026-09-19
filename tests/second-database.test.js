import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * The second database — the one holding the bytes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IS WORTH TESTING HERE IS THE ABSENCE, NOT THE PRESENCE
 *
 *  A second database that is configured and reachable is easy: bytes go in,
 *  bytes come out, and any failure is loud. The cases that matter are the two
 *  where this product must carry on as though nothing had happened:
 *
 *    not configured at all     which is every deployment until somebody sets
 *                              it, and most of them for ever. Filing a
 *                              photograph must be exactly what it always was.
 *
 *    configured and down       a night when this database is unreachable must
 *                              not be a night when a polling unit cannot file
 *                              its evidence. The bytes go to the working
 *                              database instead and the row records that.
 *
 *  Both of those fail silently if they fail — a photograph that quietly did
 *  not save looks, from the agent's phone, exactly like one that did. So they
 *  are asserted rather than assumed.
 *
 *  Nothing here opens a connection. These tests run on a machine with no
 *  database configured at all, which is the rule the whole suite keeps.
 * ══════════════════════════════════════════════════════════════════════════
 */

async function load() {
  return import(`../lib/second-database.js?t=${Math.random()}`);
}

let saved;

beforeEach(() => {
  saved = process.env.SECOND_DATABASE_URL;
  delete process.env.SECOND_DATABASE_URL;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SECOND_DATABASE_URL;
  else process.env.SECOND_DATABASE_URL = saved;
});

describe("whether there is a second database at all", () => {
  it("says no when nothing is set", async () => {
    const { hasSecondDatabase, secondDatabaseUrl } = await load();

    assert.equal(hasSecondDatabase(), false);
    assert.equal(secondDatabaseUrl(), null);
  });

  it("says no to an empty setting, which is how it is written in .env.example", async () => {
    process.env.SECOND_DATABASE_URL = "   ";
    const { hasSecondDatabase } = await load();

    assert.equal(hasSecondDatabase(), false);
  });

  it("says no to a file path, which is the old engine and not a database here", async () => {
    process.env.SECOND_DATABASE_URL = "file:./poll360.db";
    const { hasSecondDatabase } = await load();

    assert.equal(hasSecondDatabase(), false);
  });

  it("takes an address with space around it", async () => {
    process.env.SECOND_DATABASE_URL = "  postgresql://u:p@host/db  ";
    const { secondDatabaseUrl, hasSecondDatabase } = await load();

    assert.equal(secondDatabaseUrl(), "postgresql://u:p@host/db");
    assert.equal(hasSecondDatabase(), true);
  });
});

describe("filing a photograph with no second database", () => {
  it("reports that the bytes were not taken, so the caller keeps them", async () => {
    /* False is not a failure here, it is the instruction: lib/db.js writes the
       bytes into the working database exactly as it always did, and the row
       records that that is where they are. A true returned by mistake would
       empty the column and lose the photograph. */
    const { keepMediaBytes } = await load();

    assert.equal(
      await keepMediaBytes({ id: "a", mime: "image/jpeg", bytes: Buffer.from("x"), hash: "h" }),
      false
    );
  });

  it("does the same for a delivered body", async () => {
    const { keepOutboxBody } = await load();

    assert.equal(await keepOutboxBody({ id: 1, kind: "result", body: "{}" }), false);
  });

  it("has nothing to hand back, and does not pretend otherwise", async () => {
    const { mediaBytes, outboxBody } = await load();

    assert.equal(await mediaBytes("a"), null);
    assert.equal(await outboxBody(1), null);
  });
});

describe("filing a photograph when the second database cannot be reached", () => {
  /* An address that resolves to nothing. The driver fails before it reaches a
     database, which is the shape of the real failure: a compute that will not
     wake, a network that is not there. */
  const NOWHERE = "postgresql://u:p@127.0.0.1:1/db?sslmode=require";

  it("keeps the photograph rather than losing it to a database that is down", async () => {
    process.env.SECOND_DATABASE_URL = NOWHERE;
    const { keepMediaBytes } = await load();

    assert.equal(
      await keepMediaBytes({ id: "a", mime: "image/jpeg", bytes: Buffer.from("x"), hash: "h" }),
      false,
      "an unreachable second database must send the bytes back to the working one, not throw"
    );
  });

  it("leaves a delivered body where it is", async () => {
    process.env.SECOND_DATABASE_URL = NOWHERE;
    const { keepOutboxBody } = await load();

    assert.equal(await keepOutboxBody({ id: 1, kind: "result", body: "{}" }), false);
  });
});

describe("what the health screen is told", () => {
  it("says it is not configured, rather than reporting an empty store", async () => {
    /* The difference matters on the screen. "Nothing here" and "no such
       database" look the same as a zero and mean opposite things. */
    const { secondDatabaseReport } = await load();

    assert.deepEqual(await secondDatabaseReport(), { configured: false });
  });

  it("says it is configured and did not answer, and names the host", async () => {
    process.env.SECOND_DATABASE_URL = "postgresql://u:p@127.0.0.1:1/db?sslmode=require";
    const { secondDatabaseReport } = await load();
    const report = await secondDatabaseReport();

    assert.equal(report.configured, true);
    assert.equal(report.reachable, false);
    assert.equal(report.host, "127.0.0.1:1");
    assert.ok(report.why, "a screen cannot say why without a reason to print");
  });
});
