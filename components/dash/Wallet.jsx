"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Info, Loader2, ShieldCheck } from "lucide-react";

import Button from "@/components/ui/Button";
import { Badge } from "./DashCard";
import { requestWithdrawal } from "@/app/field/wallet-actions";

/**
 * The agent's own account.
 *
 * Every figure here is derived from the ledger rather than stored, and every
 * line shows the short hash of the entry that produced it. That is not
 * decoration: it is what lets an agent who thinks they have been short-paid
 * quote one reference to a coordinator, and the coordinator find the exact
 * entry and prove it has not been altered since it was written.
 */
const naira = (kobo) => `₦${(kobo / 100).toLocaleString("en-NG")}`;

const LABELS = {
  STIPEND: "Stipend",
  BONUS: "Bonus",
  ADJUSTMENT: "Adjustment",
  WITHDRAWAL: "Withdrawn",
  WITHDRAWAL_REQUESTED: "Requested",
  WITHDRAWAL_DECLINED: "Declined",
};

export default function Wallet({ balance, pending, entries, chain }) {
  const [state, formAction] = useActionState(requestWithdrawal, {});
  const available = balance - pending;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-dash-sm bg-dash-bg p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Earned
          </p>
          <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold text-dash-ink">
            {naira(balance)}
          </p>
        </div>
        <div className="rounded-dash-sm bg-dash-bg p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Requested
          </p>
          <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold text-dash-ink">
            {naira(pending)}
          </p>
        </div>
        <div className="rounded-dash-sm border-2 border-dash-ink p-4">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Available
          </p>
          <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold text-dash-ink">
            {naira(available)}
          </p>
        </div>
      </div>

      {/* The honesty note. A "Withdraw" button that quietly does nothing is the
          most damaging thing this product could show an agent on the day. */}
      <p className="flex gap-2.5 rounded-dash-sm bg-dash-bg px-4 py-3 text-[0.8125rem] leading-relaxed text-dash-muted">
        <Info size={16} strokeWidth={2.25} className="mt-px shrink-0" />
        Asking here records the request against your account. It does not move money on its own, somebody with authority to pay settles it, and the entry appears below the moment they do.
      </p>

      {state?.ok ? (
        <p className="flex items-center gap-2 rounded-dash-sm border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-[0.875rem] text-dash-ink">
          <Check size={17} strokeWidth={3} className="shrink-0 text-emerald-600" />
          Requested. Your reference is{" "}
          <span className="figure font-bold">{state.reference}</span>, quote it if you need to ask
          about this payment.
        </p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-end gap-3">
          <div className="min-w-40 flex-1">
            <label
              htmlFor="amount"
              className="block text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase"
            >
              Amount to withdraw
            </label>
            <div className="mt-2 flex items-center rounded-dash-sm border-2 border-dash-line bg-dash-card focus-within:border-dash-ink">
              <span className="figure pl-3 text-[1.0625rem] text-dash-muted">₦</span>
              <input
                id="amount"
                name="amount"
                type="text"
                inputMode="numeric"
                placeholder="5,000"
                disabled={available <= 0}
                className="figure h-12 w-full bg-transparent px-2 text-[1.0625rem] text-dash-ink placeholder:text-dash-muted focus:outline-none disabled:opacity-40"
              />
            </div>
          </div>
          <Withdraw disabled={available <= 0} />
        </form>
      )}

      {state?.error && (
        <p className="rounded-dash-sm border-l-2 border-red-500 bg-red-50 px-4 py-3 text-[0.875rem] text-dash-ink">
          {state.error}
        </p>
      )}

      {/* ------------------------------------------------------- statement */}
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
            Statement
          </p>
          <span className="flex items-center gap-1.5 text-[0.75rem] text-dash-muted">
            <ShieldCheck
              size={14}
              strokeWidth={2.5}
              className={chain?.ok ? "text-emerald-600" : "text-red-600"}
            />
            {chain?.ok ? "Chain verified" : "Chain broken, tell an administrator"}
          </span>
        </div>

        {entries.length === 0 ? (
          <p className="mt-3 rounded-dash-sm bg-dash-bg px-4 py-6 text-center text-[0.875rem] text-dash-muted">
            Nothing yet. Payments appear here the moment they are recorded.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-dash-line border-y border-dash-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    <span className="text-[0.875rem] font-semibold text-dash-ink">
                      {LABELS[entry.kind] ?? entry.kind}
                    </span>
                    {entry.kind === "WITHDRAWAL_REQUESTED" && (
                      <Badge tone="warn">Awaiting payment</Badge>
                    )}
                  </p>
                  <p className="figure mt-0.5 text-[0.75rem] text-dash-muted">
                    {entry.reference} · {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </p>
                </div>

                <div className="text-right">
                  <p className="figure text-[0.9375rem] font-bold text-dash-ink">
                    {entry.kind === "WITHDRAWAL" ? "−" : ""}
                    {naira(entry.amount)}
                  </p>
                  {/* The short hash. Enough to match an entry against the
                      administrator's copy without printing 64 characters. */}
                  <p className="figure text-[0.6875rem] text-dash-muted">
                    {entry.hash.slice(0, 10)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Withdraw({ disabled }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="dash" size="lg" disabled={pending || disabled}>
      {pending ? (
        <>
          <Loader2 size={16} strokeWidth={3} className="animate-spin" />
          Sending
        </>
      ) : (
        "Request"
      )}
    </Button>
  );
}
