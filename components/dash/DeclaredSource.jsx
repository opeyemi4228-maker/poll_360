"use client";

import { useActionState, useTransition, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Link2, Loader2, RefreshCw, TriangleAlert } from "lucide-react";

import Button from "@/components/ui/Button";
import { checkDeclaredSource, removeDeclaredSource, setDeclaredSource } from "@/app/gap/actions";
import { formatNumber } from "@/lib/utils";

/**
 * Fetching what was announced, without anybody uploading it.
 *
 * ── ONE LINK, PASTED ONCE ──────────────────────────────────────────────────
 * Somebody at collation is already typing announcements into a shared sheet.
 * This takes that sheet's link and reads it every couple of minutes, so a
 * figure typed there is on every screen here without a second step. The sheet
 * uses the same columns as an upload, and the upload below still works beside
 * it for anything the sheet does not carry.
 *
 * ── AND IT ALWAYS SAYS WHAT THE LAST READING FOUND ─────────────────────────
 * Something that runs unattended is trusted only as far as it reports. When
 * it last looked, when the sheet last changed, how many places it holds, and
 * in words what went wrong if anything did.
 */
const clock = (date) =>
  date
    ? new Date(date).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Lagos" })
    : null;

export default function DeclaredSource({ source }) {
  const [state, formAction] = useActionState(setDeclaredSource, {});
  const [said, setSaid] = useState(null);
  const [working, startWork] = useTransition();

  const press = (action) => () => startWork(async () => setSaid(await action()));
  const latest = said ?? state;

  if (!source) {
    return (
      <form action={formAction} className="space-y-4">
        <div>
          <label htmlFor="address" className="block text-[0.75rem] font-medium text-dash-muted">
            Link to the sheet
          </label>
          <input
            id="address"
            name="address"
            type="url"
            inputMode="url"
            autoComplete="off"
            required
            placeholder="https://docs.google.com/spreadsheets/d/…"
            className="mt-2 h-11 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.9375rem] text-dash-ink placeholder:text-dash-muted focus:border-dash-ink focus:outline-none"
          />
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-dash-muted">
            A Google Sheet shared so anyone with the link can view it, or any link that returns the
            figures as a table. It is read every two minutes while a Poll360 screen is open, using
            the same columns as an upload.
          </p>
        </div>

        <Said state={latest} />
        <Start />
      </form>
    );
  }

  let host = source.address;
  try {
    host = new URL(source.address).hostname;
  } catch {
    /* Shown as it was stored. */
  }

  return (
    <div className="space-y-4">
      <div className="border-l-2 border-ok-400 bg-ok-50 px-4 py-3">
        <p className="flex gap-2 text-[0.875rem] font-semibold text-dash-ink">
          <Link2 size={16} strokeWidth={2.5} className="mt-0.5 shrink-0 text-ok-600" />
          Reading a sheet on {host}
        </p>
        <p className="mt-1.5 pl-6 text-[0.8125rem] leading-relaxed text-dash-muted">
          {source.checkedAt ? `Last read ${clock(source.checkedAt)}.` : "Not read yet."}{" "}
          {source.changedAt
            ? `Last changed ${clock(source.changedAt)}, ${formatNumber(source.places ?? 0)} place${source.places === 1 ? "" : "s"}.`
            : "Nothing has been brought in from it yet."}
        </p>
        {source.said && <p className="mt-1 pl-6 text-[0.8125rem] text-dash-ink">{source.said}</p>}
      </div>

      <Said state={said} />

      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="dash" size="md" disabled={working} onClick={press(checkDeclaredSource)}>
          {working ? <Loader2 size={15} strokeWidth={3} className="animate-spin" /> : <RefreshCw size={15} strokeWidth={2.5} />}
          Read it now
        </Button>
        <Button type="button" variant="dashOutline" size="md" disabled={working} onClick={press(removeDeclaredSource)}>
          Stop reading
        </Button>
      </div>
      <p className="text-[0.8125rem] leading-relaxed text-dash-muted">
        Stopping keeps every figure already brought in. A place removed from the sheet also stays
        here until somebody removes it on this screen.
      </p>
    </div>
  );
}

function Said({ state }) {
  if (!state || (!state.error && !state.said)) return null;
  const good = state.ok && !state.error;
  return (
    <div className={`border-l-2 px-3 py-2 text-[0.875rem] text-dash-ink ${good ? "border-ok-400 bg-ok-50" : "border-red-500 bg-red-50"}`}>
      <p className="flex gap-2">
        {good ? (
          <Check size={16} strokeWidth={3} className="mt-0.5 shrink-0 text-ok-600" />
        ) : (
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-red-600" />
        )}
        {state.error ?? state.said}
      </p>
      {state.problems?.length > 0 && (
        <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pl-6">
          {state.problems.slice(0, 12).map((problem) => (
            <li key={`${problem.line}:${problem.says}`} className="text-[0.8125rem]">
              <span className="figure font-bold">Line {problem.line}</span> — {problem.says}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Start() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="lg" disabled={pending}>
      {pending ? <Loader2 size={16} strokeWidth={3} className="animate-spin" /> : <Link2 size={16} strokeWidth={2.5} />}
      {pending ? "Reading" : "Start reading this sheet"}
    </Button>
  );
}
