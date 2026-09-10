"use client";

import { AlertTriangle, ArrowUpRight, FileWarning, Scale, ShieldCheck } from "lucide-react";

import { Finding } from "./DivergencePanel";
import { Panel, Readout, Split, Tile } from "./Figures";
import { SEVERITY } from "@/lib/anomalies";
import { EC8A_BOXES } from "@/lib/results";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * The integrity console: one screen, three questions, kept apart.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE DECLARED COMPARISON LIVES HERE NOW
 *
 *  These were two tabs, and the split was the wrong one. A room asking "can
 *  this return be true" and a room asking "does it match what was announced"
 *  is the same room, at the same moment, doing one job — and the answer is
 *  usually a combination of the two: a booth whose arithmetic fails *and*
 *  whose ward was declared differently is a far stronger finding than either
 *  half alone, and nobody could see both at once.
 *
 *  So the three questions sit side by side, weakest to strongest evidence:
 *
 *    THE FIGURES      against the register and the booths nearby.
 *                                                       lib/anomalies.js
 *    THE PAPER        does the sheet agree with itself?  lib/results.js
 *    THE DECLARATION  does our count match the announcement?
 *                                                       lib/divergence.js
 *
 *  The middle one is the strongest and the one most rooms never look at,
 *  because it needs the boxes at the head of the form to have been captured.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── NOTHING HERE ACCUSES ANYBODY ───────────────────────────────────────────
 * Every line states arithmetic and stops. "640 accredited at a booth with 500
 * registered" is checkable against the sheet by anyone and survives a lawyer;
 * "suspected rigging" is an accusation this system has no standing to make,
 * and the first one that turned out to be a typo would discredit every true
 * finding after it.
 */
export default function RoomIntegrity({ integrity, sheets = [], pulse, divergence, onGo }) {
  const audited = pulse?.sheets?.audited ?? 0;
  const fails = pulse?.sheets?.fails ?? 0;
  const gap = divergence ?? { ready: false, flags: [], urgent: [] };
  const share = (part, whole) => (whole ? (part / whole) * 100 : 0);

  /* The flags by class, worst first. A distribution rather than a total: four
     outliers and one impossible are the same "5 findings" and nothing like the
     same night. */
  const spread = ["IMPOSSIBLE", "IMPLAUSIBLE", "OUTLIER", "PATTERN"]
    .map((key) => ({
      id: key,
      label: SEVERITY[key].label,
      value: integrity.flags.filter((flag) => flag.severity === key).length,
      color:
        SEVERITY[key].tone === "alert"
          ? "var(--color-red-500)"
          : SEVERITY[key].tone === "warn"
            ? "var(--color-amber-500)"
            : "var(--color-ink-400)",
    }))
    .filter((row) => row.value > 0);

  return (
    <div className="flex flex-col gap-3">
      {/* --------------------------------------------------------- KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Tile
          icon={ShieldCheck}
          label="Screened"
          value={formatNumber(integrity.screened)}
          share={share(integrity.clean, integrity.screened)}
          tone={integrity.screened ? "good" : "ink"}
          foot={`${formatNumber(integrity.clean)} passed every check`}
        />
        <Tile
          icon={AlertTriangle}
          label="Cannot be right"
          value={formatNumber(integrity.impossible)}
          of={integrity.screened ? formatNumber(integrity.screened) : null}
          share={share(integrity.impossible, integrity.screened)}
          tone={integrity.impossible ? "alert" : "ink"}
          foot="Broken arithmetic. No innocent reading"
        />
        <Tile
          icon={FileWarning}
          label="Sheets out of balance"
          value={audited ? formatNumber(fails) : "—"}
          of={audited ? formatNumber(audited) : null}
          share={share(fails, audited)}
          tone={fails ? "warn" : "ink"}
          foot={audited ? "Of returns carrying the form's boxes" : "No boxes captured yet"}
        />
        <Tile
          icon={Scale}
          label="Places differing"
          value={gap.ready ? formatNumber(gap.places) : "—"}
          of={gap.ready ? formatNumber(gap.compared) : null}
          share={gap.ready ? share(gap.places, gap.compared) : null}
          tone={gap.places ? "warn" : "ink"}
          foot={gap.ready ? `${formatNumber(gap.tooThin)} too thin to compare` : "Nothing declared"}
          onClick={() => onGo?.("results")}
        />
        <Tile
          icon={Scale}
          label="Winner differs"
          value={gap.ready ? formatNumber(gap.flipped) : "—"}
          tone={gap.flipped ? "alert" : "ink"}
          foot={`${formatNumber(gap.urgent?.length ?? 0)} findings ring the alarm`}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
        {/* ------------------------------------------------------- findings */}
        <Panel
          title="The figures"
          figure={
            integrity.flags.length
              ? `${formatNumber(integrity.flagged)} of ${formatNumber(integrity.screened)} flagged`
              : integrity.screened
                ? "all clear"
                : "nothing filed"
          }
          className="flex min-h-0 flex-col"
        >
          {spread.length > 0 && <Split segments={spread} />}

          {integrity.flags.length ? (
            <ul className="mt-3 max-h-96 divide-y divide-dash-line/60 overflow-y-auto">
              {integrity.flags.slice(0, 40).map((flag) => (
                <li key={flag.id} className="py-2">
                  <div className="flex items-center gap-2">
                    <Chip tone={SEVERITY[flag.severity].tone}>{SEVERITY[flag.severity].label}</Chip>
                    <span className="figure truncate text-[0.6875rem] text-dash-muted">
                      {flag.unitCode}
                    </span>
                  </div>
                  <p className="mt-1 text-[0.8125rem] font-semibold text-dash-ink">{flag.says}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[0.8125rem] text-dash-muted">
              {integrity.screened
                ? "Every return is arithmetically sound and in step with its neighbours."
                : "Screening starts with the first return."}
            </p>
          )}
        </Panel>

        {/* ---------------------------------------------------------- paper */}
        <Panel
          title="The paper"
          figure={audited ? `${formatShare(share(fails, audited))} out of balance` : null}
        >
          <div className="space-y-0.5">
            <Readout
              label="Returns carrying the form's boxes"
              value={formatNumber(pulse?.capture?.boxes ?? 0)}
              sub={`of ${formatNumber(pulse?.capture?.total ?? 0)}`}
            />
            <Readout
              label="Photograph compared to the figures"
              value={formatNumber(pulse?.capture?.compared ?? 0)}
              sub={`of ${formatNumber(pulse?.capture?.photographed ?? 0)} attached`}
            />
            <Readout
              label="Sheet serial captured"
              value={formatNumber(pulse?.capture?.serial ?? 0)}
            />
          </div>

          {sheets.length ? (
            <ul className="mt-3 max-h-96 divide-y divide-dash-line/60 overflow-y-auto">
              {sheets.map((sheet) => (
                <li key={sheet.unitCode} className="py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="figure truncate text-[0.8125rem] font-bold text-dash-ink">
                      {sheet.unitCode}
                    </span>
                    <span className="figure shrink-0 text-[0.75rem] font-bold text-amber-600 tabular-nums">
                      {sheet.worst > 0 ? `out by ${formatNumber(sheet.worst)}` : "inconsistent"}
                    </span>
                  </div>
                  <p className="text-[0.6875rem] text-dash-muted">
                    {sheet.state ?? "—"}
                    {sheet.formSerial ? ` · ${sheet.formSerial}` : ""}
                    {sheet.culprit ? ` · box ${sheet.culprit}: ${EC8A_BOXES[sheet.culprit]}` : ""}
                  </p>
                  <p className="mt-0.5 text-[0.8125rem] text-dash-ink">
                    {sheet.findings[0]?.says}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-[0.8125rem] text-dash-muted">
              {audited
                ? "Every sheet whose boxes we hold adds up."
                : "This check needs the eight boxes at the head of the form."}
            </p>
          )}
        </Panel>

        {/* ---------------------------------------------------- declaration */}
        <Panel
          title="The declaration"
          figure={gap.ready ? `${formatNumber(gap.compared)} places compared` : "nothing declared"}
          className="xl:col-span-2 2xl:col-span-1"
        >
          {gap.ready ? (
            <>
              <div className="space-y-0.5">
                <Readout label="Agreeing" value={formatNumber(gap.agreeing)} tone="good" />
                <Readout
                  label="Figures differ"
                  value={formatNumber(gap.divergent)}
                  tone={gap.divergent ? "warn" : "ink"}
                />
                <Readout
                  label="Winner differs"
                  value={formatNumber(gap.flipped)}
                  tone={gap.flipped ? "alert" : "ink"}
                />
                <Readout
                  label="Impossible against the declaration"
                  value={formatNumber(gap.impossible)}
                  tone={gap.impossible ? "alert" : "ink"}
                />
                <Readout label="Too thin to compare" value={formatNumber(gap.tooThin)} />
                <Readout label="Declared, nothing from us" value={formatNumber(gap.unmatched)} />
              </div>

              {gap.flags.length > 0 && (
                <ul className="mt-3 max-h-80 divide-y divide-dash-line/60 overflow-y-auto">
                  {gap.flags.slice(0, 8).map((flag) => (
                    <Finding key={flag.id} flag={flag} compact />
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[0.8125rem] text-dash-muted">
              {formatNumber(gap.ourReturns ?? 0)} return
              {gap.ourReturns === 1 ? "" : "s"} on file. The comparison starts the moment collation
              announces a ward, a local government or a state.
            </p>
          )}

          <a
            href="/gap"
            className="mt-3 flex items-center gap-1.5 text-[0.75rem] font-semibold text-dash-ink underline underline-offset-4"
          >
            <ArrowUpRight size={13} strokeWidth={2.5} />
            Every finding, and enter what was declared
          </a>
        </Panel>
      </div>
    </div>
  );
}

function Chip({ tone, children }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-bold uppercase",
        tone === "alert"
          ? "bg-red-50 text-red-700"
          : tone === "warn"
            ? "bg-amber-50 text-amber-800"
            : "bg-dash-bg text-dash-muted"
      )}
    >
      {children}
    </span>
  );
}
