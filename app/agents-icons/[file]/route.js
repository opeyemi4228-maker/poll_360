import { ImageResponse } from "next/og";

import { AGENTS_APP } from "@/lib/agents-app";

/**
 * The agents' app icon, drawn rather than stored, at the sizes a phone asks
 * for. The same mark as the header: a dark square, an "A", and a short red
 * rule under it — recognisably its own app on a home screen full of others.
 *
 * `maskable` carries the mark well inside the safe circle, because Android
 * crops launcher icons to whatever shape the phone uses.
 */
const FILES = {
  "32.png": { size: 32, maskable: false },
  "180.png": { size: 180, maskable: false },
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
};

export async function GET(_request, { params }) {
  const { file } = await params;
  const spec = FILES[file];
  if (!spec) return new Response("Not found", { status: 404 });

  const { size, maskable } = spec;
  const tile = maskable ? Math.round(size * 0.62) : size;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: AGENTS_APP.ink,
          borderRadius: maskable ? 0 : Math.round(size * 0.22),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: tile }}>
          <div style={{ display: "flex", color: "#ffffff", fontSize: Math.round(tile * 0.62), fontWeight: 700, lineHeight: 1 }}>
            A
          </div>
          <div
            style={{
              display: "flex",
              width: Math.round(tile * 0.34),
              height: Math.max(2, Math.round(tile * 0.07)),
              marginTop: Math.round(tile * 0.02),
              background: AGENTS_APP.accent,
            }}
          />
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "cache-control": "public, max-age=86400" },
    }
  );
}
