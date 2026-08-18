import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be told about this theme's custom scales, or it
 * cannot tell `text-fluid-4xl` (a size) from `text-content` (a colour): it
 * files both under one group, keeps the last, and every section title on the
 * site silently renders at body size.
 */
const FLUID_SIZES = [
  "fluid-xs",
  "fluid-sm",
  "fluid-base",
  "fluid-lg",
  "fluid-xl",
  "fluid-2xl",
  "fluid-3xl",
  "fluid-4xl",
  "fluid-5xl",
  "fluid-6xl",
  "fluid-7xl",
];

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: FLUID_SIZES }],
      shadow: [{ shadow: ["e1", "e2", "e3", "e4"] }],
      "font-family": ["font-display", "font-sans", "font-mono", "font-editorial"],
    },
  },
});

/** Merge class names, letting later Tailwind utilities win. */
export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

/** 176623 -> "176,623" */
export function formatNumber(value) {
  return new Intl.NumberFormat("en-NG").format(Math.round(value ?? 0));
}

/**
 * A percentage that never lies by rounding.
 *
 * 0.4% of booths must not print as "0%" — on election night that is the
 * difference between "nothing has come in" and "a little has". Anything above
 * zero and below the rounding floor prints as "<0.1%".
 */
export function formatShare(value) {
  if (!value) return "0%";
  if (value > 0 && value < 0.1) return "<0.1%";
  return `${Math.round(value * 10) / 10}%`;
}

/** "18:42:07" — the clock a control room actually reads. */
export function formatClock(date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Africa/Lagos",
  }).format(date);
}
