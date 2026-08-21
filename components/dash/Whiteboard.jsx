"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eraser, Loader2, PenLine, Save, Trash2, X } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { boundsOf } from "@/lib/bbox";
import { apportion, leaderOf, wardCount } from "@/lib/drill";
import { states2023 } from "@/lib/election2023";
import { cn, formatNumber, formatShare } from "@/lib/utils";
import {
  board as store,
  closestStates,
  figuresFor,
  projectionRows,
  standingsFor,
  zoneRows,
} from "@/lib/whiteboard";

/**
 * The board.
 *
 * ── WHAT IT IS FOR ─────────────────────────────────────────────────────────
 * Every other screen in this product answers one question at a time and then
 * replaces itself. That is right for a screen and wrong for a conversation:
 * by the fourth question the first three answers are gone, and the argument a
 * room is actually having is between them. This is where the answers stay.
 * Ask for Kano and it goes up. Ask for Rivers and Kano is still there.
 *
 * ── IT IS DRIVEN, NOT OPERATED ─────────────────────────────────────────────
 * There is no palette of things to drag on. You say what you want and it
 * appears, you say take it off and it goes. The controls along the top are
 * the same three instructions with buttons on them, for the times when
 * speaking out loud is not appropriate, not a second way of working.
 *
 * ── EVERY CARD IS RECOMPUTED, NEVER REMEMBERED ─────────────────────────────
 * A card holds a place and a kind. The figures on it are worked out from the
 * same modules the dashboards read, each time it draws, so a board left up
 * overnight cannot be quietly wrong in the morning.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function Whiteboard({ shapes, cards, onErase, onClear, onRestore }) {
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [flash, setFlash] = useState(null);
  /* ── THE SAVED LIST IS READ WHEN IT IS ASKED FOR ──────────────────────────
     Local storage does not exist on the server, so reading it while rendering
     would have the two disagree about what is on this page, and reading it in
     an effect would re-render the board every time a card moved. It is read
     the moment somebody reaches for the list, which is the only moment its
     contents matter. */
  const [saved, setSaved] = useState(null);

  const note = (text) => {
    setFlash(text);
    setTimeout(() => setFlash(null), 2400);
  };

  const keep = () => {
    const title = store.save(name, cards);
    setName("");
    setSaving(false);
    setSaved(null);
    note(`Saved as ${title}.`);
  };

  /* ── the boundaries, fetched once per state and shared by every card ──────
     Three cards about Lagos must not mean three downloads of the same file.
     Requests in flight are remembered as well as replies, so two cards added
     in the same breath make one request between them. */
  const boundaries = useBoundaries(cards);

  /**
   * A local government's or ward's own figures.
   *
   * Computed with exactly the arguments the situation room uses, so a card
   * and the map behind it cannot disagree. If the boundaries have not landed
   * the card says so rather than falling back to the state, which would put a
   * state's total under a local government's name.
   */
  const rowFor = useCallback(
    (card) => {
      const state = states2023.find((row) => row.code === card.stateCode);
      const file = boundaries[card.stateCode];
      if (!state || !file?.lgas) return null;

      const lgas = apportion({
        names: file.lgas.map((row) => row.name),
        votes: state.votes,
        booths: state.booths,
        registered: state.registered,
        parentKey: state.code,
      });

      const parent = lgas.find((row) => row.name === card.lga);
      if (!parent) return null;
      if (card.scope === "lga") return parent;

      const wards = apportion({
        names: Array.from({ length: wardCount(card.lga) }, (_, i) => `Ward ${String(i + 1).padStart(2, "0")}`),
        votes: parent.votes,
        booths: parent.booths,
        registered: parent.registered,
        parentKey: `${state.code}:${card.lga}`,
      });

      return wards.find((row) => row.name === card.ward) ?? null;
    },
    [boundaries]
  );

  return (
    <section className="on-board board-grid flex min-h-[calc(100vh-13rem)] flex-col rounded-dash border border-board-line bg-board">
      {/* ------------------------------------------------------------ chrome */}
      <header className="flex flex-wrap items-center gap-2 border-b border-board-line px-4 py-2.5">
        <PenLine size={15} strokeWidth={2.5} className="shrink-0 text-white/55" />
        <h2 className="font-display text-[0.9375rem] font-extrabold text-white">The board</h2>
        <span className="figure text-[0.6875rem] text-white/45">
          {cards.length === 0 ? "empty" : `${cards.length} up`}
        </span>

        {flash && (
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[0.6875rem] font-semibold text-emerald-300">
            <Check size={11} strokeWidth={3} />
            {flash}
          </span>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <BoardButton
              icon={Download}
              label="Saved"
              onClick={() =>
                setSaved((open) =>
                  open ? null : Object.values(store.saved()).sort((a, b) => b.at - a.at)
                )
              }
            />

            {saved && (
              <>
                <button
                  type="button"
                  aria-label="Close the list"
                  onClick={() => setSaved(null)}
                  className="fixed inset-0 z-10 cursor-default"
                />
                <div className="absolute right-0 z-20 mt-2 w-60 rounded-dash border border-board-line bg-board p-1.5 shadow-2xl">
                  {saved.length === 0 ? (
                    <p className="px-2.5 py-2 text-[0.75rem] text-white/45">
                      Nothing saved yet. Say “save this board” once there is something on it.
                    </p>
                  ) : (
                    saved.map((entry) => (
                      <span key={entry.name} className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            onRestore(entry.cards);
                            setSaved(null);
                            note(`${entry.name} is up.`);
                          }}
                          className="min-w-0 flex-1 truncate rounded-dash-sm px-2.5 py-2 text-left text-[0.8125rem] text-white/80 hover:bg-white/10 hover:text-white"
                        >
                          {entry.name}
                          <span className="block text-[0.625rem] text-white/40">
                            {entry.cards.length} card{entry.cards.length === 1 ? "" : "s"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            store.forget(entry.name);
                            setSaved(Object.values(store.saved()).sort((a, b) => b.at - a.at));
                          }}
                          aria-label={`Forget ${entry.name}`}
                          className="shrink-0 rounded-dash-sm p-1.5 text-white/30 hover:bg-white/10 hover:text-white"
                        >
                          <Trash2 size={12} strokeWidth={2.25} />
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {saving ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                keep();
              }}
              className="flex items-center gap-1.5"
            >
              <input
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Call it something"
                aria-label="Name for this board"
                className="w-44 rounded-dash-sm border border-board-line bg-board-raised px-2.5 py-1.5 text-[0.75rem] text-white outline-none placeholder:text-white/35 focus:border-white/40"
              />
              <BoardButton icon={Save} label="Save" onClick={keep} solid />
              <BoardButton icon={X} label="Cancel" onClick={() => setSaving(false)} />
            </form>
          ) : (
            <BoardButton icon={Save} label="Save" onClick={() => setSaving(true)} disabled={!cards.length} />
          )}

          <BoardButton icon={Trash2} label="Clear" onClick={onClear} disabled={!cards.length} />
        </div>
      </header>

      {/* ------------------------------------------------------------- cards */}
      {cards.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid flex-1 auto-rows-min content-start gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              shapes={shapes}
              boundaries={boundaries[card.stateCode] ?? null}
              rowFor={rowFor}
              onErase={() => onErase(card.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The boundary files the cards on the board need.
 *
 * Kept here rather than in each card so that adding a fourth Lagos card costs
 * nothing, and so a card that is taken down mid-request cannot leave a reply
 * looking for a component that has gone.
 */
function useBoundaries(cards) {
  const [files, setFiles] = useState({});
  const asked = useRef(new Set());

  const wanted = useMemo(
    () => [...new Set(cards.map((card) => card.stateCode).filter(Boolean))],
    [cards]
  );

  useEffect(() => {
    let live = true;

    for (const code of wanted) {
      if (asked.current.has(code)) continue;
      asked.current.add(code);

      fetch(`/geo/lga/${code}.json`)
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => live && setFiles((previous) => ({ ...previous, [code]: data })))
        .catch(() => live && setFiles((previous) => ({ ...previous, [code]: null })));
    }

    return () => {
      live = false;
    };
  }, [wanted]);

  return files;
}

function Empty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <PenLine size={26} strokeWidth={2} className="text-white/25" />
      <p className="mt-4 max-w-md font-display text-[1.125rem] font-extrabold text-white">
        Nothing on the board yet
      </p>
      <p className="mt-2 max-w-md text-[0.875rem] leading-relaxed text-white/50">
        Call Poll360 AI and tell it what you want kept in front of you. Everything it
        puts up stays up until you ask for it to come down.
      </p>
      <ul className="mt-5 flex flex-wrap justify-center gap-2">
        {[
          "Put Kano on the board",
          "Show the map of Lagos on the board",
          "Put the closest states up",
          "Clear the board",
        ].map((line) => (
          <li
            key={line}
            className="rounded-full border border-board-line px-3 py-1.5 text-[0.75rem] text-white/60"
          >
            “{line}”
          </li>
        ))}
      </ul>
    </div>
  );
}

function BoardButton({ icon: Icon, label, onClick, disabled, solid }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-1.5 rounded-dash-sm px-2.5 py-1.5 text-[0.75rem] font-semibold transition-colors disabled:opacity-30",
        solid
          ? "bg-white text-board hover:bg-white/90"
          : "border border-board-line text-white/70 hover:border-white/40 hover:text-white"
      )}
    >
      <Icon size={12} strokeWidth={2.5} />
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------- a card */

function Card({ card, shapes, boundaries, rowFor, onErase }) {
  const wide = card.kind === "map" || card.kind === "battlegrounds" || card.kind === "zones";

  return (
    <article
      className={cn(
        "animate-land flex flex-col overflow-hidden rounded-dash border border-board-line bg-board-raised",
        wide && "sm:col-span-2 xl:col-span-2"
      )}
    >
      <header className="flex items-start gap-2 border-b border-board-line px-3.5 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[0.875rem] font-extrabold text-white">
            {card.subtitle || card.title}
          </p>
          <p className="text-[0.6875rem] text-white/45">{card.title}</p>
        </div>
        <button
          type="button"
          onClick={onErase}
          aria-label={`Take ${card.subtitle || card.title} off the board`}
          className="shrink-0 rounded-dash-sm p-1 text-white/35 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Eraser size={13} strokeWidth={2.25} />
        </button>
      </header>

      <div className="min-h-0 flex-1 p-3.5">
        <Body card={card} shapes={shapes} boundaries={boundaries} rowFor={rowFor} />
      </div>
    </article>
  );
}

function Body({ card, shapes, boundaries, rowFor }) {
  if (card.kind === "answer") {
    return <p className="text-[0.8125rem] leading-relaxed text-white/80">{card.text}</p>;
  }

  if (card.kind === "map") {
    return <BoardMap card={card} shapes={shapes} boundaries={boundaries} />;
  }

  if (card.kind === "projection") return <Projection />;
  if (card.kind === "battlegrounds") return <Closest />;
  if (card.kind === "zones") return <Zones />;

  const figures = figuresFor(card, { rowFor });
  if (!figures) return <Waiting scope={card.scope} />;

  if (card.kind === "turnout") return <Turnout figures={figures} />;
  if (card.kind === "register") return <Register figures={figures} />;
  return <Result figures={figures} bars={card.kind === "parties"} />;
}

function Waiting({ scope }) {
  return (
    <p className="flex items-center gap-2 py-4 text-[0.8125rem] text-white/45">
      <Loader2 size={14} className="animate-spin" />
      Working out the {scope === "ward" ? "ward" : "local government"}…
    </p>
  );
}

/* ------------------------------------------------------------------ figures */

function Result({ figures, bars }) {
  const standings = standingsFor(figures).filter((row) => row.votes > 0);
  const [first, second] = standings;

  return (
    <div>
      <Headline
        value={first ? first.party.id : "n/a"}
        foot={
          first && second
            ? `ahead by ${formatNumber(first.votes - second.votes)} votes`
            : "no votes recorded"
        }
      />

      <ul className="mt-3 space-y-2">
        {(bars ? standings : standings.slice(0, 3)).map((row) => (
          <li key={row.party.id}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="figure text-[0.75rem] font-bold text-white">{row.party.id}</span>
              <span className="figure text-[0.75rem] text-white/70 tabular-nums">
                {formatNumber(row.votes)} · {formatShare(row.share)}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-white/10">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.min(100, row.share)}%`, background: PARTY_FILL[row.party.id] ?? "#ffffff" }}
              />
            </div>
          </li>
        ))}
      </ul>

      <Foot
        items={[
          ["Votes cast", formatNumber(figures.total)],
          ["Turnout", formatShare(figures.turnout)],
        ]}
      />
    </div>
  );
}

function Turnout({ figures }) {
  const stayed = Math.max(0, figures.registered - figures.total);
  return (
    <div>
      <Headline value={formatShare(figures.turnout)} foot="of the register voted" />
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${Math.min(100, figures.turnout)}%` }}
        />
      </div>
      <Foot
        items={[
          ["Votes cast", formatNumber(figures.total)],
          ["Did not vote", formatNumber(stayed)],
          ["On the register", formatNumber(figures.registered)],
        ]}
      />
    </div>
  );
}

function Register({ figures }) {
  return (
    <div>
      <Headline value={formatNumber(figures.registered)} foot="people entitled to vote" />
      <Foot
        items={[
          ["Polling units", formatNumber(figures.booths)],
          ["Voters per unit", formatNumber(figures.density ?? Math.round(figures.registered / Math.max(figures.booths, 1)))],
        ]}
      />
    </div>
  );
}

function Projection() {
  const rows = projectionRows();
  const leader = rows[0];

  return (
    <div>
      <Headline
        value={leader.id}
        foot={
          leader.quarterStates >= 24
            ? `clears a quarter in ${leader.quarterStates} states, 24 are needed`
            : `only ${leader.quarterStates} states at a quarter, so this is a run off`
        }
      />
      <ul className="mt-3 space-y-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-2">
            <span className="figure text-[0.75rem] font-bold text-white">{row.id}</span>
            <span className="figure text-[0.75rem] text-white/70 tabular-nums">
              {formatShare(row.share)} · {row.states} states won · {row.quarterStates} at a quarter
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-board-line pt-2.5 text-[0.6875rem] leading-relaxed text-white/45">
        With no assumptions set this is the declared 2023 result exactly. Move the sliders on
        Analytics to ask what would happen instead.
      </p>
    </div>
  );
}

function Closest() {
  const rows = closestStates(8);
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.code} className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[0.8125rem] font-semibold text-white">{row.name}</span>
          <span className="figure shrink-0 text-[0.75rem] text-white/70 tabular-nums">
            {row.winner} over {row.runnerUp} by {formatShare(row.margin)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Zones() {
  const rows = zoneRows();
  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.zone}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[0.8125rem] font-semibold text-white">{row.zone}</span>
            <span className="figure shrink-0 text-[0.75rem] text-white/70 tabular-nums">
              {row.leader} by {formatShare(row.margin)} · {formatShare(row.turnout)} turnout
            </span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(100, row.turnout * 2)}%`, background: PARTY_FILL[row.leader] ?? "#ffffff" }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Headline({ value, foot }) {
  return (
    <>
      <p className="figure text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-white tabular-nums">
        {value}
      </p>
      <p className="mt-1.5 text-[0.75rem] text-white/50">{foot}</p>
    </>
  );
}

function Foot({ items }) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-board-line pt-2.5">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[0.5625rem] font-semibold tracking-[0.14em] text-white/35 uppercase">
            {label}
          </dt>
          <dd className="figure text-[0.75rem] font-bold text-white tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* --------------------------------------------------------------------- maps */

/**
 * The place, drawn.
 *
 * ── WHAT IT DRAWS AT EACH LEVEL ────────────────────────────────────────────
 *   Nigeria  all 37, coloured by who led them.
 *   A state  its own local governments, coloured by who led them, cropped to
 *            the state so it fills the frame rather than sitting in a corner
 *            of the national canvas the file was drawn on.
 *   An LGA   the state with that one local government picked out, because
 *            "where is this place" is the question a map answers here and a
 *            single shape floating alone answers nothing.
 *   A ward   the same, with the honest note that ward boundaries do not exist
 *            in any published dataset. A shape invented for a ward would be a
 *            lie drawn at 400 pixels wide.
 */
function BoardMap({ card, shapes, boundaries }) {
  const state = card.stateCode ? states2023.find((row) => row.code === card.stateCode) : null;

  const inner = useMemo(() => {
    if (!state) {
      /* The whole country. Leaders come off the declared table directly. */
      return {
        viewBox: `0 0 ${shapes.width} ${shapes.height}`,
        paths: shapes.states.map((shape) => {
          const row = states2023.find((item) => item.code === shape.code);
          const lead = row ? leaderOf(row.votes) : null;
          return {
            key: shape.code,
            d: shape.d,
            name: shape.name,
            fill: lead === null ? "var(--color-board-raised)" : PARTY_FILL[["APC", "PDP", "LP", "NNPP"][lead]],
            picked: false,
          };
        }),
      };
    }

    if (!boundaries?.lgas) return null;

    const rows = apportion({
      names: boundaries.lgas.map((row) => row.name),
      votes: state.votes,
      booths: state.booths,
      registered: state.registered,
      parentKey: state.code,
    });

    const frame = boundsOf(boundaries.lgas.map((shape) => shape.d));

    return {
      viewBox: frame.viewBox,
      paths: boundaries.lgas.map((shape, index) => {
        const lead = leaderOf(rows[index].votes);
        return {
          key: shape.name,
          d: shape.d,
          name: shape.name,
          fill: lead === null ? "var(--color-board-raised)" : PARTY_FILL[["APC", "PDP", "LP", "NNPP"][lead]],
          /* Highlighted rather than isolated: the point of the card is where
             the place sits, which needs its neighbours in frame. */
          picked: Boolean(card.lga) && shape.name === card.lga,
        };
      }),
    };
  }, [state, shapes, boundaries, card.lga]);

  if (!inner) {
    return (
      <p className="flex items-center gap-2 py-8 text-[0.8125rem] text-white/45">
        <Loader2 size={14} className="animate-spin" />
        Drawing {state?.name ?? "the map"}…
      </p>
    );
  }

  const dim = inner.paths.some((path) => path.picked);

  return (
    <div>
      <svg
        viewBox={inner.viewBox}
        className="w-full"
        role="img"
        aria-label={`Map of ${card.subtitle}. The same figures are on the cards beside it.`}
      >
        {inner.paths.map((path) => (
          <path
            key={path.key}
            d={path.d}
            fill={path.fill}
            stroke={path.picked ? "#ffffff" : "var(--color-board)"}
            strokeWidth={path.picked ? 2.5 : 0.8}
            strokeLinejoin="round"
            opacity={dim && !path.picked ? 0.3 : 1}
          >
            <title>{path.name}</title>
          </path>
        ))}
      </svg>

      {card.scope === "ward" && (
        <p className="mt-2 border-t border-board-line pt-2.5 text-[0.6875rem] leading-relaxed text-white/45">
          {card.ward} sits inside {card.lga}, which is picked out here. Ward boundaries are not
          published anywhere, so none is drawn rather than invented.
        </p>
      )}
    </div>
  );
}
