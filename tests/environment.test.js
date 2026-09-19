import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

/**
 * Whether this deployment is actually configured, or only appears to be.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY SETTING CHECKED HERE FAILS IN A WAY THAT LOOKS LIKE SUCCESS
 *
 *  That is the test that matters. A missing setting that breaks the product
 *  needs no checker — you find out on the first page load. These are the ones
 *  where the product carries on perfectly: incident narratives that seal and
 *  unseal with a key printed in this repository, a pipeline that delivers
 *  evidence nobody can prove was not altered, a sign-in limit that fires and
 *  counts and stops nobody.
 *
 *  So each case below sets up one of those, and asserts the deployment is
 *  told about it.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* Loaded fresh per case: the shared counter reads its configuration as it
   loads, and so this has to be re-imported to see a changed environment. */
async function load() {
  return import(`../lib/environment.js?t=${Math.random()}`);
}

const NAMES = [
  "ENCRYPTION_KEY",
  "DATABANK_URL",
  "DUMPSITE_URL",
  "DATABANK_API_KEY",
  "DUMPSITE_API_KEY",
  "DATABANK_SIGNING_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "TRUSTED_PROXY_HOPS",
  "NEXT_PUBLIC_SITE_URL",
  "WHATSAPP_TOKEN",
  "WHATSAPP_APP_SECRET",
  "DATABASE_URL",
  "DATABANK_DATABASE_URL",
  "SECOND_DATABASE_URL",
];

let saved;

beforeEach(() => {
  saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]));
  for (const name of NAMES) delete process.env[name];
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Find one finding by the name it is printed under. */
const about = (findings, name) => findings.find((finding) => finding.name === name);

const STRONG = "a".repeat(40);

describe("the sealing key", () => {
  it("says so when there is none", async () => {
    const { checkEnvironment } = await load();
    const finding = about(checkEnvironment(), "Sealing key");

    assert.ok(finding, "a deployment with no sealing key was told nothing");
    assert.match(finding.says, /not actually secret|refuse to start/);
    assert.match(finding.fix, /ENCRYPTION_KEY/);
  });

  it("calls a placeholder what it is", async () => {
    process.env.ENCRYPTION_KEY = "changeme";
    const { checkEnvironment } = await load();
    const finding = about(checkEnvironment(), "Sealing key");

    assert.equal(finding.severity, "serious");
    assert.match(finding.says, /placeholder|too short/);
  });

  it("says nothing about a key that is a real key", async () => {
    process.env.ENCRYPTION_KEY = STRONG;
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "Sealing key"), undefined);
  });
});

describe("the second database", () => {
  const WORKING = "postgresql://u:p@ep-one-pooler.eu-west-2.aws.neon.tech/neondb";

  it("says nothing when there is no second database, which is most deployments", async () => {
    process.env.DATABASE_URL = WORKING;
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "The second database"), undefined);
  });

  it("says nothing when it is genuinely a second database", async () => {
    process.env.DATABASE_URL = WORKING;
    process.env.SECOND_DATABASE_URL = "postgresql://u:p@ep-two-pooler.eu-west-2.aws.neon.tech/neondb";
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "The second database"), undefined);
  });

  it("catches one pointed at the database it was meant to be relieving", async () => {
    /* Everything works. Photographs write, the health screen reports a second
       database holding them, and not one byte has left the database that ran
       out of room. There is no symptom at all, which is the entire reason
       this check exists. */
    process.env.DATABASE_URL = WORKING;
    process.env.SECOND_DATABASE_URL = WORKING;
    const { checkEnvironment } = await load();

    const finding = about(checkEnvironment(), "The second database");
    assert.ok(finding, "a second database that is the first one was not reported");
    assert.match(finding.says, /same database/);
  });

  it("sees through the pooled and direct hosts of one database", async () => {
    /* They differ by "-pooler" and nothing else. Compared as typed they look
       like two databases, and this check would pass while freeing nothing. */
    process.env.DATABASE_URL = WORKING;
    process.env.SECOND_DATABASE_URL = "postgresql://u:p@ep-one.eu-west-2.aws.neon.tech/neondb";
    const { checkEnvironment } = await load();

    assert.ok(about(checkEnvironment(), "The second database"));
  });
});

describe("the pipeline to Data Bank", () => {
  it("says nothing at all when no hub is connected", async () => {
    /* A deployment with no hub is a perfectly ordinary deployment, and
       telling it off for not signing deliveries it never makes is how a
       checker becomes noise somebody stops reading. */
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "Data Bank signatures"), undefined);
    assert.equal(about(checkEnvironment(), "Data Bank key"), undefined);
  });

  it("asks for a signature once a hub is connected", async () => {
    process.env.DATABANK_URL = "https://databank.example";
    process.env.DATABANK_API_KEY = STRONG;
    const { checkEnvironment } = await load();

    const finding = about(checkEnvironment(), "Data Bank signatures");
    assert.ok(finding);
    assert.match(finding.says, /proves nothing about the body/);
  });

  it("notices an address with no key, which delivers nothing at all", async () => {
    process.env.DATABANK_URL = "https://databank.example";
    const { checkEnvironment } = await load();

    const finding = about(checkEnvironment(), "Data Bank key");
    assert.ok(finding);
    assert.match(finding.says, /held in the outbox/);
    assert.match(finding.fix, /databank:replay/);
  });

  it("is satisfied by a real key and a real signing secret", async () => {
    process.env.DATABANK_URL = "https://databank.example";
    process.env.DATABANK_API_KEY = STRONG;
    process.env.DATABANK_SIGNING_SECRET = STRONG;
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "Data Bank signatures"), undefined);
    assert.equal(about(checkEnvironment(), "Data Bank key"), undefined);
  });
});

describe("the sign-in limit", () => {
  it("says so when the count is only in this process's memory", async () => {
    const { checkEnvironment } = await load();
    const finding = about(checkEnvironment(), "Sign-in limit");

    assert.ok(finding);
    assert.equal(finding.severity, "serious");
    assert.match(finding.says, /per instance/);
  });

  it("is content once there is somewhere shared to count", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = STRONG;
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "Sign-in limit"), undefined);
  });
});

describe("whose address the limit is counted against", () => {
  it("catches a proxy count that is not a number", async () => {
    process.env.TRUSTED_PROXY_HOPS = "one";
    const { checkEnvironment } = await load();

    const finding = about(checkEnvironment(), "Proxies in front");
    assert.ok(finding);
    assert.equal(finding.severity, "serious");
    assert.match(finding.says, /the caller chose/);
  });

  it("accepts a number, including zero", async () => {
    for (const hops of ["0", "1", "2"]) {
      process.env.TRUSTED_PROXY_HOPS = hops;
      const { checkEnvironment } = await load();
      assert.equal(about(checkEnvironment(), "Proxies in front"), undefined, hops);
    }
  });
});

describe("WhatsApp", () => {
  it("catches being able to send while accepting unsigned deliveries", async () => {
    /* The worst shape of this: it works. Messages send, replies arrive, and
       anybody who finds the webhook address can file a situation report as
       any number they like. */
    process.env.WHATSAPP_TOKEN = STRONG;
    const { checkEnvironment } = await load();

    const finding = about(checkEnvironment(), "WhatsApp deliveries");
    assert.ok(finding);
    assert.equal(finding.severity, "serious");
  });

  it("says nothing when the signature check is configured", async () => {
    process.env.WHATSAPP_TOKEN = STRONG;
    process.env.WHATSAPP_APP_SECRET = STRONG;
    const { checkEnvironment } = await load();

    assert.equal(about(checkEnvironment(), "WhatsApp deliveries"), undefined);
  });
});

describe("the verdict", () => {
  it("separates what is dangerous from what is merely worth doing", async () => {
    process.env.ENCRYPTION_KEY = STRONG;
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.example";
    process.env.UPSTASH_REDIS_REST_TOKEN = STRONG;
    process.env.DATABANK_URL = "https://databank.example";
    process.env.DATABANK_API_KEY = STRONG;

    const { environmentVerdict } = await load();
    const verdict = environmentVerdict();

    assert.equal(verdict.ok, true, "an unsigned pipeline is not a reason to call a deployment unsafe");
    assert.ok(verdict.worthFixing >= 1);
  });

  it("reports every problem at once rather than the first one", async () => {
    /* A check that throws on the first problem turns setting this up into
       five deploys. */
    process.env.WHATSAPP_TOKEN = STRONG;

    const { checkEnvironment } = await load();
    const findings = checkEnvironment();

    assert.ok(findings.length >= 3, `only ${findings.length} problems reported`);
  });

  it("gives every finding something a person can act on", async () => {
    const { checkEnvironment } = await load();

    for (const finding of checkEnvironment()) {
      assert.ok(finding.name?.length, "a finding with no name");
      assert.ok(finding.says?.length > 20, `${finding.name} does not say what is wrong`);
      assert.ok(finding.fix?.length > 10, `${finding.name} does not say what to do`);
      assert.ok(
        ["serious", "worth-fixing", "fine"].includes(finding.severity),
        `${finding.name} has severity "${finding.severity}"`
      );
    }
  });

  it("never throws, whatever the environment holds", async () => {
    process.env.TRUSTED_PROXY_HOPS = "🙃";
    process.env.ENCRYPTION_KEY = "";
    process.env.DATABANK_URL = "not a url";

    const { checkEnvironment, environmentVerdict } = await load();
    assert.doesNotThrow(checkEnvironment);
    assert.doesNotThrow(environmentVerdict);
  });
});
