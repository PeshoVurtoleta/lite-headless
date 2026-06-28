// Tests: backtop.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createBackTop } from "../src/backtop/index.js";

function setup() {
    setupDOM();
    // Provide a fake scroll container (window in linkedom may not have scroll)
    const c = document.createElement("div");
    Object.defineProperty(c, "scrollTop", { value: 0, writable: true, configurable: true });
    c.scrollTo = function (o) {
        // Simulate scroll: clamp top to 0
        if (typeof o === "object" && o !== null) this.scrollTop = o.top ?? 0;
    };
    document.body.appendChild(c);
    return c;
}

function mkBtn() {
    const b = document.createElement("button");
    document.body.appendChild(b);
    return b;
}

// Simulate a scroll event on a target
function dispatchScroll(target) {
    if (!target.dispatchEvent) return;
    target.dispatchEvent(new window.Event("scroll", { bubbles: false }));
}

test("createBackTop has the documented API", () => {
    setupDOM();
    const bt = createBackTop({});
    assert.equal(typeof bt.isVisible, "function");
    assert.equal(typeof bt.threshold, "function");
    assert.equal(typeof bt.attachTarget, "function");
    assert.equal(typeof bt.attachButton, "function");
    assert.equal(typeof bt.scrollToTop, "function");
    assert.equal(typeof bt.destroy, "function");
    bt.destroy();
    teardownDOM();
});

test("default threshold is 200", () => {
    setupDOM();
    const bt = createBackTop({});
    assert.equal(bt.threshold(), 200);
    bt.destroy(); teardownDOM();
});

test("custom threshold is respected", () => {
    setupDOM();
    const bt = createBackTop({ threshold: 500 });
    assert.equal(bt.threshold(), 500);
    bt.destroy(); teardownDOM();
});

test("invalid threshold falls back to 200", () => {
    setupDOM();
    const bt1 = createBackTop({ threshold: -1 });
    assert.equal(bt1.threshold(), 200);
    const bt2 = createBackTop({ threshold: "nope" });
    assert.equal(bt2.threshold(), 200);
    bt1.destroy(); bt2.destroy(); teardownDOM();
});

test("smooth defaults to true; false is honored", () => {
    setupDOM();
    const bt1 = createBackTop({});
    assert.equal(bt1.smooth, true);
    const bt2 = createBackTop({ smooth: false });
    assert.equal(bt2.smooth, false);
    bt1.destroy(); bt2.destroy(); teardownDOM();
});

test("attachButton paints data-backtop + aria-label + initial hidden", () => {
    const c = setup();
    const btn = mkBtn();
    const bt = createBackTop({});
    bt.attachTarget(c);
    bt.attachButton(btn);
    assert.equal(btn.hasAttribute("data-backtop"), true);
    assert.equal(btn.getAttribute("aria-label"), "Back to top");
    // c.scrollTop is 0 → not visible → hidden
    assert.equal(btn.hasAttribute("hidden"), true);
    bt.destroy(); teardownDOM();
});

test("pre-set aria-label is preserved", () => {
    const c = setup();
    const btn = mkBtn();
    btn.setAttribute("aria-label", "Custom label");
    const bt = createBackTop({});
    bt.attachTarget(c);
    bt.attachButton(btn);
    assert.equal(btn.getAttribute("aria-label"), "Custom label");
    bt.destroy(); teardownDOM();
});

test("scrolling past threshold paints data-visible + removes hidden", async () => {
    const c = setup();
    const btn = mkBtn();
    const bt = createBackTop({ threshold: 100 });
    bt.attachTarget(c);
    bt.attachButton(btn);
    c.scrollTop = 150;
    dispatchScroll(c);
    // Wait one frame for rAF-throttled check
    await new Promise(r => setTimeout(r, 30));
    assert.equal(bt.isVisible(), true);
    assert.equal(btn.hasAttribute("data-visible"), true);
    assert.equal(btn.hasAttribute("hidden"), false);
    bt.destroy(); teardownDOM();
});

test("scrolling back below threshold hides again", async () => {
    const c = setup();
    const btn = mkBtn();
    const bt = createBackTop({ threshold: 100 });
    bt.attachTarget(c);
    bt.attachButton(btn);
    c.scrollTop = 150;
    dispatchScroll(c);
    await new Promise(r => setTimeout(r, 30));
    c.scrollTop = 50;
    dispatchScroll(c);
    await new Promise(r => setTimeout(r, 30));
    assert.equal(bt.isVisible(), false);
    assert.equal(btn.hasAttribute("hidden"), true);
    bt.destroy(); teardownDOM();
});

test("clicking button triggers scrollToTop + fires onActivate", () => {
    const c = setup();
    const btn = mkBtn();
    let activated = null;
    const bt = createBackTop({ onActivate: (r) => { activated = r; } });
    bt.attachTarget(c);
    bt.attachButton(btn);
    c.scrollTop = 500;
    btn.click();
    assert.equal(c.scrollTop, 0);  // our mock scrollTo sets scrollTop directly
    assert.equal(activated, "click");
    bt.destroy(); teardownDOM();
});

test("scrollToTop API: programmatic invocation", () => {
    const c = setup();
    const bt = createBackTop({});
    bt.attachTarget(c);
    c.scrollTop = 800;
    bt.scrollToTop("api");
    assert.equal(c.scrollTop, 0);
    bt.destroy(); teardownDOM();
});

test("destroy is idempotent + cleans attributes", () => {
    const c = setup();
    const btn = mkBtn();
    const bt = createBackTop({});
    bt.attachTarget(c);
    bt.attachButton(btn);
    bt.destroy(); bt.destroy();
    assert.equal(bt.destroyed, true);
    assert.equal(btn.hasAttribute("data-backtop"), false);
    assert.equal(btn.hasAttribute("data-visible"), false);
    teardownDOM();
});

test("destroy: scrolling after destroy is a no-op (no errors thrown)", async () => {
    const c = setup();
    const btn = mkBtn();
    const bt = createBackTop({ threshold: 50 });
    bt.attachTarget(c);
    bt.attachButton(btn);
    bt.destroy();
    c.scrollTop = 100;
    dispatchScroll(c);  // listener was removed, this should be silent
    await new Promise(r => setTimeout(r, 30));
    assert.equal(bt.destroyed, true);
    teardownDOM();
});
