"use client";

import { useRef, useState } from "react";
import { Camera, Check, Loader2 } from "lucide-react";

import { shrinkImage, putOnInput, SNAPSHOT } from "@/lib/shrink";
import Field from "./Field";

/**
 * The agent's own photograph, taken at sign-up.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT IT IS ACTUALLY FOR
 *
 *  Not a profile picture. Agent360's whole question is "was somebody actually
 *  standing there", and the answer to it starts with knowing what the person
 *  who was supposed to be standing there looks like. It reaches Agent360
 *  through Data Bank with the rest of the registration.
 *
 *  It is also what an administrator holds against the appointment list. A name
 *  and a booth code can be typed by anybody; a face is the thing a ward
 *  coordinator recognises or does not.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── SHRUNK IN THE BROWSER, BEFORE IT LEAVES THE PHONE ──────────────────────
 * A modern handset takes an eight-megabyte photograph and this form is filled
 * in on rural signal. The same pipeline the incident form uses cuts it to
 * about 1280px and a couple of hundred kilobytes — see lib/shrink.js, which
 * exists because that logic was written twice before it was written once.
 *
 * ── AND THE CAMERA IS OFFERED, NOT DEMANDED ────────────────────────────────
 * `capture` asks a phone for the front camera and is ignored by every desktop
 * browser, which is exactly the behaviour wanted: an agent signing up on their
 * own phone gets the camera, and a ward coordinator signing up their team from
 * a laptop gets a file picker.
 */
export default function PhotoField({ error }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  async function choose(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;

    setBusy(true);
    try {
      const shrunk = await shrinkImage(chosen, SNAPSHOT);
      if (shrunk) {
        putOnInput(fileRef.current, shrunk.file);
        setPreview({ url: shrunk.url, kb: shrunk.kb });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field label="Your photograph" error={error} name="photo">
      {(id) => (
        <div className="mt-2">
          <div className="flex items-center gap-4">
            {/* The picture, or the space it will occupy. A box that appears
                only after a photograph is chosen makes the form jump under
                somebody's thumb at the moment they are looking at it. */}
            <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-dash-sm border-2 border-ink-300 bg-ink-50">
              {preview ? (
                /* eslint-disable-next-line @next/next/no-img-element --
                   A blob: URL made in this browser a moment ago. next/image
                   optimises files it can fetch, and there is nothing here to
                   fetch — it exists only in this tab's memory. */
                <img src={preview.url} alt="" className="size-full object-cover" />
              ) : busy ? (
                <Loader2 size={20} className="animate-spin text-content-subtle" aria-hidden="true" />
              ) : (
                <Camera size={20} strokeWidth={2} className="text-content-subtle" aria-hidden="true" />
              )}
            </span>

            <div className="min-w-0">
              <label
                htmlFor={id}
                className="inline-flex cursor-pointer items-center gap-2 rounded-dash-sm border-2 border-ink-300 px-4 py-2.5 text-[0.9375rem] font-bold text-ink-950 hover:border-ink-950"
              >
                <Camera size={16} strokeWidth={2.5} aria-hidden="true" />
                {preview ? "Take another" : "Take a photograph"}
              </label>

              <p className="mt-2 text-[0.8125rem] leading-relaxed text-content-muted">
                {preview ? (
                  <span className="inline-flex items-center gap-1.5 text-ink-950">
                    <Check size={14} strokeWidth={3} className="text-emerald-600" aria-hidden="true" />
                    Ready to send · {preview.kb}KB
                  </span>
                ) : (
                  "Your face, clearly, in daylight. Your coordinator checks it against the appointment list."
                )}
              </p>
            </div>
          </div>

          {/* ── TWO INPUTS, AND ONLY ONE OF THEM IS SUBMITTED ────────────────
              The visible one takes the original and hands it to the shrinker.
              The hidden one holds the shrunk file under the name the server
              reads. Without the split, a form submitted before the shrink
              finished would send the original — which on a rural signal is the
              difference between a sign-up that completes and one that times
              out halfway. */}
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png"
            capture="user"
            onChange={choose}
            className="sr-only"
          />
          <input ref={fileRef} type="file" name="photo" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" />
        </div>
      )}
    </Field>
  );
}
