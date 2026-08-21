import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { currentUser } from "./session";
import { can, homeFor, mayOpen } from "./roles";
import { audit } from "./db";

/**
 * The one way into a dashboard.
 *
 * ── CHECKED ON THE SERVER, ON EVERY REQUEST ────────────────────────────────
 * Not in middleware, not in a layout that a client route change can skip, and
 * never in the browser. Every dashboard page calls this as its first statement,
 * so there is no route that renders before the question "who is this and may
 * they be here?" has been answered against the database.
 *
 * A signed-out visitor is sent to sign in. A signed-in one who has wandered
 * into somebody else's room is sent to their own, not shown a 403, which
 * would confirm the other room exists and is worth attacking.
 * ───────────────────────────────────────────────────────────────────────────
 */
export async function requireUser(pathname) {
  const user = await currentUser();

  if (!user) {
    /* `next` is deliberately not echoed back into the redirect: an open
       redirect on a sign-in page is how a phishing link gets to wear your
       domain. The role's own home is where they land. */
    redirect("/login");
  }

  if (pathname && !mayOpen(user.role, pathname)) {
    await log(user, "access:denied", pathname);
    redirect(homeFor(user.role));
  }

  return user;
}

/** Require a specific capability, not merely a signed-in session. */
export async function requireCapability(capability, pathname) {
  const user = await requireUser(pathname);

  if (!can(user.role, capability)) {
    await log(user, "capability:denied", capability);
    redirect(homeFor(user.role));
  }

  return user;
}

/** Write to the audit log with the caller's address attached. */
export async function log(user, action, subject, meta) {
  const list = await headers();
  await audit.record({
    actorId: user?.id ?? null,
    actorName: user?.name ?? null,
    action,
    subject,
    meta,
    ip: (list.get("x-forwarded-for")?.split(",")[0] ?? "local").trim(),
  });
}
