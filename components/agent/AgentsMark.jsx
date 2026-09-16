import { cn } from "@/lib/utils";

/**
 * The agents' app mark: a dark square, an "A", a short red rule. The same
 * drawing as the home-screen icon, so the app on the phone and the header on
 * the page are visibly one thing — and visibly not Poll360.
 */
export default function AgentsMark({ className, tone = "dark" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-9 shrink-0 flex-col items-center justify-center rounded-[0.55rem]",
        tone === "dark" ? "bg-ink-950 text-white" : "bg-white text-ink-950",
        className
      )}
    >
      <span className="text-[1.05rem] leading-none font-extrabold">A</span>
      <span className="mt-0.5 h-[3px] w-3 bg-red-500" />
    </span>
  );
}
