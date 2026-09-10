"use client";

import { Camera, FileCheck2, FileWarning, Fingerprint, MapPin, PenLine, ScanEye } from "lucide-react";

import { Meter, Panel, Readout, Split, Tile } from "./Figures";
import { clockLabel } from "@/lib/pulse";
import { formatNumber, formatShare } from "@/lib/utils";

/**
 * Result sheets: what arrived with the count, not what it said.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A CHECK THAT COULD NOT RUN LOOKS EXACTLY LIKE A CHECK THAT PASSED
 *
 *  Every rule in this product runs on something a return brought with it: the
 *  eight boxes at the head of the form, a photograph, a position, the
 *  signatures of the agents who stood at the booth. Where one of those was
 *  never captured the rule does not fail — it silently does not run.
 *
 *  So this screen counts evidence rather than votes. It is how a room knows
 *  how much of its own confidence is earned, and it is the screen to open
 *  before anybody quotes a figure on air.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── FIGURES, NOT PARAGRAPHS ────────────────────────────────────────────────
 * Each row is a count, a share and a bar. What each kind of evidence is *for*
 * is one short line under it, and the argument is in this comment.
 */
export default function DataQuality({ pulse, sheets = null, ground = null }) {
  const capture = pulse.capture;
  const total = capture.total || 0;
  const share = (part) => (total ? (part / total) * 100 : 0);
  const reads = sheets;

  const rows = [
    {
      id: "boxes",
      icon: FileCheck2,
      label: "The form's eight boxes",
      value: capture.boxes,
      foot: "Without them the sheet cannot be checked against itself",
    },
    {
      id: "photographed",
      icon: Camera,
      label: "Photograph attached",
      value: capture.photographed,
      foot: "The pixels every figure was read off",
    },
    {
      id: "compared",
      icon: ScanEye,
      label: "Photograph compared to the figures",
      value: capture.compared,
      foot: "An unread attachment is not corroboration",
    },
    {
      id: "serial",
      icon: Fingerprint,
      label: "Sheet serial number",
      value: capture.serial,
      foot: "Proves two returns came off two sheets, not one twice",
    },
    {
      id: "position",
      icon: MapPin,
      label: "Position on the return",
      value: capture.position,
      foot: "Corroborates a return; never authorises one",
    },
    {
      id: "signatures",
      icon: PenLine,
      label: "Party agents who signed",
      value: capture.signatures,
      foot: "The witness record for this booth",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* --------------------------------------------------------- KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Returns on file"
          value={formatNumber(total)}
          foot={ground ?? "This ground"}
        />
        <Tile
          label="Auditable sheets"
          value={formatNumber(pulse.sheets.audited)}
          of={total ? formatNumber(total) : null}
          share={share(pulse.sheets.audited)}
          foot="Carrying the boxes the arithmetic needs"
        />
        <Tile
          icon={FileWarning}
          label="Out of balance"
          value={pulse.sheets.audited ? formatNumber(pulse.sheets.fails) : "—"}
          of={pulse.sheets.audited ? formatNumber(pulse.sheets.audited) : null}
          share={
            pulse.sheets.audited ? (pulse.sheets.fails / pulse.sheets.audited) * 100 : null
          }
          tone={pulse.sheets.fails ? "warn" : "ink"}
          foot="Denominator is auditable returns, never all of them"
        />
        <Tile
          label="Machine readings accepted"
          value={reads?.total ? formatNumber(reads.accepted) : "—"}
          of={reads?.total ? formatNumber(reads.total) : null}
          share={reads?.total ? (reads.accepted / reads.total) * 100 : null}
          foot={
            reads?.confidence == null
              ? "No reader confidence on file"
              : `${formatShare(reads.confidence * 100)} average confidence`
          }
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* ------------------------------------------------------- evidence */}
        <Panel
          title="What arrived with each return"
          figure={total ? `${formatNumber(total)} returns` : "nothing filed"}
        >
          {total ? (
            <ul className="space-y-3">
              {rows.map((row) => {
                const Icon = row.icon;
                const pct = share(row.value);
                return (
                  <li key={row.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-baseline gap-2">
                        <Icon
                          size={14}
                          strokeWidth={2.25}
                          className="shrink-0 translate-y-0.5 text-dash-muted"
                        />
                        <span className="truncate text-[0.8125rem] font-semibold text-dash-ink">
                          {row.label}
                        </span>
                      </span>
                      <span className="figure shrink-0 text-[0.8125rem] font-bold text-dash-ink tabular-nums">
                        {formatNumber(row.value)}
                        <span className="ml-1.5 font-normal text-dash-muted">
                          {formatShare(pct)}
                        </span>
                      </span>
                    </div>
                    <Meter
                      share={pct}
                      height={6}
                      className="mt-1"
                      tone={pct >= 80 ? "good" : pct >= 40 ? "warn" : "alert"}
                    />
                    <p className="mt-1 text-[0.6875rem] text-dash-muted">{row.foot}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[0.8125rem] text-dash-muted">
              This fills in as returns land, and it is the screen to read before quoting any of them.
            </p>
          )}
        </Panel>

        <div className="flex flex-col gap-3">
          {/* -------------------------------------------------------- readers */}
          <Panel
            title="Machine readers"
            figure={reads?.total ? formatNumber(reads.total) : "none"}
            foot={reads?.byReader?.length > 1 ? "Never pooled: three machines, three sets of eyes." : null}
          >
            {reads?.total ? (
              <>
                <Split
                  segments={reads.byReader.map((row) => ({
                    id: row.reader,
                    label: row.reader,
                    value: row.total,
                  }))}
                />
                <div className="mt-3 space-y-0.5">
                  {reads.byReader.map((row) => (
                    <Readout
                      key={row.reader}
                      label={row.reader}
                      value={
                        row.confidence == null ? "—" : formatShare(row.confidence * 100)
                      }
                      sub={`${formatNumber(row.accepted)} accepted`}
                    />
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[0.8125rem] text-dash-muted">
                Every figure was typed by a person. The machine earns its place at volume, not at
                accuracy.
              </p>
            )}
          </Panel>

          <Panel title="Freshness">
            <div className="space-y-0.5">
              <Readout
                label="Since the last return"
                value={clockLabel(pulse.clocks.quietMinutes)}
                tone={pulse.clocks.quietMinutes > 45 ? "warn" : "ink"}
              />
              <Readout label="First return" value={stamp(pulse.clocks.first)} />
              <Readout label="Newest return" value={stamp(pulse.clocks.last)} />
            </div>
          </Panel>

          {/* ── NAMED GAPS, NOT A ROADMAP ─────────────────────────────────
              A dashboard that shows only what it has teaches the room that
              what it has is everything. The first time somebody asks about
              the commission's uploads, the answer should already be on the
              screen. Four lines, no paragraphs. */}
          <Panel title="Not held">
            <ul className="space-y-1.5 text-[0.75rem] text-dash-muted">
              <li>· IReV uploads — no comparison to the commission&rsquo;s own copy</li>
              <li>· Blind double entry — every return is typed once</li>
              <li>· Census and demographics — modelling inputs are generated, and say so</li>
              <li>· Per-booth process checklists — only reports somebody filed</li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}

const stamp = (date) =>
  date
    ? new Intl.DateTimeFormat("en-NG", {
        hour: "2-digit",
        minute: "2-digit",
        day: "numeric",
        month: "short",
        hour12: false,
      }).format(new Date(date))
    : "—";
