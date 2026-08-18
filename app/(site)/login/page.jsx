import { Radio, ShieldCheck, ShieldQuestion, Smartphone } from "lucide-react";

import LoginForm from "@/components/auth/LoginForm";
import Reveal from "@/components/ui/Reveal";
import { site } from "@/lib/site";

/**
 * The way in.
 *
 * Two panels: the form, and a short reminder of what is on the other side of
 * it. The form is first in the source order so a phone shows it without any
 * scrolling, and moves to the right on a wide screen where the eye lands last.
 *
 * Nothing on this page asks for anything the sign-in does not need. A page
 * about not collecting more than you have to would be an odd place to put a
 * newsletter box.
 */
export const metadata = {
  title: "Log in",
  description:
    "Log in to Poll360. Field agents file the result from their booth, coordinators check what has come in, and newsrooms take their graphics — all from the same count.",
  alternates: { canonical: "/login" },
};

const ROOMS = [
  {
    icon: Smartphone,
    title: "Field agents",
    body: "Your booth is already loaded. File your result, attach the photo of the sheet, and you are done.",
  },
  {
    icon: ShieldCheck,
    title: "Coordinators",
    body: "Your area's queue, with the photo beside the figures, and anything that needs a second look flagged.",
  },
  {
    icon: Radio,
    title: "Newsrooms and studios",
    body: "The live board, the graphics for your bulletin, and a download of everything counted in your area.",
  },
];

export default function LoginPage() {
  return (
    <section className="grid lg:min-h-[calc(100vh-4.75rem)] lg:grid-cols-[1fr_1.05fr]">
      {/* ------------------------------------------------------------ form */}
      <div className="order-1 flex items-center bg-white lg:order-2">
        <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
          <Reveal>
            <p className="eyebrow text-content-subtle">
              <span className="text-red-500">01</span>
              Sign in
            </p>
          </Reveal>

          <Reveal delay={60}>
            <h1 className="mt-6 text-fluid-3xl text-ink-950">Welcome back</h1>
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

      {/* ----------------------------------------------------- what is inside */}
      <div className="on-dark relative order-2 overflow-hidden bg-blue-950 lg:order-1">
        <div aria-hidden="true" className="board-grid absolute inset-0 opacity-[0.18]" />

        <div className="relative flex h-full flex-col justify-center px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
          <div className="mx-auto w-full max-w-xl lg:ml-auto lg:mr-0">
            <Reveal>
              <div className="rule" />
            </Reveal>

            <Reveal delay={70}>
              <h2 className="mt-8 max-w-[16ch] text-fluid-3xl text-white">
                One count, and everyone reads the same one
              </h2>
            </Reveal>

            <Reveal delay={130}>
              <p className="mt-5 max-w-lg text-fluid-base leading-relaxed text-white/70">
                Whatever you signed in to do, you are looking at the same figures as everyone else
                on the night — with the share of booths counted printed beside each one.
              </p>
            </Reveal>

            <dl className="mt-12 grid gap-px border border-white/12 bg-white/12">
              {ROOMS.map((room, index) => (
                <Reveal key={room.title} delay={190 + index * 70}>
                  <div className="flex gap-4 bg-blue-950 px-5 py-5 sm:px-6">
                    <room.icon
                      size={18}
                      strokeWidth={2.25}
                      className="mt-0.5 shrink-0 text-red-400"
                      aria-hidden="true"
                    />
                    <div className="min-w-0">
                      <dt className="text-fluid-base font-bold text-white">{room.title}</dt>
                      <dd className="mt-1 text-[0.875rem] leading-relaxed text-white/60">
                        {room.body}
                      </dd>
                    </div>
                  </div>
                </Reveal>
              ))}
            </dl>

            {/* The one warning worth putting on a sign-in page for an election
                product: the commonest way an account is lost is that somebody
                simply asks for the password and is given it. */}
            <Reveal delay={420}>
              <div className="mt-12 flex gap-3.5 border-t border-white/15 pt-6">
                <ShieldQuestion
                  size={17}
                  strokeWidth={2.25}
                  className="mt-0.5 shrink-0 text-white/50"
                  aria-hidden="true"
                />
                <p className="text-[0.8125rem] leading-relaxed text-white/55">
                  Nobody from Poll360 will ever ask you for your password — not by phone, not by
                  SMS, not on WhatsApp. If someone does, they are not us. Tell your coordinator, or
                  write to{" "}
                  <a
                    href={`mailto:${site.contact.access}`}
                    className="font-semibold text-white underline underline-offset-4 transition-colors hover:text-red-400"
                  >
                    {site.contact.access}
                  </a>
                  .
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
