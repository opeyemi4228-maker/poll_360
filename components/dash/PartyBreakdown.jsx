"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { PARTY_FILL } from "./Charts";
import { parties, others } from "@/lib/election2023";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * The whole contest in one place, at whatever level you are standing on.
 *
 * ── WHY EVERY PARTY, NOT JUST THE WINNER ───────────────────────────────────
 * A choropleth can only say one thing per shape: who came first. That is the
 * least interesting fact about most places. Whether Kano was 51/49 or 80/20,
 * whether the party that lost nationally is second or fourth here, whether the
 * fourth party is worth 200 votes or 200,000, none of it survives a fill
 * colour, and all of it is what a room is actually arguing about.
 *
 * So selecting anywhere, a state, a local government, a ward, a booth, opens
 * the full card: every party, ranked, with its share, its bar and the margin
 * between first and second, plus the turnout arithmetic underneath.
 *
 * ── AND WHY THE BAR IS SCALED TO THE LEADER ────────────────────────────────
 * Bars run against the leading party rather than against 100%, because in a
 * four-way race with a 38% winner every bar scaled to 100 is short and the
 * shape of the contest disappears. Scaled to the leader, second place at 31%
 * is visibly close and fourth at 6% is visibly nowhere. The percentage is
 * printed regardless, so nothing depends on reading a bar.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function PartyBreakdown({ place, row, coverage, level, compact = false }) {
  const all = [...parties, others];

  const ranked = all
    .map((party, index) => ({
      id: party.id,
      name: party.name,
      candidate: party.candidate,
      votes: row?.votes?.[index] ?? 0,
    }))
    .sort((a, b) => (a.id === "OTH" ? 1 : b.id === "OTH" ? -1 : b.votes - a.votes));

  const total = ranked.reduce((sum, party) => sum + party.votes, 0);
  const top = ranked[0];
  const second = ranked[1];
  const lead = top && second ? top.votes - second.votes : 0;
  const leadShare = total ? (lead / total) * 100 : 0;
  const scale = Math.max(top?.votes ?? 0, 1);

  /* The call, on the same conservative rule the rest of the product uses:
     coverage first, margin second. */
  const call =
    coverage !== undefined && coverage < 25
      ? { label: "Too early", tone: "muted" }
      : leadShare < 5
        ? { label: "Too close", tone: "warn" }
        : leadShare >= 12
          ? { label: "Decided", tone: "good" }
          : { label: "Leaning", tone: "muted" };

  if (!row || total === 0) {
    return (
      <section className="rounded-dash border border-dash-line bg-dash-card">
        <header className="border-b border-dash-line px-4 py-3">
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">{place}</h3>
        </header>
        <p className="px-4 py-8 text-center text-[0.875rem] leading-relaxed text-dash-muted">
          No returns from here yet. Grey means nobody has reported, never a low score.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      {/* ------------------------------------------------------------ head */}
      <header className="border-b border-dash-line px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
              {level}
            </p>
            <h3 className="truncate font-display text-[1.125rem] leading-tight font-extrabold tracking-[-0.02em] text-dash-ink">
              {place}
            </h3>
          </div>

          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[0.625rem] font-bold uppercase",
              call.tone === "good"
                ? "bg-emerald-50 text-emerald-800"
                : call.tone === "warn"
                  ? "bg-amber-50 text-amber-800"
                  : "bg-dash-bg text-dash-muted"
            )}
          >
            {call.label}
          </span>
        </div>

        {/* The headline: who is ahead and by how much, which is two facts and
            is always shown as two. */}
        <div className="mt-3 flex items-end gap-3">
          <span
            aria-hidden="true"
            className="mb-1 size-3.5 shrink-0 rounded-full"
            style={{ background: PARTY_FILL[top.id] }}
          />
          <p className="figure text-[1.75rem] leading-none font-bold tracking-[-0.03em] text-dash-ink">
            {top.id}
          </p>
          <p className="figure mb-0.5 text-[0.9375rem] text-dash-muted">
            {formatShare(total ? (top.votes / total) * 100 : 0)}
          </p>
          <p className="mb-0.5 ml-auto flex items-center gap-1 text-[0.8125rem] text-dash-muted">
            {lead > 0 ? (
              <ArrowUpRight size={14} strokeWidth={2.5} className="text-emerald-600" />
            ) : (
              <Minus size={14} strokeWidth={2.5} />
            )}
            <span className="figure font-bold text-dash-ink">{formatNumber(lead)}</span> ahead
          </p>
        </div>
      </header>

      {/* ----------------------------------------------------- every party */}
      <ul className={cn("divide-y divide-dash-line", compact && "text-[0.8125rem]")}>
        {ranked.map((party, index) => {
          const share = total ? (party.votes / total) * 100 : 0;
          return (
            <li key={party.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2.5">
                <span className="figure w-4 shrink-0 text-[0.6875rem] text-dash-muted">
                  {index + 1}
                </span>
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: PARTY_FILL[party.id] }}
                />
                <span className="figure shrink-0 text-[0.875rem] font-bold text-dash-ink">
                  {party.id}
                </span>
                {!compact && (
                  <span className="min-w-0 flex-1 truncate text-[0.75rem] text-dash-muted">
                    {party.candidate ?? party.name}
                  </span>
                )}
                <span className="figure ml-auto shrink-0 text-[0.875rem] font-bold text-dash-ink tabular-nums">
                  {formatShare(share)}
                </span>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-dash-bg">
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${Math.min(100, (party.votes / scale) * 100)}%`,
                      background: PARTY_FILL[party.id],
                    }}
                  />
                </div>
                <span className="figure w-20 shrink-0 text-right text-[0.75rem] text-dash-muted tabular-nums">
                  {formatNumber(party.votes)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ------------------------------------------------- the arithmetic */}
      <dl className="grid grid-cols-2 gap-px border-t border-dash-line bg-dash-line sm:grid-cols-4">
        <Cell label="Votes" value={formatNumber(total)} />
        <Cell label="Register" value={formatNumber(row.registered ?? 0)} />
        <Cell label="Turnout" value={formatShare(row.turnout ?? 0)} />
        <Cell
          label={coverage === undefined ? "Booths" : "Counted"}
          value={coverage === undefined ? formatNumber(row.booths ?? 0) : formatShare(coverage)}
        />
      </dl>
    </section>
  );
}

function Cell({ label, value }) {
  return (
    <div className="bg-dash-card px-4 py-3">
      <dt className="text-[0.625rem] font-semibold tracking-[0.1em] text-dash-muted uppercase">
        {label}
      </dt>
      <dd className="figure mt-1 text-[0.9375rem] font-bold text-dash-ink tabular-nums">{value}</dd>
    </div>
  );
}
