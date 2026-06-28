// Tests: timeline.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createTimeline } from "../src/timeline/index.js";

function setup() {
    setupDOM();
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
}

test("attachRoot paints role=list + data-timeline-root", () => {
    const root = setup();
    const tl = createTimeline({});
    tl.attachRoot(root);
    assert.equal(root.getAttribute("role"), "list");
    assert.equal(root.hasAttribute("data-timeline-root"), true);
    tl.destroy(); teardownDOM();
});

test("attachItem paints role=listitem + data-timeline-item + data-type", () => {
    const root = setup();
    const item = document.createElement("div");
    root.appendChild(item);
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item, { type: "success" });
    assert.equal(item.getAttribute("role"), "listitem");
    assert.equal(item.hasAttribute("data-timeline-item"), true);
    assert.equal(item.getAttribute("data-type"), "success");
    tl.destroy(); teardownDOM();
});

test("default type when none given", () => {
    const root = setup();
    const item = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item);
    assert.equal(item.getAttribute("data-type"), "default");
    tl.destroy(); teardownDOM();
});

test("invalid type falls back to default", () => {
    const root = setup();
    const item = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item, { type: "nope" });
    assert.equal(item.getAttribute("data-type"), "default");
    tl.destroy(); teardownDOM();
});

test("setItemType updates data-type", () => {
    const root = setup();
    const item = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item, { type: "default" });
    tl.setItemType(item, "warning");
    assert.equal(item.getAttribute("data-type"), "warning");
    tl.destroy(); teardownDOM();
});

test("setItemType rejects invalid type", () => {
    const root = setup();
    const item = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item, { type: "success" });
    tl.setItemType(item, "nope");
    assert.equal(item.getAttribute("data-type"), "success");
    tl.destroy(); teardownDOM();
});

test("setItemType is no-op for unattached element", () => {
    const root = setup();
    const item = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.setItemType(item, "success");
    assert.equal(item.hasAttribute("data-type"), false);
    tl.destroy(); teardownDOM();
});

test("marker inside item gets aria-hidden", () => {
    const root = setup();
    const item = document.createElement("div");
    const marker = document.createElement("span");
    marker.setAttribute("data-timeline-marker", "");
    item.appendChild(marker);
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item);
    assert.equal(marker.getAttribute("aria-hidden"), "true");
    tl.destroy(); teardownDOM();
});

test("itemCount tracks attached items", () => {
    const root = setup();
    const i1 = document.createElement("div");
    const i2 = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    assert.equal(tl.itemCount, 0);
    const off1 = tl.attachItem(i1);
    tl.attachItem(i2);
    assert.equal(tl.itemCount, 2);
    off1();
    assert.equal(tl.itemCount, 1);
    tl.destroy(); teardownDOM();
});

test("destroy clears attrs + is idempotent", () => {
    const root = setup();
    const item = document.createElement("div");
    const tl = createTimeline({});
    tl.attachRoot(root);
    tl.attachItem(item, { type: "info" });
    tl.destroy(); tl.destroy();
    assert.equal(tl.destroyed, true);
    assert.equal(root.hasAttribute("data-timeline-root"), false);
    assert.equal(item.hasAttribute("data-timeline-item"), false);
    teardownDOM();
});
