import WhatsAppDesk from "@/components/dash/WhatsAppDesk";
import { requireCapability } from "@/lib/guard";
import { positions, results, sheetReads, units, whatsapp } from "@/lib/db";
import { groupUnits } from "@/lib/units";
import { nameUnits } from "@/lib/lga-names";
import { can } from "@/lib/roles";
import { currentElection, currentRace } from "@/lib/election-scope";
import { RACES } from "@/lib/races";

export const metadata = { title: "WhatsApp desk", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * The WhatsApp desk.
 *
 * ── WHAT THIS SCREEN IS FOR ────────────────────────────────────────────────
 * Agents file from the app they already have, over the data plan they already
 * pay for, on the phone they already own. That removes almost every reason a
 * return does not arrive. What it adds is a channel anybody can send anything
 * to, so this is the room where a human reads it: every conversation, every
 * half-finished return, every photograph, and every number that has not yet
 * been matched to a real person.
 *
 * ── THE GATE IS HERE, NOT IN THE COMPONENT ─────────────────────────────────
 * Checked on the server before a single row is read. A capability check that
 * lives in the browser is a suggestion.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default async function WhatsAppPage() {
  const user = await requireCapability("whatsapp:read", "/whatsapp");

  /* ── THE DESK READS ONE CONTEST AT A TIME ────────────────────────────────
     A booth files up to five returns in an evening, one per ballot paper, and
     the unit tree below is a coverage figure: how many of the units we know
     about have reported. Left unscoped that join returned a row per ballot and
     counted the same booth five times, which is how a desk ends up looking at
     "312% reported" at one in the morning. */
  const project = await currentElection();
  const race = await currentRace(project);

  return (
    <WhatsAppDesk
      user={user}
      /* Spread, not passed. `node:sqlite` hands back rows with a null
         prototype, and a null prototype cannot cross into a client component:
         the page renders 500 with "only plain objects can be passed", which
         says nothing about sqlite and takes a while to place. */
      summary={{ ...(await whatsapp.summary()) }}
      contacts={(await whatsapp.contacts(80)).map(withTime)}
      messages={(await whatsapp.recent(80)).map(withTime)}
      open={(await whatsapp.openSessions()).map(withTime)}
      canClaim={can(user.role, "whatsapp:claim")}
      /* The hierarchy is folded on the server. It is a pure function of rows
         we have already fetched, and doing it here keeps the tree out of the
         browser bundle and off the main thread on a desk machine that is also
         running four other dashboards. */
      tree={groupUnits(nameUnits(await units.all(project?.id, race)))}
      unitCount={await units.count(project?.id)}
      reportedCount={await units.reported(project?.id, race)}
      /* Which contest these figures are for, and how much of each of the
         others has arrived — so the desk can see at a glance that the
         governorship is in and the senate has barely started. */
      race={race}
      races={RACES.map((row) => ({ id: row.id, label: row.label }))}
      filedByRace={project ? await results.countByRace(project.id) : {}}
      /* Returns that came in through the upload screen rather than over a
         conversation. They are part of this desk's job — it is the room that
         watches returns arrive — and labelling how each one got here is the
         difference between a count and a rumour. */
      uploads={project ? (await results.recent(24, project.id, race)).map(shapeUpload) : []}
      places={(await positions.latest()).map(withTime)}
      /* Scoped to the project on screen, like every other figure on this
         desk. Unscoped, these two showed a rehearsal the 2023 project's
         readings and its own not at all. */
      reads={project ? (await sheetReads.recent(project.id, 30)).map(withTime) : []}
      readSummary={project ? { ...(await sheetReads.summary(project.id)) } : {}}
    />
  );
}

/**
 * A filed return, as the desk needs to see it.
 *
 * Trimmed rather than passed whole: the desk is a list of what arrived and
 * from where, and shipping every figure of every return to the browser to draw
 * a row that shows a total is work nobody asked for.
 */
function shapeUpload(row) {
  return {
    id: row.id,
    unitCode: row.unitCode,
    stateCode: row.stateCode,
    total: Object.values(row.votes ?? {}).reduce((sum, n) => sum + (Number(n) || 0), 0),
    accredited: row.accredited,
    status: row.status,
    source: row.source ?? "APP",
    at: row.submittedAt ? new Date(row.submittedAt).toTimeString().slice(0, 5) : "",
  };
}

/**
 * Clocks are stamped here, on the server, once.
 *
 * Formatting a time in the browser reads the *viewer's* timezone, while the
 * server rendered the same row in its own, so the two disagreed and every
 * message row failed hydration. A desk in Abuja and a desk in London should
 * also see the same clock as each other, because they are discussing the same
 * booth: election time is the count's time, not the reader's.
 */
function withTime(row) {
  const at = row.createdAt ?? row.updatedAt ?? row.lastSeen;
  return { ...row, at: at ? new Date(at).toTimeString().slice(0, 5) : "" };
}
