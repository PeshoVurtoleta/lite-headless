// Tests: toolbar.
//
// Validates the ARIA paint, roving-focus integration, separator +
// group attachments, per-item disabled state, and idempotent destroy.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createToolbar } from "../src/toolbar/index.js";

function mkButton(text) {
    const b = document.createElement("button");
    b.textContent = text || "x";
    document.body.appendChild(b);
    return b;
}

// ─── ARIA + slot markers ─────────────────────────────────────────────

test("attachRoot writes role + data markers + orientation", () => {
    setupDOM();
    const tb = createToolbar({ orientation: "horizontal" });
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    assert.equal(root.getAttribute("role"), "toolbar");
    assert.equal(root.getAttribute("data-toolbar-root"), "");
    assert.equal(root.getAttribute("data-orientation"), "horizontal");
    // horizontal: aria-orientation omitted (W3C default)
    assert.equal(root.hasAttribute("aria-orientation"), false);
    tb.destroy();
    teardownDOM();
});

test("vertical orientation sets aria-orientation=vertical", () => {
    setupDOM();
    const tb = createToolbar({ orientation: "vertical" });
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    assert.equal(root.getAttribute("aria-orientation"), "vertical");
    assert.equal(root.getAttribute("data-orientation"), "vertical");
    tb.destroy();
    teardownDOM();
});

test("attachItem paints data-toolbar-item + sets initial tabindex", () => {
    setupDOM();
    const tb = createToolbar();
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    const a = mkButton("a"), b = mkButton("b"), c = mkButton("c");
    tb.attachItem(a);
    tb.attachItem(b);
    tb.attachItem(c);
    assert.equal(a.getAttribute("data-toolbar-item"), "");
    // First item gets tab stop; rest are -1.
    assert.equal(a.getAttribute("tabindex"), "0");
    assert.equal(b.getAttribute("tabindex"), "-1");
    assert.equal(c.getAttribute("tabindex"), "-1");
    tb.destroy();
    teardownDOM();
});

test("attachSeparator: role + perpendicular aria-orientation", () => {
    setupDOM();
    const tb = createToolbar({ orientation: "horizontal" });
    const sep = document.createElement("div");
    document.body.appendChild(sep);
    tb.attachSeparator(sep);
    assert.equal(sep.getAttribute("role"), "separator");
    assert.equal(sep.getAttribute("data-toolbar-separator"), "");
    // Horizontal toolbar -> vertical separator
    assert.equal(sep.getAttribute("aria-orientation"), "vertical");
    tb.destroy();
    teardownDOM();
});

test("vertical toolbar -> horizontal separator orientation", () => {
    setupDOM();
    const tb = createToolbar({ orientation: "vertical" });
    const sep = document.createElement("div");
    document.body.appendChild(sep);
    tb.attachSeparator(sep);
    assert.equal(sep.getAttribute("aria-orientation"), "horizontal");
    tb.destroy();
    teardownDOM();
});

test("attachGroup: role=group + data marker", () => {
    setupDOM();
    const tb = createToolbar();
    const g = document.createElement("div");
    document.body.appendChild(g);
    tb.attachGroup(g);
    assert.equal(g.getAttribute("role"), "group");
    assert.equal(g.getAttribute("data-toolbar-group"), "");
    tb.destroy();
    teardownDOM();
});

// ─── disabled per-item ──────────────────────────────────────────────

test("setItemDisabled paints data-disabled + aria-disabled", () => {
    setupDOM();
    const tb = createToolbar();
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    const btn = mkButton();
    tb.attachItem(btn);
    tb.setItemDisabled(btn, true);
    assert.equal(btn.getAttribute("data-disabled"), "");
    assert.equal(btn.getAttribute("aria-disabled"), "true");
    tb.setItemDisabled(btn, false);
    assert.equal(btn.hasAttribute("data-disabled"), false);
    assert.equal(btn.getAttribute("aria-disabled"), "false");
    tb.destroy();
    teardownDOM();
});

test("initial disabled state inferred from data-disabled / aria-disabled", () => {
    setupDOM();
    const tb = createToolbar();
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    const a = mkButton("a");
    const b = mkButton("b");
    a.setAttribute("data-disabled", "");
    b.setAttribute("aria-disabled", "true");
    tb.attachItem(a);
    tb.attachItem(b);
    // Roving focus reads `disabled` flag from item list; we record it
    // at attach time so disabled items are skipped on arrow nav.
    const items = tb._items();
    assert.equal(items[0].disabled, true);
    assert.equal(items[1].disabled, true);
    tb.destroy();
    teardownDOM();
});

// ─── destroy + cleanup ──────────────────────────────────────────────

test("destroy is idempotent + clears all data markers", () => {
    setupDOM();
    const tb = createToolbar();
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    const a = mkButton();
    const sep = document.createElement("div");
    document.body.appendChild(sep);
    tb.attachItem(a);
    tb.attachSeparator(sep);
    tb.destroy();
    tb.destroy();    // should not throw
    assert.equal(tb.destroyed, true);
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("data-toolbar-root"), false);
    assert.equal(a.hasAttribute("data-toolbar-item"), false);
    assert.equal(sep.hasAttribute("role"), false);
    teardownDOM();
});

test("attach detach off() removes data markers + tabindex", () => {
    setupDOM();
    const tb = createToolbar();
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    const btn = mkButton();
    const off = tb.attachItem(btn);
    assert.equal(btn.hasAttribute("data-toolbar-item"), true);
    assert.equal(btn.getAttribute("tabindex"), "0");
    off();
    assert.equal(btn.hasAttribute("data-toolbar-item"), false);
    assert.equal(btn.hasAttribute("tabindex"), false);
    tb.destroy();
    teardownDOM();
});

test("focusItem(el) moves the tab stop to that item", () => {
    setupDOM();
    const tb = createToolbar();
    const root = document.createElement("div");
    document.body.appendChild(root);
    tb.attachRoot(root);
    const a = mkButton("a");
    const b = mkButton("b");
    const c = mkButton("c");
    tb.attachItem(a);
    tb.attachItem(b);
    tb.attachItem(c);
    tb.focusItem(c);
    // After roving-focus.setIndex(2), c should be the tab stop.
    assert.equal(c.getAttribute("tabindex"), "0");
    assert.equal(a.getAttribute("tabindex"), "-1");
    assert.equal(b.getAttribute("tabindex"), "-1");
    tb.destroy();
    teardownDOM();
});
