import Link from "next/link";

import { Badge, Card, Empty } from "@/components/dash/DashCard";
import ActionForm, { Choice, Field, Submit } from "../ActionForm";
import GroundForm from "../Ground";
import { clock } from "../Panels";
import { WALL_PANELS } from "@/lib/room/act";
import { DEFAULT_SETTINGS } from "@/lib/lights";
import { PERSONAL_GRANTS, ROLES } from "@/lib/roles";
import { ZONES } from "@/lib/zones";
import { touches, zoneOfState } from "@/lib/ground";
import { asWords } from "@/lib/utils";

/**
 * The Super Admin's own sections: the people of the room and the ground each
 * covers, the board that shows who covers what, what turns a light red or
 * yellow, and the screens on the wall.
 */
const ROOM_ROLES = Object.entries(ROLES).filter(([key, role]) => role.room && key !== "WALL_DEVICE");

export function StaffSection({ people, states }) {
  if (!people.length) return <Empty>No room account has been issued yet. Issue them under Accounts, then place each one here.</Empty>;
  return (
    <Card title="Room staff" subtitle="The desks each account holds, what it is granted by name, and the ground it covers. A change reaches their open screen at once.">
      <p className="mb-3 text-[0.8125rem] text-dash-muted">
        New accounts are issued on the <Link href="/admin/users" className="font-semibold text-blue-700 underline">accounts screen</Link>. Every room desk is on its list.
      </p>
      <ul className="divide-y divide-dash-line">
        {people.map((person) => (
          <li key={person.id} className="py-3">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 text-[0.875rem]">
                <span className={person.online ? "size-2.5 rounded-full bg-light-green" : "size-2.5 rounded-full border border-light-grey"} aria-hidden="true" />
                <span className="font-semibold text-dash-ink">{person.name}</span>
                {person.roles.map((role) => <Badge key={role} tone={role === person.role ? "ink" : "neutral"}>{ROLES[role]?.short ?? role}</Badge>)}
                {person.grants.map((grant) => <Badge key={grant} tone="good">{PERSONAL_GRANTS[grant]?.label ?? grant}</Badge>)}
                <span className="text-[0.8125rem] text-dash-muted">{person.groundLabel}</span>
              </summary>
              <div className="mt-3 grid gap-4 rounded-dash-sm bg-dash-bg p-3 xl:grid-cols-2">
                <ActionForm what="staffDesks" hidden={{ user: person.id }} reset={false} className="space-y-2" done="Saved.">
                  <fieldset className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem]">
                    <legend className="mb-1 font-semibold text-dash-ink">Other desks this account also holds</legend>
                    {ROOM_ROLES.filter(([key]) => key !== person.role).map(([key, role]) => (
                      <label key={key} className="inline-flex items-center gap-1.5"><input type="checkbox" name="roles" value={key} defaultChecked={person.roles.includes(key)} /> {role.label}</label>
                    ))}
                  </fieldset>
                  <fieldset className="text-[0.8125rem]">
                    <legend className="mb-1 font-semibold text-dash-ink">Granted by name</legend>
                    {Object.entries(PERSONAL_GRANTS).map(([key, grant]) => (
                      <label key={key} className="inline-flex items-center gap-1.5"><input type="checkbox" name="grants" value={key} defaultChecked={person.grants.includes(key)} /> {grant.label} <span className="text-dash-muted">(observers and field operations only)</span></label>
                    ))}
                  </fieldset>
                  <Submit variant="dashOutline">Save desks</Submit>
                </ActionForm>
                <GroundForm person={person} zones states={states} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const COLUMNS = [["ZONE_LEAD", "Zone lead"], ["STATE_OBSERVER", "Observers"], ["VERIFIER", "Verifiers"], ["FIELD_OPS", "Field ops"]];

/** States down, desks across: who covers what, where nobody does, and where two do. */
export function BoardSection({ people, states }) {
  const on = (state, role) => people.filter((person) => person.groundRead && touches(person.groundRead, state) && (person.roles.includes(role) || (role === "VERIFIER" && person.roles.includes("LEAD_VERIFIER"))));
  const noLead = Object.keys(ZONES).filter((zone) => !people.some((person) => person.roles.includes("ZONE_LEAD") && states.some((state) => zoneOfState(state.code) === zone && person.groundRead && touches(person.groundRead, state.code))));
  const observers = people.filter((person) => person.roles.includes("STATE_OBSERVER"));
  return (
    <div className="space-y-6">
      <Card title="Room assignment board" subtitle="Each state, and who in the room covers it now. Overlap is allowed and shown. A gap is marked.">
        {noLead.length > 0 && <p className="mb-3 rounded-dash-sm bg-light-yellow-soft px-3 py-2 text-[0.8125rem] font-semibold text-light-yellow-ink">▲ No zone lead for: {noLead.join(", ")}.</p>}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-[0.8125rem]">
            <thead className="text-dash-muted">
              <tr className="border-b border-dash-line">
                <th scope="col" className="px-2 py-2 font-semibold">State</th>
                {COLUMNS.map(([, label]) => <th key={label} scope="col" className="px-2 py-2 font-semibold">{label}</th>)}
              </tr>
            </thead>
            <tbody>
              {states.map((state) => (
                <tr key={state.code} className="border-b border-dash-line align-top last:border-0">
                  <th scope="row" className="px-2 py-2 font-semibold text-dash-ink">{state.name}<span className="block text-[0.75rem] font-normal text-dash-muted">{zoneOfState(state.code)}</span></th>
                  {COLUMNS.map(([role]) => {
                    const here = on(state.code, role);
                    const gap = !here.length && (role === "STATE_OBSERVER" || role === "VERIFIER");
                    return (
                      <td key={role} className="px-2 py-2">
                        {here.length ? here.map((person) => (
                          <span key={person.id} className="mr-2 inline-flex items-center gap-1 whitespace-nowrap">
                            <span className={person.online ? "size-2 rounded-full bg-light-green" : "size-2 rounded-full border border-light-grey"} aria-hidden="true" />
                            {person.name}{person.openItems ? ` (${person.openItems})` : ""}
                          </span>
                        )) : <span className={gap ? "font-semibold text-light-yellow-ink" : "text-dash-muted"}>{gap ? "▲ nobody" : "nobody"}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[0.75rem] text-dash-muted">A filled dot is somebody online now. The number in brackets is what they have open. Change anybody&apos;s ground under Room staff.</p>
      </Card>

      <Card title="Split a state among observers" subtitle="Shares the state's local governments out so each observer carries about the same number of polling units. You can edit the result under Room staff.">
        {observers.length >= 2 ? (
          <ActionForm what="splitState" className="space-y-3" done="Split. {said}" confirm="This replaces what each ticked observer holds inside that state.">
            <Choice label="State" name="state" options={states.map((state) => [state.code, state.name])} className="max-w-xs" />
            <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
              <legend className="mb-1 font-semibold text-dash-ink">Between these observers</legend>
              {observers.map((person) => <label key={person.id} className="inline-flex items-center gap-1.5"><input type="checkbox" name="users" value={person.id} /> {person.name}</label>)}
            </fieldset>
            <Submit>Split the state</Submit>
          </ActionForm>
        ) : (
          <Empty>There need to be at least two observers to split a state between.</Empty>
        )}
      </Card>
    </div>
  );
}

const SETTING = {
  turnoutPercent: ["Turnout that is implausible (% of the register, at or above)", "number"],
  returnDeadline: ["Our agents' results are overdue after", "datetime-local"],
  inecDeadline: ["INEC's sheets are overdue after", "datetime-local"],
  inecLateDays: ["A sheet published this many days after the poll is late", "number"],
  unownedRedMinutes: ["A red item nobody owns goes to the Director after (minutes)", "number"],
  callFloorPercent: ["Nothing is called under this share counted (never below 25%)", "number"],
  checkInBy: ["Agents are expected to have signed in by", "time"],
};

export function LightsSection({ rules, changes }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="What turns a light red or yellow" subtitle="For this election project. Every change is recorded with the old and the new value.">
        <ActionForm what="lightSettings" reset={false} className="space-y-3" done="Saved. The lights use the new rules from now.">
          {Object.entries(SETTING).map(([key, [label, type]]) => (
            <Field key={key} label={label} name={key} type={type} defaultValue={rules[key] ?? ""} min={key === "callFloorPercent" ? 25 : type === "number" ? 0 : undefined} max={type === "number" && key.endsWith("Percent") ? 100 : undefined} placeholder={String(DEFAULT_SETTINGS[key] ?? "")} />
          ))}
          <p className="text-[0.75rem] text-dash-muted">Leave a deadline empty and nothing is overdue against it. Times are Lagos time.</p>
          <Submit>Save the rules</Submit>
        </ActionForm>
      </Card>
      <Card title="Changes to the rules" subtitle="From the audit record.">
        {changes.length ? (
          <ul className="divide-y divide-dash-line text-[0.8125rem]">
            {changes.map((line) => {
              const moved = Object.keys(line.meta?.after ?? {}).filter((key) => String(line.meta.after[key]) !== String(line.meta.before?.[key]));
              return (
                <li key={line.id} className="py-2">
                  <span className="font-semibold text-dash-ink">{line.actor}</span> <span className="text-dash-muted">· {clock(line.at)}</span>
                  {moved.map((key) => <span key={key} className="block text-dash-muted">{SETTING[key]?.[0] ?? asWords(key)}: {String(line.meta.before?.[key] || "none")} → {String(line.meta.after[key] || "none")}</span>)}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>The rules have not been changed. They stand at their defaults.</Empty>
        )}
      </Card>
    </div>
  );
}

export function WallsSection({ walls, origin }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Add a screen to the wall" subtitle="Each screen gets an address with a key of its own. Open that address on the display and leave it. It shows what you tick and accepts no input.">
        <ActionForm what="wallCreate" className="space-y-3" done={`Made. Open this on the display, and keep it: the key is shown once.  ${origin}/wall/{id}?key={key}`}>
          <Field label="Name of the screen" name="name" required placeholder="Main wall, left" maxLength={60} />
          <fieldset className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem]">
            <legend className="mb-1 font-semibold text-dash-ink">What it shows</legend>
            {Object.entries(WALL_PANELS).map(([key, label]) => <label key={key} className="inline-flex items-center gap-1.5"><input type="checkbox" name="panels" value={key} defaultChecked={key === "lights" || key === "bvas" || key === "clock"} /> {label}</label>)}
          </fieldset>
          <Submit>Make the screen</Submit>
        </ActionForm>
      </Card>
      <Card title={`Screens (${walls.length})`}>
        {walls.length ? (
          <ul className="divide-y divide-dash-line">
            {walls.map((wall) => (
              <li key={wall.id} className="flex flex-wrap items-center gap-x-3 py-2.5 text-[0.8125rem]">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-dash-ink">{wall.name}</span>
                  <span className="text-dash-muted"> · {(wall.layout.panels ?? []).map((panel) => WALL_PANELS[panel]).join(", ")} · {wall.seenAt ? `last seen ${clock(wall.seenAt)}` : "not opened yet"}</span>
                </span>
                <ActionForm what="wallRemove" hidden={{ id: wall.id }} confirm={`Remove ${wall.name}? The display will stop showing anything.`}><Submit variant="dashOutline">Remove</Submit></ActionForm>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No screen has been set up for the wall.</Empty>
        )}
      </Card>
    </div>
  );
}

const ELSEWHERE = [
  ["/admin/coordinators", "Agents", "Approve sign-ups, with the face on record and the polling units the party list gave them."],
  ["/admin/users", "Accounts", "Issue an account for a room desk, or switch one off."],
  ["/admin/settings", "Election project", "Contests, polling date, and the states in play."],
  ["/admin/irev", "INEC portal", "Gather the election from the result viewing portal and read its sheets."],
  ["/gap", "Announced figures", "Enter what the commission declared, place by place."],
  ["/admin/audit", "Audit", "The full record of who did what, searchable."],
  ["/admin/health", "System readiness", "What is not ready for a real election."],
];

/** The Super Admin's other screens. Linked, not copied: each keeps its one home. */
export function ElsewhereSection() {
  return (
    <Card title="The rest of the Super Admin's work" subtitle="Each of these has one home already. They open there.">
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ELSEWHERE.map(([href, name, says]) => (
          <li key={href}>
            <Link href={href} className="block h-full rounded-dash-sm border border-dash-line p-4 hover:border-dash-ink">
              <span className="block text-[0.9375rem] font-bold text-dash-ink">{name}</span>
              <span className="mt-1 block text-[0.8125rem] leading-snug text-dash-muted">{says}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
