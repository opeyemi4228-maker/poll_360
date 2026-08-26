/**
 * Poll360 service worker.
 *
 * Hand-written rather than generated. A results product's caching rules are
 * editorial decisions, not build configuration: what may be served stale, what
 * must never be, and what the reader is told when it is. A plugin cannot make
 * those calls, and forty lines of explicit code beat a black box on the one
 * night this has to behave.
 *
 * ── THE RULE THAT MATTERS ──────────────────────────────────────────────────
 * Stale is not live. Anything that could carry a figure — a page, an API
 * response — is fetched from the network first and only falls back to the
 * cache when the network fails. The app then says so on screen, because a
 * cached count presented as a current one is the same lie as a grey state
 * painted in a party's colour.
 *
 * The only things served cache-first are assets that cannot go stale: files
 * whose URL contains their own content hash, and boundary geometry that
 * changes when a delimitation changes, which is to say almost never.
 * ───────────────────────────────────────────────────────────────────────────
 */

/* Bump to invalidate everything. The activate handler deletes any cache whose
   name is not in this list, so a deploy cannot leave a previous version's
   assets behind to be served alongside the new ones. */
/* ── THE VERSION COMES FROM THE URL, NOT FROM THIS FILE ────────────────────
   It used to be written here by hand, which meant it never changed, which
   meant every deploy shipped a worker the browser considered identical to the
   one it already had and declined to install. The page registers this script
   at /sw.js?v=<build>, so the build id arrives in our own location and every
   deploy is a distinct script with distinct caches. `activate` already deletes
   every cache whose name does not match, so the previous build's copies go the
   moment this one takes over.

   The fallback matters for the first load after this change ships, and for
   anyone who opens /sw.js directly. */
const BUILD = new URL(self.location.href).searchParams.get("v") || "unversioned";
const VERSION = `poll360-${BUILD}`;
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const ASSETS = `${VERSION}-assets`;
const KEEP = [SHELL, PAGES, ASSETS];

/* Precached at install so the offline page is available the first time it is
   needed rather than the second. Deliberately tiny — precaching the whole site
   would spend a field agent's data on pages they may never open. */
const PRECACHE = ["/offline", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(PRECACHE))
      /* A failed precache must not block the worker from installing; the
         offline page is a nicety, and losing it is not worth losing the
         whole service worker. */
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(names.filter((name) => !KEEP.includes(name)).map((name) => caches.delete(name)))
      )
      .then(() => self.clients.claim())
  );
});

/** Let the page tell a waiting worker to take over, when the reader is ready. */
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

const isHashedAsset = (url) =>
  url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");

const isGeometry = (url) => url.pathname.startsWith("/geo/");

/** Only ever store a real, complete, same-origin answer. */
function storable(response) {
  return response && response.status === 200 && response.type === "basic";
}

/**
 * Whether this answer may be handed back later *without asking the server*.
 *
 * The two strategies below need different permission, and conflating them is
 * what breaks a page. Keeping an offline copy of a document is a deliberate
 * choice this product makes and then announces on screen. Reusing a URL without
 * revalidating it is not a choice — it is only ever safe when that URL cannot
 * change its contents, and the server is the authority on that.
 *
 * A production build stamps its chunks `public, max-age=31536000, immutable`.
 * A development server marks the very same paths `no-cache, must-revalidate`,
 * because their bytes change on every save. Reading the header means the worker
 * cannot serve yesterday's chunk to today's HTML — the failure that takes a
 * page down with a missing module factory — whatever the rules above told it
 * to do with that path.
 */
function reusable(response) {
  if (!storable(response)) return false;

  const directives = (response.headers.get("Cache-Control") ?? "").toLowerCase();
  return !directives.includes("no-store") && !directives.includes("no-cache");
}

/** For URLs that carry their own content hash, and so cannot go stale. */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;

  const response = await fetch(request);
  if (reusable(response)) cache.put(request, response.clone());
  return response;
}

/**
 * Anything that might carry a number. Network wins; cache is the safety net.
 *
 * The copy is kept even when the document says `no-store` — which Next sends on
 * every page — because that header governs caches that answer *instead of* the
 * server, and this one never does. It is read only when the fetch has already
 * failed, and the app states plainly on screen that what is on it is from the
 * last time there was a signal. A held copy that announces its own age is the
 * whole point of the feature; without it an agent who walks out of coverage
 * loses the page they were reading.
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (storable(response)) cache.put(pageKey(request), response.clone());
    return response;
  } catch (error) {
    /* `ignoreVary` because the copy was stored under a bare URL: Next varies
       page responses on its router headers, and without this a navigation whose
       headers differ by one field from the stored one would miss a perfectly
       good document and fall through to the offline page. */
    const hit = await cache.match(pageKey(request), { ignoreVary: true });
    if (hit) return hit;
    throw error;
  }
}

/**
 * One cache entry per address, and no more.
 *
 * Next asks for the same page in more than one way. A navigation wants the HTML
 * document; the router also prefetches the same URL with an `RSC` header and
 * gets a flight payload back — a stream of component data, not a page. Both are
 * answers "for /", and `Cache.put` keyed on the request itself files them side
 * by side, because the response varies on headers rather than on the URL.
 *
 * Left alone that puts several entries under one address and, worse, lets a
 * flight payload be handed to a navigation once the network is gone: the reader
 * would get the raw data of a page instead of the page. Keying on the URL alone
 * means the document is the only thing stored for an address, and it is what
 * comes back. Prefetches are turned away in the fetch handler above, so the
 * document is the only thing that ever reaches here.
 */
function pageKey(request) {
  return new Request(new URL(request.url).pathname + new URL(request.url).search, {
    method: "GET",
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* Never touch anything but plain same-origin reads. A POST filing a result
     must reach the server or fail loudly — a service worker quietly answering
     one from a cache would be indefensible. */
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* The application tier is per-account and often scoped to a territory. None
     of it belongs in an on-device cache: the console carries a coordinator's
     own queue, and the sign-in page must never be answered from a copy taken
     while somebody else was signed in. */
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/console") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/login")
  ) {
    return;
  }

  /* Router traffic, not pages. An `RSC` request asks for a flight payload for a
     URL rather than the document at it, and a prefetch is speculative — the
     reader may never go there. Neither is ours to hold: Next already handles a
     failed prefetch by falling back to a normal navigation, which the block
     below does cache. Storing them would file component data under a page's
     address and spend a field agent's data on pages nobody opened. */
  if (request.headers.has("RSC") || request.headers.has("Next-Router-Prefetch")) return;

  if (isHashedAsset(url)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (isGeometry(url)) {
    event.respondWith(cacheFirst(request, ASSETS));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, PAGES).catch(
        async () =>
          (await caches.match("/offline")) ??
          new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
      )
    );
    return;
  }

  event.respondWith(networkFirst(request, PAGES).catch(() => Response.error()));
});
