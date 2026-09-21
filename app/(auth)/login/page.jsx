import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import LoginForm from "@/components/auth/LoginForm";
import Reveal from "@/components/ui/Reveal";
import Wordmark from "@/components/ui/Wordmark";
import { site } from "@/lib/site";

/**
 * The way in.
 *
 * Two panels on a full screen, with no masthead or footer (see the layout):
 * the form, and a short solid panel saying what is on the other side of it.
 * The form is first in the source order so a phone shows it without any
 * scrolling, and moves to the right on a wide screen where the eye lands last.
 *
 * Nothing on this page asks for anything the sign-in does not need.
 */
export const metadata = {
  title: "Log in",
  description:
    "Log in to Poll360. Situation rooms follow every report as it lands, coordinators check what has come in, and newsrooms take their graphics, all from the same count.",
  alternates: { canonical: "/login" },
};

/* Staff rooms only. Agents have their own app on their own domain, with its
   own sign-in, and this page does not mention it — see lib/agents-app.js. */
const ROOMS = [
  { title: "Situation rooms", body: "Every report as it lands." },
  { title: "Coordinators", body: "Your area's queue, photo beside the figures." },
  { title: "Newsrooms", body: "The live board and your bulletin graphics." },
];

export default function LoginPage() {
  return (
    <section className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      {/* ------------------------------------------------------------ form */}
      <div className="order-1 flex flex-col bg-white lg:order-2">
        <div className="px-5 pt-6 sm:px-10 lg:px-16 lg:pt-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-[0.875rem] font-semibold text-content-muted transition-colors hover:text-ink-950"
          >
            <ArrowLeft size={18} strokeWidth={2.25} aria-hidden="true" />
            Back to website
          </Link>
        </div>

        <div className="flex flex-1 items-center">
          <div className="mx-auto w-full max-w-xl px-5 py-12 sm:px-10 lg:px-16 lg:py-16">
            <Reveal>
              <Wordmark />
            </Reveal>

            <Reveal delay={60}>
              <h1 className="mt-10 text-fluid-3xl text-ink-950">Welcome back</h1>
            </Reveal>

            <Reveal delay={120}>
              <p className="mt-4 text-fluid-base leading-relaxed text-content-muted">
                Use the email address or phone number your room registered you with.
              </p>
            </Reveal>

            <Reveal delay={180}>
              <LoginForm />
            </Reveal>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------- what is inside */}
      <div className="on-dark order-2 flex items-center bg-blue-900 lg:order-1">
        <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-10 lg:ml-auto lg:mr-0 lg:px-16 lg:py-20">
          <Reveal>
            <div className="h-1 w-12 bg-red-500" />
          </Reveal>

          <Reveal delay={70}>
            <h2 className="mt-8 max-w-[16ch] text-fluid-3xl text-white">
              One count, and everyone reads the same one
            </h2>
          </Reveal>

          <ul className="mt-10 space-y-3">
            {ROOMS.map((room, index) => (
              <Reveal key={room.title} delay={130 + index * 60}>
                <li className="bg-blue-800 px-5 py-4">
                  <p className="font-bold text-white">{room.title}</p>
                  <p className="mt-0.5 text-[0.875rem] text-blue-100">{room.body}</p>
                </li>
              </Reveal>
            ))}
          </ul>

          {/* The one warning worth keeping: the commonest way an account is
              lost is that somebody simply asks for the password. */}
          <Reveal delay={330}>
            <p className="mt-10 bg-red-500 px-5 py-4 text-[0.875rem] font-semibold text-white">
              We will never ask for your password. Anyone who does is not us, tell{" "}
              <a href={`mailto:${site.contact.access}`} className="underline underline-offset-4">
                {site.contact.access}
              </a>
              .
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
