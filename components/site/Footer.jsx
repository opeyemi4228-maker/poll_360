import Link from "next/link";
import Wordmark from "@/components/ui/Wordmark";
import { site, footerNav, register } from "@/lib/site";
import { formatNumber } from "@/lib/utils";

/**
 * The footer, and the standing disclosure.
 *
 * The disclosure is set at the top of the block rather than in the smallest
 * type at the bottom, because it is the single most important sentence on the
 * site: a parallel count is not the commission's count, and a product that
 * blurs the two is not worth having.
 */
export default function Footer() {
  return (
    <footer className="on-dark bg-ink-950">
      <div className="shell shell-wide">
        <div className="rule" />

        <div className="grid gap-12 py-14 lg:grid-cols-[1.4fr_2fr] lg:gap-20 lg:py-20">
          <div>
            <Wordmark href={null} className="text-white" />
            <p className="mt-6 max-w-md text-fluid-base leading-relaxed text-white/70">
              {site.description}
            </p>

            <p className="mt-8 border-l-2 border-red-500 pl-4 text-[0.8125rem] leading-relaxed text-white/85">
              Poll360 is not an electoral commission and publishes no official result. The figures
              here are what our agents reported from the booths they were standing in, kept
              separate from the official ones, and always shown with the share of booths behind
              them.
            </p>
          </div>

          <div className="grid gap-10 sm:grid-cols-3">
            {footerNav.map((column) => (
              <div key={column.title}>
                <h2 className="tag text-white/50">{column.title}</h2>
                {/* Footer links are navigation, not small print: set at reading
                    size with a tap target tall enough to hit one-handed. */}
                <ul className="mt-5 space-y-1">
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="inline-block py-1.5 text-[1.0625rem] leading-snug wrap-break-word text-white/75 transition-colors hover:text-white"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="rule-hair" />

        <div className="flex flex-col gap-4 py-9 text-[0.8125rem] leading-relaxed text-white/50 lg:flex-row lg:items-center lg:justify-between lg:gap-10">
          <p>
            © {new Date().getFullYear()} {site.name}. Built for Nigeria&rsquo;s{" "}
            <span className="figure">{formatNumber(register.pollingUnits)}</span> polling units.
          </p>
          <p>
            Boundaries: geoBoundaries (gbOpen), CC BY 4.0. Register: INEC, {register.states}{" "}
            states, <span className="figure">{formatNumber(register.lgas)}</span> LGAs,{" "}
            <span className="figure">{formatNumber(register.wards)}</span> wards.
          </p>
        </div>
      </div>
    </footer>
  );
}
