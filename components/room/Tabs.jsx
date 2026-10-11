import Link from "next/link";

import { hrefWith } from "./Panels";
import { cn } from "@/lib/utils";

/** Tabs that are links: which one is open is in the address, so a refresh keeps it. */
export default function Tabs({ tabs, current, base, query = {}, name = "tab" }) {
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-dash-line">
      {tabs.map(([id, label, count]) => (
        <Link
          key={id}
          href={hrefWith(base, query, { [name]: id })}
          aria-current={current === id ? "page" : undefined}
          className={cn("-mb-px border-b-2 px-3 py-2 text-[0.875rem] font-semibold whitespace-nowrap", current === id ? "border-dash-ink text-dash-ink" : "border-transparent text-dash-muted hover:text-dash-ink")}
        >
          {label}
          {count != null && <span className="ml-1.5 rounded-full bg-dash-bg px-1.5 py-0.5 text-[0.75rem] tabular-nums">{count}</span>}
        </Link>
      ))}
    </nav>
  );
}
