"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Find a place and go to it.
 *
 * ── WHY TYPING BEATS CLICKING HERE ─────────────────────────────────────────
 * The map is the right way to ask "where is it thin?" and the wrong way to ask
 * "what is happening in Jigawa?". The second question is the one a room asks
 * out loud when a phone call comes in, and answering it by hunting for a small
 * shape in the north-east, on a screen where the shapes are also changing
 * colour as returns land, is slower than typing five letters.
 *
 * So this searches the places, not the page: 37 states from anywhere, plus the
 * local governments of whichever state is open. Picking one drills the map
 * there, exactly as clicking the shape would.
 *
 * ── IT IS A COMBOBOX, NOT A TEXT FIELD ─────────────────────────────────────
 * Arrow keys move, Enter goes, Escape backs out, and the highlighted row is
 * announced. Anyone who can touch-type a state name never has to find the
 * mouse, which is the entire point of having it at 2am.
 * ───────────────────────────────────────────────────────────────────────────
 */
const LIMIT = 8;

export default function DashSearch({ items = [], onPick, placeholder = "Search a state…" }) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    /* A name that starts with what you typed comes before one that merely
       contains it: typing "kano" should not offer you a ward in Kano State
       before Kano State itself. */
    const scored = [];
    for (const item of items) {
      const haystack = item.label.toLowerCase();
      const at = haystack.indexOf(needle);
      if (at === -1) continue;
      scored.push({ item, rank: at === 0 ? 0 : 1, at });
      if (scored.length > 200) break;
    }

    scored.sort((a, b) => a.rank - b.rank || a.at - b.at || a.item.label.localeCompare(b.item.label));
    return scored.slice(0, LIMIT).map((entry) => entry.item);
  }, [items, query]);

  /* A new query starts the highlight at the top again. Adjusted during render
     rather than in an effect, React's documented way to reset state when an
     input changes, and the only one that cannot paint a stale highlight for a
     frame first. */
  const [lastQuery, setLastQuery] = useState(query);
  if (query !== lastQuery) {
    setLastQuery(query);
    setActive(0);
  }

  /* Clicking anywhere else closes it. */
  useEffect(() => {
    if (!open) return;
    const onDown = (event) => {
      if (!boxRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (item) => {
    if (!item) return;
    onPick?.(item);
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      if (query) setQuery("");
      else setOpen(false);
      return;
    }
    if (!results.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(results[active]);
    }
  };

  const showing = open && query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative">
      <Search
        size={16}
        strokeWidth={2.25}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 z-10 -translate-y-1/2 text-dash-muted"
      />

      <input
        ref={inputRef}
        /* Deliberately `text` and not `search`: the native clear button of a
           search input cannot be reached by keyboard in every browser and fires
           no event we can hang the reset on, so the control below does that job
           and does it consistently. */
        type="text"
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showing && results[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        spellCheck={false}
        value={query}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Search a state or local government"
        className={cn(
          "h-11 w-56 rounded-full border border-dash-line bg-dash-bg pr-9 pl-9",
          "text-[0.875rem] text-dash-ink placeholder:text-dash-muted",
          "focus:border-dash-ink focus:outline-none"
        )}
      />

      {query && (
        <button
          type="button"
          onClick={() => {
            setQuery("");
            inputRef.current?.focus();
          }}
          aria-label="Clear the search"
          className="absolute top-1/2 right-2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-dash-muted transition-colors hover:bg-dash-card hover:text-dash-ink"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      )}

      {showing && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Places"
          className="absolute right-0 z-30 mt-2 w-72 overflow-hidden rounded-dash border border-dash-line bg-dash-card py-1 shadow-lg"
        >
          {results.length === 0 && (
            <li className="px-3 py-3 text-[0.8125rem] text-dash-muted">
              Nothing here called “{query.trim()}”.
            </li>
          )}

          {results.map((item, index) => (
            <li key={item.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                /* `onMouseDown` rather than `onClick`: the input blurs first
                   otherwise, the list unmounts, and the click lands on nothing.
                   This is the bug that makes half the search boxes on the web
                   feel broken. */
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  index === active ? "bg-dash-bg" : "hover:bg-dash-bg"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold text-dash-ink">
                    {item.label}
                  </span>
                  {item.hint && (
                    <span className="block truncate text-[0.75rem] text-dash-muted">{item.hint}</span>
                  )}
                </span>
                {index === active && (
                  <CornerDownLeft
                    size={13}
                    strokeWidth={2.5}
                    aria-hidden="true"
                    className="shrink-0 text-dash-muted"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
