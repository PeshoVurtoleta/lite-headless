// toggle-group.test.js -- createToggleGroup, both single and multi modes
//
// Roving tabindex, ARIA painting, keyboard navigation, click toggling,
// deselect behavior, disabled handling. Single + multi modes covered.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createToggleGroup } from "../src/toggle-group/index.js";

function mkRoot() {
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
}

function mkItem(parent, key) {
    const btn = document.createElement("button");
    btn.textContent = key;
    parent.appendChild(btn);
    return btn;
}

function dispatchKey(el, key) {
    const ev = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
}

// -----------------------------------------------------------------
// Construction
// -----------------------------------------------------------------

test("createToggleGroup defaults to single mode + no value", () => {
    setupDOM();
    const tg = createToggleGroup();
    assert.equal(tg.type, "single");
    assert.equal(tg.value(), null);
    assert.equal(tg.disabled(), false);
    tg.destroy();
    teardownDOM();
});

test("createToggleGroup rejects invalid type", () => {
    setupDOM();
    assert.throws(() => createToggleGroup({ type: "weird" }), /must be 'single' or 'multi'/);
    teardownDOM();
});

test("createToggleGroup rejects invalid orientation", () => {
    setupDOM();
    assert.throws(() => createToggleGroup({ orientation: "diagonal" }), /must be 'horizontal' or 'vertical'/);
    teardownDOM();
});

test("createToggleGroup multi mode defaults to empty array", () => {
    setupDOM();
    const tg = createToggleGroup({ type: "multi" });
    assert.deepEqual(tg.value(), []);
    tg.destroy();
    teardownDOM();
});

test("defaultValue seeds initial state in single mode", () => {
    setupDOM();
    const tg = createToggleGroup({ defaultValue: "list" });
    assert.equal(tg.value(), "list");
    tg.destroy();
    teardownDOM();
});

test("defaultValue seeds initial state in multi mode", () => {
    setupDOM();
    const tg = createToggleGroup({ type: "multi", defaultValue: ["bold", "italic"] });
    assert.deepEqual(tg.value(), ["bold", "italic"]);
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachItem + ARIA painting
// -----------------------------------------------------------------

test("attachItem rejects empty key", () => {
    setupDOM();
    const root = mkRoot();
    const item = mkItem(root, "a");
    const tg = createToggleGroup();
    assert.throws(() => tg.attachItem(item, ""), /non-empty string/);
    assert.throws(() => tg.attachItem(item, null), /non-empty string/);
    tg.destroy();
    teardownDOM();
});

test("attachItem writes aria-pressed=false + data-pressed absent initially", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    assert.equal(a.getAttribute("aria-pressed"), "false");
    assert.equal(a.hasAttribute("data-pressed"), false);
    tg.destroy();
    teardownDOM();
});

test("attachItem writes aria-pressed=true if key matches initial value", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ defaultValue: "a" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    assert.equal(a.getAttribute("aria-pressed"), "true");
    assert.equal(a.hasAttribute("data-pressed"), true);
    tg.destroy();
    teardownDOM();
});

test("attachItem sets type=button on raw buttons", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachItem(a, "a");
    assert.equal(a.getAttribute("type"), "button");
    tg.destroy();
    teardownDOM();
});

test("first attached enabled item gets tabindex=0; rest get tabindex=-1", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b"), c = mkItem(root, "c");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.attachItem(c, "c");
    assert.equal(a.getAttribute("tabindex"), "0");
    assert.equal(b.getAttribute("tabindex"), "-1");
    assert.equal(c.getAttribute("tabindex"), "-1");
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Single-mode selection
// -----------------------------------------------------------------

test("single mode: click selects + fires onValueChange", () => {
    setupDOM();
    const changes = [];
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup({ onValueChange: (v, r) => changes.push([v, r]) });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    a.click();
    assert.equal(tg.value(), "a");
    assert.deepEqual(changes, [["a", "click"]]);
    b.click();
    assert.equal(tg.value(), "b");
    assert.equal(a.getAttribute("aria-pressed"), "false");
    assert.equal(b.getAttribute("aria-pressed"), "true");
    tg.destroy();
    teardownDOM();
});

test("single mode: clicking the current item is a no-op (allowDeselect=false)", () => {
    setupDOM();
    let count = 0;
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ defaultValue: "a", onValueChange: () => count++ });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    a.click();
    a.click();
    assert.equal(tg.value(), "a", "still selected");
    assert.equal(count, 0, "no firings");
    tg.destroy();
    teardownDOM();
});

test("single mode: allowDeselect=true lets clicking current deselect", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ defaultValue: "a", allowDeselect: true });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    a.click();
    assert.equal(tg.value(), null, "deselected");
    tg.destroy();
    teardownDOM();
});

test("single mode: setValue(null) deselects", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ defaultValue: "a" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.setValue(null);
    assert.equal(tg.value(), null);
    assert.equal(a.getAttribute("aria-pressed"), "false");
    tg.destroy();
    teardownDOM();
});

test("single mode: setValue to unknown key is ignored", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.setValue("nonexistent");
    assert.equal(tg.value(), null, "unknown key rejected");
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Multi-mode selection
// -----------------------------------------------------------------

test("multi mode: click toggles membership", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup({ type: "multi" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    a.click();
    assert.deepEqual(tg.value(), ["a"]);
    b.click();
    assert.deepEqual(tg.value(), ["a", "b"]);
    a.click();    // toggle off
    assert.deepEqual(tg.value(), ["b"]);
    tg.destroy();
    teardownDOM();
});

test("multi mode: setValue replaces entire array", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b"), c = mkItem(root, "c");
    const tg = createToggleGroup({ type: "multi", defaultValue: ["a"] });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.attachItem(c, "c");
    tg.setValue(["b", "c"]);
    assert.deepEqual(tg.value(), ["b", "c"]);
    tg.destroy();
    teardownDOM();
});

test("multi mode: setValue filters out unknown keys", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ type: "multi" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.setValue(["a", "nonexistent", "also-fake"]);
    assert.deepEqual(tg.value(), ["a"]);
    tg.destroy();
    teardownDOM();
});

test("multi mode: setValue dedupes", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup({ type: "multi" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.setValue(["a", "b", "a", "b"]);
    assert.deepEqual(tg.value(), ["a", "b"]);
    tg.destroy();
    teardownDOM();
});

test("multi mode: identical array values produce no callback fire", () => {
    setupDOM();
    let count = 0;
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ type: "multi", onValueChange: () => count++ });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.setValue(["a"]);
    tg.setValue(["a"]);     // same array contents -> no fire
    assert.equal(count, 1);
    tg.destroy();
    teardownDOM();
});

test("contains() works for both modes", () => {
    setupDOM();
    const tgS = createToggleGroup({ defaultValue: "x" });
    const tgM = createToggleGroup({ type: "multi", defaultValue: ["a", "b"] });
    assert.equal(tgS.contains("x"), true);
    assert.equal(tgS.contains("y"), false);
    assert.equal(tgM.contains("a"), true);
    assert.equal(tgM.contains("b"), true);
    assert.equal(tgM.contains("c"), false);
    tgS.destroy(); tgM.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Keyboard
// -----------------------------------------------------------------

test("Space toggles the focused item", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    dispatchKey(a, " ");
    assert.equal(tg.value(), "a");
    tg.destroy();
    teardownDOM();
});

test("Enter toggles the focused item", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    dispatchKey(a, "Enter");
    assert.equal(tg.value(), "a");
    tg.destroy();
    teardownDOM();
});

test("disabled item ignores Space + click", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a", { disabled: true });
    a.click();
    dispatchKey(a, " ");
    assert.equal(tg.value(), null);
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Disabled handling
// -----------------------------------------------------------------

test("group-wide disabled blocks all interaction", () => {
    setupDOM();
    let count = 0;
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup({ disabled: true, onValueChange: () => count++ });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    a.click();
    b.click();
    dispatchKey(a, "Enter");
    assert.equal(tg.value(), null);
    assert.equal(count, 0);
    tg.destroy();
    teardownDOM();
});

test("setDisabled(true) paints aria-disabled on all items", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.setDisabled(true);
    assert.equal(a.getAttribute("aria-disabled"), "true");
    assert.equal(b.getAttribute("aria-disabled"), "true");
    tg.setDisabled(false);
    assert.equal(a.hasAttribute("aria-disabled"), false);
    assert.equal(b.hasAttribute("aria-disabled"), false);
    tg.destroy();
    teardownDOM();
});

test("setItemDisabled(key, true) deselects in single mode", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ defaultValue: "a" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.setItemDisabled("a", true);
    assert.equal(tg.value(), null, "disabled item removed from selection");
    assert.equal(a.getAttribute("aria-disabled"), "true");
    tg.destroy();
    teardownDOM();
});

test("setItemDisabled(key, true) removes from selection in multi mode", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup({ type: "multi", defaultValue: ["a", "b"] });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.setItemDisabled("a", true);
    assert.deepEqual(tg.value(), ["b"]);
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// ARIA paint sync
// -----------------------------------------------------------------

test("aria-pressed re-paints when value changes externally", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.setValue("a");
    assert.equal(a.getAttribute("aria-pressed"), "true");
    assert.equal(b.getAttribute("aria-pressed"), "false");
    tg.setValue("b");
    assert.equal(a.getAttribute("aria-pressed"), "false");
    assert.equal(b.getAttribute("aria-pressed"), "true");
    tg.destroy();
    teardownDOM();
});

test("data-pressed mirrors aria-pressed", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    assert.equal(a.hasAttribute("data-pressed"), false);
    tg.setValue("a");
    assert.equal(a.hasAttribute("data-pressed"), true);
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Root
// -----------------------------------------------------------------

test("attachRoot writes role=group + data-orientation", () => {
    setupDOM();
    const root = mkRoot();
    const tg = createToggleGroup({ orientation: "vertical" });
    tg.attachRoot(root);
    assert.equal(root.getAttribute("role"), "group");
    assert.equal(root.getAttribute("data-orientation"), "vertical");
    tg.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Destroy
// -----------------------------------------------------------------

test("destroy() clears attributes and detaches", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ defaultValue: "a" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.destroy();
    assert.equal(tg.destroyed, true);
    assert.equal(a.hasAttribute("aria-pressed"), false);
    assert.equal(a.hasAttribute("data-pressed"), false);
    teardownDOM();
});

test("destroy() is idempotent", () => {
    setupDOM();
    const tg = createToggleGroup();
    tg.destroy();
    tg.destroy();
    assert.equal(tg.destroyed, true);
    teardownDOM();
});

test("setValue after destroy is a no-op", () => {
    setupDOM();
    const tg = createToggleGroup();
    tg.destroy();
    assert.equal(tg.setValue("x"), false);
    teardownDOM();
});

// -----------------------------------------------------------------
// toggleItem imperative
// -----------------------------------------------------------------

test("toggleItem() acts like a click in single mode", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a"), b = mkItem(root, "b");
    const tg = createToggleGroup();
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.attachItem(b, "b");
    tg.toggleItem("a");
    assert.equal(tg.value(), "a");
    tg.toggleItem("b");
    assert.equal(tg.value(), "b");
    tg.destroy();
    teardownDOM();
});

test("toggleItem() acts like a click in multi mode", () => {
    setupDOM();
    const root = mkRoot();
    const a = mkItem(root, "a");
    const tg = createToggleGroup({ type: "multi" });
    tg.attachRoot(root);
    tg.attachItem(a, "a");
    tg.toggleItem("a");
    assert.deepEqual(tg.value(), ["a"]);
    tg.toggleItem("a");
    assert.deepEqual(tg.value(), []);
    tg.destroy();
    teardownDOM();
});
