import { Check, Minus, Plus, Siren } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The agent's day as Agent360 recorded it, and why the latest entry scored
 * what it did.
 *
 * ── SHOWN TO THE AGENT, IN WORDS ───────────────────────────────────────────
 * This is what the system will say about them if their unit is ever
 * questioned, so they are entitled to read it — and they are the only person
 * who can notice when it is wrong. No channels, fences or buckets: a time,
 * what they sent, how sure the record is, and how far they were from the unit.
 */

const clock = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Lagos",
});

export const timeOf = (value) => (value ? clock.format(new Date(value)) : "");

export const distance = (metres) =>
  metres == null ? null : metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(1)} km`;

export function DayTimeline({ events = [] }) {
  if (!events.length) {
    return (
      <p className="rounded-dash-sm bg-ink-100 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-content-muted">
        Nothing sent yet today. When you arrive, find your location and press &ldquo;I have
        arrived&rdquo;.
      </p>
    );
  }

  return (
    <ol className="relative space-y-5">
      <span aria-hidden="true" className="absolute top-2 bottom-2 left-[0.6875rem] w-px bg-ink-200" />
      {events.map((event) => (
        <li key={event.id} className="relative pl-9">
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-0.5 left-0 flex size-[1.4rem] items-center justify-center rounded-full border-2 bg-white",
              event.alarm ? "border-red-600 text-red-600" : "border-ink-950 text-ink-950"
            )}
          >
            {event.alarm ? <Siren size={11} strokeWidth={3} /> : <Check size={11} strokeWidth={3.5} />}
          </span>

          <p className="flex flex-wrap items-baseline gap-x-3">
            <span className="figure text-[0.875rem] font-bold text-ink-950">{timeOf(event.at)}</span>
            <span className="text-[0.9375rem] font-bold text-ink-950">{event.label}</span>
          </p>

          <p className="mt-1 text-[0.8125rem] leading-relaxed text-content-muted">
            <Level level={event.level} score={event.score} />
            {event.distanceM != null && (
              <>
                {" · "}
                {distance(event.distanceM)} from your unit
                {event.insideArea === true && ", inside its area"}
                {event.insideArea === false && ", outside its area"}
              </>
            )}
            {event.viaWhatsApp && " · sent on WhatsApp"}
            {event.confirmedInPerson && " · confirmed in person by your coordinator"}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Level({ level, score }) {
  return (
    <span className="font-bold text-ink-800">
      {level}
      {score != null && <span className="figure font-semibold text-content-subtle"> {score}</span>}
    </span>
  );
}

export function ScoreExplained({ latest }) {
  if (!latest?.factors?.length) return null;

  return (
    <div>
      <div className="flex items-end justify-between gap-4 border-b border-ink-200 pb-4">
        <div>
          <p className="tag text-content-subtle">Your latest entry</p>
          <p className="figure mt-1.5 text-[2.5rem] leading-none font-bold tracking-[-0.03em] text-ink-950">
            {latest.score}
            <span className="text-[1.125rem] font-semibold text-content-subtle">/{latest.outOf}</span>
          </p>
          <p className="mt-1.5 text-[0.875rem] font-bold text-ink-800">{latest.level}</p>
        </div>
        <p className="max-w-[16rem] text-right text-[0.8125rem] leading-relaxed text-content-muted">
          {latest.viaWhatsApp
            ? "Sent on WhatsApp, which cannot say how accurate a location is, so it can never score as high as this page."
            : "Sent from this page with your phone’s location, so it can reach the top score."}
        </p>
      </div>

      <ul className="mt-3 divide-y divide-ink-100">
        {latest.factors.map((factor, index) => (
          <li key={`${factor.label}-${index}`} className="flex items-start gap-3 py-2.5 text-[0.875rem] leading-relaxed">
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px]",
                factor.value < 0 ? "bg-red-50 text-red-700" : "bg-ink-100 text-ink-950"
              )}
            >
              {factor.value < 0 ? <Minus size={12} strokeWidth={3.5} /> : <Plus size={12} strokeWidth={3.5} />}
            </span>
            <span className="min-w-0 flex-1 text-ink-800">{factor.label}</span>
            <span className={cn("figure shrink-0 font-bold", factor.value < 0 ? "text-red-600" : "text-ink-950")}>
              {factor.value > 0 ? `+${factor.value}` : factor.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EvidenceList({ record = [] }) {
  if (!record.length) {
    return (
      <p className="rounded-dash-sm bg-ink-100 px-4 py-3.5 text-[0.875rem] leading-relaxed text-content-muted">
        Nothing from your unit has been sealed yet. What you send is sealed as it arrives, and added
        to this list within the hour.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y divide-ink-100">
        {record.map((link) => (
          <li key={link.seq} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5 text-[0.8125rem]">
            <span className="figure font-bold text-ink-950">#{link.seq}</span>
            <span className="text-content-muted">{link.type}</span>
            <span className="figure text-[0.75rem] text-content-subtle">{link.hash}</span>
            <span className="figure w-full text-[0.75rem] text-content-subtle">{timeOf(link.at)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 border-t border-ink-200 pt-4 text-[0.8125rem] leading-relaxed text-content-muted">
        Each entry is sealed when it arrives, so nobody can change it afterwards, including us. If
        anything here is not what you sent, tell your coordinator today.
      </p>
    </>
  );
}
