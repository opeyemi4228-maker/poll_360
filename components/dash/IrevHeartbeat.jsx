"use client";

import { useEffect } from "react";

import { askForTurn } from "@/lib/irev/ask";

/**
 * Keeps the INEC gatherer going from any dashboard page.
 *
 * Gathering, examining, reading and comparing are all done in short turns,
 * and something has to ask for the next one. The INEC results screen asks
 * while it is open; this asks from everywhere else, so an election chosen
 * there carries on while its owner is looking at the room, the admin page or
 * a single sheet. It draws nothing.
 *
 * Quietly: a turn that fails is simply tried again later, the tab has to be
 * in front, and it stands down wherever the INEC screen's own runner is
 * already doing the asking.
 */
export default function IrevHeartbeat() {
  useEffect(() => {
    let stopped = false;
    let timer = null;

    async function beat() {
      let soon = false;
      if (document.visibilityState === "visible" && !window.poll360IrevRunner) {
        try {
          soon = Boolean((await askForTurn())?.more);
        } catch {
          /* Not signed in to do this, or the server is away. Try again later. */
        }
      }
      /* Seconds while there is work in hand; a quarter of a minute otherwise,
         so something started from a button is picked up almost at once. */
      if (!stopped) timer = setTimeout(beat, soon ? 3000 : 15000);
    }

    timer = setTimeout(beat, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return null;
}
