// boundary-walk.test.js
// v0.7 boundary: "clipping" walks the nearest scroll/overflow ancestor
// instead of mapping to the viewport.
//
// happy-dom: getComputedStyle reads from inline el.style.* and supports the
// position/overflow properties we test against. getBoundingClientRect returns
// zeros for unstyled elements -- which is why resolveBoundary's clipping
// branch intersects with viewport and falls back to viewport on a zero rect.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { findClippingAncestor } from "../src/_overlay/position.js";

test("findClippingAncestor walks up to the nearest overflow:auto ancestor", () => {
    setupDOM();
    const outer = document.createElement("div");
    const card = document.createElement("div");
    card.style.overflow = "auto";
    const inner = document.createElement("div");
    const anchor = document.createElement("button");
    outer.appendChild(card);
    card.appendChild(inner);
    inner.appendChild(anchor);
    document.body.appendChild(outer);

    const found = findClippingAncestor(anchor);
    assert.equal(found, card, "found the overflow:auto card");
    teardownDOM();
});

test("walks past plain ancestors to the FIRST clipping one", () => {
    setupDOM();
    const grandparent = document.createElement("div");
    grandparent.style.overflow = "hidden";
    const parent = document.createElement("div");
    const child = document.createElement("div");
    const anchor = document.createElement("button");
    grandparent.appendChild(parent);
    parent.appendChild(child);
    child.appendChild(anchor);
    document.body.appendChild(grandparent);

    const found = findClippingAncestor(anchor);
    assert.equal(found, grandparent, "skipped non-clipping parents");
    teardownDOM();
});

test("returns the INNERMOST clipping ancestor (closer wins)", () => {
    setupDOM();
    const outerClip = document.createElement("div");
    outerClip.style.overflow = "hidden";
    const innerClip = document.createElement("div");
    innerClip.style.overflow = "auto";
    const anchor = document.createElement("button");
    outerClip.appendChild(innerClip);
    innerClip.appendChild(anchor);
    document.body.appendChild(outerClip);

    const found = findClippingAncestor(anchor);
    assert.equal(found, innerClip, "innermost (closer) clipper wins");
    teardownDOM();
});

test("overflow-x: scroll alone qualifies an ancestor as clipping", () => {
    setupDOM();
    const scroller = document.createElement("div");
    scroller.style.overflowX = "scroll";
    const anchor = document.createElement("button");
    scroller.appendChild(anchor);
    document.body.appendChild(scroller);
    assert.equal(findClippingAncestor(anchor), scroller);
    teardownDOM();
});

test("overflow-y: hidden alone qualifies an ancestor as clipping", () => {
    setupDOM();
    const scroller = document.createElement("div");
    scroller.style.overflowY = "hidden";
    const anchor = document.createElement("button");
    scroller.appendChild(anchor);
    document.body.appendChild(scroller);
    assert.equal(findClippingAncestor(anchor), scroller);
    teardownDOM();
});

test("position:fixed ancestor breaks the walk (returns null = viewport)", () => {
    setupDOM();
    const clipping = document.createElement("div");
    clipping.style.overflow = "hidden";
    const fixed = document.createElement("div");
    fixed.style.position = "fixed";
    const anchor = document.createElement("button");
    clipping.appendChild(fixed);
    fixed.appendChild(anchor);
    document.body.appendChild(clipping);

    const found = findClippingAncestor(anchor);
    assert.equal(found, null, "fixed-positioned ancestor breaks the walk");
    teardownDOM();
});

test("position:sticky also breaks the walk", () => {
    setupDOM();
    const clipping = document.createElement("div");
    clipping.style.overflow = "hidden";
    const sticky = document.createElement("div");
    sticky.style.position = "sticky";
    const anchor = document.createElement("button");
    clipping.appendChild(sticky);
    sticky.appendChild(anchor);
    document.body.appendChild(clipping);

    assert.equal(findClippingAncestor(anchor), null);
    teardownDOM();
});

test("no clipping ancestor anywhere returns null (viewport fallback)", () => {
    setupDOM();
    const a = document.createElement("div");
    const b = document.createElement("div");
    const anchor = document.createElement("button");
    a.appendChild(b);
    b.appendChild(anchor);
    document.body.appendChild(a);

    assert.equal(findClippingAncestor(anchor), null);
    teardownDOM();
});

test("anchor with no parent returns null safely", () => {
    setupDOM();
    const detached = document.createElement("button");
    assert.equal(findClippingAncestor(detached), null);
    teardownDOM();
});

test("null/undefined anchor returns null safely (SSR-safe)", () => {
    setupDOM();
    assert.equal(findClippingAncestor(null), null);
    assert.equal(findClippingAncestor(undefined), null);
    teardownDOM();
});

test("popover constructed with boundary:'clipping' positions without crashing", async () => {
    setupDOM();
    const { createPopover } = await import("../src/popover/index.js");
    const card = document.createElement("div");
    card.style.overflow = "auto";
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    card.appendChild(trigger);
    document.body.append(card, content);

    const pop = createPopover({ boundary: "clipping", container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    pop.setOpen(true, "api");

    // primary assertion: no throw + content gets positioned
    assert.equal(pop.open(), true);
    assert.equal(content.style.position, "fixed");
    pop.destroy();
    teardownDOM();
});
