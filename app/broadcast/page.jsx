import { Download, Gauge, Radio, Tv } from "lucide-react";

import DashLayout from "@/components/dash/DashLayout";
import { Card, StatCard } from "@/components/dash/DashCard";
import Sparkline from "@/components/dash/Sparkline";
import BroadcastAnalysis from "@/components/dash/BroadcastAnalysis";
import Button from "@/components/ui/Button";
import { requireUser } from "@/lib/guard";
import { currentElection } from "@/lib/election-scope";
import { results } from "@/lib/db";
import { states2023, DECLARED } from "@/lib/election2023";
import nation from "@/public/geo/map/nation.json";
import { register } from "@/lib/site";
import { formatNumber, formatShare } from "@/lib/utils";

export const metadata = { title: "Broadcast desk", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The broadcast desk.
 *
 * Two things a newsroom needs that nobody else does, and both were missing
 * from the first pass:
 *
 *   1. THE DECLARED FIGURES ALONGSIDE OURS. A studio is not covering a
 *      parallel count, it is covering an election, so the commission's
 *      declared result is on this screen next to our agents', in its own
 *      column, with the difference computed. That comparison is the story.
 *
 *   2. A SURFACE THAT ANSWERS QUESTIONS BETWEEN BULLETINS. Most of a
 *      producer's night is not on air; it is working out what to say. So this
 *      is an analysis tool that happens to be current, driven by touch, rather
 *      than a live ticker that can only be watched.
 */
export default async function BroadcastPage() {
  const user = await requireUser("/broadcast");

  const project = await currentElection();
  const tally = await results.tally(project?.id);
  const ourRows = await results.counted(project?.id);

  /* Our agents' returns, folded up by state so the analysis surface can put
     them beside the declared figure for the same place. */
  const ours = {};
  for (const row of ourRows) {
    const code = stateCodeFor(row.stateCode);
    if (!code) continue;
    ours[code] ??= { votes: {}, units: 0 };
    ours[code].units += 1;
    for (const [party, count] of Object.entries(row.votes)) {
      ours[code].votes[party] = (ours[code].votes[party] ?? 0) + count;
    }
  }

  return (
    <DashLayout
      user={user}
      screen="broadcast"
      title="Broadcast desk"
      lead="Our agents' count and the commission's declared figures, side by side and never merged. Built to be driven by hand on a touch screen between bulletins."
      actions={
        <>
          <Button href="/#board" variant="dashOutline" size="sm">
            <Tv size={15} strokeWidth={2.5} />
            Wall board
          </Button>
          <Button href="/api/export/results" variant="dash" size="sm">
            <Download size={15} strokeWidth={2.5} />
            CSV
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Gauge}
          label="Our booths in"
          value={formatShare((tally.units / register.pollingUnits) * 100)}
          context={`${formatNumber(tally.units)} filed by our agents`}
        />
        <StatCard
          icon={Radio}
          label="Declared, 2023"
          value={formatNumber(DECLARED.validVotes)}
          context="Valid votes, as declared by INEC"
        />
        <StatCard
          label="Winning margin"
          value={formatShare(
            ((DECLARED.apc - DECLARED.pdp) / DECLARED.validVotes) * 100
          )}
          context={`${formatNumber(DECLARED.apc - DECLARED.pdp)} between first and second`}
        />
        <StatCard
          label="States declared"
          value="37"
          context="APC 12 · PDP 12 · LP 12 · NNPP 1"
        />
      </div>

      <div className="mt-6">
        <BroadcastAnalysis declared={states2023} ours={ours} shapes={nation} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="On-air frames" subtitle="A web address your gallery can point straight at">
          <ul className="space-y-3 text-[0.875rem] text-dash-muted">
            <li className="border-l-2 border-dash-line pl-3">
              <span className="font-bold text-dash-ink">Wall board</span>, 1920×1080, map and
              standings, with how much is counted burnt into the corner.
            </li>
            <li className="border-l-2 border-dash-line pl-3">
              <span className="font-bold text-dash-ink">Lower third</span>, see-through
              background for your keyer, redraws itself as results land.
            </li>
            <li className="border-l-2 border-dash-line pl-3">
              <span className="font-bold text-dash-ink">State card</span>, one state full frame,
              for a presenter standing beside it.
            </li>
          </ul>
          <p className="mt-4 border-t border-dash-line pt-3 text-[0.75rem] leading-relaxed text-dash-muted">
            The renderer routes are specified and not built yet. The analysis above draws from the
            same figures they will.
          </p>
        </Card>

        <Card title="The rules this desk works under">
          <ul className="grid gap-4 text-[0.875rem] leading-relaxed text-dash-muted sm:grid-cols-2">
            <li>
              <span className="font-bold text-dash-ink">Coverage travels with every total.</span>{" "}
              It is part of the frame and cannot be switched off.
            </li>
            <li>
              <span className="font-bold text-dash-ink">Nothing is called under 25%.</span> The
              graphic says “too early” however wide the lead looks.
            </li>
            <li>
              <span className="font-bold text-dash-ink">Result sheets stay private.</span> The
              photographs belong to the agent and the coordinators above them.
            </li>
            <li>
              <span className="font-bold text-dash-ink">Ours is never presented as theirs.</span> A
              parallel count is a second source, not the official one.
            </li>
          </ul>
        </Card>
      </div>
    </DashLayout>
  );
}

/**
 * Our returns carry a two-digit state prefix from the unit code; the declared
 * table is keyed by INEC's three-letter code. One lookup, kept here rather
 * than in the client component so the mapping never ships to the browser.
 */
function stateCodeFor(prefix) {
  const index = Number(prefix) - 1;
  return states2023[index]?.code ?? null;
}
