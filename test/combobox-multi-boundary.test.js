// combobox-multi-boundary.test.js -- qa boundary matrix for the G-01 R1
// multi-select slice (multiple:true) on createCombobox. Pins ACTUAL observed
// behavior at every open question the planner flagged; does not assume an
// answer. See test/combobox.test.js for the coder's core multi-select tests
// (toggleValue, item click, Backspace-on-empty, attachChip, defaultValue
// array seed, multiple:false inert surface, R6 fail-closed guard) -- this
// file targets the gaps, not a re-run of those.
//
// RULED (R7a/R7b): destroy() no longer clears `_selected` -- has() answers the
// frozen post-destroy selection, agreeing with the sealed values() snapshot
// (the H-12 seal contract). And in multiple mode a non-array (non-null)
// defaultValue fails closed with a TypeError rather than being silently
// ignored. This file pins that ruled behavior.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, dispatchClick } from "./_setup.js";
import { createCombobox } from "../src/combobox/index.js";

function mkDOM() {
    const trigger = document.createElement("input");
    const listbox = document.createElement("ul");
    const items = ["Apple", "Banana", "Cherry"].map((label) => {
        const li = document.createElement("li");
        li.textContent = label;
        listbox.appendChild(li);
        return { el: li, value: label.toLowerCase(), label };
    });
    document.body.append(trigger, listbox);
    return { trigger, listbox, items };
}

function build(opts = {}) {
    const { trigger, listbox, items } = mkDOM();
    const combo = createCombobox({ container: null, ...opts });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const { el, value, label } of items) combo.attachItem(el, { value, label });
    return { combo, trigger, listbox, items };
}

// ---------------------------------------------------------------------------
// defaultValue edge shapes
// ---------------------------------------------------------------------------

test("multiple: non-array defaultValue fails closed with a TypeError (R7b)", () => {
    setupDOM();
    const MSG = "createCombobox: defaultValue must be an array when multiple: true";
    // A string, a number, and a plain object are all non-array non-null: each
    // must throw the exact message before any selection work.
    assert.throws(
        () => createCombobox({ multiple: true, defaultValue: "a" }),
        (e) => e.name === "TypeError" && e.message === MSG,
    );
    assert.throws(
        () => createCombobox({ multiple: true, defaultValue: 42 }),
        (e) => e.name === "TypeError" && e.message === MSG,
    );
    assert.throws(
        () => createCombobox({ multiple: true, defaultValue: {} }),
        (e) => e.name === "TypeError" && e.message === MSG,
    );
    teardownDOM();
});

test("multiple: null / omitted defaultValue is legal (empty selection); array seeds; single-select untouched", () => {
    setupDOM();
    // legal empty-selection shapes
    assert.deepEqual(createCombobox({ multiple: true }).values(), []);
    assert.deepEqual(createCombobox({ multiple: true, defaultValue: null }).values(), []);
    // array still seeds
    assert.deepEqual(createCombobox({ multiple: true, defaultValue: ["a"] }).values(), ["a"]);
    // single-select defaultValue semantics are byte-untouched: no array coercion,
    // no throw for a scalar default.
    assert.equal(createCombobox({ defaultValue: "a" }).value(), "a");
    assert.equal(createCombobox({ defaultValue: 42 }).value(), 42);
    teardownDOM();
});

test("multiple: defaultValue array with duplicate values dedupes via Set semantics", () => {
    setupDOM();
    const { combo, items } = build({ multiple: true, defaultValue: ["apple", "apple", "banana"] });
    assert.deepEqual(combo.values().sort(), ["apple", "banana"], "duplicates collapse to one membership");
    assert.equal(items[0].el.getAttribute("aria-selected"), "true");
    combo.destroy();
    teardownDOM();
});

test("multiple: empty array defaultValue -- legal, selects nothing", () => {
    setupDOM();
    const { combo, trigger } = build({ multiple: true, defaultValue: [] });
    assert.deepEqual(combo.values(), []);
    assert.equal(trigger.getAttribute("data-count"), "0");
    combo.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// toggle sequence + snapshot identity
// ---------------------------------------------------------------------------

test("multiple: add->remove->add sequence reflected correctly in values()", () => {
    setupDOM();
    const { combo } = build({ multiple: true });
    combo.toggleValue("apple");
    assert.deepEqual(combo.values(), ["apple"]);
    combo.toggleValue("apple"); // remove
    assert.deepEqual(combo.values(), []);
    combo.toggleValue("apple"); // add again
    assert.deepEqual(combo.values(), ["apple"]);
    combo.destroy();
    teardownDOM();
});

test("multiple: values() returns a NEW array reference every call (defensive copy), stable content between mutations", () => {
    setupDOM();
    const { combo } = build({ multiple: true });
    combo.toggleValue("apple");
    const a = combo.values();
    const b = combo.values();
    // Pin the ACTUAL contract: values() is `_selectedSnapshot.slice()` -- a
    // fresh array EVERY call, not a cached reference. Two calls with no
    // mutation between them are deep-equal but NOT the same object.
    assert.notEqual(a, b, "each call allocates a fresh snapshot copy");
    assert.deepEqual(a, b, "content is stable when nothing mutated between calls");
    // mutating the returned array must not leak into internal state
    b.push("HACKED");
    assert.deepEqual(combo.values(), ["apple"], "external mutation of a returned snapshot does not corrupt internal state");
    assert.equal(combo.has("HACKED"), false);
    combo.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// Backspace guard
// ---------------------------------------------------------------------------

test("multiple: Backspace on NON-empty input does NOT deselect", () => {
    setupDOM();
    const { combo, trigger } = build({ multiple: true });
    combo.toggleValue("apple");
    trigger.value = "some text";
    const e = dispatchKey(trigger, "Backspace");
    assert.deepEqual(combo.values(), ["apple"], "selection untouched while the field has text");
    assert.equal(e.defaultPrevented, false, "the key event is left alone for normal text editing");
    combo.destroy();
    teardownDOM();
});

test("multiple: Backspace on empty input STILL deselects (regression guard against the above)", () => {
    setupDOM();
    const { combo, trigger } = build({ multiple: true });
    combo.toggleValue("apple");
    trigger.value = "";
    dispatchKey(trigger, "Backspace");
    assert.deepEqual(combo.values(), []);
    combo.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// chip removal / roving index clamp
// ---------------------------------------------------------------------------

test("multiple: chip removal while an item is highlighted does not corrupt the roving index", () => {
    setupDOM();
    const { combo, trigger, items } = build({ multiple: true });
    combo.toggleValue("apple");
    combo.toggleValue("banana");
    combo.setOpen(true, "api");
    dispatchKey(trigger, "End"); // highlight last item (cherry, index 2)
    assert.equal(combo._highlightIndex(), items.length - 1);
    const chip = document.createElement("span");
    combo.attachChip(chip, "banana");
    dispatchClick(chip);
    assert.equal(combo.has("banana"), false, "chip removal deselects");
    // The chip-removal clamp guards against the roving index outliving the
    // ITEM list (attachChip's off path mirrors attachItem's clamp), not the
    // selection set -- removing a chip never shrinks _items, so the index
    // stays exactly where it was: still valid, never negative, never past
    // the end.
    const idx = combo._highlightIndex();
    assert.ok(idx >= 0 && idx < items.length, "roving index remains within bounds after chip removal");
    assert.equal(idx, items.length - 1, "index unaffected: chip removal does not touch the item list");
    combo.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// data-count + aria-selected
// ---------------------------------------------------------------------------

test("multiple: data-count paints on attach and updates on every toggle", () => {
    setupDOM();
    const { combo, trigger } = build({ multiple: true });
    assert.equal(trigger.getAttribute("data-count"), "0", "paints immediately on attachTrigger");
    combo.toggleValue("apple");
    assert.equal(trigger.getAttribute("data-count"), "1");
    combo.toggleValue("banana");
    assert.equal(trigger.getAttribute("data-count"), "2");
    combo.toggleValue("apple");
    assert.equal(trigger.getAttribute("data-count"), "1");
    combo.destroy();
    teardownDOM();
});

test("multiple: aria-selected + data-selected reflect membership for every item independently", () => {
    setupDOM();
    const { combo, items } = build({ multiple: true });
    combo.toggleValue("apple");
    combo.toggleValue("cherry");
    assert.equal(items[0].el.getAttribute("aria-selected"), "true"); // apple
    assert.equal(items[0].el.getAttribute("data-selected"), "");
    assert.equal(items[1].el.getAttribute("aria-selected"), "false"); // banana
    assert.equal(items[1].el.hasAttribute("data-selected"), false);
    assert.equal(items[2].el.getAttribute("aria-selected"), "true"); // cherry
    combo.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// destroy seal contract
// ---------------------------------------------------------------------------

test("destroy: values() AND has() both freeze at the final selection (R7a)", () => {
    setupDOM();
    const { combo } = build({ multiple: true });
    combo.toggleValue("apple");
    assert.deepEqual(combo.values(), ["apple"]);
    assert.equal(combo.has("apple"), true);
    combo.destroy();
    // R7a: destroy() no longer clears `_selected`, so has() answers the frozen
    // post-destroy selection -- agreeing with the sealed values() snapshot.
    // These two asserts sit together on purpose: a re-introduced
    // `_selected.clear()` in destroy() fails the second one immediately.
    assert.deepEqual(combo.values(), ["apple"], "values() stays frozen at the pre-destroy selection");
    assert.equal(combo.has("apple"), true, "has() answers the frozen selection post-destroy (no clear())");
    // a value that was never selected still reads false post-destroy
    assert.equal(combo.has("banana"), false, "unselected value stays false post-destroy");
    teardownDOM();
});

test("multiple: toggleValue/setValue after destroy leave values() frozen (destroyed-guard no-op)", () => {
    setupDOM();
    const { combo } = build({ multiple: true });
    combo.toggleValue("apple");
    combo.destroy();
    // In a multiple:true handle post-destroy, toggleValue hits the
    // core.destroyed guard (a no-op RETURN), NOT the R6 !multiple throw --
    // `multiple` is still truthy, so the fail-closed guard is not the path here.
    assert.doesNotThrow(() => combo.toggleValue("banana"), "destroyed-guard short-circuits before any mutation");
    assert.doesNotThrow(() => combo.setValue("cherry"), "setValue post-destroy is inert too");
    assert.deepEqual(combo.values(), ["apple"], "post-destroy mutators do not change the frozen selection");
    teardownDOM();
});

// ---------------------------------------------------------------------------
// unknown option key
// ---------------------------------------------------------------------------

test('multiple: unknown option key "multple" still throws TypeError with did-you-mean "multiple"', () => {
    setupDOM();
    assert.throws(
        () => createCombobox({ multple: true }),
        (e) => e.name === "TypeError" && e.message === 'createCombobox: unknown option "multple". Did you mean "multiple"?',
    );
    teardownDOM();
});
