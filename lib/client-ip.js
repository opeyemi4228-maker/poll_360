/**
 * Where a request actually came from.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIRST ADDRESS IN X-FORWARDED-FOR IS NOT AN ADDRESS, IT IS A CLAIM
 *
 *  Every rate limit in this product was keyed on
 *  `x-forwarded-for.split(",")[0]`, which is the leftmost entry in a header
 *  the *client* is allowed to send. A caller who sets it themselves gets a
 *  brand new bucket on every request, so eight attempts per account became
 *  unlimited attempts per account, and the limiter that exists to stop
 *  somebody working through a password list stopped nobody.
 *
 *  It is not a subtle bug and it is invisible from the outside: the limiter
 *  still fires, still counts, still refuses — it simply never sees the same
 *  caller twice.
 *
 *  ── HOW THE HEADER ACTUALLY WORKS ──────────────────────────────────────
 *  Each proxy a request passes through *appends* the address it received the
 *  request from. So the list reads oldest-first:
 *
 *      X-Forwarded-For: <what the client claimed>, <client>, <proxy 1>
 *                        └── forged ──────────┘   └─ appended by us ──┘
 *
 *  Entries added by infrastructure we run are trustworthy. Everything to the
 *  left of them is whatever arrived, and whatever arrived can be anything.
 *  The real client is therefore found by counting *in from the right* by the
 *  number of proxies in front of this application — never by reading the
 *  left.
 *
 *  ── AND ON A PLATFORM, THERE IS A BETTER ANSWER STILL ──────────────────
 *  Hosts that terminate the connection themselves know the peer address for
 *  certain and put it in a header of their own, which they also strip from
 *  anything inbound so it cannot be forged. Vercel sets
 *  `x-vercel-forwarded-for` and `x-real-ip`. Those are preferred when present,
 *  because they need no counting and no configuration.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * This module imports nothing, so it can be tested without a request, a
 * database or a deployment.
 */

/**
 * Headers a hosting platform sets itself, in the order we trust them.
 *
 * Each of these is written by infrastructure that saw the connection, and is
 * removed from inbound requests by that same infrastructure. If one is
 * present, it is the answer and no counting is needed.
 */
const PLATFORM_HEADERS = [
  /* Vercel, which is where this deploys. Set from the TLS peer. */
  "x-vercel-forwarded-for",
  /* Cloudflare, for a deployment sitting behind it. */
  "cf-connecting-ip",
  /* Fly.io. */
  "fly-client-ip",
  /* nginx and most reverse proxies, when configured to set it. Last, because
     it is also the one an unconfigured proxy will pass straight through. */
  "x-real-ip",
];

/**
 * How many proxies sit in front of this application.
 *
 * One on Vercel: the platform's own edge. Behind a load balancer of your own
 * as well, it is two. Set `TRUSTED_PROXY_HOPS` to match, because getting it
 * wrong in either direction has a cost:
 *
 *   too low   the address read is one of ours, so every caller in the world
 *             shares one bucket and the first person to mistype their
 *             password locks out everybody
 *   too high  the address read is one the client supplied, which is the
 *             bug this file exists to fix
 *
 * One is the right default for the deployment this product actually has.
 */
function hops() {
  const declared = Number(process.env.TRUSTED_PROXY_HOPS);
  if (Number.isInteger(declared) && declared >= 0) return declared;
  return 1;
}

/**
 * Is this a plausible address at all?
 *
 * Deliberately loose: it is a shape check, not a parser. Its job is to refuse
 * a header value that is prose, a header injection attempt, or eight kilobytes
 * of padding designed to blow out a limiter's key space — not to validate
 * every corner of IPv6.
 */
function plausible(value) {
  if (!value) return false;
  const text = String(value).trim();
  if (!text || text.length > 45) return false;
  /* IPv4, IPv6, and the bracketed IPv6-with-port form some proxies emit. */
  return /^[0-9a-fA-F:.\[\]]+$/.test(text) && /[0-9a-fA-F]/.test(text);
}

/** Strip the port a proxy may have appended, in either family's spelling. */
function bare(value) {
  const text = String(value).trim();
  /* [2001:db8::1]:443 */
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(text);
  if (bracketed) return bracketed[1];
  /* 203.0.113.9:54321 — but never 2001:db8::1, which is all colons. */
  if ((text.match(/:/g)?.length ?? 0) === 1) return text.split(":")[0];
  return text;
}

/**
 * The caller's address, and whether we actually believe it.
 *
 * Returns both, because they are different facts and the callers want
 * different ones. A rate limiter needs a key and does not care how sure we
 * are; an audit entry recording who did something is a different matter, and
 * writing an unverified address into the record as though it were established
 * is how an investigation goes the wrong way eighteen months later.
 *
 * @param {Headers} headers
 * @returns {{ ip: string, trusted: boolean, claimed: string|null }}
 */
export function clientAddress(headers) {
  const get = (name) => headers?.get?.(name) ?? null;

  const forwarded = get("x-forwarded-for");
  const chain = forwarded
    ? forwarded.split(",").map((part) => bare(part)).filter(plausible)
    : [];
  /* What the caller would have us believe, kept for the audit note below. */
  const claimed = chain[0] ?? null;

  for (const name of PLATFORM_HEADERS) {
    const value = get(name);
    if (plausible(value)) {
      return { ip: bare(value), trusted: true, claimed };
    }
  }

  /* No platform header. Count in from the right by the number of proxies we
     run: the last entry was appended by the nearest one and names the address
     *it* received the request from, the one before that by the next, and so
     on. With one hop in front of us, that is the last entry. */
  const depth = hops();
  if (depth > 0 && chain.length >= depth) {
    return { ip: chain[chain.length - depth], trusted: true, claimed };
  }

  /* Either nothing forwarded it — a direct connection, which in development is
     the normal case — or the chain is shorter than the number of proxies we
     were told to expect, which means the configuration and the deployment
     disagree. Both end here, marked untrusted, and the caller decides. */
  if (chain.length) return { ip: chain[chain.length - 1], trusted: false, claimed };
  return { ip: "local", trusted: false, claimed: null };
}

/**
 * A rate-limiter key for an address.
 *
 * ── WHY AN UNTRUSTED ADDRESS IS NOT USED AS A KEY ──────────────────────────
 * Because keying on a value the caller chooses is the same as not keying at
 * all — worse, in fact, since it also lets one caller fill the limiter's map
 * with a million distinct keys. When the address cannot be established, every
 * such caller shares a single bucket. That is blunt, and it is the safe
 * direction to be blunt in: the alternative is a limiter that can be walked
 * straight past.
 */
export function limiterKey(address) {
  if (!address?.trusted) return "unverified";
  return address.ip;
}

/**
 * The same, from a Next `headers()` list, for the server actions that just
 * want one string.
 */
export function addressOf(headers) {
  return clientAddress(headers).ip;
}
