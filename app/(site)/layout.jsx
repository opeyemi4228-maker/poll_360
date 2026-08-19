import Masthead from "@/components/site/Masthead";
import Footer from "@/components/site/Footer";

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
export default function SiteLayout({ children }) {
  return (
    <>
      <Masthead />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}
