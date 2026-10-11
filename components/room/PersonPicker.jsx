"use client";

import { useState, useTransition } from "react";

import { findPerson } from "@/app/room/actions";

/**
 * Find one person on the roster by name, phone or the party's reference, and
 * put them into the form this sits in as `person`.
 *
 * A search and a pick, never a typed id: the form posts the id of somebody
 * the server just returned, and the server looks them up again regardless.
 */
export default function PersonPicker({ name = "person", label = "Person" }) {
  const [text, setText] = useState("");
  const [found, setFound] = useState([]);
  const [picked, setPicked] = useState(null);
  const [pending, start] = useTransition();

  const search = (value) => {
    setText(value);
    setPicked(null);
    if (value.trim().length < 2) return setFound([]);
    start(async () => setFound(await findPerson(value)));
  };

  return (
    <div className="relative">
      <label className="block text-[0.8125rem] font-semibold text-dash-ink">
        {label}
        <input
          value={picked ? picked.name : text}
          onChange={(event) => search(event.target.value)}
          placeholder="Name, phone or party reference"
          autoComplete="off"
          className="mt-1 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] font-normal"
        />
      </label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {!picked && text.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-dash-sm border border-dash-line bg-dash-card shadow-e2">
          {found.map((person) => (
            <li key={person.id}>
              <button type="button" onClick={() => setPicked(person)} className="block w-full px-3 py-2 text-left text-[0.8125rem] hover:bg-dash-bg">
                <span className="font-semibold text-dash-ink">{person.name}</span>
                <span className="text-dash-muted"> · {person.kind === "WARD_COORDINATOR" ? "ward coordinator" : "agent"} · +{person.phone} {person.unitCode ? `· ${person.unitCode}` : "· no unit yet"}</span>
              </button>
            </li>
          ))}
          {!found.length && <li className="px-3 py-2 text-[0.8125rem] text-dash-muted">{pending ? "Looking…" : "Nobody on the roster matches."}</li>}
        </ul>
      )}
    </div>
  );
}
