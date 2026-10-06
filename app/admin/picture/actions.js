"use server";

import { requireCapability } from "@/lib/guard";
import { analyse } from "@/lib/picture";
import { spotMap, whereIs } from "@/lib/place";

/**
 * Examine a picture somebody has handed over.
 *
 * ── ONLY THE PARTS OF THE FILE THAT CARRY THE DETAILS ARE SENT ─────────────
 * A camera writes its note at the very start of a photograph, and a document
 * keeps its own record at the very end. So the browser sends the head of the
 * file and, for a large one, its tail — never the whole of a twenty-megabyte
 * scan — and works out the file's fingerprint itself, over every byte, before
 * anything leaves the machine. The picture is examined and forgotten: nothing
 * is saved here.
 */
export async function examinePicture(_previous, formData) {
  await requireCapability("results:verify", "/admin/picture");

  const part = formData.get("part");
  if (!part || typeof part.arrayBuffer !== "function" || part.size === 0) {
    return { error: "Choose a picture or a document first." };
  }

  const found = analyse(Buffer.from(await part.arrayBuffer()));
  if (!found.kind) return { error: found.notes[0] };

  const where = found.place ? await whereIs(found.place.latitude, found.place.longitude) : null;

  return {
    found,
    where,
    map: found.place ? await spotMap(found.place.latitude, found.place.longitude) : null,
    name: String(formData.get("name") ?? "").slice(0, 200) || null,
    size: Number(formData.get("size")) || null,
    fingerprint: /^[0-9a-f]{64}$/.test(String(formData.get("fingerprint"))) ? String(formData.get("fingerprint")) : null,
  };
}
