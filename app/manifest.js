import { site } from "@/lib/site";

/**
 * The installed app.
 *
 * Poll360 is installed by people who are about to stand outside a building for
 * eleven hours: a polling unit agent with one hand free, a coordinator working
 * a queue, a producer with a board open on a second screen. So it installs to
 * a home screen, opens without browser chrome, and keeps working when the
 * signal does not.
 *
 * `start_url` is the home page today because that is what exists. When the
 * field dashboard lands it becomes `/field`, which is where an installed copy
 * should open — nobody installs an app to read its marketing.
 *
 * `theme_color` is the brand red so the status bar continues the rule that
 * runs across the top of the masthead; `background_color` is the board, so the
 * launch screen is the surface the icon is already drawn on.
 */
export default function manifest() {
  return {
    name: `${site.name} — ${site.tagline}`,
    short_name: site.name,
    description: site.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0A0D14",
    theme_color: "#E4003B",
    lang: "en-NG",
    dir: "ltr",
    categories: ["news", "politics", "productivity", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      /* Android crops icons to whatever shape the launcher uses, so the
         maskable copy carries the mark well inside the safe circle. Without
         it, the dial loses its outer ticks on a round-icon launcher. */
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "The live board",
        short_name: "Board",
        description: "Coverage, standings and the map",
        url: "/#board",
      },
      {
        name: "Log in",
        short_name: "Log in",
        description: "File a result or check the queue",
        url: "/login",
      },
    ],
  };
}
