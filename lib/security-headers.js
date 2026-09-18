/**
 * What every response says about how it may be treated.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CONTENT SECURITY POLICY WAS REPORT-ONLY, WHICH IS TO SAY IT WAS OFF
 *
 *  next.config.mjs has carried a `Content-Security-Policy-Report-Only` header
 *  for a while, with an honest note above it saying that enforcing one blind
 *  is a poor trade on a product whose bad night is election night, and that
 *  it should be run for a day and then switched on.
 *
 *  That reasoning was right and the day never came, which is what always
 *  happens to a header that has to be switched on by hand. Report-only
 *  enforces nothing: a script injected into a dashboard runs, the browser
 *  writes a line to a console nobody has open, and the page carries on.
 *
 *  ── AND THE POLICY IT WOULD HAVE ENFORCED WAS NOT WORTH MUCH ───────────
 *  `script-src 'self' 'unsafe-inline' 'unsafe-eval'` allows any inline
 *  script on the page to run, which is the attack. It was written that way
 *  for a real reason — the App Router inlines its own hydration payload —
 *  and the note says the fix is per-request nonces and that they are a
 *  separate piece of work.
 *
 *  This is that piece of work. Every dynamic response gets a fresh random
 *  nonce, the framework attaches it to its own scripts, and nothing else
 *  runs. `'unsafe-inline'` and `'unsafe-eval'` are gone from the enforced
 *  policy entirely.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY STATIC PAGES GET A DIFFERENT POLICY, AND NOT A WEAKER ONE BY MISTAKE
 * A nonce has to be in the HTML as well as in the header, and the framework
 * can only put it there while rendering a page for a request. Four pages in
 * this product are built once at deploy time and served as files — the
 * website, sign in, sign up, and the "waiting for approval" page — so there
 * is no request to render them for and no nonce to put in them. Sending a
 * nonce policy with those would block the framework's own scripts and serve a
 * blank page.
 *
 * So they get a policy without a nonce, which has to allow inline scripts and
 * therefore is weaker. That is not a hole being waved through: those four
 * pages hold no session, display nothing belonging to anybody, and take one
 * input each. Everything behind a sign-in — every room, every board, the
 * administrator's console, the agents' app — is rendered per request and gets
 * the strict one.
 *
 * ── IMPORTS NOTHING ────────────────────────────────────────────────────────
 * This is called from proxy.js, which runs in front of every request and, on
 * some deployments, at the edge. It has no dependencies and no I/O so that it
 * can run there and be tested here.
 */

/**
 * The paths rendered per request, and therefore the paths a nonce works on.
 *
 * ── WHY THIS LIST AND THE ONE IN next.config.mjs MUST AGREE ────────────────
 * That file names the same surfaces for a different reason — nothing behind a
 * sign-in belongs in a shared cache. The two lists answer different questions
 * about the same set of pages, and a page added to one and not the other is a
 * page that is either cacheable when it should not be, or served a policy it
 * cannot satisfy. `tests/security-headers.test.js` compares them.
 */
export const DYNAMIC_PREFIXES = [
  "/admin",
  "/agent",
  "/broadcast",
  "/console",
  "/field",
  "/gap",
  "/governors",
  "/room",
  "/whatsapp",
];

/**
 * Is this page rendered for the request, rather than built once at deploy?
 *
 * On the agents' own address every page is a coordinator's page — "/",
 * "/results", "/situations" — so the whole host is dynamic rather than a
 * prefix it does not use.
 */
export function rendersPerRequest(pathname, { onAgentHost = false } = {}) {
  if (onAgentHost) return true;
  return DYNAMIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * A fresh nonce.
 *
 * ── SIXTEEN BYTES, FROM THE PLATFORM'S OWN GENERATOR ───────────────────────
 * The whole value of a nonce is that an attacker cannot guess it, so it has
 * to come from a cryptographic source and be long enough that guessing is
 * hopeless. `crypto.getRandomValues` is available in every runtime this can
 * run in, including the edge, which `node:crypto` is not.
 */
export function makeNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  /* base64, which is what the CSP grammar expects. */
  return btoa(String.fromCharCode(...bytes));
}

/**
 * The Google ground, and the only reason this policy names anybody outside.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A STRICT POLICY THAT SILENTLY BREAKS A FEATURE IS NOT A STRICT POLICY,
 *  IT IS A BUG WITH A GOOD REPUTATION
 *
 *  With NEXT_PUBLIC_GOOGLE_MAPS_KEY set, components/dash/GoogleLayer.jsx puts
 *  Google's imagery under the Voters, Turnout and Clusters layers. It loads
 *  the Maps script from the browser, and Maps then fetches its tiles as
 *  images and talks to its own API over the network.
 *
 *  The script itself is fine: `'strict-dynamic'` lets an already-trusted
 *  script load more. The tiles and the API calls are not — `img-src 'self'`
 *  and `connect-src 'self'` would refuse both. The map would come up empty,
 *  or grey, with an error only somebody with a console open would see, on a
 *  layer a room turns on precisely when it wants to look closely at one
 *  cluster.
 *
 *  So these origins are named, and only when the key that turns the feature
 *  on is actually set. A deployment that does not use the Google ground —
 *  which is the default, and the room draws its own map either way — gets a
 *  policy that names nothing outside this origin at all.
 * ══════════════════════════════════════════════════════════════════════════
 */
const GOOGLE_MAPS = {
  /* The script, its own sub-scripts, and the API it calls. */
  connect: ["https://maps.googleapis.com", "https://maps.gstatic.com"],
  /* Tiles and imagery. Google serves them from several hosts and adds more,
     which is why these are wildcards rather than an exact list that would
     break quietly the day it changed. */
  img: [
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    "https://*.googleapis.com",
    "https://*.ggpht.com",
    "https://*.google.com",
  ],
  script: ["https://maps.googleapis.com"],
};

function usesGoogleGround() {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY);
}

/**
 * The policy for one response.
 *
 * @param nonce         the nonce for this request, or null for a built page
 * @param development   in development React uses `eval` to rebuild server
 *                      error stacks in the browser. Without `'unsafe-eval'`
 *                      the error overlay is a blank page, which is the worst
 *                      possible time to have no error message. It is never
 *                      added in production, where neither React nor the
 *                      framework uses `eval`.
 */
export function contentSecurityPolicy({ nonce = null, development = false } = {}) {
  const google = usesGoogleGround();
  const script = nonce
    ? [
        `'nonce-${nonce}'`,
        /* ── WHY 'strict-dynamic' AND NOT A LIST OF ORIGINS ───────────────
           The framework loads the rest of its JavaScript from scripts that
           the first one creates, and a nonce is not inherited. Without this,
           the page loads its first chunk and then stops, which looks exactly
           like a broken deploy. `'strict-dynamic'` says: a script that was
           trusted may load more. It also makes every host in this list be
           ignored by browsers that understand it, which is the point —
           trust follows the nonce rather than the address. */
        "'strict-dynamic'",
        ...(development ? ["'unsafe-eval'"] : []),
      ]
    : [
        /* No nonce is possible on a page built at deploy time. See the note
           at the top of this file for why that is four pages and which. */
        "'self'",
        "'unsafe-inline'",
        ...(development ? ["'unsafe-eval'"] : []),
        /* Named only on the built pages, where there is no nonce for
           `'strict-dynamic'` to carry trust from. On a page rendered for a
           request the nonce does that job and a host list is ignored. */
        ...(google ? GOOGLE_MAPS.script : []),
      ];

  return [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    /* ── STYLES KEEP 'unsafe-inline', AND THAT IS NOT LAZINESS ────────────
       Tailwind's generated classes are a stylesheet, but the framework and
       several components set inline `style` attributes — a chart's bar width,
       the countdown ring on every dashboard — and a nonce cannot cover a
       style *attribute*, only a <style> element. Nonce-ing stylesheets while
       attributes are blocked produces a page that renders with every
       computed dimension missing, which on a results board is a board of
       zero-width bars. The exposure from inline styles is real and small
       next to that. */
    "style-src 'self' 'unsafe-inline'",
    /* Wikimedia is the only outside origin any image comes from, and it
       comes from there because the board can hold a reference the product
       itself does not know. */
    ["img-src 'self' data: blob: https://upload.wikimedia.org", ...(google ? GOOGLE_MAPS.img : [])].join(" "),
    "font-src 'self' data:",
    /* `connect-src` is what a stolen script would use to send what it read
       somewhere else, so it is the one directive worth being strictest
       about. Only this origin. */
    ["connect-src 'self'", ...(google ? GOOGLE_MAPS.connect : [])].join(" "),
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    /* Nothing on this site is a plugin, an applet or an embed. */
    "object-src 'none'",
    /* A <base> tag an attacker controls rewrites every relative URL on the
       page, including the ones forms post to. */
    "base-uri 'self'",
    /* Where a form may post. This is the directive that stops an injected
       form sending a password somewhere else. */
    "form-action 'self'",
    /* `frame-ancestors` is deliberately absent — the broadcast board is
       *meant* to be embedded in vMix and OBS, that is the feature the
       product is sold on, and it is governed per path by the frame rules in
       next.config.mjs rather than contradicted here. */
    "upgrade-insecure-requests",
  ].join("; ");
}

/**
 * Headers that are the same for every response, whatever it is.
 *
 * ── WHY THESE ARE HERE AND NOT ALL IN next.config.mjs ──────────────────────
 * Most of them could be, and several already are. The ones below are the ones
 * that have to be decided per request — the policy, because it carries a
 * nonce — plus the ones that belong beside it because they are read together
 * when somebody is working out what this product's posture actually is. A
 * posture split across two files is a posture nobody can state.
 */
export function securityHeaders({
  nonce = null,
  development = false,
  secure = true,
} = {}) {
  const headers = {
    "Content-Security-Policy": contentSecurityPolicy({ nonce, development }),

    /* ── THE ONE THAT WAS MISSING ALTOGETHER ───────────────────────────────
       Without this, the first request of every day is plain HTTP — somebody
       types the domain, the browser tries port 80, and the redirect to HTTPS
       happens *after* the session cookie has already been sent in the clear
       on a network somebody else controls. This tells the browser never to
       try that again.

       Two years, subdomains included, and submitted to the preload list, so
       even the very first visit from a new device is protected. That is a
       commitment: every subdomain of this domain must be able to serve
       HTTPS, now and for two years. For this product they all do — it is one
       deployment on two hostnames, both on the platform's own certificates. */
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",

    /* A browser guessing that an uploaded file is HTML and running it is how
       a photograph of a result sheet becomes a script. */
    "X-Content-Type-Options": "nosniff",

    "Referrer-Policy": "strict-origin-when-cross-origin",

    /* ── WHY THREE OF THESE ARE `self` AND NOT EMPTY ───────────────────────
       An empty allowlist is not "ask the user first", it is "this capability
       does not exist on this page", and it overrides the browser's own
       permission entirely — no prompt, no way for anybody to grant it back.
       It was set that way here once and silently switched off two features
       this product is sold on: the assistant could never hear a microphone
       on any machine, and the field form could not read the position it
       stamps a filed return with. `self` is the normal arrangement: this
       origin may ask, the person decides, nobody else may ask at all. */
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=(self), interest-cohort=()",

    /* ── ISOLATION FROM WHATEVER ELSE THE BROWSER HAS OPEN ─────────────────
       A newsroom machine has this product open beside everything else on the
       internet. These three sever the handles another tab could otherwise
       hold on this one: a window opened from here cannot reach back into the
       opener, and a document from elsewhere cannot read this one's
       resources. */
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",

    /* Nothing here needs a cross-origin isolated context, and requiring one
       would break the embedded broadcast board, so this is deliberately not
       `require-corp`. */

    /* ── AND ONE THAT IS NOT A DEFENCE ─────────────────────────────────────
       An identifier per request, echoed in the response, so a person saying
       "it failed at about nine" can be answered with the exact request. It
       costs nothing and it is the difference between an investigation and a
       search. */
  };

  if (!secure) {
    /* On http — development, or a health check on an internal address —
       promising HSTS would be a promise the deployment cannot keep, and
       upgrade-insecure-requests would break local development outright. */
    delete headers["Strict-Transport-Security"];
    headers["Content-Security-Policy"] = headers["Content-Security-Policy"]
      .replace("; upgrade-insecure-requests", "");
  }

  return headers;
}

/**
 * A short, unique name for one request.
 *
 * Not a secret and not a defence: an identifier that lets a log line, a
 * response and a person's complaint be lined up with each other.
 */
export function requestId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
