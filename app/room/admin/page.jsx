import { headers } from "next/headers";

import RoomShell from "@/components/room/RoomShell";
import Overview, { overviewData } from "@/components/room/Overview";
import Assignments from "@/components/room/admin/Assignments";
import { BoardSection, ElsewhereSection, LightsSection, StaffSection, WallsSection } from "@/components/room/admin/Staff";
import { StateGrid, StatusCard } from "@/components/room/Panels";
import { lightsFor, roomPage, rosterFor } from "@/lib/room/page";
import { settings, tech, trail as audit, walls } from "@/lib/room/store";
import { place } from "@/lib/room/places";
import { STATES } from "@/lib/units";

export const metadata = { title: "Super Admin console", robots: { index: false } };
export const dynamic = "force-dynamic";

const BASE = "/room/admin";
const SECTIONS = [
  ["overview", "Overview"],
  ["lights", "Lights"],
  ["assignments", "Assignments"],
  ["staff", "Room staff"],
  ["board", "Room assignment board"],
  ["walls", "Video wall"],
  ["more", "Agents, accounts and system"],
];

/**
 * The Super Admin console: the same overview the Director works from, and
 * the things only the Super Admin does. Who files for which polling unit,
 * who in the room covers which ground, what turns a light red, and the
 * screens on the wall.
 */
export default async function AdminRoomPage({ searchParams }) {
  const { ctx, query, caps, at, unit, trail, now } = await roomPage(BASE, searchParams);
  const section = SECTIONS.some(([id]) => id === query.section) ? query.section : "overview";
  const nav = SECTIONS.map(([id, name]) => ({ id, name, href: id === "overview" ? BASE : `${BASE}?section=${id}` }));
  if (!ctx.project) return <RoomShell ctx={ctx} title="Super Admin console" sections={nav} current={section} />;
  const electionId = ctx.project.id;
  const states = STATES.map((state) => ({ code: state.number, name: state.name }));
  const q = { ...query, section: section === "overview" ? null : section };

  let body = null;
  let open = null;

  if (section === "overview") {
    const data = await overviewData({ ctx, at, unit, deskName: "admin" });
    open = data.inbox.length;
    body = <Overview ctx={ctx} base={BASE} query={q} caps={caps} at={at} crumbs={trail} deskName="admin" data={data} />;
  } else if (section === "lights") {
    const [nation, rules, changes, system] = await Promise.all([lightsFor(ctx, ""), settings.get(electionId), audit.byKind(["lights:settings"], 20), tech.light()]);
    body = (
      <div className="space-y-6">
        <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
          <StatusCard light={nation.light} title="National light" />
          <div className="rounded-dash border border-dash-line bg-dash-card p-5 shadow-e2">
            <p className="text-[0.8125rem] font-semibold text-dash-muted">System light, from the technical desk</p>
            <p className="mt-1 font-display text-[1.75rem] font-extrabold text-dash-ink">{system === "GREEN" ? "✔ Normal" : system === "AMBER" ? "▲ An incident is open" : "✖ A critical incident is open"}</p>
          </div>
        </div>
        <StateGrid rows={nation.below} base={BASE} query={{ sort: query.sort }} />
        <LightsSection rules={rules} changes={changes} />
      </div>
    );
  } else if (section === "assignments") {
    /* The assignment screens walk INEC's whole list, not a ground, and may
       open a place nobody has reported from. */
    const parts = (unit ?? at) ? (unit ?? at).split("/") : [];
    const crumbs = [{ code: "", name: "Nigeria" }, ...parts.slice(0, unit ? 3 : parts.length).map((_, index) => {
      const code = parts.slice(0, index + 1).join("/");
      return { code, name: place(code)?.name ?? code };
    })];
    body = <Assignments query={q} at={unit ? unit.split("/").slice(0, 3).join("/") : at} unit={unit} trail={crumbs} electionId={electionId} now={now} />;
  } else if (section === "staff" || section === "board") {
    const people = (await rosterFor()).filter((person) => person.roles.some((role) => role !== "SUPER_ADMIN" && role !== "SITUATION_ROOM"));
    body = section === "staff" ? <StaffSection people={people} states={states} /> : <BoardSection people={people} states={states} />;
  } else if (section === "walls") {
    const list = await headers();
    const host = list.get("x-forwarded-host") ?? list.get("host") ?? "";
    const origin = host ? `${list.get("x-forwarded-proto") ?? "https"}://${host}` : "";
    body = <WallsSection walls={await walls.list()} origin={origin} />;
  } else {
    body = <ElsewhereSection />;
  }

  return (
    <RoomShell ctx={ctx} title="Super Admin console" sections={nav} current={section} openCount={open}>
      {body}
    </RoomShell>
  );
}
