import { Database, ScanLine } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import LiveRefresh from "@/components/dash/LiveRefresh";
import { Card, Badge, Empty } from "@/components/dash/DashCard";
import { Cell, Counts, Since, Table } from "@/components/dash/SystemBits";
import { Ring, Split } from "@/components/dash/SystemCharts";
import { requireCapability } from "@/lib/guard";
import { currentElection } from "@/lib/election-scope";
import { dataSources, sheetReading } from "@/lib/system";
import { formatNumber, formatShare } from "@/lib/utils";

export const metadata = { title: "Data sources", robots: { index: false } };
export const dynamic = "force-dynamic";

/* Strongest first. Named here rather than inferred from the table's order,
   because the table is sorted by volume and the scale is not: the weakest
   route being the commonest is exactly the finding this screen exists to
   make visible, and a ramp that took its order from the counts would hide it
   by construction. */
const TRUST_ORDER = ["strongest", "strong", "weakest", "unknown"];

/** How much a source is worth, said in a word and a colour, never a colour alone. */
const TRUST = {
  strongest: { tone: "good", word: "Filed at the booth" },
  strong: { tone: "good", word: "From a claimed number" },
  weakest: { tone: "warn", word: "Entered by a desk" },
  unknown: { tone: "neutral", word: "Unknown" },
};

/**
 * Where every figure in the count entered the building.
 *
 * ── THE MIX IS THE MEASUREMENT ─────────────────────────────────────────────
 * "473 booths counted" is four different claims depending on how those booths
 * arrived. A return typed by the named agent standing at the booth, a return
 * read down a phone to a desk, and a spreadsheet loaded before polling day
 * are all counted identically and should never be trusted identically. Every
 * other screen in the product shows the total; this is the one that shows
 * what the total is made of, which is the question a sceptical newsroom asks
 * second and nobody could answer before this page existed.
 */
export default async function SourcesPage() {
  const admin = await requireCapability("system:read", "/admin/sources");

  const project = await currentElection();
  const [sources, reading] = await Promise.all([dataSources(project?.id), Promise.resolve(sheetReading())]);

  const filed = sources.returns.reduce((total, row) => total + row.count, 0);
  const atBooth = sources.returns
    .filter((row) => row.trust === "strongest" || row.trust === "strong")
    .reduce((total, row) => total + row.count, 0);

  return (
    <DashLayout
      user={admin}
      screen="admin"
      /* The mix moves all evening as returns arrive by different routes, and
         a shift in it is the thing this screen exists to catch. */
      actions={<LiveRefresh seconds={45} label="Live" />}
      title="Data sources"
      lead={
        project
          ? `Every figure in ${project.title} came in through one of these. A total is only as good as the mix underneath it.`
          : "Every figure in the count comes in through one of these."
      }
    >
      {!project ? (
        <Card title="Data sources" action={<Database size={16} className="text-dash-muted" />}>
          <Empty>No project is open. Choose one from the switcher above.</Empty>
        </Card>
      ) : (
        <>
          <Counts
            items={[
              { label: "Returns held", value: formatNumber(filed) },
              {
                label: "Filed at the booth",
                value: filed ? formatShare((atBooth / filed) * 100) : "—",
                tone: "good",
                context: "By the named person standing at it.",
              },
              {
                label: "Booths in this project",
                value: formatNumber(sources.units),
                context: `of ${formatNumber(sources.register.pollingUnits)} nationally`,
              },
              {
                label: "Declared figures entered",
                value: formatNumber(sources.declared.count),
                context: sources.declared.sources.length
                  ? sources.declared.sources.join(", ").toLowerCase()
                  : "none yet",
              },
            ]}
          />

          {/* ── THE MIX, WHICH IS THIS SCREEN'S ENTIRE ARGUMENT ────────────
              "473 returns" is four different claims depending on how those
              returns arrived, and the table below says so precisely, row by
              row. What it cannot do is show the *proportion* — and the
              proportion is the claim: a count that is nine-tenths agents at
              booths and a count that is nine-tenths desk entry are not the
              same count, however identical their totals.

              One ink deepening along the scale, not status colour. A
              desk-entered return is weaker evidence; it is not a warning and
              it is not an error, and amber would say the count contains
              something wrong when it contains something ordinary that
              deserves less weight. */}
          <div className="mb-6 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <Card
              title="What the total is made of"
              subtitle="Every route a figure took into this count, by share"
            >
              {sources.returns.length === 0 ? (
                <Empty>Nothing has been filed on this project yet.</Empty>
              ) : (
                <Split
                  segments={[...sources.returns]
                    .sort((a, b) => TRUST_ORDER.indexOf(a.trust) - TRUST_ORDER.indexOf(b.trust))
                    .map((row) => ({
                      label: row.name,
                      value: row.count,
                      /* Deepest ink for the strongest evidence, so the bar
                         reads left-to-right as "how much of this did we
                         actually watch happen". */
                      depth: 1 - TRUST_ORDER.indexOf(row.trust) / Math.max(1, TRUST_ORDER.length - 1),
                    }))}
                  caption="Darkest is the strongest evidence: the named agent standing at the booth."
                />
              )}
            </Card>

            <Card title="Watched at the booth" subtitle="The share filed by somebody who was there">
              <Ring
                label="Filed at the booth"
                value={atBooth}
                of={filed}
                tone={filed && atBooth / filed >= 0.75 ? "good" : "warn"}
                size={116}
                caption={
                  filed
                    ? `${formatNumber(atBooth)} of ${formatNumber(filed)} returns`
                    : "Nothing filed yet."
                }
              />
            </Card>
          </div>

          <Card
            title="How the returns arrived"
            subtitle="Every route a figure can take into the count, and how much came each way"
            action={<Database size={16} className="shrink-0 text-dash-muted" />}
          >
            {sources.returns.length === 0 ? (
              <Empty>Nothing has been filed on this project yet.</Empty>
            ) : (
              <Table
                head={[
                  "Route in",
                  { label: "Returns", numeric: true },
                  { label: "Share", numeric: true },
                  { label: "Checked", numeric: true },
                  "Weight",
                  "Last one",
                ]}
              >
                {sources.returns.map((row) => {
                  const trust = TRUST[row.trust] ?? TRUST.unknown;

                  return (
                    <tr key={row.source} className="hover:bg-dash-bg">
                      <Cell strong>
                        {row.name}
                        <span className="mt-0.5 block max-w-md text-[0.75rem] font-medium text-dash-muted">
                          {row.what}
                        </span>
                      </Cell>
                      <Cell numeric strong>
                        {formatNumber(row.count)}
                      </Cell>
                      <Cell numeric muted>
                        {filed ? formatShare((row.count / filed) * 100) : "—"}
                      </Cell>
                      <Cell numeric muted>
                        {formatNumber(row.verified)}
                        {row.disputed > 0 && (
                          <span className="block text-[0.75rem] text-red-600">
                            {formatNumber(row.disputed)} disputed
                          </span>
                        )}
                      </Cell>
                      <Cell>
                        <Badge tone={trust.tone}>{trust.word}</Badge>
                      </Cell>
                      <Cell>
                        <Since at={row.lastAt} />
                      </Cell>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Card
              title="Reading the sheets"
              subtitle="What each reader has been given, and how often a person let its answer stand"
              action={<ScanLine size={16} className="shrink-0 text-dash-muted" />}
            >
              {sources.readers.length === 0 ? (
                <Empty>No photographed sheet has been read on this project yet.</Empty>
              ) : (
                <Table
                  head={[
                    "Reader",
                    { label: "Sheets", numeric: true },
                    { label: "Accepted", numeric: true },
                    "Last used",
                  ]}
                >
                  {sources.readers.map((row) => (
                    <tr key={row.reader} className="hover:bg-dash-bg">
                      <Cell strong>{row.name}</Cell>
                      <Cell numeric>{formatNumber(row.count)}</Cell>
                      {/* The only honest measure of a reader: not what it
                          thought it saw, but how often somebody looked at the
                          proposal and let it stand. */}
                      <Cell numeric muted>
                        {row.count ? formatShare((row.accepted / row.count) * 100) : "—"}
                      </Cell>
                      <Cell>
                        <Since at={row.lastAt} />
                      </Cell>
                    </tr>
                  ))}
                </Table>
              )}

              <p className="mt-5 border-t border-dash-line pt-4 text-[0.8125rem] text-dash-muted">
                {reading.off
                  ? "Sheet reading is switched off here. Photographs are still kept with every return; nothing is read from them."
                  : reading.handwriting
                    ? `Running the ${reading.name?.toLowerCase()}. Every figure on a result sheet is handwritten, and this one can read handwriting.`
                    : `Running the ${reading.name?.toLowerCase()}, which reads print and not handwriting. Every figure on a result sheet is handwritten, so it recovers very little and agents type the figures instead.`}
              </p>
            </Card>

            <Card title="What this product is sized against" subtitle="Fixed reference, not a measurement">
              <dl className="space-y-3 text-[0.8125rem]">
                <Reference label="Polling units nationally" value={formatNumber(sources.register.pollingUnits)} />
                <Reference label="Wards" value={formatNumber(sources.register.wards)} />
                <Reference label="Local governments" value={formatNumber(sources.register.lgas)} />
                <Reference label="States, with the federal capital" value={formatNumber(sources.register.states)} />
              </dl>

              {/* Reference data is a source too, and the least examined one:
                  nobody doubts the ward list until a booth code will not
                  resolve at 11pm. Naming where it comes from is how somebody
                  knows what to go and check. */}
              <p className="mt-5 border-t border-dash-line pt-4 text-[0.8125rem] text-dash-muted">
                The ward, local government and constituency tables ship with the product and are
                read from disk rather than from the database, so a booth code means the same thing
                on every deployment. The declared figures each project is compared against are
                entered by hand and are shown with whoever entered them.
              </p>
            </Card>
          </div>
        </>
      )}
    </DashLayout>
  );
}

function Reference({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-dash-line pt-3 first:border-t-0 first:pt-0">
      <dt className="text-dash-muted">{label}</dt>
      <dd className="figure font-bold tabular-nums text-dash-ink">{value}</dd>
    </div>
  );
}
