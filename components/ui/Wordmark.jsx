import React from "react";
import Link from "next/link";
import BrandMark from "./BrandMark";
import { cn } from "@/lib/utils";

/**
 * Mark plus wordmark. "360" is set in the mono face and in the brand red so
 * the numeral reads as an instrument reading rather than as part of a word —
 * the same trick the board uses on every figure it prints.
 */
export default function Wordmark({ href = "/", className, coverage, ...props }) {
  const content = (
    <>
      <BrandMark coverage={coverage} className="size-10" />
      <span className="font-display text-[1.75rem] leading-none font-extrabold tracking-[-0.045em]">
        Poll<span className="font-mono font-bold text-red-500">360</span>
      </span>
    </>
  );

  const classes = cn("inline-flex items-center gap-2.5 text-content", className);

  if (!href) {
    return (
      <span className={classes} {...props}>
        {content}
      </span>
    );
  }

  return (
    <Link href={href} aria-label="Poll360 — home" className={classes} {...props}>
      {content}
    </Link>
  );
}
