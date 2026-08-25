"use client";

import { useEffect } from "react";

/**
 * The last boundary. What is left when even the layout could not be built.
 *
 * ── WHY THIS IS SEPARATE FROM error.jsx ────────────────────────────────────
 * `app/error.jsx` catches a page that failed, and it is rendered *inside* the
 * root layout — so it has the fonts, the stylesheet and the chrome. If the
 * root layout is what failed, that boundary never runs. Without this file,
 * that case falls through to Next's own screen: a stack trace in development,
 * and in production an unstyled white page with one sentence of English on it.
 *
 * On a situation room's wall at eleven at night, an unbranded white page is
 * indistinguishable from the product having been taken down. This exists so
 * that the worst failure the app has still answers the only two questions
 * anybody in the room actually has.
 *
 * ── WHY IT CARRIES ITS OWN HTML AND ITS OWN STYLES ─────────────────────────
 * It replaces the root layout, so it must supply `<html>` and `<body>` itself.
 * And it cannot use a single class from the stylesheet, because the layout
 * that imports the stylesheet is the thing that just failed. Every rule here
 * is inline for that reason, not out of preference: a fallback that depends
 * on the thing it is a fallback for is not a fallback.
 * ───────────────────────────────────────────────────────────────────────────
 */
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    /* The room gets the calm version. Whoever keeps the deployment up needs
       the real one, and this is the only place it will ever be recorded. */
    console.error("Poll360 failed at the root layout:", error);
  }, [error]);

  return (
    <html lang="en-NG">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem 1.5rem",
          background: "#f7f7f8",
          color: "#14161c",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          lineHeight: 1.6,
        }}
      >
        <main style={{ width: "100%", maxWidth: "34rem" }}>
          <p
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 800,
              letterSpacing: "-0.045em",
            }}
          >
            Poll<span style={{ fontFamily: "ui-monospace, monospace", color: "#dc2626" }}>360</span>
          </p>

          <h1
            style={{
              margin: "1.25rem 0 0",
              fontSize: "1.75rem",
              lineHeight: 1.15,
              fontWeight: 800,
              letterSpacing: "-0.035em",
            }}
          >
            Poll360 could not start
          </h1>

          <p style={{ margin: "0.75rem 0 0", fontSize: "0.9375rem", color: "#5b5f6b" }}>
            This is not one page failing. The application itself did not come up, which
            means something is wrong with the deployment rather than with anything anybody
            in the room has done.
          </p>

          {/* The sentence everybody is actually waiting for, and the reason
              this page exists rather than a blank one. */}
          <p
            style={{
              margin: "1.25rem 0 0",
              padding: "0.875rem 1rem",
              border: "1px solid #e5e5e8",
              borderRadius: "12px",
              background: "#ffffff",
              fontSize: "0.875rem",
            }}
          >
            <strong style={{ fontWeight: 700 }}>Nothing that was filed has been lost.</strong>{" "}
            Every return, incident and payment already recorded is in the database and is
            untouched by this. Nothing here writes or deletes anything.
          </p>

          <div style={{ margin: "1.5rem 0 0", display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                cursor: "pointer",
                borderRadius: "8px",
                background: "#14161c",
                color: "#ffffff",
                padding: "0.65rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 700,
              }}
            >
              Try again
            </button>
            {/* A plain anchor, and the rule is silenced deliberately. This
                boundary catches a failure of the root layout, which is where
                the client router lives — a client-side transition through the
                machinery that just failed cannot be the way out of it. This
                has to be a full page load. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: "8px",
                border: "1px solid #e5e5e8",
                color: "#14161c",
                padding: "0.65rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Reload the site
            </a>
          </div>

          <p style={{ margin: "1.5rem 0 0", fontSize: "0.8125rem", color: "#6b7280" }}>
            If this does not clear on a reload, whoever runs the deployment should check
            that the database is reachable and that the required environment variables are
            set. Those two account for almost every version of this page.
          </p>

          {error?.digest && (
            <p
              style={{
                margin: "1.25rem 0 0",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.6875rem",
                color: "#6b7280",
              }}
            >
              Reference {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
