"use client";

import { useMemo, useState } from "react";
import { Check, Loader2, ShieldCheck } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { PARTY_FILL } from "@/components/dash/Charts";
import { ItemCard, Queue, Said, clock, useAction, useDesk } from "./Queue";
import { draftItem } from "@/app/broadcast/actions";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";
import PartyMark from "../PartyMark";

/**
 * Live results, and the one control that decides whether any of it may be
 * read out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  RAW → VERIFIED → CLEARED → ON AIR
 *
 *  Four stages, and the important thing about them is that they are not four
 *  views of the same number. Each is a strictly smaller set than the one above
 *  it, and every step between them is a person doing something:
 *
 *    RAW       a booth filed. Nobody has looked at it.
 *    VERIFIED  a desk held the figures against the photographed sheet.
 *    CLEARED   an editor passed the place those returns are in, for air.
 *    ON AIR    an operator is serving it to a renderer right now.
 *
 *  There is no automatic promotion between any two of them, and there is no
 *  screen in this product on which a return that arrived thirty seconds ago
 *  can appear in broadcast output. That is the whole claim, and this is where
 *  it is either true or it is not.
 *
 *  ── A CLEARANCE IS GRANTED TO A PLACE, AT A COVERAGE ────────────────────
 *  Not to a row. "Kano may be read out" is the sentence a producer actually
 *  needs, and it has to carry the coverage it was granted at — otherwise a
 *  clearance given at 40% silently keeps applying at 95%, which is a different
 *  claim about a different set of booths.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function LiveResults({ pipeline, places, national, race, raceLabel, onGo }) {
  const { may } = useDesk();
  const { pending, said, run, setSaid } = useAction();
  const [clearing, setClearing] = useState(null);

  const clearances = pipeline.clearances;
  const clearedScopes = useMemo(
    () => new Set(clearances.map((row) => row.scope)),
    [clearances]
  );

  const clear = (scope, name, returns) => {
    setClearing(scope);
    run(
      () =>
        draftItem({
          kind: "CLEARANCE",
          title: `${name} — figures cleared for air`,
          body: `${formatNumber(returns)} returns in ${name} at the moment of clearing.`,
          race,
          scope,
          payload: { returns, place: name },
        }),
      {
        onDone: () => {
          setClearing(null);
          setSaid({
            tone: "good",
            text: `Drafted. ${name} is not cleared until somebody who did not draft it passes the clearance.`,
          });
        },
      }
    );
  };

  return (
    <div className="space-y-4">
      {/* ── THE FUNNEL ─────────────────────────────────────────────────── */}
      <Card
        title="RAW → VERIFIED → CLEARED → ON AIR"
        subtitle={`${raceLabel} · every stage is a person doing something`}
      >
        {/* ── THE FUNNEL, DRAWN ──────────────────────────────────────────
            Four counts in a row make a reader do the subtraction. A funnel
            does it for them: each bar is the stage as a share of what was
            received, so the drop between filed and cleared — the gap this
            desk exists to close — is the shape of the picture rather than a
            sum somebody has to work out. */}
        <ol className="flex flex-col gap-2.5">
          {pipeline.stages.map((stage, index) => {
            const received = pipeline.stages[0]?.count || 1;
            const share = Math.min(100, (stage.count / received) * 100);
            const previous = index > 0 ? pipeline.stages[index - 1].count : null;
            const lost = previous === null ? null : previous - stage.count;
            const colour =
              stage.id === "air"
                ? "var(--color-red-500)"
                : stage.id === "cleared"
                  ? "var(--color-verified)"
                  : stage.id === "verified"
                    ? "var(--color-flagged)"
                    : "var(--color-dash-ink)";
            return (
              <li key={stage.id} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                  {stage.label}
                </span>
                <span className="relative flex h-9 min-w-0 flex-1 items-center overflow-hidden rounded-dash-sm bg-dash-bg">
                  <span
                    className="flex h-full items-center justify-end rounded-dash-sm px-3"
                    style={{ width: `${Math.max(share, 2)}%`, background: colour }}
                  >
                    {share > 18 && (
                      <span className="figure text-[0.9375rem] leading-none font-extrabold text-white">
                        {formatNumber(stage.count)}
                      </span>
                    )}
                  </span>
                  {share <= 18 && (
                    <span className="figure pl-3 text-[0.9375rem] leading-none font-extrabold text-dash-ink">
                      {formatNumber(stage.count)}
                    </span>
                  )}
                </span>
                <span className="w-24 shrink-0 text-right text-[0.75rem] font-semibold text-dash-muted">
                  {lost !== null && lost > 0 ? `${formatNumber(lost)} short` : `${Math.round(share)}%`}
                </span>
              </li>
            );
          })}
        </ol>
        <Said said={said} />
      </Card>

      {/* ── WHERE THE COUNT IS, PLACE BY PLACE ─────────────────────────── */}
      <Card
        title="By state"
        subtitle="Our agents' returns. Never a declaration, and never presented as one."
      >
        {places.length === 0 ? (
          <Empty>
            No returns have arrived for this contest. The board stays grey until a booth files —
            an absence, not a zero.
          </Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[46rem] border-collapse text-[0.875rem]">
              <thead>
                <tr className="border-b border-dash-line text-left">
                  <Th>State</Th>
                  <Th right>Filed</Th>
                  <Th right>Verified</Th>
                  <Th right>Booths in</Th>
                  <Th>Leading, on what is in</Th>
                  <Th right>Cleared for air</Th>
                </tr>
              </thead>
              <tbody>
                {places.map((place) => {
                  const leader = place.parties[0];
                  const done = clearedScopes.has(place.scope);
                  return (
                    <tr key={place.number} className="border-b border-dash-line last:border-0">
                      <Td>
                        <span className="font-semibold text-dash-ink">{place.name}</span>
                      </Td>
                      <Td right>{formatNumber(place.filed)}</Td>
                      <Td right>
                        <span className={place.verified === 0 ? "text-dash-muted" : "text-dash-ink"}>
                          {formatNumber(place.verified)}
                        </span>
                      </Td>
                      <Td right>
                        {place.reporting === null ? (
                          <span className="text-dash-muted" title="This project holds no booth count for this state">
                            —
                          </span>
                        ) : (
                          formatShare(place.reporting)
                        )}
                      </Td>
                      <Td>
                        {leader ? (
                          <span className="inline-flex items-center gap-2">
                            <PartyMark id={leader.id} size={18} />
                            <span className="font-semibold text-dash-ink">{leader.id}</span>
                            <span className="text-dash-muted">{formatShare(leader.share)}</span>
                          </span>
                        ) : (
                          <span className="text-dash-muted">—</span>
                        )}
                      </Td>
                      <Td right>
                        {done ? (
                          <Badge tone="good">Cleared</Badge>
                        ) : may.draft ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => clear(place.scope, place.name, place.filed)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm border border-dash-line px-2.5 text-[0.6875rem] font-bold tracking-[0.06em] text-dash-ink uppercase transition-colors hover:border-dash-ink disabled:opacity-40"
                          >
                            {pending && clearing === place.scope ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <ShieldCheck size={13} strokeWidth={2.5} />
                            )}
                            Clear
                          </button>
                        ) : (
                          <span className="text-dash-muted">—</span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
              {national && (
                <tfoot>
                  <tr className="border-t-2 border-dash-ink">
                    <Td>
                      <span className="font-bold text-dash-ink">{national.name}</span>
                    </Td>
                    <Td right>
                      <span className="font-bold">{formatNumber(national.filed)}</span>
                    </Td>
                    <Td right>
                      <span className="font-bold">{formatNumber(national.verified)}</span>
                    </Td>
                    <Td right>
                      <span className="font-bold">
                        {national.reporting === null ? "—" : formatShare(national.reporting)}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-dash-muted">
                        {national.parties[0]
                          ? `${national.parties[0].id} ${formatShare(national.parties[0].share)}`
                          : "—"}
                      </span>
                    </Td>
                    <Td right>
                      {clearedScopes.has("NATION") ? (
                        <Badge tone="good">Cleared</Badge>
                      ) : may.draft ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => clear("NATION", national.name, national.filed)}
                          className="inline-flex h-8 items-center gap-1.5 rounded-dash-sm border border-dash-ink bg-dash-ink px-2.5 text-[0.6875rem] font-bold tracking-[0.06em] text-white uppercase disabled:opacity-40"
                        >
                          {pending && clearing === "NATION" ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <ShieldCheck size={13} strokeWidth={2.5} />
                          )}
                          Clear all
                        </button>
                      ) : (
                        <span className="text-dash-muted">—</span>
                      )}
                    </Td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        <p className="mt-4 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          &ldquo;Booths in&rdquo; is measured against how many polling units each state had at the last
          general election, not this one&rsquo;s register. A state with no booth count shows an
          em dash rather than a
          percentage computed against nothing.
        </p>
      </Card>

      {/* ── THE CLEARANCES THEMSELVES ──────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Clearances"
          subtitle="What has been passed, by whom, and at what coverage"
        >
          {clearances.length === 0 ? (
            <Empty>Nothing has been cleared for air. No figure from this count may be read out.</Empty>
          ) : (
            <ul className="space-y-3">
              {clearances.map((row) => {
                const moved = row.returnsThen !== null && row.returnsNow > row.returnsThen;
                return (
                  <li key={row.id} className="rounded-dash-sm border border-dash-line p-3.5">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone={row.state === "ON_AIR" ? "ink" : "good"}>
                        {row.state === "ON_AIR" ? "On air" : "Cleared"}
                      </Badge>
                      <span className="text-[0.875rem] font-semibold text-dash-ink">{row.title}</span>
                    </p>
                    <p className="mt-1.5 text-[0.8125rem] text-dash-muted">
                      {row.clearedBy ? `${row.clearedBy}, ${clock(row.clearedAt)}` : "clearance not stamped"}
                    </p>
                    {/* ── THE ONE THING A CLEARANCE MUST SAY OUT LOUD ────
                        A clearance granted at 40% coverage does not silently
                        become a clearance at 95%. It is the same permission
                        over a materially different set of booths, and the desk
                        is told rather than left to notice. */}
                    {moved && (
                      <p className="mt-2 rounded-dash-sm bg-[color-mix(in_oklab,var(--color-flagged)_10%,#fff)] px-3 py-2 text-[0.8125rem] leading-relaxed ink-warn">
                        Cleared at {formatNumber(row.returnsThen)} returns; there are now{" "}
                        {formatNumber(row.returnsNow)}. The figures have moved past what was
                        passed — clear it again if the newer ones are going out.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card
          title="Waiting"
          subtitle="Clearances drafted and not yet passed"
          action={
            <button
              type="button"
              onClick={() => onGo("approvals")}
              className="text-[0.75rem] font-bold tracking-[0.06em] text-dash-muted uppercase hover:text-dash-ink"
            >
              Approvals
            </button>
          }
        >
          <Queue
            items={pipeline.pending ?? []}
            empty="No clearance is waiting on an editor."
            compact
            render={(item) => <ItemCard key={item.id} item={item} compact />}
          />
          {pipeline.verifiedNotCleared > 0 && (
            <p className="mt-4 flex items-start gap-2 rounded-dash-sm bg-dash-bg px-3 py-2.5 text-[0.8125rem] leading-relaxed text-dash-muted">
              <Check size={15} strokeWidth={2.5} className="mt-0.5 shrink-0" />
              {formatNumber(pipeline.verifiedNotCleared)} returns have been checked against their
              sheets and are covered by no clearance. Checked is not cleared, and this is the gap
              between the two.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

const Th = ({ children, right = false }) => (
  <th
    className={cn(
      "pb-2 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase",
      right ? "pl-3 text-right" : "pr-3"
    )}
  >
    {children}
  </th>
);

const Td = ({ children, right = false }) => (
  <td className={cn("py-2.5 align-middle", right ? "pl-3 text-right tabular-nums" : "pr-3")}>
    {children}
  </td>
);
