import { chooseUnit } from "@/app/agent/actions";

/**
 * For an agent assigned to more than one polling unit: a list of their
 * units by name, and the one they are at now. A list, never a box to type
 * in. The server checks the choice against their assignments again.
 */
export default function UnitPicker({ units, current }) {
  if (units.length < 2) return null;
  return (
    <section aria-label="Your polling units" className="mt-5 rounded-dash border border-ink-200 bg-white p-5">
      <h2 className="text-[1rem] font-bold text-ink-950">You are assigned to {units.length} polling units</h2>
      <p className="mt-1 text-[0.875rem] text-content-muted">Choose the one you are at. Everything you send goes to that unit.</p>
      <ul className="mt-3 space-y-2">
        {units.map((unit) => (
          <li key={unit.code}>
            <form action={chooseUnit} className="flex items-center gap-3">
              <input type="hidden" name="unit" value={unit.code} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.9375rem] font-semibold text-ink-950">{unit.name}</span>
                <span className="block text-[0.8125rem] text-content-muted">{unit.code} · {unit.role === "PRIMARY" ? "you are the primary agent" : "you are a backup agent"}</span>
              </span>
              {unit.code === current ? (
                <span className="rounded-full bg-ink-950 px-3 py-1.5 text-[0.8125rem] font-semibold text-white">You are here</span>
              ) : (
                <button type="submit" className="rounded-dash-sm border border-ink-300 px-3 py-2 text-[0.875rem] font-semibold text-ink-950">Work here</button>
              )}
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
