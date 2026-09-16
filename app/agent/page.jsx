import Link from "next/link";
import { ArrowRight, CheckCircle2, MapPin, Megaphone, ScanLine, ShieldAlert, Siren } from "lucide-react";

import { signOutAgent } from "@/app/agent/actions";
import { TONES } from "@/components/agent/AgentScreen";
import { timeOf } from "@/components/agent/day/DayRecord";
import { agentPath } from "@/lib/agent-address";
import { AGENTS_APP } from "@/lib/agents-app";
import { updateProgress } from "@/lib/agent-day";
import { agentElection } from "@/lib/agent-election";
import { requireCoordinator } from "@/lib/coordinator-session";
import { incidents, results, unitUpdates, units } from "@/lib/db";
import { RACES } from "@/lib/races";
import { cn } from "@/lib/utils";

/* Absolute, not a plain "Home": a layout's title template reaches only the
   pages below it, and this page shares its segment with app/agent/layout.jsx —
   so a plain title fell through to the root template and the agents' home
   showed "Home | Poll360" in the tab. */
export const metadata = { title: { absolute: `Home · ${AGENTS_APP.name}` }, robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The agent's home: who they are, which booth, and three doors.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  SITUATIONS, RESULTS, UPDATES
 *
 *  An agent at a polling unit does three different things on three different
 *  clocks. Updates are the day's procedure and are sent a few times from
 *  morning to night. Results come once, late, off a sheet. Situations can come
 *  at any minute and some of them cannot wait. One long page made all three
 *  scroll past each other; three doors on a home screen let somebody with a
 *  queue in front of them go straight to the one they need.
 *
 *  Each door says where the agent is with it — how many results are in, what
 *  was last sent, whether anything urgent is open — so the home screen is also
 *  the answer to "have I done everything?".
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The SOS is on this screen as well as on Situations. Somebody in danger should
 * not have to choose a door first.
 */
export default async function AgentHome() {
  const person = await requireCoordinator();
  const project = await agentElection(person.unitCode);

  const [unit, filedRows, updates, reports] = await Promise.all([
    person.unitCode ? units.at(person.unitCode) : null,
    project && person.unitCode ? results.forUnitAcrossRaces(person.unitCode, project.id) : {},
    project ? unitUpdates.forAgent(person.id, project.id) : [],
    project ? incidents.forAgent(person.id, project.id) : [],
  ]);

  const sentResults = RACES.filter((race) => filedRows[race.id]).length;
  const progress = updateProgress(updates);
  const urgentOpen = reports.filter((report) => report.severity === "CRITICAL" && report.status === "OPEN").length;
  const firstName = String(person.name ?? "").trim().split(/\s+/)[0];

  const doors = [
    {
      href: agentPath("/situations"),
      title: "Situations",
      lead: "Report trouble at your unit: security threats, violence, missing materials.",
      status: reports.length
        ? `${reports.length} reported${urgentOpen ? ` · ${urgentOpen} urgent` : ""}`
        : "Nothing reported",
      alert: urgentOpen > 0,
      icon: ShieldAlert,
      tone: "red",
    },
    {
      href: agentPath("/results"),
      title: "Results",
      lead: "Scan the result sheet and send the figures for each election.",
      status: sentResults === RACES.length ? "All results sent" : `${sentResults} of ${RACES.length} sent`,
      done: sentResults === RACES.length,
      icon: ScanLine,
      tone: "ink",
    },
    {
      href: agentPath("/updates"),
      title: "Updates",
      lead: progress.next
        ? `Tell the room how the day is going. Next: ${progress.next.label.toLowerCase()}.`
        : "Tell the room how the day is going. Every step is sent.",
      status: progress.latest ? `Last sent: ${progress.latest.label}, ${timeOf(progress.latest.at)}` : "Nothing sent yet",
      done: progress.done === progress.total,
      icon: Megaphone,
      tone: "green",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-24 sm:px-5">
      <section className="pt-7">
        <p className="text-[0.9375rem] font-semibold text-content-muted">{greeting()}</p>
        <h1 className="mt-0.5 text-fluid-3xl font-bold tracking-[-0.03em] text-ink-950">
          Welcome{firstName ? `, ${firstName}` : ""}
        </h1>
      </section>

      {/* ── THE BOOTH, AS A FACT ────────────────────────────────────────────
          Large enough to check against the sheet in their hand, and not a
          form control: nothing on this screen can change it. */}
      <section aria-label="Your polling unit" className="mt-5 rounded-dash bg-ink-950 p-5 text-white">
        <p className="tag flex items-center gap-1.5 text-white/60">
          <MapPin size={12} strokeWidth={2.5} aria-hidden="true" />
          Your polling unit
        </p>
        <p className="figure mt-2 text-fluid-2xl font-bold tracking-[-0.02em]">{person.unitCode}</p>
        {unit?.name && <p className="mt-0.5 text-[0.9375rem] font-semibold text-white/85">{unit.name}</p>}
        <p className="mt-3 border-t border-white/15 pt-3 text-[0.8125rem] text-white/65">
          {project ? project.title : "No election is running yet"}
        </p>
      </section>

      {!project && (
        <p className="mt-4 rounded-dash-sm border-2 border-amber-300 bg-amber-50 px-4 py-3.5 text-[0.9375rem] leading-relaxed text-amber-900">
          There is nothing to send yet. When the election opens, everything on this screen switches on.
        </p>
      )}

      <nav aria-labelledby="doors" className="mt-7">
        <h2 id="doors" className="text-[0.9375rem] font-bold text-ink-950">
          What do you need to do?
        </h2>
        <ul className="mt-3 grid gap-3">
          {doors.map((door) => (
            <li key={door.href}>
              <Door {...door} />
            </li>
          ))}
        </ul>
      </nav>

      <Link
        href={`${agentPath("/situations")}#sos`}
        className="mt-4 flex items-center gap-3.5 rounded-dash border-2 border-red-300 bg-red-50 px-4 py-3.5 transition-colors hover:border-red-600 focus-visible:border-red-600 focus-visible:outline-none"
      >
        <Siren size={22} strokeWidth={2.5} className="shrink-0 text-red-600" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-bold text-red-800">In danger?</span>
          <span className="block text-[0.8125rem] leading-snug text-ink-800">
            Send an SOS to your coordinator and the situation room.
          </span>
        </span>
        <ArrowRight size={18} strokeWidth={2.5} className="shrink-0 text-red-600" aria-hidden="true" />
      </Link>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-5">
        <p className="text-[0.8125rem] text-content-muted">
          Signed in as <span className="font-bold text-ink-950">{person.name}</span>
        </p>
        <form action={signOutAgent}>
          <button
            type="submit"
            className="h-11 rounded-dash-sm border-2 border-ink-300 px-4 text-[0.875rem] font-bold text-ink-950 transition-colors hover:border-ink-950"
          >
            Sign out
          </button>
        </form>
      </footer>
    </main>
  );
}

function Door({ href, title, lead, status, done, alert, icon: Icon, tone }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-dash border-2 border-ink-200 bg-white p-4 transition-colors hover:border-ink-950 focus-visible:border-ink-950 focus-visible:outline-none sm:p-5"
    >
      <span
        aria-hidden="true"
        className={cn("flex size-14 shrink-0 items-center justify-center rounded-dash-sm text-white", TONES[tone])}
      >
        <Icon size={26} strokeWidth={2.25} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-fluid-xl font-bold text-ink-950">{title}</span>
        <span className="mt-0.5 block text-[0.875rem] leading-snug text-content-muted">{lead}</span>
        <span
          className={cn(
            "mt-2.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] font-bold",
            alert ? "bg-red-100 text-red-800" : done ? "bg-emerald-50 text-emerald-800" : "bg-ink-100 text-ink-800"
          )}
        >
          {done && <CheckCircle2 size={14} strokeWidth={2.75} className="shrink-0" aria-hidden="true" />}
          <span className="truncate">{status}</span>
        </span>
      </span>

      <ArrowRight
        size={20}
        strokeWidth={2.5}
        className="shrink-0 text-ink-400 transition-transform group-hover:translate-x-0.5 group-hover:text-ink-950"
        aria-hidden="true"
      />
    </Link>
  );
}

/** By the clock at the polling unit, not the server's. */
function greeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: "Africa/Lagos" }).format(new Date())
  );
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}
