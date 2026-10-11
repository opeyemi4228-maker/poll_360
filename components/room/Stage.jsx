import { cn } from "@/lib/utils";

/**
 * The top of every desk: four headline figures, then the big map with a
 * column beside it. The layout the situation room already taught the room
 * to read, so no desk has to be learnt twice.
 */
const TONE = { red: "text-light-red", yellow: "text-light-yellow-ink", green: "text-light-green", ink: "text-dash-ink" };

export function StatRow({ stats }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.label} className="rounded-dash border border-dash-line bg-dash-card px-5 py-4 shadow-e2">
            <p className="flex items-center gap-2 text-[0.8125rem] text-dash-muted">
              {Icon && <Icon size={15} aria-hidden="true" />}
              {stat.label}
            </p>
            <p className={cn("mt-2 truncate font-display text-[2rem] leading-none font-bold tracking-[-0.02em] tabular-nums", TONE[stat.tone ?? "ink"])}>{stat.value}</p>
            <p className="mt-2 truncate text-[0.8125rem] text-dash-muted">{stat.note ?? " "}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Stage({ map, children, className }) {
  return (
    <div className={cn("grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_23.5rem]", className)}>
      {map}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

/** A card in the column beside the map: a small label, one big line, then its body. */
export function Side({ label, headline, note, children, className, id }) {
  return (
    <section id={id} className={cn("scroll-mt-24 rounded-dash border border-dash-line bg-dash-card shadow-e2", className)}>
      <header className="px-4 pt-4">
        {label && <p className="text-[0.8125rem] text-dash-muted">{label}</p>}
        {headline && <h2 className="mt-1 font-display text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-dash-ink">{headline}</h2>}
        {note && <p className="mt-1 text-[0.8125rem] text-dash-muted">{note}</p>}
      </header>
      <div className="px-4 pt-3 pb-4">{children}</div>
    </section>
  );
}
