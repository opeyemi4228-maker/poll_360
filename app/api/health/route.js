import { cached, cacheStats } from "@/lib/cache";
import { counterBacking } from "@/lib/shared-counter";
import { sessionCacheStats } from "@/lib/session-cache";
import { drainSoon, hubStats } from "@/lib/databank";
import { sql } from "@/lib/sql";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Is this instance able to do its job right now?
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS IS FOR, AND WHY IT IS NOT THE READINESS SCREEN
 *
 *  lib/readiness.js answers a different question — "is this deployment fit to
 *  run a real election", which is about demonstration accounts left enabled
 *  and a site address nobody set — and it is deliberately shown to a person on
 *  the dashboard where the buttons are, rather than served to a machine. Its
 *  own comment says so.
 *
 *  This is the machine's question, and there was no answer to it at all.
 *  Anything that puts more than one instance of this application behind one
 *  address — a platform's own router, a load balancer, a container scheduler —
 *  decides where to send the next request by asking each instance whether it
 *  is well. With no endpoint to ask, every instance is assumed well: one that
 *  has lost the database, or is still warming up, or is wedged, keeps being
 *  handed returns to file.
 *
 *  On an ordinary product that is a few error pages. Here it is a booth whose
 *  return did not save.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── AND IT PRINTS NOTHING A STRANGER COULD USE ─────────────────────────────
 * No connection strings, no key values, no counts of anything real, no names.
 * A health endpoint is unauthenticated by necessity — a router cannot sign in
 * — so it must be safe for the whole internet to read, and everything below is
 * either a yes/no or a number of milliseconds.
 *
 * The one thing it does say is whether the database answered and how quickly,
 * because that is the entire question and refusing to answer it would make the
 * endpoint pointless.
 */
export async function GET() {

  /* ── AND WHILE SOMEBODY IS ASKING, CLEAR THE BACKLOG ──────────────────────
     Anything that did not reach Data Bank is kept in an outbox and used to
     wait for a person to run a script — which means it waited until somebody
     noticed, and the whole design of that pipeline is that nothing visible
     happens when a forward fails.

     This endpoint is asked every few seconds by whatever routes traffic to
     this instance, which makes it the one piece of ordinary traffic that is
     guaranteed to keep happening. `drainSoon` runs at most once every thirty
     seconds per instance, is never awaited, and swallows everything: it
     cannot slow this answer down or change it. */
  drainSoon();

  /* ── THE PROBE IS SHARED FOR A SECOND, AND THAT IS NOT AN OPTIMISATION ──
     This endpoint has to be open — a router cannot sign in — and it touches
     the database, which together is an amplifier: one unauthenticated request
     becomes one database query, and anybody can send as many as they like.
     On the night this product cannot afford a slow database, that is a way to
     make it slow from outside with no credential at all.

     One second of sharing removes it. A router polling every few seconds
     still gets a freshly measured answer every time; a flood gets one query a
     second between all of them. It is short enough that it cannot hide an
     outage: a database that goes down is reported within a second. */
  const database = await cached(
    "health|database",
    async () => {
      const began = Date.now();
      try {
        /* The cheapest statement that proves a round trip actually happened. A
           health check that does not touch the database is a health check that
           stays green through the only outage that matters. */
        await sql`SELECT 1`;
        return { ok: true, ms: Date.now() - began };
      } catch (error) {
        return {
          ok: false,
          ms: Date.now() - began,
          /* The shape of the failure, never its detail: "unreachable" is what
             a router needs and a stack trace is what an attacker wants. */
          why: error?.unreachable ? "unreachable" : "failed",
        };
      }
    },
    { ttlMs: 1000 }
  );

  const body = {
    ok: database.ok,
    at: new Date().toISOString(),
    /* Which build is answering. The single most useful field on this endpoint
       when a deploy is half-rolled-out and two instances disagree. */
    build: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev",
    database,
    /* Where shared counts live on this deployment — "memory" means the
       sign-in limiter is per-instance, which is worth being able to see
       without reading the configuration. */
    limiter: counterBacking(),
    /* The pipeline to Data Bank: wired up, signed, and whether this instance
       has given up on the hub. */
    databank: hubStats(),
    cache: cacheStats(),
    /* Whether sessions are being recognised from memory, and for how long —
       which is the one setting on this deployment that trades a security
       guarantee for capacity, so it is worth being able to read it back. */
    sessions: sessionCacheStats(),
  };

  return Response.json(body, {
    /* 503 when the database is unreachable, which is the signal a router acts
       on: stop sending this instance work until it says otherwise. A 200 with
       `ok: false` inside would be read as healthy by everything that does not
       parse the body, which is most things. */
    status: database.ok ? 200 : 503,
    headers: {
      "cache-control": "no-store, max-age=0",
      /* Nothing else should be able to frame or embed this. */
      "x-content-type-options": "nosniff",
    },
  });
}
