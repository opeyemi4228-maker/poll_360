"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlignLeft,
  Check,
  CornerDownLeft,
  Loader2,
  MapPin,
  MessageSquareText,
  MonitorPlay,
  PanelBottom,
  Zap,
} from "lucide-react";

import BrandMark from "@/components/ui/BrandMark";
import { Card, Empty } from "@/components/dash/DashCard";
import { Queue, Said, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { placeOf } from "@/lib/stamp";
import { parseUnitCode } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * The breaking desk.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FAST IS A LAYOUT PROBLEM, NOT A PERMISSIONS PROBLEM
 *
 *  The temptation on a screen like this is a button that puts a red strap on
 *  air immediately, because that is what "breaking" feels like it should mean.
 *  It is the wrong instinct and it is the specific way election broadcasting
 *  goes wrong: the thing that gets said in the first ninety seconds is the
 *  thing that gets quoted for the rest of the night, and it is said before
 *  anybody has been to look.
 *
 *  So this desk does not shorten the journey. It shortens the *typing*. One
 *  headline, written once, becomes every output the story needs — a strap, a
 *  full frame, a post — and all of them go into review together, where one
 *  person clears the set in one press. Three steps, under a minute, and a
 *  second pair of eyes still happened.
 *
 *  ── HOW THE SCREEN IS LAID OUT, AND WHY ─────────────────────────────────
 *  Left to right is the order a story is made in. The composer is where the
 *  hands are; beside it, the programme monitor shows the words at the size
 *  they go out, so nobody writes a line that does not fit a strap; under
 *  that, what the field has just said, because most breaking news on an
 *  election night starts as a report from somebody standing at a polling
 *  unit, and a desk that has to remember which other screen those live on
 *  learns about its own field reports from social media.
 *
 *  The workflow is not a card of prose any more. It is the track across the
 *  top of the composer, and it fills in as the story does — which is the only
 *  way a written workflow ever gets read.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ── WHAT FITS ON A STRAP ────────────────────────────────────────────────
   A strap keyed over the lower third holds about this many capitals at the
   size a viewer can read across a room. Past it the line is squeezed or cut
   on air, and the desk should know that before the editor does. */
const STRAP_FIT = 60;

/** What one event can become, what each one is for, and how it is drawn. */
const OUTPUTS = [
  { id: "BANNER", label: "TV strap", why: "The red bar across the bottom of the picture.", icon: PanelBottom, on: true },
  { id: "FULLSCREEN", label: "Full frame", why: "The whole screen, for a presenter to read against.", icon: MonitorPlay, on: true },
  { id: "SOCIAL", label: "Social post", why: "Facebook, X and WhatsApp, adapted on the social desk.", icon: MessageSquareText, on: true },
  { id: "TICKER", label: "Ticker line", why: "Runs under whatever else is on.", icon: AlignLeft, on: false },
];

/* ── THE WORDS THAT SAY HOW SURE WE ARE ──────────────────────────────────
   The most important field on this screen is the one people skip. One press
   puts a careful, attributed line in it, so the fast choice and the careful
   choice are the same choice. */
const ATTRIBUTIONS = [
  "Reported by our agent; not yet confirmed",
  "Confirmed by our agent at the polling unit",
  "Our team is checking with the agent there",
];

/* The journey, in the order an item makes it. The first three are this
   desk's; the last two belong to somebody else, and are drawn that way. */
const STEPS = [
  { id: "event", label: "Headline" },
  { id: "where", label: "Place" },
  { id: "say", label: "Attribution" },
  { id: "editor", label: "Editor clears" },
  { id: "air", label: "Goes out" },
];

const WAT = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" });

const SEVERITY = {
  CRITICAL: { word: "Critical", tone: "bg-red-600 text-white" },
  SERIOUS: { word: "Serious", tone: "bg-red-50 text-red-700" },
  WARNING: { word: "Warning", tone: "bg-dash-bg text-dash-ink" },
  INFO: { word: "For information", tone: "bg-dash-bg text-dash-muted" },
};

const LABEL = "block text-[0.6875rem] font-bold tracking-[0.12em] text-dash-muted uppercase";
const FIELD =
  "mt-2 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3.5 text-dash-ink transition-[border-color,box-shadow] placeholder:text-dash-muted/70 focus:border-dash-ink focus:ring-4 focus:ring-dash-ink/10 focus:outline-none";

export default function BreakingNews({ items, incidents = [], race }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  const [headline, setHeadline] = useState("");
  const [detail, setDetail] = useState("");
  const [where, setWhere] = useState("");
  const [chosen, setChosen] = useState(() => new Set(OUTPUTS.filter((o) => o.on).map((o) => o.id)));
  const headlineRef = useRef(null);

  const straps = items.filter((item) => item.kind === "BANNER" || item.kind === "FULLSCREEN");
  const live = straps.filter((item) => item.state === "ON_AIR");

  const text = headline.trim();
  const ready = Boolean(text) && chosen.size > 0 && !pending;
  const done = { event: Boolean(text), where: Boolean(where.trim()), say: Boolean(detail.trim()) };

  /* The field's reports, newest first, with the place worked out once. */
  const field = useMemo(
    () =>
      incidents.slice(0, 6).map((row) => {
        const parsed = parseUnitCode(row.unitCode);
        const place = placeOf(parsed ? `STATE:${parsed.stateNumber}` : null);
        return { ...row, place: place.name };
      }),
    [incidents]
  );

  const toggle = (id) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /* A report from the field becomes the start of a story: its words, its
     place, and the careful attribution — then the cursor is in the headline,
     because the agent's words are almost never the words that go on air. */
  const takeReport = (row) => {
    setHeadline(row.kind);
    setWhere(row.place);
    setDetail(ATTRIBUTIONS[0]);
    headlineRef.current?.focus();
    headlineRef.current?.select();
  };

  const build = () => {
    if (!ready) return;

    run(async () => {
      /* ── ONE EVENT, SEVERAL ITEMS, ONE SET OF WORDS ──────────────────
         Each output is its own item because each is cleared, aired and
         taken down separately — a strap comes off long before the post
         does. They carry the same `event` stamp so the audit can show
         they were one story rather than four coincidences. */
      const event = `${Date.now().toString(36)}`;
      for (const id of OUTPUTS.map((o) => o.id).filter((id) => chosen.has(id))) {
        const answer = await draftItem({
          kind: id,
          title: text.toUpperCase(),
          body: [where.trim(), detail.trim()].filter(Boolean).join(" — ") || null,
          race,
          payload: { event, breaking: true, where: where.trim() || null },
          platforms: id === "SOCIAL" ? ["facebook", "x", "whatsapp"] : [],
        });
        if (answer?.error) return answer;
      }
      return { ok: true };
    }, {
      onDone: () => {
        setHeadline("");
        setDetail("");
        setWhere("");
        setSaid({ tone: "good", text: "Drafted and waiting for an editor. Nothing is on air yet." });
      },
    });
  };

  /* ⌘/Ctrl + Enter from anywhere in the composer. The button is the path
     for a mouse; this is the path for somebody who has not taken their hands
     off the keys since the phone rang. */
  const onKeyDown = (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      build();
    }
  };

  return (
    <div className="space-y-4">
      {/* ── WHAT IS ALREADY OUT ────────────────────────────────────────── */}
      {live.length > 0 && (
        <div className="flex items-stretch overflow-hidden rounded-dash bg-red-600 text-white">
          <span className="flex shrink-0 items-center gap-2 bg-red-700 px-4 text-[0.6875rem] font-bold tracking-[0.18em] uppercase">
            <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" />
            On air now
          </span>
          <div className="min-w-0 flex-1 divide-y divide-red-500 px-5">
            {live.map((item) => (
              <p key={item.id} className="truncate py-3 font-display text-[1.125rem] leading-tight font-extrabold">
                {item.title}
              </p>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        {/* ════════════════════════════════════════════════ THE COMPOSER ═══ */}
        <section className="flex flex-col overflow-hidden rounded-dash border border-dash-line bg-dash-card">
          <header className="border-b border-dash-line px-5 pt-5 pb-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-[1.25rem] leading-none font-extrabold tracking-[-0.02em] text-dash-ink">
                  <Zap size={19} strokeWidth={2.5} className="text-red-600" aria-hidden="true" />
                  Break a story
                </h2>
                <p className="mt-1.5 text-[0.875rem] text-dash-muted">
                  Write it once. Every output the story needs is drafted together.
                </p>
              </div>
            </div>
            <StepTrack done={done} />
          </header>

          {!may.draft ? (
            <div className="p-6">
              <Empty>This account can read the breaking desk and not write to it.</Empty>
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-6 px-5 py-6 sm:px-6" onKeyDown={onKeyDown}>
                {/* ── THE HEADLINE, AND WHETHER IT FITS ────────────────── */}
                <label className="block">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={LABEL}>The headline</span>
                    <FitCount length={text.length} />
                  </span>
                  <input
                    ref={headlineRef}
                    value={headline}
                    onChange={(event) => setHeadline(event.target.value)}
                    placeholder="Collation suspended in Ward 7"
                    aria-describedby="breaking-fit"
                    className={cn(
                      FIELD,
                      "h-16 font-display text-[1.5rem] font-extrabold tracking-[-0.015em] uppercase placeholder:normal-case placeholder:font-bold",
                      text.length > STRAP_FIT && "border-red-600 focus:border-red-600 focus:ring-red-600/15"
                    )}
                  />
                  <FitMeter length={text.length} />
                </label>

                {/* ── WHERE, AND HOW SURE WE ARE ───────────────────────── */}
                <div className="grid gap-5 lg:grid-cols-2">
                  <label className="block">
                    <span className={LABEL}>Where</span>
                    <span className="relative block">
                      <MapPin
                        size={16}
                        strokeWidth={2.25}
                        className="pointer-events-none absolute top-1/2 left-3.5 mt-1 -translate-y-1/2 text-dash-muted"
                        aria-hidden="true"
                      />
                      <input
                        value={where}
                        onChange={(event) => setWhere(event.target.value)}
                        placeholder="Yola North, Adamawa"
                        className={cn(FIELD, "h-12 pl-10 text-[0.9375rem]")}
                      />
                    </span>
                  </label>
                  <label className="block">
                    <span className={LABEL}>What we can actually say</span>
                    <input
                      value={detail}
                      onChange={(event) => setDetail(event.target.value)}
                      placeholder="Reported by our agent; not yet confirmed"
                      className={cn(FIELD, "h-12 text-[0.9375rem]")}
                    />
                  </label>
                </div>

                <div className="-mt-2 flex flex-wrap gap-2" aria-label="Attribution, in one press">
                  {ATTRIBUTIONS.map((line) => (
                    <button
                      key={line}
                      type="button"
                      onClick={() => setDetail(line)}
                      aria-pressed={detail === line}
                      className={cn(
                        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
                        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                        detail === line
                          ? "border-dash-ink bg-dash-ink text-white"
                          : "border-dash-line bg-dash-card text-dash-muted hover:border-dash-ink hover:text-dash-ink"
                      )}
                    >
                      {detail === line && <Check size={13} strokeWidth={3} aria-hidden="true" />}
                      {line}
                    </button>
                  ))}
                </div>

                {/* ── WHAT IT BECOMES, DRAWN AS WHAT IT BECOMES ────────── */}
                <fieldset>
                  <legend className={LABEL}>Make it as</legend>
                  <div className="mt-2.5 grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
                    {OUTPUTS.map((output) => (
                      <OutputCard
                        key={output.id}
                        output={output}
                        on={chosen.has(output.id)}
                        onToggle={() => toggle(output.id)}
                        headline={text}
                      />
                    ))}
                  </div>
                </fieldset>
              </div>

              {/* ── THE ONE PRESS ──────────────────────────────────────────
                  A bar of its own at the foot of the composer, so the action
                  is always in the same place and always says exactly what it
                  will do, and to whom it hands the story. */}
              <footer className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-dash-line bg-dash-bg px-5 py-4 sm:px-6">
                <button
                  type="button"
                  onClick={build}
                  disabled={!ready}
                  className="inline-flex h-12 items-center gap-2.5 rounded-full bg-red-600 px-6 text-[0.9375rem] font-bold text-white transition-colors hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:cursor-not-allowed disabled:bg-dash-line disabled:text-dash-muted"
                >
                  {pending ? (
                    <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Zap size={18} strokeWidth={2.5} aria-hidden="true" />
                  )}
                  {pending ? "Drafting…" : `Send ${chosen.size} output${chosen.size === 1 ? "" : "s"} to an editor`}
                </button>
                <p className="min-w-0 flex-1 text-[0.8125rem] leading-snug text-dash-muted">
                  Nothing goes to air from here. The next press is somebody else&rsquo;s.
                  <span className="ml-2 hidden items-center gap-1 text-dash-muted lg:inline-flex">
                    <kbd className="rounded border border-dash-line bg-dash-card px-1.5 py-0.5 font-mono text-[0.6875rem]">
                      ⌘
                    </kbd>
                    <kbd className="rounded border border-dash-line bg-dash-card px-1.5 py-0.5 font-mono text-[0.6875rem]">
                      <CornerDownLeft size={11} strokeWidth={2.5} className="inline" aria-label="Enter" />
                    </kbd>
                  </span>
                </p>
              </footer>
              {said && (
                <div className="px-5 pb-4 sm:px-6">
                  <Said said={said} />
                </div>
              )}
            </>
          )}
        </section>

        {/* ═════════════════════════════════════════════ BESIDE THE HANDS ═══ */}
        <div className="flex flex-col gap-4">
          <ProgrammeMonitor headline={text} where={where.trim()} detail={detail.trim()} />

          <Card
            title="From the field"
            subtitle="The latest reports. Use one to start a story."
            padded={false}
          >
            {field.length === 0 ? (
              <div className="p-5">
                <Empty>Nothing reported from the field yet.</Empty>
              </div>
            ) : (
              <ul className="divide-y divide-dash-line">
                {field.map((row) => {
                  const severity = SEVERITY[row.severity] ?? SEVERITY.INFO;
                  return (
                    <li key={row.id} className="flex items-start gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[0.6875rem] font-bold whitespace-nowrap",
                              severity.tone
                            )}
                          >
                            {severity.word}
                          </span>
                          <span className="figure text-[0.75rem] text-dash-muted tabular-nums">
                            {WAT.format(new Date(row.createdAt))}
                          </span>
                        </p>
                        <p className="mt-1.5 text-[0.9375rem] leading-snug font-semibold text-dash-ink">{row.kind}</p>
                        <p className="mt-0.5 truncate text-[0.8125rem] text-dash-muted">
                          {row.place} · polling unit {row.unitCode}
                        </p>
                      </div>
                      {may.draft && (
                        <button
                          type="button"
                          onClick={() => takeReport(row)}
                          className="mt-0.5 inline-flex h-9 shrink-0 items-center rounded-full border border-dash-line px-3.5 text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink hover:bg-dash-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink"
                        >
                          Use
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Breaking output" subtitle="Every strap and full frame this desk has made tonight">
        <Queue items={straps} empty="Nothing has been broken tonight." />
      </Card>
    </div>
  );
}

/* ───────────────────────────────────────────────────────────── the parts ── */

/**
 * The workflow, as a track that fills in. The three steps this desk owns turn
 * solid as they are done; the two that belong to an editor stay outlined,
 * because the honest thing to show is that they are not in this person's gift.
 */
function StepTrack({ done }) {
  return (
    <ol className="mt-5 grid grid-cols-5 gap-1.5" aria-label="How a story gets out">
      {STEPS.map((step, index) => {
        const ours = index < 3;
        const complete = ours && done[step.id];
        return (
          <li key={step.id} className="min-w-0">
            <span
              aria-hidden="true"
              className={cn(
                "block h-1.5 rounded-full transition-colors duration-300",
                complete ? "bg-dash-ink" : ours ? "bg-dash-line" : "border border-dashed border-dash-line bg-transparent"
              )}
            />
            <span
              className={cn(
                "mt-2 flex items-center gap-1.5 truncate text-[0.75rem] font-semibold",
                complete ? "text-dash-ink" : "text-dash-muted"
              )}
            >
              <span
                className={cn(
                  "figure flex size-4.5 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold",
                  complete ? "bg-dash-ink text-white" : "border border-dash-line text-dash-muted"
                )}
              >
                {complete ? <Check size={10} strokeWidth={3.5} aria-hidden="true" /> : index + 1}
              </span>
              <span className="truncate">{step.label}</span>
              <span className="sr-only">{complete ? ", done" : ours ? ", to do" : ", after you send it"}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Characters used against what a strap holds. */
function FitCount({ length }) {
  const over = length > STRAP_FIT;
  return (
    <span
      id="breaking-fit"
      className={cn("figure text-[0.75rem] tabular-nums", over ? "font-bold text-red-600" : "text-dash-muted")}
    >
      {over ? `${length - STRAP_FIT} over the strap` : `${length} / ${STRAP_FIT}`}
    </span>
  );
}

/** The same fact as a bar, which is read without being read. */
function FitMeter({ length }) {
  const share = Math.min(1, length / STRAP_FIT);
  const over = length > STRAP_FIT;
  return (
    <span aria-hidden="true" className="mt-2 block h-1 overflow-hidden rounded-full bg-dash-bg">
      <span
        className={cn("block h-full rounded-full transition-[width,background-color] duration-200", over ? "bg-red-600" : "bg-dash-ink")}
        style={{ width: `${share * 100}%` }}
      />
    </span>
  );
}

/**
 * One output, drawn as a miniature of itself with the real words in it. The
 * choice and the preview are one object: you pick a strap by looking at the
 * strap you are about to make.
 */
function OutputCard({ output, on, onToggle, headline }) {
  const words = headline ? headline.toUpperCase() : "YOUR HEADLINE";
  const Icon = output.icon;
  return (
    <label
      className={cn(
        "group relative flex cursor-pointer flex-col overflow-hidden rounded-dash-sm border-2 bg-dash-card transition-[border-color,box-shadow]",
        "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-dash-ink",
        on ? "border-dash-ink shadow-e2" : "border-dash-line hover:border-dash-muted"
      )}
    >
      <input type="checkbox" checked={on} onChange={onToggle} className="sr-only" />

      <span aria-hidden="true" className={cn("@container relative block aspect-video bg-blue-950 transition-opacity", !on && "opacity-45")}>
        {output.id === "BANNER" && (
          <span className="absolute inset-x-[6%] bottom-[10%] flex overflow-hidden">
            <span className="bg-red-600 px-[3cqw] py-[2cqw] font-display text-[5cqw] font-extrabold text-white">!</span>
            <span className="min-w-0 flex-1 truncate bg-black px-[3cqw] py-[2cqw] font-display text-[5cqw] leading-none font-extrabold text-white">
              {words}
            </span>
          </span>
        )}
        {output.id === "FULLSCREEN" && (
          <span className="absolute inset-0 flex flex-col justify-center gap-[3cqw] px-[9cqw]">
            <span className="block h-[2cqw] w-[16cqw] bg-red-600" />
            <span className="line-clamp-3 font-display text-[8cqw] leading-[1.05] font-extrabold text-white">{words}</span>
          </span>
        )}
        {output.id === "SOCIAL" && (
          <span className="absolute inset-y-[10%] left-1/2 flex aspect-square -translate-x-1/2 flex-col justify-end bg-white p-[4cqw]">
            <span className="block h-[1.5cqw] w-[10cqw] bg-red-600" />
            <span className="mt-[2cqw] line-clamp-3 font-display text-[5cqw] leading-[1.05] font-extrabold text-blue-950">
              {words}
            </span>
          </span>
        )}
        {output.id === "TICKER" && (
          <span className="absolute inset-x-0 bottom-0 flex items-center overflow-hidden bg-white">
            <span className="bg-blue-900 px-[3cqw] py-[1.5cqw] font-display text-[4cqw] font-extrabold text-white">LIVE</span>
            <span className="truncate px-[3cqw] font-display text-[4.5cqw] font-bold text-blue-950">{words}</span>
          </span>
        )}
      </span>

      <span className="flex flex-1 items-start gap-2.5 p-3">
        <Icon size={16} strokeWidth={2.25} className={cn("mt-0.5 shrink-0", on ? "text-dash-ink" : "text-dash-muted")} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.875rem] font-bold text-dash-ink">{output.label}</span>
          <span className="mt-0.5 block text-[0.75rem] leading-snug text-dash-muted">{output.why}</span>
        </span>
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
            on ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line bg-dash-card"
          )}
        >
          {on && <Check size={12} strokeWidth={3.5} />}
        </span>
      </span>
    </label>
  );
}

/**
 * The programme monitor: the strap keyed over a picture, at broadcast
 * proportions, with the channel's bug and the title-safe edge. A desk that
 * cannot see the words at broadcast size writes words that do not fit at
 * broadcast size — so the preview is the output, scaled, not a description.
 */
function ProgrammeMonitor({ headline, where, detail }) {
  const sub = [where, detail].filter(Boolean).join(" — ");
  const over = headline.length > STRAP_FIT;
  return (
    <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      <header className="flex items-center justify-between gap-3 border-b border-dash-line px-5 py-3.5">
        <h2 className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em] text-dash-ink">Programme monitor</h2>
        <span className="text-[0.75rem] text-dash-muted">As it keys over the picture</span>
      </header>

      <div className="bg-ink-950 p-3">
        <div
          className="@container relative aspect-video overflow-hidden rounded-[4px] bg-[radial-gradient(120%_90%_at_30%_20%,var(--color-blue-800),var(--color-blue-950)_60%,#000)]"
          aria-label={headline ? `Preview: ${headline}` : "Preview of the strap"}
          role="img"
        >
          {/* Title-safe edge: 5% in, where a strap must sit to survive an
              overscanning set. */}
          <span aria-hidden="true" className="absolute inset-[5%] rounded-[2px] border border-dashed border-white/15" />

          <span aria-hidden="true" className="absolute top-[7%] right-[6%] flex items-center gap-[1.2cqw] text-white">
            <BrandMark className="size-[6cqw]" />
          </span>
          <span
            aria-hidden="true"
            className="absolute top-[8%] left-[6%] flex items-center gap-[1cqw] bg-red-600 px-[1.6cqw] py-[0.6cqw] font-display text-[2.4cqw] font-extrabold tracking-[0.1em] text-white"
          >
            <span className="size-[1.2cqw] rounded-full bg-white" />
            LIVE
          </span>

          <span aria-hidden="true" className="absolute inset-x-[5%] bottom-[8%] block">
            <span className="flex items-stretch">
              <span className="flex items-center bg-red-600 px-[2.4cqw] font-display text-[2.6cqw] font-extrabold tracking-[0.14em] text-white">
                BREAKING
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate bg-black px-[2.4cqw] py-[1.8cqw] font-display text-[3.8cqw] leading-none font-extrabold text-white",
                  !headline && "text-white/45"
                )}
              >
                {headline ? headline.toUpperCase() : "YOUR HEADLINE, AT THE SIZE IT GOES OUT"}
              </span>
            </span>
            {sub && (
              <span className="block truncate bg-ink-950 px-[2.4cqw] py-[1.1cqw] text-[2.4cqw] text-white/85">{sub}</span>
            )}
          </span>
        </div>
      </div>

      <p
        className={cn(
          "flex items-center gap-2 px-5 py-3 text-[0.8125rem]",
          over ? "font-semibold text-red-700" : "text-dash-muted"
        )}
      >
        {over
          ? "Too long for the strap: it will be cut on air. Shorten the headline."
          : headline
            ? "Fits the strap."
            : "Type a headline and it appears here as it will go out."}
      </p>
    </section>
  );
}
