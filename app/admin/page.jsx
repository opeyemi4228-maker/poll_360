import { AlertTriangle, Banknote, FileText, Inbox, KeyRound, ScrollText, ShieldCheck, Users } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, StatCard, Badge, Empty } from "@/components/dash/DashCard";
import { PartyBars, TrendArea } from "@/components/dash/Charts";
import CoverageDial from "@/components/dash/CoverageDial";
import IntegrityPanel from "@/components/dash/IntegrityPanel";
import IssueAccountForm from "@/components/dash/IssueAccountForm";
import PayAgentForm from "@/components/dash/PayAgentForm";
import LiveRefresh from "@/components/dash/LiveRefresh";
import Button from "@/components/ui/Button";
import { requireUser } from "@/lib/guard";
import { currentElection } from "@/lib/election-scope";
import { results, incidents, audit, accessRequests } from "@/lib/db";
import { integrityOf } from "@/lib/anomalies";
import { ledger } from "@/lib/ledger";
import { unseal } from "@/lib/crypto";
import { parties, others } from "@/lib/election2023";
import { register } from "@/lib/site";
import { formatNumber, formatShare } from "@/lib/utils";

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
  const tally = await results.tally(project?.id);
  const filed = await results.recent(200, project?.id);
  const feed = await incidents.recent(6, project?.id);
  const requests = await accessRequests.recent(5);
  const trail = await audit.recent(8);

  /* The chain is walked on every load. It is a few hundred hashes and it is
     the one check worth paying for on every page view: an administrator should
     never be looking at a ledger whose integrity has not just been proved. */
  const chain = await ledger.verify();
  const payments = await ledger.recent(6);

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
          subtitle="Newest first, with the arithmetic already checked"
          padded={false}
        >
          {filed.length === 0 ? (
            <div className="p-5">
              <Empty>
                Nothing filed yet. A return appears here within a second of a coordinator
                submitting it, with its figures already checked twice.
              </Empty>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead>
                  <tr className="border-b border-dash-line">
                    {["Unit", "Votes", "Accredited", "Filed", "Status"].map((head, index) => (
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
