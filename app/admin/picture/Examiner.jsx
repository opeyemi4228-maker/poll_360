"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import { FileSearch, Loader2 } from "lucide-react";

import PictureReport, { fromAnalysis } from "@/components/dash/PictureReport";

import { examinePicture } from "./actions";

/* The camera's note is at the start of a file and a document's record at its
   end. These are the two pieces sent; see ./actions.js. */
const HEAD = 1_500_000;
const TAIL = 200_000;

async function fingerprintOf(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function Examiner() {
  const [state, examine, pending] = useActionState(examinePicture, null);
  const [preview, setPreview] = useState(null);
  const [refused, setRefused] = useState(null);
  const input = useRef(null);

  async function take(file) {
    if (!file) return;
    setRefused(null);
    if (file.size > 60_000_000) {
      setRefused("That file is larger than 60 MB. A result sheet is never that large.");
      return;
    }

    const part =
      file.size <= HEAD + TAIL ? file : new Blob([file.slice(0, HEAD), file.slice(file.size - TAIL)], { type: file.type });

    const form = new FormData();
    form.set("part", part, "part");
    form.set("name", file.name);
    form.set("size", String(file.size));
    form.set("fingerprint", await fingerprintOf(file).catch(() => ""));

    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    });
    startTransition(() => examine(form));
  }

  return (
    <div className="grid gap-6">
      <label
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          take(event.dataTransfer.files?.[0]);
        }}
        className="flex cursor-pointer flex-col items-center gap-3 rounded-dash border-2 border-dashed border-dash-line bg-dash-card px-6 py-10 text-center hover:border-dash-ink"
      >
        {pending ? <Loader2 size={28} className="animate-spin text-dash-muted" /> : <FileSearch size={28} className="text-dash-muted" />}
        <span className="font-display text-[1rem] font-extrabold text-dash-ink">
          {pending ? "Examining…" : "Choose a picture or a document, or drop one here"}
        </span>
        <span className="max-w-prose text-[0.8125rem] text-dash-muted">
          A photograph (.jpeg, .png) or a scanned document (.pdf). It is examined and not kept.
        </span>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          className="sr-only"
          onChange={(event) => take(event.target.files?.[0])}
        />
      </label>

      {(refused || state?.error) && (
        <p className="rounded-dash-sm border border-red-300 bg-red-50 px-4 py-3 text-[0.875rem] font-semibold text-red-900">
          {refused ?? state.error}
        </p>
      )}

      {state?.found && !pending && (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,5fr)]">
          {preview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="The picture being examined" className="w-full rounded-dash border border-dash-line" />
          )}
          <div className={preview ? "" : "xl:col-span-2"}>
            <PictureReport
              report={fromAnalysis(state.found, {
                where: state.where,
                map: state.map,
                name: state.name,
                size: state.size,
                fingerprint: state.fingerprint,
              })}
            />
            {state.found.inside?.length > 1 && (
              <p className="mt-3 text-[0.8125rem] text-dash-muted">
                This document holds {state.found.inside.length} photographs. The details above are from the first one
                that carries any.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
