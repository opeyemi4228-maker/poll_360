import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

/**
 * Every method this product calls on its own stores actually exists.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BUG THIS CATCHES HAS SHIPPED TWICE
 *
 *  `alerts.reduce is not a function` took the situations console down: the
 *  value was an object and the caller thought it was a list. Then
 *  `coordinators.seen(...)` was written for a function actually named
 *  `markSignedIn`, which would have thrown the first time an agent signed in
 *  with their code — on polling morning, on the path that exists so somebody
 *  who forgot their password can still file.
 *
 *  Nothing in this repository catches either one. The build does not: a
 *  property that does not exist is a perfectly valid expression until the line
 *  runs. `no-undef` does not: the object is defined, only the key is wrong.
 *  And no test reaches them, because node's runner has no DOM and no path
 *  aliases, so nothing here renders a server action or a client component.
 *
 *  So this reads the source instead. It is a crude check and it is the only
 *  one available, and it would have caught both.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── WHY IT SCANS TEXT RATHER THAN IMPORTING ────────────────────────────────
 * Importing `lib/coordinators.js` pulls in `lib/db.js`, which refuses to load
 * without a database. That is right for a module whose whole job is a
 * database and it makes the module untestable here, so the check is made
 * against the file as written rather than as loaded. It cannot see a method
 * built dynamically — nothing in these modules builds one — and it can see
 * every one that is typed out, which is all of them.
 */

const ROOT = new URL("..", import.meta.url).pathname;

/** The stores worth checking, and where their methods are declared. */
const STORES = [
  { name: "coordinators", file: "lib/coordinators.js" },
  { name: "coordinatorSessions", file: "lib/coordinators.js" },
];

/** Where calls to them are made. */
const CALLERS = ["app", "components", "lib"];

/** Every .js and .jsx under a directory. */
function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "generated" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, found);
    else if (/\.jsx?$/.test(entry)) found.push(path);
  }
  return found;
}

/**
 * The keys an object literal exports.
 *
 * These stores are written as `export const coordinators = { async foo() {},
 * bar() {}, baz: ... }`, so the declarations are `name(` or `name:` at the
 * start of a line inside the object. Deliberately generous about what counts
 * as a declaration and strict about what counts as a call: a false positive
 * here is a failing test on correct code, which is worse than a miss.
 */
function methodsOf(source, name) {
  const start = source.indexOf(`export const ${name} = {`);
  if (start < 0) return null;

  /* To the end of the object literal, found by brace depth rather than by a
     regex — these objects contain braces, strings and template literals. */
  let depth = 0;
  let end = start;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = index;
        break;
      }
    }
  }

  const body = source.slice(start, end);
  const found = new Set();
  for (const match of body.matchAll(/^\s{2}(?:async\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s*[(:]/gm)) {
    found.add(match[1]);
  }
  return found;
}

describe("calls into this product's own stores", () => {
  for (const store of STORES) {
    it(`only reaches methods ${store.name} actually has`, () => {
      const source = readFileSync(join(ROOT, store.file), "utf8");
      const declared = methodsOf(source, store.name);
      assert.ok(declared, `${store.name} is not an object literal in ${store.file} any more`);
      assert.ok(declared.size > 3, `only found ${declared.size} methods on ${store.name}`);

      const wrong = [];
      for (const dir of CALLERS) {
        for (const file of walk(join(ROOT, dir))) {
          const text = readFileSync(file, "utf8");

          /* ── ONLY FILES THAT ACTUALLY IMPORT THE STORE ────────────────────
             "coordinators" is also the obvious name for an array of them, and
             components hold one as a prop: CoordinatorWatch calls
             `coordinators.filter(...)` on a list, which is correct code and
             has nothing to do with this module.

             So a file is only checked if it imports the store from the file
             the store lives in. Narrowing by import rather than by guessing
             which method names look like array methods, because that guess
             would have to be revisited every time either list changed. */
          const imports = new RegExp(
            `import\\s*\\{[^}]*\\b${store.name}\\b[^}]*\\}\\s*from\\s*["']@?/?(\\.{0,2}/)*lib/coordinators`
          ).test(text);
          if (!imports) continue;

          for (const match of text.matchAll(
            new RegExp(`\\b${store.name}\\.([a-zA-Z][a-zA-Z0-9_]*)\\s*\\(`, "g")
          )) {
            if (!declared.has(match[1])) {
              wrong.push(`${file.slice(ROOT.length)} calls ${store.name}.${match[1]}()`);
            }
          }
        }
      }

      assert.deepEqual(
        wrong,
        [],
        `\n  ${wrong.join("\n  ")}\n\n  ${store.name} has: ${[...declared].sort().join(", ")}\n`
      );
    });
  }
});
