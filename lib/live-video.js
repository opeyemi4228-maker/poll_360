/**
 * Going live: opening a live broadcast on the platforms, from one press.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT A WEB APPLICATION CAN AND CANNOT DO ABOUT LIVE VIDEO
 *
 *  It cannot send the video. Video leaves an encoder — OBS, Streamlabs, a
 *  hardware unit, a phone app — which opens an RTMP connection and pushes
 *  frames. No amount of code in this product changes that, and a "go live"
 *  button that pretended otherwise would be the worst kind of lie: the desk
 *  would believe it was broadcasting and nothing would be going out.
 *
 *  What it can do is everything around it, which is the part that actually
 *  costs a newsroom its first twenty minutes:
 *
 *    · create the live broadcast on each platform through its API, so the
 *      programme exists, is titled, and has a public address to share;
 *    · hand the encoder one address and one key per platform;
 *    · give the operator a picture to capture — the studio stage, which
 *      draws the cleared count as a full screen at 16:9;
 *    · and announce the programme everywhere else, with the link, through
 *      the same clearance every other post goes through.
 *
 *  So "go live" here means: the broadcast is open, the keys are ready, the
 *  stage is up and the audience has been told. The operator presses start in
 *  their encoder, and that is the one step this product does not claim.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Facebook is done through the Page's own live videos. YouTube needs an
 * OAuth grant per channel and a refresh token, and does it in three calls.
 * Instagram, X, TikTok and Threads have no interface for starting a live
 * broadcast at all — they are announced rather than opened, and the desk is
 * told which is which rather than left to guess.
 */

const TIMEOUT_MS = 20_000;

const value = (env, name) => String(env?.[name] ?? "").trim();
const has = (env, ...names) => names.every((name) => value(env, name));

/** Which platforms a live programme can be opened on, and which are told about it. */
export const LIVE_PLATFORMS = [
  {
    id: "facebook",
    label: "Facebook",
    opens: true,
    needs: ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_TOKEN"],
    how: "Opens a live video on the Page and gives the encoder its address and key.",
  },
  {
    id: "youtube",
    label: "YouTube",
    opens: true,
    needs: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"],
    how: "Creates the broadcast and its stream on the channel, and binds them together.",
  },
  {
    id: "x",
    label: "X",
    opens: false,
    how: "No interface for starting a live broadcast. Announced with the link instead.",
  },
  {
    id: "instagram",
    label: "Instagram",
    opens: false,
    how: "Live has to be started in the app. Announced with the link instead.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    opens: false,
    how: "Live has to be started in the app, or through a granted Live Studio key.",
  },
];

/** Which of them this deployment could open right now. */
export function liveReadiness(env = process.env) {
  return LIVE_PLATFORMS.map((row) => ({
    id: row.id,
    label: row.label,
    opens: row.opens,
    how: row.how,
    configured: row.opens ? has(env, ...row.needs) : false,
    missing: row.opens ? (row.needs ?? []).filter((name) => !value(env, name)) : [],
  }));
}

async function call(fetchImpl, url, init = {}) {
  const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.error) {
    const said = body?.error?.message ?? body?.error?.error_description ?? body?.error ?? text.slice(0, 200);
    throw new Error(`${response.status}: ${typeof said === "string" ? said : "refused"}`);
  }
  return body ?? {};
}

/* ─────────────────────────────────────────────────────────────── facebook ── */

async function facebookOpen({ title, description }, env, fetchImpl) {
  const version = value(env, "FACEBOOK_GRAPH_VERSION") || "v23.0";
  const body = await call(fetchImpl, `https://graph.facebook.com/${version}/${value(env, "FACEBOOK_PAGE_ID")}/live_videos`, {
    method: "POST",
    body: new URLSearchParams({
      status: "LIVE_NOW",
      title,
      description,
      access_token: value(env, "FACEBOOK_PAGE_TOKEN"),
    }),
  });
  if (!body.id) throw new Error("Facebook did not return the live video.");
  /* `secure_stream_url` is rtmps and carries the key in its path. It is a
     credential for the length of the programme and is shown once. */
  const ingest = body.secure_stream_url ?? body.stream_url ?? null;
  return {
    id: String(body.id),
    watch: body.permalink_url ? `https://www.facebook.com${body.permalink_url}` : `https://www.facebook.com/${body.id}`,
    ingest,
  };
}

async function facebookEnd(id, env, fetchImpl) {
  const version = value(env, "FACEBOOK_GRAPH_VERSION") || "v23.0";
  await call(fetchImpl, `https://graph.facebook.com/${version}/${id}`, {
    method: "POST",
    body: new URLSearchParams({ end_live_video: "true", access_token: value(env, "FACEBOOK_PAGE_TOKEN") }),
  });
}

/* ────────────────────────────────────────────────────────────── youtube ──── */

async function youtubeToken(env, fetchImpl) {
  const body = await call(fetchImpl, "https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: value(env, "YOUTUBE_CLIENT_ID"),
      client_secret: value(env, "YOUTUBE_CLIENT_SECRET"),
      refresh_token: value(env, "YOUTUBE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!body.access_token) throw new Error("YouTube would not renew the grant.");
  return body.access_token;
}

/**
 * YouTube takes three calls: the broadcast (what viewers see), the stream
 * (what the encoder pushes into), and the bind that joins them.
 */
async function youtubeOpen({ title, description }, env, fetchImpl) {
  const token = await youtubeToken(env, fetchImpl);
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const base = "https://www.googleapis.com/youtube/v3/liveBroadcasts";

  const broadcast = await call(fetchImpl, `${base}?part=snippet,status,contentDetails`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      snippet: { title, description, scheduledStartTime: new Date().toISOString() },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
      contentDetails: { enableAutoStart: true, enableAutoStop: true },
    }),
  });

  const stream = await call(fetchImpl, "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn", {
    method: "POST",
    headers,
    body: JSON.stringify({
      snippet: { title },
      cdn: { frameRate: "variable", ingestionType: "rtmp", resolution: "variable" },
    }),
  });

  await call(fetchImpl, `${base}/bind?id=${broadcast.id}&streamId=${stream.id}&part=id,contentDetails`, {
    method: "POST",
    headers,
  });

  const ingestion = stream.cdn?.ingestionInfo ?? {};
  return {
    id: String(broadcast.id),
    watch: `https://www.youtube.com/watch?v=${broadcast.id}`,
    ingest: ingestion.ingestionAddress ? `${ingestion.ingestionAddress}/${ingestion.streamName ?? ""}` : null,
    streamId: stream.id,
  };
}

async function youtubeEnd(id, env, fetchImpl) {
  const token = await youtubeToken(env, fetchImpl);
  await call(fetchImpl, `https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=${id}&part=id,status`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
}

/* ──────────────────────────────────────────────────────────── the presses ── */

const OPENERS = { facebook: facebookOpen, youtube: youtubeOpen };
const ENDERS = { facebook: facebookEnd, youtube: youtubeEnd };

/**
 * Open the programme everywhere it can be opened.
 *
 * @returns one row per platform: { platform, status, watch, ingest, error }
 *   OPEN        the broadcast exists and the encoder can push to it
 *   FAILED      the platform refused, with its reason
 *   NOT_SET_UP  no credentials, so not attempted
 *   ANNOUNCE    no interface for opening one; tell the audience instead
 */
export async function openLive({ title, description = "", platforms = [], env = process.env, fetchImpl = fetch }) {
  const wanted = platforms.length ? platforms : LIVE_PLATFORMS.map((row) => row.id);
  return Promise.all(
    wanted.map(async (platform) => {
      const row = LIVE_PLATFORMS.find((entry) => entry.id === platform);
      if (!row) return { platform, status: "FAILED", error: "Not a platform this desk knows." };
      if (!row.opens) return { platform, status: "ANNOUNCE", note: row.how };
      const missing = (row.needs ?? []).filter((name) => !value(env, name));
      if (missing.length) return { platform, status: "NOT_SET_UP", error: `Not set up: ${missing.join(", ")}.` };
      try {
        const open = await OPENERS[platform]({ title, description }, env, fetchImpl);
        return { platform, status: "OPEN", ...open };
      } catch (error) {
        return { platform, status: "FAILED", error: String(error?.message ?? error) };
      }
    })
  );
}

/** Close the programme on every platform it was opened on. */
export async function closeLive({ open = [], env = process.env, fetchImpl = fetch }) {
  return Promise.all(
    open.map(async (row) => {
      if (!ENDERS[row.platform] || !row.id) return { platform: row.platform, status: "SKIPPED" };
      try {
        await ENDERS[row.platform](row.id, env, fetchImpl);
        return { platform: row.platform, status: "ENDED" };
      } catch (error) {
        return { platform: row.platform, status: "FAILED", error: String(error?.message ?? error) };
      }
    })
  );
}
