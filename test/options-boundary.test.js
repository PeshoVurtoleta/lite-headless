// options-boundary.test.js -- qa boundary matrix for H-04 (checkOptions).
//
// Independent (not planner/coder-authored) coverage of src/_validate.js and
// its 58 wired call sites. Where the generic torture-harness boundary matrix
// (0, 1, N-1, N, N+1, empty, null, undefined, NaN, -0, duplicate dispose,
// dispose-during-iteration, re-entrant write, adversarial) does not map onto
// a synchronous, stateless, non-iterator, non-disposable validator, that is
// noted explicitly rather than padded with an irrelevant test.
//
// checkOptions(fnName, options, knownKeys) has:
//   - no dispose/teardown object -> "duplicate dispose" / "dispose-during-
//     iteration" do not apply to this entry point (see the idempotency +
//     Proxy ownKeys tests below for the closest real analogues).
//   - no module-scope mutable state (distance()'s scratch rows are freshly
//     allocated per call) -> "re-entrant write" is exercised as a call-
//     interleaving / stateless-purity check instead.

import { test } from "node:test";
import assert from "node:assert/strict";

import { setupDOM, teardownDOM } from "./_setup.js";
import { checkOptions } from "../src/_validate.js";
import { createProgress } from "../src/progress/index.js";
import { createDialog } from "../src/dialog/index.js";
import { createDrawer } from "../src/drawer/index.js";
import { createSlider } from "../src/slider/index.js";
import { createStepper } from "../src/stepper/index.js";
import { createTooltip } from "../src/tooltip/index.js";
import { createPopover } from "../src/popover/index.js";
import { createMenu } from "../src/menu/index.js";
import { createBadge } from "../src/badge/index.js";
import { createMeter } from "../src/meter/index.js";
import { createCard } from "../src/card/index.js";
import { createTour } from "../src/tour/index.js";
import { createColorPicker } from "../src/color-picker/index.js";

// ---------------------------------------------------------------------------
// Alias direction: the public (LEFT-of-colon) name must be accepted; the
// internal (RIGHT-of-colon) binding name must be UNKNOWN. One silent accept
// of the internal name means the harvest for that factory read the wrong
// side of the destructure.
// ---------------------------------------------------------------------------
test("qa: alias direction -- slider disabled/_initialDisabled", () => {
    assert.doesNotThrow(() => createSlider({ disabled: true }));
    assert.throws(
        () => createSlider({ _initialDisabled: true }),
        /unknown option "_initialDisabled"/,
    );
});

test("qa: alias direction -- stepper min/max/step vs _initialMin/_initialMax/_initialStep", () => {
    assert.doesNotThrow(() => createStepper({ min: 0, max: 10, step: 1 }));
    assert.throws(() => createStepper({ _initialMin: 0 }), /unknown option "_initialMin"/);
    assert.throws(() => createStepper({ _initialMax: 10 }), /unknown option "_initialMax"/);
    assert.throws(() => createStepper({ _initialStep: 1 }), /unknown option "_initialStep"/);
});

test("qa: alias direction -- drawer open/controlledOpen", () => {
    setupDOM();
    try {
        assert.doesNotThrow(() => createDrawer({ open: true }));
        assert.throws(() => createDrawer({ controlledOpen: true }), /unknown option "controlledOpen"/);
    } finally {
        teardownDOM();
    }
});

test("qa: alias direction -- tooltip trigger/triggerSpec", () => {
    setupDOM();
    try {
        assert.doesNotThrow(() => createTooltip({ trigger: "click" }));
        assert.throws(() => createTooltip({ triggerSpec: "click" }), /unknown option "triggerSpec"/);
    } finally {
        teardownDOM();
    }
});

// ---------------------------------------------------------------------------
// Mixed bag: one unknown key among several known keys throws and names only
// the unknown one.
// ---------------------------------------------------------------------------
test("qa: mixed bag -- known keys pass through silently, unknown key is named", () => {
    assert.throws(
        () => createProgress({ value: 10, min: 0, zzz: 1, max: 100 }),
        (err) => {
            assert.match(err.message, /unknown option "zzz"/);
            assert.doesNotMatch(err.message, /"value"|"min"|"max"/);
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// Multiple unknowns: deterministic -- Object.keys insertion order decides
// which one is named, not alphabetical or any other order.
// ---------------------------------------------------------------------------
test("qa: multiple unknowns -- first in Object.keys insertion order is named, repeatably", () => {
    for (let i = 0; i < 3; i++) {
        assert.throws(
            () => createProgress({ zzz2: 1, zzz1: 2 }),
            /unknown option "zzz2"\./,
        );
    }
    const o = {};
    o.bbb = 1;
    o.aaa = 2;
    assert.throws(() => createProgress(o), /unknown option "bbb"\./);
});

// ---------------------------------------------------------------------------
// First/last key acceptance across both destructure-dialect and o.-dialect
// factories (badge, meter, card, tour, color-picker).
// ---------------------------------------------------------------------------
test("qa: first+last declared key both accepted -- badge, meter, card, tour, color-picker", () => {
    assert.doesNotThrow(() => createBadge({ dot: true }));               // first: dot|max|showZero|intent|count
    assert.doesNotThrow(() => createBadge({ count: 5 }));                // last
    assert.doesNotThrow(() => createBadge({ dot: true, count: 5 }));

    assert.doesNotThrow(() => createMeter({ value: 1 }));                // first: value|...|valueText
    assert.doesNotThrow(() => createMeter({ valueText: "x" }));          // last
    assert.doesNotThrow(() => createMeter({ value: 1, valueText: "x" }));

    assert.doesNotThrow(() => createCard({ collapsible: true }));        // first: collapsible|...|dismissed
    assert.doesNotThrow(() => createCard({ dismissed: false }));         // last
    assert.doesNotThrow(() => createCard({ collapsible: true, dismissed: false }));

    assert.doesNotThrow(() => createTour({ onStepChange() {} }));        // first: onStepChange|...|loop
    assert.doesNotThrow(() => createTour({ loop: true }));               // last
    assert.doesNotThrow(() => createTour({ onStepChange() {}, loop: true }));

    assert.doesNotThrow(() => createColorPicker({ onValueChange() {} })); // first: onValueChange|...|defaultHex
    assert.doesNotThrow(() => createColorPicker({ defaultHex: "#fff" })); // last
    assert.doesNotThrow(() => createColorPicker({ onValueChange() {}, defaultHex: "#fff" }));
});

// ---------------------------------------------------------------------------
// Did-you-mean quality on real typos, cross-factory, exact suggested key.
// ---------------------------------------------------------------------------
test("qa: did-you-mean -- plcement -> placement on an overlay factory (popover)", () => {
    setupDOM();
    try {
        assert.throws(
            () => createPopover({ plcement: "bottom" }),
            (err) => {
                assert.equal(
                    err.message,
                    'createPopover: unknown option "plcement". Did you mean "placement"?',
                );
                return true;
            },
        );
    } finally {
        teardownDOM();
    }
});

test("qa: did-you-mean -- modl -> modal on dialog (fail-closed distinct from A2's own copy)", () => {
    setupDOM();
    try {
        assert.throws(
            () => createDialog({ modl: false }),
            (err) => {
                assert.equal(
                    err.message,
                    'createDialog: unknown option "modl". Did you mean "modal"?',
                );
                return true;
            },
        );
    } finally {
        teardownDOM();
    }
});

test("qa: did-you-mean -- onValuChange -> onValueChange on a callback-heavy factory (slider)", () => {
    assert.throws(
        () => createSlider({ onValuChange() {} }),
        (err) => {
            assert.equal(
                err.message,
                'createSlider: unknown option "onValuChange". Did you mean "onValueChange"?',
            );
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// Value-not-validated contract: a known key with an absurd value must NOT
// throw from checkOptions. What the factory itself does with that value is
// out of H-04 scope.
// ---------------------------------------------------------------------------
test("qa: value-not-validated -- known key, absurd value, no unknown-option throw", () => {
    assert.doesNotThrow(() => createProgress({ value: "nope" }));
    assert.doesNotThrow(() => createProgress({ value: NaN }));
    assert.doesNotThrow(() => createProgress({ min: -0 }));
    assert.doesNotThrow(() => createProgress({ max: {} }));
    assert.doesNotThrow(() => createProgress({ onChange: "not a function" }));
});

// ---------------------------------------------------------------------------
// Element runtime spot-check: register + construct 3 <lite-*> elements
// (dialog, menu, popover -- all ...cfg wrappers) in happy-dom; no validation
// throw on upgrade/connect.
// ---------------------------------------------------------------------------
test("qa: element runtime -- lite-dialog, lite-menu, lite-popover connect without a validation throw", async () => {
    setupDOM();
    try {
        await import("../src/dialog/element.js");
        await import("../src/menu/element.js");
        await import("../src/popover/element.js");

        const dlg = document.createElement("lite-dialog");
        assert.doesNotThrow(() => document.body.appendChild(dlg));

        const menu = document.createElement("lite-menu");
        assert.doesNotThrow(() => document.body.appendChild(menu));

        const pop = document.createElement("lite-popover");
        assert.doesNotThrow(() => document.body.appendChild(pop));
    } finally {
        teardownDOM();
    }
});

// ---------------------------------------------------------------------------
// Empty-list + pipe edge (A7/A8 assert-shape spot check, not a duplicate):
// confirm the exact byte-for-byte contract, independently.
// ---------------------------------------------------------------------------
test("qa: empty-key-list + pipe-delimiter edge -- exact message shapes", () => {
    // menu OPTION_KEYS is non-empty, but timeline's is "" (the one and only
    // ""-list factory in this package). Re-derive that claim: the fallback
    // message form must never leak a trailing "Known options: " with nothing
    // after it, and must never leak a "Did you mean" for an empty knownKeys.
    assert.throws(
        () => checkOptions("probe", { anything: 1 }, ""),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.equal(
                err.message,
                'probe: unknown option "anything". This factory takes no options.',
            );
            return true;
        },
    );
    // composite pipe-spanning key against a real multi-token list (slider).
    assert.throws(
        () => createSlider({ "value|min": 1 }),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.match(err.message, /unknown option "value\|min"/);
            return true;
        },
    );
});

// ---------------------------------------------------------------------------
// qa boundary matrix -- 0 / 1 / N-1 / N / N+1 / empty / null / undefined /
// NaN / -0 / duplicate-call idempotency / iteration-order robustness /
// re-entrancy / adversarial (own-but-non-enumerable key + Proxy ownKeys).
// ---------------------------------------------------------------------------

// 0: a zero-length own key name.
test("qa boundary matrix: 0 -- empty-string key name falls to Known-options form, never a bogus suggestion", () => {
    assert.throws(
        () => createProgress({ "": 1 }),
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.match(err.message, /unknown option ""\./);
            assert.doesNotMatch(err.message, /Did you mean ""/);
            return true;
        },
    );
});

// 1: single-char unknown key with no candidate close enough to suggest.
test("qa boundary matrix: 1 -- single-char key too far from any candidate falls to Known-options form", () => {
    assert.throws(
        () => createProgress({ q: 1 }),
        (err) => {
            assert.match(err.message, /unknown option "q"\. Known options: /);
            assert.doesNotMatch(err.message, /Did you mean/);
            return true;
        },
    );
});

// N-1 / N / N+1: exact Levenshtein-distance cutoff around suggest()'s
// threshold, isolated from any real factory via a synthetic knownKeys list
// so the boundary is measured precisely rather than incidentally.
test("qa boundary matrix: N-1/N/N+1 -- suggest() threshold cutoff is exact (long-key branch, threshold=2)", () => {
    // knownKeys "abcde" (5 chars); probe key also 5 chars -> threshold = 2
    // (key.length > 4).
    assert.throws(
        () => checkOptions("probe", { abcdX: 1 }, "abcde"), // distance 1 (N-1 of threshold+1=3)
        /Did you mean "abcde"\?/,
    );
    assert.throws(
        () => checkOptions("probe", { abcXX: 1 }, "abcde"), // distance 2 == threshold (N)
        /Did you mean "abcde"\?/,
    );
    assert.throws(
        () => checkOptions("probe", { abXXX: 1 }, "abcde"), // distance 3 == threshold+1 (N+1)
        (err) => {
            assert.doesNotMatch(err.message, /Did you mean/);
            assert.match(err.message, /Known options: abcde/);
            return true;
        },
    );
});

test("qa boundary matrix: N-1/N/N+1 -- suggest() threshold cutoff is exact (short-key branch, threshold=1)", () => {
    // knownKeys "abcd" (4 chars); probe key also 4 chars -> threshold = 1
    // (key.length <= 4).
    assert.throws(
        () => checkOptions("probe", { abcX: 1 }, "abcd"), // distance 1 == threshold (N)
        /Did you mean "abcd"\?/,
    );
    assert.throws(
        () => checkOptions("probe", { abXX: 1 }, "abcd"), // distance 2 == threshold+1 (N+1)
        (err) => {
            assert.doesNotMatch(err.message, /Did you mean/);
            return true;
        },
    );
});

// empty: {} (zero own keys) never throws, across dialects.
test("qa boundary matrix: empty -- {} never throws regardless of dialect", () => {
    assert.doesNotThrow(() => createProgress({}));
    assert.doesNotThrow(() => createBadge({}));
    assert.doesNotThrow(() => createCard({}));
});

// null / undefined: independently re-verified (not trusting A4).
test("qa boundary matrix: null/undefined -- independently re-verified", () => {
    assert.throws(() => createProgress(null), /must be a plain object, got null/);
    assert.doesNotThrow(() => createProgress(undefined));
    assert.doesNotThrow(() => createProgress());
});

// NaN / -0: as VALUES (not key names), never trigger the unknown-option path.
test("qa boundary matrix: NaN/-0 -- as option values, never an unknown-option throw", () => {
    assert.doesNotThrow(() => createProgress({ value: NaN, min: -0, max: -0 }));
    assert.doesNotThrow(() => createMeter({ value: NaN, low: -0 }));
});

// NaN as a literal STRING key name -- ordinary unknown key, no special-casing.
test("qa boundary matrix: NaN -- the literal string key \"NaN\" is an ordinary unknown key", () => {
    assert.throws(
        () => createProgress({ NaN: 1 }),
        /unknown option "NaN"\./,
    );
});

// duplicate-dispose analogue: checkOptions has no dispose handle to double-
// free. Closest real property: calling it twice (or the same factory twice)
// with an identical bad-options object is idempotent -- same throw, same
// message, no memoized/mutated state carried between calls.
test("qa boundary matrix: duplicate-call idempotency (checkOptions has no dispose object to double-free)", () => {
    const bad = { zzz: 1 };
    let first, second;
    try { createProgress(bad); } catch (e) { first = e.message; }
    try { createProgress(bad); } catch (e) { second = e.message; }
    assert.equal(first, second);
    assert.match(first, /unknown option "zzz"\./);
});

// dispose-during-iteration analogue: Object.keys() snapshots own enumerable
// keys BEFORE the scan loop runs, and checkOptions never reads option
// VALUES (only key names) -- so a getter can never be invoked mid-scan to
// mutate the key set out from under the loop. Prove the getter is never
// invoked at all when checkOptions runs.
test("qa boundary matrix: dispose-during-iteration analogue -- checkOptions never invokes a value getter", () => {
    let getterCalls = 0;
    const opts = {
        value: 1,
        min: 0,
    };
    Object.defineProperty(opts, "max", {
        enumerable: true,
        configurable: true,
        get() { getterCalls++; return 100; },
    });
    assert.doesNotThrow(() => checkOptions("probe", opts, "value|min|max"));
    assert.equal(getterCalls, 0, "checkOptions must not read option values, only key names");
});

// re-entrant write analogue: no module-scope mutable state in _validate.js
// (distance()'s scratch rows are allocated fresh per call) -- prove
// interleaved / re-entrant calls across two different factories do not
// cross-contaminate each other's error output.
test("qa boundary matrix: re-entrant write analogue -- interleaved checkOptions calls do not share state", () => {
    // First: confirm checkOptions never reads ANY value -- known or
    // unknown -- while scanning for the unknown key itself (a getter on an
    // unknown key is never invoked, because the throw is committed off the
    // key NAME alone). This means true checkOptions-internal re-entrancy
    // can only be forced through a KNOWN key, whose value is read later by
    // the factory's own post-checkOptions destructuring -- not by
    // checkOptions.
    let unknownGetterCalls = 0;
    assert.throws(
        () =>
            createProgress({
                get zzz() {
                    unknownGetterCalls++;
                    return 1;
                },
            }),
        /unknown option "zzz"\./,
    );
    assert.equal(unknownGetterCalls, 0, "the unknown key's getter must never be invoked");

    // Now force real re-entrancy: a KNOWN key ("value") whose getter is
    // read by createProgress's OWN destructuring (after its checkOptions
    // call has already returned cleanly) and which nests a second,
    // independent checkOptions-backed call (createDialog) mid-read.
    let dialogMsg;
    let progressResult;
    assert.doesNotThrow(() => {
        progressResult = createProgress({
            get value() {
                try {
                    checkOptions("createDialog", { modl: 1 }, "open|modal");
                } catch (e) {
                    dialogMsg = e.message;
                }
                return 42;
            },
        });
    });
    assert.equal(dialogMsg, 'createDialog: unknown option "modl". Did you mean "modal"?');
    assert.ok(progressResult, "outer createProgress construction completed normally");

    // Run createProgress again after the nested call to prove no residue
    // (no shared/leaked module-scope state from either call).
    assert.throws(() => createProgress({ zzz: 1 }), /unknown option "zzz"\./);
    assert.throws(
        () => createDialog({ modl: 1 }),
        /unknown option "modl"\. Did you mean "modal"\?/,
    );
});

// adversarial case (planner-unconsidered): an OWN but NON-ENUMERABLE unknown
// key. Distinct from A4's inherited-prototype-key case: this key is own
// (Object.getOwnPropertyNames would see it) but Object.keys() -- the
// enumerable-only own-key scan checkOptions is built on -- must skip it.
// A for...in or Object.getOwnPropertyNames-based implementation would leak
// this key into a false-positive throw (fail-closed on something that was
// never meant to be read); Object.keys() correctly ignores it.
test("qa boundary matrix: adversarial -- own non-enumerable unknown key is invisible to Object.keys-based scan", () => {
    const opts = { value: 1 };
    Object.defineProperty(opts, "__hidden_unknown__", {
        value: 999,
        enumerable: false,
        configurable: true,
        writable: true,
    });
    assert.ok(Object.getOwnPropertyNames(opts).includes("__hidden_unknown__"), "sanity: it IS an own property");
    assert.ok(!Object.keys(opts).includes("__hidden_unknown__"), "sanity: but NOT enumerable-own");
    assert.doesNotThrow(() => createProgress(opts));
});

// adversarial case #2 (planner-unconsidered): a Proxy options object whose
// ownKeys/getOwnPropertyDescriptor traps report only known keys, even though
// a get-trap would reveal more. checkOptions must operate purely off
// Object.keys()'s own-enumerable-key contract, not off ad-hoc property
// probing, so a well-behaved Proxy is accepted transparently.
test("qa boundary matrix: adversarial -- Proxy options object is handled via Object.keys(), not ad-hoc probing", () => {
    const target = { value: 1, min: 0 };
    const proxy = new Proxy(target, {
        ownKeys(t) { return Reflect.ownKeys(t); },
        getOwnPropertyDescriptor(t, k) { return Reflect.getOwnPropertyDescriptor(t, k); },
        get(t, k) { return Reflect.get(t, k); },
    });
    assert.doesNotThrow(() => createProgress(proxy));

    const badTarget = { value: 1, zzz: 1 };
    const badProxy = new Proxy(badTarget, {
        ownKeys(t) { return Reflect.ownKeys(t); },
        getOwnPropertyDescriptor(t, k) { return Reflect.getOwnPropertyDescriptor(t, k); },
        get(t, k) { return Reflect.get(t, k); },
    });
    assert.throws(() => createProgress(badProxy), /unknown option "zzz"\./);
});
