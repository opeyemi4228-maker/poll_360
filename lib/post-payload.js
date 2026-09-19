import { results } from "./db.js";
import { buildPost } from "./post-build.js";
import { isRace } from "./races.js";
import { viewing } from "./viewing.js";

/**
 * What a social post carries, decided on the server.
 *
 * The writer chooses a place and a kind of card. Everything the card then
 * says — the figures, the map colouring, the place's full name, the minute and
 * the point on the map — is worked out here from the stored returns the
 * writer's room can read (lib/post-build.js). A browser cannot send figures of
 * its own; the only thing it can choose is where.
 *
 * The minute is the moment the figures are read here, on the server — the
 * same moment the card's numbers come from — so the stamp and the figures
 * can never disagree about when they were true.
 */
export async function socialPayload(values) {
  const given = values?.payload ?? {};
  const at = Date.now();

  const { project, race: roomRace, territory } = await viewing("/room");
  const race = isRace(values?.race) ? values.race : roomRace;
  const rows = project && race ? await results.counted(project.id, race, territory) : [];
  const built = buildPost({ rows, scope: values?.scope ?? "NATION", race, at });

  return {
    ...built,
    format: String(given.format ?? "result-card"),
    shape: ["wide", "square", "story"].includes(given.shape) ? given.shape : "square",
    headline: given.headline ? String(given.headline).slice(0, 120) : null,
    sendOnClear: Boolean(given.sendOnClear),
    project: project?.title ?? null,
  };
}

