// switch.test.js -- createSwitch end-to-end
//
// Real ARIA painting, controlled/uncontrolled state, keyboard nav,
// label-click toggling, form integration via attachInput, and the
// detach cleanup contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createSwitch } from "../src/switch/index.js";
import { signal as makeSignal } from "@zakkster/lite-signal";

function mkRoot() {
    const el = document.createElement("button");
    document.body.appendChild(el);
    return el;
}

function dispatchKey(el, key) {
    const ev = new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
}

// -----------------------------------------------------------------
// Construction
// -----------------------------------------------------------------

test("createSwitch defaults to unchecked, enabled, not destroyed", () => {
    setupDOM();
    const s = createSwitch();
    assert.equal(s.isChecked(), false);
    assert.equal(s.disabled(), false);
    assert.equal(s.destroyed, false);
    s.destroy();
    teardownDOM();
});

test("createSwitch defaultChecked seeds initial value", () => {
    setupDOM();
    const s = createSwitch({ defaultChecked: true });
    assert.equal(s.isChecked(), true);
    s.destroy();
    teardownDOM();
});

test("createSwitch with disabled: true starts disabled", () => {
    setupDOM();
    const s = createSwitch({ disabled: true });
    assert.equal(s.disabled(), true);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachRoot ARIA painting
// -----------------------------------------------------------------

test("attachRoot writes role=switch + aria-checked + tabindex", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    s.attachRoot(root);
    assert.equal(root.getAttribute("role"), "switch");
    assert.equal(root.getAttribute("aria-checked"), "false");
    assert.equal(root.getAttribute("tabindex"), "0");
    s.destroy();
    teardownDOM();
});

test("attachRoot writes aria-required when required option is set", () => {
    setupDOM();
    const s = createSwitch({ required: true });
    const root = mkRoot();
    s.attachRoot(root);
    assert.equal(root.getAttribute("aria-required"), "true");
    s.destroy();
    teardownDOM();
});

test("attachRoot preserves existing tabindex", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    root.setAttribute("tabindex", "-1");
    s.attachRoot(root);
    assert.equal(root.getAttribute("tabindex"), "-1", "consumer override respected");
    s.destroy();
    teardownDOM();
});

test("data-checked attribute follows isChecked()", () => {
    setupDOM();
    const s = createSwitch({ defaultChecked: true });
    const root = mkRoot();
    s.attachRoot(root);
    assert.equal(root.getAttribute("data-checked"), "true");
    s.setChecked(false);
    assert.equal(root.getAttribute("data-checked"), "false");
    s.setChecked(true);
    assert.equal(root.getAttribute("data-checked"), "true");
    s.destroy();
    teardownDOM();
});

test("aria-disabled appears when setDisabled(true)", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    s.attachRoot(root);
    assert.equal(root.hasAttribute("aria-disabled"), false);
    s.setDisabled(true);
    assert.equal(root.getAttribute("aria-disabled"), "true");
    assert.equal(root.hasAttribute("data-disabled"), true);
    s.setDisabled(false);
    assert.equal(root.hasAttribute("aria-disabled"), false);
    assert.equal(root.hasAttribute("data-disabled"), false);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Toggle behavior
// -----------------------------------------------------------------

test("toggle() flips state and fires onChange", () => {
    setupDOM();
    const changes = [];
    const s = createSwitch({ onChange: (c, r) => changes.push([c, r]) });
    s.toggle();
    assert.equal(s.isChecked(), true);
    s.toggle();
    assert.equal(s.isChecked(), false);
    assert.deepEqual(changes, [[true, "toggle"], [false, "toggle"]]);
    s.destroy();
    teardownDOM();
});

test("setChecked(true) when already true is a no-op (no callback fire)", () => {
    setupDOM();
    let count = 0;
    const s = createSwitch({ defaultChecked: true, onChange: () => count++ });
    s.setChecked(true);
    s.setChecked(true);
    assert.equal(count, 0, "no fires for redundant set");
    s.setChecked(false);
    assert.equal(count, 1);
    s.destroy();
    teardownDOM();
});

test("toggle() while disabled is blocked", () => {
    setupDOM();
    let count = 0;
    const s = createSwitch({ disabled: true, onChange: () => count++ });
    s.toggle();
    assert.equal(s.isChecked(), false);
    assert.equal(count, 0);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Keyboard
// -----------------------------------------------------------------

test("Space toggles when root is focused", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    s.attachRoot(root);
    dispatchKey(root, " ");
    assert.equal(s.isChecked(), true);
    s.destroy();
    teardownDOM();
});

test("Enter toggles when root is focused", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    s.attachRoot(root);
    dispatchKey(root, "Enter");
    assert.equal(s.isChecked(), true);
    s.destroy();
    teardownDOM();
});

test("Other keys do nothing", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    s.attachRoot(root);
    dispatchKey(root, "a");
    dispatchKey(root, "Tab");
    dispatchKey(root, "Escape");
    assert.equal(s.isChecked(), false);
    s.destroy();
    teardownDOM();
});

test("Space while disabled is ignored", () => {
    setupDOM();
    const s = createSwitch({ disabled: true });
    const root = mkRoot();
    s.attachRoot(root);
    dispatchKey(root, " ");
    assert.equal(s.isChecked(), false);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Click
// -----------------------------------------------------------------

test("click toggles when root is clicked", () => {
    setupDOM();
    const changes = [];
    const s = createSwitch({ onChange: (c, r) => changes.push([c, r]) });
    const root = mkRoot();
    s.attachRoot(root);
    root.click();
    assert.equal(s.isChecked(), true);
    assert.deepEqual(changes, [[true, "click"]]);
    s.destroy();
    teardownDOM();
});

test("click while disabled is ignored", () => {
    setupDOM();
    let count = 0;
    const s = createSwitch({ disabled: true, onChange: () => count++ });
    const root = mkRoot();
    s.attachRoot(root);
    root.click();
    assert.equal(s.isChecked(), false);
    assert.equal(count, 0);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Label
// -----------------------------------------------------------------

test("attachLabel writes aria-labelledby on root", () => {
    setupDOM();
    const s = createSwitch();
    const root = mkRoot();
    const label = document.createElement("span");
    label.id = "lbl";
    document.body.appendChild(label);
    s.attachRoot(root);
    s.attachLabel(label);
    assert.equal(root.getAttribute("aria-labelledby"), "lbl");
    s.destroy();
    teardownDOM();
});

test("clicking a separate (non-wrapping) label toggles via label-click", () => {
    setupDOM();
    const changes = [];
    const s = createSwitch({ onChange: (c, r) => changes.push([c, r]) });
    const root = mkRoot();
    const label = document.createElement("span");
    document.body.appendChild(label);
    s.attachRoot(root);
    s.attachLabel(label);
    label.click();
    assert.equal(s.isChecked(), true);
    assert.deepEqual(changes, [[true, "label-click"]]);
    s.destroy();
    teardownDOM();
});

test("label that wraps the root does NOT double-toggle", () => {
    setupDOM();
    let count = 0;
    const s = createSwitch({ onChange: () => count++ });
    const wrapper = document.createElement("label");
    const root = document.createElement("button");
    wrapper.appendChild(root);
    document.body.appendChild(wrapper);
    s.attachRoot(root);
    s.attachLabel(wrapper);
    // Click bubbles up through root then through wrapper, but our
    // wrapper handler bails because wrapper.contains(root) is true.
    // Only the root's click fires the toggle.
    root.click();
    assert.equal(count, 1, "exactly one toggle");
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Thumb
// -----------------------------------------------------------------

test("attachThumb gets data-checked synced to state", () => {
    setupDOM();
    const s = createSwitch({ defaultChecked: true });
    const thumb = document.createElement("span");
    document.body.appendChild(thumb);
    s.attachThumb(thumb);
    assert.equal(thumb.getAttribute("data-checked"), "true");
    s.setChecked(false);
    assert.equal(thumb.getAttribute("data-checked"), "false");
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Form integration via attachInput
// -----------------------------------------------------------------

test("attachInput sets type=checkbox + initial state synced", () => {
    setupDOM();
    const s = createSwitch({ defaultChecked: true });
    const input = document.createElement("input");
    document.body.appendChild(input);
    s.attachInput(input);
    assert.equal(input.type, "checkbox");
    assert.equal(input.checked, true);
    s.destroy();
    teardownDOM();
});

test("input change syncs back to primitive (browser autofill path)", () => {
    setupDOM();
    const changes = [];
    const s = createSwitch({ onChange: (c, r) => changes.push([c, r]) });
    const input = document.createElement("input");
    document.body.appendChild(input);
    s.attachInput(input);
    input.checked = true;
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    assert.equal(s.isChecked(), true);
    assert.deepEqual(changes, [[true, "input-change"]]);
    s.destroy();
    teardownDOM();
});

test("setChecked propagates to native input", () => {
    setupDOM();
    const s = createSwitch();
    const input = document.createElement("input");
    document.body.appendChild(input);
    s.attachInput(input);
    s.setChecked(true);
    assert.equal(input.checked, true);
    s.setChecked(false);
    assert.equal(input.checked, false);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Controlled mode (external signal)
// -----------------------------------------------------------------

test("controlled mode reads from external signal", () => {
    setupDOM();
    const ext = makeSignal(false);
    const s = createSwitch({ checked: ext });
    const root = mkRoot();
    s.attachRoot(root);
    assert.equal(s.isChecked(), false);
    ext.set(true);
    assert.equal(s.isChecked(), true);
    assert.equal(root.getAttribute("aria-checked"), "true",
        "ARIA re-paints when external signal changes");
    s.destroy();
    teardownDOM();
});

test("controlled mode: setChecked does NOT mutate external signal", () => {
    setupDOM();
    const ext = makeSignal(false);
    let extCalls = 0;
    const origSet = ext.set;
    ext.set = (v) => { extCalls++; origSet(v); };
    const s = createSwitch({ checked: ext, onChange: () => {} });
    s.setChecked(true);
    // External signal is unchanged; the consumer is responsible
    // for updating it in their onChange handler. Verify by checking
    // the count: we should not have called set internally.
    assert.equal(extCalls, 0,
        "primitive does not mutate the external signal in controlled mode");
    assert.equal(ext(), false);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Destroy
// -----------------------------------------------------------------

test("destroy() removes attributes and detaches listeners", () => {
    setupDOM();
    const s = createSwitch({ defaultChecked: true });
    const root = mkRoot();
    s.attachRoot(root);
    s.destroy();
    assert.equal(s.destroyed, true);
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("aria-checked"), false);
    teardownDOM();
});

test("destroy() is idempotent", () => {
    setupDOM();
    const s = createSwitch();
    s.destroy();
    s.destroy();         // no throw
    assert.equal(s.destroyed, true);
    teardownDOM();
});

test("setChecked after destroy is a no-op", () => {
    setupDOM();
    const s = createSwitch();
    s.destroy();
    assert.equal(s.setChecked(true), false);
    teardownDOM();
});
