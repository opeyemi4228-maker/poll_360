import { Plug, TriangleAlert } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, Badge } from "@/components/dash/DashCard";
import { Since, Wired, requestClock } from "@/components/dash/SystemBits";
import { Recency, Split } from "@/components/dash/SystemCharts";
import Button from "@/components/ui/Button";
import { requireCapability } from "@/lib/guard";
import { integrations } from "@/lib/system";
import { formatNumber } from "@/lib/utils";

export const metadata = { title: "Integrations", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * What this deployment is wired to.
 *
 * ── CONFIGURED AND WORKING ARE TWO DIFFERENT COLUMNS ───────────────────────
 * Every card here carries both, from two independent places: whether the keys
 * are present, read from the environment, and when the thing last actually
 * did something, read from the database. They disagree more often than
 * anybody expects — a WhatsApp token lasts twenty-four hours and nothing
 * about the configuration changes when it expires — and "set up, and nothing
 * has arrived since Tuesday" is the sentence this page exists to say.
 *
 * No key is ever printed, not even truncated. This is the screen somebody
 * photographs to show a colleague what is wrong.
 */
export default async function IntegrationsPage() {
  const admin = await requireCapability("system:read", "/admin/integrations");

  const wired = await integrations();

  const on = wired.filter((row) => row.state === "on").length;
  const partial = wired.filter((row) => row.state === "partial");
  const brokenEssential = wired.filter((row) => row.essential && row.state !== "on");

  return (
    <DashLayout
      user={admin}
      screen="admin"
      title="Integrations"
      lead="Everything outside this application that it depends on. Whether each one is set up, and when it last did something."
      actions={
        <Button href="/admin/health" variant="dashOutline" size="sm">
          System health
        </Button>
      }
    >
      {/* ── THE WIRING, AND WHICH WIRE WENT QUIET ────────────────────────
          Two questions, and the second one had no answer on this screen at
          all. The four states were a strip of counts — "set up 5 of 7", "half
          set up 1" — which is the first question, and fine. The second is
          "when did each of these last actually do something", and it was
          buried one line at a time at the foot of seven cards, in four
          different units, so finding the one that stopped meant scrolling the
          whole page and doing the arithmetic seven times.

          On one axis it is the shape that answers. A key being set and a wire
          being alive are independent facts — a WhatsApp token expires after
          twenty-four hours and nothing about the configuration changes when
          it does — which is the entire reason this screen carries both. */}
      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="How much of it is wired" subtitle="Configuration, read from the environment">
          <Split
            segments={[
              { label: "set up", value: on, tone: "good" },
              { label: "half set up", value: partial.length, tone: "warn" },
              {
                label: "missing, and needed",
                value: brokenEssential.filter((row) => row.state === "off").length,
                tone: "alert",
              },
              {
                label: "not in use",
                value: wired.filter((row) => row.state === "off" && !row.essential).length,
                tone: "neutral",
              },
            ]}
            caption="Half set up is the state worth shouting about: it looks connected from every other screen in the product and cannot deliver a single message."
          />
        </Card>

        <Card title="When each last did something" subtitle="Evidence from the database, not from the settings">
          {wired.every((row) => !row.lastSeen) ? (
            <p className="rounded-dash-sm bg-dash-bg px-4 py-6 text-center text-[0.875rem] text-dash-muted">
              Nothing here leaves a trace that can be checked, or the database did not answer.
            </p>
          ) : (
            <Recency
              now={requestClock()}
              rows={wired
                .filter((row) => row.lastSeen)
                .map((row) => ({
                  label: row.name,
                  at: row.lastSeen.at,
                  title: row.lastSeen.what,
                }))}
              caption="Further right is more recent. Amber is over an hour old — which for a channel the field is filing through is a question, not a fact."
            />
          )}
        </Card>
      </div>

      {/* ── THE ONE STATE WORTH SHOUTING ABOUT ────────────────────────────
          Half-configured is strictly worse than switched off, because every
          other screen in the product treats it as connected. It gets a
          banner rather than a colour on a card somebody has to scroll to. */}
      {partial.length > 0 && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-dash border-2 border-amber-300 bg-amber-50 px-5 py-4">
          <TriangleAlert size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-amber-700" />
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-extrabold text-amber-900">
              {partial.map((row) => row.name).join(", ")} {partial.length === 1 ? "is" : "are"} half
              set up
            </p>
            <p className="mt-0.5 text-[0.8125rem] text-amber-900">
              Some of the required settings are present and some are not. The rest of the product
              cannot tell the difference between this and a working connection, so it will keep
              trying and keep failing quietly.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {wired.map((row) => (
          <Card
            key={row.id}
            title={row.name}
            subtitle={row.what}
            action={<Wired state={row.state} />}
          >
            <dl className="space-y-2.5">
              {row.keys.map((key) => (
                <div key={key.name} className="flex items-baseline justify-between gap-3">
                  {/* The name of the setting, never its value. */}
                  <dt className="figure min-w-0 truncate text-[0.8125rem] text-dash-muted">
                    {key.name}
                  </dt>
                  <dd className="shrink-0">
                    {key.set ? (
                      <span className="text-[0.75rem] font-bold tracking-[0.06em] text-emerald-700 uppercase">
                        set
                      </span>
                    ) : (
                      <span className="text-[0.75rem] font-bold tracking-[0.06em] text-dash-muted uppercase">
                        not set
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-4 border-t border-dash-line pt-4 text-[0.8125rem]">
              {row.lastSeen ? (
                <p className="text-dash-ink">
                  <Since at={row.lastSeen.at} never="nothing yet" />{" "}
                  <span className="text-dash-muted">— {row.lastSeen.what}</span>
                </p>
              ) : row.checked ? (
                <p className="text-dash-muted">Nothing here leaves a trace to check against.</p>
              ) : (
                /* Never "never used". An unreachable database turned into a
                   confident negative is a console lying in the exact moment
                   it matters. */
                <p className="text-dash-muted">
                  Could not be checked — the database did not answer.
                </p>
              )}

              {row.state !== "on" && (
                <p className="mt-2 flex items-start gap-2 text-dash-muted">
                  <Plug size={14} strokeWidth={2.25} className="mt-0.5 shrink-0" />
                  <span>
                    {row.missing}
                    {row.essential && (
                      <>
                        {" "}
                        <Badge tone="alert">Essential</Badge>
                      </>
                    )}
                  </span>
                </p>
              )}
            </div>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-[0.8125rem] text-dash-muted">
        Settings are changed where this application is deployed, not from this screen. Nothing here
        shows a key, a token or a password — only whether one is present.
      </p>
    </DashLayout>
  );
}
