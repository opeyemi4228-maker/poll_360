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
           Rounded, because the app tier has a radius and the marketing
           site does not. See --radius-dash in globals.css. */
        dash: "rounded-dash-sm border-dash-ink bg-dash-ink text-white hover:border-red-600 hover:bg-red-600",
        dashOutline:
          "rounded-dash-sm border-dash-line bg-dash-card text-dash-ink hover:border-dash-ink",
        /* Sits on the black rail. */
        railGhost:
          "rounded-dash-sm border-white/20 bg-transparent text-white/80 hover:border-white/60 hover:text-white",
      },
      size: {
        sm: "h-9 px-3.5 text-[0.6875rem]",
        md: "h-12 px-6 text-[0.75rem]",
        lg: "h-14 px-8 text-[0.8125rem]",
        xl: "h-16 px-10 text-sm",
      },
      full: { true: "w-full", false: "" },
    },
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
