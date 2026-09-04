import { Inter_Tight, IBM_Plex_Mono, Instrument_Serif } from "next/font/google";

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

/* Structured data. The subject of this site is a piece of software, and the
   `about` edge says plainly what it does, a parallel count, which is not an
   official result. Search engines are one more surface where that distinction
   has to hold. */
const schema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      "@id": `${site.url}#software`,
      name: site.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: site.description,
      url: site.url,
      areaServed: { "@type": "Country", name: "Nigeria" },
      audience: {
        "@type": "Audience",
        audienceType:
          "Election situation rooms, broadcasters, observer missions and campaigns",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${site.url}#website`,
      url: site.url,
      name: site.name,
      inLanguage: "en-NG",
      about: { "@id": `${site.url}#software` },
    },
  ],
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
        {/* First tab stop on every page. */}
        <a href="#main" className="skip-link">
          Skip to main content
        </a>

        {/* Chrome belongs to whichever section the route is in: the public
            site gets the masthead and footer from app/(site)/layout.jsx, the
            dashboards get their own shell. The root layout owns only the
            document, the fonts and the things that must exist on every page. */}
        {children}

        {/* ── REGISTERING THE WORKER FROM THE DOCUMENT, NOT FROM REACT ─────
            This used to live entirely inside AppShell, and in a production
            build AppShell's chunk was never loaded by any route: the page
            hydrated, eleven chunks arrived, and /sw.js was never requested at
            all. So the product shipped with its offline support, its install
            prompt and its update notice quietly switched off, and nothing said
            so, because a worker that is never registered raises no error.

            Registration is now four lines in the document. It cannot be
            deferred, code-split away or lost behind a component that fails to
            mount, and it runs before hydration rather than after it, which is
            also when you want it. AppShell keeps the parts that are genuinely
            interface: the update offer, the install offer, the offline notice.

            The build id rides along, so each deploy is a distinct script to
            the browser and the worker names its caches after itself. Without
            it the file is byte-identical forever and a device that has visited
            once never takes another version. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              process.env.NODE_ENV === "production"
                ? `if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js?v=${
                    process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"
                  }').catch(function(){})})}`
                : /* In development the worker serves chunks from before the
                     last edit and the page dies on a missing module factory,
                     so it is removed rather than installed. */
                  `if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})})}`,
          }}
        />

        {/* Update offer, install offer, offline notice. Renders nothing at all
            until one of them has something to say. */}
        <AppShell />

        <script
          type="application/ld+json"
          // Static object authored in this repo; no user input reaches it.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      </body>
    </html>
  );
}
