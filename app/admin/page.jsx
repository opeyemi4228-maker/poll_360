import Link from "next/link";
import { AlertTriangle, Banknote, FileText, Inbox, KeyRound, ScanLine, ScrollText, ShieldCheck, UserRoundCheck, Users } from "lucide-react";

import SheetLedger from "@/components/dash/SheetLedger";
import { auditSheet } from "@/lib/results";
import DashLayout from "@/components/dash/DashLayout";
import ReadinessBanner from "@/components/dash/ReadinessBanner";
import { readiness } from "@/lib/readiness";
import { Card, StatCard, Badge, Empty } from "@/components/dash/DashCard";
import { PartyBars, TrendArea } from "@/components/dash/Charts";
import CoverageDial from "@/components/dash/CoverageDial";
import IntegrityPanel from "@/components/dash/IntegrityPanel";
import IssueAccountForm from "@/components/dash/IssueAccountForm";
import PayAgentForm from "@/components/dash/PayAgentForm";
import LiveRefresh from "@/components/dash/LiveRefresh";
import Button from "@/components/ui/Button";
import { requireUser } from "@/lib/guard";
import { currentElection, currentRace } from "@/lib/election-scope";
import { raceLabel } from "@/lib/races";
import { results, incidents, audit, accessRequests, users, sheetReads } from "@/lib/db";
import { integrityOf } from "@/lib/anomalies";
import { coordinators } from "@/lib/coordinators";
import { ledger } from "@/lib/ledger";
import { unseal } from "@/lib/crypto";
import { parties, others } from "@/lib/election2023";
import { register } from "@/lib/site";
import { formatNumber, formatShare } from "@/lib/utils";

/* What a reader is, said in terms of what its readings are worth to somebody
   deciding whether to trust them. See components/dash/WhatsAppDesk.jsx, which
   names them the same way for the same reason. */
const READER_LABEL = {
  claude: "Handwriting",
  google: "Hosted",
  local: "On server",
};

export const metadata = { title: "Overview", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The super administrator's overview.
 *
 * Four questions, in the order they are actually asked on the night: how much
 * is in, is any of it wrong, who is asking to be let in, and who did what.
 * Everything else is one click away in the rail.
 */
export default async function AdminPage() {
  const user = await requireUser("/admin");

  /* Every figure on this page belongs to one project. The id is threaded
     explicitly rather than defaulted, so a page that forgets fails loudly
     instead of quietly totalling every election at once. */
  const project = await currentElection();

  /* Which of the day's contests this screen is reading. A project holds
     several and they are never summed, so the position is as much a part of
     "which figures are these" as the project is. */
  const race = await currentRace(project);

  /* ── SEVEN QUESTIONS, ASKED AT ONCE ─────────────────────────────────────
     Only the project has to be known first, because four of these are scoped
     to it. The rest have nothing to do with each other, and awaited one after
     another they cost the sum of seven round trips to a database that is no
     longer on this machine. Asked together they cost the slowest one.

     The chain is walked on every load. It is a few hundred hashes and it is
     the one check worth paying for on every page view: an administrator
     should never be looking at a ledger whose integrity has not just been
     proved. */
  const [tally, filed, byRace, feed, requests, trail, chain, payments, waiting, ready, reads, readScore] = await Promise.all([
    results.tally(project?.id, race),
    results.recent(200, project?.id, race),
    project ? results.countByRace(project.id) : {},
    incidents.recent(6, project?.id),
    accessRequests.recent(5),
    audit.recent(8),
    ledger.verify(),
    ledger.recent(6),
    /* Coordinators who have signed themselves up and are waiting to be let
       in. Asked for on every load of this page because it is the one screen
       that can act on them, and a queue nobody is shown is a queue nobody
       works. */
    /* Only the count here. The queue itself has its own page now — see the
       banner below — and fetching forty rows to render a number was work done
       on every load of the busiest screen in the product for nothing. */
    coordinators.waitingCount(),
    /* Whether this deployment is fit to hold a real election. Asked with the
       rest rather than after them: it is a couple of counts, and it is the
       one answer on this page that nothing else on the page can reveal. */
    readiness(),
    /* What the sheet readers have made of the photographs, and how they are
       scoring. Kept on this screen rather than only on the WhatsApp desk
       because it is now fed from the filing form as well, and because the
       question it answers — is the machine reading these sheets correctly —
       is an administrator's question, not a channel operator's. */
    project ? sheetReads.recent(project.id, 12) : [],
    project ? sheetReads.summary(project.id) : {},
  ]);

  const counted = Object.values(tally.totals).reduce((a, b) => a + b, 0);
  const disputed = filed.filter((row) => row.status === "DISPUTED").length;
  const unverified = filed.filter((row) => row.status === "SUBMITTED").length;
  const verified = filed.filter((row) => row.status === "VERIFIED").length;

  const standings = [...parties, others]
    .map((party) => ({ id: party.id, name: party.name, votes: tally.totals[party.id] ?? 0 }))
    .sort((a, b) => (a.id === "OTH" ? 1 : b.id === "OTH" ? -1 : b.votes - a.votes));

  /* Cumulative booths over the evening, from the returns themselves. */
  const trend = buildTrend(filed);

  /* ── SCREENING RUNS ON EVERY LOAD, NOT ON DEMAND ────────────────────────
     The screening was written, tested and then never put on a screen, which
     made it worth exactly nothing: a check nobody sees is a check nobody acts
     on. It runs over every return the administrator is already looking at, so
     there is no separate page to remember to visit and no moment where the
     figures are on screen and the doubts about them are not. */
  const integrity = integrityOf(filed);

  return (
    <DashLayout
      user={user}
      screen="admin"
      title="Overview"
      lead="Every unit, every room, every key, and the two actions nobody else holds: issuing credentials, and marking a return checked."
      actions={
        <>
          <LiveRefresh seconds={20} label="Live" />
          <Button href="/broadcast" variant="dashOutline" size="sm">
            Broadcast desk
          </Button>
        </>
      }
    >
      {/* ── COORDINATORS WAITING TO BE LET IN ─────────────────────────────
          A banner, not the queue. The queue used to live inline here and
          vanish entirely when it was empty, which meant an administrator who
          had never had a pending sign-up had never seen it and did not know
          where to look when the first one arrived. It has its own page now,
          always reachable from the rail; this is the thing that shouts when
          somebody is actually waiting, because an approval queue nobody works
          is an agent standing at a booth on polling morning unable to file. */}
      {/* ── THE FIRST THING ON THE PAGE, DELIBERATELY ─────────────────────
          Everything else on this dashboard is about running the election.
          This is about whether the deployment is fit to be trusted with one,
          and it is the only question here whose wrong answer is silent: an
          account with a published password looks exactly like a real one from
          every screen in the product. It sits above the approval queue because
          an unlocked door outranks a queue. */}
      <ReadinessBanner state={ready} />

      {waiting > 0 && (
        <div className="mb-6">
          <Link
            href="/admin/coordinators"
            className="flex flex-wrap items-center gap-3 rounded-dash border-2 border-dash-ink bg-dash-card px-5 py-4 transition-colors hover:bg-dash-bg"
          >
            <UserRoundCheck size={18} strokeWidth={2.25} className="shrink-0 text-dash-ink" />
            <span className="min-w-0">
              <span className="block font-display text-[0.9375rem] font-extrabold text-dash-ink">
                {waiting} coordinator{waiting === 1 ? "" : "s"} waiting to be approved
              </span>
              <span className="block text-[0.8125rem] text-dash-muted">
                Signed up themselves. They can file nothing until you approve them.
              </span>
            </span>
            <span className="ml-auto shrink-0 text-[0.8125rem] font-bold text-dash-ink">
              Open the queue →
            </span>
          </Link>
        </div>
      )}

      {/* ------------------------------------------------------------- hero
          The dial is the largest object on the page on purpose: it is the
          product's own mark doing its job, and it makes the central rule
          physical, you cannot read the count without also reading how much
          of the country it came from, because they are one object. */}
      <div className="grid gap-6 xl:grid-cols-[20rem_1fr]">
        <Card title="Coverage" subtitle="Filed, and checked, against the whole register">
          <CoverageDial
            reported={tally.units}
            total={register.pollingUnits}
            verified={verified}
          />
        </Card>

        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={FileText}
              label="Votes counted"
              value={formatNumber(counted)}
              context={`From ${formatNumber(tally.units)} booths`}
            />
            <StatCard
              icon={Users}
              label="Awaiting a check"
              value={formatNumber(unverified)}
              context={`${formatNumber(verified)} already verified`}
            />
            <StatCard
              icon={AlertTriangle}
              label="Disputed"
              value={formatNumber(disputed)}
              tone={disputed ? "alert" : "default"}
              context="In the table, out of every sum"
            />
          </div>

          <Card title="Returns arriving" subtitle="Cumulative booths filed across the evening">
            <TrendArea points={trend} />
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Standings" subtitle="From our agents' returns only, never the declared figure">
          {counted === 0 ? (
            <Empty>
              No votes counted yet. The moment a coordinator files from a booth, it appears here.
            </Empty>
          ) : (
            <PartyBars rows={standings} total={counted} />
          )}
        </Card>

        <Card title="Incidents" subtitle="Anything that is not a number" action={<AlertTriangle size={16} className="shrink-0 text-dash-muted" />}>
          {feed.length === 0 ? (
            <Empty>Nothing reported. This is the panel you want to stay empty.</Empty>
          ) : (
            <ul className="space-y-4">
              {feed.map((incident) => (
                <li key={incident.id} className="border-l-2 border-dash-line pl-3">
                  <div className="flex items-center gap-2">
                    <Badge
                      tone={
                        incident.severity === "CRITICAL"
                          ? "alert"
                          : incident.severity === "SERIOUS"
                            ? "warn"
                            : "neutral"
                      }
                    >
                      {incident.severity}
                    </Badge>
                    <span className="figure text-[0.75rem] text-dash-muted">
                      {incident.unitCode}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[0.875rem] font-semibold text-dash-ink">
                    {incident.kind}
                  </p>
                  {incident.detailSealed && (
                    <p className="mt-1 text-[0.8125rem] leading-relaxed text-dash-muted">
                      {unseal(incident.detailSealed)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------------- returns */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card
          id="returns"
          title="Returns as they land"
          /* The position is named rather than assumed. This screen shows one
             contest at a time and a reader who does not know which is reading
             a coverage figure that means something else entirely. */
          subtitle={`${raceLabel(race)} · newest first, with the arithmetic already checked`}
          padded={false}
        >
          {filed.length === 0 ? (
            <div className="p-5">
              <Empty>
                Nothing filed yet for {raceLabel(race).toLowerCase()}. A return appears here
                within a second of a coordinator submitting it, with its figures already
                checked twice.
              </Empty>

              {/* ── A RETURN FILED FOR ANOTHER POSITION IS NOT A MISSING ONE ──
                  Every screen here reads one position at a time, which is
                  right — five ballot papers are five counts and adding them
                  together describes nothing. But it means a return filed
                  against the governorship while this screen is showing the
                  presidential is stored, counted, and completely invisible,
                  and the screen said "nothing filed yet" as though the upload
                  had failed. Somebody then files it again.

                  So an empty list says where the returns actually are. */}
              {Object.entries(byRace).filter(([, n]) => n > 0).length > 0 && (
                <p className="mt-4 border-t border-dash-line pt-4 text-[0.875rem] leading-relaxed text-dash-muted">
                  <span className="font-semibold text-dash-ink">
                    This project is not empty.
                  </span>{" "}
                  {Object.entries(byRace)
                    .filter(([, n]) => n > 0)
                    .map(([id, n]) => `${n} ${raceLabel(id).toLowerCase()}`)
                    .join(", ")}{" "}
                  {Object.values(byRace).reduce((a, b) => a + b, 0) === 1 ? "return is" : "returns are"}{" "}
                  already in. Switch position at the top of this page to see them.
                </p>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead>
                  <tr className="border-b border-dash-line">
                    {["Unit", "Votes", "Accredited", "Sheet", "Filed", "Status"].map((head, index) => (
                      <th
                        key={head}
                        className={`px-5 py-3 text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase ${
                          index > 0 ? "text-right" : ""
                        }`}
                      >
                        {head}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filed.slice(0, 10).map((row) => (
                    <tr key={row.id} className="border-b border-dash-line last:border-0">
                      <td className="figure px-5 py-3 text-[0.8125rem] font-bold text-dash-ink">
                        {row.unitCode}
                      </td>
                      <td className="figure px-5 py-3 text-right text-[0.8125rem] text-dash-ink">
                        {formatNumber(Object.values(row.votes).reduce((a, b) => a + b, 0))}
                      </td>
                      <td className="figure px-5 py-3 text-right text-[0.8125rem] text-dash-muted">
                        {formatNumber(row.accredited)}
                      </td>
                      {/* ── WHAT THE PAPER ITSELF SAYS ────────────────────
                          Three words at most, because this is a scanning
                          column in a list somebody reads at speed. A sheet
                          whose boxes were never captured says so rather than
                          showing a tick it has not earned — "unchecked" and
                          "checked and fine" must not look the same. */}
                      <td className="px-5 py-3 text-right text-[0.75rem]">
                        <SheetCell row={row} />
                      </td>
                      <td className="figure px-5 py-3 text-right text-[0.8125rem] text-dash-muted">
                        {row.submittedAt.toISOString().slice(11, 16)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Badge
                          tone={
                            row.status === "VERIFIED"
                              ? "good"
                              : row.status === "DISPUTED"
                                ? "alert"
                                : "neutral"
                          }
                        >
                          {row.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* ── THE SHEETS, READ BACK AGAINST THEMSELVES ───────────────────
            Above this card the returns are figures. Here they are pieces of
            paper: eight numbered boxes that have to account for every ballot
            issued to the booth, a serial that belongs to one sheet and no
            other, and a certification somebody signed. Nothing here changes a
            total — it decides how much weight to put on one. */}
        <Card
          id="sheets"
          title="What the sheets say about themselves"
          subtitle="Form EC8A, checked against its own arithmetic"
          padded={false}
        >
          <SheetLedger rows={filed} />
        </Card>

        {/* ── WHAT THE MACHINE MADE OF THE PHOTOGRAPHS ────────────────────
            Every reading, from the filing form and from WhatsApp alike, kept
            beside what the human confirmed. This is evidence about the
            reader rather than about the count: nothing here has been filed,
            and the figures that were filed are in the returns table above.

            It is on this screen because the decision it informs is an
            administrator's — whether the reader in use is good enough for the
            forms this election actually produces, and whether paying for a
            better one is buying anything. */}
        <Card
          id="readings"
          title="What the reader made of the sheets"
          subtitle="Proposed to an agent, never filed — and what they did with it"
          action={<ScanLine size={16} className="shrink-0 text-dash-muted" />}
          padded={false}
        >
          {reads.length === 0 ? (
            <div className="p-5">
              <Empty>
                No sheet has been read yet. When an agent photographs a result sheet, the figures
                are read off it and offered for them to check — never filed on their behalf.
              </Empty>
            </div>
          ) : (
            <>
              <div className="border-b border-dash-line px-5 py-3">
                <p className="text-[0.8125rem] text-dash-muted">
                  {formatNumber(readScore.total ?? 0)} read · {formatNumber(readScore.accepted ?? 0)}{" "}
                  went on to be filed
                  {readScore.confidence != null &&
                    ` · ${formatShare((readScore.confidence ?? 0) * 100)} average legibility`}
                </p>
                {(readScore.byReader ?? []).length > 0 && (
                  <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-dash-muted">
                    {readScore.byReader.map((entry) => (
                      <span key={entry.reader} className="figure">
                        {READER_LABEL[entry.reader] ?? entry.reader}{" "}
                        <span className="font-bold text-dash-ink">{formatNumber(entry.total)}</span>
                        {entry.total > 0 && (
                          <> · {formatShare((entry.accepted / entry.total) * 100)} accepted</>
                        )}
                      </span>
                    ))}
                  </p>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[42rem] text-left text-[0.8125rem]">
                  <thead>
                    <tr className="border-b border-dash-line">
                      {["Unit", "Registered", "Accredited", "Rejected", "Votes read", "Reader", "Outcome"].map(
                        (head) => (
                          <th
                            key={head}
                            className="px-4 py-2 text-[0.6875rem] font-bold tracking-[0.08em] text-dash-muted uppercase"
                          >
                            {head}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dash-line">
                    {reads.map((row) => (
                      <tr key={row.id} className="hover:bg-dash-bg">
                        <td className="figure px-4 py-2 font-bold text-dash-ink">
                          {row.unitCode ?? "unknown"}
                        </td>
                        {/* A dash, never a zero. The reader not finding a
                            figure and the figure being zero are different
                            facts and only one of them is a measurement. */}
                        <td className="figure px-4 py-2 tabular-nums text-dash-ink">
                          {row.parsed?.registered == null ? "—" : formatNumber(row.parsed.registered)}
                        </td>
                        <td className="figure px-4 py-2 tabular-nums text-dash-ink">
                          {row.parsed?.accredited == null ? "—" : formatNumber(row.parsed.accredited)}
                        </td>
                        <td className="figure px-4 py-2 tabular-nums text-dash-muted">
                          {row.parsed?.rejected == null ? "—" : formatNumber(row.parsed.rejected)}
                        </td>
                        <td className="figure px-4 py-2 tabular-nums text-dash-muted">
                          {(row.parsed?.votes ?? []).join(", ") || "none"}
                          {row.parsed?.others ? ` (+${formatNumber(row.parsed.others)} other)` : ""}
                        </td>
                        <td className="px-4 py-2 text-dash-muted">
                          {READER_LABEL[row.reader] ?? "—"}
                          <span className="block text-[0.6875rem]">
                            {row.source === "APP" ? "filing form" : "WhatsApp"}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <Badge tone={row.accepted ? "good" : row.parsed?.usable ? "neutral" : "warn"}>
                            {row.accepted
                              ? "Confirmed and filed"
                              : row.parsed?.usable
                                ? "Waiting on the agent"
                                : "Did not add up"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        <Card
          id="payments"
          title="Pay an agent"
          subtitle="The only door money comes through"
          action={<Banknote size={16} className="shrink-0 text-dash-muted" />}
          className="xl:col-start-2"
        >
          <PayAgentForm />

          <div className="mt-6 border-t border-dash-line pt-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
                Ledger
              </p>
              <span
                className={`flex items-center gap-1.5 text-[0.75rem] font-semibold ${
                  chain.ok ? "text-emerald-700" : "text-red-600"
                }`}
              >
                <ShieldCheck size={14} strokeWidth={2.5} />
                {chain.ok
                  ? `${formatNumber(chain.entries)} entries, unaltered`
                  : `Broken at entry ${chain.at}`}
              </span>
            </div>

            {payments.length === 0 ? (
              <p className="mt-3 text-[0.8125rem] text-dash-muted">Nothing paid yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {payments.map((entry) => (
                  <li key={entry.id} className="flex items-baseline gap-3 text-[0.8125rem]">
                    <span className="figure w-24 shrink-0 text-dash-muted">{entry.reference}</span>
                    <span className="truncate text-dash-ink">{entry.kind.toLowerCase().replace(/_/g, " ")}</span>
                    <span className="figure ml-auto shrink-0 font-bold text-dash-ink">
                      ₦{(entry.amount / 100).toLocaleString("en-NG")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card
          id="accounts"
          title="Issue an account"
          subtitle="The password is shown once and never stored in readable form"
          action={<KeyRound size={16} className="shrink-0 text-dash-muted" />}
        >
          <IssueAccountForm />
        </Card>
      </div>

      {/* ------------------------------------------------------------ lower */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Placed above the queues on purpose. An administrator opening this
            page should meet what cannot be true before they meet what is
            merely waiting. */}
        <IntegrityPanel report={integrity} />

        <Card title="Access requests" action={<Inbox size={16} className="text-dash-muted" />}>
          {requests.length === 0 ? (
            <Empty>Nothing yet.</Empty>
          ) : (
            <ul className="space-y-4">
              {requests.map((request) => (
                <li key={request.id}>
                  <p className="text-[0.875rem] font-bold text-dash-ink">{request.organisation}</p>
                  <p className="mt-0.5 text-[0.8125rem] wrap-break-word text-dash-muted">
                    {request.name} · {request.email}
                    {request.units ? ` · ${formatNumber(request.units)} booths` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          id="audit"
          title="Audit trail"
          subtitle="Append-only"
          action={<ScrollText size={16} className="text-dash-muted" />}
        >
          <ul className="space-y-2.5">
            {trail.map((entry) => (
              <li key={entry.id} className="flex items-baseline gap-3 text-[0.8125rem]">
                <span className="figure w-11 shrink-0 text-dash-muted">
                  {entry.createdAt.toISOString().slice(11, 16)}
                </span>
                <span className="figure font-semibold text-dash-ink">{entry.action}</span>
                <span className="truncate text-dash-muted">{entry.subject}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </DashLayout>
  );
}

/**
 * Cumulative booths over the evening, bucketed by the hour a return was filed.
 *
 * Derived from the returns rather than stored: a separate counter would be a
 * second version of the truth, and the moment it disagreed with the table
 * nobody would know which to believe.
 */

function buildTrend(rows) {
  if (rows.length < 2) return [];

  const ordered = [...rows].sort((a, b) => a.submittedAt - b.submittedAt);
  const buckets = new Map();

  for (const row of ordered) {
    const hour = row.submittedAt.toISOString().slice(0, 13);
    buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
  }

  let running = 0;
  return [...buckets.entries()].map(([hour, count]) => {
    running += count;
    return { label: `${hour.slice(11)}:00`, value: running };
  });
}

/**
 * What Form EC8A says about itself, in a column three words wide.
 *
 * Four states, and the fourth is the one that matters most: a return whose
 * boxes were never captured has not been checked, and must not be drawn the
 * same as one that was checked and passed. A tick nobody earned is worse than
 * no tick, because it is the tick a desk stops looking behind.
 */
function SheetCell({ row }) {
  const audit = auditSheet(row);
  const captured =
    row.ballotsIssued !== null ||
    row.unusedBallots !== null ||
    row.usedBallots !== null ||
    row.statedValid !== null;

  if (row.contested === true) {
    return <span className="font-bold text-red-600">Contested</span>;
  }
  if (!audit.balances) {
    return (
      <span className="font-bold text-amber-700">
        {audit.culprit ? `Box ${audit.culprit.replace("#", "")} off` : "Does not add up"}
      </span>
    );
  }
  if (!captured) return <span className="text-dash-muted">Not captured</span>;
  return <span className="font-semibold text-emerald-700">Adds up</span>;
}
