"use client";

import { useRef, useState } from "react";
import { Check, MapPin } from "lucide-react";

import Field, { fieldInput, fieldSelect } from "./Field";

/**
 * Where the agent is, in INEC's own terms.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  This replaced a single box that said "01/01/04/006" and hoped. Nine digits
 *  copied off a form, at night, on a phone, was the likeliest thing on the
 *  sign-up form to be wrong — and a wrong unit code is the worst kind of wrong
 *  this product has, because it does not fail. It files a real return against
 *  a booth in the wrong ward, and the map looks entirely normal.
 *
 *  So the two halves we can check are now chosen rather than typed. The state
 *  and the local government come from lists, by name, and the code assembles
 *  itself underneath where the agent can read it back against the sheet in
 *  their hand.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY WARD AND UNIT ARE STILL NUMBERS ────────────────────────────────────
 * Because we do not have their names. INEC has around 8,800 wards and 176,000
 * polling units; this repository holds a list of neither, and filling two more
 * dropdowns with invented names would be worse than leaving them out — a wrong
 * ward name printed beside a right ward number reads as confirmation.
 *
 * They are asked for as the numbers printed on the agent's own sheet, and each
 * has an optional box for the name. What is written there is a claim, is
 * stored as a claim, and reaches the person approving them as one more thing
 * to hold against the appointment list.
 *
 * ── IT WORKS WITH THE SCRIPT SWITCHED OFF ──────────────────────────────────
 * That is not a nicety on this form. Its users are on cheap handsets on rural
 * networks, and a picker that quietly submits nothing when a script fails to
 * load is an agent who cannot file on the morning it matters.
 *
 * So every part is a real named field — `state`, `lga`, `ward`, `unit` — and
 * the server assembles the code from them. Nothing is carried in a hidden
 * input that only JavaScript fills. Two consequences follow, both deliberate:
 *
 *   · The local government list is rendered *whole*, all 774 grouped by state,
 *     and narrowed to one state's worth once a state is chosen. Without a
 *     script the full grouped list is still there to scroll; with one it is a
 *     short list. Cascading by fetching would have left the no-script path
 *     with an empty select.
 *
 *   · The value of a local government is "SS/LL" and not "LL", so the choice
 *     carries its own state. The two can then never disagree, which they could
 *     if the state were read from one field and the local government from
 *     another.
 *
 * Nothing here is marked `required`. The browser would enforce it before the
 * escape hatch below could be used, and somebody who has their full code
 * should not be made to walk the dropdowns to give it.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function UnitPicker({ places = [], values = {}, errors = {} }) {
  const [stateNumber, setStateNumber] = useState(values.state ?? "");
  /* "SS/LL". Held whole, split only where a part is needed. */
  const [lga, setLga] = useState(values.lga ?? "");
  const [ward, setWard] = useState(values.ward ?? "");
  const [unit, setUnit] = useState(values.unit ?? "");
  const [typed, setTyped] = useState("");
  const [readBack, setReadBack] = useState(null);

  const details = useRef(null);

  const chosen = places.find((row) => row.number === stateNumber) ?? null;

  /* A local government only counts as chosen while it belongs to the state on
     screen. Changing the state clears it, so this is belt and braces — but it
     is the guard that stops a stale "25/13" being read as Nasarawa's 13th. */
  const inState = Boolean(stateNumber) && lga.startsWith(`${stateNumber}/`);
  const lgaNumber = inState ? lga.split("/")[1] : "";
  const lgaName = chosen && lgaNumber ? (chosen.lgas[Number(lgaNumber) - 1] ?? null) : null;

  const parts = [stateNumber, lgaNumber, pad(ward, 2), pad(unit, 3)];
  const complete = parts.every(Boolean);

  /* ── READING A WHOLE CODE BACK INTO THE PICKERS ──────────────────────────
     Somebody holding the sheet would rather type nine digits than walk two
     dropdowns, and they are right. What they get for it is the check they came
     for: the code they typed turns into a state and a local government with
     names on them, so a transposed digit stops being nine digits that look
     like any other nine digits and starts being the wrong town.

     The typed box is emptied once it has been read. The parts are the only
     thing submitted after that, and there is no second copy of the answer left
     behind to disagree with them. */
  function readWholeCode(raw) {
    setTyped(raw);

    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 9) return;

    const [s, l, w, u] = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6), digits.slice(6, 9)];

    const found = places.find((row) => row.number === s);
    /* A state we cannot name, or a local government that state does not have.
       Left in the box exactly as typed rather than half-applied: the server
       says what is wrong with it in a sentence, which is better than a picker
       silently settling on something adjacent. */
    if (!found?.lgas[Number(l) - 1]) return;

    setStateNumber(s);
    setLga(`${s}/${l}`);
    setWard(w);
    setUnit(u);
    setTyped("");
    setReadBack(`${s}/${l}/${w}/${u}`);
    details.current?.removeAttribute("open");
  }

  return (
    <fieldset className="space-y-5 border-t-2 border-ink-200 pt-6">
      <legend className="sr-only">Your polling unit</legend>

      <div className="flex items-baseline gap-2">
        <MapPin size={15} strokeWidth={2.5} className="shrink-0 translate-y-0.5 text-ink-500" />
        <p className="text-[0.9375rem] leading-relaxed text-content-muted">
          The booth you were appointed to. Every return you ever file is attached to it, so it is
          the one thing on this form worth checking twice.
        </p>
      </div>

      <Field label="State" error={errors.state} name="state">
        {(id) => (
          <select
            id={id}
            name="state"
            value={stateNumber}
            onChange={(event) => {
              setStateNumber(event.target.value);
              /* The local government belonged to the old state. Keeping it
                 would leave a number on screen that means a different place. */
              setLga("");
              setReadBack(null);
            }}
            className={fieldSelect(errors.state)}
          >
            <option value="">Choose your state</option>
            {places.map((place) => (
              <option key={place.number} value={place.number}>
                {place.name}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        label="Local government"
        hint={chosen ? `${chosen.lgas.length} in ${chosen.name}` : undefined}
        error={errors.lga}
        name="lga"
      >
        {(id) => (
          <select
            id={id}
            name="lga"
            value={inState ? lga : ""}
            onChange={(event) => {
              setLga(event.target.value);
              setReadBack(null);
            }}
            className={fieldSelect(errors.lga)}
          >
            <option value="">{chosen ? "Choose your local government" : "Choose your state first"}</option>

            {chosen
              ? chosen.lgas.map((name, index) => (
                  <option key={name} value={`${chosen.number}/${two(index + 1)}`}>
                    {name}
                  </option>
                ))
              : /* No state chosen yet, so every local government is still on
                   offer, grouped by the state it belongs to. This is what the
                   no-script path scrolls, and what the first render sends. */
                places.map((place) => (
                  <optgroup key={place.number} label={place.name}>
                    {place.lgas.map((name, index) => (
                      <option key={`${place.number}-${name}`} value={`${place.number}/${two(index + 1)}`}>
                        {name}
                      </option>
                    ))}
                  </optgroup>
                ))}
          </select>
        )}
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Ward" hint="2 digits" error={errors.ward} name="ward">
          {(id) => (
            <input
              id={id}
              name="ward"
              type="text"
              /* The number pad. Eleven digits through a QWERTY layout at night
                 is the most reliable way to get a number wrong, and it is the
                 same reason the phone field above opens the same keyboard. */
              inputMode="numeric"
              autoComplete="off"
              maxLength={2}
              value={ward}
              onChange={(event) => setWard(digitsOnly(event.target.value, 2))}
              placeholder="06"
              className={`${fieldInput(errors.ward)} figure text-center`}
            />
          )}
        </Field>

        <Field label="Unit" hint="3 digits" error={errors.unit} name="unit">
          {(id) => (
            <input
              id={id}
              name="unit"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={3}
              value={unit}
              onChange={(event) => setUnit(digitsOnly(event.target.value, 3))}
              placeholder="012"
              className={`${fieldInput(errors.unit)} figure text-center`}
            />
          )}
        </Field>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-content-muted">
        The last two numbers of the code at the top of your result sheet. Ward first, then the unit
        within it.
      </p>

      {/* ── THE CODE, READ BACK ────────────────────────────────────────────
          Not decoration and not a receipt. It is the one moment where what
          the agent chose from lists and what is printed on the sheet in their
          hand can be held side by side, in the same grammar, before anything
          is sent. The names underneath are the actual check: 24 and 25 look
          alike, Lagos and Kwara do not. */}
      <div
        aria-live="polite"
        className={`rounded-dash-sm border-2 px-4 py-4 ${
          complete ? "border-ink-950 bg-ink-50" : "border-dashed border-ink-300 bg-white"
        }`}
      >
        <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-content-subtle uppercase">
          Your polling unit code
        </p>
        <p className="figure mt-1.5 text-[1.5rem] leading-none font-bold tracking-[0.06em] text-ink-950">
          {parts[0] || "––"}/{parts[1] || "––"}/{parts[2] || "––"}/
          {parts[3] || "–––"}
        </p>

        {chosen && (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-content-muted">
            {chosen.name}
            {lgaName && <> &middot; {lgaName}</>}
            {parts[2] && <> &middot; ward {parts[2]}</>}
            {parts[3] && <> &middot; unit {parts[3]}</>}
          </p>
        )}

        {readBack && (
          <p className="mt-2 flex gap-2 text-[0.875rem] leading-relaxed text-emerald-700">
            <Check size={14} strokeWidth={3} className="mt-1 shrink-0" />
            Read from the code you typed. Check the two names above are the place you were
            appointed to.
          </p>
        )}

        {!complete && (
          <p className="mt-2 text-[0.875rem] leading-relaxed text-content-muted">
            This fills in as you choose. It should match the code on your sheet exactly.
          </p>
        )}
      </div>

      {/* ── NAMES, ASKED FOR AND NOT INVENTED ───────────────────────────────
          Optional, and the label says so, because an agent who does not know
          the registered name of their ward must not be stopped here. What
          they do write is worth having: it is what the person approving them
          reads across from the appointment list, and a name that does not
          match a number is a mistake caught before polling day rather than
          after the first return. */}
      <Field label="Ward name" hint="Optional" error={errors.wardName} name="wardName">
        {(id) => (
          <input
            id={id}
            name="wardName"
            type="text"
            autoComplete="off"
            maxLength={80}
            defaultValue={values.wardName ?? ""}
            placeholder="As written on your sheet"
            className={fieldInput(errors.wardName)}
          />
        )}
      </Field>

      <Field label="Polling unit name" hint="Optional" error={errors.unitName} name="unitName">
        {(id) => (
          <input
            id={id}
            name="unitName"
            type="text"
            autoComplete="off"
            maxLength={80}
            defaultValue={values.unitName ?? ""}
            placeholder="The school, hall or square"
            className={fieldInput(errors.unitName)}
          />
        )}
      </Field>

      {/* A <details>, so the escape hatch opens without a script too. */}
      <details ref={details} className="rounded-dash-sm border-2 border-ink-200 px-4 py-3">
        <summary className="cursor-pointer text-[0.9375rem] font-bold text-ink-950 marker:text-ink-400">
          I have the whole code in front of me
        </summary>
        <div className="mt-3">
          <Field label="Polling unit code" error={errors.unitCode} name="unitCode">
            {(id) => (
              <input
                id={id}
                name="unitCode"
                type="text"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={typed}
                onChange={(event) => readWholeCode(event.target.value)}
                placeholder="01/01/04/006"
                className={`${fieldInput(errors.unitCode)} figure`}
              />
            )}
          </Field>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-content-muted">
            Type all nine digits and the boxes above fill themselves in, with the names of the state
            and local government the code actually points at.
          </p>
        </div>
      </details>
    </fieldset>
  );
}

/* -------------------------------------------------------------------------- */

const two = (value) => String(value).padStart(2, "0");

const digitsOnly = (value, width) => value.replace(/\D/g, "").slice(0, width);

/** Padded for display, and empty while the box is empty — 0 is not a ward. */
function pad(value, width) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(width, "0") : "";
}
