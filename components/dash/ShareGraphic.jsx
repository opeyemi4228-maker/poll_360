"use client";

import { useCallback, useRef, useState } from "react";
import { Download, Loader2, Printer, RefreshCw, Share2 } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The count, as something a desk can post.
 *
 * ── WHY THIS SITS ON THE BROADCAST DESK ────────────────────────────────────
 * Between bulletins the audience is on a phone and the count has moved. What
 * happens without this is somebody photographs the wall board and posts that:
 * a glare-lit crop with no timestamp, no coverage figure and nothing saying
 * whether it is our parallel count or a declaration — and that picture outlives
 * the bulletin. The desk makes the picture instead, from the figures the board
 * is already drawing. See app/api/graphic.
 *
 * ── AND WHY IT STOPS SHORT OF POSTING ──────────────────────────────────────
 * Nothing here publishes. Posting to X, Facebook or Instagram needs an app, an
 * OAuth grant and a stored token per account, and a desk handing that token to
 * software is handing it the ability to publish a result in the organisation's
 * name with nobody watching. So this hands over a file: the phone's own share
 * sheet, a download, the clipboard, or paper. A person decides what goes out,
 * which is the editorial control, and it should stay where it is.
 *
 * ── THE PREVIEW IS THE ARTEFACT ────────────────────────────────────────────
 * What is on screen is the PNG itself, not a rehearsal of it in HTML. A
 * preview built separately from the file is a preview that will one day
 * disagree with what gets posted, and the first anybody knows of it is after
 * it has been posted.
 */

const SHAPES = [
  { id: "wide", label: "Wide", note: "1200 × 675 · timeline" },
  { id: "square", label: "Square", note: "1080 × 1080 · feed" },
  { id: "story", label: "Story", note: "1080 × 1920 · full screen" },
];

export default function ShareGraphic({ race }) {
  const [shape, setShape] = useState("wide");
  /* Bumped to re-stamp the graphic. The clock on the picture is the moment it
     was made, so "restamp" has to be a new request and not a cached one.
     Changing shape changes the address by itself and needs no help. */
  const [stamp, setStamp] = useState(() => Date.now());
  const [busy, setBusy] = useState(null);
  const [said, setSaid] = useState(null);
  const frame = useRef(null);

  const src = `/api/graphic?shape=${shape}&race=${encodeURIComponent(race ?? "")}&t=${stamp}`;

  const fetchFile = useCallback(async () => {
    const response = await fetch(src);
    if (!response.ok) throw new Error(await response.text());
    const blob = await response.blob();
    return new File([blob], `poll360-${shape}-${Date.now()}.png`, { type: "image/png" });
  }, [src, shape]);

  const run = async (name, job) => {
    setBusy(name);
    setSaid(null);
    try {
      setSaid(await job());
    } catch (error) {
      setSaid(error.message || "That did not work.");
    } finally {
      setBusy(null);
    }
  };

  const download = () =>
    run("download", async () => {
      const file = await fetchFile();
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      return "Saved to your downloads.";
    });

  const share = () =>
    run("share", async () => {
      const file = await fetchFile();
      /* The phone's own sheet, which is the only route that reaches every app
         somebody actually posts from without this product holding a token for
         any of them. Desktop browsers mostly cannot share a file, so the
         control says so rather than failing silently. */
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "Poll360" });
        return "Handed to your share sheet.";
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      return "This browser cannot share a file, so it has been saved instead. Attach it to your post.";
    });

  const copy = () =>
    run("copy", async () => {
      const file = await fetchFile();
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        return "This browser will not take an image from the clipboard. Use Save instead.";
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file })]);
      return "Copied. Paste it straight into the post.";
    });

  const print = () =>
    run("print", async () => {
      const file = await fetchFile();
      const url = URL.createObjectURL(file);
      const node = frame.current;
      if (!node) return "Nothing to print.";
      node.srcdoc = `<style>@page{margin:12mm}body{margin:0}img{width:100%}</style><img src="${url}" onload="window.focus();window.print()">`;
      return "Sent to the printer.";
    });

  return (
    <section className="overflow-hidden rounded-dash border border-dash-line bg-dash-card">
      <header className="flex flex-wrap items-center gap-3 border-b border-dash-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="font-display text-[0.9375rem] font-extrabold text-dash-ink">
            Post the count
          </h3>
          <p className="mt-0.5 text-[0.75rem] text-dash-muted">
            The live figures as a picture, with the booths behind them and the minute it was true
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStamp(Date.now())}
          className="ml-auto flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-2.5 py-1.5 text-[0.75rem] font-semibold text-dash-muted transition-colors hover:border-dash-ink hover:text-dash-ink"
        >
          <RefreshCw size={13} strokeWidth={2.5} />
          Restamp
        </button>
      </header>

      <div className="flex flex-wrap gap-1 border-b border-dash-line px-4 py-2.5">
        {SHAPES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setShape(item.id)}
            aria-pressed={shape === item.id}
            title={item.note}
            className={cn(
              "rounded-full px-3 py-1.5 text-[0.75rem] font-bold transition-colors",
              shape === item.id
                ? "bg-dash-ink text-white"
                : "border border-dash-line text-dash-muted hover:text-dash-ink"
            )}
          >
            {item.label}
          </button>
        ))}
        <span className="ml-auto self-center text-[0.6875rem] text-dash-muted">
          {SHAPES.find((item) => item.id === shape)?.note}
        </span>
      </div>

      {/* The artefact itself, not a rehearsal of it. */}
      <div className="bg-dash-bg p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={src}
          src={src}
          alt="The current count, as it would be posted: every party with votes, the share of booths behind the totals, and the time it was made."
          className="mx-auto max-h-[26rem] w-auto max-w-full rounded-dash-sm border border-dash-line"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-dash-line px-4 py-3">
        <Action icon={Share2} busy={busy === "share"} onClick={share}>
          Share
        </Action>
        <Action icon={Download} busy={busy === "download"} onClick={download}>
          Save PNG
        </Action>
        <Action busy={busy === "copy"} onClick={copy}>
          Copy
        </Action>
        <Action icon={Printer} busy={busy === "print"} onClick={print}>
          Print
        </Action>
      </div>

      {said && (
        <p className="border-t border-dash-line px-4 py-2.5 text-[0.75rem] text-dash-muted">
          {said}
        </p>
      )}

      <p className="border-t border-dash-line px-4 py-2.5 text-[0.6875rem] leading-relaxed text-dash-muted">
        <span className="font-semibold text-dash-ink">Nothing here posts anything.</span> Publishing
        straight to a social account would mean this system holding a token that can post in your
        organisation&rsquo;s name unattended. It hands you the file; you decide what goes out.
      </p>

      <iframe ref={frame} title="Print" className="hidden" />
    </section>
  );
}

function Action({ icon: Icon, busy, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="flex items-center gap-1.5 rounded-dash-sm border border-dash-line px-3 py-2 text-[0.8125rem] font-bold text-dash-ink transition-colors hover:border-dash-ink disabled:opacity-50"
    >
      {busy ? (
        <Loader2 size={14} strokeWidth={2.5} className="animate-spin" />
      ) : (
        Icon && <Icon size={14} strokeWidth={2.5} />
      )}
      {children}
    </button>
  );
}
