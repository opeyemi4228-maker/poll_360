/**
 * Where somebody was when the page went away.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A RELOAD SHOULD NOT COST SOMEBODY THEIR PLACE
 *
 *  This room keeps its views in local state rather than in the URL — that is
 *  a deliberate old decision, because a wall display whose address changes
 *  every time somebody presses a tab is a wall display nobody can bookmark.
 *  The cost of it is that every reload dropped the reader back at the front
 *  door.
 *
 *  On an ordinary web page that is a shrug. Here it is not: the room reloads
 *  on a flaky connection, on a browser update, on a laptop waking up, and on
 *  the twenty-second refresh timer if somebody's session lapses. Each time,
 *  whoever was three levels deep in a ward's verification queue was returned
 *  to the map and had to walk back down. At two in the morning that is the
 *  difference between watching a count and re-navigating to it.
 *
 *  So the last view is remembered. It is a convenience and nothing more —
 *  no figure, no name, no count, nothing about the election is written here.
 *
 *  ── AND A FRESH SIGN-IN IS NOT A RELOAD ─────────────────────────────────
 *  The two must not be confused. Somebody arriving at the start of a shift
 *  should be met by the screen the product wants them to start on — the
 *  command dashboard — and not by whatever tab the last person on that
 *  machine happened to leave open. A newsroom laptop is shared; the previous
 *  reader's place is not a preference, it is a leftover.
 *
 *  So signing in clears this, and only a reload restores it. `forget` is
 *  called by the login form; nothing else may call it.
 *
 *  ── WHY A COOKIE AND NOT LOCAL STORAGE ──────────────────────────────────
 *  This was local storage, and it worked in the sense that the right tab came
 *  back. It came back *second*: local storage does not exist on the server, so
 *  the first paint was always the room's front door and the remembered view
 *  replaced it a moment later. Every reload flashed a screen nobody asked for
 *  — and on a wall display, a dashboard that changes on its own is a dashboard
 *  somebody walks over to check.
 *
 *  A cookie is sent with the request. The server renders the remembered view
 *  itself, the browser's first paint is already correct, and there is no
 *  moment where the wrong screen is on the wall. That is not a refinement of
 *  the old approach; it is the only shape that has the property being asked
 *  for.
 *
 *  It carries a tab name and a timestamp. No figure, no name, no count,
 *  nothing about the election, so it is not sensitive and is deliberately
 *  readable by the browser that writes it — there is no server action here,
 *  and pressing a tab must not cost a round trip.
 *
 *  ── WHY IT EXPIRES ──────────────────────────────────────────────────────
 *  A tab remembered from three days ago is not "where I was", it is
 *  archaeology, and restoring it would be surprising in exactly the way this
 *  is meant to prevent. Beyond the window it is discarded and the room opens
 *  where it always did.
 * ══════════════════════════════════════════════════════════════════════════
 */

const KEY = "poll360:last-view";

/** The cookie the server reads. Same job, a name a cookie jar can hold. */
export const VIEW_COOKIE = "poll360_view";

/** Long enough to cover a night's shift, short enough not to be archaeology. */
export const REMEMBER_HOURS = 16;

/**
 * Read the remembered view, or null.
 *
 * `valid` is the set of views that exist right now, and it is not optional:
 * tabs are renamed and removed between deployments, and a remembered value
 * naming a view nothing renders would drop the reader on a blank frame —
 * which is worse than the front door this exists to improve on. A value that
 * no longer names anything is discarded rather than repaired.
 *
 * Every read is wrapped: storage throws outright in a private window, in a
 * browser set to block site data, and inside a screenshot renderer, and a
 * room that will not paint because it could not read a convenience is a
 * strictly worse room than one that opens on the wrong tab.
 */
export function recallView({ storage, valid, now = Date.now() } = {}) {
  if (!storage) return null;

  let raw;
  try {
    raw = storage.getItem(KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  let saved;
  try {
    saved = JSON.parse(raw);
  } catch {
    /* Written by an older build, or corrupted. Not repairable and not worth
       keeping. */
    return null;
  }

  if (!saved || typeof saved.view !== "string") return null;

  /* Older than the window: archaeology, not a place. */
  if (typeof saved.at !== "number" || now - saved.at > REMEMBER_HOURS * 3600_000) {
    return null;
  }

  if (valid && !valid.has(saved.view)) return null;

  return saved.view;
}

/** Remember where somebody is. Never throws; a failed write costs nothing. */
export function rememberView({ storage, view, now = Date.now() } = {}) {
  if (!storage || typeof view !== "string" || !view) return;
  try {
    storage.setItem(KEY, JSON.stringify({ view, at: now }));
  } catch {
    /* Full, blocked, or private. The room simply opens where it always did. */
  }
}

/**
 * Forget it. Called when somebody signs in, and nowhere else.
 *
 * See the note above: a shared machine's previous reader left a leftover, not
 * a preference, and the start of a shift should begin where the product says.
 */
export function forgetView({ storage } = {}) {
  if (!storage) return;
  try {
    storage.removeItem(KEY);
  } catch {
    /* Nothing to do, and nothing that matters. */
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE SAME THREE OPERATIONS, OVER A COOKIE

   Split from the storage versions above rather than replacing them, because
   the two are read at different moments by different machines: the server
   parses a header before anything is drawn, the browser writes a string after
   somebody presses a tab. What they share is the shape of the value and every
   rule about it — the window, the validation, the refusal to trust what it is
   handed — and those live in one place below.
   ══════════════════════════════════════════════════════════════════════════ */

/** The value as it is stored: a view and when it was last seen. */
function encode(view, now) {
  return `${view}.${now}`;
}

/**
 * Parse a stored value back, applying every rule.
 *
 * Deliberately total: any input at all produces a view or null, because this
 * reads a string a person can type into their own browser. A value naming a
 * view nothing renders would drop the reader on a blank frame, which is worse
 * than the front door this exists to improve on.
 */
export function decodeView(raw, { valid, now = Date.now() } = {}) {
  if (typeof raw !== "string" || !raw) return null;

  const cut = raw.lastIndexOf(".");
  if (cut < 1) return null;

  const view = raw.slice(0, cut);
  const at = Number(raw.slice(cut + 1));

  if (!Number.isFinite(at)) return null;
  /* Older than the window: archaeology, not a place. A stamp from the future
     is a clock that has been changed, and is treated the same way. */
  if (now - at > REMEMBER_HOURS * 3600_000 || at > now + 60_000) return null;
  if (valid && !valid.has(view)) return null;

  return view;
}

/** Read the remembered view out of a cookie header, or null. */
export function viewFromCookies(jar, { valid, now = Date.now() } = {}) {
  /* Takes the jar rather than the request so both Next's `cookies()` and a
     plain map can be handed in — and so a test needs neither. */
  const raw = typeof jar?.get === "function" ? (jar.get(VIEW_COOKIE)?.value ?? jar.get(VIEW_COOKIE)) : null;
  return decodeView(typeof raw === "string" ? raw : null, { valid, now });
}

/**
 * Write it, from the browser.
 *
 * `SameSite=Lax` because this is only ever read by our own pages on our own
 * navigations, and `Secure` only where the page is already secure — a Secure
 * cookie is silently dropped over plain http, which is how the whole feature
 * would stop working on somebody's laptop at a dev server and nowhere else.
 */
export function rememberViewCookie(view, { now = Date.now(), write, secure } = {}) {
  if (typeof view !== "string" || !view) return;

  const sink = write ?? ((value) => {
    document.cookie = value;
  });
  const isSecure = secure ?? (typeof location !== "undefined" && location.protocol === "https:");

  sink(
    `${VIEW_COOKIE}=${encodeURIComponent(encode(view, now))}; path=/; max-age=${REMEMBER_HOURS * 3600}; samesite=lax${
      isSecure ? "; secure" : ""
    }`
  );
}

/** Forget it. Called when somebody signs in, and nowhere else. */
export function forgetViewCookie({ write } = {}) {
  const sink = write ?? ((value) => {
    document.cookie = value;
  });
  sink(`${VIEW_COOKIE}=; path=/; max-age=0; samesite=lax`);
}
