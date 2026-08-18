import React from "react";
import { cn } from "@/lib/utils";
import Reveal from "./Reveal";

/**
 * Section shell and heading block.
 *
 * Owns the page's vertical rhythm and gutters so no band re-declares them.
 * The heading follows the Ford convention: a heavy rule, a numbered kicker,
 * then the title set large against it. Structure comes from the rules — there
 * is no box around anything on this site.
 */
export function Section({
  as: Tag = "section",
  className,
  children,
  wide = false,
  tight = false,
  ...props
}) {
  return (
    <Tag className={cn(tight ? "section-tight" : "section", className)} {...props}>
      <div className={cn("shell", wide && "shell-wide")}>{children}</div>
    </Tag>
  );
}

export function SectionHeading({
  index,
  eyebrow,
  title,
  lead,
  actions,
  className,
  as: TitleTag = "h2",
  titleClassName,
}) {
  return (
    <header className={cn("relative", className)}>
      <Reveal>
        <div className="rule" />
      </Reveal>

      <div
        className={cn(
          "flex flex-col gap-8 pt-6",
          actions && "lg:flex-row lg:items-end lg:justify-between lg:gap-16"
        )}
      >
        <Reveal className="min-w-0">
          {eyebrow && (
            <p className="eyebrow">
              {index && <span className="text-accent">{String(index).padStart(2, "0")}</span>}
              {eyebrow}
            </p>
          )}

          <TitleTag className={cn("mt-5 max-w-[19ch] text-fluid-4xl", titleClassName)}>
            {title}
          </TitleTag>

          {lead && <p className="prose-body mt-6">{lead}</p>}
        </Reveal>

        {actions && (
          <Reveal delay={110} className="flex shrink-0 flex-wrap items-center gap-3">
            {actions}
          </Reveal>
        )}
      </div>
    </header>
  );
}

export default Section;
