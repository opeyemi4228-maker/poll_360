"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { prepareUnits } from "../actions";

/**
 * The polling units on screen are examined and read first.
 *
 * The gatherer works through a whole election in its own order, which for a
 * large one is hours. This asks for the rows somebody is actually looking at,
 * redraws them as they come back, and keeps asking until none are left to do
 * or a round gets nowhere.
 */
export default function PrepareList({ election, units, waiting }) {
  const router = useRouter();
  const [left, setLeft] = useState(waiting);
  /* The rows as they were when this page of them was first drawn. A redraw
     hands over a new list of the same rows, and that must not start the work
     again from the top. */
  const first = useRef({ units, waiting });

  useEffect(() => {
    const { units, waiting } = first.current;
    if (waiting === 0) return undefined;
    let stopped = false;

    (async () => {
      for (let round = 0; round < 40 && !stopped; round += 1) {
        let went;
        try {
          went = await prepareUnits(election, units);
        } catch {
          break;
        }
        if (stopped) return;
        setLeft(went.left);
        if (went.did) router.refresh();
        if (!went.left) break;
      }
      if (!stopped) setLeft(0);
    })();

    return () => {
      stopped = true;
    };
  }, [election, router]);

  if (!left) return null;

  return (
    <p className="mb-4 flex items-center gap-2.5 rounded-dash-sm border border-dash-line bg-dash-bg px-3.5 py-2.5 text-[0.8125rem] text-dash-ink">
      <Loader2 size={15} className="shrink-0 animate-spin text-dash-muted" />
      Examining and reading the sheets on this page first… {left} to go.
    </p>
  );
}
