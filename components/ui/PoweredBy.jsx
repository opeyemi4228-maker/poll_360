import { site } from "@/lib/site";
import { cn } from "@/lib/utils";

/**
 * "Powered by BitLayerX Technologies", the same words everywhere.
 *
 * Set small and quiet on purpose: it credits the maker without competing with
 * the product's own name, and it sits at the foot of a page, never beside a
 * figure. `tone` follows the surface it sits on.
 */
export default function PoweredBy({ tone = "light", className }) {
  return (
    <p
      className={cn(
        "text-[0.75rem] leading-snug",
        tone === "dark" ? "text-white/50" : "text-dash-muted",
        className
      )}
    >
      Powered by{" "}
      <span className={cn("font-semibold", tone === "dark" ? "text-white/80" : "text-dash-ink")}>{site.poweredBy}</span>
    </p>
  );
}
