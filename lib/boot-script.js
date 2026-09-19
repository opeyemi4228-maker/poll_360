/**
 * The one script that runs before anything is drawn, and its CSP hashes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS IS A CONSTANT, AND WHY THE POLICY ALLOWS IT BY HASH
 *
 *  It was rendered through next/script with `beforeInteractive`, and that did
 *  two things nobody intended.
 *
 *  It did not run during parse. In the App Router an inline
 *  `beforeInteractive` script is not placed in the page as itself: it is
 *  queued onto `self.__next_s`, and the framework executes the queue only
 *  once its own JavaScript has downloaded — see `appBootstrap` in
 *  next/dist/client/app-bootstrap.js. So the rail attribute that was meant to
 *  be set before the first paint was set after the bundle arrived, which on a
 *  booth's network is seconds after the rail was drawn open.
 *
 *  And it broke hydration on every page rendered per request. The framework
 *  gave the element the request's nonce on the server; the browser then hides
 *  a nonce's value from the DOM, which is a security feature; and the client
 *  render has no nonce at all, because the framework only knows it on the
 *  server. React compared the two and reported a mismatch on every load — the
 *  kind of error that teaches a room to stop reading the error overlay.
 *
 *  ── THE FIX IS THE MECHANISM CSP HAS FOR EXACTLY THIS ───────────────────
 *  A nonce is for scripts that change per request. This one does not: it is
 *  authored here in full and no input reaches it. A constant script is
 *  allowed by its hash, so the element carries no nonce on either side, there
 *  is nothing for hydration to disagree about, and it is an ordinary inline
 *  script the browser runs where it sits in the HTML.
 *
 *  The build id used to be written into the script, which made every deploy a
 *  different script with a different hash. It is read off
 *  <html data-build> instead, so there are exactly two scripts — one for a
 *  production build and one for development — and two hashes that change only
 *  when somebody edits this file. tests/boot-script.test.js recomputes them
 *  from the text below and fails the build if they have drifted, because a
 *  stale hash does not error: the browser silently declines to run the script,
 *  and the offline support is quietly gone again.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Imports nothing, so the proxy can read the hashes on any runtime, including
 * the edge, where node:crypto is not available — which is why they are
 * written down rather than computed here.
 */

/* ── THE RAIL ────────────────────────────────────────────────────────────────
   The dashboards remember whether their rail is collapsed, and a remembered
   choice that arrives one frame late is worse than none. Reads one key, writes
   one attribute, and swallows its own errors, because a browser with storage
   switched off should still get a dashboard. */
const RAIL =
  "try{if(localStorage.getItem('poll360:rail-collapsed')==='1')document.documentElement.dataset.rail='collapsed'}catch(e){}";

/* ── THE WORKER ──────────────────────────────────────────────────────────────
   Registered here rather than inside a component, where it was once code-split
   into a chunk no route ever loaded and the offline support shipped switched
   off. The build id rides along from <html data-build> so each deploy is a
   distinct worker URL and the worker names its caches after itself.

   In development the worker serves chunks from before the last edit and the
   page dies on a missing module factory, so it is removed rather than
   installed. */
const WORKER_PRODUCTION =
  "if('serviceWorker' in navigator){addEventListener('load',function(){navigator.serviceWorker.register('/sw.js?v='+(document.documentElement.dataset.build||'dev')).catch(function(){})})}";

const WORKER_DEVELOPMENT =
  "if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister()})})}";

export const BOOT_SCRIPTS = {
  production: RAIL + WORKER_PRODUCTION,
  development: RAIL + WORKER_DEVELOPMENT,
};

/**
 * The CSP source for each, as `'sha256-…'`.
 *
 * Both are always allowed, rather than the one matching the environment. The
 * layout and the proxy decide "is this production" by two different tests of
 * NODE_ENV, and a policy that allowed only one variant would block the other
 * the first time those disagree — under `test`, say. Both scripts are ours and
 * constant, so allowing the second costs nothing.
 */
export const BOOT_SCRIPT_HASHES = {
  production: "'sha256-/6YsTZg0A9mS9RyAP6jjOtoDAYencLErBfSZmCIg5v4='",
  development: "'sha256-ajZWgMWM7TEwpgTDyQT3/jKEJlMNg2wPTQdDQ6J7Sto='",
};

/** Which script a build runs. */
export function bootScript({ production = process.env.NODE_ENV === "production" } = {}) {
  return production ? BOOT_SCRIPTS.production : BOOT_SCRIPTS.development;
}
