// rating.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createRating } from "../src/rating/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

// =====================================================================
// Defaults + accessors
// =====================================================================

test("defaults: max=5, value=0, step=1, not read-only", () => {
    setupDOM();
    const r = createRating();
    assert.equal(r.max, 5);
    assert.equal(r.value(), 0);
    assert.equal(r.step, 1);
    assert.equal(r.isReadOnly(), false);
    r.destroy();
    teardownDOM();
});

test("defaultValue is honored + clamped to [0, max]", () => {
    setupDOM();
    const r1 = createRating({ defaultValue: 3 });
    assert.equal(r1.value(), 3);
    r1.destroy();
    const r2 = createRating({ defaultValue: 99 });
    assert.equal(r2.value(), 5);
    r2.destroy();
    const r3 = createRating({ defaultValue: -2 });
    assert.equal(r3.value(), 0);
    r3.destroy();
    teardownDOM();
});

test("throws on invalid step (not 1 or 0.5)", () => {
    setupDOM();
    assert.throws(() => createRating({ step: 0.25 }));
    teardownDOM();
});

test("throws on max < 1", () => {
    setupDOM();
    assert.throws(() => createRating({ max: 0 }));
    teardownDOM();
});

// =====================================================================
// setValue + snapping
// =====================================================================

test("setValue snaps to step", () => {
    setupDOM();
    const r1 = createRating();   // step=1
    r1.setValue(3.4);
    assert.equal(r1.value(), 3);
    r1.setValue(3.6);
    assert.equal(r1.value(), 4);
    r1.destroy();
    const r2 = createRating({ step: 0.5 });
    r2.setValue(3.4);
    assert.equal(r2.value(), 3.5);
    r2.setValue(3.6);
    assert.equal(r2.value(), 3.5);
    r2.setValue(3.74);
    assert.equal(r2.value(), 3.5);
    r2.setValue(3.76);
    assert.equal(r2.value(), 4);
    r2.destroy();
    teardownDOM();
});

test("setValue fires onValueChange with reason", () => {
    setupDOM();
    let last = null;
    const r = createRating({
        onValueChange: (next, prev, reason) => { last = { next, prev, reason }; },
    });
    r.setValue(4);
    assert.deepEqual(last, { next: 4, prev: 0, reason: "api" });
    r.setValue(4);   // same -> no fire
    assert.equal(last.reason, "api");
    r.setValue(3, "click");
    assert.equal(last.reason, "click");
    r.destroy();
    teardownDOM();
});

test("setValue is blocked in read-only mode", () => {
    setupDOM();
    const r = createRating({ defaultValue: 2, readOnly: true });
    r.setValue(5);
    assert.equal(r.value(), 2);
    r.destroy();
    teardownDOM();
});

test("setReadOnly toggles", () => {
    setupDOM();
    const r = createRating({ defaultValue: 2 });
    r.setReadOnly(true);
    assert.equal(r.isReadOnly(), true);
    r.setValue(5);
    assert.equal(r.value(), 2);
    r.setReadOnly(false);
    r.setValue(5);
    assert.equal(r.value(), 5);
    r.destroy();
    teardownDOM();
});

// =====================================================================
// Hover state + displayValue
// =====================================================================

test("setHoverValue + displayValue interleaves correctly", () => {
    setupDOM();
    const r = createRating({ defaultValue: 3 });
    assert.equal(r.displayValue(), 3);
    r.setHoverValue(4);
    assert.equal(r.displayValue(), 4);
    assert.equal(r.value(), 3);   // unchanged
    r.setHoverValue(null);
    assert.equal(r.displayValue(), 3);
    r.destroy();
    teardownDOM();
});

test("setHoverValue blocked in read-only", () => {
    setupDOM();
    const r = createRating({ defaultValue: 2, readOnly: true });
    r.setHoverValue(4);
    assert.equal(r.hoverValue(), null);
    r.destroy();
    teardownDOM();
});

test("clear sets value to 0", () => {
    setupDOM();
    const r = createRating({ defaultValue: 4 });
    r.clear();
    assert.equal(r.value(), 0);
    r.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot
// =====================================================================

test("attachRoot sets role=radiogroup + reactive data attrs", () => {
    setupDOM();
    const r = createRating({ defaultValue: 3 });
    const el = mkEl();
    r.attachRoot(el);
    assert.equal(el.getAttribute("role"), "radiogroup");
    assert.equal(el.getAttribute("aria-label"), "Rating");
    assert.equal(el.getAttribute("data-max"), "5");
    assert.equal(el.getAttribute("data-step"), "1");
    assert.equal(el.getAttribute("data-value"), "3");
    assert.equal(el.getAttribute("data-display-value"), "3");
    r.setValue(4);
    assert.equal(el.getAttribute("data-value"), "4");
    r.setHoverValue(5);
    assert.equal(el.getAttribute("data-display-value"), "5");
    assert.equal(el.getAttribute("data-hovering"), "");
    r.destroy();
    teardownDOM();
});

test("root keyboard: ArrowRight increments by step", () => {
    setupDOM();
    const r = createRating({ defaultValue: 2 });
    const el = mkEl();
    r.attachRoot(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    assert.equal(r.value(), 3);
    r.destroy();
    teardownDOM();
});

test("root keyboard: ArrowLeft decrements by step", () => {
    setupDOM();
    const r = createRating({ defaultValue: 3, step: 0.5 });
    const el = mkEl();
    r.attachRoot(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    assert.equal(r.value(), 2.5);
    r.destroy();
    teardownDOM();
});

test("root keyboard: Home + End jump to 0 / max", () => {
    setupDOM();
    const r = createRating({ defaultValue: 3 });
    const el = mkEl();
    r.attachRoot(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
    assert.equal(r.value(), 0);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    assert.equal(r.value(), 5);
    r.destroy();
    teardownDOM();
});

test("root keyboard: number key '4' sets value to 4", () => {
    setupDOM();
    const r = createRating();
    const el = mkEl();
    r.attachRoot(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "4", bubbles: true }));
    assert.equal(r.value(), 4);
    r.destroy();
    teardownDOM();
});

test("root keyboard: blocked in read-only", () => {
    setupDOM();
    const r = createRating({ defaultValue: 2, readOnly: true });
    const el = mkEl();
    r.attachRoot(el);
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    assert.equal(r.value(), 2);
    r.destroy();
    teardownDOM();
});

// =====================================================================
// attachItem paint
// =====================================================================

test("attachItem paints data-filled + aria-checked + tabindex", () => {
    setupDOM();
    const r = createRating({ defaultValue: 3 });
    const els = [mkEl(), mkEl(), mkEl(), mkEl(), mkEl()];
    for (let i = 0; i < 5; i++) r.attachItem(els[i], i + 1);
    // value=3: items 1-3 filled, 4-5 empty
    assert.equal(els[0].getAttribute("data-filled"), "");
    assert.equal(els[2].getAttribute("data-filled"), "");
    assert.equal(els[3].getAttribute("data-empty"), "");
    assert.equal(els[2].getAttribute("aria-checked"), "true");
    assert.equal(els[3].getAttribute("aria-checked"), "false");
    // tabindex: focused item is at index 3
    assert.equal(els[2].getAttribute("tabindex"), "0");
    assert.equal(els[3].getAttribute("tabindex"), "-1");
    r.destroy();
    teardownDOM();
});

test("attachItem click sets the value", () => {
    setupDOM();
    const r = createRating();
    const el = mkEl();
    r.attachItem(el, 3);
    el.click();
    assert.equal(r.value(), 3);
    r.destroy();
    teardownDOM();
});

test("clearable: click on currently-selected item zeros", () => {
    setupDOM();
    const r = createRating({ defaultValue: 4, clearable: true });
    const el = mkEl();
    r.attachItem(el, 4);
    el.click();
    assert.equal(r.value(), 0);
    r.destroy();
    teardownDOM();
});

test("non-clearable: click on currently-selected item is no-op", () => {
    setupDOM();
    const r = createRating({ defaultValue: 4 });
    const el = mkEl();
    r.attachItem(el, 4);
    el.click();
    assert.equal(r.value(), 4);
    r.destroy();
    teardownDOM();
});

test("attachItem mouseenter sets hoverValue (and mouseleave clears)", () => {
    setupDOM();
    const r = createRating({ defaultValue: 2 });
    const el = mkEl();
    r.attachItem(el, 4);
    el.dispatchEvent(new Event("mouseenter"));
    assert.equal(r.hoverValue(), 4);
    el.dispatchEvent(new Event("mouseleave"));
    assert.equal(r.hoverValue(), null);
    r.destroy();
    teardownDOM();
});

test("attachItem paint reacts to hoverValue (displayValue)", () => {
    setupDOM();
    const r = createRating({ defaultValue: 1 });
    const el2 = mkEl();
    const el3 = mkEl();
    r.attachItem(el2, 2);
    r.attachItem(el3, 3);
    // No hover: item 2 + 3 empty
    assert.equal(el2.getAttribute("data-empty"), "");
    assert.equal(el3.getAttribute("data-empty"), "");
    // Hover at 3: items 2 + 3 should fill (display purposes)
    r.setHoverValue(3);
    assert.equal(el2.getAttribute("data-filled"), "");
    assert.equal(el3.getAttribute("data-filled"), "");
    r.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy detaches + blocks", () => {
    setupDOM();
    const r = createRating();
    const root = mkEl();
    const item = mkEl();
    r.attachRoot(root);
    r.attachItem(item, 1);
    r.destroy();
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(item.hasAttribute("data-index"), false);
    r.setValue(5);
    assert.equal(r.destroyed, true);
    teardownDOM();
});
