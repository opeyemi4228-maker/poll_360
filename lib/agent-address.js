/**
 * Where polling unit coordinators find Poll360.
 *
 * ── ONE APP, TWO ADDRESSES ─────────────────────────────────────────────────
 * The coordinator pages live in app/agent and always will. What changes is the
 * address a coordinator types. With NEXT_PUBLIC_AGENT_URL set, those pages are
 * served at the root of that address — /login, /join, /pending, / — by
 * proxy.js, and the main site sends anything under /agent across to it. Without
 * it, nothing moves and /agent/... works exactly as it always has, which is
 * what local development and preview deployments want.
 *
 * So every link into those pages is built here rather than written out, and a
 * page never has to know which of the two arrangements it is running under.
 *
 * ── WHY A BAD VALUE IS IGNORED RATHER THAN THROWN ──────────────────────────
 * This module is loaded by the proxy, which sits in front of every request. A
 * mistyped address that threw here would take the whole product down, results
 * desk and broadcast board included, to report a problem with one page. It is
 * logged loudly and the coordinator pages stay on /agent instead.
 */

function parse(raw) {
  const value = String(raw ?? "").trim().replace(/\/+$/, "");
  if (!value) return null;
  try {
    const url = new URL(value);
    return { origin: url.origin, host: url.host };
  } catch {
    console.error(
      `NEXT_PUBLIC_AGENT_URL is not a full address (${value}). Coordinator pages stay on /agent.`
    );
    return null;
  }
}

const address = parse(process.env.NEXT_PUBLIC_AGENT_URL);

/** The coordinators' own host, e.g. "poll360agents.com", or null when they share the main one. */
export const agentHost = address?.host ?? null;

/**
 * A path inside the coordinator pages, for use on those pages.
 * "/pending" stays "/pending" on their own address and is "/agent/pending" otherwise.
 */
export function agentPath(path = "/") {
  if (agentHost) return path;
  return path === "/" ? "/agent" : `/agent${path}`;
}

/**
 * The same, for use from the main Poll360 site: a full address when the
 * coordinator pages live somewhere else, because a relative link would stay
 * on the wrong one.
 */
export function agentUrl(path = "/") {
  if (!agentHost) return agentPath(path);
  return path === "/" ? address.origin : `${address.origin}${path}`;
}
