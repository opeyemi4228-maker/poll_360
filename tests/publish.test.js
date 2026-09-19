import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CHANNELS, oauth1Header, readiness, relaySignature, sendEverywhere, verifyChannel } from "../lib/publish.js";
import { CAPTION_LIMITS, captionFor, clockWAT, freezeFigures, measure, placeOf, stampFor } from "../lib/stamp.js";
import { at } from "../lib/when.js";

/**
 * Publishing, pinned.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE PROMISE THESE TESTS HOLD THE DESK TO
 *
 *  Nothing is reported as posted unless a platform said it posted it. Every
 *  test below drives the real adapters against a fake network and checks the
 *  status that comes back, because the failure worth preventing is not a post
 *  that fails — that is shown and resent — but a post that fails and is
 *  shown as sent.
 * ══════════════════════════════════════════════════════════════════════════
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

const post = {
  id: "item-1",
  title: "Kano: APC ahead",
  text: { default: "caption", facebook: "fb caption", telegram: "tg caption", x: "x caption" },
  link: "https://poll360.ng/live/item-1",
  imageUrl: "https://poll360.ng/live/item-1/image?format=jpg",
};

/** A fake network: answers by matching the start of the address. */
function network(routes) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const hit = Object.entries(routes).find(([prefix]) => String(url).startsWith(prefix));
    if (!hit) throw new Error(`unexpected call to ${url}`);
    const [status, body] = typeof hit[1] === "function" ? hit[1](url, init) : hit[1];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

const FACEBOOK = { FACEBOOK_PAGE_ID: "123", FACEBOOK_PAGE_TOKEN: "page-token" };
const TELEGRAM = { TELEGRAM_BOT_TOKEN: "bot", TELEGRAM_CHANNEL: "@poll360" };

describe("which platforms are set up", () => {
  it("says what each one is missing, by name, and marks none set up with no settings", () => {
    const rows = readiness({}, { siteUrl: "https://poll360.ng" });
    assert.equal(rows.length, CHANNELS.length + 1, "every direct platform, and the relay");
    for (const row of rows) {
      assert.equal(row.configured, false, `${row.id} claims to be set up with nothing set`);
      assert.ok(row.missing.length > 0);
    }
  });

  it("accepts either token for Instagram", () => {
    const row = readiness({ INSTAGRAM_ACCOUNT_ID: "9", FACEBOOK_PAGE_TOKEN: "t" }, { siteUrl: "https://poll360.ng" })
      .find((entry) => entry.id === "instagram");
    assert.equal(row.configured, true);
  });

  it("warns when a platform that fetches the picture cannot reach the site", () => {
    const row = readiness({ THREADS_USER_ID: "1", THREADS_TOKEN: "t" }, { siteUrl: "http://localhost:3000" })
      .find((entry) => entry.id === "threads");
    assert.equal(row.configured, true);
    assert.ok(row.warning);
  });
});

describe("sending a post everywhere", () => {
  it("counts a platform as posted only when it returns the id of the post", async () => {
    const { fetchImpl } = network({
      "https://graph.facebook.com/": [200, { id: "p1", post_id: "123_456" }],
      "https://api.telegram.org/": [200, { ok: true, result: { message_id: 77, chat: { username: "poll360" } } }],
    });
    const rows = await sendEverywhere({
      post,
      bytes: PNG,
      platforms: ["facebook", "telegram"],
      env: { ...FACEBOOK, ...TELEGRAM },
      fetchImpl,
    });
    const by = Object.fromEntries(rows.map((row) => [row.platform, row]));
    assert.equal(by.facebook.status, "SENT");
    assert.equal(by.facebook.remoteUrl, "https://www.facebook.com/123_456");
    assert.equal(by.telegram.status, "SENT");
    assert.equal(by.telegram.remoteUrl, "https://t.me/poll360/77");
  });

  it("treats a success with no id as a failure", async () => {
    const { fetchImpl } = network({ "https://graph.facebook.com/": [200, {}] });
    const [row] = await sendEverywhere({ post, bytes: PNG, platforms: ["facebook"], env: FACEBOOK, fetchImpl });
    assert.equal(row.status, "FAILED");
    assert.match(row.error, /no post id/);
  });

  it("keeps the platform's own reason when it refuses", async () => {
    const { fetchImpl } = network({
      "https://api.telegram.org/": [400, { ok: false, description: "Bad Request: chat not found" }],
    });
    const [row] = await sendEverywhere({ post, bytes: PNG, platforms: ["telegram"], env: TELEGRAM, fetchImpl });
    assert.equal(row.status, "FAILED");
    assert.match(row.error, /chat not found/);
  });

  it("does not attempt a platform with no settings, and says so", async () => {
    const { fetchImpl, calls } = network({});
    const [row] = await sendEverywhere({ post, bytes: PNG, platforms: ["x"], env: {}, fetchImpl });
    assert.equal(row.status, "NOT_CONNECTED");
    assert.equal(calls.length, 0);
  });

  it("one platform failing does not stop the others", async () => {
    const { fetchImpl } = network({
      "https://graph.facebook.com/": () => {
        throw new Error("socket hang up");
      },
      "https://api.telegram.org/": [200, { ok: true, result: { message_id: 5, chat: {} } }],
    });
    const rows = await sendEverywhere({
      post,
      bytes: PNG,
      platforms: ["facebook", "telegram"],
      env: { ...FACEBOOK, ...TELEGRAM },
      fetchImpl,
    });
    assert.deepEqual(rows.map((row) => row.status).sort(), ["FAILED", "SENT"]);
  });

  it("publishes to Instagram in its two steps, from the public picture", async () => {
    const { fetchImpl, calls } = network({
      "https://graph.facebook.com/v23.0/9/media_publish": [200, { id: "ig-post" }],
      "https://graph.facebook.com/v23.0/9/media": [200, { id: "container" }],
      "https://graph.facebook.com/v23.0/container": [200, { status_code: "FINISHED" }],
      "https://graph.facebook.com/v23.0/ig-post": [200, { permalink: "https://instagram.com/p/x" }],
    });
    const [row] = await sendEverywhere({
      post,
      bytes: PNG,
      platforms: ["instagram"],
      env: { INSTAGRAM_ACCOUNT_ID: "9", FACEBOOK_PAGE_TOKEN: "t" },
      fetchImpl,
    });
    assert.equal(row.status, "SENT");
    assert.equal(row.remoteUrl, "https://instagram.com/p/x");
    assert.ok(String(calls[0].init.body).includes(encodeURIComponent(post.imageUrl)), "the picture is given by address");
  });

  it("posts to X as text with the link when X will not take the picture", async () => {
    const { fetchImpl, calls } = network({
      "https://api.x.com/2/media/upload": [403, { title: "Forbidden" }],
      "https://api.x.com/2/tweets": [201, { data: { id: "1799" } }],
    });
    const [row] = await sendEverywhere({
      post,
      bytes: PNG,
      platforms: ["x"],
      env: { X_API_KEY: "k", X_API_SECRET: "s", X_ACCESS_TOKEN: "t", X_ACCESS_SECRET: "ts" },
      fetchImpl,
    });
    assert.equal(row.status, "SENT");
    assert.ok(row.note, "the desk is told the picture did not go");
    const tweet = JSON.parse(calls.find((call) => call.url.endsWith("/2/tweets")).init.body);
    assert.equal(tweet.media, undefined);
    assert.equal(tweet.text, "x caption");
  });

  it("hands the platforms it cannot reach to the relay, signed", async () => {
    let seen = null;
    const { fetchImpl } = network({
      "https://hooks.example/": (url, init) => {
        seen = init;
        return [200, "ok"];
      },
    });
    const rows = await sendEverywhere({
      post,
      bytes: PNG,
      platforms: ["whatsapp", "linkedin"],
      env: { BROADCAST_RELAY_URL: "https://hooks.example/poll360", BROADCAST_RELAY_SECRET: "shh" },
      fetchImpl,
    });
    assert.deepEqual(rows.map((row) => row.status), ["RELAYED", "RELAYED"]);
    const body = JSON.parse(seen.body);
    assert.deepEqual(body.platforms, ["whatsapp", "linkedin"]);
    const expected = relaySignature("shh", seen.headers["x-poll360-timestamp"], seen.body);
    assert.equal(seen.headers["x-poll360-signature"], `sha256=${expected}`);
  });

  it("marks them for a person when there is no relay", async () => {
    const rows = await sendEverywhere({ post, bytes: PNG, platforms: ["tiktok"], env: {}, fetchImpl: network({}).fetchImpl });
    assert.equal(rows[0].status, "BY_HAND");
  });
});

describe("signing a request to X", () => {
  it("matches the worked example X publishes for OAuth 1.0a", () => {
    /* The example from X's "Creating a signature" guide. Its parameters are
       a form body there; OAuth signs query and form parameters identically,
       so here they ride in the query and must produce the same signature. */
    const header = oauth1Header({
      method: "POST",
      url:
        "https://api.twitter.com/1.1/statuses/update.json?include_entities=true&status=Hello%20Ladies%20%2B%20Gentlemen%2C%20a%20signed%20OAuth%20request%21",
      env: {
        X_API_KEY: "xvz1evFS4wEEPTGEFPHBog",
        X_API_SECRET: "kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw",
        X_ACCESS_TOKEN: "370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb",
        X_ACCESS_SECRET: "LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE",
      },
      nonce: "kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg",
      timestamp: 1318622958,
    });
    assert.match(header, /oauth_signature="hCtSmYh%2BiHYCEqBWrE7C7hYmtUk%3D"/);
  });
});

describe("checking a platform", () => {
  it("reports the account a working token belongs to", async () => {
    const { fetchImpl } = network({ "https://api.telegram.org/": [200, { ok: true, result: { title: "Poll360 Live" } }] });
    const answer = await verifyChannel("telegram", { env: TELEGRAM, fetchImpl });
    assert.deepEqual(answer, { id: "telegram", ok: true, account: "Poll360 Live" });
  });

  it("reports an expired token as a failure, in the platform's words", async () => {
    const { fetchImpl } = network({
      "https://graph.facebook.com/": [400, { error: { message: "Error validating access token: Session has expired" } }],
    });
    const answer = await verifyChannel("facebook", { env: FACEBOOK, fetchImpl });
    assert.equal(answer.ok, false);
    assert.match(answer.error, /expired/);
  });
});

describe("the stamp", () => {
  it("pins a state to a point inside it, and the country to its middle", () => {
    const kano = placeOf("STATE:19");
    assert.equal(kano.name, "Kano State");
    assert.equal(kano.code, "KAN");
    assert.ok(kano.lat > 10 && kano.lat < 13 && kano.lon > 7 && kano.lon < 10);
    assert.equal(placeOf("NATION").name, "Nigeria");
    assert.equal(placeOf("STATE:37").name, "FCT, Abuja");
  });

  it("does not invent a place for a scope it cannot read", () => {
    const place = placeOf("STATE:99");
    assert.equal(place.exact, false);
    assert.equal(place.name, "Nigeria");
  });

  it("tells the time in Lagos, across midnight", () => {
    assert.equal(clockWAT("2026-09-19T23:30:00Z"), "00:30 WAT");
    assert.equal(stampFor({ scope: "NATION", at: "2026-09-19T23:30:00Z" }).time, "00:30 WAT, 20 Sep 2026");
  });

  it("freezes the figures a card draws, and nothing it does not", () => {
    const frozen = freezeFigures({
      name: "Kano",
      filed: 10,
      reporting: 12.345,
      rows: ["should not survive"],
      parties: [{ id: "APC", count: 70, share: 70.04 }, { id: "NNPP", count: 30, share: 29.96 }],
    });
    assert.equal(frozen.rows, undefined);
    assert.equal(frozen.reporting, 12.3);
    assert.deepEqual(frozen.parties[0], { id: "APC", votes: 70, share: 70 });
  });
});

describe("captions", () => {
  const figures = freezeFigures({ name: "Kano", filed: 1200, reporting: 34.5, parties: [{ id: "APC", count: 5, share: 50 }] });
  const stamp = stampFor({ scope: "STATE:19", at: "2026-09-19T20:14:00Z" });
  const long = "Returns continue to arrive from the northern local governments. ".repeat(20);

  it("fits every platform's limit however long the words are", () => {
    for (const platform of Object.keys(CAPTION_LIMITS)) {
      const text = captionFor({ platform, body: long, figures, stamp, link: "https://poll360.ng/live/abc" });
      assert.ok(measure(text, platform) <= CAPTION_LIMITS[platform], `${platform} caption is too long`);
    }
  });

  it("never cuts the place, the time or what the figure rests on", () => {
    const text = captionFor({ platform: "x", body: long, figures, stamp, link: "https://poll360.ng/live/abc" });
    assert.match(text, /Kano State/);
    assert.match(text, /21:14 WAT/);
    assert.match(text, /not an official declaration/);
    assert.match(text, /https:\/\/poll360\.ng\/live\/abc/);
    assert.match(text, /…/, "a cut is marked as a cut");
  });

  it("counts a link as X counts it", () => {
    assert.equal(measure(`see https://example.com/${"a".repeat(200)}`, "x"), 4 + 23);
  });

  it("leaves the link off Instagram, where it cannot be pressed", () => {
    const text = captionFor({ platform: "instagram", body: "x", figures, stamp, link: "https://poll360.ng/live/abc" });
    assert.doesNotMatch(text, /https:/);
  });
});

describe("a moment, however the driver hands it over", () => {
  it("keeps a Date as it is, to the millisecond", () => {
    const moment = new Date("2026-09-19T15:29:48.528Z");
    assert.equal(at(moment).getTime(), moment.getTime());
  });

  it("reads a bare Postgres timestamp as UTC", () => {
    /* The old code appended "Z" to whatever came back. Given a Date that
       produced a time shifted by the machine's own offset — an hour out on a
       laptop in Lagos, right only because the host deploys in UTC. */
    assert.equal(at("2026-09-19 15:29:48.528").toISOString(), "2026-09-19T15:29:48.528Z");
    assert.equal(at("2026-09-19T15:29:48Z").toISOString(), "2026-09-19T15:29:48.000Z");
    assert.equal(at("2026-09-19T16:29:48+01:00").toISOString(), "2026-09-19T15:29:48.000Z");
  });

  it("answers nothing for nothing, and for a value that is not a time", () => {
    for (const value of [null, undefined, "", "   ", "not a date", new Date("nonsense")]) {
      assert.equal(at(value), null, `${String(value)} should be nothing`);
    }
  });
});
