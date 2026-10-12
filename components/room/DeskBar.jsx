import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Drawn beside the greeting when a desk has the situation room open: the
 * way back to the desk's own working screen, and, for a desk that holds more
 * than one state, which state the room is showing.
 */
export default function DeskBar({ desk, states = [], base }) {
  return (
    <>
      <Link href={desk.href} className="flex h-10 items-center gap-1.5 rounded-full bg-dash-ink px-4 text-[0.8125rem] font-bold whitespace-nowrap text-white hover:bg-blue-700">
        <ArrowLeft size={14} aria-hidden="true" />
        {desk.name}
      </Link>
      {states.length > 1 && (
        <nav aria-label="Your states" className="flex h-10 items-center gap-0.5 rounded-full border border-dash-line bg-dash-card p-1">
          {states.map((state) => (
            <Link key={state.code} href={`${base}?at=${state.code}`} aria-current={state.current ? "page" : undefined} className={cn("flex h-8 items-center rounded-full px-3 text-[0.8125rem] font-semibold whitespace-nowrap", state.current ? "bg-dash-ink text-white" : "text-dash-muted hover:text-dash-ink")}>
              {state.name}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
