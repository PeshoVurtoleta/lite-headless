// Tests: tour.
//
// Step registry, navigation, ARIA paint on targets + content,
// keyboard handling, and lifecycle.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createTour } from "../src/tour/index.js";

function mkDiv() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// ─── step registry ───────────────────────────────────────────────────

test("addStep returns the assigned id; generates one if not provided", () => {
    setupDOM();
    const tour = createTour();
    const id1 = tour.addStep({});
    const id2 = tour.addStep({ id: "named" });
    assert.equal(typeof id1, "string");
    assert.equal(id2, "named");
    assert.equal(tour.count(), 2);
    tour.destroy();
    teardownDOM();
});

test("addStep with duplicate id returns null", () => {
    setupDOM();
    const tour = createTour();
    tour.addStep({ id: "a" });
    const dup = tour.addStep({ id: "a" });
    assert.equal(dup, null);
    assert.equal(tour.count(), 1);
    tour.destroy();
    teardownDOM();
});

test("removeStep updates the index if active step removed", () => {
    setupDOM();
    const tour = createTour();
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.addStep({ id: "c" });
    tour.start();
    tour.next();
    assert.equal(tour.current(), 1);    // on "b"
    tour.removeStep("b");
    // Active step removed; should slide to the same index, which is now "c"
    assert.equal(tour.count(), 2);
    assert.equal(tour.currentStep().id, "c");
    tour.destroy();
    teardownDOM();
});

// ─── navigation ─────────────────────────────────────────────────────

test("start() moves to step 0; current()/isFirst()/isLast() reflect state", () => {
    setupDOM();
    const tour = createTour();
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.addStep({ id: "c" });
    assert.equal(tour.isActive(), false);
    assert.equal(tour.current(), -1);
    tour.start();
    assert.equal(tour.isActive(), true);
    assert.equal(tour.current(), 0);
    assert.equal(tour.isFirst(), true);
    assert.equal(tour.isLast(), false);
    tour.destroy();
    teardownDOM();
});

test("next() advances; past the last step calls finish + onComplete", () => {
    setupDOM();
    let completed = false;
    const tour = createTour({ onComplete: () => { completed = true; } });
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.start();
    tour.next();
    assert.equal(tour.currentStep().id, "b");
    tour.next();
    assert.equal(tour.isActive(), false);
    assert.equal(completed, true);
    tour.destroy();
    teardownDOM();
});

test("prev() at step 0 is a no-op (without loop)", () => {
    setupDOM();
    const tour = createTour();
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.start();
    tour.prev();
    assert.equal(tour.current(), 0);
    tour.destroy();
    teardownDOM();
});

test("prev() with loop=true wraps to last step", () => {
    setupDOM();
    const tour = createTour({ loop: true });
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.addStep({ id: "c" });
    tour.start();
    tour.prev();
    assert.equal(tour.currentStep().id, "c");
    tour.destroy();
    teardownDOM();
});

test("skip() fires onSkip with the index at skip time", () => {
    setupDOM();
    let skippedAt = null;
    const tour = createTour({ onSkip: (idx) => { skippedAt = idx; } });
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.start();
    tour.next();    // on b
    tour.skip();
    assert.equal(skippedAt, 1);
    assert.equal(tour.isActive(), false);
    tour.destroy();
    teardownDOM();
});

test("goTo by id and by index both work", () => {
    setupDOM();
    const tour = createTour();
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.addStep({ id: "c" });
    tour.start();
    tour.goTo("c");
    assert.equal(tour.currentStep().id, "c");
    tour.goTo(0);
    assert.equal(tour.currentStep().id, "a");
    // Out-of-bounds is a no-op
    tour.goTo(99);
    assert.equal(tour.currentStep().id, "a");
    tour.destroy();
    teardownDOM();
});

// ─── ARIA paint ──────────────────────────────────────────────────────

test("active target gets data-tour-target + aria-describedby", () => {
    setupDOM();
    const tour = createTour();
    const target = mkDiv();
    const content = mkDiv();
    content.id = "stepContent";
    tour.addStep({ id: "a", target });
    tour.attachStepContent("a", content);
    tour.start();
    assert.equal(target.hasAttribute("data-tour-target"), true);
    assert.equal(target.getAttribute("aria-describedby"), "stepContent");
    tour.destroy();
    teardownDOM();
});

test("step content is hidden by default; un-hidden only when active", () => {
    setupDOM();
    const tour = createTour();
    const ca = mkDiv();
    const cb = mkDiv();
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.attachStepContent("a", ca);
    tour.attachStepContent("b", cb);
    // Before start, both hidden
    assert.equal(ca.hasAttribute("hidden"), true);
    assert.equal(cb.hasAttribute("hidden"), true);
    tour.start();
    assert.equal(ca.hasAttribute("hidden"), false);
    assert.equal(cb.hasAttribute("hidden"), true);
    tour.next();
    assert.equal(ca.hasAttribute("hidden"), true);
    assert.equal(cb.hasAttribute("hidden"), false);
    tour.destroy();
    teardownDOM();
});

test("finish() clears data-tour-target paint on target", () => {
    setupDOM();
    const tour = createTour();
    const target = mkDiv();
    tour.addStep({ id: "a", target });
    tour.start();
    assert.equal(target.hasAttribute("data-tour-target"), true);
    tour.finish();
    assert.equal(target.hasAttribute("data-tour-target"), false);
    tour.destroy();
    teardownDOM();
});

// ─── onStepChange ────────────────────────────────────────────────────

test("onStepChange fires with index + step on every transition", () => {
    setupDOM();
    const calls = [];
    const tour = createTour({
        onStepChange: (idx, step) => { calls.push({ idx, id: step.id }); },
    });
    tour.addStep({ id: "a" });
    tour.addStep({ id: "b" });
    tour.start();
    tour.next();
    tour.prev();
    assert.deepEqual(calls.map(c => c.id), ["a", "b", "a"]);
    tour.destroy();
    teardownDOM();
});

// ─── attachRoot + destroy ────────────────────────────────────────────

test("attachRoot sets data-tour-root + paints data-tour-active during run", () => {
    setupDOM();
    const tour = createTour();
    const root = mkDiv();
    tour.addStep({ id: "a" });
    tour.attachRoot(root);
    assert.equal(root.getAttribute("data-tour-root"), "");
    assert.equal(root.hasAttribute("data-tour-active"), false);
    tour.start();
    assert.equal(root.getAttribute("data-tour-active"), "");
    tour.finish();
    assert.equal(root.hasAttribute("data-tour-active"), false);
    tour.destroy();
    teardownDOM();
});

test("destroy is idempotent + clears all paint", () => {
    setupDOM();
    const tour = createTour();
    const root = mkDiv();
    const target = mkDiv();
    tour.attachRoot(root);
    tour.addStep({ id: "a", target });
    tour.start();
    tour.destroy();
    tour.destroy();    // no throw
    assert.equal(tour.destroyed, true);
    assert.equal(root.hasAttribute("data-tour-root"), false);
    assert.equal(target.hasAttribute("data-tour-target"), false);
    teardownDOM();
});
