/**
 * How a session cookie is written, read and cleared — once, for both of them.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO SESSION SYSTEMS, ON PURPOSE, AND ONE SET OF COOKIE RULES
 *
 *  lib/session.js and lib/coordinator-session.js are twins, and they are
 *  separate on purpose: a coordinator's token is meaningless to the staff
 *  lookup and a staff token is meaningless to the coordinators', so neither
 *  can ever be presented to the other's table. Parameterising one module over
 *  a table name would have saved forty lines and turned a mistyped argument
 *  into a privilege escalation. That stays exactly as it is.
 *
 *  What does not need to be written twice is the *cookie policy* — the flags,
 *  the name, the lifetime — because it has no table in it and nothing about
 *  it can confuse one population for the other. And it is precisely the part
 *  that drifted: both files say "a change here has to be made twice, and the
 *  second one is the one that gets forgotten", which is a true and unhappy
 *  thing to have to write in a comment.
 *
 *  So the flags live here and the tables stay apart.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE `__Host-` PREFIX, AND WHY IT IS WORTH A MIGRATION ──────────────────
 * A cookie name beginning `__Host-` is one a browser will only accept if it is
 * Secure, has Path=/ and names no Domain. The last of those is the one that
 * matters here.
 *
 * Without it, anything that can set a cookie for a *parent* domain can set one
 * that this application will read: a forgotten subdomain, a marketing page on
 * a shared host, a preview deployment, an XSS anywhere under the same
 * registrable domain. The browser sends it along with ours and nothing in the
 * request says which of the two was set by us. With the prefix, a cookie set
 * for a parent domain simply cannot use the name, so the attack has nowhere to
 * land.
 *
 * ── AND NOBODY IS SIGNED OUT TO GET IT ─────────────────────────────────────
 * Renaming a session cookie signs out every person holding one. On a product
 * whose bad day is an election, "everybody signs in again" is not a thing to
 * schedule casually — so the old name is still *read*. A session created
 * before this change keeps working until it expires on its own, and every new
 * one is written under the protected name. Nothing has to be coordinated and
 * nothing has to be timed.
 *
 * ── SameSite=Lax, NOT Strict ───────────────────────────────────────────────
 * Strict would mean that following a link into this product from anywhere —
 * a briefing email, a message in a group, a link a colleague sent — arrives
 * signed out, because the browser withholds the cookie on a cross-site
 * navigation. For a newsroom tool shared by link that is a sign-in page
 * several times a day for no gain: Lax already withholds the cookie on every
 * cross-site *form post* and every subresource request, which is what the
 * cross-site request forgery case actually needs.
 */

/**
 * Is this deployment serving over HTTPS?
 *
 * The `__Host-` prefix requires Secure, and a Secure cookie is never stored by
 * a browser on a plain http origin — so on local development both the flag and
 * the prefix have to come off, or nobody can sign in at all.
 */
function overHttps() {
  return process.env.NODE_ENV === "production";
}

/**
 * The names a session may be found under, most protected first.
 *
 * @param base  the unprefixed name, e.g. "poll360_session"
 */
export function cookieNames(base) {
  return overHttps() ? [`__Host-${base}`, base] : [base];
}

/** The name new sessions are written under. */
export function cookieName(base) {
  return cookieNames(base)[0];
}

/**
 * Read a session token, accepting either name.
 *
 * Order matters: the protected name wins. If a browser somehow presents both —
 * an old session and a new one, or an old session and a cookie somebody set
 * from a neighbouring host — the one that could only have been set by this
 * application is the one that is used.
 */
export function readCookie(jar, base) {
  for (const name of cookieNames(base)) {
    const value = jar.get(name)?.value;
    if (value) return value;
  }
  return null;
}

/**
 * Write a session cookie.
 *
 * @param expires  when the browser should forget it. Omitted for a session
 *                 that should die when the browser closes, which is what
 *                 "do not remember me" means on a shared newsroom laptop.
 */
export function writeCookie(jar, base, token, { expires } = {}) {
  jar.set(cookieName(base), token, {
    /* Unreadable from JavaScript, so a script injected into a page cannot
       take it. This is the flag that matters most. */
    httpOnly: true,
    sameSite: "lax",
    secure: overHttps(),
    /* Required by the `__Host-` prefix, and right regardless: a cookie scoped
       to a path is a cookie that is missing on the page that needed it. */
    path: "/",
    ...(expires ? { expires } : {}),
  });
}

/**
 * Clear it, under every name it might be held under.
 *
 * ── BOTH NAMES, ALWAYS ─────────────────────────────────────────────────────
 * Signing out has to work unconditionally. Clearing only the name this
 * deployment currently writes would leave somebody holding a session under the
 * older name still signed in — having been told they were not, which is worse
 * than not offering the button.
 */
export function clearCookie(jar, base) {
  for (const name of cookieNames(base)) jar.delete(name);
  /* And the bare name too, in case this is running over http against a
     browser that kept a prefixed one from a previous deployment. */
  jar.delete(base);
}
