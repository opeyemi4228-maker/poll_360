/* With the extension, so the test suite can load this file in plain Node. */
import { NextResponse } from "next/server.js";

import { agentHost, agentUrl } from "./lib/agent-address.js";

const FIELD_PAGES = ["/field", "/governors"];

/**
 * Which pages an address shows.
 *
 * ── THE COORDINATORS' ADDRESS ──────────────────────────────────────────────
 * Requests arriving at NEXT_PUBLIC_AGENT_URL are shown the pages in app/agent,
 * at the root: /login is app/agent/login. Anything that is not a coordinator
 * page — /room, /admin — resolves to a missing page there, so that address
 * cannot be used as a second way into the rooms.
 *
 * ── THE MAIN ADDRESS ───────────────────────────────────────────────────────
 * /agent/... is sent across permanently. Those addresses are on briefing
 * sheets and home screens, and a dead link on polling morning costs a booth.
 *
 * Only reads are moved. A form post is answered where it was sent, because a
 * redirected post loses what somebody typed standing at a booth.
 *
 * Authentication is not decided here. Every page and server action still checks
 * its own session; this file only chooses which page a request reaches.
 */
export function proxy(request) {
  if (!agentHost) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const isRead = request.method === "GET" || request.method === "HEAD";
  const underAgent = pathname === "/agent" || pathname.startsWith("/agent/");
  const inner = pathname.slice("/agent".length) || "/";

  if (addressedTo(request) === agentHost) {
    /* The long form of an address on the short address: tidy it, so there is
       only ever one spelling of each page to bookmark. */
    if (underAgent && isRead) {
      return NextResponse.redirect(new URL(inner + search, request.url), 308);
    }
    const target = new URL(request.url);
    target.pathname = pathname === "/" ? "/agent" : `/agent${pathname}`;
    return NextResponse.rewrite(target);
  }

  if (underAgent && isRead) {
    return NextResponse.redirect(agentUrl(inner) + search, 308);
  }

  return NextResponse.next();
}

/**
 * The address the person actually typed.
 *
 * ── WHY NOT SIMPLY THE HOST HEADER ─────────────────────────────────────────
 * Because a sign-in landed agents on Poll360's own website. When a server
 * action ends in `redirect("/")`, Next does not send the browser to "/": it
 * fetches "/" itself, from the server's own origin (localhost, or the
 * deployment's internal address), and hands the result back in the action's
 * response. That fetch arrives here with the server's host, not the agents'
 * domain — so "/" was treated as the main site and the agent was shown the
 * marketing home page, with the address bar still reading the agents' domain.
 *
 * Next copies the original request's headers onto that fetch, including
 * `x-forwarded-host`, which it sets to the address the browser used (and which
 * the hosting platform sets in production). Reading that first makes the
 * internal fetch resolve exactly as the browser's own request would have.
 *
 * Trusting it is safe for what this file decides: which page a request
 * reaches, never who may see it. A caller who forges it on the main site gets
 * the agents' pages, which check their own session like every other page.
 */
function addressedTo(request) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("host");
}

export const config = {
  /* Framework files, API routes and anything with a file extension — the
     service worker, the manifest, icons, the unit lists under /geo — are
     served as they are on either address. */
  matcher: ["/((?!_next/|api/|.*\\.[^/]+$).*)"],
};
