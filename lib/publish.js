import { createHmac, randomBytes } from "node:crypto";

/**
 * Sending a cleared post to every platform at once.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DESK NOW PUBLISHES. WHAT IT WILL NEVER DO IS SAY IT DID WHEN IT DID NOT
 *
 *  This product used to stop one step short of posting, and said so on every
 *  screen: a person downloaded the card and pressed send. That was right for a
 *  desk of four on a slow night and wrong for a results night with a card a
 *  minute and seven platforms to feed — the hand-off became the bottleneck,
 *  and the bottleneck is where the wrong file gets posted to the wrong page.
 *
 *  So the last step is automated. The step before it is not. Nothing reaches
 *  this file that has not been written by one person and cleared by another
 *  (app/broadcast/actions.js), and nothing here runs on a timer: it is called
 *  when somebody takes a cleared post to air.
 *
 *  ── THE RULE EVERY ADAPTER BELOW KEEPS ─────────────────────────────────
 *  A platform counts as SENT only when it has answered with the id of the
 *  thing it published. A 200 with no id is a failure. A timeout is a failure
 *  — reported as "did not answer", because the post may or may not exist and
 *  the desk has to go and look rather than be told either. A platform with no
 *  credentials is not attempted and is recorded as not connected, never as
 *  sent and never silently dropped.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No database and no framework imports: `sendEverywhere` is handed the item,
 * the image and a `fetch`, and returns what happened. The tests drive it with
 * a fake fetch; the action drives it with the real one and records the result.
 */

/* ─────────────────────────────────────────────────────────── the channels ── */

/**
 * The platforms this product posts to itself.
 *
 * `needs` is the settings that must all be present. An entry that is an array
 * is "any one of these", for a token that can come from either of two places.
 * `publicImage` marks the platforms that fetch the picture from a web address
 * rather than accepting an upload — they need the site to be reachable from
 * the internet, which a laptop running `next dev` is not.
 */
export const CHANNELS = [
  {
    id: "facebook",
    label: "Facebook",
    needs: ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_TOKEN"],
    how: "Posts the card and caption to your Facebook Page.",
  },
  {
    id: "instagram",
    label: "Instagram",
    needs: ["INSTAGRAM_ACCOUNT_ID", ["INSTAGRAM_TOKEN", "FACEBOOK_PAGE_TOKEN"]],
    publicImage: true,
    how: "Posts the card to the Instagram business account linked to your Page.",
  },
  {
    id: "x",
    label: "X",
    needs: ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"],
    how: "Posts the card with a short caption and a link back to the full update.",
  },
  {
    id: "threads",
    label: "Threads",
    needs: ["THREADS_USER_ID", "THREADS_TOKEN"],
    publicImage: true,
    how: "Posts the card and caption to your Threads profile.",
  },
  {
    id: "telegram",
    label: "Telegram",
    needs: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHANNEL"],
    how: "Posts the card to your Telegram channel through your bot.",
  },
];

/**
 * The relay: everything this product does not post to itself.
 *
 * ── WHY ONE WEBHOOK RATHER THAN SIX MORE ADAPTERS ──────────────────────────
 * LinkedIn, TikTok, YouTube and WhatsApp Channels each want an app review, a
 * video, or an API that does not exist for this (WhatsApp has no way to post
 * to a Channel at all). An organisation that already runs Make, Zapier, n8n
 * or its own scheduler can reach every one of them from a single signed
 * webhook, and one well-described delivery is worth more than six adapters
 * nobody can get approved in time for polling day.
 */
export const RELAY = {
  id: "relay",
  label: "Relay",
  needs: ["BROADCAST_RELAY_URL"],
  how: "Sends each post to your own automation (Make, Zapier, n8n…), which can pass it on to LinkedIn, TikTok, YouTube, WhatsApp and anywhere else.",
};

/** Platforms the desk can aim a post at that only the relay (or a person) can reach. */
export const RELAYED = ["linkedin", "tiktok", "youtube", "whatsapp"];

const byId = Object.fromEntries([...CHANNELS, RELAY].map((row) => [row.id, row]));

const present = (env, name) => Boolean(env?.[name] && String(env[name]).trim());
const value = (env, name) => String(env?.[name] ?? "").trim();
const first = (env, names) => names.map((name) => value(env, name)).find(Boolean) ?? "";

/** Which settings a channel is missing, by name. */
export function missingFor(id, env = process.env) {
  const channel = byId[id];
  if (!channel) return [];
  return channel.needs
    .filter((need) => (Array.isArray(need) ? !need.some((name) => present(env, name)) : !present(env, need)))
    .map((need) => (Array.isArray(need) ? need.join(" or ") : need));
}

/**
 * Is each channel set up, and can it reach what it needs?
 *
 * Configured is not the same as working — a token can be present and expired
 * — which is why the desk also has `verifyChannel` below and says "set up"
 * rather than "connected" until that has answered.
 */
export function readiness(env = process.env, { siteUrl = "" } = {}) {
  const publicSite = /^https:\/\//.test(siteUrl) && !/localhost|127\.0\.0\.1/.test(siteUrl);
  return [...CHANNELS, RELAY].map((channel) => {
    const missing = missingFor(channel.id, env);
    const blocked = channel.publicImage && !publicSite;
    return {
      id: channel.id,
      label: channel.label,
      how: channel.how,
      configured: missing.length === 0,
      missing,
      warning:
        missing.length === 0 && blocked
          ? "This platform fetches the picture from the site's public address, and this deployment has none it can reach."
          : null,
    };
  });
}

/* ─────────────────────────────────────────────────────────────── plumbing ── */

const TIMEOUT_MS = 25_000;
const GRAPH = (env) => `https://graph.facebook.com/${value(env, "FACEBOOK_GRAPH_VERSION") || "v23.0"}`;
const THREADS = "https://graph.threads.net/v1.0";

/** A failure the desk can read. Platform error bodies are long; the message is enough. */
class Refused extends Error {}

async function call(fetchImpl, url, init = {}) {
  let response;
  try {
    response = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Refused("It did not answer in time. The post may or may not be up — check the account before resending.");
    }
    throw new Refused(`Could not reach it: ${error?.message ?? "network error"}.`);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.ok === false || body?.error) {
    const said =
      body?.error?.message ??
      body?.error?.error_user_msg ??
      (typeof body?.error === "string" ? body.error : null) ??
      body?.description ??
      body?.detail ??
      body?.title ??
      body?.errors?.[0]?.message ??
      text.slice(0, 200) ??
      "";
    throw new Refused(`${response.status}: ${String(said).trim() || "refused, with no reason given"}`);
  }
  return body ?? {};
}

const pngBlob = (bytes) => new Blob([bytes], { type: "image/png" });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ───────────────────────────────────────────────────── X, and its signing ── */

/**
 * RFC 3986 encoding, which is stricter than `encodeURIComponent`: OAuth 1.0a
 * signs the encoded form, and a `!` or `*` encoded the browser's way produces
 * a signature X refuses with nothing more helpful than a 401.
 */
export const rfc3986 = (text) =>
  encodeURIComponent(text).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/**
 * The Authorization header for one request to X, as a user.
 *
 * Only the OAuth parameters and the query string are signed. A JSON body and
 * a multipart body are not form-encoded, so under OAuth 1.0a they are not
 * part of the signature — which is what lets the media upload and the post
 * share one signer.
 */
export function oauth1Header({ method, url, env, nonce = randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000) }) {
  const target = new URL(url);
  const oauth = {
    oauth_consumer_key: value(env, "X_API_KEY"),
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(timestamp),
    oauth_token: value(env, "X_ACCESS_TOKEN"),
    oauth_version: "1.0",
  };
  const params = [...Object.entries(oauth), ...target.searchParams.entries()]
    .map(([key, val]) => [rfc3986(key), rfc3986(val)])
    .sort(([a, x], [b, y]) => (a === b ? (x < y ? -1 : 1) : a < b ? -1 : 1))
    .map(([key, val]) => `${key}=${val}`)
    .join("&");
  const base = [method.toUpperCase(), rfc3986(`${target.origin}${target.pathname}`), rfc3986(params)].join("&");
  const key = `${rfc3986(value(env, "X_API_SECRET"))}&${rfc3986(value(env, "X_ACCESS_SECRET"))}`;
  const signature = createHmac("sha1", key).update(base).digest("base64");
  return (
    "OAuth " +
    Object.entries({ ...oauth, oauth_signature: signature })
      .map(([name, val]) => `${rfc3986(name)}="${rfc3986(val)}"`)
      .join(", ")
  );
}

/* ─────────────────────────────────────────────────────────────── adapters ── */

/**
 * One function per platform: post this, return what it became.
 *
 * Each receives { caption, bytes, imageUrl, link } and returns
 * { remoteId, remoteUrl, note? } or throws Refused.
 */
const ADAPTERS = {
  async facebook({ caption, bytes }, env, fetchImpl) {
    const form = new FormData();
    form.set("message", caption);
    form.set("access_token", value(env, "FACEBOOK_PAGE_TOKEN"));
    form.set("source", pngBlob(bytes), "update.png");
    const body = await call(fetchImpl, `${GRAPH(env)}/${value(env, "FACEBOOK_PAGE_ID")}/photos`, {
      method: "POST",
      body: form,
    });
    const id = body.post_id ?? body.id;
    if (!id) throw new Refused("Facebook accepted it but returned no post id.");
    return { remoteId: String(id), remoteUrl: `https://www.facebook.com/${id}` };
  },

  async instagram({ caption, imageUrl }, env, fetchImpl) {
    const account = value(env, "INSTAGRAM_ACCOUNT_ID");
    const token = first(env, ["INSTAGRAM_TOKEN", "FACEBOOK_PAGE_TOKEN"]);
    const container = await call(fetchImpl, `${GRAPH(env)}/${account}/media`, {
      method: "POST",
      body: new URLSearchParams({ image_url: imageUrl, caption, access_token: token }),
    });
    if (!container.id) throw new Refused("Instagram did not prepare the picture.");
    await settle(fetchImpl, `${GRAPH(env)}/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`, "status_code");
    const published = await call(fetchImpl, `${GRAPH(env)}/${account}/media_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    if (!published.id) throw new Refused("Instagram accepted it but returned no post id.");
    const link = await call(fetchImpl, `${GRAPH(env)}/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({}));
    return { remoteId: String(published.id), remoteUrl: link.permalink ?? null };
  },

  async threads({ caption, imageUrl }, env, fetchImpl) {
    const user = value(env, "THREADS_USER_ID");
    const token = value(env, "THREADS_TOKEN");
    const container = await call(fetchImpl, `${THREADS}/${user}/threads`, {
      method: "POST",
      body: new URLSearchParams({ media_type: "IMAGE", image_url: imageUrl, text: caption, access_token: token }),
    });
    if (!container.id) throw new Refused("Threads did not prepare the picture.");
    await settle(fetchImpl, `${THREADS}/${container.id}?fields=status&access_token=${encodeURIComponent(token)}`, "status");
    const published = await call(fetchImpl, `${THREADS}/${user}/threads_publish`, {
      method: "POST",
      body: new URLSearchParams({ creation_id: container.id, access_token: token }),
    });
    if (!published.id) throw new Refused("Threads accepted it but returned no post id.");
    const link = await call(fetchImpl, `${THREADS}/${published.id}?fields=permalink&access_token=${encodeURIComponent(token)}`).catch(() => ({}));
    return { remoteId: String(published.id), remoteUrl: link.permalink ?? null };
  },

  async telegram({ caption, bytes }, env, fetchImpl) {
    const form = new FormData();
    form.set("chat_id", value(env, "TELEGRAM_CHANNEL"));
    form.set("caption", caption);
    form.set("photo", pngBlob(bytes), "update.png");
    const body = await call(fetchImpl, `https://api.telegram.org/bot${value(env, "TELEGRAM_BOT_TOKEN")}/sendPhoto`, {
      method: "POST",
      body: form,
    });
    const message = body.result;
    if (!message?.message_id) throw new Refused("Telegram accepted it but returned no message id.");
    const handle = message.chat?.username;
    return {
      remoteId: String(message.message_id),
      remoteUrl: handle ? `https://t.me/${handle}/${message.message_id}` : null,
    };
  },

  async x({ caption, bytes }, env, fetchImpl) {
    const sign = (method, url) => ({ Authorization: oauth1Header({ method, url, env }) });

    /* The picture first. If X will not take it, the update still goes — as
       text with the link, which X unfurls into the same card from the public
       page's preview image — and the desk is told the picture was refused
       rather than the post being lost over it. */
    let mediaId = null;
    let note = null;
    try {
      const upload = "https://api.x.com/2/media/upload";
      const form = new FormData();
      form.set("media", pngBlob(bytes), "update.png");
      form.set("media_category", "tweet_image");
      form.set("media_type", "image/png");
      const media = await call(fetchImpl, upload, { method: "POST", headers: sign("POST", upload), body: form });
      mediaId = media.data?.id ?? media.media_id_string ?? null;
      if (!mediaId) note = "X took the post but not the picture; the link carries the card.";
    } catch (error) {
      note = `X refused the picture (${error.message}); posted with the link, which shows the card.`;
    }

    const endpoint = "https://api.x.com/2/tweets";
    const posted = await call(fetchImpl, endpoint, {
      method: "POST",
      headers: { ...sign("POST", endpoint), "content-type": "application/json" },
      body: JSON.stringify(mediaId ? { text: caption, media: { media_ids: [String(mediaId)] } } : { text: caption }),
    });
    const id = posted.data?.id;
    if (!id) throw new Refused("X accepted it but returned no post id.");
    return { remoteId: String(id), remoteUrl: `https://x.com/i/web/status/${id}`, note };
  },
};

/**
 * Instagram and Threads fetch the picture in the background and will refuse
 * a publish that arrives before they have it. They say when they are ready;
 * this asks, briefly, rather than sleeping a fixed thirty seconds every time.
 */
async function settle(fetchImpl, url, field, { tries = 10, every = 2_000, sleep = wait } = {}) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const body = await call(fetchImpl, url).catch(() => ({}));
    const status = String(body?.[field] ?? "").toUpperCase();
    if (status === "FINISHED" || status === "PUBLISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new Refused("The platform could not fetch the picture from the site's public address.");
    }
    await sleep(every);
  }
}

/* ───────────────────────────────────────────────────────────── the relay ── */

/**
 * Sign a relay delivery the way Data Bank deliveries are signed, so a
 * receiver can check it came from here: HMAC-SHA256 over "timestamp.body".
 */
export function relaySignature(secret, timestamp, body) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

async function relay({ post, platforms }, env, fetchImpl) {
  const body = JSON.stringify({ type: "poll360.post", platforms, ...post });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = { "content-type": "application/json", "x-poll360-timestamp": timestamp };
  const secret = value(env, "BROADCAST_RELAY_SECRET");
  if (secret) headers["x-poll360-signature"] = `sha256=${relaySignature(secret, timestamp, body)}`;

  let response;
  try {
    response = await fetchImpl(value(env, "BROADCAST_RELAY_URL"), {
      method: "POST",
      headers,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new Refused(`The relay could not be reached: ${error?.message ?? "network error"}.`);
  }
  if (!response.ok) throw new Refused(`The relay answered ${response.status}.`);
  return { remoteId: null, remoteUrl: null };
}

/* ─────────────────────────────────────────────────────────── one dispatch ── */

/**
 * Send one cleared post everywhere it is aimed.
 *
 * @param post       { id, text: { [platform]: caption }, link, imageUrl, place, at, title }
 * @param bytes      the card as PNG bytes
 * @param platforms  where the desk aimed it
 * @param only       resend: attempt just these, leave the rest alone
 * @returns          one row per platform: { platform, status, remoteId, remoteUrl, error, note }
 *
 * Status is one of:
 *   SENT            the platform published it and gave back its id
 *   RELAYED         the relay accepted it; what the relay did next is its own
 *   FAILED          attempted and refused, or no answer — the reason is kept
 *   NOT_CONNECTED   no credentials, so not attempted
 *   BY_HAND         no route from here and no relay: a person must post it
 */
export async function sendEverywhere({ post, bytes, platforms = [], env = process.env, fetchImpl = fetch }) {
  const aimed = [...new Set(platforms)];
  const direct = aimed.filter((id) => ADAPTERS[id]);
  const indirect = aimed.filter((id) => !ADAPTERS[id]);

  const attempts = direct.map(async (platform) => {
    const missing = missingFor(platform, env);
    if (missing.length) {
      return { platform, status: "NOT_CONNECTED", error: `Not set up: ${missing.join(", ")}.` };
    }
    if (byId[platform].publicImage && !post.imageUrl) {
      return { platform, status: "FAILED", error: "This platform needs the picture at a public address, and there is none." };
    }
    try {
      const done = await ADAPTERS[platform](
        { caption: post.text?.[platform] ?? post.text?.default ?? "", bytes, imageUrl: post.imageUrl, link: post.link },
        env,
        fetchImpl
      );
      return { platform, status: "SENT", ...done };
    } catch (error) {
      return { platform, status: "FAILED", error: error instanceof Refused ? error.message : `Unexpected: ${error?.message ?? error}` };
    }
  });

  /* Everything without its own adapter goes through the relay in one
     delivery that names them all, so a receiver can fan out per platform. */
  const relayed = (async () => {
    if (!indirect.length) return [];
    if (missingFor("relay", env).length) {
      return indirect.map((platform) => ({
        platform,
        status: "BY_HAND",
        error: "No automatic route. Download the card and post it by hand, or set up the relay.",
      }));
    }
    try {
      await relay({ post, platforms: indirect }, env, fetchImpl);
      return indirect.map((platform) => ({ platform, status: "RELAYED", note: "Handed to your relay." }));
    } catch (error) {
      return indirect.map((platform) => ({ platform, status: "FAILED", error: error.message }));
    }
  })();

  const rows = [...(await Promise.all(attempts)), ...(await relayed)];
  return rows.map((row) => ({
    platform: row.platform,
    status: row.status,
    remoteId: row.remoteId ?? null,
    remoteUrl: row.remoteUrl ?? null,
    error: row.error ?? null,
    note: row.note ?? null,
  }));
}

/* ───────────────────────────────────────────────────────── checking a line ── */

/**
 * Ask a platform who we are, without posting anything.
 *
 * This is what turns "set up" into "connected". A token that is present and
 * expired passes `readiness` and fails here, which is exactly the thing to
 * find out at six in the evening rather than at the first result.
 */
export async function verifyChannel(id, { env = process.env, fetchImpl = fetch } = {}) {
  const missing = missingFor(id, env);
  if (missing.length) return { id, ok: false, error: `Not set up: ${missing.join(", ")}.` };
  try {
    if (id === "facebook") {
      const body = await call(fetchImpl, `${GRAPH(env)}/${value(env, "FACEBOOK_PAGE_ID")}?fields=name&access_token=${encodeURIComponent(value(env, "FACEBOOK_PAGE_TOKEN"))}`);
      return { id, ok: true, account: body.name ?? "Page" };
    }
    if (id === "instagram") {
      const token = first(env, ["INSTAGRAM_TOKEN", "FACEBOOK_PAGE_TOKEN"]);
      const body = await call(fetchImpl, `${GRAPH(env)}/${value(env, "INSTAGRAM_ACCOUNT_ID")}?fields=username&access_token=${encodeURIComponent(token)}`);
      return { id, ok: true, account: body.username ? `@${body.username}` : "Account" };
    }
    if (id === "threads") {
      const body = await call(fetchImpl, `${THREADS}/me?fields=username&access_token=${encodeURIComponent(value(env, "THREADS_TOKEN"))}`);
      return { id, ok: true, account: body.username ? `@${body.username}` : "Profile" };
    }
    if (id === "telegram") {
      const body = await call(fetchImpl, `https://api.telegram.org/bot${value(env, "TELEGRAM_BOT_TOKEN")}/getChat?chat_id=${encodeURIComponent(value(env, "TELEGRAM_CHANNEL"))}`);
      return { id, ok: true, account: body.result?.title ?? body.result?.username ?? "Channel" };
    }
    if (id === "x") {
      const url = "https://api.x.com/2/users/me";
      const body = await call(fetchImpl, url, { headers: { Authorization: oauth1Header({ method: "GET", url, env }) } });
      return { id, ok: true, account: body.data?.username ? `@${body.data.username}` : "Account" };
    }
    if (id === "relay") {
      /* Checking a relay means sending it something, and a relay wired
         straight to a live account would post it. So it is not checked; the
         last real delivery is the evidence. */
      return { id, ok: null, account: "Set up. Checked by its next delivery." };
    }
    return { id, ok: false, error: "Not a platform this desk posts to." };
  } catch (error) {
    return { id, ok: false, error: error instanceof Refused ? error.message : String(error?.message ?? error) };
  }
}
