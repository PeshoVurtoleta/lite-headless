// per-call-validation.test.js -- H9 (LH-02) drift guard for checkOptionsHot.
//
// A1: the 11 validated ("IN") per-call option-envelope sites all share one
// contract (ADR 0005): a valid known-key bag succeeds; a near-miss typo
// throws TypeError /Did you mean/; null / array / a number throws TypeError
// /must be a plain object, got .../; undefined or an omitted bag is legal.
// One test per site, plus a hostile fuzz sweep and one adversarial case.
//
// A3: the two DELIBERATELY EXCLUDED sites (kanban, command-palette; R2/R3)
// must keep passing unknown keys through wholesale -- a regression lock
// proving H9 did not start rejecting caller data on those paths.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";

import { createToast } from "../src/toast/index.js";
import { createNotificationCenter } from "../src/notification-center/index.js";
import { createTour } from "../src/tour/index.js";
import { createSortable } from "../src/sortable/index.js";
import { createCarousel } from "../src/carousel/index.js";
import { createTree } from "../src/tree/index.js";
import { createDatePicker } from "../src/datepicker/index.js";
import { createKanban } from "../src/kanban/index.js";
import { createCommandPalette } from "../src/command-palette/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

// ---------------------------------------------------------------------------
// Shared contract assertions (ADR 0005 / checkOptionsHot)
// ---------------------------------------------------------------------------

function assertSucceeds(fn, msg) {
    assert.doesNotThrow(fn, msg);
}

// `expectedSuggestion` null means "assert it throws /Did you mean/ generically
// without pinning the suggested word" (used by the fuzz sweep).
function assertTypoThrows(fn, expectedSuggestion) {
    assert.throws(
        fn,
        (err) => {
            assert.equal(err.name, "TypeError");
            if (expectedSuggestion === null) {
                assert.match(err.message, /Did you mean "/);
            } else {
                assert.match(err.message, new RegExp('Did you mean "' + expectedSuggestion + '"\\?'));
            }
            return true;
        },
    );
}

function assertBadTypeThrows(fn, desc) {
    assert.throws(
        fn,
        (err) => {
            assert.equal(err.name, "TypeError");
            assert.match(err.message, new RegExp("must be a plain object, got " + desc + "$"));
            return true;
        },
    );
}

// Runs the full null/array/number bad-type sweep against a `call(bag)` fn.
function assertAllBadTypesThrow(call) {
    assertBadTypeThrows(() => call(null), "null");
    assertBadTypeThrows(() => call([]), "array");
    assertBadTypeThrows(() => call(42), "number");
    // Boundary matrix additions: NaN and -0 are both `typeof "number"`, so
    // they must land on the SAME "got number" branch as 42 -- not slip
    // through as some other falsy/edge case.
    assertBadTypeThrows(() => call(NaN), "number");
    assertBadTypeThrows(() => call(-0), "number");
}

function assertOmittedAndUndefinedLegal(callWithArg, callOmitted) {
    assert.doesNotThrow(() => callWithArg(undefined), "explicit undefined is legal");
    assert.doesNotThrow(() => callOmitted(), "an omitted bag argument is legal");
}

// ===========================================================================
// IN site 1/11 -- toast.show
// ===========================================================================
test("toast.show: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const vp = mkEl();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);

    assertSucceeds(() => t.show("hi", { id: "s1", urgent: true, duration: 0, dismissible: true, announce: "hi" }));
    assertSucceeds(() => t.show("hi", {}), "empty bag (boundary: no own keys) is legal");

    assertTypoThrows(() => t.show("hi", { dursation: 1 }), "duration");

    assertAllBadTypesThrow((bag) => t.show("hi", bag));
    assertOmittedAndUndefinedLegal(
        (bag) => t.show("hi", bag),
        () => t.show("hi"),
    );

    t.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// Hostile fuzz sweep -- toast.show is the representative site. Sweep several
// typo'd keys (one near-miss per known key) and assert each throws.
// ---------------------------------------------------------------------------
test("toast.show: hostile fuzz sweep -- every near-miss key throws", () => {
    setupDOM();
    const vp = mkEl();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);

    const typos = [
        { ix: 1 },              // -> "id" (substitution)
        { urgnt: 1 },           // -> "urgent" (deletion)
        { dursation: 1 },       // -> "duration" (insertion)
        { dismisible: 1 },      // -> "dismissible" (deletion)
        { annouce: 1 },         // -> "announce" (deletion)
        { zzzzzzzzzzzz: 1 },    // no near match at all -- "Known options:" form
    ];
    for (const bag of typos) {
        assert.throws(
            () => t.show("hi", bag),
            (err) => {
                assert.equal(err.name, "TypeError");
                assert.match(err.message, /^toast\.show: unknown option "/);
                return true;
            },
            `bag ${JSON.stringify(bag)} must throw`,
        );
    }

    t.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// Adversarial case (planner did not think of this): a bag that SHADOWS its
// own `hasOwnProperty` to always report "not mine". checkOptionsHot's own-key
// guard is documented to use `Object.prototype.hasOwnProperty.call(bag, k)`
// (never `bag.hasOwnProperty(k)`) specifically so a hostile/foot-gun bag like
// this cannot smuggle an unknown key past validation by lying about
// ownership. If the guard were ever rewritten to call the bag's own method,
// this test would start silently NOT throwing -- so it also nails the
// "hasOwnProperty" key itself as an unknown option.
// ---------------------------------------------------------------------------
test("toast.show: adversarial hasOwnProperty-shadowing bag cannot smuggle an unknown key", () => {
    setupDOM();
    const vp = mkEl();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);

    const hostile = { dursation: 1, hasOwnProperty: () => false };
    assert.throws(
        () => t.show("hi", hostile),
        (err) => {
            assert.equal(err.name, "TypeError");
            // Whichever own key the scan reaches first, it must still throw --
            // the shadowed hasOwnProperty must never be consulted.
            assert.match(err.message, /^toast\.show: unknown option "/);
            return true;
        },
    );

    // Companion adversarial case: `__proto__` as an object-LITERAL key never
    // creates an own enumerable property (it sets the prototype instead), so
    // a bag with only a `__proto__` literal has zero own keys and must be
    // treated exactly like `{}` -- legal, no throw. This is JS object-literal
    // semantics, not something the guard opts into; the test documents that
    // checkOptionsHot's for-in + hasOwnProperty guard does not accidentally
    // "discover" a key that was never actually own.
    assert.doesNotThrow(() => t.show("hi", { __proto__: { evil: true } }));

    t.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 2/11 -- toast.update (via the control object returned by show())
// ===========================================================================
test("toast.update: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const vp = mkEl();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);

    assertSucceeds(() => t.show("hi").update("bye", { duration: 5000, urgent: true }));
    assertSucceeds(() => t.show("hi").update("bye", {}), "empty bag is legal");

    assertTypoThrows(() => t.show("hi").update("bye", { urgnt: 1 }), "urgent");

    assertAllBadTypesThrow((bag) => t.show("hi").update("bye", bag));
    assertOmittedAndUndefinedLegal(
        (bag) => t.show("hi").update("bye", bag),
        () => t.show("hi").update("bye"),
    );

    t.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 3/11 -- notificationCenter.add
// ===========================================================================
test("notificationCenter.add: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const nc = createNotificationCenter();

    assertSucceeds(() => nc.add({ id: "a", title: "T", body: "B", kind: "info", timestamp: 1, read: false, meta: { any: 1 } }));
    assertSucceeds(() => nc.add({}), "empty bag is legal");

    assertTypoThrows(() => nc.add({ titel: "x" }), "title");

    assertAllBadTypesThrow((bag) => nc.add(bag));
    assertOmittedAndUndefinedLegal(
        (bag) => nc.add(bag),
        () => nc.add(),
    );

    nc.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 4/11 -- notificationCenter.update
// ===========================================================================
test("notificationCenter.update: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const nc = createNotificationCenter({
        defaultNotifications: [{ id: "n1", title: "Hello", kind: "info", timestamp: 100 }],
    });

    assertSucceeds(() => nc.update("n1", { title: "New", body: "B", kind: "warning", timestamp: 2, read: true, meta: {} }));
    assertSucceeds(() => nc.update("n1", {}), "empty bag is legal");

    assertTypoThrows(() => nc.update("n1", { titel: "x" }), "title");

    assertAllBadTypesThrow((bag) => nc.update("n1", bag));
    assertOmittedAndUndefinedLegal(
        (bag) => nc.update("n1", bag),
        () => nc.update("n1"),
    );

    nc.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 5/11 -- tour.addStep
// ===========================================================================
test("tour.addStep: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const tour = createTour();

    assertSucceeds(() => tour.addStep({ id: "s1", target: null, title: "T", description: "D" }));
    assertSucceeds(() => tour.addStep({}), "empty bag is legal");

    assertTypoThrows(() => tour.addStep({ titel: "x" }), "title");

    assertAllBadTypesThrow((bag) => tour.addStep(bag));
    assertOmittedAndUndefinedLegal(
        (bag) => tour.addStep(bag),
        () => tour.addStep(),
    );

    teardownDOM();
});

// ===========================================================================
// IN site 6/11 -- sortable.attachRoot
// ===========================================================================
test("sortable.attachRoot: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const s = createSortable();

    assertSucceeds(() => s.attachRoot(mkEl(), { label: "Reorder" }));
    assertSucceeds(() => s.attachRoot(mkEl(), {}), "empty bag is legal");

    assertTypoThrows(() => s.attachRoot(mkEl(), { labell: "x" }), "label");

    assertAllBadTypesThrow((bag) => s.attachRoot(mkEl(), bag));
    assertOmittedAndUndefinedLegal(
        (bag) => s.attachRoot(mkEl(), bag),
        () => s.attachRoot(mkEl()),
    );

    s.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 7/11 -- sortable.attachItem
// ===========================================================================
test("sortable.attachItem: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const s = createSortable();
    s.attachRoot(mkEl());

    assertSucceeds(() => s.attachItem(mkEl(), "k1", { disabled: true }));
    assertSucceeds(() => s.attachItem(mkEl(), "k2", {}), "empty bag is legal");

    assertTypoThrows(() => s.attachItem(mkEl(), "k3", { disbaled: true }), "disabled");

    assertAllBadTypesThrow((bag) => s.attachItem(mkEl(), "kx", bag));
    assertOmittedAndUndefinedLegal(
        (bag) => s.attachItem(mkEl(), "ku", bag),
        () => s.attachItem(mkEl(), "ko"),
    );

    s.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 8/11 -- carousel.attachRoot
// ===========================================================================
test("carousel.attachRoot: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const c = createCarousel();

    assertSucceeds(() => c.attachRoot(mkEl(), { label: "Featured" }));
    assertSucceeds(() => c.attachRoot(mkEl(), {}), "empty bag is legal");

    assertTypoThrows(() => c.attachRoot(mkEl(), { labell: "x" }), "label");

    assertAllBadTypesThrow((bag) => c.attachRoot(mkEl(), bag));
    assertOmittedAndUndefinedLegal(
        (bag) => c.attachRoot(mkEl(), bag),
        () => c.attachRoot(mkEl()),
    );

    c.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 9/11 -- carousel.attachSlide
// ===========================================================================
test("carousel.attachSlide: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const c = createCarousel();
    c.attachRoot(mkEl());

    assertSucceeds(() => c.attachSlide(mkEl(), 0, { label: "Slide 1" }));
    assertSucceeds(() => c.attachSlide(mkEl(), 1, {}), "empty bag is legal");

    assertTypoThrows(() => c.attachSlide(mkEl(), 2, { lable: "x" }), "label");

    assertAllBadTypesThrow((bag) => c.attachSlide(mkEl(), 3, bag));
    assertOmittedAndUndefinedLegal(
        (bag) => c.attachSlide(mkEl(), 4, bag),
        () => c.attachSlide(mkEl(), 5),
    );

    c.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 10/11 -- tree.attachNode
// ===========================================================================
test("tree.attachNode: known-key bag succeeds; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const tree = createTree();

    assertSucceeds(() => tree.attachNode(mkEl(), "a", { hasChildren: true, disabled: false }));
    assertSucceeds(() => tree.attachNode(mkEl(), "b", {}), "empty bag is legal");

    assertTypoThrows(() => tree.attachNode(mkEl(), "c", { hasChildre: true }), "hasChildren");

    assertAllBadTypesThrow((bag) => tree.attachNode(mkEl(), "x", bag));
    assertOmittedAndUndefinedLegal(
        (bag) => tree.attachNode(mkEl(), "u", bag),
        () => tree.attachNode(mkEl(), "o"),
    );

    tree.destroy();
    teardownDOM();
});

// ===========================================================================
// IN site 11/11 -- datepicker.attachMonthLabel
//
// Site-specific pre-req: a bare FUNCTION is a documented back-compat form and
// must NOT be validated/must not throw; only the object form is validated.
// ===========================================================================
test("datepicker.attachMonthLabel: known-key bag succeeds; function back-compat is untouched; typo/bad-type throw; undefined/omitted legal", () => {
    setupDOM();
    const picker = createDatePicker();

    // Back-compat: a bare function must NOT throw (not validated at all).
    assertSucceeds(() => picker.attachMonthLabel(mkEl(), (v) => String(v)));

    assertSucceeds(() => picker.attachMonthLabel(mkEl(), { formatter: (v) => String(v), clickToCycle: true }));
    assertSucceeds(() => picker.attachMonthLabel(mkEl(), {}), "empty bag is legal");

    assertTypoThrows(() => picker.attachMonthLabel(mkEl(), { formater: () => {} }), "formatter");

    assertAllBadTypesThrow((bag) => picker.attachMonthLabel(mkEl(), bag));
    assertOmittedAndUndefinedLegal(
        (bag) => picker.attachMonthLabel(mkEl(), bag),
        () => picker.attachMonthLabel(mkEl()),
    );

    picker.destroy();
    teardownDOM();
});

// ===========================================================================
// A3 -- passthrough regression lock (R2/R3, ADR 0005)
//
// kanban and command-palette are DELIBERATELY excluded from key validation:
// they store the caller's object WHOLESALE and hand it back through the read
// surface, so an "unknown" key is the consumer's own data, not a typo. These
// tests prove H9 did not accidentally start rejecting that data.
// ===========================================================================
test("A3: kanban.addColumn/addCard pass unknown extra keys through wholesale (R2)", () => {
    setupDOM();
    const kb = createKanban();
    // Use the imperative mutation path (the R2 sites): addColumn registers the
    // column order, then addCard stores the card object wholesale.
    kb.addColumn({ id: "todo", title: "To Do", accent: "blue" });
    kb.addCard({ id: "c1", columnId: "todo", priority: "high", foo: 1 });

    const card = kb.getCard("c1");
    assert.equal(card.priority, "high", "consumer-defined card key survives passthrough");
    assert.equal(card.foo, 1, "an unrecognized card key is NOT rejected -- it round-trips");
    const col = kb.getColumn("todo");
    assert.equal(col.accent, "blue", "consumer-defined column key survives passthrough");

    kb.destroy();
    teardownDOM();
});

test("A3: commandPalette.register passes unknown extra keys through wholesale (R3)", () => {
    setupDOM();
    const p = createCommandPalette();

    p.register({ id: "cmd1", label: "Do the thing", run() {}, group: "x", custom: 1 });

    const found = p.commands().find((c) => c.id === "cmd1");
    assert.ok(found, "the command is retrievable via commands()");
    assert.equal(found.group, "x", "consumer-defined 'group' key survives passthrough");
    assert.equal(found.custom, 1, "an unrecognized key is NOT rejected -- it round-trips");

    p.destroy();
    teardownDOM();
});
