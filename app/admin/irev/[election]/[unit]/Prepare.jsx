"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { prepareUnit } from "../../actions";

/**
 * A sheet that is not ready makes itself ready.
 *
 * Opened before the gatherer has reached it, a sheet's page would otherwise
 * show two empty boxes and an instruction to go and wait somewhere else. This
 * asks, once, for the sheet's file to be examined and its figures read, says
 * that it is doing so, and redraws the page when the answer is back.
 */
export default function Prepare({ election, unit, examining, reading }) {
  const router = useRouter();
  const asked = useRef(false);
  const [state, setState] = useState("working");

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;

    prepareUnit(election, unit)
      .then((went) => {
        if (went.examined || went.read) router.refresh();
        setState(went.problem ? went.problem : "done");
      })
      .catch(() => setState("The server could not be reached. Reload the page to try again."));
  }, [election, unit, router]);

  if (state === "done") return null;

  return (
    <p className="mb-6 flex items-center gap-3 rounded-dash border border-dash-line bg-dash-card px-5 py-3.5 text-[0.8125rem] text-dash-ink">
      {state === "working" ? (
        <>
          <Loader2 size={16} className="shrink-0 animate-spin text-dash-muted" />
          {[examining && "Examining the picture", reading && "reading the figures off the sheet"]
            .filter(Boolean)
            .join(" and ")}
          … this takes a few seconds.
        </>
      ) : (
        <>This sheet could not be prepared: {state}</>
      )}
    </p>
  );
}
