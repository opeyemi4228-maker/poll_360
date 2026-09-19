/* With the extension, so the test suite can load this file in plain Node. */
import { NextResponse } from "next/server.js";

import { agentHost, agentUrl } from "./lib/agent-address.js";
import {
  makeNonce,
  rendersPerRequest,
  requestId,
  securityHeaders,
} from "./lib/security-headers.js";

const FIELD_PAGES = ["/field", "/governors"];

/**
 * Which pages an address shows, and what every response promises about itself.
 *
 * ── THE COORDINATORS' ADDRESS ──────────────────────────────────────────────
 * Requests arriving at NEXT_PUBLIC_AGENT_URL are shown the pages in app/agent,
 * at the root: /login is app/agent/login. Anything that is not a coordinator
 * page — /room, /admin — resolves to a missing page there, so that address
 * cannot be used as a second way into the rooms.
 *
 * ── THE MAIN ADDRESS ───────────────────────────────────────────────────────
 * /agent/... is sent across, temporarily rather than permanently: those
 * addresses are on briefing sheets and home screens, and a dead link on polling
 * morning costs a booth — see the note above `MOVED` for why a permanent one
 * cost exactly that.
 *
 * Only reads are moved. A form post is answered where it was sent, because a
 * redirected post loses what somebody typed standing at a booth.
 *
 * Authentication is not decided here. Every page and server action still checks
 * its own session; this file only chooses which page a request reaches.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AND IT IS WHERE THE CONTENT SECURITY POLICY IS DECIDED
 *
 *  A policy carrying a per-request nonce cannot live in next.config.mjs,
 *  because that file's headers are static strings written once at build time
 *  and a nonce that is the same on every request is not a nonce. It has to be
 *  generated here, where there is a request to generate it for, and handed to
 *  the renderer in a header so the framework can attach it to its own scripts.
 *
 *  See lib/security-headers.js for what the policy says and why, including
 *  the one part that is genuinely awkward: a page built once at deploy time
 *  has no request to make a nonce for, so those four pages get a different
 *  policy. Which pages those are is decided by `rendersPerRequest`, not
 *  guessed at here.
 * ══════════════════════════════════════════════════════════════════════════
 */
/* ── TEMPORARY, NOT PERMANENT, AND THIS COST A LIVE DEPLOYMENT ──────────────
   These hops used to answer 308. A browser is entitled to remember a permanent
   redirect for ever and stop asking, which is exactly what happened: a
   deployment was set to an agents' domain that had not been added to the
   project yet, every /agent/... link was permanently pinned to an address that
   answered nothing, and correcting the setting could not reach the browsers
   that had already cached it — people had to clear site data to escape.

   307 keeps the method and the body, is asked again every time, and costs one
   redirect per visit. That is the right trade for an address that is a
   deployment setting: settings change, and a wrong one must be recoverable by
   changing it back. */
const MOVED = 307;

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const onAgentHost = Boolean(agentHost) && addressedTo(request) === agentHost;

  /* ── THE NONCE HAS TO EXIST BEFORE THE RESPONSE DOES ───────────────────
     It travels two ways: into the request, so the renderer can put it on the
     framework's own script tags, and onto the response, in the policy the
     browser enforces. Both have to carry the same one, so it is made first
     and every branch below is handed it. */
  const dynamic = rendersPerRequest(pathname, { onAgentHost });
  const nonce = dynamic ? makeNonce() : null;
  const posture = {
    nonce,
    development: process.env.NODE_ENV === "development",
    secure: request.nextUrl.protocol === "https:",
    id: requestId(),
  };

  /* The policy the browser will be sent, computed once: the renderer needs to
     be handed the very same string, because it finds the nonce by reading it
     back out of this header rather than out of `x-nonce`. Two computations of
     "the same" policy is one nonce mismatch away from a blank page. */
  const headers = securityHeaders(posture);

  const routed = route(request, { onAgentHost, pathname, search, nonce, headers });
  return dress(routed, { headers, id: posture.id });
}

/** Which page this request reaches. Unchanged, and deliberately separate. */
function route(request, { onAgentHost, pathname, search, nonce, headers }) {
  if (!agentHost) return next(request, nonce, headers);

  const isRead = request.method === "GET" || request.method === "HEAD";
  const underAgent = pathname === "/agent" || pathname.startsWith("/agent/");
  const inner = pathname.slice("/agent".length) || "/";

  if (onAgentHost) {
    /* The long form of an address on the short address: tidy it, so there is
       only ever one spelling of each page to bookmark. */
    if (underAgent && isRead) {
      return NextResponse.redirect(new URL(inner + search, request.url), MOVED);
    }
    const target = new URL(request.url);
    target.pathname = pathname === "/" ? "/agent" : `/agent${pathname}`;
    return NextResponse.rewrite(target, forwarding(request, nonce, headers));
  }

  if (underAgent && isRead) {
    return NextResponse.redirect(agentUrl(inner) + search, MOVED);
  }

  return next(request, nonce, headers);
}

/**
 * Carry on, with the nonce added to what the renderer will see.
 *
 * ── WHY THE REQUEST HEADERS ARE REWRITTEN AND NOT ONLY THE RESPONSE'S ──────
 * The browser is told the policy by the response header. The renderer has to
 * be told the same nonce by a request header, or it has nothing to put on the
 * script tags — and a policy naming a nonce that appears nowhere in the page
 * blocks every script on it, which is a blank page for everybody.
 */
function next(request, nonce, headers) {
  return NextResponse.next(forwarding(request, nonce, headers));
}

function forwarding(request, nonce, headers) {
  const forwarded = new Headers(request.headers);

  /* ── AN INBOUND POLICY IS NOT A POLICY, IT IS AN INPUT ────────────────
     The framework finds the nonce by reading the `Content-Security-Policy`
     header *on the request*, and a request header is something the caller
     writes. On a page this file gives a nonce to, the line below overwrites
     whatever arrived and there is nothing to worry about — but on a page it
     does not, a caller's own header would be passed through to the renderer
     untouched.

     Nothing is known to escalate from that today: the pages without a nonce
     are the ones built at deploy time, whose policy allows inline scripts
     anyway, so a nonce injected into them grants nothing that was not already
     granted. It is removed regardless, because "harmless given today's
     policy" is a sentence that stops being true when the policy changes, and
     the change will be made by somebody who has not read this. */
  forwarded.delete("content-security-policy");
  forwarded.delete("x-nonce");

  if (!nonce) return { request: { headers: forwarded } };

  /* ── BOTH OF THESE, AND THE SECOND ONE IS NOT OPTIONAL ────────────────
     The framework does not read `x-nonce`. It finds the nonce by parsing the
     `Content-Security-Policy` header *on the request* and pulling the value
     out of `'nonce-…'`. Setting only `x-nonce` produces a page whose scripts
     carry no nonce at all, served with a policy that permits nothing else —
     which is a blank page, on every signed-in surface, with no error anybody
     can act on. `x-nonce` is set as well because a component that wants to
     put the nonce on a tag of its own can read it without parsing a policy. */
  forwarded.set("x-nonce", nonce);
  forwarded.set("Content-Security-Policy", headers["Content-Security-Policy"]);

  return { request: { headers: forwarded } };
}

/**
 * Put the security headers on whatever came back.
 *
 * ── ON EVERY ANSWER, INCLUDING THE REDIRECTS ───────────────────────────────
 * A redirect is a response a browser acts on, and one that can be framed,
 * sniffed or downgraded exactly like any other. Dressing only the rewrites
 * would leave every redirect from this file bare, which is the sort of gap nobody
 * finds because the pages all look right.
 */
function dress(response, { headers, id }) {
  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }

  response.headers.set("x-request-id", id);

  return response;
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
     served as they are on either address.

     ── AND WHY THE POLICY IS NOT PUT ON THOSE EITHER ────────────────────────
     A content security policy governs what a *document* may load. It means
     nothing on a JavaScript bundle, a font or a map tile, and running this
     file for every one of those is work on the busiest path in the product
     for no gain. The headers that do matter for them — nosniff, the cache
     rules, the frame rules — are set statically in next.config.mjs, which
     costs nothing per request. */
  matcher: ["/((?!_next/|api/|.*\\.[^/]+$).*)"],
};
