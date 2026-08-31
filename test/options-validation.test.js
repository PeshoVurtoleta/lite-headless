// Construction-time option validation (H-04). Every public createXxx factory
// runs checkOptions() as its first statement: unknown keys throw TypeError
// with a did-you-mean hint, null and non-objects are rejected, no-arg /
// undefined stays legal. These tests are the drift guard for that contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { setupDOM, teardownDOM } from "./_setup.js";
import { createProgress } from "../src/progress/index.js";
import { createDialog } from "../src/dialog/index.js";
import { createTimeline } from "../src/timeline/index.js";
import { createSlider } from "../src/slider/index.js";
import * as headless from "../src/index.js";

// ---------------------------------------------------------------------------
// A1: unknown key throws a TypeError naming the factory and the bad key
// ---------------------------------------------------------------------------
test("A1: unknown option throws TypeError naming factory + key", () => {
    // qa: tightened from a start-anchored prefix regex to byte-exact
    // equality -- a prefix match could false-pass on a truncated or
    // mismatched "Known options:" tail.
    assert.throws(
        () => createProgress({ zzz: 1 }),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.equal(
                err.message,
                'createProgress: unknown option "zzz". Known options: ' +
                    'value, min, max, indeterminate, variant, label, valueText, onChange, onComplete',
            );
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// A2: did-you-mean hint (threshold + declaration-order tie-break) and the
//     Known-options fallback form when nothing is close enough
// ---------------------------------------------------------------------------
test("A2: near-miss suggests the intended key", () => {
    assert.throws(
        () => createProgress({ vlaue: 50 }),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.equal(
                err.message,
                'createProgress: unknown option "vlaue". Did you mean "value"?',
            );
            return true;
        },
    );

    assert.throws(
        () => createDialog({ modl: true }),
        (err) => {
            assert.equal(
                err.message,
                'createDialog: unknown option "modl". Did you mean "modal"?',
            );
            return true;
        },
    );

    assert.throws(
        () => createProgress({ qqqqqqqq: 1 }),
        (err) => {
            assert.equal(
                err.message,
                'createProgress: unknown option "qqqqqqqq". Known options: ' +
                    'value, min, max, indeterminate, variant, label, valueText, onChange, onComplete',
            );
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// A3: drift guard -- every "create*" export validates, and there are 59 of them
// ---------------------------------------------------------------------------
test("A3: all 59 factories reject an unknown option key", () => {
    const factories = Object.keys(headless).filter((k) => k.startsWith("create"));
    assert.equal(factories.length, 59, "expected exactly 59 create* factories");

    setupDOM();
    try {
        for (const name of factories) {
            const fn = headless[name];
            assert.equal(typeof fn, "function", `${name} is a function`);
            assert.throws(
                () => fn({ __zz_unknown__: 1 }),
                (err) => {
                    assert.equal(err.name, "TypeError", `${name} throws TypeError`);
                    // qa: anchor on "${name}: unknown option ..." (not just
                    // an unanchored substring) -- catches a copy-pasted
                    // wrong fnName argument to checkOptions, which an
                    // unanchored /unknown option ".../ regex would miss.
                    assert.match(
                        err.message,
                        new RegExp(`^${name}: unknown option "__zz_unknown__"\\.`),
                        `${name} names itself and the unknown key at the start of the message`,
                    );
                    return true;
                },
                `${name} must reject unknown option`,
            );
        }
    } finally {
        teardownDOM();
    }
});

// ---------------------------------------------------------------------------
// A4: no-arg / undefined legal; null + non-objects rejected; inherited keys
//     (prototype chain) ignored
// ---------------------------------------------------------------------------
test("A4: undefined legal, non-objects rejected, inherited keys ignored", () => {
    assert.doesNotThrow(() => createProgress());
    assert.doesNotThrow(() => createProgress(undefined));

    // qa: anchored + byte-exact (was an unanchored substring regex per
    // branch) so a wrong fnName prefix or a mangled "got <desc>" tail
    // cannot false-pass.
    assert.throws(
        () => createProgress(null),
        { name: "TypeError", message: "createProgress: options must be a plain object, got null" },
    );
    assert.throws(
        () => createProgress(42),
        { name: "TypeError", message: "createProgress: options must be a plain object, got number" },
    );
    assert.throws(
        () => createProgress([]),
        { name: "TypeError", message: "createProgress: options must be a plain object, got array" },
    );
    assert.throws(
        () => createProgress(() => {}),
        { name: "TypeError", message: "createProgress: options must be a plain object, got function" },
    );

    // Inherited (prototype) keys are not own-enumerable -> Object.keys skips
    // them -> no throw. (An unknown OWN key would throw.)
    assert.doesNotThrow(() => createProgress(Object.create({ vlaue: 1 })));

    // A known key with an undefined value is presence-checked, never rejected.
    assert.doesNotThrow(() => createProgress({ value: undefined }));

    // A symbol key is not a string key -> ignored by the membership scan.
    assert.doesNotThrow(() => createProgress({ [Symbol("x")]: 1 }));
});

// ---------------------------------------------------------------------------
// A7 (NIT-1): a no-options factory (empty key list) rejects any own key with
//     the "takes no options" message -- no did-you-mean, no trailing "Known
//     options:" artifact -- while no-arg / undefined still construct.
// ---------------------------------------------------------------------------
test("A7: empty-key-list factory rejects any key, still constructs no-arg", () => {
    assert.throws(
        () => createTimeline({ zzz: 1 }),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.equal(
                err.message,
                'createTimeline: unknown option "zzz". This factory takes no options.',
            );
            return true;
        },
    );
    // 1-char key must NOT slip through as `Did you mean ""?`
    assert.throws(
        () => createTimeline({ x: 1 }),
        (err) => {
            assert.equal(
                err.message,
                'createTimeline: unknown option "x". This factory takes no options.',
            );
            return true;
        },
    );
    assert.doesNotThrow(() => createTimeline());
    assert.doesNotThrow(() => createTimeline(undefined));
});

// ---------------------------------------------------------------------------
// A8 (NIT-2): a key literally containing the pipe delimiter spans two adjacent
//     known tokens -- it must be rejected, never silently accepted-and-ignored.
//     slider's list contains adjacent "...|min|max|..." tokens.
// ---------------------------------------------------------------------------
test("A8: composite key spanning the delimiter is rejected", () => {
    // qa: anchored regex (was unanchored) -- ties the assertion to the
    // exact fnName + message-start contract, not just a substring anywhere
    // in the message.
    assert.throws(
        () => createSlider({ "min|max": 1 }),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.match(err.message, /^createSlider: unknown option "min\|max"\./);
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// A6: the validator + this test file are strictly ASCII
// ---------------------------------------------------------------------------
test("A6: _validate.js and this test are ASCII-only", () => {
    const here = fileURLToPath(import.meta.url);
    const validatePath = fileURLToPath(new URL("../src/_validate.js", import.meta.url));
    for (const p of [validatePath, here]) {
        const src = readFileSync(p, "utf8");
        assert.equal(/[^\x00-\x7F]/.test(src), false, `${p} contains a non-ASCII byte`);
    }
});
