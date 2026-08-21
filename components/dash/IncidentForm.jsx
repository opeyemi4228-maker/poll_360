"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Check, Loader2, Send, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { reportIncident } from "@/app/field/actions";
import { shrinkImage, putOnInput } from "@/lib/shrink";

/**
 * The other half of what a booth knows.
 *
 * A count is not the only thing worth reporting from a polling unit: a queue
 * still forming at closing, a card reader that will not read, an agent turned
 * away. Numbers alone cannot carry any of that, and by the time it reaches a
 * situation room by phone it has usually lost the unit code.
 *
 * The narrative is encrypted before it is stored. It names people.
 */
const KINDS = [
  "Queue still forming at close",
  "Card reader failure",
  "Materials arrived late",
  "Agent obstructed",
  "Violence or intimidation",
  "Result sheet disputed",
  "Something else",
];

const SEVERITIES = [
  ["INFO", "For the record"],
  ["SERIOUS", "Needs attention"],
  ["CRITICAL", "Needs it now"],
];

export default function IncidentForm() {
  const [state, formAction] = useActionState(reportIncident, {});
  const [preview, setPreview] = useState(null);
  const [shrinking, setShrinking] = useState(false);
  const fileRef = useRef(null);

  /**
   * Shrink the photograph on the phone, before it is sent.
   *
   * The pipeline itself moved to lib/shrink.js when the result-sheet form
   * needed the same thing. It was written twice before it was written once,
   * and two copies of an image pipeline drift — the way you find that out is
   * one of the two forms quietly sending eight-megabyte originals for a month.
   */
  async function shrink(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;

    setShrinking(true);
    try {
      const shrunk = await shrinkImage(chosen);
      if (shrunk) {
        putOnInput(fileRef.current, shrunk.file);
        setPreview({ url: shrunk.url, kb: shrunk.kb });
      }
    } finally {
      setShrinking(false);
    }
  }

  if (state?.ok) {
    return (
      <p className="flex items-center gap-2 text-[0.9375rem] text-dash-ink">
        <Check size={17} strokeWidth={3} className="text-emerald-600" />
        Reported. It is in the situation room feed now.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="kind" className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted">
          What happened
        </label>
        <select
          id="kind"
          name="kind"
          className="mt-2 h-12 w-full rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 text-[0.9375rem] text-dash-ink focus:border-dash-ink focus:outline-none"
        >
          {KINDS.map((kind) => (
            <option key={kind} value={kind} className="bg-dash-card">
              {kind}
            </option>
          ))}
        </select>
      </div>

      <fieldset>
        <legend className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted">How serious</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {SEVERITIES.map(([value, label], index) => (
            <label
              key={value}
              className="cursor-pointer border-2 border-dash-line px-3.5 py-2.5 text-[0.875rem] text-dash-muted transition-colors has-checked:border-dash-ink has-checked:bg-dash-ink has-checked:text-white"
            >
              <input
                type="radio"
                name="severity"
                value={value}
                defaultChecked={index === 0}
                className="sr-only"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="detail" className="text-[0.6875rem] font-semibold tracking-[0.1em] uppercase block text-dash-muted">
          In your own words
        </label>
        <textarea
          id="detail"
          name="detail"
          rows={3}
          className="mt-2 w-full resize-y rounded-dash-sm border-2 border-dash-line bg-dash-card px-3 py-2 text-[0.9375rem] text-dash-ink focus:border-dash-ink focus:outline-none"
          placeholder="What you saw, and when."
        />
        <p className="mt-2 text-[0.75rem] text-dash-muted">
          Encrypted before it is stored. Only the situation room and the administrator can read it.
        </p>
      </div>

      {/* --------------------------------------------------------- photo */}
      <div>
        <label
          htmlFor="photo"
          className="block text-[0.6875rem] font-semibold tracking-[0.1em] uppercase text-dash-muted"
        >
          Photograph <span className="text-dash-muted">optional</span>
        </label>

        {preview ? (
          <div className="mt-2 flex items-center gap-3 rounded-dash-sm border-2 border-dash-line p-2">
            {/* eslint-disable-next-line @next/next/no-img-element --
                A blob: URL from the camera. next/image cannot optimise one and
                would only add a proxy hop for bytes that never leave the page. */}
            <img
              src={preview.url}
              alt="The photograph you attached"
              className="size-16 shrink-0 rounded-dash-sm object-cover"
            />
            <p className="figure flex-1 text-[0.8125rem] text-dash-muted">
              Ready to send · {preview.kb}KB
            </p>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                fileRef.current.value = "";
              }}
              aria-label="Remove the photograph"
              className="inline-flex size-9 items-center justify-center rounded-dash-sm border-2 border-dash-line text-dash-ink hover:border-dash-ink"
            >
              <X size={15} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <label
            htmlFor="photo"
            className="mt-2 flex h-14 cursor-pointer items-center justify-center gap-2 rounded-dash-sm border-2 border-dashed border-dash-line text-[0.875rem] font-semibold text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
          >
            <Camera size={17} strokeWidth={2.25} />
            {shrinking ? "Preparing…" : "Take or choose a photo"}
          </label>
        )}

        <input
          ref={fileRef}
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png"
          capture="environment"
          onChange={shrink}
          className="sr-only"
        />
        <p className="mt-2 text-[0.75rem] text-dash-muted">
          Shrunk on your phone before it is sent, so it goes through on a weak signal. Only the
          situation room and the administrator can open it.
        </p>
      </div>

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dashOutline" size="lg" full disabled={pending}>
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Sending
        </>
      ) : (
        <>
          <Send size={15} strokeWidth={2.75} />
          Report it
        </>
      )}
    </Button>
  );
}
