"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { ChevronDown, Loader2, TriangleAlert } from "lucide-react";

import IssueAccountForm from "./IssueAccountForm";
import { declineRequest } from "@/app/admin/actions";

/**
 * The requests, and the account each one becomes.
 *
 * ── ONE ROW OPEN AT A TIME, ON PURPOSE ─────────────────────────────────────
 * Every request carries a whole issue-account form, and forty of them open at
 * once is forty sets of dropdowns down one page with no way to tell which one
 * you are typing into. Opening a second closes the first, so the form on
 * screen is always the form for the request whose details are above it.
 *
 * ── AND WHY THE GROUND IS LISTED BEFORE THE FORM, NOT INSIDE IT ────────────
 * What an organisation asked for and what an administrator is about to issue
 * are two different things that look identical when they are the same
 * dropdown. The request's own answer is printed as text — the district, and
 * every local government inside it by name — and the form underneath is
 * pre-filled with it. If the two ever differ it is because somebody changed
 * it on purpose, and the text above still says what was asked for.
 */
export default function RequestQueue({ requests = [], places = [], races = [] }) {
  const [open, setOpen] = useState(null);

  return (
    <ul className="divide-y divide-dash-line">
      {requests.map((request) => (
        <li key={request.id} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-[0.9375rem] font-bold text-dash-ink">{request.organisation}</p>
            <p className="figure text-[0.75rem] text-dash-muted">{request.waitingSince}</p>
          </div>

          <p className="mt-1 text-[0.8125rem] wrap-break-word text-dash-muted">
            {request.name} · {request.email}
            {request.phone ? ` · ${request.phone}` : ""}
          </p>

          <Ground request={request} />

          {request.message && (
            <p className="mt-2 border-l-2 border-dash-line pl-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              {request.message}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(open === request.id ? null : request.id)}
              aria-expanded={open === request.id}
              className="inline-flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 py-1.5 text-[0.8125rem] font-semibold text-dash-ink transition-colors hover:border-dash-ink"
            >
              {open === request.id ? "Close" : "Issue an account"}
              <ChevronDown
                size={14}
                strokeWidth={2.5}
                className={open === request.id ? "rotate-180 transition-transform" : "transition-transform"}
              />
            </button>

            <Decline id={request.id} />
          </div>

          {open === request.id && (
            <div className="mt-4 rounded-dash border border-dash-line bg-dash-bg p-4">
              <IssueAccountForm
                places={places}
                races={races}
                requestId={request.id}
                initial={{
                  name: request.name,
                  email: request.email,
                  phone: request.phone,
                  race: request.race,
                  territory: request.territory,
                }}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * What they asked to cover, said in places rather than in codes.
 *
 * ── THE LIST IS THE CHECK ──────────────────────────────────────────────────
 * "Kaduna Central · 7 local governments" can only be verified by somebody who
 * already knows the answer, which is nobody at two in the morning. The names
 * are what an administrator holds against what the organisation said on the
 * phone, and they are the only thing on this screen that would catch a
 * district picked one row out of a dropdown.
 */
function Ground({ request }) {
  if (!request.ground) {
    return (
      <p className="mt-2 flex gap-2 text-[0.8125rem] text-dash-muted">
        <TriangleAlert size={14} strokeWidth={2.5} className="mt-0.5 shrink-0 text-amber-600" />
        No ground recorded. This request predates the picker, or names a place we no longer hold —
        choose one below before issuing.
      </p>
    );
  }

  return (
    <div className="mt-2 rounded-dash-sm bg-dash-bg px-3 py-2.5">
      <p className="text-[0.8125rem] font-semibold text-dash-ink">
        {request.raceLabel}
        <span className="text-dash-muted"> · </span>
        {request.ground}
        {request.booths && <span className="font-normal text-dash-muted"> · {request.booths} booths</span>}
        {request.election && <span className="font-normal text-dash-muted"> · {request.election}</span>}
      </p>

      {request.lgas.length > 0 && (
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
          {request.lgas.join(" · ")}
        </p>
      )}

      {request.shared && (
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-amber-700">
          {request.shared.join(" and ")} are both elected inside this local government and we hold
          no ward boundaries, so an account here covers both seats&rsquo; booths.
        </p>
      )}
    </div>
  );
}

function Decline({ id }) {
  const [state, action] = useActionState(declineRequest, {});

  if (state?.ok) return <span className="text-[0.8125rem] text-dash-muted">Turned down.</span>;

  return (
    <form action={action} className="contents">
      <input type="hidden" name="id" value={id} />
      <DeclineButton />
      {state?.error && <span className="text-[0.8125rem] text-red-600">{state.error}</span>}
    </form>
  );
}

function DeclineButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[0.8125rem] text-dash-muted transition-colors hover:text-dash-ink disabled:opacity-50"
    >
      {pending && <Loader2 size={13} strokeWidth={3} className="animate-spin" />}
      Turn down
    </button>
  );
}
