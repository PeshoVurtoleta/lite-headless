// @zakkster/lite-headless / scripts/api-update.mjs
//
// Regenerate api-surface-snapshot.json from live reality. Wired as
// `npm run api:update`. NEVER invoked from the test run -- the test only reads
// the committed snapshot and re-derives the surface to diff against it.

import { writeFile } from "node:fs/promises";
import { buildSurface, serialize, SNAPSHOT_URL } from "./api-surface.mjs";

await writeFile(SNAPSHOT_URL, serialize(await buildSurface()));
console.log("api-surface-snapshot.json updated");
