"use client";

import { useState } from "react";
import { Camera, ScanLine, ShieldCheck } from "lucide-react";

import RoomIntegrity from "./RoomIntegrity";
import DataQuality from "./DataQuality";
import { Donut, Funnel, Gauge, Panel } from "./Figures";
import { cn, formatNumber, formatShare } from "@/lib/utils";

/**
 * Whether a return can be believed — the arithmetic and the paper.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY VERIFICATION AND THE RESULT SHEETS WERE ONE QUESTION ALL ALONG
 *
 *  Verification asked whether a return's figures can be true: does it add up,
 *  does it exceed its own register, does it match what was declared. Result
 *  sheets asked what the return arrived carrying: a photograph, the boxes read
 *  back, a position, signatures.
 *
 *  Two tabs, and the split was exactly backwards. Neither half decides
 *  anything on its own. A return that fails its own arithmetic and arrived
 *  with no photograph is a return nobody can check and nobody should publish.
 *  The same failed arithmetic with a clear photograph of the EC8A is a
 *  five-minute job for somebody at a desk. Identical on the first screen,
 *  opposite instructions, and the thing that told them apart was on the other
 *  tab.
 *
 *  So they are one console. The finding and the evidence for it are on the
 *  same screen, which is the only arrangement in which either is actionable.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── THE BAND ACROSS THE TOP ────────────────────────────────────────────────
 * Both halves were written in counts and percentages, and a wall of those
 * reads as a report rather than an instrument. The three shapes at the top say
 * how much of the count has been screened, what the screening found, and how
 * much of it arrived with evidence attached — before a digit has been read.
 */

const HALVES = [
  { id: "findings", label: "What the checks found", icon: ShieldCheck },
  { id: "evidence", label: "What arrived with it", icon: Camera },
];

export default function RoomEvidence({
  integrity = { flags: [], impossible: 0, flagged: 0, screened: 0, clean: 0 },
  sheetFindings = [],
  sheetReads = null,
  pulse,
  divergence = null,
  ground = null,
  onGo,
}) {
  const [half, setHalf] = useState("findings");

  const screened = integrity.screened ?? 0;
  const clean = integrity.clean ?? 0;
  const flagged = integrity.flagged ?? 0;
  const impossible = integrity.impossible ?? 0;

  /* What arrived with each return, as a ladder: every step is a subset of the
     one above it, which is what makes the drop between two of them a real
     loss rather than two differently-sourced figures disagreeing. */
  const capture = pulse?.capture ?? {};
  const filed = capture.total ?? pulse?.filed ?? 0;

  const evidence = [
    { id: "filed", label: "Returns filed", count: filed, why: "Every return this project holds." },
    {
      id: "photographed",
      label: "With a photograph",
      count: capture.photographed ?? 0,
      why: "A picture of the result sheet came with the figures.",
    },
    {
      id: "boxes",
      label: "Boxes read back",
      count: capture.boxes ?? 0,
      why: "The figures on the sheet were read and compared with what was typed.",
    },
    {
      id: "signatures",
      label: "Signed",
      count: capture.signatures ?? 0,
      why: "A presiding officer's signature is on the sheet.",
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* ─────────────────────────────────────────────────── the picture band */}
      <div className="grid gap-3 lg:grid-cols-[15rem_minmax(0,1fr)_minmax(0,1fr)]">
        <Panel
          title="Screened"
          figure={`${formatNumber(screened)} of ${formatNumber(filed || screened)}`}
          foot={
            screened
              ? `${formatNumber(clean)} passed every check`
              : "Nothing has been filed yet to screen"
          }
        >
          <Gauge
            share={screened ? (clean / screened) * 100 : 0}
            figure={screened ? formatShare((clean / screened) * 100) : "—"}
            sub="pass every check"
            /* Red the moment anything is arithmetically impossible: that is
               not a quality score, it is a return that cannot be true. */
            tone={impossible ? "alert" : flagged ? "warn" : "good"}
          />
        </Panel>

        <Panel
          title="What the checks found"
          figure={formatNumber(flagged + impossible)}
          foot="Impossible is a return that cannot be true. Flagged is one worth a look."
        >
          {screened ? (
            <Donut
              segments={[
                { id: "clean", label: "Clean", value: clean, color: "var(--color-emerald-500)" },
                { id: "flagged", label: "Flagged", value: flagged, color: "var(--color-amber-500)" },
                { id: "impossible", label: "Impossible", value: impossible, color: "var(--color-red-500)" },
              ].filter((part) => part.value > 0)}
              total={screened}
              centre={
                <span className="text-center">
                  <span className="figure block text-[1.5rem] leading-none font-bold text-dash-ink tabular-nums">
                    {formatNumber(screened)}
                  </span>
                  <span className="mt-1 block text-[0.625rem] text-dash-muted">screened</span>
                </span>
              }
            />
          ) : (
            <p className="text-[0.875rem] text-dash-muted">Nothing filed yet to screen.</p>
          )}
        </Panel>

        <Panel
          title="What arrived with the figures"
          figure={filed ? formatShare(((capture.photographed ?? 0) / filed) * 100) : "—"}
          foot="Each step is a subset of the one above it, so every drop is a real loss."
        >
          {filed ? (
            <Funnel stages={evidence} />
          ) : (
            <p className="text-[0.875rem] text-dash-muted">Nothing has been filed yet.</p>
          )}
        </Panel>
      </div>

      {/* ───────────────────────────────────────────────────────── the detail */}
      <div className="flex gap-1 rounded-dash border border-dash-line bg-dash-card p-1">
        {HALVES.map((item) => {
          const count = item.id === "findings" ? integrity.flags?.length ?? 0 : sheetFindings.length;
          const active = half === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setHalf(item.id)}
              aria-pressed={active}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-dash-sm px-3 py-2 text-[0.8125rem] font-bold transition-colors",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dash-ink",
                active ? "bg-dash-ink text-white" : "text-dash-muted hover:bg-dash-bg hover:text-dash-ink"
              )}
            >
              <item.icon size={15} strokeWidth={2.25} />
              {item.label}
              {count > 0 && (
                <span
                  className={cn(
                    "figure rounded-full px-1.5 py-0.5 text-[0.6875rem] tabular-nums",
                    active ? "bg-white/20" : "bg-dash-bg"
                  )}
                >
                  {formatNumber(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {half === "findings" ? (
        <RoomIntegrity
          integrity={integrity}
          sheets={sheetFindings}
          pulse={pulse}
          divergence={divergence}
          onGo={onGo}
        />
      ) : (
        <DataQuality pulse={pulse} sheets={sheetReads} ground={ground} />
      )}

      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[0.75rem] text-dash-muted">
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={12} strokeWidth={2.5} />
          A finding is never a result being changed — it is a result being questioned
        </span>
        <span className="flex items-center gap-1.5">
          <ScanLine size={12} strokeWidth={2.5} />
          Machine reads are checked by a person before anything is verified
        </span>
      </p>
    </div>
  );
}
