import AgentsMark from "@/components/agent/AgentsMark";
import { AGENTS_APP, AGENTS_ICONS } from "@/lib/agents-app";

/**
 * The agents' app chrome: its own name, its own mark, its own install.
 *
 * ── NOT POLL360 ────────────────────────────────────────────────────────────
 * Agents use "Agents", on their own domain. The tab title, the home-screen
 * name and icon, the header and the sign-in page all say so, and the metadata
 * here replaces Poll360's for every agent page — see lib/agents-app.js.
 *
 * ── NOT A DESK EITHER ──────────────────────────────────────────────────────
 * An agent has one polling unit and one phone. The chrome is one mark at the
 * top and nothing that navigates anywhere else.
 */
export const metadata = {
  title: { default: AGENTS_APP.name, template: `%s · ${AGENTS_APP.name}` },
  description: AGENTS_APP.description,
  applicationName: AGENTS_APP.name,
  manifest: "/agents.webmanifest",
  appleWebApp: { capable: true, title: AGENTS_APP.name, statusBarStyle: "default" },
  icons: { icon: AGENTS_ICONS.favicon, apple: AGENTS_ICONS.apple },
  openGraph: null,
  twitter: null,
  robots: { index: false, follow: false },
};

export default function AgentLayout({ children }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-5">
          <AgentsMark />
          <span className="text-[1.0625rem] font-extrabold tracking-[-0.01em] text-ink-950">{AGENTS_APP.name}</span>
          <span className="ml-auto text-[0.8125rem] font-semibold text-content-subtle">Polling unit</span>
        </div>
      </header>
      {children}
    </div>
  );
}
