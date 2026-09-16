import Link from "next/link";
import { AlertTriangle, Banknote, Inbox, KeyRound, ScanLine, ScrollText, ShieldCheck, UserRoundCheck, Users } from "lucide-react";

import SheetLedger from "@/components/dash/SheetLedger";
import RaceSwitcher from "@/components/dash/RaceSwitcher";
import { auditSheet } from "@/lib/results";
import DashLayout from "@/components/dash/DashLayout";
import ReadinessBanner from "@/components/dash/ReadinessBanner";
import { readiness } from "@/lib/readiness";
import { Card, StatCard, Badge, Empty } from "@/components/dash/DashCard";
import { Histogram, Meter, Ranked, Ring, Split, StateGrid } from "@/components/dash/SystemCharts";
import IntegrityPanel from "@/components/dash/IntegrityPanel";
import IssueAccountForm from "@/components/dash/IssueAccountForm";
import PayAgentForm from "@/components/dash/PayAgentForm";
import LiveRefresh from "@/components/dash/LiveRefresh";
import Button from "@/components/ui/Button";
import { requireUser } from "@/lib/guard";
import { currentElection, currentRace } from "@/lib/election-scope";
import { raceLabel, RACES } from "@/lib/races";
import { allPlaces, resolveTerritory } from "@/lib/constituencies";
import { describeTerritory } from "@/lib/territory";
import { results, audit, accessRequests, users, sheetReads } from "@/lib/db";
import { health, integrations } from "@/lib/system";
import { ROLES } from "@/lib/roles";
import { integrityOf } from "@/lib/anomalies";
import { agentCounts } from "@/lib/databank-agents";
import { ledger } from "@/lib/ledger";
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
  const [
    tally,
    filed,
    byRace,
    requests,
    requestsWaiting,
    activity,
    chain,
    payments,
    waiting,
    ready,
    reads,
    readScore,
    machine,
    wiring,
    byRole,
  ] = await Promise.all([
    results.tally(project?.id, race),
    results.recent(200, project?.id, race),
    project ? results.countByRace(project.id) : {},
    accessRequests.recent(5),
    /* The real figure, not the length of the five above — see the note on
       `waitingCount` in lib/db.js. A count taken off a capped list reports
       its own cap, and this one sits on the tile that decides whether
       anybody opens the queue. */
    accessRequests.waitingCount(),
    /* ── THE TRAIL AS A SHAPE, NOT AS EIGHT LINES ────────────────────────
       This was `audit.recent(8)`, rendered as a card of eight timestamps.
       Eight lines is not a record — the page that *is* the record lives at
       /admin/audit and pages through the whole thing — and it is not a
       summary either, because the question an overview should answer of a
       log is "was it busy, and when", which eight lines cannot show. The
       count is one query and the answer is a picture. */
    audit.activity(36),
    ledger.verify(),
    ledger.recent(6),
    /* Coordinators who have signed themselves up and are waiting to be let
       in. Asked for on every load of this page because it is the one screen
       that can act on them, and a queue nobody is shown is a queue nobody
       works. */
    /* Only the count here. The queue itself has its own page now — see the
       banner below — and fetching forty rows to render a number was work done
       on every load of the busiest screen in the product for nothing. */
    agentCounts().then((tally) => tally?.PENDING ?? 0),
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
    /* ── THE THREE THE OVERVIEW BECAME ABOUT ────────────────────────────
       The top of this page used to be a coverage dial, a party standings
       chart, a cumulative trend and an incident feed — which is, panel for
       panel, the situation room's command centre. Two screens computing the
       same four figures is two screens that can disagree about them, and the
       room is the one built to be watched all night on a wall.

       So the overview answers the question only this desk asks: is the thing
       doing the counting healthy. All three are cheap, none of them is drawn
       anywhere else, and they join the wait rather than adding round trips. */
    health(),
    integrations(),
    users.tally(),
  ]);

  /* The state, district and local government tables, for the account form
     below. Read off disk rather than queried, and cheap enough to do on every
     load of this page — see lib/constituencies.js for why it is not imported
     into the browser instead. */
  const places = allPlaces();

  const disputed = filed.filter((row) => row.status === "DISPUTED").length;
  const unverified = filed.filter((row) => row.status === "SUBMITTED").length;
  const verified = filed.filter((row) => row.status === "VERIFIED").length;

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
          {/* ── WITHOUT THIS, HALF THE COUNT WAS UNREACHABLE ────────────────
              Every screen here reads one position at a time, and this one had
              no way to change which. `currentRace` falls back to the project's
              own kind, so an administrator on a project created as
              presidential could not reach the governorship returns from this
              page at all — they were filed, stored and counted, and the only
              screen that could have shown them was pinned to another ballot
              paper with no control on it.

              The situation room and the WhatsApp desk have had this control
              all along, which is what made the gap easy to miss: the position
              was switchable everywhere somebody watches the count and nowhere
              somebody administers it. */}
          <RaceSwitcher
            race={race}
            races={RACES.map((row) => ({ id: row.id, label: row.label }))}
            filed={byRace}
          />
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

      {/* ═══════════════════════════════════════════ the machine, not the count
          ── WHAT USED TO BE HERE, AND WHY IT WENT ────────────────────────
          A coverage dial, three totals, a cumulative trend, a party
          standings chart and an incident feed. Every one of those is on the
          situation room's command centre, computed from the same rows — and
          the room is the surface built to carry them: it is watched all
          night, it refreshes on a timer, it drills, and it is where somebody
          is already looking when a figure moves.

          Two screens holding one set of figures is not redundancy, it is a
          second place for them to be wrong in. The one that had to go is the
          one whose reader was not asking the question: an administrator opens
          this page to find out whether the *product* is working, and was met
          with a results board that told them nothing about it.

          What replaces it is the question nobody else on this deployment can
          answer, in the form that answers it fastest. */}
      <div className="mb-6 grid gap-6 xl:grid-cols-[1fr_1.15fr]">
        <Card title="Fit to run an election" subtitle="Checked on this request, not asserted">
          <div className="flex flex-wrap items-center justify-around gap-6">
            <Ring
              label="Readiness"
              value={ready.checks.length - ready.failing.length}
              of={ready.checks.length}
              display={`${ready.checks.length - ready.failing.length}/${ready.checks.length}`}
              tone={ready.ready ? "good" : ready.blocking ? "alert" : "warn"}
              caption={
                ready.ready
                  ? "Every check passes."
                  : `${ready.failing.length} failing${ready.blocking ? ", one of them blocking" : ""}.`
              }
            />
            <Ring
              label="The record"
              value={chain.ok ? 1 : 0}
              of={1}
              display={chain.ok ? "OK" : "×"}
              tone={chain.ok ? "good" : "alert"}
              caption={
                chain.ok
                  ? `${formatNumber(chain.entries)} payment entries, unaltered.`
                  : `Hash chain broken at entry ${chain.at}.`
              }
            />
          </div>

          {/* The wiring, as a wall of dots. Seven integrations and their keys
              would be a table nobody reads on an overview; what somebody
              actually wants from this card is whether there is a red one. */}
          <div className="mt-6 border-t border-dash-line pt-5">
            <StateGrid
              label="What this deployment is wired to"
              cells={wiring.map((row) => ({
                label: row.name,
                state:
                  row.state === "on"
                    ? "set up"
                    : row.state === "partial"
                      ? "half set up — looks connected and cannot deliver"
                      : row.essential
                        ? "missing, and needed"
                        : "not in use",
                tone:
                  row.state === "on"
                    ? "good"
                    : row.state === "partial"
                      ? "warn"
                      : row.essential
                        ? "alert"
                        : "neutral",
              }))}
            />
            <Button href="/admin/integrations" variant="dashOutline" size="sm" className="mt-4">
              Integrations
            </Button>
          </div>
        </Card>

        <Card title="Is the machine well" subtitle="Timed and counted on this request">
          {/* ── THE READING, AGAINST THE LINE THAT DECIDES WHAT IT MEANS ──
              "342 ms" told an administrator who already knew what a good
              latency was precisely what they already knew. The bands are
              drawn now, so the answer is a position rather than a number to
              interpret — and the threshold is on the screen, where somebody
              can argue with it. */}
          <Meter
            label="Database round trip"
            value={machine.reachable ? machine.latency : null}
            unit="ms"
            over="no answer"
            bands={[
              { to: 250, label: "fast", tone: "good" },
              { to: 800, label: "usable", tone: "good" },
              { to: 1500, label: "slow", tone: "warn" },
              { to: 4000, label: "timing out", tone: "alert" },
            ]}
            caption={
              machine.reachable
                ? "One query, measured as this page was built."
                : "Nothing on any screen in the product is current."
            }
          />

          {machine.counts && (
            <div className="mt-6 border-t border-dash-line pt-5">
              <Split
                label="Every account on this deployment"
                segments={[
                  {
                    label: "can sign in",
                    tone: "good",
                    value: Object.values(byRole).reduce((sum, row) => sum + row.active, 0),
                  },
                  {
                    label: "waiting",
                    tone: "warn",
                    value: Object.values(byRole).reduce((sum, row) => sum + row.pending, 0),
                  },
                  {
                    label: "shut off",
                    tone: "neutral",
                    value: Object.values(byRole).reduce((sum, row) => sum + row.disabled, 0),
                  },
                ]}
                caption={`${formatNumber(machine.counts.liveSessions)} session${
                  machine.counts.liveSessions === 1 ? "" : "s"
                } open right now.`}
              />

              <div className="mt-5 border-t border-dash-line pt-5">
                <Ranked
                  label="Keys issued, by role"
                  caption="One ink, deepening with the count — these are one kind of thing at six sizes, not six kinds of thing."
                  rows={Object.entries(byRole).map(([key, count]) => ({
                    label: ROLES[key]?.label ?? key,
                    value: count.total,
                    note: count.pending ? `${count.pending} waiting` : undefined,
                  }))}
                />
              </div>
            </div>
          )}

          <Button href="/admin/health" variant="dashOutline" size="sm" className="mt-5">
            System health
          </Button>
        </Card>
      </div>

      {/* ── THE WORK THIS DESK ACTUALLY HOLDS ────────────────────────────
          Two of the three totals that used to sit at the top of this page
          survive, and they are the two that were never the room's: a return
          awaiting a check and a return thrown out are both *this desk's*
          business, and both are the reason somebody opened the page. "Votes
          counted" was the room's, and has gone back to it. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
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
        <StatCard
          icon={Inbox}
          label="Waiting to be let in"
          value={formatNumber(waiting + requestsWaiting)}
          tone={waiting + requestsWaiting ? "alert" : "default"}
          context={`${formatNumber(waiting)} agents, ${formatNumber(requestsWaiting)} access requests`}
        />
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
          <IssueAccountForm
            places={places}
            races={RACES.map((row) => ({ id: row.id, label: row.label }))}
          />
        </Card>
      </div>

      {/* ------------------------------------------------------------ lower */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        {/* Placed above the queues on purpose. An administrator opening this
            page should meet what cannot be true before they meet what is
            merely waiting. */}
        <IntegrityPanel report={integrity} />

        {/* ── A PREVIEW, AND A DOOR ────────────────────────────────────────
            This card used to be the whole of the access queue: five rows that
            could be read and not acted on, while the form that actually
            issues an account sat elsewhere and had never heard of them. The
            queue is a page now. What stays here is the count, the newest few,
            and what each one asked to cover — because the ground is the half
            of a request that decides whether it is urgent. */}
        <Card
          title="Access requests"
          subtitle={requests.length ? "Newest first. The queue is at /admin/requests." : undefined}
          action={<Inbox size={16} className="text-dash-muted" />}
        >
          {requests.length === 0 ? (
            <Empty>Nothing yet.</Empty>
          ) : (
            <>
              <ul className="space-y-4">
                {requests.map((request) => {
                  const place = request.territory ? resolveTerritory(request.territory) : null;

                  return (
                    <li key={request.id}>
                      <p className="text-[0.875rem] font-bold text-dash-ink">{request.organisation}</p>
                      <p className="mt-0.5 text-[0.8125rem] wrap-break-word text-dash-muted">
                        {request.name} · {request.email}
                        {request.units ? ` · ${formatNumber(request.units)} booths` : ""}
                      </p>
                      {place && (
                        <p className="mt-0.5 text-[0.8125rem] text-dash-ink">
                          {raceLabel(request.race)} · {describeTerritory(place)}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>

              <Button href="/admin/requests" variant="dashOutline" size="md" className="mt-5">
                Work the queue
              </Button>
            </>
          )}
        </Card>

        {/* ── THE TRAIL AS A SHAPE, WITH THE RECORD ONE CLICK AWAY ───────
            This was eight timestamps in a list. The page that holds the
            actual record is /admin/audit — it filters by action and pages
            through every line ever written — so eight lines here was neither
            the record nor a summary of it, just the newest sliver of
            something better held elsewhere.

            What an overview can add, and the paging screen cannot, is the
            shape: thirty-six hours of it in one row of bars, where a dead
            hour between two busy ones is visible as a dead hour. That is
            what a broken webhook looks like, and no page of a log shows it. */}
        <Card
          id="audit"
          title="Activity"
          subtitle="Every act the product recorded about itself, by the hour"
          action={<ScrollText size={16} className="text-dash-muted" />}
        >
          <Histogram
            buckets={activity}
            label="Last 36 hours"
            caption="Lagos time"
            height={72}
          />

          <p className="mt-4 text-[0.8125rem] text-dash-muted">
            {formatNumber(activity.reduce((sum, row) => sum + row.value, 0))} lines written in that
            window. Lines are added and never changed or removed.
          </p>

          <Button href="/admin/audit" variant="dashOutline" size="sm" className="mt-4">
            Read the trail
          </Button>
        </Card>
      </div>
    </DashLayout>
  );
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
