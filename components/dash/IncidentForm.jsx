"use client";

import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Check, Loader2, Send, X } from "lucide-react";

import Button from "@/components/ui/Button";
import { reportIncident } from "@/app/field/actions";

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
   * A modern phone camera produces eight to twelve megabytes. Over a rural
   * signal at close of poll that is a submission that does not arrive. Drawing
   * it to a canvas at 1280px and re-encoding as JPEG q80 turns it into two to
   * four hundred kilobytes — indistinguishable on screen, and the difference
   * between a report that lands and one that times out.
   *
   * The shrunk blob replaces the file on the input via DataTransfer, so the
   * form still submits normally and works the same way with the action.
   */
  async function shrink(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setShrinking(true);
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8)
      );

      if (blob) {
        const transfer = new DataTransfer();
        transfer.items.add(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        fileRef.current.files = transfer.files;
        setPreview({ url: URL.createObjectURL(blob), kb: Math.round(blob.size / 1024) });
      }
    } catch {
      /* No canvas, or a format the browser cannot decode. Send the original —
         the server checks the bytes and will refuse anything that is not a
         real photograph. */
      const file = event.target.files?.[0];
      if (file) setPreview({ url: URL.createObjectURL(file), kb: Math.round(file.size / 1024) });
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
