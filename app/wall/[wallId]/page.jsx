import { notFound } from "next/navigation";

import BvasBlock from "@/components/room/BvasBlock";
import Count from "@/components/room/Count";
import WallRefresh from "@/components/room/WallRefresh";
import { LightBadge, LightCounts, LightIcon, TONE } from "@/components/room/Light";
import { LightMap } from "@/components/room/Panels";
import { elections } from "@/lib/elections";
import { LIGHTS } from "@/lib/lights";
import { isRace, raceLabel } from "@/lib/races";
import { items, lights, walls } from "@/lib/room/store";
import { runningCount } from "@/lib/room/desk";
import { withinProject } from "@/lib/room/access";
import { cn, formatNumber } from "@/lib/utils";

export const metadata = { title: "Video wall", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * A screen on the wall.
 *
 * It signs in with the key in its own address, which the Super Admin made
 * for that one display, and it can do nothing but show what it was set to
 * show. There is no button on it. A wrong or missing key is "not found".
 *
 * Read from across a room: the BVAS figure is at least 72px, every light has
 * its shape and its word, and no green is drawn without how much is in.
 */
export default async function WallPage({ params, searchParams }) {
  const { wallId } = await params;
  const key = (await searchParams)?.key;
  const wall = await walls.open(String(wallId), Array.isArray(key) ? key[0] : key);
  if (!wall) notFound();

  const project = wall.layout.electionId ? await elections.get(wall.layout.electionId) : null;
  const race = isRace(wall.layout.race) ? wall.layout.race : null;
  if (!project || !race) {
    return <main className="wall flex min-h-screen items-center justify-center bg-[#0b1024] p-10 text-[2rem] text-white">This screen is not set to an election. Ask the Super Admin to set it up again.</main>;
  }
  const ground = withinProject(null, project);
  const ctx = { project, race };
  const panels = new Set(wall.layout.panels ?? []);
  const args = { electionId: project.id, race, code: "", ground };

  const [nation, states, count, red] = await Promise.all([
    lights.at(args),
    lights.under(args),
    panels.has("count") ? runningCount(ctx, "") : null,
    panels.has("red") ? items.list({ electionId: project.id, race, light: "RED", take: 8 }) : [],
  ]);

  return (
    <main className="wall dash-panel min-h-screen bg-[#0b1024] p-8 text-white">
      <header className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="text-[1.5rem] font-semibold opacity-80">{project.title} · {raceLabel(race)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-5">
            <span className={cn("inline-flex items-center gap-3 text-[3.5rem] leading-none font-extrabold", TONE[nation.light].text)}>
              <LightIcon light={nation.light} size={56} /> {LIGHTS[nation.light].label}
            </span>
            <span className="text-[2rem] tabular-nums opacity-90">
              {nation.reported ? `${nation.coveragePct.toFixed(1)}% reported · ${formatNumber(nation.reported)} of ${formatNumber(nation.total)} polling units` : "No returns yet"}
            </span>
          </div>
          <LightCounts counts={nation.counts} className="mt-3 gap-x-6 text-[1.75rem]" />
        </div>
        <WallRefresh clock={panels.has("clock")} />
      </header>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.4fr_1fr]">
        {panels.has("lights") && (
          <section aria-label="State lights">
            <ul className="grid grid-cols-4 gap-3 2xl:grid-cols-6">
              {states.map((row) => (
                <li key={row.code} className={cn("rounded-xl border-l-8 bg-white/8 p-3", TONE[row.light].line)}>
                  <p className="flex items-center justify-between gap-2 text-[1.25rem] font-bold">
                    <span className="truncate">{row.name}</span>
                    <LightIcon light={row.light} size={24} />
                  </p>
                  <p className={cn("text-[1rem] font-bold", TONE[row.light].text)}>{LIGHTS[row.light].short}</p>
                  <p className="text-[1rem] tabular-nums opacity-80">{row.reported ? `${row.coveragePct.toFixed(1)}% reported` : "No returns yet"}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="space-y-8">
          {panels.has("bvas") && <BvasBlock bvas={nation.bvas} total={nation.total} wall className="border-white/15 bg-white/8" />}
          {panels.has("lights") && <div className="rounded-xl bg-white/8 p-4"><LightMap rows={states} wall /></div>}
          {count && (
            <section className="rounded-xl bg-white/8 p-6">
              <h2 className="mb-4 text-[1.75rem] font-bold">Running count</h2>
              <Count count={count} light={nation} wall />
            </section>
          )}
          {panels.has("red") && (
            <section className="rounded-xl bg-white/8 p-6">
              <h2 className="mb-3 text-[1.75rem] font-bold">Open red items</h2>
              {red.length ? (
                <ul className="space-y-2 text-[1.25rem]">
                  {red.map((item) => (
                    <li key={item.id} className="flex items-start gap-3"><LightIcon light="RED" size={24} className="mt-1" /><span><b>{item.title}</b><span className="block opacity-80">{item.place}</span></span></li>
                  ))}
                </ul>
              ) : (
                <p className="text-[1.25rem] opacity-80">None open.</p>
              )}
            </section>
          )}
        </div>
      </div>
      <p className="mt-8 text-[1rem] opacity-60">Poll360 · {wall.name} · a second, independent count. <LightBadge light="GREEN" short className="mx-1 align-middle" /> means cleared so far, never complete.</p>
    </main>
  );
}
