import { agentPath } from "./agent-address.js";

/**
 * The agents' app: its name, and how it installs on a phone.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A DIFFERENT APP FROM POLL360, ON A DIFFERENT DOMAIN
 *
 *  Agents do not sign in to Poll360. They open "Agents" on its own address,
 *  sign in with their code on its own page, and install it to their home
 *  screen under its own name and icon. Nothing an agent sees says Poll360, and
 *  nothing on Poll360's staff sign-in points at agents.
 *
 *  It is served by the same deployment — see lib/agent-address.js and
 *  proxy.js — so there is one database, one set of checks on every figure and
 *  one place to fix a bug. Separate to the people using it; one to maintain.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const AGENTS_APP = {
  name: "Agents",
  description: "Sign in with your code to report situations, send results and post updates from your polling unit.",
  /* The app's own ink, not Poll360's red: the launch screen and status bar
     are the first thing an agent sees, and they should not look like the
     staff product. */
  ink: "#0A0D14",
  accent: "#E4003B",
};

/** Where the icons are drawn; see app/agents-icons/[file]/route.js. */
export const AGENTS_ICONS = {
  favicon: "/agents-icons/32.png",
  apple: "/agents-icons/180.png",
};

/**
 * The web app manifest. On the agents' own domain the app lives at the root;
 * without one it lives under /agent on the main site, and installs from there
 * under a different id so it can never be mistaken for Poll360's install.
 */
export function agentsManifest() {
  const home = agentPath("/");
  return {
    name: AGENTS_APP.name,
    short_name: AGENTS_APP.name,
    description: AGENTS_APP.description,
    id: home,
    start_url: home,
    scope: home === "/" ? "/" : `${home}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: AGENTS_APP.ink,
    theme_color: AGENTS_APP.ink,
    lang: "en-NG",
    dir: "ltr",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/agents-icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/agents-icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/agents-icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Situations", short_name: "Situations", url: agentPath("/situations") },
      { name: "Results", short_name: "Results", url: agentPath("/results") },
      { name: "Updates", short_name: "Updates", url: agentPath("/updates") },
    ],
  };
}
