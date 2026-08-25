import BrandMark from "@/components/ui/BrandMark";

/**
 * The coordinator's own chrome.
 *
 * ── NOT DashLayout, AND NOT THE MARKETING SITE ─────────────────────────────
 * Both of those are built for a desk: a sidebar of rooms, a masthead of
 * navigation, a footer of links. A coordinator has exactly one job and one
 * screen, reached on a phone, and every pixel spent on somewhere else to go is
 * a pixel taken from the form they came here to fill in.
 *
 * So the whole of this section is one column, one mark at the top, and nothing
 * that navigates anywhere except out.
 */
export const metadata = {
  robots: { index: false },
};

export default function AgentLayout({ children }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-5">
          <BrandMark className="h-7 w-auto text-ink-950" />
          <span className="text-[0.9375rem] font-bold text-ink-950">Poll360</span>
          <span className="ml-auto text-[0.8125rem] font-semibold text-content-subtle">
            Polling unit
          </span>
        </div>
      </header>
      {children}
    </div>
  );
}
