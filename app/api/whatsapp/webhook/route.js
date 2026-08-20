import { createHmac, timingSafeEqual } from "node:crypto";

import { handleInbound } from "@/lib/whatsapp-bot";
import { whatsapp } from "@/lib/db";

/**
 * The WhatsApp Cloud API webhook.
 *
 * ── TWO JOBS, AND THE SECOND ONE IS THE SECURITY BOUNDARY ──────────────────
 * GET answers Meta's subscription challenge once, at setup. POST receives
 * every message thereafter, and it is a public URL: anybody who finds it can
 * post whatever they like at it. So the signature is checked before the body
 * is trusted for anything, using the app secret only Meta and this server
 * hold, and compared in constant time so the comparison itself leaks nothing.
 *
 * ── AND IT ALWAYS ANSWERS 200 ──────────────────────────────────────────────
 * Once a delivery is authentic, this returns 200 even if handling it fails.
 * Meta retries a non-200 with backoff and eventually disables the webhook, so
 * a bug in one message must not cost the channel every message after it. The
 * failure is recorded and the delivery is acknowledged.
 * ───────────────────────────────────────────────────────────────────────────
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Meta's one-time subscription handshake. */
export async function GET(request) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  const expected = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!expected) {
    return new Response("WHATSAPP_VERIFY_TOKEN is not set on this server", { status: 503 });
  }

  if (mode === "subscribe" && token && safeEqual(token, expected)) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("verification failed", { status: 403 });
}

export async function POST(request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  /* Read once, as text, because the signature is over the exact bytes sent.
     Parsing first and re-serialising would change them and the check would
     fail for reasons that have nothing to do with authenticity. */
  const raw = await request.text();

  if (!secret) return new Response("not configured", { status: 503 });
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("bad signature", { status: 401 });
  }

  try {
    const payload = JSON.parse(raw);

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        const profiles = new Map(
          (value.contacts ?? []).map((row) => [row.wa_id, row.profile?.name ?? null])
        );

        for (const message of value.messages ?? []) {
          const phone = message.from;
          const kind = message.type;

          /* Only the shapes this bot can act on are unpacked. An unknown type
             is still recorded, so the desk sees that something arrived and
             can ring the agent, rather than the message vanishing. */
          const text =
            kind === "text"
              ? message.text?.body
              : kind === "button"
                ? message.button?.text
                : kind === "interactive"
                  ? message.interactive?.button_reply?.title ??
                    message.interactive?.list_reply?.title
                  : (message[kind]?.caption ?? "");

          const mediaId = message[kind]?.id ?? null;

          const outcome = handleInbound({
            phone,
            name: profiles.get(phone) ?? null,
            waId: message.id,
            text: text ?? "",
            kind: kind === "image" || kind === "document" ? "image" : "text",
            mediaId,
          });

          if (outcome.reply) await send(phone, outcome.reply);
        }
      }
    }
  } catch (error) {
    /* Acknowledged anyway. See the note at the top: a 500 here costs the
       channel, not just this message. */
    console.error("whatsapp webhook", error);
  }

  return new Response("ok", { status: 200 });
}

/** Constant time compare of the HMAC Meta signs each delivery with. */
function verifySignature(raw, header, secret) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  return safeEqual(header.slice(7), expected);
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  /* Length is compared first because timingSafeEqual throws on a mismatch,
     and a thrown comparison is a failed comparison, not an error. */
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Send a reply.
 *
 * With no access token configured the reply is already recorded as QUEUED by
 * the bot and simply never leaves, which is what makes the whole channel
 * demonstrable end to end without credentials: the desk shows the exact
 * conversation the agent would have had.
 */
async function send(to, body) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  if (!token || !phoneId) return;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });
  } catch (error) {
    console.error("whatsapp send", error);
  }
}
