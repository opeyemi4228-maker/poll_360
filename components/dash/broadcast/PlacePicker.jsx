"use client";

import { useEffect, useState } from "react";

import { STATE_POINTS } from "@/lib/stamp";
import { cn } from "@/lib/utils";

/**
 * Where a post is about: the country, a state, a local government, a ward or
 * one polling unit.
 *
 * The four lower levels read the published register for the chosen state
 * (public/geo/units/NN.json) — the same file the field uses — so every ward
 * and booth offered is one that exists, named as INEC names it.
 */

const LEVELS = [
  { id: "nation", label: "Nationwide" },
  { id: "state", label: "State" },
  { id: "lga", label: "LGA" },
  { id: "ward", label: "Ward" },
  { id: "unit", label: "Polling unit" },
];

const STATES = Object.entries(STATE_POINTS)
  .map(([number, row]) => ({ number, name: row.name }))
  .sort((a, b) => a.name.localeCompare(b.name));

/* One fetch per state per page, shared by every picker on it. */
const books = new Map();
function loadBook(number) {
  if (!books.has(number)) {
    books.set(
      number,
      fetch(`/geo/units/${number}.json`)
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)
    );
  }
  return books.get(number);
}

/** Split a scope back into its parts. */
function partsOf(scope) {
  if (!scope || scope === "NATION") return { level: "nation" };
  const [head, rest = ""] = scope.split(":");
  const [state, lga, ward, unit] = rest.split("/");
  return { level: { STATE: "state", LGA: "lga", WARD: "ward", UNIT: "unit" }[head] ?? "nation", state, lga, ward, unit };
}

function scopeOf({ level, state, lga, ward, unit }) {
  if (level === "nation" || !state) return "NATION";
  if (level === "state" || !lga) return `STATE:${state}`;
  if (level === "lga" || !ward) return `LGA:${state}/${lga}`;
  if (level === "ward" || !unit) return `WARD:${state}/${lga}/${ward}`;
  return `UNIT:${state}/${lga}/${ward}/${unit}`;
}

export default function PlacePicker({ value, onChange, filedByState = {} }) {
  const [pick, setPick] = useState(() => ({ ...partsOf(value) }));
  const [book, setBook] = useState(null);

  /* Loading the register is a subscription to something outside React —
     the network — which is what an effect is for. */
  useEffect(() => {
    let live = true;
    if (!pick.state || pick.level === "nation" || pick.level === "state") return undefined;
    loadBook(pick.state).then((data) => {
      if (live) setBook(data);
    });
    return () => {
      live = false;
    };
  }, [pick.state, pick.level]);

  const update = (next) => {
    const merged = { ...pick, ...next };
    setPick(merged);
    onChange(scopeOf(merged));
  };

  const lgas = book?.lgas ?? [];
  const lga = lgas.find((row) => row.n === pick.lga);
  const wards = lga?.wards ?? [];
  const ward = wards.find((row) => row.n === pick.ward);
  const units = ward?.units ?? [];
  const depth = LEVELS.findIndex((row) => row.id === pick.level);

  const select = "mt-1.5 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] text-dash-ink";

  return (
    <div>
      <span className="block text-[0.75rem] font-semibold tracking-[0.08em] text-dash-muted uppercase">Where</span>
      <div className="mt-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label="Level">
        {LEVELS.map((row) => (
          <button
            key={row.id}
            type="button"
            role="radio"
            aria-checked={pick.level === row.id}
            onClick={() => update({ level: row.id })}
            className={cn(
              "h-8 rounded-full border px-3 text-[0.75rem] font-semibold",
              pick.level === row.id ? "border-dash-ink bg-dash-ink text-white" : "border-dash-line text-dash-muted hover:text-dash-ink"
            )}
          >
            {row.label}
          </button>
        ))}
      </div>

      {depth >= 1 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="block text-[0.6875rem] font-semibold text-dash-muted">
            State
            <select
              value={pick.state ?? ""}
              onChange={(event) => update({ state: event.target.value || undefined, lga: undefined, ward: undefined, unit: undefined })}
              className={select}
            >
              <option value="">Choose a state</option>
              {STATES.map((row) => (
                <option key={row.number} value={row.number}>
                  {row.name}
                  {filedByState[row.number] ? ` · ${filedByState[row.number]} in` : ""}
                </option>
              ))}
            </select>
          </label>
          {depth >= 2 && (
            <label className="block text-[0.6875rem] font-semibold text-dash-muted">
              LGA
              <select
                value={pick.lga ?? ""}
                disabled={!lgas.length}
                onChange={(event) => update({ lga: event.target.value || undefined, ward: undefined, unit: undefined })}
                className={select}
              >
                <option value="">{pick.state ? (lgas.length ? "Choose an LGA" : "Loading…") : "Choose a state first"}</option>
                {lgas.map((row) => (
                  <option key={row.n} value={row.n}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {depth >= 3 && (
            <label className="block text-[0.6875rem] font-semibold text-dash-muted">
              Ward
              <select
                value={pick.ward ?? ""}
                disabled={!wards.length}
                onChange={(event) => update({ ward: event.target.value || undefined, unit: undefined })}
                className={select}
              >
                <option value="">{wards.length ? "Choose a ward" : "Choose an LGA first"}</option>
                {wards.map((row) => (
                  <option key={row.n} value={row.n}>
                    {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {depth >= 4 && (
            <label className="block text-[0.6875rem] font-semibold text-dash-muted">
              Polling unit
              <select
                value={pick.unit ?? ""}
                disabled={!units.length}
                onChange={(event) => update({ unit: event.target.value || undefined })}
                className={select}
              >
                <option value="">{units.length ? "Choose a polling unit" : "Choose a ward first"}</option>
                {units.map((row) => (
                  <option key={row.n} value={row.n}>
                    {row.n} · {row.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
