"use client";

/**
 * The boot script, as a plain inline <script> the browser runs during parse.
 *
 * ── WHY THE TYPE CHANGES BETWEEN SERVER AND BROWSER ───────────────────────
 * React 19 warns whenever a component renders a <script> in the browser,
 * because a script created by React on the client is never executed. That is
 * right about the mechanism and irrelevant here: this one only ever needs to
 * run from the server's HTML, where it does.
 *
 * So the server renders it as JavaScript and the browser renders it as inert
 * text, and `suppressHydrationWarning` tells React the two are meant to
 * differ and to keep what the server sent. This is the pattern the framework's
 * own guide gives for exactly this job — see "preventing flash before
 * hydration" in node_modules/next/dist/docs.
 *
 * ── NO NONCE, ON PURPOSE ─────────────────────────────────────────────────
 * The content security policy allows this script by its hash, not by the
 * request's nonce. A nonce here is what used to break hydration on every page:
 * the browser hides its value, the client render never knew it, and React
 * reported the difference. See lib/boot-script.js.
 */
export default function BootScript({ html }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
