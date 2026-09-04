/**
 * Let plain `node` resolve the imports Next resolves for us.
 *
 * Two things the bundler does silently and bare Node does not: the `@/` alias
 * for the project root, and extensionless relative imports. Without them a
 * script cannot import lib/replay.js at all, which is why the board had no
 * runnable check for so long.
 *
 * Nothing here rewrites a module. It only answers "where does this specifier
 * live", so what a checker imports is the same file the application imports,
 * byte for byte. A shim that transformed the code would be checking the shim.
 *
 * Registered by scripts/verify-board.mjs; not useful on its own.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);

function settle(url, context) {
  let path = fileURLToPath(url);

  if (!existsSync(path)) {
    for (const extension of [".js", ".mjs", ".jsx", ".json", "/index.js"]) {
      if (existsSync(path + extension)) {
        path += extension;
        break;
      }
    }
  }

  const href = pathToFileURL(path).href;
  return {
    url: href,
    shortCircuit: true,
    /* Next imports JSON bare; Node wants the attribute. Supplied here so the
       module under test needs no edit to be runnable. */
    importAttributes: href.endsWith(".json") ? { type: "json" } : context.importAttributes,
  };
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith("@/")) {
    return settle(new URL(specifier.slice(2), root).href, context);
  }
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    return settle(new URL(specifier, context.parentURL).href, context);
  }
  return next(specifier, context);
}
