/* ── THE AGENTS' OWN ADDRESS ─────────────────────────────────────────────────
   When NEXT_PUBLIC_AGENT_URL is set, this one deployment answers on a second
   domain with the agent pages at its root — see lib/agent-address.js and
   proxy.js. Two things below have to know that domain: the dev server, which
   otherwise refuses its own scripts to any hostname but localhost, and the
   no-store rule, because on that domain a signed-in page lives at "/results"
   and not under a prefix the path rule can see. A value that is not a full
   address is ignored here exactly as it is there. */
const agentAddress = (() => {
  try {
    return process.env.NEXT_PUBLIC_AGENT_URL ? new URL(process.env.NEXT_PUBLIC_AGENT_URL) : null;
  } catch {
    return null;
  }
})();

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* Development only: lets agent.localhost load the dev server's own scripts,
     so the agents' pages can be tried on their own address before deploying. */
  allowedDevOrigins: agentAddress ? [agentAddress.hostname] : [],

  /* ── WHY THIS IS RAISED FROM THE DEFAULT MEGABYTE ──────────────────────────
     Two things now travel to a server action as files: an agent photographs a
     result sheet so the figures they typed can be checked against it, and the
     situation room uploads a collation sheet of declared figures.

     The browser downscales a photograph to roughly 1280px before sending, which
     is a few hundred kilobytes in good light and comfortably over a megabyte
     from a dark, noisy phone camera pointed at a creased form — which is the
     condition every one of these pictures is taken in. At the default limit
     that upload is refused by the framework before any code here runs, so the
     agent sees a submission that never completes and there is nothing in the
     log to say why.

     Four megabytes covers the worst realistic photograph. The actions still
     check the size and the leading bytes themselves: a framework limit is a
     backstop, never a validation. */
  /* ── WHY THE SHEET READER IS NOT BUNDLED ───────────────────────────────────
     The local sheet reader is a WebAssembly engine that spawns a worker and
     loads its language data from disk at runtime. Bundlers rewrite the paths
     it uses to find both, and it then fails at the first photograph rather
     than at build time, which is the worst moment to discover it. Left
     external it is resolved by Node the ordinary way and simply works. */
  serverExternalPackages: ["tesseract.js"],

  /* ── A BUILD NEEDS A NAME THE BROWSER CAN SEE ─────────────────────────────
     The service worker caches under a version string. That string was written
     by hand, so it stayed the same across every deploy, and a browser decides
     whether to install a new worker by comparing the script byte for byte:
     identical bytes, no install. The old worker kept control, kept its caches,
     and a deploy could not reach a device that had already visited once.
     Serving /sw.js with no-cache did not help, because the file it re-fetched
     was the same file.

     So each build gets an identity. On Vercel it is the commit; locally it is
     the moment the build ran, which is different every time and is what you
     want when you are testing exactly this. The worker is then registered at a
     URL carrying it, which makes every deploy a new script to the browser and
     lets the worker name its caches after itself. */
  env: {
    NEXT_PUBLIC_BUILD_ID:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
      process.env.NEXT_PUBLIC_BUILD_ID ??
      Date.now().toString(36),
  },

  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },

  /* Nothing on this site loads an image from a host we do not own. The board
     draws SVG from `public/geo`, and result sheets — once the app tier lands —
     are served by our own authenticated route. An empty allowlist is one fewer
     origin the optimiser can be talked into fetching from. */
  images: {
    remotePatterns: [],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            /* ── THE POLICY ITSELF IS NO LONGER HERE ───────────────────────
               This carried a `Content-Security-Policy-Report-Only` header for
               a long time, with an honest note saying that enforcing one
               blind is a poor trade on a product whose bad night is election
               night, and that it should be run for a day and then switched
               on. The reasoning was right; the day never came, which is what
               always happens to a header that has to be switched on by hand.

               It is now enforced, with a fresh nonce per request, and it is
               set in proxy.js because a nonce cannot be a static string in
               this file. See lib/security-headers.js for what it says.

               ── WHAT STAYS HERE, AND WHY ────────────────────────────────
               proxy.js does not run for API routes, framework bundles or
               static files — deliberately, because a policy governs a
               document and means nothing on a font. So the headers those
               paths need are set here, where they cost nothing per request.

               ── AND THE ONE THAT WAS MISSING ALTOGETHER ─────────────────
               Without HSTS the first request of every day is plain HTTP:
               somebody types the domain, the browser tries port 80, and the
               redirect to HTTPS happens after the session cookie has already
               crossed a network in the clear. Two years, subdomains
               included, and submitted to the preload list so even a first
               visit from a new device is covered. */
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            /* ── WHY THREE OF THESE ARE `self` AND NOT EMPTY ───────────────
               An empty allowlist is not "ask the user first", it is "this
               capability does not exist on this page". It overrides the
               browser's own permission entirely: the request fails before any
               prompt is shown, and no amount of resetting site permissions,
               clicking the padlock or changing operating system settings will
               ever move it. That is exactly what it is for, and exactly why
               getting it wrong is so hard to diagnose from the outside.

               It was wrong here, and it was silently switching off two
               features this product is sold on:

                 microphone   Poll360 AI could never listen, on any machine,
                              in any browser. The assistant reported a blocked
                              microphone and sent people to their settings to
                              fix something that was never theirs.
                 geolocation  The field form stamps a filed result with where
                              it was filed from. That is the whole basis of
                              the coordinator watch knowing who is on station,
                              and it could not read a position at all.

               `self` restores the normal arrangement, which is the one that
               was wanted all along: this origin may ask, the user decides,
               and nobody else can ask at all. Camera stays closed, because
               nothing here opens a camera stream; the photo inputs use the
               operating system's own camera app, which this does not govern.
               ───────────────────────────────────────────────────────────── */
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(self), interest-cohort=()",
          },
        ],
      },
      {
        /* ── AN ANSWER THAT IS NOT A PAGE NEEDS ALMOST NOTHING ─────────────
           Every route under /api returns JSON, an image this server drew, or
           a file. None of them is a document, so none of them should be
           allowed to load a script, open a frame or be framed. `'none'`
           across the board is the honest description of what these need, and
           it means a route that somehow returned HTML — an error page, a
           stack trace, something reflected back — could not execute anything
           in a browser that opened it directly. */
        source: "/api/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'; sandbox" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
        ],
      },
      {
        /* Broadcast surfaces are *designed* to be embedded — a board in vMix or
           OBS is an iframe in someone else's scene, and a station's own page may
           legitimately frame one. So framing is allowed here and denied
           everywhere else, rather than denied globally and quietly breaking the
           feature the product is sold on. */
        source: "/((?!board).*)",
        headers: [{ key: "X-Frame-Options", value: "DENY" }],
      },
      {
        /* Nothing behind a sign-in belongs in a shared cache. The pattern
           matches the bare path as well as anything under it — one
           coordinator's console served to another from an intermediary cache
           would be the worst bug this product could have.

           Every signed-in surface is named here. An earlier version listed
           only three and left the situation room, the broadcast desk, the
           administrator's console and the WhatsApp desk cacheable — the four
           that carry the most, and the ones most likely to sit behind a
           corporate proxy in a newsroom.

           ── AND IT HAPPENED AGAIN, WITH /governors ─────────────────────
           Which is behind `requireUser` like every other room and was not in
           this list. A list of signed-in pages maintained by hand goes stale
           exactly once per page added, and nothing about the omission is
           visible from any screen. So it is no longer maintained by hand
           alone: `tests/security-headers.test.js` compares this list against
           the one lib/security-headers.js keeps of the pages rendered per
           request, and fails when a page appears in one and not the other.
           The test is what found this. */
        source: "/:prefix(console|field|login|room|broadcast|admin|whatsapp|gap|agent|governors|live)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
        ],
      },
      /* On the agents' own address every page is an agent's page — "/",
         "/results", "/situations" — so the whole host is kept out of shared
         caches, not a prefix it does not use. Placed before the service worker
         and boundary rules, which still apply their own on top. */
      ...(agentAddress
        ? [
            {
              source: "/:path*",
              has: [{ type: "host", value: agentAddress.hostname }],
              headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" }],
            },
          ]
        : []),
      {
        /* The service worker must never be served from a stale cache, or a
           deploy cannot reach a device that already has the old one. Browsers
           now bypass the HTTP cache for worker scripts anyway; this makes it
           true of intermediaries as well. Its scope header lets it control the
           whole origin from /sw.js. */
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        /* Projected boundaries are content-addressed by the build that made
           them; they change when a delimitation changes, which is to say
           almost never. */
        source: "/geo/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=3600, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
};

export default nextConfig;
