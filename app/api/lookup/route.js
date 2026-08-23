import { NextResponse } from "next/server";

import { consume, rateLimit } from "@/lib/ratelimit";
import { currentUser } from "@/lib/session";

/**
 * Looking something up that this product does not know.
 *
 * ── WHY THE BOARD IS ALLOWED OFF THE PRODUCT AT ALL ────────────────────────
 * Everything else the assistant says is computed from the same modules the
 * screens are drawn from, and that is the whole basis of trusting it on air.
 * But a room does not only discuss the count. Somebody asks who a returning
 * officer is, what a court actually ruled, where a town is. Refusing all of
 * that means the board is closed halfway through most real conversations,
 * and the person reaches for their phone instead — which is worse, because
 * then what they read never reaches the room at all.
 *
 * ── SO THE TWO ARE KEPT VISIBLY APART ──────────────────────────────────────
 * Anything from here arrives labelled with where it came from and when, and
 * is drawn differently from a figure this product computed. A card that says
 * "Wikipedia, read at 21:04" cannot be mistaken for a declared result, and
 * that distinction is the only thing that makes this safe to put on a screen
 * a broadcast is reading from.
 *
 * ── WHY WIKIPEDIA AND NOT A SEARCH ENGINE ──────────────────────────────────
 * It needs no key, which means this works on a fresh checkout rather than
 * only where somebody has been given credentials. It is attributable, which
 * a scraped search result is not. And it returns one summary rather than ten
 * links, which is what a board can actually hold. A keyed search provider can
 * be added beside it later; the shape of what this returns will not change.
 *
 * ── WHAT IT DELIBERATELY WILL NOT DO ───────────────────────────────────────
 * It takes a phrase and returns a summary. It does not take a URL and fetch
 * it: a signed-in endpoint that will fetch any address it is handed is a hole
 * straight into whatever this server can reach, and no feature here is worth
 * that.
 * ───────────────────────────────────────────────────────────────────────────
 */
export const dynamic = "force-dynamic";

/* Wikimedia asks that anything calling it identifies itself, and is entitled
   to refuse traffic that does not. */
const AGENT = "Poll360/1.0 (election situation room; contact via site operator)";

const WIKI = "https://en.wikipedia.org";

export async function GET(request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  /* ── EVERY CALL IS SPENT, NOT ONLY THE FAILED ONES ──────────────────────
     The limiter in this codebase was written for sign-in attempts, where only
     a failure is worth counting, so `rateLimit` asks and `consume` spends and
     the two are separate calls. Here it is the successes that need bounding:
     a microphone left open with the wake word armed is a machine that could
     ask this a hundred times an hour without anybody meaning to, at somebody
     else's service, in our name. So every call spends one. */
  const key = `lookup:${user.id}`;
  const limit = rateLimit(key, { limit: 30, windowMs: 5 * 60 * 1000 });
  if (!limit.ok) {
    return NextResponse.json(
      { error: "That is a lot of looking up at once. Try again in a few minutes." },
      { status: 429 }
    );
  }
  consume(key, { windowMs: 5 * 60 * 1000 });

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 2) {
    return NextResponse.json({ error: "Nothing to look up." }, { status: 400 });
  }

  try {
    /* ── THE FIRST HIT IS NOT ALWAYS AN ANSWER ────────────────────────────
       "INEC" — which this product will be asked more than almost anything
       else — returns a disambiguation page as its top result: a list of
       things the letters might mean, which reads as nonsense out loud and is
       worse than nothing on a board. Taking only the first hit threw that
       away and reported finding nothing, for a term the encyclopaedia
       plainly has. So a few candidates are tried and the first real page
       wins. */
    const candidates = await search(query);
    for (const key of candidates) {
      const summary = await summarise(key);
      /* No page at all behind this candidate. Try the next one — a missing
         page is a dead link, not a different answer. */
      if (!summary) continue;
      return NextResponse.json({ found: true, query, ...summary }, { headers: PRIVATE });
    }
    return NextResponse.json({ found: false, query }, { headers: PRIVATE });
  } catch {
    /* A reference that will not load is not an error worth a stack trace on a
       broadcast desk. The board says it could not reach it and carries on. */
    return NextResponse.json({ found: false, query, unreachable: true }, { headers: PRIVATE });
  }
}

const PRIVATE = { "Cache-Control": "private, max-age=300" };

/**
 * The closest few pages to what was said, best first.
 *
 * ── WHY FULL TEXT AND NOT TITLES ───────────────────────────────────────────
 * The title endpoint only matches the start of a page's name, so "INEC"
 * found the disambiguation stub and never reached "Independent National
 * Electoral Commission" — the single page this product's users are most
 * likely to ask for. People say the short form of an organisation's name;
 * encyclopaedias file it under the long one. Searching the text bridges that,
 * and it is the difference between a lookup that works for acronyms and one
 * that only works for things already named the way they are said.
 */
async function search(query) {
  const url = `${WIKI}/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=3`;
  const response = await fetch(url, {
    headers: { "Api-User-Agent": AGENT, "User-Agent": AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return [];

  const data = await response.json();
  return (data?.pages ?? []).map((page) => page.key).filter(Boolean);
}

/** The opening of that page, which is the part worth reading out. */
async function summarise(key) {
  const url = `${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(key)}`;
  const response = await fetch(url, {
    headers: { "Api-User-Agent": AGENT, "User-Agent": AGENT },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return null;

  const data = await response.json();
  if (!data?.extract) return null;

  /* ── A WORD THAT MEANS SEVERAL THINGS SAYS SO ──────────────────────────
     "INEC" is the commonest thing this product will be asked about and the
     encyclopaedia files it as a disambiguation page: a list of everything the
     letters might mean.

     Two obvious ways to handle that are both wrong. Discarding it reports
     finding nothing about a term plainly in there. Skipping to the next
     search result is worse — the second hit for "INEC" is a gubernatorial
     election page, and putting that on a board under the word somebody said
     is a confidently wrong answer on a screen a broadcast may be reading.

     So it comes back as what it is. The room hears which meanings exist and
     asks again with the one it wants, which takes four seconds and is
     correct, rather than being handed something plausible and unrelated. */
  if (data.type === "disambiguation") {
    return {
      ambiguous: true,
      title: data.title,
      extract: data.extract.length > 500 ? `${data.extract.slice(0, 500).trimEnd()}…` : data.extract,
      description: "Several things go by this name",
      image: null,
      href: data.content_urls?.desktop?.page ?? `${WIKI}/wiki/${encodeURIComponent(key)}`,
      source: "Wikipedia",
      at: Date.now(),
    };
  }

  return {
    title: data.title,
    /* Trimmed to what a person will actually listen to. The link is on the
       card for anybody who wants the rest. */
    extract: data.extract.length > 700 ? `${data.extract.slice(0, 700).trimEnd()}…` : data.extract,
    description: data.description ?? null,
    /* ── THE BIGGER PICTURE, WHERE THERE IS ONE ─────────────────────────
       The thumbnail is around 320px, which is a postage stamp on a wall
       display. The full image is offered as well and the card decides; a
       genuinely enormous original is skipped rather than pulled down a
       broadcast connection to be drawn four inches wide. */
    image:
      data.originalimage?.width && data.originalimage.width <= 2000
        ? data.originalimage.source
        : (data.thumbnail?.source ?? null),
    href: data.content_urls?.desktop?.page ?? `${WIKI}/wiki/${encodeURIComponent(key)}`,
    source: "Wikipedia",
    at: Date.now(),
  };
}
