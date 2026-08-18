"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Crosshair, Loader2, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { fileResult } from "@/app/field/actions";
import { validateReturn } from "@/lib/results";
import { parties } from "@/lib/election2023";
import { formatNumber } from "@/lib/utils";

/**
 * The form the whole product depends on.
 *
 * Designed for the conditions it will actually be used in: standing up, one
 * hand free, at night, on a connection that may not hold.
 *
 *   · The booth is printed, never chosen. It is not a field in this form.
 *   · Numeric keypads on every input, and targets big enough to hit in a hurry.
 *   · The arithmetic is checked as they type, so a mistyped figure is caught
 *     while the sheet is still in their hand rather than after a round trip.
 *   · The draft is kept in the browser on every keystroke, so a dropped
 *     connection costs a retry and not the figures.
 */
const DRAFT = "poll360:draft";

export default function FileResultForm({ unitCode, existing }) {
  const [state, formAction] = useActionState(fileResult, {});
  const [figures, setFigures] = useState(() => ({
    registered: existing?.registered ?? "",
    accredited: existing?.accredited ?? "",
    rejected: existing?.rejected ?? "",
    ...Object.fromEntries(parties.map((p) => [p.id, existing?.votes?.[p.id] ?? ""])),
  }));
  const [position, setPosition] = useState({ status: "asking" });

  /* Restore a draft left by a submission that never made it. Scheduled on the
     next frame rather than set in the effect body, so it lands as one
     asynchronous update instead of a synchronous cascading re-render. */
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const saved = localStorage.getItem(`${DRAFT}:${unitCode}`);
        if (saved) setFigures((current) => ({ ...current, ...JSON.parse(saved) }));
      } catch {
        /* A corrupt draft is not worth failing over; the form still works. */
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [unitCode]);

  useEffect(() => {
    try {
      localStorage.setItem(`${DRAFT}:${unitCode}`, JSON.stringify(figures));
    } catch {
      /* Private mode, or a full quota. The form still works. */
    }
  }, [figures, unitCode]);

  useEffect(() => {
    if (state?.ok) localStorage.removeItem(`${DRAFT}:${unitCode}`);
  }, [state, unitCode]);

  /* Position is read once, on open, and recorded as corroboration. It never
     decides which booth this is, and refusing it never blocks the filing. */
  useEffect(() => {
    if (!navigator.geolocation) {
      const frame = requestAnimationFrame(() => setPosition({ status: "unavailable" }));
      return () => cancelAnimationFrame(frame);
    }
    navigator.geolocation.getCurrentPosition(
      (fix) =>
        setPosition({
          status: "fixed",
          lat: fix.coords.latitude,
          lon: fix.coords.longitude,
          accuracy: Math.round(fix.coords.accuracy),
        }),
      () => setPosition({ status: "refused" }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  const numbers = useMemo(() => {
    const toNumber = (v) => (v === "" ? 0 : Number(String(v).replace(/[^\d]/g, "")));
    return {
      registered: toNumber(figures.registered),
      accredited: toNumber(figures.accredited),
      rejected: toNumber(figures.rejected),
      votes: Object.fromEntries(parties.map((p) => [p.id, toNumber(figures[p.id])])),
    };
  }, [figures]);

  const live = validateReturn(numbers);
  const touched = figures.registered !== "" || figures.accredited !== "";
  const errors = state?.errors ?? {};

  if (state?.ok) {
    return (
      <div className="border-2 border-emerald-300 bg-emerald-50 p-6">
        <Check size={26} strokeWidth={2.5} className="text-emerald-600" />
        <h3 className="mt-4 text-fluid-xl text-dash-ink">
          {state.amended ? "Result amended" : "Result filed"}
        </h3>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-dash-muted">
          {formatNumber(state.cast)} votes recorded for {unitCode}. It is on the board now and in
          the queue for a coordinator to check against your sheet.
          {state.amended && " Because you changed it, it goes back to unchecked."}
        </p>
        <Button
          variant="dashOutline"
          size="md"
          className="mt-5"
          onClick={() => window.location.reload()}
        >
          File a correction
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* ------------------------------------------------------ position */}
      <div className="flex items-start gap-3 border border-dash-line bg-dash-bg px-4 py-3">
        <Crosshair
          size={16}
          strokeWidth={2.5}
          className={position.status === "fixed" ? "mt-0.5 text-emerald-600" : "mt-0.5 text-dash-muted"}
        />
        <div className="min-w-0 text-[0.8125rem]">
          <p className="font-semibold text-dash-ink">
            {position.status === "fixed" && "Position recorded with this return"}
            {position.status === "asking" && "Reading your position…"}
            {position.status === "refused" && "Position not shared"}
            {position.status === "unavailable" && "This device cannot report a position"}
          </p>
          <p className="figure mt-1 text-dash-muted">
            {position.status === "fixed"
              ? `±${position.accuracy}m · stored beside the figures, never used to pick your booth`
              : "You can still file. It is recorded as not shared."}
          </p>
        </div>
      </div>

      {position.status === "fixed" && (
        <>
          <input type="hidden" name="lat" value={position.lat} />
          <input type="hidden" name="lon" value={position.lon} />
          <input type="hidden" name="accuracy" value={position.accuracy} />
        </>
      )}

      {/* ------------------------------------------------------- figures */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Number
          name="registered"
          label="Registered"
          value={figures.registered}
          onChange={(v) => setFigures((f) => ({ ...f, registered: v }))}
        />
        <Number
          name="accredited"
          label="Accredited"
          value={figures.accredited}
          onChange={(v) => setFigures((f) => ({ ...f, accredited: v }))}
          error={live.errors.accredited}
        />
        <Number
          name="rejected"
          label="Rejected"
          value={figures.rejected}
          onChange={(v) => setFigures((f) => ({ ...f, rejected: v }))}
        />
      </div>

      {/* --------------------------------------------------------- votes */}
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted">Votes by party</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {parties.map((party) => (
            <Number
              key={party.id}
              name={`votes_${party.id}`}
              label={party.id}
              swatch={party.token}
              value={figures[party.id]}
              onChange={(v) => setFigures((f) => ({ ...f, [party.id]: v }))}
            />
          ))}
        </div>
      </div>

      {/* The running total, and the arithmetic, checked as they type. */}
      <div
        className={[
          "border-l-2 px-4 py-3",
          touched && !live.ok ? "border-red-500 bg-red-50" : "border-verified bg-dash-bg",
        ].join(" ")}
      >
        <p className="figure text-[0.9375rem] font-bold text-dash-ink">
          {formatNumber(live.cast)} votes cast
        </p>
        {touched && !live.ok ? (
          <ul className="mt-2 space-y-1">
            {Object.values(live.errors).map((message) => (
              <li key={message} className="flex gap-2 text-[0.8125rem] text-dash-ink">
                <TriangleAlert size={14} className="mt-0.5 shrink-0 text-red-600" />
                {message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[0.8125rem] text-dash-muted">
            Votes plus rejected must not exceed accredited, and accredited must not exceed
            registered.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="note" className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted">
          Anything the checker should know <span className="text-dash-muted">optional</span>
        </label>
        <textarea
          id="note"
          name="note"
          rows={2}
          className="mt-2 w-full resize-y rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 py-2 text-[0.9375rem] text-dash-ink focus:border-dash-ink focus:outline-none"
        />
      </div>

      {(state?.error || errors.figures || errors.votes) && (
        <p className="flex gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-[0.875rem] text-dash-ink">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
          {state.error ?? errors.figures ?? errors.votes}
        </p>
      )}

      <Submit disabled={touched && !live.ok} amending={Boolean(existing)} />

      <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
        Saved on this device as you type. If the connection drops, the figures are still here when
        you come back.
      </p>
    </form>
  );
}

function Submit({ disabled, amending }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="xl" full disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 size={17} strokeWidth={3} className="animate-spin" />
          Sending
        </>
      ) : amending ? (
        "Amend this return"
      ) : (
        "File this return"
      )}
    </Button>
  );
}

function Number({ name, label, value, onChange, error, swatch }) {
  return (
    <div>
      <label htmlFor={name} className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase flex items-center gap-2 text-dash-muted">
        {swatch && (
          <span aria-hidden="true" className="size-2.5 shrink-0" style={{ background: swatch }} />
        )}
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        /* Big, monospaced and tall: this is typed with a thumb, in the dark. */
        className={[
          "figure mt-2 h-16 w-full rounded-dash-sm border-2 bg-dash-card px-4 text-fluid-xl font-bold text-dash-ink",
          "focus:outline-none",
          error ? "border-red-500" : "border-dash-line focus:border-dash-ink",
        ].join(" ")}
      />
    </div>
  );
}
