import { readFile } from "node:fs/promises";
import path from "node:path";

import { outlineFile, regionsFor } from "./regions.js";

/**
 * The outlines under an Ask Poll360 map, read on the server for the PDF.
 *
 * The screen fetches the same files from public/geo and hands them to the
 * same function in lib/ask/regions.js. Read once per file per process.
 */

const cache = new Map();

function load(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      readFile(path.join(process.cwd(), "public", "geo", file), "utf8")
        .then((text) => JSON.parse(text))
        .catch((error) => {
          cache.delete(file);
          throw error;
        })
    );
  }
  return cache.get(file);
}

/** @returns {Promise<null | { box: number[], regions: { d, color }[] }>} */
export async function geometryFor(map) {
  if (!map) return null;
  try {
    return regionsFor(map, await load(outlineFile(map)));
  } catch (error) {
    console.error("[ask] map outlines failed:", error);
    return null;
  }
}
