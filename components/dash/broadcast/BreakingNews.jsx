"use client";

import { useState } from "react";
import { AlertTriangle, Loader2, Zap } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { Queue, Said, clock, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { describeUnit } from "@/lib/broadcast";
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
 *  ── AND WHY THE INCIDENT FEED IS ON THIS SCREEN ─────────────────────────
 *  Most breaking news on an election night starts as a report from somebody
 *  standing at a polling unit. Having to remember which other screen those
 *  live on is how a desk ends up learning about its own field reports from
 *  social media.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** What one event can become, and what each one is for. */
const OUTPUTS = [
  { id: "BANNER", label: "TV strap", why: "The red bar across the bottom of the picture.", on: true },
  { id: "FULLSCREEN", label: "Full frame", why: "The whole screen, for a presenter to read against.", on: true },
  { id: "SOCIAL", label: "Social post", why: "The same words, adapted per platform on the social desk.", on: true },
  { id: "TICKER", label: "Ticker line", why: "Runs under whatever else is on.", on: false },
];

const STEPS = [
  { id: "event", label: "Event", why: "Something has happened, or is being said to have happened." },
  { id: "report", label: "Field report", why: "Somebody at the place has told us." },
  { id: "verify", label: "Verification", why: "Held against what this product actually holds." },
  { id: "editor", label: "Editorial review", why: "A person who did not write it decides." },
  { id: "air", label: "Breaking alert", why: "TV and social, from one cleared set of words." },
];

export default function BreakingNews({ items, incidents, race }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();

  const [headline, setHeadline] = useState("");
  const [detail, setDetail] = useState("");
  const [where, setWhere] = useState("");
  const [chosen, setChosen] = useState(() => new Set(OUTPUTS.filter((o) => o.on).map((o) => o.id)));

  const straps = items.filter((item) => item.kind === "BANNER" || item.kind === "FULLSCREEN");
  const live = straps.filter((item) => item.state === "ON_AIR");

  const toggle = (id) =>
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const build = () => {
    const text = headline.trim();
    if (!text) return;

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

  return (
    <div className="space-y-4">
      {/* ── WHAT IS ALREADY OUT ────────────────────────────────────────── */}
      {live.length > 0 && (
        <div className="rounded-dash border-2 border-red-600 bg-red-600 px-5 py-4 text-white">
          <p className="flex items-center gap-2 text-[0.6875rem] font-bold tracking-[0.18em] uppercase">
            <span className="size-2 animate-pulse rounded-full bg-white" />
            On air now
          </p>
          {live.map((item) => (
            <p key={item.id} className="mt-2 font-display text-[1.25rem] leading-tight font-extrabold">
              {item.title}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_22rem]">
        <Card
          title="Break a story"
          subtitle="Write it once. Every output the story needs is drafted together."
        >
          {!may.draft ? (
            <Empty>This account can read the breaking desk and not write to it.</Empty>
          ) : (
            <>
              <label className="block">
                <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                  The headline
                </span>
                <input
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  placeholder="Collation suspended in Ward 7"
                  className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2.5 font-display text-[1.0625rem] font-extrabold tracking-[-0.01em] text-dash-ink uppercase focus:border-dash-ink focus:outline-none"
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                    Where
                  </span>
                  <input
                    value={where}
                    onChange={(event) => setWhere(event.target.value)}
                    placeholder="Yola North, Adamawa"
                    className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                    What we can actually say
                  </span>
                  <input
                    value={detail}
                    onChange={(event) => setDetail(event.target.value)}
                    placeholder="Reported by our agent; not yet confirmed"
                    className="mt-1.5 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 py-2 text-[0.875rem] text-dash-ink focus:border-dash-ink focus:outline-none"
                  />
                </label>
              </div>

              {/* ── THE PREVIEW IS THE STRAP ──────────────────────────────
                  Drawn the way it will key over the picture, because a desk
                  that cannot see the words at broadcast size will write words
                  that do not fit at broadcast size. */}
              <div className="mt-4 overflow-hidden rounded-dash-sm border border-dash-line">
                <div className="flex items-stretch bg-black">
                  <span className="flex items-center bg-red-600 px-3 py-3 font-display text-[0.6875rem] font-extrabold tracking-[0.16em] text-white uppercase">
                    Breaking
                  </span>
                  <span className="flex min-w-0 flex-1 items-center px-4 py-3 font-display text-[1rem] leading-tight font-extrabold tracking-[-0.01em] text-white uppercase">
                    {headline.trim() ? headline.toUpperCase() : "YOUR HEADLINE, AT THE SIZE IT GOES OUT"}
                  </span>
                </div>
                {(where.trim() || detail.trim()) && (
                  <p className="bg-ink-950 px-4 py-2 text-[0.8125rem] text-white/80">
                    {[where.trim(), detail.trim()].filter(Boolean).join(" — ")}
                  </p>
                )}
              </div>

              <fieldset className="mt-4">
                <legend className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
                  Make it as
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {OUTPUTS.map((output) => (
                    <label
                      key={output.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-dash-sm border px-3 py-2.5 transition-colors",
                        chosen.has(output.id)
                          ? "border-dash-ink bg-dash-bg"
                          : "border-dash-line hover:border-dash-ink"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={chosen.has(output.id)}
                        onChange={() => toggle(output.id)}
                        className="mt-0.5 size-4 shrink-0 accent-black"
                      />
                      <span className="min-w-0">
                        <span className="block text-[0.875rem] font-semibold text-dash-ink">
                          {output.label}
                        </span>
                        <span className="block text-[0.75rem] leading-snug text-dash-muted">
                          {output.why}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <button
                type="button"
                onClick={build}
                disabled={pending || !headline.trim() || chosen.size === 0}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-dash-sm border-2 border-red-600 bg-red-600 px-5 text-[0.75rem] font-bold tracking-[0.08em] text-white uppercase transition-colors hover:bg-red-700 disabled:opacity-40"
              >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} strokeWidth={2.5} />}
                Draft {chosen.size} output{chosen.size === 1 ? "" : "s"}
              </button>
              <p className="mt-2 text-[0.75rem] text-dash-muted">
                Goes to an editor, not to air. The next press is somebody else&rsquo;s.
              </p>
              <Said said={said} />
            </>
          )}
        </Card>

        <div className="space-y-4">
          {/* ── THE STEPS, STATED ─────────────────────────────────────────
              Not decoration. On a desk where several people are working at
              once, the value of a written workflow is that everybody can see
              which step a thing is stuck at without asking. */}
          <Card title="How a story gets out">
            <ol className="space-y-2.5">
              {STEPS.map((step, index) => (
                <li key={step.id} className="flex gap-3">
                  <span className="figure mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-dash-ink text-[0.6875rem] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] font-semibold text-dash-ink">{step.label}</span>
                    <span className="block text-[0.8125rem] leading-snug text-dash-muted">{step.why}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>

          {/* ── THE FEED THIS DESK IS ALLOWED TO SEE ────────────────────
              Kind, severity and place. Not the narrative: that is sealed, and
              a broadcast account is deliberately not given the key. What is
              here is enough to decide whether to send somebody, which is the
              decision this desk actually makes. */}
          <Card title="Just in from the field" subtitle="Reports. Not findings.">
            {incidents.length === 0 ? (
              <Empty>Nothing has been reported.</Empty>
            ) : (
              <ul className="space-y-2.5">
                {incidents.slice(0, 8).map((row) => (
                  <li key={row.id} className="border-l-2 border-dash-line pl-3">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          row.severity === "CRITICAL" ? "alert" : row.severity === "URGENT" ? "warn" : "neutral"
                        }
                      >
                        {String(row.kind ?? "report").replace(/_/g, " ").toLowerCase()}
                      </Badge>
                      <span className="text-[0.75rem] text-dash-muted">{clock(row.createdAt)}</span>
                    </p>
                    <p className="mt-1 text-[0.8125rem] leading-snug text-dash-ink">
                      {describeUnit(row.unitCode)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 flex items-start gap-2 border-t border-dash-line pt-3 text-[0.75rem] leading-relaxed text-dash-muted">
              <AlertTriangle size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              The written report itself is sealed and stays with the room running the count. A
              broadcast desk is told that a report exists and where, which is what it needs to
              send somebody, and not what somebody said.
            </p>
          </Card>
        </div>
      </div>

      <Card title="Breaking output" subtitle="Every strap and full frame this desk has made tonight">
        <Queue
          items={straps}
          empty="Nothing has been broken tonight."
        />
      </Card>
    </div>
  );
}
