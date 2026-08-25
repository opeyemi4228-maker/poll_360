import { ClipboardCheck, ShieldCheck, Smartphone } from "lucide-react";

import JoinForm from "@/components/auth/JoinForm";
import Reveal from "@/components/ui/Reveal";

/**
 * Where a polling unit coordinator signs themselves up.
 *
 * Deliberately its own page rather than a tab on the sign-in form. The people
 * who arrive here are arriving once, from a link somebody sent them, often
 * days before polling day, and the thing they need to understand before they
 * type anything is that this is an application and not an account.
 */
export const metadata = {
  title: "Sign up as a coordinator",
  description:
    "Sign up to file results from your polling unit. An administrator approves your unit before anything you file enters the count.",
  alternates: { canonical: "/join" },
};

const STEPS = [
  {
    icon: Smartphone,
    title: "You sign up",
    body: "Your name, your number and the code of the polling unit you have been appointed to. Two minutes on a phone.",
  },
  {
    icon: ShieldCheck,
    title: "An administrator approves you",
    body: "Somebody who knows the ward checks the unit against the appointment list. Until they do, your account can file nothing.",
  },
  {
    icon: ClipboardCheck,
    title: "You file on the day",
    body: "One return per ballot paper — presidential, governorship, senate, representatives, local government — with a photograph of each sheet.",
  },
];

export default function JoinPage() {
  return (
    <section className="grid lg:min-h-[calc(100vh-4.75rem)] lg:grid-cols-[1fr_1.05fr]">
      {/* ------------------------------------------------------------ form */}
      <div className="order-1 flex items-center bg-white lg:order-2">
        <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
          <Reveal>
            <p className="eyebrow text-content-subtle">Polling unit coordinators</p>
            <h1 className="mt-4 text-fluid-3xl text-ink-950">Sign up to file your booth</h1>
            <p className="mt-4 text-[1rem] leading-relaxed text-content-muted">
              This is an application, not an account. An administrator checks your polling unit
              before anything you send counts towards a result.
            </p>
            <JoinForm />
          </Reveal>
        </div>
      </div>

      {/* ----------------------------------------------------------- aside */}
      <div className="order-2 bg-ink-950 lg:order-1">
        <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
          <Reveal>
            <p className="eyebrow text-white/50">How it works</p>
            <ul className="mt-8 space-y-8">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex gap-5">
                  <span className="flex size-11 shrink-0 items-center justify-center border-2 border-white/20 text-white">
                    <step.icon size={18} strokeWidth={2} aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="figure text-[0.75rem] font-bold text-white/40">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h2 className="mt-1 text-[1.0625rem] font-bold text-white">{step.title}</h2>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-white/70">
                      {step.body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-10 border-t border-white/15 pt-6 text-[0.875rem] leading-relaxed text-white/60">
              Already approved?{" "}
              <a href="/login" className="font-semibold text-white underline underline-offset-4">
                Sign in instead
              </a>
              .
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
