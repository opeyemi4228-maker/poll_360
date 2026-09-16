import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, KeyRound, MapPin } from "lucide-react";

import { currentCoordinator } from "@/lib/coordinator-session";
import { agentPath } from "@/lib/agent-address";

export const metadata = { title: "Details sent", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * After signing up.
 *
 * ── NOTHING TO SIGN IN TO YET ──────────────────────────────────────────────
 * A sign-up is a request to be put on the agent list, not an account. The
 * agent cannot sign in until an administrator approves them, because approval
 * is what issues the code they sign in with. So this page says exactly that,
 * and who gives them the code, rather than pretending to be a waiting room
 * they could come back to.
 *
 * The polling unit on the query string is the one they chose. It is public —
 * printed on every result sheet — and it is here so a mistyped digit can be
 * caught now rather than by the administrator.
 */
export default async function AgentPendingPage({ searchParams }) {
  /* Somebody already signed in has nothing to wait for. */
  const person = await currentCoordinator();
  if (person?.canFile) redirect(agentPath("/"));

  const unit = String((await searchParams)?.unit ?? "").match(/^\d{2}\/\d{2}\/\d{2}\/\d{3}$/)?.[0] ?? null;

  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <span className="inline-flex size-12 items-center justify-center rounded-dash-sm bg-emerald-600">
        <CheckCircle2 size={22} strokeWidth={2.25} className="text-white" aria-hidden="true" />
      </span>

      <h1 className="mt-6 text-fluid-2xl text-ink-950">Your details are sent</h1>

      <p className="mt-4 text-[0.9375rem] leading-relaxed text-content-muted">
        You are on the agent list, waiting to be approved. Somebody who knows your ward checks your
        polling unit against the appointment list — usually the same day.
      </p>

      <dl className="mt-8 divide-y divide-ink-200 border-y border-ink-200">
        {unit && (
          <div className="flex items-start gap-4 py-5">
            <MapPin size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-content-subtle" />
            <div>
              <dt className="tag text-content-subtle">The polling unit you gave</dt>
              <dd className="figure mt-1.5 text-[1.25rem] font-bold text-ink-950">{unit}</dd>
              <dd className="mt-1.5 text-[0.875rem] leading-relaxed text-content-muted">
                If this is wrong, tell your coordinator. It can be corrected when you are approved.
              </dd>
            </div>
          </div>
        )}
        <div className="flex items-start gap-4 py-5">
          <KeyRound size={17} strokeWidth={2.25} className="mt-0.5 shrink-0 text-content-subtle" />
          <div>
            <dt className="tag text-content-subtle">What happens next</dt>
            <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-content-muted">
              When you are approved, your coordinator gives you your code. It starts with your
              polling unit number. You sign in with that code and nothing else — there is no password.
            </dd>
          </div>
        </div>
      </dl>

      <p className="mt-8 text-[0.9375rem] leading-relaxed text-content-muted">
        Already have your code?{" "}
        <Link href={agentPath("/login")} className="font-bold text-ink-950 underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
