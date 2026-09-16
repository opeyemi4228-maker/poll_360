"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Crosshair, Loader2, Send, TriangleAlert } from "lucide-react";

import useGeolocation from "./useGeolocation";
import { sendDayEvent } from "@/app/agent/day-actions";
import { UPDATE_STEPS } from "@/lib/agent-day";
import { cn } from "@/lib/utils";

/**
 * Updates: telling the room how the polling day is going, step by step.
 *
 * ── TWO TAPS WHERE A LOCATION IS NEEDED: FIND ME, THEN SEND ────────────────
 * Not one button that does both. On a weak signal the location takes up to two
 * minutes, and one button would spend that time looking broken. Split, the
 * agent watches the location arrive, sees whether it is good, and then sends.
 * Only arriving, the result being posted and leaving need it; the steps in
 * between send straight away.
 *
 * ── THE NEXT STEP STANDS OUT ───────────────────────────────────────────────
 * The first step not yet sent is the dark button, so an agent glancing at the
 * screen between voters sees what they owe the room without reading the list.
 *
 * Every step can be sent again. A second "voting has started" is a harmless
 * extra line on the record; a step that refused a resend after a dropped
 * connection would leave a gap nobody could fill.
 */

const clock = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Lagos" });

export default function CheckInPanel({ updates = [], windowOpen = true, windowReason, unitName }) {
  const geo = useGeolocation();
  const [state, formAction] = useActionState(sendDayEvent, {});
  const position = geo.position;

  /* The earliest time each step was sent: updates arrive newest first, so the
     last one seen for a step is when it first happened. */
  const sentAt = {};
  for (const update of updates) sentAt[update.step] = update.at;
  const next = UPDATE_STEPS.find((step) => !sentAt[step.type])?.type ?? null;

  if (!windowOpen) {
    return (
      <p className="rounded-dash-sm bg-ink-100 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-content-muted">
        {windowReason === "not_yet"
          ? "Updates open on election day. Nothing about where you are is recorded before then."
          : "Updates have closed for this election. Your location is no longer being recorded."}
      </p>
    );
  }

  const hidden = position && (
    <>
      <input type="hidden" name="latitude" value={position.latitude} />
      <input type="hidden" name="longitude" value={position.longitude} />
      <input type="hidden" name="accuracy" value={position.accuracy ?? ""} />
    </>
  );

  return (
    <div>
      {/* ── WHERE YOU ARE ─────────────────────────────────────────────── */}
      <div className="rounded-dash border-2 border-ink-950 bg-white p-4">
        <p className="tag text-content-subtle">Where you are</p>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-950" aria-live="polite">
          {geo.status === "reading"
            ? "Finding you. Stay still, outdoors if you can."
            : position
              ? position.accuracy == null
                ? "Found, but your phone did not say how accurate it is."
                : position.accuracy <= 30
                  ? `Found, accurate to about ${Math.round(position.accuracy)} m. That is a good reading.`
                  : position.accuracy <= 100
                    ? `Found, accurate to about ${Math.round(position.accuracy)} m.`
                    : `Found, but only to about ${Math.round(position.accuracy)} m. Step outside, away from walls, and try again.`
              : "Arriving, the result being posted and leaving are sent with your location. Find it when you are at the unit."}
        </p>

        <button
          type="button"
          onClick={geo.read}
          disabled={geo.status === "reading"}
          className={cn(
            "mt-3.5 flex h-12 w-full items-center justify-center gap-2 rounded-dash-sm text-[0.9375rem] font-bold transition-colors disabled:opacity-60",
            position ? "border-2 border-ink-300 text-ink-950 hover:border-ink-950" : "bg-ink-950 text-white hover:bg-ink-800"
          )}
        >
          {geo.status === "reading" ? (
            <Loader2 size={17} strokeWidth={2.75} className="animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair size={17} strokeWidth={2.5} aria-hidden="true" />
          )}
          {geo.status === "reading" ? "Finding you" : position ? "Find me again" : "Find my location"}
        </button>

        {geo.error && (
          <p role="alert" className="mt-3 flex gap-2 text-[0.875rem] leading-relaxed text-red-700">
            <TriangleAlert size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" aria-hidden="true" />
            {geo.error}
          </p>
        )}
      </div>

      {/* ── WHAT CAME BACK ────────────────────────────────────────────── */}
      {state?.error && (
        <p role="alert" key={state.sentAt} className="mt-4 flex gap-2.5 rounded-dash-sm border-l-2 border-red-500 bg-red-50 px-4 py-3.5 text-[0.875rem] leading-relaxed text-ink-800">
          <TriangleAlert size={17} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" aria-hidden="true" />
          {state.error}
        </p>
      )}
      {state?.ok && (
        <div role="status" key={state.sentAt} className="mt-4 rounded-dash-sm border-l-2 border-emerald-600 bg-emerald-50 px-4 py-3.5">
          <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink-950">
            <Check size={16} strokeWidth={3} className="text-emerald-700" aria-hidden="true" />
            Sent: {state.label}
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-800">
            Your coordinator and the situation room can see it.
            {state.level && (
              <>
                {" "}Recorded as <strong>{state.level}</strong>
                {state.distanceM != null
                  ? `, ${Math.round(state.distanceM)} m from ${unitName ?? "your unit"}${
                      state.insideArea === true
                        ? ", inside its area."
                        : state.insideArea === false
                          ? ", outside its area. Your coordinator may be asked to confirm you."
                          : "."
                    }`
                  : "."}
              </>
            )}
          </p>
        </div>
      )}

      {/* ── THE DAY, IN ORDER ─────────────────────────────────────────── */}
      <ol className="mt-5 divide-y divide-ink-200 overflow-hidden rounded-dash border-2 border-ink-200 bg-white">
        {UPDATE_STEPS.map((step) => {
          const done = sentAt[step.type];
          const blocked = step.needsLocation && !position;
          const isNext = step.type === next;
          return (
            <li key={step.type} className={cn(isNext && "bg-ink-50")}>
              <form action={formAction} className="flex items-center gap-3 px-4 py-3.5">
                <input type="hidden" name="eventType" value={step.type} />
                {hidden}
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                    done
                      ? "border-emerald-600 bg-emerald-600 text-white"
                      : isNext
                        ? "border-ink-950 text-transparent"
                        : "border-ink-300 text-transparent"
                  )}
                >
                  <Check size={14} strokeWidth={3.5} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-bold text-ink-950">
                    {step.label}
                    {isNext && (
                      <span className="ml-2 rounded-full bg-ink-950 px-2 py-0.5 align-middle text-[0.6875rem] font-bold tracking-wide text-white uppercase">
                        Next
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] text-content-muted">
                    {done
                      ? `Sent at ${clock.format(new Date(done))}`
                      : blocked
                        ? "Find your location first."
                        : step.hint ?? "Send when it happens."}
                  </p>
                </div>
                <SendButton blocked={blocked} again={Boolean(done)} primary={isNext} />
              </form>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function SendButton({ blocked, again, primary }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={blocked || pending}
      className={cn(
        "flex h-11 shrink-0 items-center gap-1.5 rounded-dash-sm px-4 text-[0.875rem] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        primary ? "bg-ink-950 text-white hover:bg-ink-800" : "border-2 border-ink-300 text-ink-950 hover:border-ink-950"
      )}
    >
      {pending ? <Loader2 size={15} strokeWidth={3} className="animate-spin" aria-hidden="true" /> : <Send size={14} strokeWidth={2.75} aria-hidden="true" />}
      {pending ? "Sending" : again ? "Again" : "Send"}
    </button>
  );
}
