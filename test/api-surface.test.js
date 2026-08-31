// Tests: api-surface gate.
//
// Diffs the committed api-surface-snapshot.json `exports` block against the
// live surface derived by the shared enumerator (scripts/api-surface.mjs).
// The generator (`npm run api:update`) and this test call the SAME
// buildSurface(), so a drift can only mean src moved without the snapshot.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildSurface, hashFrozen, SNAPSHOT_URL } from "../scripts/api-surface.mjs";

const snapshot = JSON.parse(await readFile(SNAPSHOT_URL, "utf8"));
const live = await buildSurface();
const liveExports = live.exports;
const snapExports = snapshot.exports;

const liveKeys = Object.keys(liveExports).sort();
const snapKeys = Object.keys(snapExports).sort();

test("every live subpath appears in the snapshot", () => {
    const missing = liveKeys.filter((k) => !(k in snapExports));
    assert.deepEqual(missing, [], "live subpaths absent from snapshot: " + missing.join(", "));
});

test("every snapshot subpath resolves to a live export set", () => {
    const extra = snapKeys.filter((k) => !(k in liveExports));
    assert.deepEqual(extra, [], "snapshot subpaths with no live export set: " + extra.join(", "));
});

test("export names match per subpath", () => {
    for (const subpath of liveKeys) {
        if (!(subpath in snapExports)) continue;
        assert.deepEqual(
            liveExports[subpath].names,
            snapExports[subpath].names,
            "names drift at " + subpath
        );
    }
});

test("element subpaths export nothing and define exactly one tag", () => {
    for (const subpath of liveKeys) {
        const entry = liveExports[subpath];
        if (entry.kind !== "element") continue;
        assert.deepEqual(entry.names, [], "element " + subpath + " must export nothing");
        assert.equal(entry.defines.length, 1, "element " + subpath + " must define exactly one tag");
        assert.deepEqual(
            snapExports[subpath].defines,
            entry.defines,
            "defines drift at " + subpath
        );
    }
});

test("frozen primitives block matches its recorded hash", () => {
    const recomputed = hashFrozen({
        aliases: snapshot.aliases,
        primitives: snapshot.primitives,
        totals: snapshot.totals,
    });
    assert.equal(recomputed, snapshot.frozen.hash, "frozen block drifted from its recorded hash");
});

test("snapshot and generator sources are ASCII-legal", async () => {
    const files = [
        SNAPSHOT_URL,
        new URL("../scripts/api-surface.mjs", import.meta.url),
        new URL("../scripts/api-update.mjs", import.meta.url),
        new URL(import.meta.url),
    ];
    for (const url of files) {
        const text = await readFile(url, "utf8");
        for (let i = 0; i < text.length; i++) {
            const c = text.charCodeAt(i);
            const ok =
                (c >= 0x20 && c <= 0x7e) ||
                c === 0x0a ||
                c === 0x09 ||
                c === 0x00d7 ||
                c === 0x00b5;
            assert.ok(
                ok,
                "non-ASCII-legal U+" + c.toString(16).toUpperCase().padStart(4, "0") +
                    " at index " + i + " in " + url.pathname
            );
        }
    }
});

test("every live export is declared in types.d.ts or pinned; every pin is absent from its subpath's own declare-module block", async () => {
    const types = await readFile(new URL("../types.d.ts", import.meta.url), "utf8");
    const typeLines = types.split("\n");

    // Extract the body of `declare module "@zakkster/lite-headless<tail>" { ... }`.
    // The block ends at the first line that is a closing brace at column 0.
    // Returns null when no such block exists (a pinned subpath with no block is
    // a fail-closed condition, not a pass).
    const moduleBlock = (tail) => {
        const opener = 'declare module "@zakkster/lite-headless' + tail + '" {';
        let start = -1;
        for (let i = 0; i < typeLines.length; i++) {
            if (typeLines[i].startsWith(opener)) {
                start = i;
                break;
            }
        }
        if (start === -1) return null;
        for (let j = start + 1; j < typeLines.length; j++) {
            if (typeLines[j] === "}") return typeLines.slice(start + 1, j).join("\n");
        }
        return null;
    };

    // Is NAME declared inside a given block body? Anchored declaration or a
    // member of an `export { ... }` list within the block.
    const declaredInBlock = (block, name) => {
        const declInBlockRe = new RegExp(
            "^\\s*export\\s+(?:declare\\s+)?(?:async\\s+)?(?:function|const|let|var|class|interface|type|enum)\\s+" +
                name + "\\b",
            "m"
        );
        if (declInBlockRe.test(block)) return true;
        const braceReLocal = /export\s+(?:type\s+)?\{([\s\S]*?)\}/g;
        let lm;
        while ((lm = braceReLocal.exec(block)) !== null) {
            for (let tok of lm[1].split(",")) {
                tok = tok.trim();
                if (!tok) continue;
                const parts = tok.split(/\s+as\s+/);
                const exported = parts[parts.length - 1].trim();
                if (exported === name) return true;
            }
        }
        return false;
    };

    // Anchored declaration scan. A name counts as declared only via a real
    // declaration position -- never a bare substring (which false-passes on a
    // name that merely appears inside a comment or another signature).
    const declared = new Set();
    // Line-anchored value declarations: export [declare] [async] function|const|let|var|class NAME
    const declRe = /^\s*export\s+(?:declare\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/;
    for (const line of types.split("\n")) {
        const m = declRe.exec(line);
        if (m) declared.add(m[1]);
    }
    // export { ... } / export type { ... } blocks (with or without a from clause).
    const braceRe = /export\s+(?:type\s+)?\{([\s\S]*?)\}/g;
    let bm;
    while ((bm = braceRe.exec(types)) !== null) {
        for (let tok of bm[1].split(",")) {
            tok = tok.trim();
            if (!tok) continue;
            const parts = tok.split(/\s+as\s+/);
            const name = parts[parts.length - 1].trim();
            if (/^[A-Za-z0-9_$]+$/.test(name)) declared.add(name);
        }
    }

    const undocumented = snapshot.undocumented;
    const pinned = new Set(undocumented);

    // (1) every live export is declared or pinned.
    const uncovered = [];
    for (const subpath of liveKeys) {
        const entry = liveExports[subpath];
        if (entry.kind !== "module") continue;
        for (const name of entry.names) {
            if (declared.has(name)) continue;
            if (pinned.has(subpath + "#" + name)) continue;
            uncovered.push(subpath + "#" + name);
        }
    }
    assert.deepEqual(
        uncovered,
        [],
        "live exports neither declared in types.d.ts nor pinned in undocumented[]: " +
            uncovered.join(", ")
    );

    // (2) the allowlist is a fixed budget that may only shrink, never grow.
    assert.equal(undocumented.length, 32, "undocumented[] must hold exactly 32 entries");

    // (3) no ghosts: every pinned entry resolves to a live export.
    const ghosts = [];
    for (const entry of undocumented) {
        const hash = entry.indexOf("#");
        const subpath = entry.slice(0, hash);
        const name = entry.slice(hash + 1);
        const live = liveExports[subpath];
        if (!live || live.kind !== "module" || !live.names.includes(name)) {
            ghosts.push(entry);
        }
    }
    assert.deepEqual(ghosts, [], "undocumented[] entries with no live export: " + ghosts.join(", "));

    // (4) every pin must be absent from its subpath's OWN declare-module block.
    // Once a subpath declares the name, the pin is stale and must be removed --
    // the allowlist may only shrink. A missing block fails closed.
    const stale = [];
    for (const entry of undocumented) {
        const hash = entry.indexOf("#");
        const subpath = entry.slice(0, hash);
        const name = entry.slice(hash + 1);
        const tail = subpath === "." ? "" : subpath.slice(1); // "./avatar" -> "/avatar"
        const block = moduleBlock(tail);
        if (block === null) {
            stale.push(entry + " (no declare-module block)");
            continue;
        }
        if (declaredInBlock(block, name)) {
            stale.push(entry + " (now declared in its own block -- remove the pin)");
        }
    }
    assert.deepEqual(stale, [], "undocumented[] pins that are no longer live-only: " + stale.join(", "));
});
