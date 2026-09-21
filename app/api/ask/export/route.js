import { currentUser } from "@/lib/session";
import { log } from "@/lib/guard";
import { isStranded, mayOpen } from "@/lib/roles";
import { resolveTerritory } from "@/lib/constituencies";
import { allow } from "@/lib/ask/limits";
import { readJson } from "@/lib/ask/http";
import { FILE_BUDGET, FILE_CEILING, run } from "@/lib/ask/engine";
import { PROVENANCE } from "@/lib/ask/write";
import { holds } from "@/lib/ask/sign";
import { fileStem } from "@/lib/ask/format";
import { briefPdf } from "@/lib/ask/files/pdf";
import { briefCsv, briefXml } from "@/lib/ask/files/tables";

/**
 * An Ask Poll360 answer, as a file.
 *
 * ── THE FIGURES ARE WORKED OUT AGAIN, HERE ─────────────────────────────────
 * The browser sends back the answer it was given and the seal it came with.
 * The words are printed only if the seal holds for this account. The figures
 * are not taken from the browser at all: every plan is run again, inside the
 * account's ground as it stands now, so a file cannot carry a row the screen
 * could not have shown.
 */

export const maxDuration = 60;

const FORMATS = {
  pdf: { type: "application/pdf", ext: "pdf" },
  csv: { type: "text/csv; charset=utf-8", ext: "csv" },
  xml: { type: "application/xml; charset=utf-8", ext: "xml" },
};

/* An answer's words and its plans. Well under this from the product's own screen. */
const MAX_BODY = 256 * 1024;
const MAX_PLANS = 4;

export async function POST(request) {
  const user = await currentUser();
  if (!user) return new Response("Sign in to download.", { status: 401 });
  if (user.status === "PENDING" || isStranded(user.role) || !mayOpen(user.role, "/room")) {
    return new Response("This account cannot open the analytics room.", { status: 403 });
  }
  const limited = await allow("file", user.id);
  if (!limited.ok) {
    return new Response("Too many files at once. Try again in a few minutes.", {
      status: 429,
      headers: { "Retry-After": String(limited.retryAfter) },
    });
  }

  const body = await readJson(request, MAX_BODY);
  if (!body) return new Response("The request did not arrive in one piece.", { status: 400 });

  const format = FORMATS[body?.format];
  if (!format) return new Response("Choose PDF, CSV or XML.", { status: 400 });

  const payload = body?.payload;
  if (!holds(payload, user.id, body?.token)) {
    return new Response("This answer can no longer be turned into a file. Ask the question again and download from the new answer.", {
      status: 409,
    });
  }

  const resolved = user.territory ? resolveTerritory(user.territory) : null;
  const territory =
    user.territory && !resolved
      ? { level: "UNRESOLVED", key: user.territory, name: "a place we no longer hold", stateCode: null, lgas: [] }
      : resolved;

  /* Sealed, so these are plans this product made. Run again all the same:
     the ground an account holds may have changed since it asked. */
  const results = [];
  try {
    for (const plan of (payload.plans ?? []).slice(0, MAX_PLANS)) {
      results.push(await run({ ...plan, limit: plan.limit ?? null }, { territory }));
    }
  } catch (error) {
    console.error("[ask] export plan failed:", error);
    return new Response("This answer can no longer be worked out again. Ask the question again and download from the new answer.", { status: 409 });
  }
  /* Higher levels first and whole, while the file's budget lasts. The PDF
     prints its own shorter extract of each. */
  let budget = body.format === "pdf" ? Infinity : FILE_BUDGET;
  const sections = results.flatMap((result) =>
    result.sections.map((section) => {
      const take = Math.max(0, Math.min(section.rows.length, FILE_CEILING, budget));
      budget -= take;
      return {
        ...section,
        rows: section.rows.slice(0, take),
        provenanceLabel: PROVENANCE[section.provenance] ?? PROVENANCE.counted,
      };
    })
  );
  const understood = results[0]?.understood ?? [];
  const scopeName = results[0]?.scope?.name ?? "Nigeria";
  const madeAt = new Date();
  const input = { payload, sections, understood, scopeName, madeAt };

  let file;
  try {
    if (body.format === "pdf") file = briefPdf(input);
    else if (body.format === "csv") file = briefCsv(input);
    else file = briefXml(input);
  } catch (error) {
    console.error("[ask] file failed:", error);
    return new Response("The file could not be made.", { status: 500 });
  }

  await log(user, "ask:export", String(payload.question).slice(0, 200), {
    format: body.format,
    rows: sections.reduce((sum, section) => sum + section.rows.length, 0),
  });

  const name = `${fileStem(payload.question, madeAt)}.${format.ext}`;
  return new Response(file, {
    headers: {
      "Content-Type": format.type,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
