// Tests: descriptions.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createDescriptions } from "../src/descriptions/index.js";

function setup() {
    setupDOM();
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
}

function mkItem(labelText, valueText) {
    const item = document.createElement("div");
    const label = document.createElement("div");
    label.setAttribute("data-desc-label", "");
    label.textContent = labelText;
    const value = document.createElement("div");
    value.setAttribute("data-desc-value", "");
    value.textContent = valueText;
    item.appendChild(label);
    item.appendChild(value);
    return { item, label, value };
}

test("attachRoot paints data-descriptions-root + default columns=1", () => {
    const root = setup();
    const d = createDescriptions({});
    d.attachRoot(root);
    assert.equal(root.hasAttribute("data-descriptions-root"), true);
    assert.equal(root.getAttribute("data-columns"), "1");
    assert.equal(root.hasAttribute("data-bordered"), false);
    d.destroy(); teardownDOM();
});

test("columns option clamped to [1..4]", () => {
    const root = setup();
    const d1 = createDescriptions({ columns: 3 });
    d1.attachRoot(root);
    assert.equal(root.getAttribute("data-columns"), "3");
    d1.destroy();
    teardownDOM();
});

test("invalid columns falls back to 1", () => {
    const root = setup();
    const d = createDescriptions({ columns: 0 });
    d.attachRoot(root);
    assert.equal(root.getAttribute("data-columns"), "1");
    d.destroy(); teardownDOM();
});

test("bordered paints data-bordered", () => {
    const root = setup();
    const d = createDescriptions({ bordered: true });
    d.attachRoot(root);
    assert.equal(root.hasAttribute("data-bordered"), true);
    d.destroy(); teardownDOM();
});

test("attachItem paints data-desc-item + role=group", () => {
    const root = setup();
    const { item } = mkItem("Username", "alice");
    root.appendChild(item);
    const d = createDescriptions({});
    d.attachRoot(root);
    d.attachItem(item);
    assert.equal(item.hasAttribute("data-desc-item"), true);
    assert.equal(item.getAttribute("role"), "group");
    d.destroy(); teardownDOM();
});

test("attachItem wires aria-labelledby from value -> label.id", () => {
    const root = setup();
    const { item, label, value } = mkItem("Email", "a@b");
    root.appendChild(item);
    const d = createDescriptions({});
    d.attachRoot(root);
    d.attachItem(item);
    assert.ok(label.id);
    assert.equal(value.getAttribute("aria-labelledby"), label.id);
    d.destroy(); teardownDOM();
});

test("destroy clears attrs + is idempotent", () => {
    const root = setup();
    const { item } = mkItem("X", "Y");
    root.appendChild(item);
    const d = createDescriptions({ bordered: true, columns: 2 });
    d.attachRoot(root);
    d.attachItem(item);
    d.destroy(); d.destroy();
    assert.equal(d.destroyed, true);
    assert.equal(root.hasAttribute("data-descriptions-root"), false);
    assert.equal(root.hasAttribute("data-bordered"), false);
    assert.equal(item.hasAttribute("data-desc-item"), false);
    teardownDOM();
});
