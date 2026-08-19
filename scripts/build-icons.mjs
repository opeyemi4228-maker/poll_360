/**
 * Build the installed-app icons from the Poll360 mark.
 *
 * The mark is geometry, not artwork, so it is drawn here once and rendered at
 * every size an installed app is asked for. Committing the PNGs means the site
 * builds and deploys with no browser and no image library in the dependency
 * tree, the same reason `nation.json` is committed rather than generated at
 * build time.
 *
 *   node scripts/build-icons.mjs
 *
 * Chrome does the rasterising. Override the binary if yours lives elsewhere:
 *   CHROME=/path/to/chrome node scripts/build-icons.mjs
 */

import { writeFile, mkdir, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(root, "public/icons");

const CHROME =
  process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const BOARD = "#0A0D14";
const RED = "#E4003B";

/**
 * The dial, at a given canvas size.
 *
 * `inset` is the share of the canvas left empty around the mark. A maskable
 * icon may be cropped to a circle inscribed in ~80% of the square, so its
 * artwork has to sit well inside that; a plain icon can use nearly the whole
 * canvas. One function, two paddings, no second drawing to keep in step.
 */
function markSvg(size, inset) {
  const c = size / 2;
  const r = (size / 2) * (1 - inset);
  /* The dial sits outside and the arc inside it, rather than the two sharing a
     radius. Overlapped, the arc reads as a smear across the ticks at 48px on a
     home screen; separated, it still reads as a gauge. */
  const ticks = Array.from({ length: 24 }, (_, index) => {
    const angle = (index / 24) * 2 * Math.PI - Math.PI / 2;
    const inner = index % 6 === 0 ? r * 0.82 : r * 0.88;
    return `<line x1="${c + Math.cos(angle) * inner}" y1="${c + Math.sin(angle) * inner}" x2="${
      c + Math.cos(angle) * (r * 1.0)
    }" y2="${c + Math.sin(angle) * (r * 1.0)}" />`;
  }).join("");

  const arcR = r * 0.62;
  const circumference = 2 * Math.PI * arcR;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BOARD}"/>
  <g stroke="#ffffff" stroke-width="${size * 0.042}" stroke-linecap="square" opacity="0.42">${ticks}</g>
  <circle cx="${c}" cy="${c}" r="${arcR}" fill="none" stroke="${RED}" stroke-width="${size * 0.115}"
          stroke-dasharray="${circumference * 0.62} ${circumference}" transform="rotate(-90 ${c} ${c})"/>
  <circle cx="${c}" cy="${c}" r="${r * 0.22}" fill="#ffffff"/>
</svg>`;
}

/* name, pixel size, inset, maskable gets the safe-zone padding. */
const TARGETS = [
  ["icon-192.png", 192, 0.1],
  ["icon-512.png", 512, 0.1],
  ["icon-maskable-512.png", 512, 0.26],
  ["apple-touch-icon.png", 180, 0.12],
];

await mkdir(OUT, { recursive: true });
const scratch = join(tmpdir(), `poll360-icons-${Date.now()}`);
await mkdir(scratch, { recursive: true });

for (const [name, size, inset] of TARGETS) {
  const page = join(scratch, `${name}.html`);
  await writeFile(
    page,
    `<!doctype html><meta charset="utf-8">
     <style>html,body{margin:0;padding:0;background:${BOARD}}svg{display:block}</style>
     ${markSvg(size, inset)}`
  );

  await run(CHROME, [
    "--headless",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--window-size=${size},${size}`,
    `--screenshot=${join(OUT, name)}`,
    "--virtual-time-budget=1200",
    `file://${page}`,
  ]);

  console.log(`${name}  ${size}×${size}`);
}

await rm(scratch, { recursive: true, force: true });
console.log(`\n${TARGETS.length} icons written to public/icons/`);
