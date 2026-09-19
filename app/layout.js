import { Inter_Tight, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";
import BootScript from "@/components/pwa/BootScript";
import { bootScript } from "@/lib/boot-script";

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
 * The two things that have to run before anything is drawn — the rail's
 * remembered width and the service worker — live in lib/boot-script.js, which
 * says what each does and why.
 *
 * ── WHY IT IS NOT next/script ANY MORE ─────────────────────────────────────
 * It was rendered with `beforeInteractive`, on the understanding that the
 * framework places such a script in the HTML to run during parse. In the App
 * Router it does not: an inline `beforeInteractive` script is queued on
 * `self.__next_s` and executed by the framework once its own bundle has
 * loaded, which is after the first paint. The rail this was written to hold
 * still snapped on a slow connection.
 *
 * It also broke hydration on every page rendered per request, because the
 * framework gave it the request's nonce on the server and had none to give it
 * on the client. It is a plain inline script now, allowed by its hash — see
 * components/pwa/BootScript.jsx and the script-src list in
 * lib/security-headers.js.
 */

export default function RootLayout({ children }) {
  return (
    <html
      lang="en-NG"
      /* The stylesheet sets scroll-behavior: smooth for in-page anchors. Next
         warns because it also applies to route changes, where it looks like a
         hang; this says the smoothness is deliberate and silences the warning
         without giving up the anchor scrolling. */
      data-scroll-behavior="smooth"
      /* Read by the boot script to version the service worker's address, so
         each deploy is a distinct worker. It is here rather than written into
         the script because a script that changed every deploy would need a
         new CSP hash every deploy. See lib/boot-script.js. */
      data-build={process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}
      className={`${interTight.variable} ${plexMono.variable} ${instrumentSerif.variable}`}
      /* ── THIS ELEMENT IS MEANT TO DIFFER FROM WHAT THE SERVER SENT ───────
         The boot script sets data-rail on it during parse, before React
         arrives — that is the whole point of the script, since a rail width
         applied after hydration is the snap it exists to prevent. The server
         cannot know the reader's stored preference, so React finds an
         attribute it did not render and reports a mismatch on every load for
         anybody who keeps the rail collapsed.

         This covers <html>'s own attributes and nothing beneath it: a real
         mismatch anywhere in the page is still reported. */
      suppressHydrationWarning
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

            ── AND WHY IT IS NOT next/script ──────────────────────────────
            `beforeInteractive` was meant to put this in the server's HTML to
            run during parse. It queues it for the framework's bundle to run
            instead, after the first paint, and it put a nonce on it that
            broke hydration on every page. So it is a plain inline script,
            allowed by its hash — see lib/boot-script.js — and rendered by a
            component that keeps React from warning about a script it is not
            meant to run. */}
        <BootScript html={bootScript()} />

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
