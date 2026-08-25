import { AlertTriangle, ArrowLeftRight, FileText, Scale, ShieldAlert } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, StatCard } from "@/components/dash/DashCard";
import DeclaredUpload from "@/components/dash/DeclaredUpload";
import DivergencePanel from "@/components/dash/DivergencePanel";
import GapBoard from "@/components/dash/GapBoard";
import LiveRefresh from "@/components/dash/LiveRefresh";
import { requireCapability } from "@/lib/guard";
import { can } from "@/lib/roles";
import { currentElection, currentRace } from "@/lib/election-scope";
import { gapReport } from "@/lib/gap-report";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Declared figures", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Our count, held against the commission's.
 *
 * ── WHY THIS IS A ROOM AND NOT A PANEL ─────────────────────────────────────
 * The situation room carries a summary of the gap, and that is the right
 * amount for a wall. But the moment a finding matters, somebody has to sit
 * down with it: which places, at which level, holding how much of each, and
 * what exactly differs. That is a screen with filters and long lists on it,
 * and a wall display is the wrong place for both.
 *
 * ── THE TWO HALVES ARE ON ONE PAGE ON PURPOSE ──────────────────────────────
 * Entering declared figures and reading the divergence are the same job done
 * by the same person minutes apart: a ward is announced, it is typed in, and
 * the question "does that match what our agents filed" is asked immediately.
 * Splitting them across two routes would put a navigation step in the middle
 * of a single thought.
 *
 * ── AND THE ROOM THAT READS IT CANNOT ALWAYS WRITE IT ──────────────────────
 * gap:read opens this page; declared:file is what shows the upload panel. The
 * broadcast desk holds the first and not the second, deliberately: whoever
 * types the declared figure decides what our count is being held against.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function GapPage() {
  const user = await requireCapability("gap:read", "/gap");

  const project = await currentElection();
  /* The position being read, from the same cookie every other dashboard uses,
     so this screen and the room can never be comparing different contests. It
     falls back to the project's headline contest when nobody has chosen. */
  const race = await currentRace(project);
  const report = await gapReport(project?.id, race);

  const mayEnter = can(user.role, "declared:file");

  return (
    <DashLayout
      user={user}
      screen="gap"
      title="Declared figures"
      lead="What our agents counted, held against what was announced. Two independently sourced numbers for the same booths, kept apart and compared."
      actions={<LiveRefresh seconds={30} label="Live" />}
    >
      {/* ------------------------------------------------------------ heads */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Declared figures in"
          value={formatNumber(report.declared)}
          context={
            report.at
              ? `Last entered ${report.at.toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Africa/Lagos",
                })}`
              : "Nothing entered yet"
          }
        />
        <StatCard
          icon={Scale}
          label="Places compared"
          value={formatNumber(report.compared)}
          /* ── THE QUALIFIER IS NOT OPTIONAL ────────────────────────────
             The same rule the coverage dial exists to enforce: a figure
             without the share of the country it came from is a different
             claim, and this one is read by people who will quote it. */
          context={
            report.tooThin
              ? `${formatNumber(report.tooThin)} too thinly covered to compare`
              : "Held completely enough for the totals to mean the same thing"
          }
        />
        <StatCard
          icon={ArrowLeftRight}
          label="Winners differing"
          value={formatNumber(report.flipped)}
          tone={report.flipped ? "alert" : "default"}
          context="Places where the two counts lead different parties"
        />
        <StatCard
          icon={ShieldAlert}
          label="Impossible"
          value={formatNumber(report.impossible)}
          tone={report.impossible ? "alert" : "default"}
          context="Our figure larger than the whole that contains it"
        />
      </div>

      {/* ── WHAT THE ALARM WOULD BE SOUNDING FOR ──────────────────────────
          Impossible arithmetic and changed winners, lifted above everything
          else. Not the figure-by-figure differences: those are worth reading
          and are not worth interrupting a room for, and a banner that appears
          for everything is a banner nobody reads. */}
      {report.urgent.length > 0 && (
        <section className="rounded-dash border-2 border-red-300 bg-red-50 px-5 py-4">
          <p className="flex items-center gap-2 font-display text-[0.9375rem] font-extrabold text-dash-ink">
            <AlertTriangle size={17} strokeWidth={2.5} className="shrink-0 text-red-600" />
            {formatNumber(report.urgent.length)}{" "}
            {report.urgent.length === 1 ? "finding needs" : "findings need"} somebody now
          </p>
          <ul className="mt-3 space-y-2">
            {report.urgent.slice(0, 6).map((flag) => (
              <li key={flag.id} className="text-[0.875rem] text-dash-ink">
                <span className="figure font-bold">{flag.key}</span> — {flag.says}
              </li>
            ))}
          </ul>
          {report.urgent.length > 6 && (
            <p className="mt-2 text-[0.8125rem] text-dash-muted">
              and {formatNumber(report.urgent.length - 6)} more below.
            </p>
          )}
          <p className="mt-3 border-t border-red-200 pt-3 text-[0.75rem] leading-relaxed text-dash-muted">
            These are arithmetic, not accusations. Each one names the place so it can be read
            against its sheet, and a data-entry slip on either side looks exactly like this until
            somebody checks.
          </p>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        {/* ---------------------------------------------------- the findings */}
        <Card
          id="findings"
          title="Where the two counts differ"
          subtitle="Ordered by what matters, not by size"
          padded={false}
        >
          <div className="p-5">
            {report.ready ? (
              <GapBoard report={report} />
            ) : (
              <div className="py-6 text-center">
                <p className="text-[0.9375rem] leading-relaxed text-dash-muted">
                  Nothing has been declared for this project yet, so there is nothing to compare our{" "}
                  {formatNumber(report.ourReturns)} return
                  {report.ourReturns === 1 ? "" : "s"} against.
                </p>
                <p className="mt-3 text-[0.875rem] leading-relaxed text-dash-muted">
                  {mayEnter
                    ? "As collation announces a ward, a local government or a state, enter what was announced and the comparison starts from that moment."
                    : "The situation room enters figures as collation announces them. The comparison starts from the first one."}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* ------------------------------------------------------- the entry */}
        <div className="space-y-6">
          {mayEnter && (
            <Card
              id="enter"
              title="Enter what was declared"
              subtitle="Upload a collation sheet, or paste the figures"
            >
              <DeclaredUpload />
            </Card>
          )}

          <DivergencePanel report={report} compact href="#findings" />

          {/* ── SAYING PLAINLY WHAT THIS PAGE WILL NOT DO ──────────────────
              Written down where somebody reading a finding can see it, rather
              than left as an assumption held by whoever built it. The most
              likely misuse of this screen is treating a difference as proof,
              and the second most likely is treating a thin comparison as a
              clean one. */}
          <Card title="How to read this">
            <ul className="space-y-3 text-[0.8125rem] leading-relaxed text-dash-muted">
              <li>
                <span className="font-bold text-dash-ink">Nothing here is an accusation.</span> A
                difference between two transcriptions of the same sheet is, far more often than
                not, somebody mistyping a figure at one end or the other.
              </li>
              <li>
                <span className="font-bold text-dash-ink">The two counts are never merged.</span>{" "}
                Averaging them, or letting one correct the other, would destroy the only thing a
                parallel count is for.
              </li>
              <li>
                <span className="font-bold text-dash-ink">
                  A place we hold thinly is not compared.
                </span>{" "}
                If our agents cover nine booths of a ward&rsquo;s twenty, our total is meant to be
                lower, and flagging that would turn every ward in the country red. Only figures that
                could not be true at any coverage are checked there.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </DashLayout>
  );
}
