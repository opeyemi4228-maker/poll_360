"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Download, RefreshCw, Share, WifiOff, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Everything the installed app needs the browser to do, in one client
 * component: register the worker, offer an update when one is waiting, offer
 * installation when the browser allows it, and say plainly when the connection
 * has gone.
 *
 * Three rules run through all of it:
 *
 *   Nothing interrupts. An agent filing a result at 18:42 must never have a
 *   dialog land on top of the form. Every prompt here is a dismissible strip
 *   at the bottom of the screen, and dismissal is remembered.
 *
 *   Nothing reloads itself. A new version is offered, never applied, a page
 *   that refreshes under somebody halfway through typing a result has just
 *   destroyed the thing this product exists to collect.
 *
 *   Offline is stated, not hidden. The banner is the counterpart of the grey
 *   state on the map: when the app cannot know something, it says so.
 */
const DISMISSED = "poll360:install-dismissed";
/** Set once per tab, so a failed cleanup can never become a reload loop. */
const CLEANED = "poll360:sw-cleanup-reload";

export default function AppShell() {
  const [waiting, setWaiting] = useState(null);
  const [prompt, setPrompt] = useState(null);
  const [offline, setOffline] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  /* ------------------------------------------------------ service worker */
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /* ── NOT IN DEVELOPMENT ────────────────────────────────────────────────
       In development the worker is not merely unnecessary, it is destructive.
       It treats everything under `/_next/static/` as immutable, which is true
       of a production build, those filenames carry a content hash, and false
       under Turbopack, which serves a dev chunk from a stable path whose bytes
       change on every save. The worker then answers with the chunk from before
       the last edit while the HTML expects the one after it, and the page dies
       on a module factory that is not there.

       Unregistering is not enough on its own: a worker that has already taken
       control keeps the page it is controlling, and a browser that picked one
       up from a production build on this origin still has it, localhost is one
       origin to a service worker whichever build served it. So the caches go
       too, and the tab reloads once to get a document the dev server actually
       sent.
       ─────────────────────────────────────────────────────────────────────── */
    if (process.env.NODE_ENV !== "production") {
      (async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));

        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(
            names.filter((name) => name.startsWith("poll360-")).map((name) => caches.delete(name))
          );
        }

        if (
          registrations.length &&
          navigator.serviceWorker.controller &&
          !sessionStorage.getItem(CLEANED)
        ) {
          sessionStorage.setItem(CLEANED, "1");
          window.location.reload();
        }
      })().catch(() => undefined);

      return;
    }

    let registration;

    const onUpdate = () => {
      const installing = registration.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        /* `controller` is null on the very first visit, that is an install,
           not an update, and telling a first-time visitor their brand new page
           is out of date would be nonsense. */
        if (installing.state === "installed" && navigator.serviceWorker.controller) {
          setWaiting(registration.waiting ?? installing);
        }
      });
    };

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", onUpdate);
      })
      .catch(() => {
        /* No worker means no offline support, and nothing else. The site is a
           complete, working document without it. */
      });
  }, []);

  /* ---------------------------------------------------- environment read
     Two browser-only facts, has the offer already been dismissed, and is this
     an iPhone that can only be told about the Share sheet. Neither can be read
     during render without the server and the client disagreeing about the
     first paint, and both are scheduled on the next frame rather than set in
     the effect body so they land as one asynchronous update instead of a
     synchronous cascading re-render. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDismissed(localStorage.getItem(DISMISSED) === "1");

      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
      if (ios && !standalone) setShowIosHint(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  /* ------------------------------------------------------------- install */
  useEffect(() => {
    const onBeforeInstall = (event) => {
      /* Chrome's own mini-infobar is suppressed so the offer can be made in
         the product's own voice, at the moment the reader has seen enough of
         the page to want it. */
      event.preventDefault();
      setPrompt(event);
    };

    const onInstalled = () => {
      setPrompt(null);
      localStorage.setItem(DISMISSED, "1");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /* ------------------------------------------------------------ offline */
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED, "1");
    setDismissed(true);
    setPrompt(null);
    setShowIosHint(false);
  };

  const install = async () => {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    setPrompt(null);
  };

  const offerInstall = !dismissed && (prompt || showIosHint);

  if (!offline && !waiting && !offerInstall) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-100 flex flex-col gap-px">
      {/* ------------------------------------------------------- offline */}
      {offline && (
        <div className="bg-ink-950 px-4 py-3 sm:px-6">
          <div className="shell shell-wide flex items-center gap-3">
            <WifiOff size={16} strokeWidth={2.5} className="shrink-0 text-red-400" />
            <p className="text-[0.8125rem] leading-snug text-white">
              <span className="font-bold">You are offline.</span>{" "}
              <span className="text-white/65">
                Anything on screen is from when you last had a signal, and is not updating.
              </span>
            </p>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------- update */}
      {waiting && (
        <div className="bg-blue-900 px-4 py-3 sm:px-6">
          <div className="shell shell-wide flex flex-wrap items-center gap-x-4 gap-y-2">
            <RefreshCw size={16} strokeWidth={2.5} className="shrink-0 text-white" />
            <p className="flex-1 text-[0.8125rem] leading-snug text-white">
              A new version is ready.{" "}
              <span className="text-white/65">
                It will be used next time you open the app, or now if you prefer.
              </span>
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  waiting.postMessage("skip-waiting");
                  /* One reload, once the new worker is actually in charge, reloading before that just loads the old version again. */
                  navigator.serviceWorker.addEventListener(
                    "controllerchange",
                    () => window.location.reload(),
                    { once: true }
                  );
                }}
                className="tag border-2 border-white bg-white px-3 py-2 text-ink-950 transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white"
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => setWaiting(null)}
                aria-label="Dismiss"
                className="inline-flex size-9 items-center justify-center border-2 border-white/35 text-white transition-colors hover:border-white"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------- install */}
      {offerInstall && !offline && (
        <div className="border-t-2 border-red-500 bg-white px-4 py-3 sm:px-6">
          <div className="shell shell-wide flex flex-wrap items-center gap-x-4 gap-y-3">
            <Download size={17} strokeWidth={2.5} className="shrink-0 text-red-600" />

            <p className="flex-1 text-[0.8125rem] leading-snug text-ink-950">
              <span className="font-bold">Install Poll360.</span>{" "}
              <span className="text-content-muted">
                {showIosHint ? (
                  <>
                    Tap <Share size={13} className="inline align-[-2px]" aria-label="Share" /> then
                    “Add to Home Screen” to keep it one tap away and working on a weak signal.
                  </>
                ) : (
                  "Keep it one tap away on the home screen, and keep the pages you have opened working on a weak signal."
                )}
              </span>
            </p>

            <div className="flex items-center gap-2">
              {prompt && (
                <button
                  type="button"
                  onClick={install}
                  className="tag inline-flex items-center gap-2 border-2 border-red-500 bg-red-500 px-3.5 py-2.5 text-white transition-colors hover:border-ink-950 hover:bg-ink-950"
                >
                  Install
                  <ArrowUpRight size={14} strokeWidth={3} />
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Not now"
                className={cn(
                  "inline-flex size-9 items-center justify-center border-2 border-ink-300 text-ink-600",
                  "transition-colors hover:border-ink-950 hover:text-ink-950"
                )}
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
