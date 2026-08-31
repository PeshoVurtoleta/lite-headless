// test/ascii-law.test.js
//
// Enforces the suite ASCII law across the SHIPPED file set (package.json
// files[]): every source, type, doc, and llms.txt byte must be a printable
// ASCII codepoint (U+0020..U+007E), a newline, or a tab -- with exactly two
// glyph exceptions the law grants (U+00D7 MULTIPLICATION SIGN and U+00B5 MICRO
// SIGN). Any other codepoint fails, reported as file:line:col:U+XXXX so a
// reviewer can jump straight to it.
//
// Scope is the files[] whitelist plus the two files npm always ships
// regardless of files[]: package.json and LICENSE. So: src/, types.d.ts,
// docs/, llms.txt, README.md, package.json, LICENSE. CHANGELOG.md is EXCLUDED
// on purpose -- it is a historical record; rewriting shipped changelog entries
// to satisfy a later law would falsify them. It is the only shipped file the
// sweep does not touch, and this allowlist is where that decision is encoded.
//
// A second test pins the README heading order to the suite blueprint spine, so
// a future edit that drops or reorders a top-level section fails here.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// The law's charset: printable ASCII + \n + \t, plus the two granted glyphs.
const TAB = 0x09;
const LF = 0x0a;
const SP = 0x20;
const TILDE = 0x7e;
const MULT = 0x00d7; // U+00D7 x
const MICRO = 0x00b5; // U+00B5 micro

function isLegal(cp) {
    if (cp === TAB || cp === LF) return true;
    if (cp >= SP && cp <= TILDE) return true;
    if (cp === MULT || cp === MICRO) return true;
    return false;
}

// files[] scope plus the always-shipped package.json + LICENSE, minus
// CHANGELOG.md (see header). Directories are walked.
const DIR_TARGETS = ["src", "docs"];
const FILE_TARGETS = ["types.d.ts", "llms.txt", "README.md", "package.json", "LICENSE"];

function walk(dir, acc) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walk(p, acc);
        else acc.push(p);
    }
    return acc;
}

function collectFiles() {
    const files = [];
    for (const d of DIR_TARGETS) walk(join(ROOT, d), files);
    for (const f of FILE_TARGETS) files.push(join(ROOT, f));
    return files;
}

function scanFile(path) {
    const text = readFileSync(path, "utf8");
    const lines = text.split("\n");
    const violations = [];
    for (let li = 0; li < lines.length; li++) {
        let col = 0;
        for (const ch of lines[li]) {
            col++;
            const cp = ch.codePointAt(0);
            if (!isLegal(cp)) {
                violations.push(
                    relative(ROOT, path) + ":" + (li + 1) + ":" + col +
                    ":U+" + cp.toString(16).toUpperCase().padStart(4, "0"),
                );
            }
        }
    }
    return violations;
}

test("shipped files carry only ASCII (plus U+00D7 and U+00B5)", () => {
    const all = [];
    for (const f of collectFiles()) all.push(...scanFile(f));
    assert.deepEqual(
        all,
        [],
        "non-ASCII codepoints found in shipped files:\n" + all.join("\n"),
    );
});

test("README top-level sections follow the blueprint spine order", () => {
    const readme = readFileSync(join(ROOT, "README.md"), "utf8");
    const headings = [];
    for (const line of readme.split("\n")) {
        const m = /^## (.+?)\s*$/.exec(line);
        if (m) headings.push(m[1]);
    }
    // The required spine subsequence, in order. Other H2s (positioning,
    // table of contents, the composition-core deep-dive) may sit between
    // these, but these must appear and must stay in this relative order.
    const required = [
        "Why this exists",
        "What you get",
        "API reference",
        "Composability",
        "Zero-GC design notes",
        "Design decisions worth knowing",
        "Testing",
        "What this is not",
        "Ecosystem",
        "License",
    ];
    let cursor = 0;
    for (const want of required) {
        const at = headings.indexOf(want, cursor);
        assert.notEqual(
            at,
            -1,
            "missing or out-of-order H2 '" + want + "'; found headings: " +
            JSON.stringify(headings),
        );
        cursor = at + 1;
    }
});
