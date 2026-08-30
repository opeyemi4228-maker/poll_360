"use client";

import { useMemo, useState } from "react";

import { LEVEL_FOR_RACE } from "@/lib/territory";

/**
 * Which contest, and which piece of Nigeria.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  Two questions that are really one. A presidential count is the whole
 *  federation and there is nothing further to ask. A governorship is a state.
 *  A senator is elected by one of 109 districts, a member of the House of
 *  Representatives by one of 360 constituencies, and an assembly member or a
 *  chairman inside a local government.
 *
 *  So the second question changes shape depending on the answer to the first,
 *  and it is the same control doing it rather than five controls with four of
 *  them hidden. A form that shows a state box, a district box and a local
 *  government box at once is a form where somebody fills in two of them and
 *  nobody can say afterwards which one they meant.
 *
 *  ── WHAT IT SENDS ───────────────────────────────────────────────────────
 *  One hidden field, `territory`, written the way lib/territory.js writes one:
 *  NATION, STATE:24, SENATORIAL:18/kaduna-central, FEDERAL:24/surulere-i,
 *  LGA:24/13. The server parses it and resolves it against the same tables
 *  this picker was filled from, and refuses anything that does not resolve —
 *  these selects are a convenience, not the check.
 *
 *  ── AND WHY THE WHOLE TABLE COMES DOWN WITH THE PAGE ────────────────────
 *  Sixty-odd kilobytes of names, against a fetch per state. The fetch is
 *  smaller and it is wrong here for the same reason it was wrong on the
 *  coordinators' sign-up form: the moment the list is needed is the moment
 *  somebody has just made a choice, and a dropdown that arrives late is a
 *  dropdown that is empty exactly when it is looked at.
 * ══════════════════════════════════════════════════════════════════════════
 */
export default function TerritoryPicker({
  places = [],
  races = [],
  race: initialRace = "",
  territory: initialTerritory = "",
  errors = {},
  /* Two grounds, two palettes: the public form sits on navy and the
     administrator's on the dashboard card. Nothing else differs, so nothing
     else is duplicated. */
  tone = "dark",
}) {
  const opening = useMemo(() => split(initialTerritory), [initialTerritory]);

  const [race, setRace] = useState(initialRace || "");
  const [stateNumber, setStateNumber] = useState(opening.stateNumber);
  const [key, setKey] = useState(opening.key);

  const level = LEVEL_FOR_RACE[race] ?? null;
  const state = places.find((row) => row.number === stateNumber) ?? null;

  /* The list the second question is asked from, whichever question it is. */
  const options =
    level === "SENATORIAL"
      ? (state?.senatorial ?? [])
      : level === "FEDERAL"
        ? (state?.federal ?? [])
        : level === "LGA"
          ? (state?.lgas ?? []).map((row) => ({ key: row.code, name: row.name }))
          : [];

  const chosen = options.find((row) => row.key === key) ?? null;

  /* Composed here rather than on the server from three separate fields,
     because three fields that have to be reassembled is three fields that can
     arrive in a combination nobody meant — a district key from one state
     beside another state's number. One value, or nothing. */
  const value =
    level === "NATION"
      ? "NATION"
      : level === "STATE"
        ? stateNumber && `STATE:${stateNumber}`
        : level && chosen
          ? `${level}:${chosen.key}`
          : "";

  const styles = TONES[tone] ?? TONES.dark;

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <input type="hidden" name="territory" value={value || ""} />

      <Field label="Which contest" error={errors.race} styles={styles} required>
        {(id) => (
          <select
            id={id}
            name="race"
            value={race}
            onChange={(event) => {
              setRace(event.target.value);
              /* The place is forgotten, not carried. A senatorial district is
                 not a local government and a key that survived the switch
                 would be a valid-looking answer to a question nobody asked. */
              setKey("");
            }}
            className={styles.input(errors.race)}
          >
            <option value="">Choose a contest…</option>
            {races.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        )}
      </Field>

      {level && level !== "NATION" && (
        <Field label="State" error={errors.territory} styles={styles} required>
          {(id) => (
            <select
              id={id}
              value={stateNumber}
              onChange={(event) => {
                setStateNumber(event.target.value);
                setKey("");
              }}
              className={styles.input(errors.territory)}
            >
              <option value="">Choose a state…</option>
              {places.map((row) => (
                <option key={row.number} value={row.number}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      {level && !["NATION", "STATE"].includes(level) && (
        <Field label={SECOND_LABEL[level]} error={errors.territory} styles={styles} required wide>
          {(id) => (
            <select
              id={id}
              value={key}
              disabled={!state}
              onChange={(event) => setKey(event.target.value)}
              className={styles.input(errors.territory)}
            >
              <option value="">
                {state ? `Choose ${SECOND_ARTICLE[level]}…` : "Choose a state first"}
              </option>
              {options.map((row) => (
                <option key={row.key} value={row.key}>
                  {row.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      )}

      <Note race={race} level={level} state={state} chosen={chosen} styles={styles} />
    </div>
  );
}

const SECOND_LABEL = {
  SENATORIAL: "Senatorial district",
  FEDERAL: "Federal constituency",
  LGA: "Local government",
};

const SECOND_ARTICLE = {
  SENATORIAL: "a district",
  FEDERAL: "a constituency",
  LGA: "a local government",
};

/**
 * What the choice actually means, said before it is made rather than after.
 *
 * ── THE TWO ADMISSIONS THIS PRODUCT OWES SOMEBODY CHOOSING ─────────────────
 * A federal constituency that shares its local government with another seat,
 * and a State House of Assembly seat, are both narrower than anything this
 * product can draw. Both are offered anyway, because refusing to name a real
 * seat helps nobody — but the difference between what was asked for and what
 * will actually be counted is printed here, on the form, at the moment of
 * choosing. Finding it out afterwards from a coverage figure that looks wrong
 * is how a room stops trusting the whole board.
 */
function Note({ race, level, state, chosen, styles }) {
  if (!level) return null;

  const lines = [];

  if (level === "NATION") {
    lines.push("The whole federation: 37 states, 774 local governments, every booth that reports.");
  }

  if (level === "STATE" && state) {
    lines.push(`${state.name} and its ${state.lgas.length} local governments. Nothing outside it.`);
  }

  if (chosen && (level === "SENATORIAL" || level === "FEDERAL")) {
    lines.push(`${chosen.name}${state ? `, ${state.name}` : ""}.`);
  }

  if (chosen?.shared) {
    const other = chosen.shared.find((name) => name !== chosen.name) ?? "the other seat";
    lines.push(
      `${chosen.name} and ${other} are both elected inside one local government, and the line ` +
        "between them runs between wards. Nobody publishes those boundaries in a form we hold, so " +
        "this covers the whole local government — both seats' booths together, and it will say so " +
        "on every screen."
    );
  }

  if (race === "ASSEMBLY") {
    lines.push(
      "State constituencies are carved out of local governments along ward lines, which we do not " +
        "hold either. This covers the local government your seat sits inside, which is wider than " +
        "the seat, and is named that way rather than as the seat itself."
    );
  }

  if (!lines.length) return null;

  return (
    <p className={`sm:col-span-2 ${styles.note}`}>
      {lines.map((line) => (
        <span key={line} className="block first:mt-0 [&+span]:mt-2">
          {line}
        </span>
      ))}
    </p>
  );
}

/* -------------------------------------------------------------------------- */

function split(stored) {
  const [head, ...rest] = String(stored ?? "").split(":");
  const key = rest.join(":");
  if (head === "STATE") return { stateNumber: key, key: "" };
  if (["SENATORIAL", "FEDERAL", "LGA"].includes(head)) {
    return { stateNumber: key.split("/")[0] ?? "", key };
  }
  return { stateNumber: "", key: "" };
}

function Field({ label, error, styles, required, wide, children }) {
  const id = `${label.toLowerCase().replace(/\s+/g, "-")}-field`;
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && " *"}
      </label>
      <div className="mt-2.5">{children(id)}</div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

const TONES = {
  dark: {
    label: "tag block text-white/55",
    error: "mt-2 text-[0.8125rem] font-semibold text-red-400",
    note: "mt-1 text-[0.8125rem] leading-relaxed text-white/50",
    input: (error) =>
      [
        "h-[3.25rem] w-full appearance-none border-2 bg-blue-950/60 px-4 text-[0.9375rem] text-white",
        "transition-colors focus:outline-none disabled:opacity-45",
        error ? "border-red-400" : "border-white/25 hover:border-white/45 focus:border-white",
      ].join(" "),
  },
  dash: {
    label: "text-[0.9375rem] font-bold text-dash-ink",
    error: "mt-2 text-[0.8125rem] font-semibold text-red-500",
    note: "mt-1 text-[0.8125rem] leading-relaxed text-dash-muted",
    input: (error) =>
      [
        "h-12 w-full appearance-none rounded-dash-sm border bg-dash-bg px-3 text-[0.9375rem] text-dash-ink",
        "transition-colors focus:outline-none disabled:opacity-45",
        error ? "border-red-500" : "border-dash-line hover:border-dash-ink/40 focus:border-dash-ink",
      ].join(" "),
  },
};
