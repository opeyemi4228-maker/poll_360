import { Inter_Tight, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import Script from "next/script";

import "./globals.css";
import AppShell from "@/components/pwa/AppShell";
import { site } from "@/lib/site";

/* Three faces, one job each.

   Inter Tight carries the interface and the headlines: it holds its shape at
   900 across a full-width display line, which a normal-width grotesk does not.

   IBM Plex Mono carries every figure on the site. This is not a stylistic
   preference, a total that ticks from 9,999 to 10,000 in a proportional face
   reflows the words beside it, and a column of results in a proportional face
   is not a column. Tabular figures are a functional requirement of a results
   product.

   Instrument Serif appears exactly once, on the red statement block. A serif
   used once is an emphasis; a serif used everywhere is a texture.

   All three are self-hosted by next/font, so there is no render-blocking call
   to fonts.googleapis.com and no layout shift when the faces land. */
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter-tight",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-mono",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-instrument-serif",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}, ${site.tagline}`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "parallel vote tabulation",
    "PVT Nigeria",
    "election results platform",
    "situation room software",
    "election night broadcast graphics",
    "polling unit results",
    "INEC polling units",
    "election observation technology",
  ],
  openGraph: {
    title: `${site.name}, ${site.tagline}`,
    description: site.description,
    type: "website",
    locale: "en_NG",
    url: site.url,
    siteName: site.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.name}, ${site.tagline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },

  /* Installed-app metadata. `manifest` points at app/manifest.js; the rest is
     what iOS needs, because Safari implements none of the manifest's install
     behaviour and reads these instead. */
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: site.name,
    /* "default" rather than a translucent bar: the masthead is white with a
       red rule on it, and content sliding under the clock would put the
       wordmark behind the carrier name. */
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
  formatDetection: {
    /* Result sheets are full of numbers. Safari turning a polling unit code
       into a phone link on a page about polling unit codes is not helpful. */
    telephone: false,
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E4003B" },
    { media: "(prefers-color-scheme: dark)", color: "#060E20" },
  ],
  colorScheme: "light",
  /* Installed on a notched phone, the page should reach the edges of the
     screen rather than sit in letterboxes beside the cutout. */
  viewportFit: "cover",
};

/**
 * Deliberately not session-aware.
 *
 * Reading the session here would make every page render per request and, in an
 * installed app, would let the service worker cache one reader's chrome and
 * hand it to the next. The header's signed-in state is a client island instead
 * see components/auth/AuthNav.jsx, so these pages stay public, cacheable
 * and identical for everybody.
 */
/**
 * The two things that have to run before anything is drawn, in one script.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE SCRIPT, BECAUSE THE POLICY CAN ONLY REACH WHAT THE FRAMEWORK EMITS
 *
 *  The rail attribute was set by a `beforeInteractive` script and the worker
 *  was registered by a raw <script> element beside it. Under the enforced
 *  content security policy that stopped working: the framework lifts a
 *  `beforeInteractive` script into the document it is assembling and gives it
 *  the request's nonce, and it has no way to reach a bare element a component
 *  rendered. So the worker registration was the one script on every
 *  signed-in page carrying no nonce, and the browser refused to run it.
 *
 *  Nothing would have reported that. A worker that fails to register raises
 *  no error — the symptom is the offline support quietly not being there, on
 *  the product whose users are standing at a booth on a network that barely
 *  works. Which is, word for word, the failure described below as having
 *  happened once already.
 *
 *  Both jobs therefore share one script the framework owns. Each still runs
 *  during parse, ahead of anything being painted, which is what both needed
 *  anyway. Verified by reading the rendered HTML: on a page rendered for a
 *  request, every script tag on it carries that request's nonce.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHAT IT DOES, IN ORDER ─────────────────────────────────────────────────
 *
 *   THE RAIL      The dashboards remember whether their rail is collapsed,
 *                 and a remembered choice that arrives one frame late is
 *                 worse than none: the room watched the rail snap shut every
 *                 time it loaded a page. The attribute both the rail and the
 *                 sheet are sized from is set here, during parse. It reads
 *                 one key, writes one attribute and swallows its own errors,
 *                 because a browser with storage switched off should still
 *                 get a dashboard.
 *
 *   THE WORKER    Registration used to live inside AppShell, whose chunk was
 *                 never loaded by any route in a production build: the page
 *                 hydrated, eleven chunks arrived, and /sw.js was never
 *                 requested at all. The product shipped with its offline
 *                 support, its install prompt and its update notice quietly
 *                 switched off. Here it cannot be deferred, code-split away
 *                 or lost behind a component that fails to mount.
 *
 *                 The build id rides along, so each deploy is a distinct
 *                 script to the browser and the worker names its caches after
 *                 itself. Without it the file is byte-identical forever and a
 *                 device that has visited once never takes another version.
 *
 *                 In development the worker serves chunks from before the
 *                 last edit and the page dies on a missing module factory, so
 *                 it is removed rather than installed.
 *
 * Authored here in full. No user input reaches any of it.
 */
const boot = [
  `try{if(localStorage.getItem('poll360:rail-collapsed')==='1')document.documentElement.dataset.rail='collapsed'}catch(e){}`,
  process.env.NODE_ENV === "production"
    ? `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js?v=${
        process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
      }').catch(function(){})})}`
    : `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})})}`,
].join("");

export default function RootLayout({ children }) {
  return (
    <html
      lang="en-NG"
      /* The stylesheet sets scroll-behavior: smooth for in-page anchors. Next
         warns because it also applies to route changes, where it looks like a
         hang; this says the smoothness is deliberate and silences the warning
         without giving up the anchor scrolling. */
      data-scroll-behavior="smooth"
      className={`${interTight.variable} ${plexMono.variable} ${instrumentSerif.variable}`}
    >
      <body className="antialiased">
        {/* ── THE RAIL'S WIDTH, BEFORE THE FIRST PAINT ────────────────────
            The dashboards remember whether their rail is collapsed, and a
            remembered choice that arrives one frame late is worse than none:
            the room watched the rail snap shut every time it loaded a page.
            So the attribute both the rail and the sheet are sized from is
            set here, during parse, ahead of anything being drawn.

            It lives in the root layout because that is the only component
            whose output is always parsed as document HTML. Anywhere below it
            — it was in components/dash/DashLayout — a soft navigation
            re-renders the tree in the browser instead, and a <script> React
            creates in the browser never executes.

            Four lines on a public page that has no rail is the price; it
            reads one key, writes one attribute, and swallows its own errors,
            because a browser with storage switched off should still get a
            dashboard. Authored here, no user input reaches it.

            ── AND WHY IT IS next/script AND NOT A RAW TAG ──────────────────
            It was a bare <script>, which is the obvious way to write this and
            the one React 19 refuses to let pass quietly: a script element
            rendered by a component is never executed on the client, so React
            warns on every load that the thing cannot possibly do what it
            looks like it does. The warning is right about the mechanism and
            wrong about the intent — the tag was only ever meant to run in the
            server's HTML, which is exactly where it did run.

            `beforeInteractive` says that intent out loud instead of implying
            it. Next injects the script into the initial HTML from the server,
            ahead of any of its own modules, which is the behaviour this
            comment has been describing all along; and because Next owns the
            injection rather than React rendering an element, the console
            stops reporting a defect that was not one. It must live in the
            root layout, which is where it already was and where the note
            above explains it has to be. */}
        <Script
          id="poll360-boot"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: boot }}
        />

        {/* First tab stop on every page. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        {/* Chrome belongs to whichever section the route is in: the public
            site gets the masthead and footer from app/(site)/layout.jsx, the
            dashboards get their own shell. The root layout owns only the
            document, the fonts and the things that must exist on every page. */}
        {children}

        {/* Update offer, install offer, offline notice. Renders nothing at all
            until one of them has something to say. */}
        <AppShell />

        {/* Poll360's structured data lives in app/(site)/layout.jsx, on the
            public site it describes — not here, where it would also be printed
            into every page of the agents' app. */}
      </body>
    </html>
  );
}
