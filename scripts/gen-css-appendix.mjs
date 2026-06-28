#!/usr/bin/env node
// scripts/gen-css-appendix.mjs
// Auto-generates docs/CSS_CONTRACT_APPENDIX.md from src/.
// Run via: npm run gen:appendix
//
// Why: prevents CSS_CONTRACT.md from drifting silently as new primitives
// are added. The canonical taxonomy (Class 1/2/3/4) stays hand-curated;
// the per-primitive breakdown is regenerated mechanically.

import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const WRITE_PATTERNS = [
    /\.(?:set|remove|toggle)Attribute\(\s*["'`]([a-z][a-z0-9-]*)["'`]/g,
    /\b(?:setAttr|toggleAttr|removeAttr)\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*["'`]([a-z][a-z0-9-]*)["'`]/g,
];
const PROP_PATTERN = /(?:style\.)?setProperty\(\s*["'`](--[a-z0-9-]+)["'`]/g;
const SLOT_READ = /querySelector(?:All)?\(\s*["'`]\[(data-[a-z][a-z0-9-]*)\]/g;

function scan(paths) {
    const writes = new Set(), props = new Set(), slots = new Set();
    for (const p of paths) {
        let src;
        try { src = readFileSync(p, "utf8"); } catch { continue; }
        for (const pat of WRITE_PATTERNS) {
            for (const m of src.matchAll(pat)) {
                const a = m[1];
                if (a.startsWith("data-") || a.startsWith("aria-") || ["role","tabindex","hidden","disabled","inert","type","id"].includes(a)) {
                    writes.add(a);
                }
            }
        }
        for (const m of src.matchAll(PROP_PATTERN)) props.add(m[1]);
        for (const m of src.matchAll(SLOT_READ))   slots.add(m[1]);
    }
    return { writes, props, slots };
}

const prims = readdirSync(SRC).filter(d => {
    try { return statSync(join(SRC, d)).isDirectory() && d !== "_overlay"; }
    catch { return false; }
}).sort();

const lines = [];
lines.push("# CSS Contract — Per-Primitive Appendix\n");
lines.push("> AUTO-GENERATED from `src/**/*.js` on each release. Do not hand-edit.");
lines.push("> Run `npm run gen:appendix` to regenerate.\n");

let totalData = new Set(), totalAria = new Set(), totalProps = new Set();
for (const p of prims) {
    const paths = [join(SRC, p, "index.js"), join(SRC, p, "element.js")];
    const { writes, props, slots } = scan(paths);
    const data = [...writes].filter(a => a.startsWith("data-")).sort();
    const aria = [...writes].filter(a => a.startsWith("aria-")).sort();
    const other = [...writes].filter(a => !a.startsWith("data-") && !a.startsWith("aria-")).sort();
    data.forEach(a => totalData.add(a));
    aria.forEach(a => totalAria.add(a));
    props.forEach(a => totalProps.add(a));
    lines.push(`## \`lite-${p}\`\n`);
    if (aria.length) { lines.push("**ARIA attributes painted:**\n"); aria.forEach(a => lines.push(`- \`${a}\``)); lines.push(""); }
    if (data.length) { lines.push("**`data-*` attributes painted:**\n"); data.forEach(a => lines.push(`- \`${a}\``)); lines.push(""); }
    if (other.length) lines.push("**Other attributes set:** " + other.map(a => `\`${a}\``).join(", ") + "\n");
    if (props.size)  { lines.push("**CSS custom properties painted:**\n"); [...props].sort().forEach(p => lines.push(`- \`${p}\``)); lines.push(""); }
    if (slots.size)  { lines.push("**Slot markers read (Class 4 — consumer-provided):**\n"); [...slots].sort().forEach(s => lines.push(`- \`${s}\``)); lines.push(""); }
    if (!aria.length && !data.length && !other.length && !props.size && !slots.size) lines.push("_(no painted attributes — primitive operates purely on JS API)_\n");
    lines.push("");
}
lines.splice(3, 0, `**Coverage:** ${prims.length} primitives · ${totalData.size} distinct \`data-*\` · ${totalAria.size} distinct \`aria-*\` · ${totalProps.size} distinct CSS custom properties.\n`);

writeFileSync(join(ROOT, "docs", "CSS_CONTRACT_APPENDIX.md"), lines.join("\n"));
console.log(`Wrote docs/CSS_CONTRACT_APPENDIX.md (${prims.length} primitives).`);
