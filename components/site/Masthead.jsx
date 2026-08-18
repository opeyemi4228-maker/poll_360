"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import Wordmark from "@/components/ui/Wordmark";
import AuthNav from "@/components/auth/AuthNav";
import { nav } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * The masthead.
 *
 * Thin, square, and sitting on a red rule — the Labour device: one hot line
 * across the top of the page that belongs to the brand and to nothing else.
 * It gains a hairline and a solid ground once the page has scrolled, so it
 * separates from the hero without ever having a shadow under it.
 */
export default function Masthead() {
  /* On the sign-in page the "Log in" button would only point at itself, so it
     is dropped there and the mobile drawer closes on every navigation. */
  const pathname = usePathname();
  const onLogin = pathname === "/login";

  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* An open drawer must not leave the page scrolling underneath it. */
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  /* A drawer left open across a navigation would cover the page it opened.
     Adjusted during render rather than in an effect — React's documented way
     to reset state when a prop changes. An effect would render the new page
     once with the drawer still over it, then immediately render again. */
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-50">
      <div aria-hidden="true" className="h-1 bg-red-500" />

      <div
        className={cn(
          "border-b bg-white transition-colors duration-300",
          scrolled ? "border-ink-200" : "border-transparent"
        )}
      >
        <div className="shell shell-wide flex h-20 items-center justify-between gap-8 lg:h-24">
          <Wordmark className="shrink-0" />

          {/* Set at reading size, not at caption size. A masthead whose links
              are smaller than the body text reads as a legal sub-nav, and
              these are the five destinations the whole site has. */}
          <nav aria-label="Primary" className="hidden items-center gap-9 lg:flex">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="font-display text-[1.0625rem] font-semibold tracking-[-0.015em] text-content-muted transition-colors hover:text-content"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            {/* Signed-in state is resolved in the browser, not on the server,
                so these pages stay public and cacheable. See AuthNav. */}
            {!onLogin && <AuthNav />}

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              className="inline-flex size-11 items-center justify-center border-2 border-ink-950 text-ink-950 lg:hidden"
              aria-expanded={open}
              aria-controls="mobile-nav"
              aria-label={open ? "Close menu" : "Open menu"}
            >
              {open ? <X size={18} strokeWidth={2.5} /> : <Menu size={18} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile drawer. Full-bleed flat colour, list of destinations, nothing
          clever — a nav that animates in three directions is a nav somebody is
          fighting with one-handed on a bus. */}
      {open && (
        <div id="mobile-nav" className="on-dark bg-blue-950 lg:hidden">
          <nav aria-label="Primary" className="shell flex flex-col py-4">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="border-b border-white/12 py-4 font-display text-fluid-xl font-extrabold tracking-tight text-white"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-6 flex flex-col gap-3">
              <AuthNav variant="drawer" onNavigate={() => setOpen(false)} />
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
