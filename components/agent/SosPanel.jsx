"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Crosshair, Loader2, Siren, TriangleAlert } from "lucide-react";

import useGeolocation from "./day/useGeolocation";
import { reportSituation } from "@/app/agent/day-actions";
import { cn } from "@/lib/utils";

/**
 * The SOS.
 *
 * ── ONE PRESS, AND THE LOCATION IS OPTIONAL ────────────────────────────────
 * Finding a location can take two minutes on a weak signal, and somebody in
 * danger may not have two minutes or may have had to leave. So the SOS sends
 * without one; "Add my location" sits beside it for anybody who can wait the
 * few seconds it takes, because it is what lets help find them.
 */
export default function SosPanel() {
  const geo = useGeolocation();
  const [state, formAction] = useActionState(reportSituation, {});
  const position = geo.position;

  return (
    <section id="sos" className="scroll-mt-4 rounded-dash border-2 border-red-600 bg-red-50 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-fluid-lg font-bold text-red-800">
        <Siren size={20} strokeWidth={2.5} aria-hidden="true" />
        In danger right now?
      </h2>
      <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-800">
        An SOS alerts your coordinator and the situation room straight away. Get to safety first if you need
        to, then press it.
      </p>

      <form action={formAction} className="mt-4">
        <input type="hidden" name="sos" value="1" />
        {position && (
          <>
            <input type="hidden" name="latitude" value={position.latitude} />
            <input type="hidden" name="longitude" value={position.longitude} />
            <input type="hidden" name="accuracy" value={position.accuracy ?? ""} />
          </>
        )}

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={geo.read}
            disabled={geo.status === "reading"}
            className={cn(
              "flex h-12 items-center justify-center gap-2 rounded-dash-sm border-2 bg-white px-4 text-[0.9375rem] font-bold transition-colors disabled:opacity-60 sm:flex-1",
              position ? "border-emerald-600 text-emerald-800" : "border-red-300 text-red-900 hover:border-red-600"
            )}
          >
            {geo.status === "reading" ? (
              <Loader2 size={17} strokeWidth={2.75} className="animate-spin" aria-hidden="true" />
            ) : position ? (
              <Check size={17} strokeWidth={3} aria-hidden="true" />
            ) : (
              <Crosshair size={17} strokeWidth={2.5} aria-hidden="true" />
            )}
            {geo.status === "reading" ? "Finding you" : position ? "Location added" : "Add my location"}
          </button>
          <SosButton />
        </div>

        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-700" aria-live="polite">
          {position
            ? position.accuracy != null
              ? `Your location, accurate to about ${Math.round(position.accuracy)} m, goes with the SOS.`
              : "Your location goes with the SOS."
            : "Your location helps people reach you. You can send the SOS without it."}
        </p>
      </form>

      {geo.error && (
        <p role="alert" className="mt-3 flex gap-2 text-[0.875rem] leading-relaxed text-red-700">
          <TriangleAlert size={16} strokeWidth={2.5} className="mt-0.5 shrink-0" aria-hidden="true" />
          {geo.error}
        </p>
      )}

      {state?.error && (
        <p role="alert" key={state.sentAt} className="mt-4 flex gap-2.5 rounded-dash-sm border-l-2 border-red-600 bg-white px-4 py-3.5 text-[0.875rem] leading-relaxed text-ink-800">
          <TriangleAlert size={17} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" aria-hidden="true" />
          {state.error}
        </p>
      )}

      {state?.ok && (
        <div role="status" key={state.sentAt} className="mt-4 rounded-dash-sm border-l-2 border-emerald-600 bg-white px-4 py-3.5">
          <p className="flex items-center gap-2 text-[0.9375rem] font-bold text-ink-950">
            <Check size={16} strokeWidth={3} className="text-emerald-700" aria-hidden="true" />
            SOS sent
          </p>
          <p className="mt-1 text-[0.875rem] leading-relaxed text-ink-800">
            Your coordinator and the situation room have been alerted. If you can, call your coordinator as
            well.
          </p>
        </div>
      )}
    </section>
  );
}

function SosButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 items-center justify-center gap-2 rounded-dash-sm bg-red-600 px-5 text-[1rem] font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-60 sm:flex-1"
    >
      {pending ? (
        <Loader2 size={18} strokeWidth={3} className="animate-spin" aria-hidden="true" />
      ) : (
        <Siren size={18} strokeWidth={2.75} aria-hidden="true" />
      )}
      {pending ? "Sending the SOS" : "Send an SOS"}
    </button>
  );
}
