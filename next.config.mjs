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
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
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
        source: "/:prefix(console|field|login|room|broadcast|admin|whatsapp|gap)/:path*",
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
