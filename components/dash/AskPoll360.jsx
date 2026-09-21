"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowUp,
  Braces,
  ChevronDown,
  CircleCheck,
  FileSpreadsheet,
  FileText,
  Loader2,
  MapPinned,
  RotateCcw,
  Search,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import { LEVEL_WORDS, fmtCell, fmtInt, isNumeric } from "@/lib/ask/format";
import { askThread } from "@/lib/ask/thread";
import { cn } from "@/lib/utils";

/**
 * Ask Poll360: the analytics head's question desk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A DESK, NOT A CHAT WINDOW
 *
 *  Every answer is a card that can stand on its own: the answer in one line,
 *  the figures that carry it, the reading, what to do about it, the tables
 *  behind it, and a file to take away. The question is printed above it so a
 *  card screenshotted into a WhatsApp group still says what it answers.
 *
 *  The work is done on the server — see lib/ask/answer.js. This file asks,
 *  shows and downloads. It never computes a figure.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── TWO DOORS, ONE DESK ────────────────────────────────────────────────
   Ask Poll360 opens from Election Analytics and from Strategic Planning. It
   is the same desk and the same conversation behind both doors — only the
   first questions offered differ, because the two heads are opened for
   different jobs. */
const PLANNING_STARTERS = [
  {
    group: "Party strength",
    icon: MapPinned,
    questions: [
      "How strong is our party in the North West?",
      "ADC members in Kano by LGA",
      "Strongest region for the PDP",
    ],
  },
  {
    group: "Where to go",
    icon: Target,
    questions: [
      "Where should Atiku focus in the North Central?",
      "Which wards in Plateau are within reach of 25%?",
      "Top 20 biggest polling units in Kaduna",
    ],
  },
  {
    group: "Scenarios",
    icon: TrendingUp,
    questions: [
      "What if Atiku gains 5 points and Tinubu loses 3?",
      "Does Atiku meet Section 134?",
      "What if turnout rises 10% and Atiku gains 3 points?",
    ],
  },
];

const STARTERS = [
  {
    group: "Reach",
    icon: Target,
    questions: [
      "List of states Atiku can get 25%, LGA, ward and polling unit",
      "Does Atiku meet Section 134?",
      "Which wards in Plateau are within reach of 25%?",
    ],
  },
  {
    group: "Ground",
    icon: MapPinned,
    questions: [
      "Which LGAs in Kano did Atiku win in 2023?",
      "Primary strongholds in Gombe",
      "Top 20 biggest polling units in Lagos",
    ],
  },
  {
    group: "Plan",
    icon: TrendingUp,
    questions: [
      "Where should Atiku focus in the North Central?",
      "What if Atiku gains 5 points and Tinubu loses 3?",
      "Where did Atiku lose ground since 2019?",
    ],
  },
];

export default function AskPoll360({ ground = "Nigeria", desk = "analytics" }) {
  const thread = useSyncExternalStore(askThread.subscribe, askThread.snapshot, askThread.serverSnapshot);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  const ask = useCallback(
    async (text) => {
      const question = String(text ?? draft).trim();
      if (!question || busy) return;
      setBusy(true);
      setError(null);
      setDraft("");
      const last = thread[thread.length - 1];
      /* Past the server's own minute, the connection is the problem, not the
         question: say so rather than spin. */
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), 75_000);
      try {
        const response = await fetch("/api/ask", {
          method: "POST",
          signal: stop.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            previous: last?.plans?.[0] ?? null,
            history: thread.slice(-3).map((turn) => ({ question: turn.question, headline: turn.answer?.headline })),
          }),
        });
        const reply = await response.json().catch(() => null);
        if (!response.ok || !reply) throw new Error(reply?.error ?? "Poll360 could not answer that just now.");
        askThread.add(reply);
      } catch (failure) {
        const message =
          failure.name === "AbortError"
            ? "The connection dropped before Poll360 could answer. Check the signal and ask again."
            : failure instanceof TypeError
              ? "Poll360 could not be reached. Check the connection and ask again."
              : failure.message;
        setError({ question, message });
        setDraft(question);
      } finally {
        clearTimeout(timer);
        setBusy(false);
      }
    },
    [draft, busy, thread]
  );

  useEffect(() => {
    if (thread.length || busy) endRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [thread.length, busy]);

  return (
    <div className="flex flex-col gap-3">
      <header className="relative overflow-hidden rounded-dash bg-blue-900 px-5 py-5 text-white sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <BrandMark coverage={0.25} className="size-11 text-white" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-[1.375rem] leading-tight font-bold tracking-tight">Ask Poll360</h2>
            <p className="mt-0.5 max-w-2xl text-[0.8125rem] leading-relaxed text-white/70">
              {desk === "planning"
                ? "Party strength, targets and scenarios, answered from the record — the vote and the party's own register, side by side and never added together."
                : "Election analytics and planning, answered from the record. Every figure is worked out by Poll360 and checked before you read it — nothing is guessed."}
            </p>
          </div>
          <span className="rounded-full border border-white/20 px-3 py-1 text-[0.75rem] font-semibold text-white/85">
            Reading: {ground}
          </span>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-red-500" aria-hidden="true" />
      </header>

      {thread.length === 0 && !busy && <Starters onAsk={ask} groups={desk === "planning" ? PLANNING_STARTERS : STARTERS} />}

      {thread.map((turn) => (
        <AnswerCard key={turn.id} turn={turn} onAsk={ask} />
      ))}

      {busy && <Thinking />}
      {error && (
        <p role="alert" className="rounded-dash border border-red-200 bg-red-50 px-4 py-3 text-[0.8125rem] text-red-800">
          {error.message}
        </p>
      )}
      <div ref={endRef} />

      <Composer
        desk={desk}
        value={draft}
        onChange={setDraft}
        onAsk={() => ask()}
        busy={busy}
        inputRef={inputRef}
        onClear={
          thread.length
            ? () => {
                askThread.clear();
                setError(null);
                inputRef.current?.focus();
              }
            : null
        }
      />
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ asking */

function Composer({ desk, value, onChange, onAsk, busy, inputRef, onClear }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onAsk();
      }}
      className="sticky bottom-2 z-10 rounded-dash border border-dash-line bg-dash-card p-2 shadow-[0_8px_30px_-12px_rgb(9_20_77/0.35)]"
    >
      <label htmlFor="ask-poll360" className="sr-only">
        Ask Poll360 a question
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="ask-poll360"
          ref={inputRef}
          rows={1}
          value={value}
          maxLength={500}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onAsk();
            }
          }}
          placeholder={
            desk === "planning"
              ? "Ask about party strength, targets or a scenario — e.g. how strong is the APC in the South West?"
              : "Ask about any state, LGA, ward or polling unit — e.g. where can Atiku get 25% in Plateau?"
          }
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[0.9375rem] text-dash-ink outline-none placeholder:text-dash-muted/70"
        />
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            title="Start a new conversation"
            className="flex size-11 shrink-0 items-center justify-center rounded-dash-sm text-dash-muted transition-colors hover:bg-dash-bg hover:text-dash-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-dash-ink"
          >
            <RotateCcw size={17} aria-hidden="true" />
            <span className="sr-only">Start a new conversation</span>
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="flex h-11 shrink-0 items-center gap-2 rounded-dash-sm bg-red-500 px-4 text-[0.875rem] font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-ink-200 disabled:text-ink-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
        >
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
          Ask
        </button>
      </div>
    </form>
  );
}

function Starters({ onAsk, groups }) {
  return (
    <section className="grid gap-3 md:grid-cols-3">
      {groups.map((group) => (
        <div key={group.group} className="rounded-dash border border-dash-line bg-dash-card p-4">
          <h3 className="flex items-center gap-2 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            <group.icon size={14} aria-hidden="true" />
            {group.group}
          </h3>
          <ul className="mt-3 space-y-1.5">
            {group.questions.map((question) => (
              <li key={question}>
                <button
                  type="button"
                  onClick={() => onAsk(question)}
                  className="w-full rounded-dash-sm border border-dash-line px-3 py-2 text-left text-[0.8125rem] leading-snug text-dash-ink transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dash-ink"
                >
                  {question}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Thinking() {
  return (
    <div className="flex items-center gap-3 rounded-dash border border-dash-line bg-dash-card px-4 py-4" role="status">
      <BrandMark coverage={0.62} className="size-8 animate-spin text-blue-900 [animation-duration:2.4s]" />
      <div>
        <p className="text-[0.875rem] font-semibold text-dash-ink">Reading the record…</p>
        <p className="text-[0.75rem] text-dash-muted">Working out every figure from the declared results and checking them.</p>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════ the answer */

function AnswerCard({ turn, onAsk }) {
  const [active, setActive] = useState(0);
  const section = turn.sections?.[active] ?? null;
  const when = useMemo(() => {
    const at = new Date(turn.askedAt);
    return Number.isNaN(at.getTime()) ? "" : at.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
  }, [turn.askedAt]);
  const provenances = [...new Map((turn.sections ?? []).map((entry) => [entry.provenanceLabel.label, entry.provenanceLabel])).values()];

  return (
    <article className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      <div className="border-b border-dash-line px-4 pt-4 pb-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2 text-[0.75rem] text-dash-muted">
          <Sparkles size={13} className="text-red-500" aria-hidden="true" />
          <span className="font-semibold text-dash-ink">“{turn.question}”</span>
          <span aria-hidden="true">·</span>
          <span>{when}</span>
        </div>

        <h3 className="mt-2.5 font-display text-[1.1875rem] leading-snug font-bold tracking-tight text-dash-ink sm:text-[1.3125rem]">
          {turn.answer.headline}
        </h3>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {provenances.map((label) => (
            <Badge key={label.label} tone={label.label === "Counted" || label.label === "Register" ? "blue" : label.label === "Scenario" ? "flag" : "ink"} title={label.note}>
              {label.label} · {label.note}
            </Badge>
          ))}
          {turn.engine === "model" && turn.checked ? (
            <Badge tone="ok" title="Every figure in the words above was traced to the record.">
              <CircleCheck size={12} aria-hidden="true" /> {fmtInt(turn.checked.figures)} figures checked against the record
            </Badge>
          ) : (
            <Badge tone="ok" title="Written by Poll360 from the computed figures.">
              <CircleCheck size={12} aria-hidden="true" /> Written from the computed figures
            </Badge>
          )}
        </div>

        {turn.understood?.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem]">
            {turn.understood.map((chip) => (
              <div key={`${chip.label}${chip.value}`} className="flex gap-1.5">
                <dt className="text-dash-muted">{chip.label}</dt>
                <dd className="font-semibold text-dash-ink">{chip.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {section?.tiles?.length > 0 && (
        <div className="grid grid-cols-2 border-b border-dash-line lg:grid-cols-4">
          {section.tiles.map((tile, index) => (
            <div
              key={tile.label}
              className={cn(
                "border-dash-line px-4 py-3 sm:px-5",
                index % 2 === 1 && "border-l",
                index >= 2 && "border-t lg:border-t-0",
                index >= 1 && "lg:border-l"
              )}
            >
              <p className="text-[0.6875rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">{tile.label}</p>
              <p
                className={cn(
                  "figure mt-1 truncate font-display text-[1.375rem] font-bold tabular-nums",
                  tile.tone === "warn" ? "text-red-500" : tile.tone === "good" ? "text-blue-600" : "text-dash-ink"
                )}
              >
                {tile.value}
              </p>
              {tile.sub && <p className="mt-0.5 text-[0.75rem] leading-snug text-dash-muted">{tile.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {(turn.answer.reading?.length > 0 || turn.answer.plan?.length > 0) && (
        <div className={cn("grid gap-0 border-b border-dash-line", turn.answer.plan?.length && "lg:grid-cols-[1.35fr_1fr]")}>
          {turn.answer.reading?.length > 0 && (
            <section className="px-4 py-4 sm:px-5">
              <h4 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">The reading</h4>
              <ul className="mt-2.5 space-y-2">
                {turn.answer.reading.map((line) => (
                  <li key={line} className="flex gap-2.5 text-[0.875rem] leading-relaxed text-dash-ink">
                    <span className="mt-[0.55rem] size-1.5 shrink-0 bg-red-500" aria-hidden="true" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {turn.answer.plan?.length > 0 && (
            <section className="border-t border-dash-line bg-blue-50/60 px-4 py-4 sm:px-5 lg:border-t-0 lg:border-l">
              <h4 className="text-[0.6875rem] font-semibold tracking-[0.1em] text-blue-800 uppercase">For the plan</h4>
              <ol className="mt-2.5 space-y-2">
                {turn.answer.plan.map((line, index) => (
                  <li key={line} className="flex gap-2.5 text-[0.875rem] leading-relaxed text-dash-ink">
                    <span className="figure mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-900 text-[0.6875rem] font-bold text-white">
                      {index + 1}
                    </span>
                    <span>{line}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}

      {turn.sections?.length > 0 && (
        <div className="border-b border-dash-line">
          {turn.sections.length > 1 && (
            <div role="tablist" aria-label="Levels" className="flex gap-1 overflow-x-auto border-b border-dash-line px-3 pt-3">
              {turn.sections.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active === index}
                  onClick={() => setActive(index)}
                  className={cn(
                    "-mb-px shrink-0 border-b-2 px-3 py-2 text-[0.8125rem] font-bold whitespace-nowrap transition-colors",
                    active === index ? "border-red-500 text-dash-ink" : "border-transparent text-dash-muted hover:text-dash-ink"
                  )}
                >
                  {LEVEL_WORDS[entry.level]?.title ?? entry.level}
                  <span className="figure ml-1.5 text-[0.75rem] font-semibold text-dash-muted tabular-nums">{fmtInt(entry.total)}</span>
                </button>
              ))}
            </div>
          )}
          {section && <Table key={`${turn.id}-${active}`} section={section} />}
        </div>
      )}

      {turn.sections?.length > 0 && <Downloads turn={turn} />}

      <div className="px-4 py-3 sm:px-5">
        {turn.answer.method?.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[0.75rem] font-semibold text-dash-muted hover:text-dash-ink">
              <ChevronDown size={14} className="transition-transform group-open:rotate-180" aria-hidden="true" />
              How Poll360 worked this out
            </summary>
            <ul className="mt-2 space-y-1.5 pl-5">
              {turn.answer.method.map((line) => (
                <li key={line} className="list-disc text-[0.75rem] leading-relaxed text-dash-muted">
                  {line}
                </li>
              ))}
            </ul>
          </details>
        )}
        {turn.followups?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {turn.followups.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onAsk(question)}
                className="rounded-full border border-dash-line px-3 py-1.5 text-[0.75rem] font-semibold text-dash-ink transition-colors hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-dash-ink"
              >
                {question}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

const BADGE = {
  blue: "bg-blue-50 text-blue-800 border-blue-100",
  ink: "bg-ink-100 text-ink-700 border-ink-200",
  flag: "bg-flagged/10 text-ink-800 border-flagged/30",
  ok: "bg-dash-bg text-ink-700 border-dash-line",
};

function Badge({ tone = "ink", title, children }) {
  return (
    <span title={title} className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold", BADGE[tone])}>
      {children}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════ the table */

const STATUS_PILL = {
  held: "bg-blue-600 text-white",
  cleared: "bg-blue-500 text-white",
  slipped: "bg-blue-100 text-blue-800",
  reach: "bg-flagged/15 text-ink-900 ring-1 ring-flagged/40",
  beyond: "bg-ink-100 text-ink-500",
  unknown: "bg-ink-50 text-ink-400",
};

function Table({ section }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q
      ? section.rows.filter((row) =>
          section.columns.some((column) => column.kind === "text" && String(row[column.key] ?? "").toLowerCase().includes(q))
        )
      : section.rows;
    if (sort) {
      const column = section.columns.find((entry) => entry.key === sort.key);
      list = [...list].sort((a, b) => {
        const x = column?.kind === "status" ? a.status_label : a[sort.key];
        const y = column?.kind === "status" ? b.status_label : b[sort.key];
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        return (x > y ? 1 : x < y ? -1 : 0) * (sort.dir === "asc" ? 1 : -1);
      });
    }
    return list;
  }, [section, query, sort]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
        <p className="text-[0.8125rem] font-semibold text-dash-ink">{section.title}</p>
        <label className="flex h-9 items-center gap-2 rounded-dash-sm border border-dash-line px-2.5 text-dash-muted focus-within:border-blue-300">
          <Search size={14} aria-hidden="true" />
          <span className="sr-only">Find in this table</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a place"
            className="w-36 bg-transparent text-[0.8125rem] text-dash-ink outline-none placeholder:text-dash-muted/70"
          />
        </label>
      </div>

      <div className="max-h-[32rem] overflow-auto border-t border-dash-line">
        <table className="w-full min-w-[44rem] border-collapse text-[0.8125rem]">
          <thead className="sticky top-0 z-[1] bg-blue-900 text-white">
            <tr>
              {section.columns.map((column) => {
                const sorted = sort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                    className={cn("px-3 py-2 font-semibold whitespace-nowrap", isNumeric(column) ? "text-right" : "text-left")}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setSort((current) =>
                          current?.key === column.key
                            ? { key: column.key, dir: current.dir === "desc" ? "asc" : "desc" }
                            : { key: column.key, dir: isNumeric(column) ? "desc" : "asc" }
                        )
                      }
                      className="inline-flex items-center gap-1 hover:text-white/80"
                    >
                      {column.label}
                      {sorted && <span aria-hidden="true">{sort.dir === "asc" ? "↑" : "↓"}</span>}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.key ?? row.name}-${index}`} className="border-b border-dash-line odd:bg-white even:bg-ink-50/70 hover:bg-blue-50/60">
                {section.columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-3 py-1.5 align-middle whitespace-nowrap",
                      isNumeric(column) || column.numericLook ? "figure text-right tabular-nums" : "text-left",
                      column.main && "font-semibold text-dash-ink",
                      column.mono && "font-mono text-[0.75rem] text-dash-muted",
                      !column.main && !column.mono && !isNumeric(column) && "text-dash-muted"
                    )}
                  >
                    <Cell column={column} row={row} />
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={section.columns.length} className="px-4 py-8 text-center text-dash-muted">
                  Nothing in this table matches “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="px-4 py-2.5 text-[0.75rem] text-dash-muted sm:px-5">
        {section.total > section.rows.length
          ? `Showing the first ${fmtInt(section.rows.length)} of ${fmtInt(section.total)}. ${
              section.total > 12000
                ? "The CSV and XML carry up to 12,000 rows — for every polling unit on a list this long, ask for one state at a time."
                : "The CSV and XML carry every one."
            }`
          : `${fmtInt(section.total)} ${section.total === 1 ? "row" : "rows"}.`}
        {section.limited ? ` Cut at ${fmtInt(section.limited)}, as asked.` : ""}
      </p>
    </div>
  );
}

function Cell({ column, row }) {
  if (column.kind === "status") {
    return (
      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[0.6875rem] font-bold", STATUS_PILL[row.status] ?? STATUS_PILL.unknown)}>
        {row.status_label}
      </span>
    );
  }
  if (column.kind === "bar") {
    const value = row[column.key];
    if (value === null || value === undefined) return "—";
    const clear = column.threshold !== null && column.threshold !== undefined ? value >= column.threshold : null;
    return (
      <span className="inline-flex items-center justify-end gap-2">
        <span className="relative hidden h-1.5 w-16 bg-ink-100 sm:block" aria-hidden="true">
          <span
            className={cn("absolute inset-y-0 left-0", clear === false ? "bg-ink-400" : "bg-blue-600")}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
          {column.threshold !== null && column.threshold !== undefined && (
            <span className="absolute -inset-y-0.5 w-px bg-red-500" style={{ left: `${column.threshold}%` }} />
          )}
        </span>
        <span className={cn("font-semibold", clear === false ? "text-dash-muted" : "text-dash-ink")}>{fmtCell(column, row)}</span>
      </span>
    );
  }
  return fmtCell(column, row);
}

/* ══════════════════════════════════════════════════════════════ files */

const FORMATS = [
  { id: "pdf", label: "PDF brief", note: "Branded, ready to print or send", icon: FileText },
  { id: "csv", label: "CSV", note: "Every row, opens in Excel", icon: FileSpreadsheet },
  { id: "xml", label: "XML", note: "Structured, for other systems", icon: Braces },
];

function Downloads({ turn }) {
  const [busy, setBusy] = useState(null);
  const [problem, setProblem] = useState(null);

  async function take(format) {
    setBusy(format);
    setProblem(null);
    try {
      const response = await fetch("/api/ask/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          token: turn.token,
          payload: {
            id: turn.id,
            question: turn.question,
            askedAt: turn.askedAt,
            engine: turn.engine,
            plans: turn.plans,
            answer: turn.answer,
          },
        }),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "The file could not be made.");
      }
      const blob = await response.blob();
      const named = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1];
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = named ?? `poll360-ask.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (failure) {
      setProblem(failure.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-b border-dash-line px-4 py-3.5 sm:px-5">
      <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">Take it with you</p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
        {FORMATS.map((format) => (
          <button
            key={format.id}
            type="button"
            onClick={() => take(format.id)}
            disabled={Boolean(busy)}
            className="group flex items-center gap-3 rounded-dash-sm border border-dash-line px-3 py-2.5 text-left transition-colors hover:border-blue-900 hover:bg-blue-900 hover:text-white disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-dash-sm bg-blue-50 text-blue-800 group-hover:bg-red-500 group-hover:text-white">
              {busy === format.id ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : <format.icon size={17} aria-hidden="true" />}
            </span>
            <span>
              <span className="block text-[0.8125rem] font-bold">{format.label}</span>
              <span className="block text-[0.6875rem] text-dash-muted group-hover:text-white/70">{format.note}</span>
            </span>
          </button>
        ))}
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-[0.75rem] text-red-700">
          {problem}
        </p>
      )}
    </div>
  );
}
