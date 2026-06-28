// Tests: affix.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createAffix } from "../src/affix/index.js";

function setup() {
    setupDOM();
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const target = document.createElement("nav");
    parent.appendChild(target);
    return { parent, target };
}

test("attachRoot paints data-affix-root + inserts sentinel before target", () => {
    const { parent, target } = setup();
    const aff = createAffix({});
    aff.attachRoot(target);
    assert.equal(target.hasAttribute("data-affix-root"), true);
    const sentinel = parent.querySelector("[data-affix-sentinel]");
    assert.ok(sentinel);
    // Sentinel comes immediately before the target
    assert.equal(sentinel.nextElementSibling, target);
    // Decorative
    assert.equal(sentinel.getAttribute("aria-hidden"), "true");
    aff.destroy(); teardownDOM();
});

test("default offsetTop is 0", () => {
    setupDOM();
    const aff = createAffix({});
    assert.equal(aff.offsetTop(), 0);
    aff.destroy(); teardownDOM();
});

test("custom offsetTop is preserved", () => {
    setupDOM();
    const aff = createAffix({ offsetTop: 64 });
    assert.equal(aff.offsetTop(), 64);
    aff.destroy(); teardownDOM();
});

test("invalid offsetTop falls back to 0", () => {
    setupDOM();
    const aff1 = createAffix({ offsetTop: -10 });
    assert.equal(aff1.offsetTop(), 0);
    const aff2 = createAffix({ offsetTop: "nope" });
    assert.equal(aff2.offsetTop(), 0);
    aff1.destroy(); aff2.destroy(); teardownDOM();
});

test("isPinned starts false", () => {
    const { target } = setup();
    const aff = createAffix({});
    aff.attachRoot(target);
    assert.equal(aff.isPinned(), false);
    aff.destroy(); teardownDOM();
});

test("_setPinnedForTest paints data-pinned + fires onChange", () => {
    const { target } = setup();
    const events = [];
    const aff = createAffix({ onChange: (b) => events.push(b) });
    aff.attachRoot(target);
    aff._setPinnedForTest(true);
    assert.equal(aff.isPinned(), true);
    assert.equal(target.hasAttribute("data-pinned"), true);
    assert.deepEqual(events, [true]);
    aff._setPinnedForTest(false);
    assert.equal(target.hasAttribute("data-pinned"), false);
    assert.deepEqual(events, [true, false]);
    aff.destroy(); teardownDOM();
});

test("repeated setPinned with same value is a no-op (doesn't refire onChange)", () => {
    const { target } = setup();
    let count = 0;
    const aff = createAffix({ onChange: () => count++ });
    aff.attachRoot(target);
    aff._setPinnedForTest(true);
    aff._setPinnedForTest(true);
    aff._setPinnedForTest(true);
    assert.equal(count, 1);
    aff.destroy(); teardownDOM();
});

test("reattachRoot tears down the old sentinel before injecting a new one", () => {
    const { parent, target } = setup();
    const aff = createAffix({});
    aff.attachRoot(target);
    const target2 = document.createElement("nav");
    parent.appendChild(target2);
    aff.attachRoot(target2);
    // Should only be one sentinel in the document now (for target2)
    const sentinels = document.querySelectorAll("[data-affix-sentinel]");
    assert.equal(sentinels.length, 1);
    assert.equal(sentinels[0].nextElementSibling, target2);
    assert.equal(target.hasAttribute("data-affix-root"), false);
    aff.destroy(); teardownDOM();
});

test("destroy removes sentinel + clears attrs + is idempotent", () => {
    const { parent, target } = setup();
    const aff = createAffix({});
    aff.attachRoot(target);
    aff.destroy(); aff.destroy();
    assert.equal(aff.destroyed, true);
    assert.equal(target.hasAttribute("data-affix-root"), false);
    assert.equal(target.hasAttribute("data-pinned"), false);
    const sentinel = parent.querySelector("[data-affix-sentinel]");
    assert.equal(sentinel, null);
    teardownDOM();
});

test("off() returned by attachRoot removes sentinel + clears attrs", () => {
    const { parent, target } = setup();
    const aff = createAffix({});
    const off = aff.attachRoot(target);
    aff._setPinnedForTest(true);
    off();
    assert.equal(target.hasAttribute("data-affix-root"), false);
    assert.equal(target.hasAttribute("data-pinned"), false);
    assert.equal(parent.querySelector("[data-affix-sentinel]"), null);
    aff.destroy(); teardownDOM();
});
