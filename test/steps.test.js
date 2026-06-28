// steps.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createSteps } from "../src/steps/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

function basicSteps() {
    return createSteps({
        steps: [
            { id: "account", title: "Account" },
            { id: "billing", title: "Billing" },
            { id: "review",  title: "Review" },
            { id: "done",    title: "Done" },
        ],
    });
}

// =====================================================================
// State + queries
// =====================================================================

test("defaults to current=0 + first step active", () => {
    setupDOM();
    const s = basicSteps();
    assert.equal(s.current(), 0);
    assert.equal(s.currentStep().id, "account");
    assert.equal(s.statusOf("account"), "current");
    assert.equal(s.statusOf("billing"), "pending");
    s.destroy();
    teardownDOM();
});

test("defaultCurrent honors index", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 1,
    });
    assert.equal(s.current(), 1);
    assert.equal(s.statusOf("a"), "complete");
    assert.equal(s.statusOf("b"), "current");
    assert.equal(s.statusOf("c"), "pending");
    s.destroy();
    teardownDOM();
});

test("empty steps -> current=-1", () => {
    setupDOM();
    const s = createSteps();
    assert.equal(s.current(), -1);
    assert.equal(s.currentStep(), null);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// next / prev navigation
// =====================================================================

test("next advances + fires onStepChange", () => {
    setupDOM();
    let last = null;
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        onStepChange: (next, prev, reason) => { last = { next, prev, reason }; },
    });
    s.next();
    assert.equal(s.current(), 1);
    assert.equal(last.next, 1);
    assert.equal(last.prev, 0);
    assert.equal(last.reason, "next");
    s.destroy();
    teardownDOM();
});

test("prev retreats", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 2,
    });
    s.prev();
    assert.equal(s.current(), 1);
    s.destroy();
    teardownDOM();
});

test("next past last step lands on length (isComplete=true) + fires onComplete", () => {
    setupDOM();
    let completeFired = 0;
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }],
        defaultCurrent: 1,
        onComplete: () => { completeFired++; },
    });
    assert.equal(s.isComplete(), false);
    s.next();   // current goes to 2 == length
    assert.equal(s.current(), 2);
    assert.equal(s.isComplete(), true);
    assert.equal(completeFired, 1);
    // Next on a complete steps is a no-op
    s.next();
    assert.equal(completeFired, 1);
    s.destroy();
    teardownDOM();
});

test("prev on first step is no-op", () => {
    setupDOM();
    let fires = 0;
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }],
        onStepChange: () => { fires++; },
    });
    s.prev();
    assert.equal(s.current(), 0);
    assert.equal(fires, 0);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// Error status overrides
// =====================================================================

test("setStepStatus 'error' overrides default status", () => {
    setupDOM();
    const s = basicSteps();
    // 'account' is current; mark it error
    s.setStepStatus("account", "error");
    assert.equal(s.statusOf("account"), "error");
    // Clear with null
    s.setStepStatus("account", null);
    assert.equal(s.statusOf("account"), "current");
    s.destroy();
    teardownDOM();
});

test("setStepStatus on an earlier (complete) step marks it as error", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 2,
    });
    assert.equal(s.statusOf("a"), "complete");
    s.setStepStatus("a", "error");
    assert.equal(s.statusOf("a"), "error");
    s.destroy();
    teardownDOM();
});

test("clearAllErrors removes every error override at once", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 1,
    });
    s.setStepStatus("a", "error");
    s.setStepStatus("c", "error");
    assert.equal(s.statusOf("a"), "error");
    assert.equal(s.statusOf("c"), "error");
    s.clearAllErrors();
    assert.equal(s.statusOf("a"), "complete");
    assert.equal(s.statusOf("b"), "current");
    assert.equal(s.statusOf("c"), "pending");
    s.destroy();
    teardownDOM();
});

test("clearAllErrors is a no-op when no overrides exist", () => {
    setupDOM();
    let bumps = 0;
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }],
        onStepChange: () => { bumps++; },
    });
    s.clearAllErrors();
    s.clearAllErrors();
    assert.equal(bumps, 0);
    s.destroy();
    teardownDOM();
});

test("reset returns to step 0 and clears all errors", () => {
    setupDOM();
    let last = null;
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 2,
        onStepChange: (next, prev, reason) => { last = { next, prev, reason }; },
    });
    s.setStepStatus("a", "error");
    s.reset();
    assert.equal(s.current(), 0);
    assert.equal(s.statusOf("a"), "current");
    assert.equal(last.reason, "reset");
    s.destroy();
    teardownDOM();
});

test("reset on empty steps lands at -1", () => {
    setupDOM();
    const s = createSteps();
    s.reset();
    assert.equal(s.current(), -1);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// canNavigateTo
// =====================================================================

test("canNavigateTo: default allowBack=true / allowSkip=false", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 1,
    });
    assert.equal(s.canNavigateTo(0), true);   // backward
    assert.equal(s.canNavigateTo(1), true);   // current
    assert.equal(s.canNavigateTo(2), false);  // forward (skip not allowed)
    s.destroy();
    teardownDOM();
});

test("canNavigateTo with allowSkip=true lets forward navigation", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 0,
        allowSkip: true,
    });
    assert.equal(s.canNavigateTo(2), true);
    s.destroy();
    teardownDOM();
});

test("canNavigateTo with allowBack=false locks the user forward-only", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 1,
        allowBack: false,
    });
    assert.equal(s.canNavigateTo(0), false);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// progress
// =====================================================================

test("progress reflects completion fraction", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }],
        defaultCurrent: 0,
    });
    assert.equal(s.progress(), 0);
    s.next();
    assert.equal(s.progress(), 0.25);
    s.next(); s.next();
    assert.equal(s.progress(), 0.75);
    s.next();
    assert.equal(s.progress(), 1);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// setSteps reconciles state
// =====================================================================

test("setSteps clamps current to new range + drops orphan overrides", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 2,
    });
    s.setStepStatus("b", "error");
    s.setSteps([{ id: "x" }]);   // shrunk
    assert.equal(s.current(), 0);
    assert.equal(s.statusOf("x"), "current");
    // Override on "b" should be gone (b no longer exists)
    assert.equal(s.statusOf("b"), "pending");   // -1 -> pending
    s.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot
// =====================================================================

test("attachRoot paints data-orientation + data-step-count + data-current-index", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 1,
        orientation: "vertical",
    });
    const root = mkEl();
    s.attachRoot(root);
    assert.equal(root.getAttribute("role"), "list");
    assert.equal(root.getAttribute("data-orientation"), "vertical");
    assert.equal(root.getAttribute("data-step-count"), "3");
    assert.equal(root.getAttribute("data-current-index"), "1");
    assert.equal(root.hasAttribute("data-complete"), false);
    s.next(); s.next();
    assert.equal(root.getAttribute("data-current-index"), "3");
    assert.equal(root.getAttribute("data-complete"), "");
    s.destroy();
    teardownDOM();
});

// =====================================================================
// attachStep paint
// =====================================================================

test("attachStep paints data-status + aria-current + tabindex", () => {
    setupDOM();
    const s = basicSteps();
    const el = mkEl();
    s.attachStep(el, "account");
    assert.equal(el.getAttribute("role"), "listitem");
    assert.equal(el.getAttribute("data-step-id"), "account");
    assert.equal(el.getAttribute("data-status"), "current");
    assert.equal(el.getAttribute("data-current"), "");
    assert.equal(el.getAttribute("aria-current"), "step");
    assert.equal(el.getAttribute("tabindex"), "0");
    s.destroy();
    teardownDOM();
});

test("attachStep reacts to current advancing (current -> complete)", () => {
    setupDOM();
    const s = basicSteps();
    const el = mkEl();
    s.attachStep(el, "account");
    s.next();
    assert.equal(el.getAttribute("data-status"), "complete");
    assert.equal(el.hasAttribute("data-current"), false);
    assert.equal(el.getAttribute("data-complete"), "");
    s.destroy();
    teardownDOM();
});

test("attachStep paints data-error when status overridden", () => {
    setupDOM();
    const s = basicSteps();
    const el = mkEl();
    s.attachStep(el, "billing");
    assert.equal(el.getAttribute("data-status"), "pending");
    s.setStepStatus("billing", "error");
    assert.equal(el.getAttribute("data-status"), "error");
    assert.equal(el.getAttribute("data-error"), "");
    s.destroy();
    teardownDOM();
});

test("attachStep click navigates when allowed", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        defaultCurrent: 1,
    });
    const elA = mkEl();
    const elC = mkEl();
    s.attachStep(elA, "a");
    s.attachStep(elC, "c");
    elA.click();    // backward -> allowed
    assert.equal(s.current(), 0);
    elC.click();    // forward without allowSkip -> blocked
    assert.equal(s.current(), 0);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// Next/Prev buttons
// =====================================================================

test("attachNextButton click advances + disables on complete", () => {
    setupDOM();
    const s = createSteps({ steps: [{ id: "a" }, { id: "b" }] });
    const btn = mkEl("button");
    s.attachNextButton(btn);
    btn.click();
    assert.equal(s.current(), 1);
    btn.click();   // goes to 2 (complete)
    assert.equal(s.isComplete(), true);
    assert.equal(btn.hasAttribute("disabled"), true);
    assert.equal(btn.getAttribute("aria-disabled"), "true");
    s.destroy();
    teardownDOM();
});

test("attachPrevButton click retreats + disables on first step", () => {
    setupDOM();
    const s = createSteps({
        steps: [{ id: "a" }, { id: "b" }],
        defaultCurrent: 1,
    });
    const btn = mkEl("button");
    s.attachPrevButton(btn);
    assert.equal(btn.hasAttribute("disabled"), false);
    btn.click();
    assert.equal(s.current(), 0);
    assert.equal(btn.hasAttribute("disabled"), true);
    s.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy detaches all attachments + blocks mutations", () => {
    setupDOM();
    const s = basicSteps();
    const root = mkEl();
    const stepEl = mkEl();
    s.attachRoot(root);
    s.attachStep(stepEl, "account");
    s.destroy();
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(stepEl.hasAttribute("data-step-id"), false);
    s.next();
    assert.equal(s.destroyed, true);
    teardownDOM();
});
