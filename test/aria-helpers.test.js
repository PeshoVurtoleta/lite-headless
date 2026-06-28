// aria-helpers.test.js -- pins the v0.7.36 setAttr dirty-check contract
// and the new toggleAttr boolean-attribute helper. These helpers run in
// the hot path of every paint effect across the primitive set, so the
// dirty-check semantics must not silently regress.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { setAttr, toggleAttr } from "../src/_overlay/aria.js";

function mkEl() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// =====================================================================
// setAttr -- polymorphic value handling
// =====================================================================

test("setAttr: string value writes setAttribute when different", () => {
    setupDOM();
    const el = mkEl();
    setAttr(el, "aria-label", "Hello");
    assert.equal(el.getAttribute("aria-label"), "Hello");
    teardownDOM();
});

test("setAttr: true writes empty-string attribute", () => {
    setupDOM();
    const el = mkEl();
    setAttr(el, "data-flag", true);
    assert.equal(el.hasAttribute("data-flag"), true);
    assert.equal(el.getAttribute("data-flag"), "");
    teardownDOM();
});

test("setAttr: null/false/undefined remove the attribute", () => {
    setupDOM();
    const el = mkEl();
    el.setAttribute("aria-disabled", "true");
    setAttr(el, "aria-disabled", null);
    assert.equal(el.hasAttribute("aria-disabled"), false);
    el.setAttribute("aria-disabled", "true");
    setAttr(el, "aria-disabled", false);
    assert.equal(el.hasAttribute("aria-disabled"), false);
    el.setAttribute("aria-disabled", "true");
    setAttr(el, "aria-disabled", undefined);
    assert.equal(el.hasAttribute("aria-disabled"), false);
    teardownDOM();
});

test("setAttr: number values are stringified", () => {
    setupDOM();
    const el = mkEl();
    setAttr(el, "aria-valuenow", 42);
    assert.equal(el.getAttribute("aria-valuenow"), "42");
    teardownDOM();
});

// =====================================================================
// setAttr -- dirty-check contract (v0.7.36)
// =====================================================================

test("setAttr: repeated identical writes do NOT call setAttribute again", () => {
    setupDOM();
    const el = mkEl();
    let calls = 0;
    const orig = el.setAttribute.bind(el);
    el.setAttribute = function (n, v) { calls++; return orig(n, v); };
    setAttr(el, "aria-label", "X");      // write
    setAttr(el, "aria-label", "X");      // skip
    setAttr(el, "aria-label", "X");      // skip
    setAttr(el, "aria-label", "Y");      // write
    assert.equal(calls, 2);
    teardownDOM();
});

test("setAttr: repeated removes on absent attribute do NOT call removeAttribute again", () => {
    setupDOM();
    const el = mkEl();
    let calls = 0;
    const orig = el.removeAttribute.bind(el);
    el.removeAttribute = function (n) { calls++; return orig(n); };
    setAttr(el, "aria-flag", null);     // skip (not present)
    setAttr(el, "aria-flag", null);     // skip
    el.setAttribute("aria-flag", "");
    setAttr(el, "aria-flag", null);     // write (remove)
    setAttr(el, "aria-flag", null);     // skip (already absent)
    assert.equal(calls, 1);
    teardownDOM();
});

test("setAttr: same boolean-true write doesn't re-write empty string", () => {
    setupDOM();
    const el = mkEl();
    let calls = 0;
    const orig = el.setAttribute.bind(el);
    el.setAttribute = function (n, v) { calls++; return orig(n, v); };
    setAttr(el, "data-flag", true);     // write
    setAttr(el, "data-flag", true);     // skip
    setAttr(el, "data-flag", true);     // skip
    assert.equal(calls, 1);
    teardownDOM();
});

// =====================================================================
// toggleAttr (v0.7.36 new helper)
// =====================================================================

test("toggleAttr: on=true adds attribute when absent", () => {
    setupDOM();
    const el = mkEl();
    toggleAttr(el, "data-x", true);
    assert.equal(el.hasAttribute("data-x"), true);
    assert.equal(el.getAttribute("data-x"), "");
    teardownDOM();
});

test("toggleAttr: on=false removes attribute when present", () => {
    setupDOM();
    const el = mkEl();
    el.setAttribute("data-x", "");
    toggleAttr(el, "data-x", false);
    assert.equal(el.hasAttribute("data-x"), false);
    teardownDOM();
});

test("toggleAttr: idempotent when state already matches", () => {
    setupDOM();
    const el = mkEl();
    let setCalls = 0;
    let removeCalls = 0;
    const setOrig = el.setAttribute.bind(el);
    const removeOrig = el.removeAttribute.bind(el);
    el.setAttribute = function (n, v) { setCalls++; return setOrig(n, v); };
    el.removeAttribute = function (n) { removeCalls++; return removeOrig(n); };

    toggleAttr(el, "data-y", true);       // write (1 set)
    toggleAttr(el, "data-y", true);       // skip
    toggleAttr(el, "data-y", true);       // skip
    toggleAttr(el, "data-y", false);      // write (1 remove)
    toggleAttr(el, "data-y", false);      // skip
    toggleAttr(el, "data-y", false);      // skip

    assert.equal(setCalls, 1);
    assert.equal(removeCalls, 1);
    teardownDOM();
});

test("toggleAttr: truthy/falsy coercion (mirrors setAttr semantics for booleans only)", () => {
    setupDOM();
    const el = mkEl();
    // Callers pass booleans. JS truthiness is preserved.
    toggleAttr(el, "data-a", 1);          // truthy -> add
    assert.equal(el.hasAttribute("data-a"), true);
    toggleAttr(el, "data-a", 0);          // falsy -> remove
    assert.equal(el.hasAttribute("data-a"), false);
    toggleAttr(el, "data-a", "hi");       // truthy -> add
    assert.equal(el.hasAttribute("data-a"), true);
    toggleAttr(el, "data-a", "");         // falsy -> remove
    assert.equal(el.hasAttribute("data-a"), false);
    teardownDOM();
});
