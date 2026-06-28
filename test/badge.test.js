// Tests: badge.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createBadge } from "../src/badge/index.js";

function mk() {
    setupDOM();
    const el = document.createElement("span");
    document.body.appendChild(el);
    return el;
}

test("attachRoot paints data-badge-root + default intent + data-count='0'", () => {
    const el = mk();
    const b = createBadge({});
    b.attachRoot(el);
    assert.equal(el.hasAttribute("data-badge-root"), true);
    assert.equal(el.getAttribute("data-intent"), "default");
    // count===0 and showZero===false → hidden
    assert.equal(el.hasAttribute("hidden"), true);
    assert.equal(el.hasAttribute("data-hidden"), true);
    b.destroy(); teardownDOM();
});

test("showZero: true keeps badge visible at count=0", () => {
    const el = mk();
    const b = createBadge({ showZero: true });
    b.attachRoot(el);
    assert.equal(el.hasAttribute("hidden"), false);
    assert.equal(el.getAttribute("data-count"), "0");
    b.destroy(); teardownDOM();
});

test("setCount updates data-count + auto-shows when > 0", () => {
    const el = mk();
    const b = createBadge({});
    b.attachRoot(el);
    b.setCount(3);
    assert.equal(b.count(), 3);
    assert.equal(el.getAttribute("data-count"), "3");
    assert.equal(el.hasAttribute("hidden"), false);
    b.destroy(); teardownDOM();
});

test("count > max paints '<max>+'", () => {
    const el = mk();
    const b = createBadge({ count: 105, max: 99 });
    b.attachRoot(el);
    assert.equal(el.getAttribute("data-count"), "99+");
    assert.equal(b.displayed(), "99+");
    b.destroy(); teardownDOM();
});

test("custom max: count > max paints '<max>+'", () => {
    const el = mk();
    const b = createBadge({ count: 11, max: 9 });
    b.attachRoot(el);
    assert.equal(el.getAttribute("data-count"), "9+");
    b.destroy(); teardownDOM();
});

test("count goes back to 0 -> hidden again", () => {
    const el = mk();
    const b = createBadge({ count: 3 });
    b.attachRoot(el);
    assert.equal(el.hasAttribute("hidden"), false);
    b.setCount(0);
    assert.equal(el.hasAttribute("hidden"), true);
    b.destroy(); teardownDOM();
});

test("increment / decrement / reset", () => {
    const el = mk();
    const b = createBadge({ count: 5 });
    b.attachRoot(el);
    b.increment();
    assert.equal(b.count(), 6);
    b.decrement(2);
    assert.equal(b.count(), 4);
    b.reset();
    assert.equal(b.count(), 0);
    b.destroy(); teardownDOM();
});

test("setCount clamps to 0 (no negatives)", () => {
    const el = mk();
    const b = createBadge({ count: 2 });
    b.attachRoot(el);
    b.decrement(10);
    assert.equal(b.count(), 0);
    b.destroy(); teardownDOM();
});

test("setCount rejects non-numeric", () => {
    const el = mk();
    const b = createBadge({ count: 5 });
    b.attachRoot(el);
    b.setCount("nope");
    b.setCount(NaN);
    b.setCount(Infinity);
    assert.equal(b.count(), 5);
    b.destroy(); teardownDOM();
});

test("dot mode: paints data-dot, no data-count, aria-label='Indicator'", () => {
    const el = mk();
    const b = createBadge({ dot: true, intent: "success" });
    b.attachRoot(el);
    assert.equal(el.hasAttribute("data-dot"), true);
    assert.equal(el.hasAttribute("data-count"), false);
    assert.equal(el.getAttribute("aria-label"), "Indicator");
    b.destroy(); teardownDOM();
});

test("dot mode: count=0 does NOT hide (dot is always visible)", () => {
    const el = mk();
    const b = createBadge({ dot: true });
    b.attachRoot(el);
    assert.equal(el.hasAttribute("hidden"), false);
    b.destroy(); teardownDOM();
});

test("aria-label auto-generated singular/plural", () => {
    const el = mk();
    const b = createBadge({ count: 1 });
    b.attachRoot(el);
    assert.equal(el.getAttribute("aria-label"), "1 item");
    b.setCount(5);
    assert.equal(el.getAttribute("aria-label"), "5 items");
    b.destroy(); teardownDOM();
});

test("pre-set aria-label is preserved (not overwritten)", () => {
    const el = mk();
    el.setAttribute("aria-label", "custom");
    const b = createBadge({ count: 3 });
    b.attachRoot(el);
    assert.equal(el.getAttribute("aria-label"), "custom");
    b.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", () => {
    const el = mk();
    const b = createBadge({ count: 5, intent: "primary" });
    b.attachRoot(el);
    b.destroy(); b.destroy();
    assert.equal(b.destroyed, true);
    assert.equal(el.hasAttribute("data-badge-root"), false);
    assert.equal(el.hasAttribute("data-count"), false);
    teardownDOM();
});
