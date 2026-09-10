import { Activity, HeartPulse, ShieldCheck, TriangleAlert } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Field, Since, requestClock } from "@/components/dash/SystemBits";
import { Meter, Ranked, Recency, Ring } from "@/components/dash/SystemCharts";
import LiveRefresh from "@/components/dash/LiveRefresh";
import Button from "@/components/ui/Button";
import { requireCapability } from "@/lib/guard";
import { health } from "@/lib/system";
import { readiness } from "@/lib/readiness";
import { ledger } from "@/lib/ledger";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "System health", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Is the machine well?
 *
 * ── THREE ANSWERS, NOT ONE GREEN DOT ───────────────────────────────────────
 * A single up/down light is the least useful thing a status page can show,
 * because the failure that actually happens on election night is never
 * "down". It is "slow enough that a page times out and an agent files the
 * same return three times", or "up, and nothing has arrived for forty
 * minutes", or "up, and the payment ledger no longer hashes". Those are three
 * separate questions and they are asked separately here:
 *
 *   can we reach it, and how fast   — timed on this request, in milliseconds
 *   is anything still happening     — the newest row in each table
 *   is what we hold still intact    — the ledger's hash chain, walked now
 *
 * ── AND IT IS THE SAME CHECKS THE OVERVIEW SHOUTS ABOUT ────────────────────
 * The readiness checks are not duplicated here, they are the same function
 * the banner on the overview calls. A health page with its own private idea
 * of what "ready" means is a second version of the truth, and the first time
 * the two disagree nobody knows which to believe.
 */
export default async function HealthPage() {
  const admin = await requireCapability("system:read", "/admin/health");

  /* The chain is walked on this request rather than cached. It is a few
     hundred hashes, and a proof of integrity that was true ten minutes ago is
     not the thing anybody came to this page for. */
  const [state, ready, chain] = await Promise.all([health(), readiness(), ledger.verify()]);

  const failing = ready.failing.length;

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="System health"
      lead="Measured on this request: whether the database answers and how quickly, what has happened lately, and whether the record still proves itself."
      actions={<LiveRefresh seconds={30} label="Live" />}
    >
      {/* ── THREE QUESTIONS, THREE PICTURES ──────────────────────────────
          These were four figures in a strip: "342 ms", "7", "intact",
          "clear". Every one is correct and every one has to be *read* and
          then interpreted — and the person on this page at 2am is trying to
          find out whether anything is wrong, which is the one thing a strip
          of correct figures is slowest at.

          The latency is a position on a scale with the thresholds drawn on
          it, so "is 342 fine?" stops being a question only somebody who
          already knows the answer can answer. The other two are rings,
          because each is a single share that is the headline of its own
          card and has to be readable across a room. */}
      <div className="mb-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Card title="Can we reach it, and how fast" subtitle="Timed on this request">
          <Meter
            label="Database round trip"
            value={state.reachable ? state.latency : null}
            unit="ms"
            over="no answer"
            bands={[
              { to: 250, label: "fast", tone: "good" },
              { to: 800, label: "usable", tone: "good" },
              { to: 1500, label: "slow", tone: "warn" },
              { to: 4000, label: "timing out", tone: "alert" },
            ]}
            caption={
              state.reachable
                ? "One query, measured as this page was built. Past 1,500 ms pages begin to time out and agents file the same return twice."
                : "Nothing on any screen in the product is current."
            }
          />

          {state.counts && (
            <div className="mt-6 border-t border-dash-line pt-5">
              <p className="figure text-[1.75rem] leading-none font-bold text-dash-ink">
                {formatNumber(state.counts.liveSessions)}
              </p>
              <p className="mt-1.5 text-[0.8125rem] text-dash-muted">
                session{state.counts.liveSessions === 1 ? "" : "s"} open right now — accounts
                signed in whose session has not expired.
              </p>
            </div>
          )}
        </Card>

        <Card title="Is what we hold still intact" subtitle="Walked now, not cached">
          <div className="flex flex-wrap items-start justify-around gap-6">
            <Ring
              label="Readiness"
              value={ready.checks.length - failing}
              of={ready.checks.length}
              display={`${ready.checks.length - failing}/${ready.checks.length}`}
              tone={failing === 0 ? "good" : ready.blocking ? "alert" : "warn"}
              size={112}
              caption={failing === 0 ? "Every check passes." : "checks failing"}
            />
            <Ring
              label="The record"
              value={chain.ok ? 1 : 0}
              of={1}
              display={chain.ok ? "OK" : "×"}
              tone={chain.ok ? "good" : "alert"}
              size={112}
              caption={
                chain.ok
                  ? `${formatNumber(chain.entries)} entries, unaltered`
                  : `broken at entry ${chain.at}`
              }
            />
          </div>
        </Card>
      </div>

      {!state.reachable && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-dash border-2 border-red-300 bg-red-50 px-5 py-4">
          <TriangleAlert size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-red-700" />
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-extrabold text-red-900">
              The database did not answer
            </p>
            <p className="mt-0.5 text-[0.8125rem] wrap-break-word text-red-900">
              {state.complaint} Every figure on every other screen is now either cached or absent.
              Nothing filed during this period is lost — an agent&rsquo;s phone holds a return until it
              is acknowledged — but nothing is arriving either.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── WHAT THE PRODUCT IS CARRYING ─────────────────────────────── */}
        <Card
          title="What is being held"
          subtitle="Across every project on this deployment"
          action={<Activity size={16} className="shrink-0 text-dash-muted" />}
        >
          {!state.counts ? (
            <Empty>Could not be counted — the database did not answer.</Empty>
          ) : (
            <>
              {/* ── EIGHT FIGURES, RANKED, IN ONE INK ────────────────────
                  This was eight labelled rows. Read down, they answer "how
                  many photographs are there" one at a time and never answer
                  the question somebody actually opened the card for, which is
                  "what is this deployment mostly full of" — a comparison the
                  list's alphabetical-ish order actively hides.

                  One hue, deepening with the count, because these are one
                  kind of thing at eight sizes. Eight colours would say they
                  were eight kinds of thing, and the ordering would stop
                  surviving a greyscale print. */}
              <Ranked
                rows={[
                  { label: "Returns filed", value: state.counts.results },
                  { label: "Audit lines", value: state.counts.audit },
                  { label: "WhatsApp messages", value: state.counts.messages },
                  {
                    label: "Photographs",
                    value: state.counts.media,
                    note: megabytes(state.counts.mediaBytes),
                  },
                  { label: "Incidents", value: state.counts.incidents },
                  { label: "Coordinators", value: state.counts.coordinators },
                  { label: "Accounts", value: state.counts.users },
                  { label: "Projects", value: state.counts.elections },
                ]}
                caption="Photographs are the only thing here that grows without bound, and they are held in the database rather than in object storage — a deliberate trade, and that figure is what decides when it has to stop being one."
              />
            </>
          )}
        </Card>

        {/* ── IS ANYTHING STILL HAPPENING ──────────────────────────────────
            The question a quiet screen cannot answer. A count with nothing
            arriving looks identical to a count that has finished, and the
            difference between them is whether the phones are working. */}
        <Card
          title="Last sign of life"
          subtitle="A quiet night and a broken pipe look the same until you check this"
          action={<HeartPulse size={16} className="shrink-0 text-dash-muted" />}
        >
          {state.freshness.length === 0 ? (
            <Empty>Could not be checked — the database did not answer.</Empty>
          ) : (
            <>
              {/* ── FIVE "AGO"s WERE THE WORST THING ON THIS CONSOLE ─────
                  "4 minutes ago", "2 hours ago", "31 August, 19:41",
                  "never". Three different units, four separate arithmetic
                  problems, and the question actually being asked of them —
                  is anything still happening — is a comparison the list
                  hides. On one axis it is the *pattern* that answers: a
                  cluster on the right is a live night, a cluster on the left
                  is a pipe that broke some time ago, and one lonely dot far
                  from the others is the thing to go and look at. */}
              <Recency
                now={requestClock()}
                rows={state.freshness.map((row) => ({ label: row.label, at: row.at }))}
              />

              {/* The words stay underneath. The picture answers "is anything
                  happening"; somebody reconciling an incident against a
                  broadcast needs the actual time, and a dot cannot give it. */}
              <dl className="mt-5 border-t border-dash-line pt-4">
                {state.freshness.map((row) => (
                  <Field key={row.label} label={row.label}>
                    <Since at={row.at} never="has never happened" />
                  </Field>
                ))}
              </dl>
            </>
          )}
        </Card>
      </div>

      {/* ── FIT TO RUN A REAL ELECTION ───────────────────────────────────
          The same checks the overview banner runs, rendered in full. The
          banner shouts; this is where somebody reads what it was shouting
          about and what to do. */}
      <Card
        className="mt-6"
        title="Fit to run a real election"
        subtitle={
          ready.ready
            ? "Every check passes."
            : "These are the things that are wrong and are not visible from any other screen."
        }
        action={
          ready.ready ? (
            <Badge tone="good">Clear</Badge>
          ) : ready.blocking ? (
            <Badge tone="alert">Blocking</Badge>
          ) : (
            <Badge tone="warn">Warnings</Badge>
          )
        }
      >
        <ul className="space-y-4">
          {ready.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-3">
              {check.ok ? (
                <ShieldCheck
                  size={16}
                  strokeWidth={2.5}
                  className="mt-0.5 shrink-0 text-emerald-700"
                />
              ) : (
                <TriangleAlert
                  size={16}
                  strokeWidth={2.5}
                  className={`mt-0.5 shrink-0 ${check.severity === "critical" ? "text-red-600" : "text-amber-700"}`}
                />
              )}
              <div className="min-w-0">
                <p className="text-[0.875rem] font-bold text-dash-ink">{check.title}</p>
                <p className="mt-0.5 text-[0.8125rem] text-dash-muted">{check.detail}</p>
                {!check.ok && check.fix && (
                  <p className="figure mt-1.5 rounded-dash-sm bg-dash-bg px-3 py-2 text-[0.75rem] wrap-break-word text-dash-ink">
                    {check.fix}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-2.5 border-t border-dash-line pt-4">
          <Button href="/admin/integrations" variant="dashOutline" size="sm">
            Integrations
          </Button>
          <Button href="/admin/audit" variant="dashOutline" size="sm">
            Audit logs
          </Button>
        </div>
      </Card>
    </DashLayout>
  );
}

/** Bytes, in the unit a person uses when deciding whether to worry. */
function megabytes(bytes) {
  if (!bytes) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return "under 1 MB";
  if (mb < 1024) return `${Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}
