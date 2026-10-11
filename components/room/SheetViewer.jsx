"use client";

import { useState } from "react";
import { RotateCw, ZoomIn, ZoomOut } from "lucide-react";

/**
 * The photographed sheet, to be read by a person: closer, turned, and with
 * the contrast pulled up for a sheet photographed by torchlight.
 *
 * It changes how the picture is shown and never the picture. The file served
 * is the file that was filed.
 */
export default function SheetViewer({ unit, facts = [] }) {
  const [zoom, setZoom] = useState(1);
  const [turn, setTurn] = useState(0);
  const [contrast, setContrast] = useState(100);
  const [missing, setMissing] = useState(false);
  const button = "inline-flex size-9 items-center justify-center rounded-dash-sm border border-dash-line bg-dash-card text-dash-ink hover:border-dash-ink";

  if (missing) {
    return <p className="rounded-dash-sm bg-dash-bg p-6 text-center text-[0.875rem] text-dash-muted">No photograph of the sheet is held for this polling unit.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={button} onClick={() => setZoom((value) => Math.min(4, value + 0.5))} aria-label="Closer"><ZoomIn size={16} /></button>
        <button type="button" className={button} onClick={() => setZoom((value) => Math.max(1, value - 0.5))} aria-label="Further"><ZoomOut size={16} /></button>
        <button type="button" className={button} onClick={() => setTurn((value) => (value + 90) % 360)} aria-label="Turn"><RotateCw size={16} /></button>
        <label className="flex items-center gap-2 text-[0.8125rem] font-semibold text-dash-ink">
          Contrast
          <input type="range" min="60" max="220" value={contrast} onChange={(event) => setContrast(Number(event.target.value))} />
        </label>
      </div>
      <div className="mt-2 max-h-[32rem] overflow-auto rounded-dash-sm bg-dash-bg">
        {/* A plain img: the bytes are private, per-user and must not pass
            through an image optimiser's cache. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/room/sheet?unit=${encodeURIComponent(unit)}`}
          alt={`Photographed result sheet for polling unit ${unit}`}
          onError={() => setMissing(true)}
          style={{ width: `${zoom * 100}%`, maxWidth: "none", transform: `rotate(${turn}deg)`, filter: `contrast(${contrast}%)`, transformOrigin: "center" }}
        />
      </div>
      {facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[0.8125rem] sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-dash-muted">{label}</dt>
              <dd className="font-semibold text-dash-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
