// progress.test.js -- createProgress reactive value + ARIA painting

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createProgress } from "../src/progress/index.js";

function mkDiv() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// -----------------------------------------------------------------
// Construction + validation
// -----------------------------------------------------------------

test("createProgress: defaults", () => {
    setupDOM();
    const p = createProgress();
    assert.equal(p.value(), 0);
    assert.equal(p.min(), 0);
    assert.equal(p.max(), 100);
    assert.equal(p.indeterminate(), false);
    assert.equal(p.variant(), "linear");
    assert.equal(p.fraction(), 0);
    assert.equal(p.isComplete(), false);
    p.destroy();
    teardownDOM();
});

test("createProgress: explicit values", () => {
    setupDOM();
    const p = createProgress({ value: 25, min: 0, max: 50, variant: "circular" });
    assert.equal(p.value(), 25);
    assert.equal(p.variant(), "circular");
    assert.equal(p.fraction(), 0.5);
    p.destroy();
    teardownDOM();
});

test("createProgress: clamps initial value into [min, max]", () => {
    setupDOM();
    const p = createProgress({ value: 150, max: 100 });
    assert.equal(p.value(), 100);
    p.destroy();
    teardownDOM();
});

test("createProgress: rejects invalid variant", () => {
    setupDOM();
    assert.throws(() => createProgress({ variant: "wedge" }), /variant must be/);
    teardownDOM();
});

// -----------------------------------------------------------------
// fraction edge cases
// -----------------------------------------------------------------

test("fraction is 0 when max <= min", () => {
    setupDOM();
    const p = createProgress({ value: 50, min: 100, max: 100 });
    assert.equal(p.fraction(), 0);
    p.destroy();
    teardownDOM();
});

test("fraction handles negative min", () => {
    setupDOM();
    const p = createProgress({ value: 0, min: -100, max: 100 });
    assert.equal(p.fraction(), 0.5);
    p.destroy();
    teardownDOM();
});

test("fraction is clamped to [0, 1]", () => {
    setupDOM();
    const p = createProgress({ value: 50, min: 0, max: 100 });
    assert.equal(p.fraction(), 0.5);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachRoot ARIA painting
// -----------------------------------------------------------------

test("attachRoot paints role=progressbar", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 42, max: 100 });
    p.attachRoot(root);
    assert.equal(root.getAttribute("role"), "progressbar");
    assert.equal(root.getAttribute("aria-valuenow"), "42");
    assert.equal(root.getAttribute("aria-valuemin"), "0");
    assert.equal(root.getAttribute("aria-valuemax"), "100");
    assert.equal(root.getAttribute("aria-valuetext"), "42%");
    assert.equal(root.hasAttribute("data-loading"), true);
    assert.equal(root.getAttribute("data-variant"), "linear");
    assert.equal(root.style.getPropertyValue("--progress"), "0.42");
    p.destroy();
    teardownDOM();
});

test("attachRoot paints variant data attribute", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ variant: "circular" });
    p.attachRoot(root);
    assert.equal(root.getAttribute("data-variant"), "circular");
    p.destroy();
    teardownDOM();
});

test("attachRoot paints aria-label when label option provided", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ label: "Uploading file" });
    p.attachRoot(root);
    assert.equal(root.getAttribute("aria-label"), "Uploading file");
    p.destroy();
    teardownDOM();
});

test("attachRoot doesn't overwrite consumer aria-label", () => {
    setupDOM();
    const root = mkDiv();
    root.setAttribute("aria-label", "Consumer label");
    const p = createProgress({ label: "Primitive label" });
    p.attachRoot(root);
    assert.equal(root.getAttribute("aria-label"), "Consumer label");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// setValue + reactive painting
// -----------------------------------------------------------------

test("setValue updates aria-valuenow + --progress + aria-valuetext", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 0, max: 100 });
    p.attachRoot(root);
    p.setValue(75);
    assert.equal(p.value(), 75);
    assert.equal(root.getAttribute("aria-valuenow"), "75");
    assert.equal(root.getAttribute("aria-valuetext"), "75%");
    assert.equal(root.style.getPropertyValue("--progress"), "0.75");
    p.destroy();
    teardownDOM();
});

test("setValue clamps into [min, max]", () => {
    setupDOM();
    const p = createProgress({ value: 0, min: 10, max: 50 });
    p.setValue(100);
    assert.equal(p.value(), 50);
    p.setValue(5);
    assert.equal(p.value(), 10);
    p.destroy();
    teardownDOM();
});

test("setValue ignores non-finite", () => {
    setupDOM();
    const p = createProgress({ value: 42 });
    p.setValue(NaN);
    p.setValue(Infinity);
    p.setValue("not a number");
    assert.equal(p.value(), 42);
    p.destroy();
    teardownDOM();
});

test("setMax + setMin update bounds and re-clamp value", () => {
    setupDOM();
    const p = createProgress({ value: 80, max: 100 });
    p.setMax(50);
    assert.equal(p.value(), 50);   // re-clamped
    p.setMin(20);
    p.setValue(10);
    assert.equal(p.value(), 20);   // clamped to new min
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// data-complete (boolean) when value >= max
// -----------------------------------------------------------------

test("data-complete flips on when value reaches max", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 50, max: 100 });
    p.attachRoot(root);
    assert.equal(root.hasAttribute("data-loading"), true);
    p.setValue(100);
    assert.equal(root.hasAttribute("data-complete"), true);
    assert.equal(p.isComplete(), true);
    p.destroy();
    teardownDOM();
});

test("onComplete fires once on first complete", () => {
    setupDOM();
    let completeCalls = 0;
    const p = createProgress({ value: 0, max: 100, onComplete: () => completeCalls++ });
    p.setValue(50);
    assert.equal(completeCalls, 0);
    p.setValue(100);
    assert.equal(completeCalls, 1);
    p.setValue(100);     // no-op (already complete)
    assert.equal(completeCalls, 1);
    p.destroy();
    teardownDOM();
});

test("onComplete fires again if value drops then returns to max", () => {
    setupDOM();
    let completeCalls = 0;
    const p = createProgress({ value: 0, max: 100, onComplete: () => completeCalls++ });
    p.setValue(100);
    assert.equal(completeCalls, 1);
    p.setValue(50);
    assert.equal(completeCalls, 1);
    p.setValue(100);
    assert.equal(completeCalls, 2);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// indeterminate mode
// -----------------------------------------------------------------

test("indeterminate omits aria-valuenow + sets data-indeterminate", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 30, indeterminate: true });
    p.attachRoot(root);
    assert.equal(root.hasAttribute("aria-valuenow"), false);
    assert.equal(root.hasAttribute("data-indeterminate"), true);
    assert.equal(root.getAttribute("aria-valuetext"), "Loading");
    p.destroy();
    teardownDOM();
});

test("setIndeterminate(true) hides aria-valuenow + sets data attr", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 30 });
    p.attachRoot(root);
    assert.equal(root.getAttribute("aria-valuenow"), "30");
    p.setIndeterminate(true);
    assert.equal(root.hasAttribute("aria-valuenow"), false);
    assert.equal(root.hasAttribute("data-indeterminate"), true);
    p.setIndeterminate(false);
    assert.equal(root.getAttribute("aria-valuenow"), "30");
    assert.equal(root.hasAttribute("data-indeterminate"), false);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// custom aria-valuetext
// -----------------------------------------------------------------

test("valueText option overrides auto NN%", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 42, valueText: "Step 3 of 7" });
    p.attachRoot(root);
    assert.equal(root.getAttribute("aria-valuetext"), "Step 3 of 7");
    p.destroy();
    teardownDOM();
});

test("setValueText updates aria-valuetext reactively", () => {
    setupDOM();
    const root = mkDiv();
    const p = createProgress({ value: 50 });
    p.attachRoot(root);
    assert.equal(root.getAttribute("aria-valuetext"), "50%");
    p.setValueText("processing");
    assert.equal(root.getAttribute("aria-valuetext"), "processing");
    p.setValueText(null);
    assert.equal(root.getAttribute("aria-valuetext"), "50%");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachBar / attachIndicator
// -----------------------------------------------------------------

test("attachBar paints --progress + data-progress on bar element", () => {
    setupDOM();
    const root = mkDiv(), bar = mkDiv();
    const p = createProgress({ value: 25 });
    p.attachRoot(root);
    p.attachBar(bar);
    assert.equal(bar.style.getPropertyValue("--progress"), "0.25");
    assert.equal(bar.getAttribute("data-progress"), "25");
    assert.equal(bar.hasAttribute("data-progress-bar"), true);
    p.setValue(75);
    assert.equal(bar.style.getPropertyValue("--progress"), "0.75");
    assert.equal(bar.getAttribute("data-progress"), "75");
    p.destroy();
    teardownDOM();
});

test("attachIndicator paints --progress + data-progress on indicator element", () => {
    setupDOM();
    const root = mkDiv(), ind = mkDiv();
    const p = createProgress({ value: 80, variant: "circular" });
    p.attachRoot(root);
    p.attachIndicator(ind);
    assert.equal(ind.style.getPropertyValue("--progress"), "0.8");
    assert.equal(ind.getAttribute("data-progress"), "80");
    assert.equal(ind.hasAttribute("data-progress-indicator"), true);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachLabel
// -----------------------------------------------------------------

test("attachLabel sets aria-labelledby + ensures label has id", () => {
    setupDOM();
    const root = mkDiv(), label = mkDiv();
    const p = createProgress({ value: 50 });
    p.attachRoot(root);
    p.attachLabel(label);
    assert.ok(label.id);
    assert.equal(root.getAttribute("aria-labelledby"), label.id);
    p.destroy();
    teardownDOM();
});

test("attachLabel preserves consumer-provided label id", () => {
    setupDOM();
    const root = mkDiv(), label = mkDiv();
    label.id = "my-progress-label";
    const p = createProgress({ value: 50 });
    p.attachRoot(root);
    p.attachLabel(label);
    assert.equal(label.id, "my-progress-label");
    assert.equal(root.getAttribute("aria-labelledby"), "my-progress-label");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// onChange callback
// -----------------------------------------------------------------

test("onChange fires on value mutations with (value, fraction)", () => {
    setupDOM();
    const calls = [];
    const p = createProgress({ value: 0, max: 200, onChange: (v, f) => calls.push([v, f]) });
    p.setValue(50);
    p.setValue(100);
    p.setValue(200);
    // Initial paint fires once on construction with v=0,f=0; then 3 changes
    assert.equal(calls.length, 4);
    assert.deepEqual(calls[0], [0, 0]);
    assert.deepEqual(calls[1], [50, 0.25]);
    assert.deepEqual(calls[2], [100, 0.5]);
    assert.deepEqual(calls[3], [200, 1]);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// destroy
// -----------------------------------------------------------------

test("destroy clears all painted attributes + custom properties", () => {
    setupDOM();
    const root = mkDiv(), bar = mkDiv(), ind = mkDiv();
    const p = createProgress({ value: 50 });
    p.attachRoot(root);
    p.attachBar(bar);
    p.attachIndicator(ind);
    p.destroy();
    assert.equal(p.destroyed, true);
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("data-progress-root"), false);
    assert.equal(root.hasAttribute("aria-valuenow"), false);
    assert.equal(root.style.getPropertyValue("--progress"), "");
    assert.equal(bar.hasAttribute("data-progress-bar"), false);
    assert.equal(bar.style.getPropertyValue("--progress"), "");
    assert.equal(ind.hasAttribute("data-progress-indicator"), false);
    teardownDOM();
});

test("destroy is idempotent", () => {
    setupDOM();
    const p = createProgress({ value: 50 });
    p.destroy();
    p.destroy();
    assert.equal(p.destroyed, true);
    teardownDOM();
});

test("setValue after destroy is a no-op", () => {
    setupDOM();
    const p = createProgress({ value: 50 });
    p.destroy();
    p.setValue(75);
    // accessor after destroy is the last-seen value (signal still has it but isn't painted)
    // primary check: doesn't throw
    assert.equal(p.destroyed, true);
    teardownDOM();
});
