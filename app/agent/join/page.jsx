import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, ShieldCheck, Smartphone } from "lucide-react";

import AgentAuthForm from "@/components/agent/AgentAuthForm";
import { joinAsAgent } from "@/app/agent/actions";
import { currentCoordinator } from "@/lib/coordinator-session";

export const metadata = { title: "Sign up — polling unit", robots: { index: false } };
export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: Smartphone,
    title: "You sign up",
    body: "Your name, your number and the code of the polling unit you were appointed to. Two minutes on a phone.",
  },
  {
    icon: ShieldCheck,
    title: "An administrator approves you",
    body: "Somebody who knows the ward checks your unit against the appointment list. Until they do, your account can file nothing.",
  },
  {
    icon: ClipboardCheck,
    title: "You file on the day",
    body: "One return per ballot paper, each with a photograph of the sheet it came from.",
  },
];

/**
 * Where a coordinator signs themselves up.
 *
 * ── AN APPLICATION, AND IT SAYS SO BEFORE THE FIRST FIELD ──────────────────
 * The thing somebody has to understand before typing anything here is that
 * this creates an application and not an account. Discovering that afterwards,
 * on polling morning, at a booth, is the version of this that fails.
 */
export default async function AgentJoinPage() {
  const person = await currentCoordinator();
  if (person) redirect(person.canFile ? "/agent" : "/agent/pending");

  return (
    <main className="mx-auto w-full max-w-md px-5 py-12">
      <h1 className="text-fluid-2xl text-ink-950">Sign up to file your booth</h1>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-content-muted">
        This is an application, not an account. An administrator checks your polling unit before
        anything you send counts towards a result.
      </p>

      <AgentAuthForm action={joinAsAgent} mode="join" />

      <ol className="mt-10 space-y-5 border-t border-ink-200 pt-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-dash-sm border-2 border-ink-300 text-ink-950">
              <step.icon size={16} strokeWidth={2.25} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="figure text-[0.6875rem] font-bold text-content-subtle">
                {String(index + 1).padStart(2, "0")}
              </p>
              <h2 className="mt-0.5 text-[0.9375rem] font-bold text-ink-950">{step.title}</h2>
              <p className="mt-1 text-[0.875rem] leading-relaxed text-content-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="mt-8 border-t border-ink-200 pt-6 text-[0.9375rem] leading-relaxed text-content-muted">
        Already signed up?{" "}
        <Link href="/agent/login" className="font-bold text-ink-950 underline underline-offset-4">
          Sign in
        </Link>
        .
      </p>
    </main>
  );
}
