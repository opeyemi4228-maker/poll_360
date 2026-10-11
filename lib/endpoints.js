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
    path: "/api/ask",
    methods: ["POST"],
    who: "Signed-in accounts that may open the room",
    guard: "session",
    what: "Ask Poll360: a question in words, answered from the record and narrowed to the ground the account holds. Forty questions in ten minutes per account.",
  },
  {
    path: "/api/ask/export",
    methods: ["POST"],
    who: "Signed-in accounts that may open the room",
    guard: "session",
    what: "An Ask Poll360 answer as a branded PDF, a CSV or XML. Prints only an answer sealed for the same account, and works every figure out again inside its ground.",
  },
  {
    path: "/api/ask/rows",
    methods: ["POST"],
    who: "Signed-in accounts that may open the room",
    guard: "session",
    what: "Any page of an Ask Poll360 answer's tables — searched and sorted across every row — for an answer sealed for the same account, worked out again inside its ground.",
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
  {
    path: "/api/irev/sheet",
    methods: ["GET"],
    who: "Accounts that verify returns",
    guard: "session",
    what: "One result sheet INEC published, for a named election and polling unit, fetched from the commission's storage and brought down to a size a screen needs.",
    note: "It takes an election and a unit, never an address: the address comes from what was gathered into Data Bank, so it cannot be made to fetch anything else.",
  },
  {
    path: "/api/declared/turn",
    methods: ["POST"],
    who: "Accounts that read our count against the commission's, from this site's own pages",
    guard: "session",
    what: "One reading of each shared sheet declared figures are fetched from, filing whatever has changed since the last reading.",
    note: "Asked for by any dashboard page that is open. A sheet read in the last two minutes is not read again, and the caller chooses nothing: the sheet's address was set by somebody allowed to enter declared figures.",
  },
  {
    path: "/api/irev/turn",
    methods: ["POST"],
    who: "Accounts that run the system console, from this site's own pages",
    guard: "session",
    what: "One short turn of the INEC gatherer: carries on any election being gathered, checks the watched ones, examines sheet pictures and reads sheets into figures.",
    note: "Asked for by any dashboard page that is open. Only one turn runs at a time however many pages ask.",
  },
  {
    path: "/api/agent/units",
    methods: ["GET"],
    who: "A signed-in agent, for themselves",
    guard: "session",
    what: "The polling units this agent is assigned to now.",
    note: "Asked by the agents' app while it is open, so an agent moved off a unit sees it go. Filing asks storage directly regardless.",
  },
  {
    path: "/api/agent/draft",
    methods: ["POST"],
    who: "A signed-in, approved agent",
    guard: "session",
    what: "Hands over an unsent draft when the agent is moved off a polling unit.",
    note: "Kept for the field desk to look at. It is never a result and nothing here writes to the count.",
  },
  {
    path: "/api/room/telemetry",
    methods: ["GET"],
    who: "The technical desk and the Super Admin",
    guard: "session",
    what: "The technical desk's measurements as JSON: database timings and sizes, results a minute, how stale each state is, queue depths.",
    note: "Counts, timings and ages only. No vote figure is in it.",
  },
  {
    path: "/api/room/events",
    methods: ["GET"],
    who: "Any account with a desk in the situation room",
    guard: "session",
    what: "What happened in the room since the last thing this screen heard: items opened and closed, lights that changed, reports from the field, and any SOS nobody has acknowledged.",
    note: "Narrowed on the server to the asker's ground and desk. Every open room screen asks every few seconds.",
  },
  {
    path: "/api/room/sheet",
    methods: ["GET"],
    who: "Accounts that may see result sheets, for a polling unit on their own ground",
    guard: "session",
    what: "The photographed result sheet for one polling unit.",
    note: "Anything else is answered not found, never forbidden, so the route cannot be used to ask whether a sheet exists.",
  },
  {
    path: "/api/room/pack/[id]",
    methods: ["GET"],
    who: "Legal, the Director and the Super Admin",
    guard: "session",
    what: "One sealed evidence pack, as a file.",
    note: "Hashed again on the way out and refused if it no longer matches its seal. Every download is recorded.",
  },
  {
    path: "/api/lights",
    methods: ["GET"],
    who: "Any account with a desk in the situation room",
    guard: "session",
    what: "The red, yellow, green or grey light on each place under a parent, with its counts, coverage and BVAS accredited.",
    note: "Narrowed to the asker's ground. A technical account is given the counts and not the BVAS figure.",
  },
  {
    path: "/api/lights/[areaCode]/items",
    methods: ["GET"],
    who: "Accounts that read live coverage, for a place on their own ground",
    guard: "session",
    what: "The open items behind one place's light.",
    note: "The place code is written with dashes in the address.",
  },
  {
    path: "/api/items/[id]/resolve",
    methods: ["POST"],
    who: "Whoever may resolve that item on that ground",
    guard: "session",
    what: "Resolve one open item with a reason.",
    note: "Nobody resolves an item they raised or a result they filed. Red items go to a zone lead, a lead verifier, the Director or the Super Admin.",
  },
  {
    path: "/api/assignments",
    methods: ["GET", "POST"],
    who: "The Super Admin",
    guard: "session",
    what: "Who files for which polling unit and who holds which ward: list them, or assign one.",
    note: "Every change needs a reason and is recorded with what was there before.",
  },
  {
    path: "/api/assignments/[id]/end",
    methods: ["POST"],
    who: "The Super Admin",
    guard: "session",
    what: "End one assignment. The agent loses that polling unit at once.",
    note: "The row is ended, never deleted, so the history stays.",
  },
  {
    path: "/api/assignments/move",
    methods: ["POST"],
    who: "The Super Admin",
    guard: "session",
    what: "End one assignment and start another in one step.",
    note: "Both happen or neither does.",
  },
  {
    path: "/api/assignments/bulk",
    methods: ["POST"],
    who: "The Super Admin",
    guard: "session",
    what: "Several assignment changes under one reason.",
    note: "All succeed or none do.",
  },
  {
    path: "/api/assignments/gaps",
    methods: ["GET"],
    who: "The Super Admin",
    guard: "session",
    what: "Where cover is missing in a state: polling units with no primary agent, wards with no coordinator, people with no assignment.",
    note: "Measured against INEC's own list, not against the rows that happen to exist.",
  },
  {
    path: "/api/assignments/history",
    methods: ["GET"],
    who: "The Super Admin",
    guard: "session",
    what: "Every assignment a place or a person has ever had.",
  },
  {
    path: "/api/assignments/import",
    methods: ["POST"],
    who: "The Super Admin",
    guard: "session",
    what: "Read the party's list of agents and coordinators and say what committing it would change.",
    note: "Writes nothing but the preview.",
  },
  {
    path: "/api/assignments/import/[previewId]",
    methods: ["GET"],
    who: "The Super Admin",
    guard: "session",
    what: "One preview: new people, new and changed assignments, what is missing from the new file, rows with errors and conflicts.",
  },
  {
    path: "/api/assignments/import/[previewId]/commit",
    methods: ["POST"],
    who: "The Super Admin",
    guard: "session",
    what: "Commit a previewed list.",
    note: "A manual assignment is never overwritten, and a missing one never ended, unless the request says so for that row.",
  },
  {
    path: "/api/irev/verify",
    methods: ["GET"],
    who: "Accounts that read our count against the commission's",
    guard: "session",
    what: "The verification account for one place: INEC's published sheets under it added up, our own returns under it, the two held together party by party, and every irregularity named.",
    note: "Always for the project being viewed and the one INEC election tied to it. The request names a state, local government or ward and nothing else.",
  },
  {
    path: "/api/irev/faults",
    methods: ["GET"],
    who: "Accounts that read our count against the commission's",
    guard: "session",
    what: "What is wrong with what INEC published under one place: polling units with no sheet, sheets that went up late, were replaced or are not where the portal says, counted by place, with the polling units behind each count.",
    note: "Always for the project being viewed and the one INEC election tied to it. It can hand the full list for one fault back as a spreadsheet.",
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

