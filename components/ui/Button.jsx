import React from "react";
import Link from "next/link";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * One button, every appearance the product needs.
 *
 * Square, heavy, and it does not lift, scale or glow on hover, each variant
 * flips to its inverse instead. That is the Labour behaviour: decisive rather
 * than decorative, and it survives being projected onto a wall, which a soft
 * shadow does not.
 */
const button = cva(
  [
    "group relative inline-flex select-none items-center justify-center gap-2.5",
    "font-display font-extrabold uppercase tracking-[0.08em]",
    "border-2 transition-colors duration-300 ease-out-quart",
    "disabled:pointer-events-none disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        /* The act colour. One per screen, or it stops meaning anything. */
        primary: "border-red-500 bg-red-500 text-white hover:border-ink-950 hover:bg-ink-950",
        dark: "border-ink-950 bg-ink-950 text-white hover:border-red-500 hover:bg-red-500",
        outline: "border-current bg-transparent text-content hover:bg-ink-950 hover:text-white",
        /* On navy and on the board. */
        inverse: "border-white bg-white text-ink-950 hover:border-red-500 hover:bg-red-500 hover:text-white",
        inverseOutline: "border-white/45 bg-transparent text-white hover:border-white hover:bg-white hover:text-ink-950",
        ghost: "border-transparent bg-transparent text-content-muted hover:text-content",

        /* ---- Dashboard variants ---------------------------------------
           Rounded, sentence case and one weight lighter, because the app
           tier is a working surface and the marketing site is a poster.
           See --radius-dash in globals.css. */
dash: "rounded-dash-sm border border-dash-ink bg-dash-ink font-semibold tracking-normal normal-case text-white hover:border-blue-700 hover:bg-blue-700",
        dashOutline:
          "rounded-dash-sm border border-dash-line bg-dash-card font-semibold tracking-normal normal-case text-dash-ink hover:border-dash-ink",
        /* On the white rail, and in the navy panel. Reads the dashboard
           tokens, so it inverts with whatever surface it is placed on. */
        /* The rail's own once-a-night actions: a line, not a box. */
        railQuiet:
          "justify-start gap-3 rounded-dash-sm border-transparent bg-transparent px-3 font-medium tracking-normal normal-case text-dash-muted hover:bg-dash-bg hover:text-dash-ink rail-collapsed:justify-center rail-collapsed:px-0",
        /* The same, as a square: one icon, named by its title. */
        railIcon:
          "shrink-0 rounded-dash-sm border-transparent bg-transparent text-dash-muted hover:bg-dash-bg hover:text-dash-ink",
        railGhost:
          "rounded-dash-sm border border-dash-line bg-transparent font-semibold tracking-normal normal-case text-dash-muted hover:border-dash-ink hover:text-dash-ink",
      },
      size: {
        sm: "h-9 px-3.5 text-[0.6875rem]",
        md: "h-12 px-6 text-[0.75rem]",
        lg: "h-14 px-8 text-[0.8125rem]",
        xl: "h-16 px-10 text-sm",
      },
      full: { true: "w-full", false: "" },
    },
    /* The dashboard variants are sentence case, and sentence case at the
       poster sizes above is too small to read: those sizes were drawn for
       tracked capitals. So the same three size names resolve a step larger
       for the app tier, here, rather than every call site choosing again. */
    compoundVariants: [
      { variant: ["dash", "dashOutline", "railGhost"], size: "sm", class: "h-10 px-4 text-[0.8125rem]" },
      { variant: "railQuiet", size: "sm", class: "h-10 px-3 text-[0.8125rem]" },
      { variant: "railIcon", size: "sm", class: "size-10 px-0" },
      { variant: ["dash", "dashOutline", "railGhost"], size: "md", class: "h-11 px-5 text-[0.875rem]" },
      { variant: ["dash", "dashOutline", "railGhost"], size: "lg", class: "h-12 px-6 text-[0.9375rem]" },
    ],
    defaultVariants: { variant: "primary", size: "md", full: false },
  }
);

const Button = React.forwardRef(function Button(
  { className, variant, size, full, href, external, children, ...props },
  ref
) {
  const classes = cn(button({ variant, size, full }), className);

  if (href) {
    const isExternal = external ?? /^(https?:|mailto:|tel:)/.test(href);
    if (isExternal) {
      return (
        <a
          ref={ref}
          href={href}
          /* mailto: and tel: must not open a blank tab, a torn-off empty
             window is what every mail link that does this leaves behind. */
          {...(/^https?:/.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={classes}
          {...props}
        >
          {children}
        </a>
      );
    }
    return (
      <Link ref={ref} href={href} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button ref={ref} className={classes} {...props}>
      {children}
    </button>
  );
});

export default Button;
export { button as buttonVariants };
