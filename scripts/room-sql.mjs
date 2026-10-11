/**
 * The situation room's tables, for a database whose schema is applied by hand.
 *
 *   npm run room:sql              prints the SQL. Changes nothing.
 *   npm run room:sql -- --apply   applies it, through the app's own runner.
 *
 * Production does not create tables on its first query (see AUTO_MIGRATE in
 * lib/db.js), so the room's tables have to be put there deliberately, once,
 * before the code that reads them is deployed. Every statement is an addition
 * and every one is written to be safe to run twice.
 */
import { ROOM_MIGRATIONS } from "../lib/room/schema.js";

if (process.argv.includes("--apply")) {
  const { migrate } = await import("../lib/db.js");
  await migrate();
  console.log(`Applied. ${ROOM_MIGRATIONS.length} statements are recorded as run.`);
} else {
  console.log("-- Poll360 situation room. Additions only; safe to apply twice.\n");
  for (const statement of ROOM_MIGRATIONS) console.log(`${statement.replace(/\n\s+\/\*[\s\S]*?\*\//g, "").trim()};\n`);
}
