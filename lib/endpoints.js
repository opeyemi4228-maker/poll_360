/**
 * The edges of the building: every address this product can be reached at.
 *
 * ── WHY THIS TABLE IS WRITTEN DOWN AND NOT WALKED ──────────────────────────
 * Reading `app/api` off disk at request time would be self-maintaining and
 * would also be wrong twice over: a serverless build does not ship its own
 * source tree, so the screen would be empty in the one place it matters, and
 * a filesystem walk can tell you a route exists and can never tell you who is
 * allowed through it. The thing an administrator needs from this screen is
 * exactly the part a walk cannot produce.
 *
 * So it is declared, and `tests/system.test.js` walks `app/api` at test time
 * and fails if the two ever disagree. The list cannot go stale without the
 * build going red, which is the only kind of hand-written list worth having —
 * and this file imports nothing, so that test runs on a machine with no
 * database and no configuration.
 * ───────────────────────────────────────────────────────────────────────────
 */

/**
 * Whether a setting exists, and never what it says.
 *
 * The same rule lib/system.js works under, restated here rather than imported
 * so this file keeps its one useful property: it depends on nothing. A
 * console is the screen somebody photographs to show a colleague what is
 * wrong, and the whole product's threat model assumes that photograph ends up
 * in a WhatsApp group.
 */
const presence = (name) => Boolean(process.env[name] && String(process.env[name]).trim());

export const ENDPOINTS = [
  {
    path: "/api/whatsapp/webhook",
    methods: ["GET", "POST"],
    who: "Meta, and nobody else",
    guard: "signature",
    what: "Where every WhatsApp message from the field arrives. GET is the one-time handshake that proves this server owns the address; POST is the messages themselves.",
    note: "Every delivery is checked against WHATSAPP_APP_SECRET before the body is read. An unsigned request is refused without being parsed.",
    inbound: true,
  },
  {
    path: "/api/export/results",
    methods: ["GET"],
    who: "Signed-in desks holding the download grant",
    guard: "session",
    what: "Counted returns as a file, narrowed to the ground and contest the account holds.",
  },
  {
    path: "/api/graphic",
    methods: ["GET"],
    who: "Signed-in broadcast desks",
    guard: "session",
    what: "Renders an air-ready frame as an image, for a studio to pull straight into a rundown.",
  },
  {
    path: "/api/graphic/preview",
    methods: ["GET"],
    who: "Signed-in accounts that write for the broadcast desk",
    guard: "session",
    what: "Draws the card a post would be while it is being written — the same builder and renderer the saved post uses — or, with ?as=json, the figures and stamp behind it.",
  },
  {
    path: "/api/graphic/post/[id]",
    methods: ["GET"],
    who: "Signed-in broadcast desks",
    guard: "session",
    what: "The card for one social post in any state, so the editor clearing it sees the exact picture every platform will be sent.",
    note: "Its public twin, /live/[id]/image, serves the same picture without a sign-in, and only once the post is on air: Instagram and Threads fetch it from there.",
  },
  {
    path: "/api/lookup",
    methods: ["GET"],
    who: "Any signed-in account",
    guard: "session",
    what: "Looks a place or a person up for the assistant, so a question typed in a room can be answered with a fact rather than a guess.",
  },
  {
    path: "/api/me",
    methods: ["GET"],
    who: "Any signed-in account",
    guard: "session",
    what: "Who this session belongs to and which room it goes home to. What the app asks after it wakes up offline.",
  },
  {
    path: "/api/health",
    methods: ["GET"],
    who: "Anybody, including the router in front of this deployment",
    guard: "open",
    what: "Whether this instance can reach the database, and how quickly. What a load balancer asks before it sends the next return here.",
    note: "Unauthenticated by necessity — a router cannot sign in — so it prints no key, no address and no figure about the count. Answers 503 rather than 200 when the database cannot be reached, because that is the signal anything in front of this acts on.",
    inbound: true,
  },
  {
    path: "/api/media/[id]",
    methods: ["GET"],
    who: "Accounts holding the grant to see photographed sheets",
    guard: "session",
    what: "The photograph behind one return or incident. Served as bytes from the database, never as a public link.",
  },
];

/** The webhook Meta has to be pointed at, built from this deployment's own address. */
export function webhookAddress() {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  return {
    url: base ? `${base}/api/whatsapp/webhook` : null,
    /* The handshake cannot even be attempted without this, and the route says
       so with a 503 rather than pretending to verify. */
    canVerify: presence("WHATSAPP_VERIFY_TOKEN"),
    checksSignatures: presence("WHATSAPP_APP_SECRET"),
    canSend: presence("WHATSAPP_TOKEN") && presence("WHATSAPP_PHONE_ID"),
  };
}

