import Masthead from "@/components/site/Masthead";
import Footer from "@/components/site/Footer";
import { site } from "@/lib/site";

/**
 * The public site's chrome.
 *
 * ── WHY THIS IS A ROUTE GROUP AND NOT THE ROOT LAYOUT ──────────────────────
 * The masthead and footer belong to the *website*, the pages a visitor
 * browses. The dashboards are a different product with their own chrome, and
 * when this lived in the root layout every dashboard rendered with two headers
 * stacked on top of each other and a marketing footer underneath the audit
 * trail.
 *
 * A route group solves it without touching any URL: `(site)` does not appear
 * in a path, so `/`, `/login` and `/offline` are exactly where they were, and
 * `/admin`, `/field`, `/broadcast` and `/room` sit outside this layout and get
 * the dashboard shell instead.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Structured data. The subject of this site is a piece of software, and the
   `about` edge says plainly what it does, a parallel count, which is not an
   official result. Search engines are one more surface where that distinction
   has to hold.

   Here rather than in the root layout, because the root layout also renders
   the agents' app, which is a different app on a different domain and must not
   describe itself to anybody as Poll360. */
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
        audienceType: "Election situation rooms, broadcasters, observer missions and campaigns",
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

export default function SiteLayout({ children }) {
  return (
    <>
      <Masthead />
      <main id="main">{children}</main>
      <Footer />
      <script
        type="application/ld+json"
        // Static object authored in this repo; no user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
    </>
  );
}
