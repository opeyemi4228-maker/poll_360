"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";

import { askForTurn } from "@/lib/irev/ask";

/**
 * The heartbeat: while this screen is open, the gatherer keeps going.
 *
 * Nothing on the server runs by itself between requests, so something has to
 * keep asking. This asks for one turn, shows what the turn did, redraws the
 * figures, and asks again — quickly while an election is being read through,
 * once a minute when it is only watching.
 *
 * One request at a time, and none while the tab is hidden: a screen left open
 * behind another window overnight should not be the thing reading the portal.
 */
export default function Runner({ working, watching }) {
  const router = useRouter();
  const [said, setSaid] = useState(null);
  const busy = useRef(false);

  const active = working > 0 || watching > 0;
  const seconds = working > 0 ? 4 : 60;

  /* While this is on the page it is the one asking for turns, and the
     dashboard-wide heartbeat stands down. */
  useEffect(() => {
    window.poll360IrevRunner = active;
    return () => {
      window.poll360IrevRunner = false;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    let stopped = false;

    async function beat() {
      if (stopped || busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        const round = await askForTurn();
        if (stopped) return;
        setSaid({ ...round, at: new Date() });
        if (!round.busy && !round.idle) router.refresh();
      } catch {
        if (!stopped) setSaid({ failed: true, at: new Date() });
      } finally {
        busy.current = false;
      }
    }

    beat();
    const timer = setInterval(beat, seconds * 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [active, seconds, router]);

  if (!active) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-dash border border-dash-line bg-dash-card px-5 py-3.5 text-[0.8125rem]">
      <Radio size={16} strokeWidth={2.25} className="shrink-0 text-ok-700" />
      <p className="font-bold text-dash-ink">
        {working > 0
          ? `Gathering ${working} election${working === 1 ? "" : "s"} now`
          : `Watching ${watching} election${watching === 1 ? "" : "s"} live`}
      </p>
      <p className="min-w-0 text-dash-muted">{sentence(said)}</p>
      <p className="basis-full text-[0.75rem] text-dash-muted">
        This keeps going while this page is open in front of you. Close it and it pauses, and carries on from the
        same place when you come back.
      </p>
    </div>
  );
}

function sentence(said) {
  if (!said) return "Starting…";
  const at = said.at.toLocaleTimeString("en-NG", { hour12: false });
  if (said.failed) return `${at} · Could not reach the server. Trying again.`;
  if (said.busy) return `${at} · Another window is already gathering.`;
  if (said.errors?.length) return `${at} · ${said.errors[0]}`;

  const parts = [];
  if (said.found?.length) parts.push(`new on IReV: ${said.found.join(", ")}`);
  if (said.wardsRead) parts.push(`${said.wardsRead.toLocaleString()} ward(s) read, ${said.wardsLeft.toLocaleString()} to go`);
  if (said.sheets) parts.push(`${said.sheets.toLocaleString()} sheet(s) new or replaced`);
  if (said.examined) parts.push(`${said.examined.toLocaleString()} sheet picture(s) examined`);
  if (said.figures) parts.push(`${said.figures.toLocaleString()} sheet(s) read into figures`);
  if (said.paused) parts.push(`reading is resting for a few minutes (${said.paused})`);
  return `${at} · ${parts.length ? parts.join(" · ") : "Checked. Nothing new."}`;
}
