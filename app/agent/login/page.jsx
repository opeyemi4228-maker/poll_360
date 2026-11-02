import Link from "next/link";
import { redirect } from "next/navigation";
import { Fingerprint, KeyRound, ShieldAlert, UserPlus } from "lucide-react";

import CodeSignIn from "@/components/agent/CodeSignIn";
import { signInWithCode } from "@/app/agent/actions";
import { currentCoordinator } from "@/lib/coordinator-session";
import { agentPath } from "@/lib/agent-address";
import { AGENTS_APP } from "@/lib/agents-app";
import { runConfigured } from "@/lib/run-oauth";

/**
 * Why a "Sign in with RUN" attempt came back here, in words for the booth.
 *
 * A failed or refused RUN sign-in redirects to `/login?run=<reason>`; the
 * reasons are a closed set (see app/agent/run/callback/route.js) so an
 * unexpected value falls through to one plain sentence rather than leaking a
 * raw slug. `unavailable` and `throttled` carry no alarm — the first means the
 * door is simply not set up on this deployment, the second means slow down.
 */
const RUN_REASONS = {
  cancelled: { tone: "muted", text: "RUN sign-in was cancelled. You can try again, or use your code below." },
  paused: {
    tone: "alert",
    text: "RUN shows your agent account as paused, so you cannot sign in yet. Contact your coordinator.",
  },
  inactive: {
    tone: "alert",
    text: "RUN does not show you as a current polling unit agent, so you cannot sign in with RUN. Use your code if you have one.",
  },
  expired: { tone: "muted", text: "That RUN sign-in timed out. Please start it again." },
  mismatch: { tone: "muted", text: "That RUN sign-in could not be verified. Please start it again." },
  throttled: { tone: "muted", text: "Too many sign-in attempts. Wait a few minutes, then try again." },
  error: { tone: "alert", text: "RUN sign-in could not finish. Try again, or use your code below." },
};

export const metadata = { title: "Sign in", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The agents' sign-in: its own page, on its own domain, for one credential.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING SHARED WITH POLL360'S SIGN-IN
 *
 *  Staff sign in to Poll360 with an email and a password, on Poll360's page.
 *  Agents sign in here, to "Agents", with the code they were given when they
 *  were approved — no username and no password. Neither page mentions the
 *  other, and Poll360's staff sign-in refuses an agent account outright.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The code names the agent's polling unit and is theirs alone; Data Bank,
 * which holds the agent list, confirms it every time somebody signs in.
 */
export default async function AgentLoginPage({ searchParams }) {
  /* Already signed in on this phone, which is the normal case. */
  const person = await currentCoordinator();
  if (person?.canFile) redirect(agentPath("/"));

  const withRun = runConfigured();
  const reasonKey = String((await searchParams)?.run ?? "");
  /* `unavailable` is deliberately not in the table: a deployment with no RUN
     door should say nothing about one, so an old link to it is silent. */
  const reason = reasonKey && reasonKey !== "unavailable" ? RUN_REASONS[reasonKey] ?? RUN_REASONS.error : null;

  return (
    <main className="pb-16">
      {/* ── THE APP, SAYING WHAT IT IS ──────────────────────────────────── */}
      <section className="bg-ink-950 text-white">
        <div className="mx-auto w-full max-w-md px-5 pt-10 pb-20">
          <p className="tag text-white/55">{AGENTS_APP.name}</p>
          <h1 className="mt-3 text-fluid-3xl font-bold tracking-[-0.03em]">Sign in</h1>
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-white/70">
            Enter the code you were given when you were approved. It is your polling unit number followed by
            six letters and numbers.
          </p>
        </div>
      </section>

      {/* ── THE ONE BOX ─────────────────────────────────────────────────── */}
      <div className="mx-auto -mt-12 w-full max-w-md px-5">
        {reason && (
          <p
            className={`mb-4 flex gap-3 rounded-dash-sm border-l-2 px-4 py-3.5 text-[0.8125rem] leading-relaxed ${
              reason.tone === "alert"
                ? "border-red-500 bg-white text-ink-800"
                : "border-ink-300 bg-white text-content-muted"
            }`}
            role={reason.tone === "alert" ? "alert" : "status"}
          >
            <ShieldAlert
              size={17}
              strokeWidth={2.5}
              className={`mt-px shrink-0 ${reason.tone === "alert" ? "text-red-600" : "text-content-subtle"}`}
              aria-hidden="true"
            />
            <span>{reason.text}</span>
          </p>
        )}

        <div className="rounded-dash border-2 border-ink-950 bg-white p-5 shadow-[0_12px_32px_-18px_rgba(10,13,20,0.45)] sm:p-6">
          <CodeSignIn action={signInWithCode} />

          {/* ── SIGN IN WITH RUN ──────────────────────────────────────────────
              Only where the deployment is wired to RUN. It is a plain link: the
              start handler sets the PKCE cookie and redirects to RUN's own
              sign-in page, so the agent types their RUN password on RUN, never
              here. See app/agent/run/start/route.js. */}
          {withRun && (
            <>
              <div className="my-5 flex items-center gap-3 text-[0.75rem] font-semibold uppercase tracking-wide text-content-subtle">
                <span className="h-px flex-1 bg-ink-200" />
                or
                <span className="h-px flex-1 bg-ink-200" />
              </div>
              <a
                href={agentPath("/run/start")}
                className="flex w-full items-center justify-center gap-2.5 rounded-dash-sm border-2 border-ink-950 bg-white px-4 py-3.5 text-[0.9375rem] font-bold text-ink-950 transition hover:bg-ink-50"
              >
                <Fingerprint size={18} strokeWidth={2.5} aria-hidden="true" />
                Sign in with RUN
              </a>
              <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-content-muted">
                You sign in on Rise Up Naija with your RUN ID, and come back here able to file for your booth.
              </p>
            </>
          )}
        </div>

        <ul className="mt-8 space-y-3">
          <Help icon={UserPlus}>
            No code yet?{" "}
            <Link href={agentPath("/join")} className="font-bold text-ink-950 underline underline-offset-4">
              Sign up as an agent
            </Link>
            , and you get a code once you are approved.
          </Help>
          <Help icon={KeyRound}>Lost your code? Your coordinator can give you a new one.</Help>
        </ul>

        <p className="mt-8 flex gap-3 rounded-dash-sm border-l-2 border-red-500 bg-white px-4 py-3.5 text-[0.8125rem] leading-relaxed text-ink-800">
          <ShieldAlert size={17} strokeWidth={2.5} className="mt-px shrink-0 text-red-600" aria-hidden="true" />
          <span>
            Never share your code. Nobody will ever ask you for it — not by phone, not by SMS, not on WhatsApp.
            If somebody does, do not give it, and tell your coordinator.
          </span>
        </p>
      </div>
    </main>
  );
}

function Help({ icon: Icon, children }) {
  return (
    <li className="flex gap-3 text-[0.9375rem] leading-relaxed text-content-muted">
      <Icon size={17} strokeWidth={2.25} className="mt-1 shrink-0 text-ink-950" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
