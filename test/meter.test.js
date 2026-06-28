// Tests: meter.
//
// role=meter ARIA semantics, value clamping, threshold-driven state,
// --meter custom property, fill attach.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createMeter } from "../src/meter/index.js";

function mkDiv() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// ─── ARIA paint ──────────────────────────────────────────────────────

test("attachRoot sets role=meter + valuemin/max/now", () => {
    setupDOM();
    const m = createMeter({ value: 0.42, min: 0, max: 1 });
    const el = mkDiv();
    m.attachRoot(el);
    assert.equal(el.getAttribute("role"), "meter");
    assert.equal(el.getAttribute("aria-valuemin"), "0");
    assert.equal(el.getAttribute("aria-valuemax"), "1");
    assert.equal(el.getAttribute("aria-valuenow"), "0.42");
    m.destroy();
    teardownDOM();
});

test("custom min/max are respected; --meter computed correctly", () => {
    setupDOM();
    const m = createMeter({ value: 75, min: 0, max: 100 });
    const el = mkDiv();
    m.attachRoot(el);
    assert.equal(el.style.getPropertyValue("--meter"), "0.75");
    assert.equal(el.getAttribute("aria-valuenow"), "75");
    assert.equal(el.getAttribute("aria-valuemax"), "100");
    m.destroy();
    teardownDOM();
});

test("label option paints aria-label only when not pre-set", () => {
    setupDOM();
    const el = mkDiv();
    const m = createMeter({ label: "Battery level" });
    m.attachRoot(el);
    assert.equal(el.getAttribute("aria-label"), "Battery level");
    m.destroy();
    // Pre-set aria-label is not overridden
    const el2 = mkDiv();
    el2.setAttribute("aria-label", "pre-existing");
    const m2 = createMeter({ label: "should not be used" });
    m2.attachRoot(el2);
    assert.equal(el2.getAttribute("aria-label"), "pre-existing");
    m2.destroy();
    teardownDOM();
});

// ─── value clamping ──────────────────────────────────────────────────

test("setValue clamps to [min..max]", () => {
    setupDOM();
    const m = createMeter({ value: 0, min: 0, max: 100 });
    const el = mkDiv();
    m.attachRoot(el);
    m.setValue(50);
    assert.equal(m.value(), 50);
    m.setValue(-10);
    assert.equal(m.value(), 0);
    m.setValue(999);
    assert.equal(m.value(), 100);
    m.destroy();
    teardownDOM();
});

test("setValue rejects non-numeric / NaN / Infinity", () => {
    setupDOM();
    const m = createMeter({ value: 50, min: 0, max: 100 });
    m.setValue("nope");
    m.setValue(NaN);
    m.setValue(Infinity);
    m.setValue(undefined);
    assert.equal(m.value(), 50);
    m.destroy();
    teardownDOM();
});

test("fraction() returns (value-min)/(max-min)", () => {
    setupDOM();
    const m = createMeter({ value: 60, min: 20, max: 120 });
    assert.equal(m.fraction(), 0.4);
    m.destroy();
    teardownDOM();
});

// ─── valueText ───────────────────────────────────────────────────────

test("valueText option paints aria-valuetext; setValueText updates it", () => {
    setupDOM();
    const m = createMeter({ value: 0.42, valueText: "42 percent" });
    const el = mkDiv();
    m.attachRoot(el);
    assert.equal(el.getAttribute("aria-valuetext"), "42 percent");
    m.setValueText("just under half");
    assert.equal(el.getAttribute("aria-valuetext"), "just under half");
    m.setValueText(null);
    assert.equal(el.hasAttribute("aria-valuetext"), false);
    m.destroy();
    teardownDOM();
});

// ─── thresholds + state ──────────────────────────────────────────────

test("no thresholds → state is always 'optimum'", () => {
    setupDOM();
    const m = createMeter({ value: 0.5, min: 0, max: 1 });
    assert.equal(m.state(), "optimum");
    m.setValue(0.9);
    assert.equal(m.state(), "optimum");
    m.destroy();
    teardownDOM();
});

test("low/high only (no explicit optimum): mid is optimum, lo/hi are sub-optimum", () => {
    setupDOM();
    const m = createMeter({ value: 0.5, min: 0, max: 1, low: 0.3, high: 0.7 });
    assert.equal(m.state(), "optimum");
    m.setValue(0.2);
    assert.equal(m.state(), "sub-optimum");
    m.setValue(0.9);
    assert.equal(m.state(), "sub-optimum");
    m.destroy();
    teardownDOM();
});

test("optimum below low: lo region is 'optimum'", () => {
    setupDOM();
    const m = createMeter({ value: 0.1, min: 0, max: 1, low: 0.3, high: 0.7, optimum: 0.15 });
    assert.equal(m.state(), "optimum");
    m.setValue(0.5);
    assert.equal(m.state(), "sub-optimum");
    m.setValue(0.9);
    assert.equal(m.state(), "low");
    m.destroy();
    teardownDOM();
});

test("state is painted as data-state on root", () => {
    setupDOM();
    const m = createMeter({ value: 0.5, min: 0, max: 1, low: 0.3, high: 0.7 });
    const el = mkDiv();
    m.attachRoot(el);
    assert.equal(el.getAttribute("data-zone"), "optimum");
    m.setValue(0.1);
    assert.equal(el.getAttribute("data-zone"), "sub-optimum");
    m.destroy();
    teardownDOM();
});

// ─── attachFill ──────────────────────────────────────────────────────

test("attachFill marks data-meter-fill + paints --meter + data-state", () => {
    setupDOM();
    const m = createMeter({ value: 30, min: 0, max: 100, low: 25, high: 75 });
    const root = mkDiv();
    const fill = mkDiv();
    m.attachRoot(root);
    m.attachFill(fill);
    assert.equal(fill.hasAttribute("data-meter-fill"), true);
    assert.equal(fill.style.getPropertyValue("--meter"), "0.3");
    assert.equal(fill.getAttribute("data-zone"), "optimum");
    m.setValue(80);
    assert.equal(fill.style.getPropertyValue("--meter"), "0.8");
    assert.equal(fill.getAttribute("data-zone"), "sub-optimum");
    m.destroy();
    teardownDOM();
});

// ─── lifecycle ───────────────────────────────────────────────────────

test("constructor rejects max <= min", () => {
    assert.throws(() => createMeter({ min: 5, max: 5 }));
    assert.throws(() => createMeter({ min: 10, max: 0 }));
});

test("destroy is idempotent + clears root attrs", () => {
    setupDOM();
    const m = createMeter({ value: 0.5 });
    const el = mkDiv();
    m.attachRoot(el);
    m.destroy();
    m.destroy();    // no throw
    assert.equal(m.destroyed, true);
    assert.equal(el.hasAttribute("role"), false);
    assert.equal(el.hasAttribute("data-meter-root"), false);
    assert.equal(el.style.getPropertyValue("--meter"), "");
    teardownDOM();
});
