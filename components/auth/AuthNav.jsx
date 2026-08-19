"use client";

import { useEffect, useState } from "react";
import { ArrowRight, LayoutDashboard } from "lucide-react";

import Button from "@/components/ui/Button";
import SignOutButton from "./SignOutButton";

/**
 * The two or three bits of chrome that depend on who is reading.
 *
 * ── WHY A CLIENT ISLAND AND NOT A SERVER PROP ──────────────────────────────
 * Because the pages around it are public, cacheable and installable. If the
 * layout read the session, every page would render per request and, fatally
 * for an installed app, the service worker would cache one reader's chrome
 * and serve it to the next, which React sees as a hydration mismatch and the
 * reader sees as somebody else's name in the header.
 *
 * So the markup is identical for everybody, and this asks afterwards. The
 * placeholder holds the same width as the buttons that replace it, so the
 * masthead does not jump when the answer arrives.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function AuthNav({ onNavigate, variant = "bar" }) {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/me", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { user: null }))
      .then((data) => setState({ loading: false, user: data.user ?? null }))
      .catch(() => {
        /* Offline, or the request was cancelled by a navigation. Treat it as
           signed out rather than leaving a spinner in the masthead forever. */
        setState((previous) => (previous.loading ? { loading: false, user: null } : previous));
      });

    return () => controller.abort();
  }, []);

  const drawer = variant === "drawer";

  if (state.loading) {
    return (
      <div
        aria-hidden="true"
        className={drawer ? "h-14 w-full bg-white/10" : "hidden h-14 w-44 bg-ink-100 sm:block"}
      />
    );
  }

  if (state.user) {
    return (
      <>
        {drawer ? (
          <p className="text-[0.8125rem] text-white/55">
            Signed in as <span className="font-bold text-white">{state.user.name}</span>
          </p>
        ) : (
          <span className="hidden text-[0.9375rem] font-semibold text-content-muted xl:inline">
            {state.user.name}
          </span>
        )}

        <Button
          href={state.user.home}
          size="lg"
          variant={drawer ? "primary" : "primary"}
          onClick={onNavigate}
          className={drawer ? "" : "hidden sm:inline-flex"}
        >
          <LayoutDashboard size={16} strokeWidth={2.75} />
          Dashboard
        </Button>

        {drawer ? (
          <SignOutButton variant="inverseOutline" size="lg" />
        ) : (
          <div className="hidden lg:block">
            <SignOutButton variant="outline" size="lg" />
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <Button
        href="/#access"
        variant={drawer ? "inverseOutline" : "outline"}
        size="lg"
        onClick={onNavigate}
        className={drawer ? "" : "hidden lg:inline-flex"}
      >
        Request access
      </Button>

      <Button
        href="/login"
        size="lg"
        onClick={onNavigate}
        className={drawer ? "" : "hidden sm:inline-flex"}
      >
        Log in
        <ArrowRight size={16} strokeWidth={3} />
      </Button>
    </>
  );
}
