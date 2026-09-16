"use client";

import { useActionState, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Camera, Check, Loader2, Send, TriangleAlert, X } from "lucide-react";

import { reportSituation } from "@/app/agent/day-actions";
import { SITUATION_GROUPS, URGENCY, situationKind } from "@/lib/agent-day";
import { putOnInput, shrinkImage, SNAPSHOT } from "@/lib/shrink";
import { cn } from "@/lib/utils";

/**
 * Reporting a situation: what, how urgent, what was seen, and a photograph.
 *
 * ── CHOICES AS BUTTONS, NOT A DROPDOWN ─────────────────────────────────────
 * A dropdown shows one option and hides the rest behind a tap. Somebody
 * watching a fight break out needs to see "Violence or intimidation" and
 * press it, so every kind is on screen, grouped as Security, Voting and
 * Materials, and pressing one fills in how urgent it usually is.
 *
 * ── ONE STEP AT A TIME ─────────────────────────────────────────────────────
 * How urgent, what happened and the photograph appear once a kind is chosen.
 * The first screen is one question, and the button to send is never on the
 * screen before there is something to send.
 */
export default function SituationForm() {
  const [state, formAction] = useActionState(reportSituation, {});
  /* The confirmation stays until the agent asks for a fresh form, so a report
     cannot be sent twice by somebody unsure the first one went. */
  const [dismissed, setDismissed] = useState(null);

  if (state?.ok && state.sentAt !== dismissed) {
    return (
      <div role="status" className="rounded-dash border-2 border-emerald-600 bg-emerald-50 p-5">
        <p className="flex items-center gap-2 text-fluid-lg font-bold text-ink-950">
          <Check size={20} strokeWidth={3} className="text-emerald-700" aria-hidden="true" />
          Report sent
        </p>
        <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-800">
          <strong>{state.kind}</strong> — the situation room can see it now
          {state.severity === "CRITICAL" ? " and has been alerted" : ""}. It is listed below.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(state.sentAt)}
          className="mt-4 h-12 rounded-dash-sm border-2 border-ink-300 bg-white px-5 text-[0.9375rem] font-bold text-ink-950 transition-colors hover:border-ink-950"
        >
          Report something else
        </button>
      </div>
    );
  }

  return <Form key={dismissed ?? "first"} formAction={formAction} state={state} />;
}

function Form({ formAction, state }) {
  const [kindId, setKindId] = useState("");
  const [severity, setSeverity] = useState("");
  const [detail, setDetail] = useState("");
  const errors = state?.errors ?? {};
  const kind = situationKind(kindId);

  function choose(id) {
    setKindId(id);
    setSeverity(situationKind(id)?.urgency ?? "");
  }

  return (
    <form action={formAction} className="space-y-8">
      <fieldset>
        <legend className="flex items-center gap-2.5 text-[1.0625rem] font-bold text-ink-950">
          <Step n={1} done={Boolean(kind)} />
          What is happening?
        </legend>
        {errors.kind && <Problem>{errors.kind}</Problem>}

        <div className="mt-4 space-y-5">
          {SITUATION_GROUPS.map((group) => (
            <div key={group.id}>
              <p className="tag text-content-subtle">{group.label}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {group.kinds.map((option) => (
                  <Choice
                    key={option.id}
                    name="kind"
                    value={option.id}
                    checked={kindId === option.id}
                    onChange={() => choose(option.id)}
                  >
                    {option.label}
                  </Choice>
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {kind && (
        <>
          <fieldset>
            <legend className="flex items-center gap-2.5 text-[1.0625rem] font-bold text-ink-950">
              <Step n={2} done={Boolean(severity)} />
              How urgent is it?
            </legend>
            {errors.severity && <Problem>{errors.severity}</Problem>}

            <div className="mt-4 grid gap-2">
              {URGENCY.map((level) => (
                <Choice
                  key={level.id}
                  name="severity"
                  value={level.id}
                  checked={severity === level.id}
                  onChange={() => setSeverity(level.id)}
                  danger={level.id === "CRITICAL"}
                  hint={level.hint}
                >
                  {level.label}
                </Choice>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="situation-detail" className="flex items-center gap-2.5 text-[1.0625rem] font-bold text-ink-950">
              <Step n={3} done={detail.trim().length > 0} />
              What did you see?
              <span className="text-[0.8125rem] font-semibold text-content-subtle">Optional</span>
            </label>
            <textarea
              id="situation-detail"
              name="detail"
              rows={4}
              maxLength={1500}
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="Who was involved, what happened, and where exactly."
              className="mt-3 w-full rounded-dash-sm border-2 border-ink-300 bg-white px-4 py-3 text-[1rem] leading-relaxed text-ink-950 placeholder:text-ink-400 focus:border-ink-950 focus:outline-none"
            />
            <p className="mt-1.5 text-[0.8125rem] text-content-muted">
              Kept private. Only the situation room can read it.
            </p>
          </div>

          <PhotoPicker key={state?.sentAt ?? 0} />

          {state?.error && (
            <p role="alert" className="flex gap-2.5 rounded-dash-sm border-l-2 border-red-500 bg-red-50 px-4 py-3.5 text-[0.875rem] leading-relaxed text-red-900">
              <TriangleAlert size={17} strokeWidth={2.5} className="mt-px shrink-0" aria-hidden="true" />
              {state.error}
            </p>
          )}

          <SendButton urgent={severity === "CRITICAL"} ready={Boolean(kind && severity)} />
        </>
      )}
    </form>
  );
}

function Choice({ name, value, checked, onChange, danger = false, hint, children }) {
  return (
    <label
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-dash-sm border-2 px-3.5 py-2.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ink-950 has-focus-visible:ring-offset-2",
        checked
          ? danger
            ? "border-red-600 bg-red-600 text-white"
            : "border-ink-950 bg-ink-950 text-white"
          : "border-ink-200 bg-white text-ink-950 hover:border-ink-400"
      )}
    >
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-white bg-white" : "border-ink-300"
        )}
      >
        {checked && <Check size={12} strokeWidth={3.5} className={danger ? "text-red-600" : "text-ink-950"} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.9375rem] font-bold leading-snug">{children}</span>
        {hint && (
          <span className={cn("mt-0.5 block text-[0.8125rem] leading-snug", checked ? "text-white/85" : "text-content-muted")}>
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function Step({ n, done }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "figure flex size-7 shrink-0 items-center justify-center rounded-full text-[0.8125rem] font-bold",
        done ? "bg-emerald-600 text-white" : "bg-ink-950 text-white"
      )}
    >
      {done ? <Check size={14} strokeWidth={3.5} /> : n}
    </span>
  );
}

function Problem({ children }) {
  return (
    <p role="alert" className="mt-2 flex gap-2 text-[0.875rem] text-red-700">
      <TriangleAlert size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" aria-hidden="true" />
      {children}
    </p>
  );
}

/**
 * A photograph, shrunk on the phone before it is sent. Same split as the
 * sign-up photo: the visible input takes the original, the hidden one holds
 * the small copy under the name the server reads.
 */
function PhotoPicker() {
  const id = useId();
  const hiddenRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  async function choose(event) {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    setBusy(true);
    try {
      const shrunk = await shrinkImage(chosen, SNAPSHOT);
      if (shrunk) {
        putOnInput(hiddenRef.current, shrunk.file);
        setPreview({ url: shrunk.url, kb: shrunk.kb });
      }
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  function clear() {
    if (hiddenRef.current) hiddenRef.current.value = "";
    setPreview(null);
  }

  return (
    <div>
      <p className="flex items-center gap-2.5 text-[1.0625rem] font-bold text-ink-950">
        <Step n={4} done={Boolean(preview)} />
        Add a photo
        <span className="text-[0.8125rem] font-semibold text-content-subtle">Optional</span>
      </p>

      <div className="mt-3 flex items-center gap-4">
        <span className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-dash-sm border-2 border-ink-300 bg-ink-50">
          {preview ? (
            /* eslint-disable-next-line @next/next/no-img-element --
               A blob: URL made in this tab; there is nothing for next/image to fetch. */
            <img src={preview.url} alt="" className="size-full object-cover" />
          ) : busy ? (
            <Loader2 size={20} className="animate-spin text-content-subtle" aria-hidden="true" />
          ) : (
            <Camera size={20} strokeWidth={2} className="text-content-subtle" aria-hidden="true" />
          )}
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <label
              htmlFor={id}
              className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-dash-sm border-2 border-ink-300 bg-white px-4 text-[0.9375rem] font-bold text-ink-950 hover:border-ink-950"
            >
              <Camera size={16} strokeWidth={2.5} aria-hidden="true" />
              {preview ? "Take another" : "Take a photo"}
            </label>
            {preview && (
              <button
                type="button"
                onClick={clear}
                className="inline-flex h-11 items-center gap-1.5 rounded-dash-sm px-3 text-[0.875rem] font-bold text-content-muted hover:text-ink-950"
              >
                <X size={15} strokeWidth={2.75} aria-hidden="true" />
                Remove
              </button>
            )}
          </div>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-content-muted">
            {preview ? `Ready to send · ${preview.kb}KB` : "Only if it is safe to take one."}
          </p>
        </div>
      </div>

      <input id={id} type="file" accept="image/jpeg,image/png" capture="environment" onChange={choose} className="sr-only" />
      <input ref={hiddenRef} type="file" name="photo" accept="image/jpeg,image/png" className="sr-only" tabIndex={-1} aria-hidden="true" />
    </div>
  );
}

function SendButton({ urgent, ready }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className={cn(
        "flex h-14 w-full items-center justify-center gap-2 rounded-dash-sm text-[1rem] font-bold text-white transition-colors disabled:opacity-50",
        urgent ? "bg-red-600 hover:bg-red-700" : "bg-ink-950 hover:bg-ink-800"
      )}
    >
      {pending ? (
        <Loader2 size={18} strokeWidth={3} className="animate-spin" aria-hidden="true" />
      ) : (
        <Send size={17} strokeWidth={2.5} aria-hidden="true" />
      )}
      {pending ? "Sending your report" : "Send report"}
    </button>
  );
}
