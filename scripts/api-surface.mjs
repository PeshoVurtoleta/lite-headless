// @zakkster/lite-headless / scripts/api-surface.mjs
//
// Single source of truth for the API-surface gate. Both the generator
// (scripts/api-update.mjs -> `npm run api:update`) and the test
// (test/api-surface.test.js) import buildSurface() / serialize() from here,
// so the recorded snapshot and the live check can never disagree.
//
// The `exports` block is derived live from the package.json exports map and
// the real module namespaces / element files. The `aliases` / `primitives` /
// `totals` blocks are frozen: carried forward verbatim from the committed
// snapshot and gated by frozen.hash (see hashFrozen). They are NOT re-derived
// from src.

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const ROOT_URL = new URL("../", import.meta.url);
const PKG_URL = new URL("../package.json", import.meta.url);
export const SNAPSHOT_URL = new URL("../api-surface-snapshot.json", import.meta.url);

const SNAPSHOT_VERSION = "2.0.0";
const FROZEN_AT = "1.0.0-pre";
const FROZEN_REASON =
    "Legacy 1.0.0-pre host/factory census; retained verbatim as a drift " +
    "baseline. Not re-derived from src -- the live gate is the exports block.";
const NOTE =
    "JS API surface for src/. The exports block is derived live from the " +
    "package.json exports map and gated by test/api-surface.test.js; " +
    "regenerate with `npm run api:update`. The aliases/primitives/totals " +
    "blocks are frozen (see frozen.hash) and carried forward verbatim from " +
    FROZEN_AT + ".";

// Deep clone with object keys sorted at every level; arrays keep their order.
function deepSort(value) {
    if (Array.isArray(value)) return value.map(deepSort);
    if (value && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value).sort()) out[key] = deepSort(value[key]);
        return out;
    }
    return value;
}

// Canonical serialization used by both the snapshot writer and the hash.
export function canonicalize(value) {
    return JSON.stringify(deepSort(value));
}

// sha256 over the canonical serialization of {aliases, primitives, totals}.
export function hashFrozen(blocks) {
    const canon = canonicalize({
        aliases: blocks.aliases,
        primitives: blocks.primitives,
        totals: blocks.totals,
    });
    return "sha256-" + createHash("sha256").update(canon, "utf8").digest("hex");
}

// Full snapshot serialization. Sorted keys at every level; trailing newline.
export function serialize(surface) {
    return JSON.stringify(deepSort(surface), null, 2) + "\n";
}

function targetOf(entry) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") return entry.import || null;
    return null;
}

// Replace line and block comments with a single space so a token boundary is
// preserved (`export/*x*/const` -> `export const`, still caught) and so a
// commented-out `define(` or `export` no longer counts.
function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/\/\/[^\n]*/g, " ");
}

async function elementSurface(subpath, absUrl) {
    const text = stripComments(await readFile(absUrl, "utf8"));
    if (/^\s*export\b/m.test(text)) {
        throw new Error(
            "element subpath grew a runtime export; static enumeration is " +
            "no longer sound: " + subpath
        );
    }
    const re = /\bdefine\(\s*"([^"]+)"\s*,/g;
    const tags = [];
    let m;
    while ((m = re.exec(text)) !== null) tags.push(m[1]);
    if (tags.length !== 1) {
        throw new Error(
            "element subpath must call define() exactly once with a plain " +
            'double-quoted tag literal; found ' + tags.length + ": " + subpath
        );
    }
    return { kind: "element", names: [], defines: [tags[0]] };
}

async function moduleSurface(target) {
    const ns = await import(new URL(target, ROOT_URL).href);
    return { kind: "module", names: Object.keys(ns).sort() };
}

// Enumerate the live export surface of every src-resolving exports subpath.
async function buildExports() {
    const pkg = JSON.parse(await readFile(PKG_URL, "utf8"));
    const map = pkg.exports || {};
    const exportsOut = {};
    for (const subpath of Object.keys(map).sort()) {
        if (subpath !== "." && !subpath.startsWith("./")) continue;
        const target = targetOf(map[subpath]);
        if (typeof target !== "string" || !target.startsWith("./src/")) continue;
        const absUrl = new URL(target, ROOT_URL);
        let exists = true;
        try {
            await readFile(absUrl);
        } catch {
            exists = false;
        }
        if (!exists) {
            throw new Error("exports subpath target does not exist: " + subpath + " -> " + target);
        }
        if (subpath.endsWith("/element")) {
            exportsOut[subpath] = await elementSurface(subpath, absUrl);
        } else {
            exportsOut[subpath] = await moduleSurface(target);
        }
    }
    return exportsOut;
}

// Build the full live surface: live exports + frozen blocks carried from the
// committed snapshot + a fresh hash over those frozen blocks.
export async function buildSurface() {
    const snap = JSON.parse(await readFile(SNAPSHOT_URL, "utf8"));
    const blocks = { aliases: snap.aliases, primitives: snap.primitives, totals: snap.totals };
    const exportsOut = await buildExports();
    // The `undocumented` allow-list is a human-curated set of live exports NOT
    // declared in their own subpath's `declare module` block in types.d.ts
    // (utility helpers plus cross-module seams). The list may only shrink:
    // entries leave as declaration parity is decided, none are added by tooling.
    // It is carried through VERBATIM from the committed snapshot -- never
    // synthesized -- so `npm run api:update` cannot launder fresh drift into it.
    if (!Array.isArray(snap.undocumented)) {
        throw new Error("committed snapshot is missing its `undocumented` array");
    }
    return {
        aliases: blocks.aliases,
        exports: exportsOut,
        frozen: { hash: hashFrozen(blocks), at: FROZEN_AT, reason: FROZEN_REASON },
        note: NOTE,
        primitives: blocks.primitives,
        totals: blocks.totals,
        undocumented: snap.undocumented,
        version: SNAPSHOT_VERSION,
    };
}
