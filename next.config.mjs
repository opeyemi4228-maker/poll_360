/** @type {import('next').NextConfig} */
const nextConfig = {
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
            /* ── REPORT-ONLY, AND DELIBERATELY SO ─────────────────────────
               A content security policy is the single most effective thing
               left to add here, and also the single easiest one to ship
               broken: get one directive wrong and the app loads as a blank
               page for everybody, with no error anybody can act on. That is
               a poor trade to make blind on a product whose bad night is
               election night.

               So it goes out in report-only first. The browser enforces
               nothing and logs every violation to the console, which turns
               "what does this app actually load" from a guess into a list.
               Run the product for a day — the dashboards, the WhatsApp desk,
               the broadcast board in its iframe — collect what it complains
               about, then change this one key from
               `Content-Security-Policy-Report-Only` to
               `Content-Security-Policy` and it is enforced.

               Two notes on what is already here. `unsafe-inline` for scripts
               is not laziness: the App Router inlines its hydration payload,
               and removing it needs per-request nonces, which is a separate
               piece of work and belongs after this one. And `frame-ancestors`
               is deliberately absent — the broadcast board is *meant* to be
               embedded in vMix and OBS, that is handled by the X-Frame-Options
               rule below, and duplicating it here in a form that contradicts
               it would break the feature the product is sold on. */
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              /* Wikimedia is the only outside origin any image comes from,
                 and it comes from there because the board can hold a
                 reference the product itself does not know. */
              "img-src 'self' data: blob: https://upload.wikimedia.org",
              "font-src 'self' data:",
              "connect-src 'self'",
              "media-src 'self' blob:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join("; "),
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
           corporate proxy in a newsroom. */
        source: "/:prefix(console|field|login|room|broadcast|admin|whatsapp|gap|agent)/:path*",
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0, must-revalidate" },
        ],
      },
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
