// Tests: radio-group.
//
// ARIA semantics, selection state, keyboard nav, disabled items,
// required attribute, and reactive paint.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createRadioGroup } from "../src/radio-group/index.js";

function mkDiv(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

function setup() {
    setupDOM();
    const root = mkDiv();
    const items = [mkDiv("button"), mkDiv("button"), mkDiv("button")];
    for (const i of items) root.appendChild(i);
    return { root, items };
}

// ─── ARIA paint ──────────────────────────────────────────────────────

test("attachRoot sets role=radiogroup + data-radio-group-root", () => {
    const { root } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    assert.equal(root.getAttribute("role"), "radiogroup");
    assert.equal(root.hasAttribute("data-radio-group-root"), true);
    rg.destroy();
    teardownDOM();
});

test("orientation=horizontal sets aria-orientation; vertical (default) omits it", () => {
    const { root } = setup();
    const rg1 = createRadioGroup({ orientation: "horizontal" });
    rg1.attachRoot(root);
    assert.equal(root.getAttribute("aria-orientation"), "horizontal");
    rg1.destroy();

    const root2 = mkDiv();
    const rg2 = createRadioGroup();   // default vertical
    rg2.attachRoot(root2);
    assert.equal(root2.hasAttribute("aria-orientation"), false);
    rg2.destroy();
    teardownDOM();
});

test("required=true paints aria-required", () => {
    const { root } = setup();
    const rg = createRadioGroup({ required: true });
    rg.attachRoot(root);
    assert.equal(root.getAttribute("aria-required"), "true");
    rg.destroy();
    teardownDOM();
});

test("attachItem sets role=radio + aria-checked=false + data-radio-item", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    assert.equal(items[0].getAttribute("role"), "radio");
    assert.equal(items[0].getAttribute("aria-checked"), "false");
    assert.equal(items[0].hasAttribute("data-radio-item"), true);
    assert.equal(items[0].hasAttribute("data-checked"), false);
    rg.destroy();
    teardownDOM();
});

test("setValue paints aria-checked + data-checked on matching item only", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    rg.attachItem(items[2], "c");
    rg.setValue("b");
    assert.equal(items[0].getAttribute("aria-checked"), "false");
    assert.equal(items[1].getAttribute("aria-checked"), "true");
    assert.equal(items[2].getAttribute("aria-checked"), "false");
    assert.equal(items[1].hasAttribute("data-checked"), true);
    rg.destroy();
    teardownDOM();
});

// ─── value mutations ─────────────────────────────────────────────────

test("setValue(null) clears selection", () => {
    const { root, items } = setup();
    const rg = createRadioGroup({ value: "a" });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    assert.equal(rg.value(), "a");
    rg.setValue(null);
    assert.equal(rg.value(), null);
    assert.equal(items[0].getAttribute("aria-checked"), "false");
    rg.destroy();
    teardownDOM();
});

test("setValue on non-string value is ignored", () => {
    const { root } = setup();
    const rg = createRadioGroup({ value: "a" });
    rg.attachRoot(root);
    rg.setValue(42);
    rg.setValue({});
    assert.equal(rg.value(), "a");
    rg.destroy();
    teardownDOM();
});

test("onChange fires with key + reason", () => {
    const { root, items } = setup();
    const calls = [];
    const rg = createRadioGroup({ onChange: (k, r) => calls.push({ k, r }) });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    rg.setValue("a", "test");
    rg.setValue("b", "test");
    assert.deepEqual(calls, [{ k: "a", r: "test" }, { k: "b", r: "test" }]);
    rg.destroy();
    teardownDOM();
});

test("setting same value is a no-op (no onChange fire)", () => {
    const { root } = setup();
    let count = 0;
    const rg = createRadioGroup({ value: "a", onChange: () => count++ });
    rg.attachRoot(root);
    rg.setValue("a");
    assert.equal(count, 0);
    rg.destroy();
    teardownDOM();
});

// ─── click selects ───────────────────────────────────────────────────

test("clicking an item selects it via the click handler", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    items[1].click();
    assert.equal(rg.value(), "b");
    assert.equal(items[1].getAttribute("aria-checked"), "true");
    rg.destroy();
    teardownDOM();
});

// ─── keyboard ────────────────────────────────────────────────────────

function press(el, key) {
    el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

test("ArrowDown moves selection forward (radio semantics: focus + select)", () => {
    const { root, items } = setup();
    const rg = createRadioGroup({ value: "a" });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    rg.attachItem(items[2], "c");
    items[0].focus();
    press(root, "ArrowDown");
    assert.equal(rg.value(), "b");
    press(root, "ArrowDown");
    assert.equal(rg.value(), "c");
    rg.destroy();
    teardownDOM();
});

test("ArrowUp wraps from first to last", () => {
    const { root, items } = setup();
    const rg = createRadioGroup({ value: "a" });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    rg.attachItem(items[2], "c");
    items[0].focus();
    press(root, "ArrowUp");
    assert.equal(rg.value(), "c");
    rg.destroy();
    teardownDOM();
});

test("orientation=horizontal: ArrowRight/Left navigate, ArrowDown/Up ignored", () => {
    const { root, items } = setup();
    const rg = createRadioGroup({ orientation: "horizontal", value: "a" });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    items[0].focus();
    press(root, "ArrowDown");
    assert.equal(rg.value(), "a");    // unchanged
    press(root, "ArrowRight");
    assert.equal(rg.value(), "b");
    rg.destroy();
    teardownDOM();
});

test("Home/End jump to first/last selectable item", () => {
    const { root, items } = setup();
    const rg = createRadioGroup({ value: "b" });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    rg.attachItem(items[2], "c");
    items[1].focus();
    press(root, "End");
    // End moves focus; per APG it doesn't auto-select on radios in
    // some readings, but our impl does (consistent with arrow nav).
    // Actually per W3C APG, Home/End move focus only -- selection
    // stays. Our impl: roving.first()/.last() triggers
    // onIndexChange which selects. That matches MOST user expectations
    // for radios. Document this in llms.txt.
    assert.equal(rg.value(), "c");
    press(root, "Home");
    assert.equal(rg.value(), "a");
    rg.destroy();
    teardownDOM();
});

test("Space confirms current focus (no-op if already checked)", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    items[1].focus();
    press(root, " ");
    assert.equal(rg.value(), "b");
    rg.destroy();
    teardownDOM();
});

// ─── disabled ────────────────────────────────────────────────────────

test("group-disabled blocks click + keyboard", () => {
    const { root, items } = setup();
    const rg = createRadioGroup({ disabled: true });
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    items[0].click();
    assert.equal(rg.value(), null);
    items[0].focus();
    press(root, "ArrowDown");
    assert.equal(rg.value(), null);
    assert.equal(root.getAttribute("aria-disabled"), "true");
    rg.destroy();
    teardownDOM();
});

test("per-item disabled: click ignored, arrow nav skips it", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b", { disabled: true });
    rg.attachItem(items[2], "c");
    items[1].click();
    assert.equal(rg.value(), null);
    assert.equal(items[1].getAttribute("aria-disabled"), "true");
    assert.equal(items[1].hasAttribute("data-disabled"), true);
    items[0].focus();
    rg.setValue("a");
    press(root, "ArrowDown");
    // b is disabled; should skip to c
    assert.equal(rg.value(), "c");
    rg.destroy();
    teardownDOM();
});

test("setItemDisabled at runtime", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.attachItem(items[1], "b");
    rg.setValue("b");
    rg.setItemDisabled("b", true);
    // Disabling the currently-checked item should clear the selection
    assert.equal(rg.value(), null);
    assert.equal(items[1].getAttribute("aria-disabled"), "true");
    rg.destroy();
    teardownDOM();
});

// ─── duplicate keys + lifecycle ──────────────────────────────────────

test("attachItem rejects duplicate keys", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    assert.throws(() => rg.attachItem(items[1], "a"));
    rg.destroy();
    teardownDOM();
});

test("attachItem rejects empty/non-string keys", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    assert.throws(() => rg.attachItem(items[0], ""));
    assert.throws(() => rg.attachItem(items[0], 42));
    rg.destroy();
    teardownDOM();
});

test("detaching an item removes it from the registry", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    const offB = rg.attachItem(items[1], "b");
    assert.equal(rg.itemCount, 2);
    offB();
    assert.equal(rg.itemCount, 1);
    rg.destroy();
    teardownDOM();
});

test("destroy is idempotent + clears attributes", () => {
    const { root, items } = setup();
    const rg = createRadioGroup();
    rg.attachRoot(root);
    rg.attachItem(items[0], "a");
    rg.destroy();
    rg.destroy();
    assert.equal(rg.destroyed, true);
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(items[0].hasAttribute("role"), false);
    teardownDOM();
});
