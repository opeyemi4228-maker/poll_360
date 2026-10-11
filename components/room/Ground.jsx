import ActionForm, { Area, Submit } from "./ActionForm";
import { ZONE_NAMES } from "@/lib/ground";

/**
 * Say which ground one member of the room covers.
 *
 * Whole zones as ticks, and anything narrower as INEC codes: `19` for a
 * state, `19/04` for a local government, `19/04/11` for a ward. The server
 * checks every code against INEC's list and against the giver's own ground.
 */
export default function GroundForm({ person, zones = false, states = [] }) {
  const held = person.groundRead ?? { zones: [], codes: [] };
  return (
    <ActionForm what="staffGround" hidden={{ user: person.id }} reset={false} className="space-y-2" done="Saved. Their screen has changed already.">
      {zones && (
        <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem]">
          <legend className="mb-1 font-semibold text-dash-ink">Whole zones</legend>
          {ZONE_NAMES.map((zone) => (
            <label key={zone} className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="zones" value={zone} defaultChecked={held.zones.includes(zone)} /> {zone}
            </label>
          ))}
        </fieldset>
      )}
      {states.length > 0 && (
        <fieldset className="flex max-h-32 flex-wrap gap-x-3 gap-y-1 overflow-auto text-[0.8125rem]">
          <legend className="mb-1 font-semibold text-dash-ink">States</legend>
          {states.map((state) => (
            <label key={state.code} className="inline-flex items-center gap-1.5">
              <input type="checkbox" name="codes" value={state.code} defaultChecked={held.codes.includes(state.code)} /> {state.name}
            </label>
          ))}
        </fieldset>
      )}
      <Area label="Local governments or wards, by INEC code" name="more" rows={1} placeholder="19/04, 19/05, 20/01/03" defaultValue={held.codes.filter((code) => code.length > 2).join(", ")} />
      <Submit variant="dashOutline">Save ground</Submit>
    </ActionForm>
  );
}
