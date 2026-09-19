"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";

import { Card, Empty, Badge } from "@/components/dash/DashCard";
import { PARTY_FILL } from "@/components/dash/Charts";
import { Composer, Field, ItemCard, Said, inputClass, useAction, useDesk } from "./Queue";
import { moveItem } from "@/app/broadcast/actions";
import { CLAIM_STEPS, VERDICTS } from "@/lib/broadcast";
import { formatNumber, formatShare } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Election intelligence, for the person who has to fill two minutes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ANALYSIS A PRESENTER CAN READ OUT WITHOUT QUALIFYING IT AFTERWARDS
 *
 *  The situation room's analytics answer "what is likely to happen". These
 *  answer a narrower question that a studio has every twenty minutes: what is
 *  true right now that is worth saying, and what exactly must be said with it.
 *
 *  Every figure on these screens carries its denominator, because the failure
 *  mode is not a wrong number. It is a right number said without its
 *  qualifier — "Kano is at 62%" is true of the booths in and false of Kano,
 *  and by the time anybody corrects it the clip is already circulating.
 * ══════════════════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────── visualisation ──── */

const CHARTS = [
  { id: "share", label: "Vote share", why: "Who is ahead on the returns in." },
  { id: "turnout", label: "Turnout", why: "Votes cast against the register, where both are held." },
  { id: "reporting", label: "Reporting progress", why: "How much of each state has filed." },
  { id: "margin", label: "Vote margin", why: "The gap between first and second." },
  { id: "verified", label: "Verification", why: "How much of what was filed has been checked." },
];

export function DataViz({ places, national, raceLabel }) {
  const [chart, setChart] = useState("share");
  const chosen = CHARTS.find((row) => row.id === chart) ?? CHARTS[0];

  const rows = useMemo(() => {
    const withValue = places
      .map((place) => {
        const value =
          chart === "turnout"
            ? place.turnout
            : chart === "reporting"
              ? place.reporting
              : chart === "margin"
                ? place.parties.length >= 2
                  ? place.parties[0].share - place.parties[1].share
                  : null
                : chart === "verified"
                  ? place.filed > 0
                    ? (place.verified / place.filed) * 100
                    : null
                  : (place.parties[0]?.share ?? null);
        return { ...place, value, party: place.parties[0]?.id ?? null };
      })
      /* A place with no value is left out of the ranking rather than ranked at
         zero. Nothing reported and nothing to report are different facts, and
         a bar chart cannot say the difference — a missing row can. */
      .filter((place) => place.value !== null && Number.isFinite(place.value));

    return withValue.sort((a, b) => b.value - a.value);
  }, [places, chart]);

  const top = Math.max(1, ...rows.map((row) => row.value));

  return (
    <div className="space-y-4">
      <Card
        title="Charts a presenter can use"
        subtitle={`${raceLabel} · ${chosen.why}`}
      >
        <div className="flex flex-wrap gap-1.5">
          {CHARTS.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setChart(row.id)}
              aria-pressed={chart === row.id}
              title={row.why}
              className={cn(
                "h-9 rounded-dash-sm border px-3 text-[0.75rem] font-semibold transition-colors",
                chart === row.id
                  ? "border-dash-ink bg-dash-ink text-white"
                  : "border-dash-line text-dash-muted hover:border-dash-ink hover:text-dash-ink"
              )}
            >
              {row.label}
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="mt-4">
            <Empty>
              Nothing to chart. Either no returns have arrived, or the figure this chart needs is
              not held for any place in this ground.
            </Empty>
          </div>
        ) : (
          <ol className="mt-4 space-y-1.5">
            {rows.slice(0, 20).map((row) => (
              <li key={row.number} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-[0.8125rem] text-dash-ink">
                  {row.name}
                </span>
                <span className="h-6 min-w-0 flex-1 rounded-sm bg-dash-bg">
                  <span
                    className="block h-6 rounded-sm"
                    style={{
                      width: `${Math.max(2, (row.value / top) * 100)}%`,
                      background:
                        chart === "share" && row.party
                          ? (PARTY_FILL[row.party] ?? PARTY_FILL.OTH)
                          : "var(--color-dash-ink)",
                    }}
                  />
                </span>
                <span className="figure w-14 shrink-0 text-right text-[0.8125rem] font-bold text-dash-ink">
                  {formatShare(row.value)}
                </span>
                <span className="w-20 shrink-0 text-right text-[0.75rem] text-dash-muted">
                  {formatNumber(row.filed)} in
                </span>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-4 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          The column on the right is how many returns each bar rests on. Read it out with the figure.
        </p>
      </Card>

      {national && (
        <Card title="Everywhere this desk may read" subtitle="The same figures, added up once">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Figure label="Returns in" value={formatNumber(national.filed)} />
            <Figure label="Verified" value={formatNumber(national.verified)} />
            <Figure
              label="Booths reporting"
              value={national.reporting === null ? "—" : formatShare(national.reporting)}
            />
            <Figure
              label="Turnout"
              value={national.turnout === null ? "—" : formatShare(national.turnout)}
            />
          </div>
          {national.parties.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-dash-line pt-4">
              {national.parties.slice(0, 6).map((party) => (
                <li key={party.id} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: PARTY_FILL[party.id] ?? PARTY_FILL.OTH }}
                  />
                  <span className="w-16 shrink-0 text-[0.875rem] font-bold text-dash-ink">
                    {party.id}
                  </span>
                  <span className="h-5 min-w-0 flex-1 rounded-sm bg-dash-bg">
                    <span
                      className="block h-5 rounded-sm"
                      style={{
                        width: `${Math.max(2, party.share)}%`,
                        background: PARTY_FILL[party.id] ?? PARTY_FILL.OTH,
                      }}
                    />
                  </span>
                  <span className="figure w-16 shrink-0 text-right text-[0.875rem] font-bold text-dash-ink">
                    {formatShare(party.share)}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[0.75rem] text-dash-muted">
                    {formatNumber(party.count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function Figure({ label, value }) {
  return (
    <div className="rounded-dash-sm bg-dash-bg px-4 py-3">
      <p className="text-[0.625rem] font-bold tracking-[0.12em] text-dash-muted uppercase">{label}</p>
      <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold text-dash-ink">{value}</p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── trends ──── */

/**
 * What is developing.
 *
 * ── SIX LISTS, AND THE TWO NOBODY ELSE BUILDS ──────────────────────────────
 * Fastest and slowest are what every election dashboard has. Stalled and
 * surging are the two that matter to a producer, because they are the ones
 * that change what the next bulletin is about: a state that filed forty
 * returns in the last hour is a story, and a state that filed four hundred all
 * day and none since eight o'clock is a different and more urgent one.
 */
export function Trends({ trends, raceLabel }) {
  const lists = [
    { id: "surging", label: "Filing fastest right now", rows: trends.surging, unit: "moved", why: `Returns in the last ${trends.windowMinutes} minutes.` },
    { id: "stalled", label: "Gone quiet", rows: trends.stalled, unit: "moved", why: "Has reported, and nothing in the window. Worth a phone call." },
    { id: "fastest", label: "Furthest through", rows: trends.fastest, unit: "reporting", why: "Share of that state's own expected booths." },
    { id: "slowest", label: "Least far through", rows: trends.slowest, unit: "reporting", why: "Only states that have started. Nought is not slow, it is silent." },
    { id: "closest", label: "Closest races", rows: trends.closest, unit: "margin", why: "Points between first and second, on the returns in." },
    { id: "turnout", label: "Highest turnout", rows: trends.turnout, unit: "turnout", why: "Votes cast against the register." },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {lists.map((list) => (
        <Card key={list.id} title={list.label} subtitle={list.why}>
          {list.rows.length === 0 ? (
            <Empty>Nothing qualifies yet.</Empty>
          ) : (
            <ol className="space-y-2">
              {list.rows.map((row) => (
                <li key={row.number} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-[0.875rem] text-dash-ink">{row.name}</span>
                  <span className="flex shrink-0 items-baseline gap-2">
                    <span className="figure text-[0.9375rem] font-bold text-dash-ink">
                      {list.unit === "moved"
                        ? formatNumber(row.moved)
                        : list.unit === "margin"
                          ? formatShare(row.margin)
                          : list.unit === "turnout"
                            ? formatShare(row.turnout)
                            : formatShare(row.reporting)}
                    </span>
                    <span className="text-[0.75rem] text-dash-muted">
                      {formatNumber(row.filed)} in
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      ))}
      <Card title="How to say these on air" className="lg:col-span-2 xl:col-span-3">
        <p className="text-[0.875rem] leading-relaxed text-dash-muted">
          Everything above is about <span className="font-semibold text-dash-ink">our returns</span>{" "}
          for the {raceLabel.toLowerCase()}, not about the commission&rsquo;s count and not about
          &ldquo;Furthest through&rdquo; is the share of booths our agents have filed, not how
          far the count has got. A stalled state means our people have stopped filing — worth a
          phone call, not a headline.
        </p>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────── results intelligence ──── */

/**
 * Whether the count is worth broadcasting yet.
 *
 * A studio's real question is not "what are the numbers" — every other screen
 * answers that — but "how much weight will these bear". So this holds the
 * three things that decide it: how much has been checked, where the returns
 * came from, and, where the commission has declared, whether our figures and
 * theirs agree.
 */
export function ResultsIntel({ places, national, rows, declaredRows, raceLabel }) {
  const sources = useMemo(() => {
    const out = {};
    for (const row of rows) {
      const key = row.source ?? "APP";
      out[key] = (out[key] ?? 0) + 1;
    }
    return Object.entries(out)
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
  }, [rows]);

  const SOURCE_WORDS = {
    APP: "Filed at the booth",
    WHATSAPP: "Sent over WhatsApp",
    UPLOAD: "Typed at a desk",
    DESK: "Typed at a desk",
  };

  /* ── OURS AGAINST THEIRS, WHERE THERE IS A THEIRS ───────────────────────
     Two independently sourced numbers for the same places, never averaged.
     The whole value of a parallel count is that the difference can be
     computed, so it is computed and shown rather than smoothed away. */
  const comparisons = useMemo(() => {
    const byState = new Map(places.map((place) => [place.number, place]));
    return declaredRows
      .filter((row) => row.level === "STATE" && row.stateNumber)
      .map((row) => {
        const mine = byState.get(String(row.stateNumber).padStart(2, "0"));
        if (!mine || mine.cast === 0) return null;
        const theirTotal = row.total ?? Object.values(row.votes ?? {}).reduce((a, b) => a + b, 0);
        if (!theirTotal) return null;

        const leader = mine.parties[0];
        const theirs = Object.entries(row.votes ?? {})
          .map(([id, count]) => ({ id, share: (count / theirTotal) * 100 }))
          .sort((a, b) => b.share - a.share);

        const same = theirs[0]?.id === leader?.id;
        const mineShare = leader?.share ?? 0;
        const theirShare = theirs.find((party) => party.id === leader?.id)?.share ?? 0;

        return {
          name: mine.name,
          number: mine.number,
          filed: mine.filed,
          leader: leader?.id ?? "—",
          mineShare,
          theirShare,
          gap: mineShare - theirShare,
          same,
        };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
  }, [places, declaredRows]);

  const verifiedShare = national && national.filed > 0 ? (national.verified / national.filed) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="How much has been checked" subtitle="A verified return is one held against its photographed sheet">
          {verifiedShare === null ? (
            <Empty>No returns have arrived for this contest.</Empty>
          ) : (
            <>
              <p className="figure text-[2.5rem] leading-none font-bold text-dash-ink">
                {formatShare(verifiedShare)}
              </p>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-dash-muted">
                {formatNumber(national.verified)} of {formatNumber(national.filed)} returns.
                The rest is filed and not yet checked against its sheet.
              </p>
              <div className="mt-3 h-3 overflow-hidden rounded-sm bg-dash-bg">
                <span
                  className="block h-3 bg-dash-ink"
                  style={{ width: `${Math.max(1, verifiedShare)}%` }}
                />
              </div>
            </>
          )}
        </Card>

        <Card title="How the returns arrived" subtitle="A channel that goes quiet is a broken channel, not a quiet region">
          {sources.length === 0 ? (
            <Empty>Nothing has arrived.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {sources.map((row) => (
                <li key={row.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-[0.875rem] text-dash-ink">
                    {SOURCE_WORDS[row.id] ?? "Channel not recorded"}
                  </span>
                  <span className="figure text-[0.9375rem] font-bold text-dash-ink">
                    {formatNumber(row.count)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card
        title="Our count against the declaration"
        subtitle="Two sources for the same places, never merged"
      >
        {comparisons.length === 0 ? (
          <Empty>
            Nothing has been declared for a place we hold returns in, so there is nothing to hold
            them against. This is the ordinary state of the first several hours.
          </Empty>
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[36rem] border-collapse text-[0.875rem]">
              <thead>
                <tr className="border-b border-dash-line text-left">
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    State
                  </th>
                  <th className="pb-2 pr-3 text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Leading, ours
                  </th>
                  <th className="pb-2 pr-3 text-right text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Our share
                  </th>
                  <th className="pb-2 pr-3 text-right text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Declared
                  </th>
                  <th className="pb-2 text-right text-[0.6875rem] font-bold tracking-[0.1em] text-dash-muted uppercase">
                    Difference
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisons.map((row) => (
                  <tr key={row.number} className="border-b border-dash-line last:border-0">
                    <td className="py-2.5 pr-3 font-semibold text-dash-ink">{row.name}</td>
                    <td className="py-2.5 pr-3">
                      <span className="inline-flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2.5 rounded-full"
                          style={{ background: PARTY_FILL[row.leader] ?? PARTY_FILL.OTH }}
                        />
                        {row.leader}
                        {!row.same && <Badge tone="warn">theirs differs</Badge>}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatShare(row.mineShare)}</td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">{formatShare(row.theirShare)}</td>
                    <td className="py-2.5 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 font-bold tabular-nums",
                          Math.abs(row.gap) > 5 ? "text-red-600" : "text-dash-ink"
                        )}
                      >
                        {row.gap >= 0 ? <ArrowUp size={13} strokeWidth={3} /> : <ArrowDown size={13} strokeWidth={3} />}
                        {formatShare(Math.abs(row.gap))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
          A difference is not an accusation and must never be broadcast as one.
        </p>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── the claims ─── */

/**
 * Claim verification.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE ENDINGS, AND THE THIRD IS THE ONE THAT GETS SKIPPED
 *
 *  A claim ends VERIFIED, FALSE or UNCONFIRMED, and the last of those is the
 *  one a desk under pressure quietly drops — because "we do not know" feels
 *  like a failure to produce something. It is not: it is the correct answer
 *  most of the time, and a desk that cannot say it will eventually say one of
 *  the other two without grounds.
 *
 *  So all three are equal here, each with the sentence that may be said out
 *  loud under it, and an unconfirmed claim can be cleared for air exactly like
 *  the other two — as an unconfirmed claim.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function Claims({ items, race, national }) {
  const { may } = useDesk();
  const { pending, said, run } = useAction();

  const [claim, setClaim] = useState("");
  const [where, setWhere] = useState("");
  const [source, setSource] = useState("");

  const claims = items.filter((item) => item.kind === "CLAIM");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[24rem_1fr]">
        <div className="space-y-4">
          <Card title="Log a claim" subtitle="Something is circulating and somebody will be asked">
            <Composer
              kind="CLAIM"
              title="Log it"
              disabled={!claim.trim()}
              values={() => ({
                title: claim.trim(),
                body: [where.trim() && `Said to be: ${where.trim()}`, source.trim() && `Seen: ${source.trim()}`]
                  .filter(Boolean)
                  .join(" · ") || null,
                race,
                payload: { where: where.trim() || null, source: source.trim() || null },
              })}
              onDrafted={() => {
                setClaim("");
                setWhere("");
                setSource("");
              }}
            >
              <Field label="What is being said">
                <textarea
                  value={claim}
                  onChange={(event) => setClaim(event.target.value)}
                  rows={3}
                  placeholder="Ballot boxes removed from a collation centre in Ward 7"
                  className={inputClass}
                />
              </Field>
              <Field label="Where it names">
                <input
                  value={where}
                  onChange={(event) => setWhere(event.target.value)}
                  placeholder="Yola North, Adamawa"
                  className={inputClass}
                />
              </Field>
              <Field label="Where it was seen" hint="A platform and a time is enough.">
                <input
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                  placeholder="Widely shared on X since about 19:40"
                  className={inputClass}
                />
              </Field>
            </Composer>
          </Card>

          <Card title="How a claim is handled">
            <ol className="space-y-2.5">
              {CLAIM_STEPS.map((step, index) => (
                <li key={step.id} className="flex gap-3">
                  <span className="figure mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-dash-ink text-[0.6875rem] font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.875rem] font-semibold text-dash-ink">
                      {step.label}
                    </span>
                    <span className="block text-[0.8125rem] leading-snug text-dash-muted">
                      {step.why}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
            {national && (
              <p className="mt-3 border-t border-dash-line pt-3 text-[0.8125rem] leading-relaxed text-dash-muted">
                The data check is the step this product is unusually good at: it holds{" "}
                {formatNumber(national.filed)} returns from named booths, with positions and
                photographed sheets behind them.
              </p>
            )}
          </Card>
        </div>

        <Card title="Claims tonight" subtitle="Each ends verified, false or unconfirmed">
          {claims.length === 0 ? (
            <Empty>No claims have been logged.</Empty>
          ) : (
            <div className="space-y-3">
              {claims.map((item) => (
                <ItemCard key={item.id} item={item}>
                  <Verdicts item={item} may={may} pending={pending} run={run} />
                </ItemCard>
              ))}
            </div>
          )}
          <Said said={said} />
        </Card>
      </div>
    </div>
  );
}

/**
 * The three answers, on the card.
 *
 * A verdict is recorded with the clearance rather than separately: the two are
 * one act — an editor deciding what may be said — and splitting them into two
 * presses is how a claim ends up cleared for air with no verdict on it.
 */
function Verdicts({ item, may, pending, run }) {
  const verdict = item.payload?.verdict ?? null;

  if (verdict) {
    const row = VERDICTS.find((option) => option.id === verdict);
    return (
      <p className="mt-3 rounded-dash-sm bg-dash-bg px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Badge tone={row?.tone ?? "neutral"}>{row?.label ?? verdict}</Badge>
        </span>
        <span className="mt-1.5 block text-[0.8125rem] leading-relaxed text-dash-muted">
          {row?.why}
        </span>
      </p>
    );
  }

  if (!may.clear || item.state !== "REVIEW") return null;

  return (
    <div className="mt-3 border-t border-dash-line pt-3">
      <p className="text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">
        The answer
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {VERDICTS.map((row) => (
          <button
            key={row.id}
            type="button"
            disabled={pending}
            title={row.why}
            onClick={() => run(() => moveItem({ id: item.id, to: "CLEARED", verdict: row.id }))}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-dash-sm border px-3 text-[0.75rem] font-bold tracking-[0.06em] uppercase transition-colors disabled:opacity-40",
              row.tone === "good"
                ? "tone-ok ink-ok hover:border-[var(--color-verified)]"
                : row.tone === "alert"
                  ? "border-red-200 bg-red-50 text-red-700 hover:border-red-600"
                  : "tone-warn ink-warn hover:border-[var(--color-flagged)]"
            )}
          >
            {pending && <Loader2 size={13} className="animate-spin" />}
            {row.label}
          </button>
        ))}
      </div>
    </div>
  );
}


