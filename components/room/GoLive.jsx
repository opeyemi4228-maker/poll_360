"use client";

import { useState, useTransition } from "react";

import Button from "@/components/ui/Button";
import { startLive } from "@/app/broadcast/actions";
import { useOnline } from "./ActionForm";

/**
 * One press opens the live broadcast. Poll360 opens it and hands over what
 * the streaming software needs; the software still has to send the picture.
 */
export default function GoLive({ projectTitle }) {
  const [title, setTitle] = useState("");
  const [said, setSaid] = useState(null);
  const [pending, start] = useTransition();
  const online = useOnline();

  const go = () => {
    if (!window.confirm("Open a live broadcast now?")) return;
    start(async () => {
      const out = await startLive({ title: title || `${projectTitle} live results`, platforms: ["facebook", "youtube"] });
      setSaid(out?.error ? { error: out.error } : { ok: true });
    });
  };

  return (
    <div className="space-y-2">
      <label className="block text-[0.8125rem] font-semibold text-dash-ink">
        Programme title
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder={`${projectTitle} live results`} className="mt-1 h-10 w-full rounded-dash-sm border border-dash-line bg-dash-card px-3 text-[0.875rem] font-normal" />
      </label>
      <Button type="button" variant="dash" size="sm" onClick={go} disabled={pending || !online}>Go live</Button>
      {said?.error && <p role="alert" className="text-[0.8125rem] font-semibold text-light-red">{said.error}</p>}
      {said?.ok && <p role="status" className="text-[0.8125rem] font-semibold text-light-green">The broadcast is open. It is listed above as live; point your streaming software at it to send the picture.</p>}
    </div>
  );
}
