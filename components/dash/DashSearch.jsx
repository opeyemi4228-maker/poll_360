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
 *
 * ── WHY IT IS A BUTTON UNTIL IT IS NEEDED ──────────────────────────────────
 * It used to be an open field, 14rem of it, sitting permanently in a bar that
 * also has to hold a brand, eleven tabs, an alarm and an account. Something
 * had to give and it was always the tabs: they are the primary control of the
 * screen and they were the block being squeezed. A field that is empty
 * ninety-nine minutes in every hundred is not worth that.
 *
 * So it is one 44px control, the same size as the bell and the account beside
 * it, and the field drops out of it when somebody asks for it. The bar keeps
 * one shape at every width, and the tabs get the width back.
 *
 * The cost of hiding an input is that it stops inviting the typing that was
 * the whole point, so the invitation moves to the keyboard: "/" or ⌘K opens
 * it from anywhere in the room, focus lands in the field, and Escape puts it
 * back where it was. Nobody has to find the mouse to use it, which was always
 * the claim being made two paragraphs up.
 * ───────────────────────────────────────────────────────────────────────────
 */
const LIMIT = 8;

export default function DashSearch({
  items = [],
  onPick,
  placeholder = "Search a state…",
  /* Applied to the trigger, not to a field: the bar no longer has a width to
     hand out here, because the control is the same 44px circle at every size. */
  className,
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const triggerRef = useRef(null);

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

  /* Opening it puts the caret in it. A panel that drops open and then waits to
     be clicked a second time is slower than the field it replaced. */
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* ── THE KEYBOARD IS NOW THE FRONT DOOR ──────────────────────────────────
     "/" is the convention and costs no chrome; ⌘K is the one a newsroom will
     try first. Neither is allowed to steal a keystroke from somebody who is
     already typing — into the assistant, into a declared figure, into any
     field at all — so a bare "/" is ignored whenever the keystroke was going
     somewhere that accepts text. */
  useEffect(() => {
    const onKey = (event) => {
      const shortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!shortcut && event.key !== "/") return;

      if (!shortcut) {
        const target = event.target;
        const tag = target?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      }

      event.preventDefault();
      setOpen(true);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Closing by keyboard hands focus back to the button that opened it, or the
     tab order restarts at the top of the document and the reader is lost. */
  const dismiss = () => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  };

  const choose = (item) => {
    if (!item) return;
    onPick?.(item);
    setQuery("");
    setOpen(false);
    /* Back to the trigger, not to nothing. The field it was in is about to be
       unmounted, and focus left on a removed node falls to <body>, which makes
       the next Tab start again from the top of the document. */
    triggerRef.current?.focus();
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      /* Stopped here rather than allowed to bubble: the assistant hangs up the
         call on a bare Escape from anywhere, and backing out of a mistyped
         state name should not also end a conversation. */
      event.stopPropagation();
      /* One Escape clears what was typed, a second one puts the panel away:
         backing out of a wrong query should not also cost you the control. */
      if (query) setQuery("");
      else dismiss();
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

  const showing = query.trim().length > 0;

  return (
    <div ref={boxRef} className="relative">
      {/* The control itself: one circle, the same 44px as the alarm and the
          account beside it, so the row has a single optical baseline whatever
          is switched on. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? dismiss() : setOpen(true))}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Search a state or local government"
        title="Search a place  ( / )"
        className={cn(
          "inline-flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
          open
            ? "border-dash-ink bg-dash-ink text-white"
            : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink",
          className
        )}
      >
        <Search size={17} strokeWidth={2.25} aria-hidden="true" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Search a place"
          /* Anchored to the right so it never runs off the edge of the bar,
             and capped against the viewport so a phone gets the whole panel
             rather than the left two-thirds of it. */
          className="absolute right-0 z-40 mt-2 w-[min(21rem,calc(100vw-2rem))] overflow-hidden rounded-dash border border-dash-line bg-dash-card shadow-lg"
        >
          <div className="relative border-b border-dash-line">
            <Search
              size={16}
              strokeWidth={2.25}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-dash-muted"
            />

            <input
              ref={inputRef}
              /* Deliberately `text` and not `search`: the native clear button of
                 a search input cannot be reached by keyboard in every browser
                 and fires no event we can hang the reset on, so the control
                 below does that job and does it consistently. */
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
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              aria-label="Search a state or local government"
              className="h-12 w-full bg-transparent pr-10 pl-10 text-[0.9375rem] text-dash-ink placeholder:text-dash-muted focus:outline-none"
            />

            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear the search"
                className="absolute top-1/2 right-2.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-dash-muted transition-colors hover:bg-dash-bg hover:text-dash-ink"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>

          {/* Before a letter is typed the panel says what it searches rather
              than sitting empty. An empty box teaches nobody that the local
              governments of the open state are in here too. */}
          {!showing && (
            <p className="px-4 py-3.5 text-[0.8125rem] text-dash-muted">
              Any of the 37 states, and the local governments of whichever one
              is open.
            </p>
          )}

          {showing && (
            <ul id={listId} role="listbox" aria-label="Places" className="max-h-80 overflow-y-auto py-1">
              {results.length === 0 && (
                <li className="px-4 py-3 text-[0.8125rem] text-dash-muted">
                  Nothing here called “{query.trim()}”.
                </li>
              )}

              {results.map((item, index) => (
                <li key={item.key} id={`${listId}-${index}`} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    /* `onMouseDown` rather than `onClick`: the input blurs first
                       otherwise, the list unmounts, and the click lands on
                       nothing. This is the bug that makes half the search boxes
                       on the web feel broken. */
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(item);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
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
      )}
    </div>
  );
}
