"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * The card a post will be, drawn while it is written.
 *
 * Sits inside the write form and follows its Title field, so the writer sees
 * the actual file — faces, figures and headline — before sending it for
 * clearance, not a sketch of it. The picture comes from /api/graphic/preview,
 * the same renderer the post is published with.
 *
 * It waits for a pause in the typing before asking for a new picture: the
 * renderer is not free, and a picture per keystroke would queue a dozen
 * drawings nobody looks at.
 */
export default function CardPreview({ scope = "NATION", shape = "square" }) {
  const box = useRef(null);
  const [headline, setHeadline] = useState("");
  const [loaded, setLoaded] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const form = box.current?.closest("form");
    const field = form?.querySelector('[name="title"]');
    if (!field) return undefined;
    let timer = null;
    const listen = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setHeadline(field.value.trim()), 700);
    };
    field.addEventListener("input", listen);
    return () => {
      clearTimeout(timer);
      field.removeEventListener("input", listen);
    };
  }, []);

  const src = `/api/graphic/preview?${new URLSearchParams({ scope, format: "result-card", shape, ...(headline ? { headline } : {}) })}`;
  /* Drawing until the picture for this exact address has arrived. */
  const loading = loaded !== src;

  /* A picture that arrived before the page hydrated fired its events to
     nobody; ask the element itself — see PersonPhoto.jsx. */
  const image = useRef(null);
  useEffect(() => {
    const node = image.current;
    if (!node?.complete) return;
    if (node.naturalWidth > 0) setLoaded(src);
    else setFailed(true);
  }, [src]);

  return (
    <div ref={box} className="overflow-hidden rounded-dash-sm border border-dash-line bg-dash-bg">
      <p className="flex items-center justify-between border-b border-dash-line px-3 py-1.5 text-[0.75rem] font-medium text-dash-muted">
        The card, as it will go out
        {loading && !failed && <Loader2 size={13} className="animate-spin" aria-label="Drawing" />}
      </p>
      {failed ? (
        <p className="px-3 py-8 text-center text-[0.8125rem] text-dash-muted">The preview could not be drawn just now. The post is unaffected.</p>
      ) : (
        /* eslint-disable-next-line @next/next/no-img-element -- a PNG drawn on request, not a static asset */
        <img
          key={src}
          ref={image}
          src={src}
          alt="Preview of the result card"
          className="aspect-square w-full object-contain"
          onLoad={() => setLoaded(src)}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
