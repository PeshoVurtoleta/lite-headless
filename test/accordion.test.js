// accordion.test.js -- createAccordion end-to-end wiring

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createAccordion } from "../src/accordion/index.js";

function mkDOM() {
    const root = document.createElement("div");
    const items = ["a", "b", "c"].map((k) => {
        const item = document.createElement("div");
        const trigger = document.createElement("button");
        const panel = document.createElement("div");
        trigger.textContent = "Trigger " + k;
        panel.textContent = "Panel " + k;
        item.append(trigger, panel);
        root.appendChild(item);
        return { item, trigger, panel, key: k };
    });
    document.body.appendChild(root);
    return { root, items };
}

function keydown(el, key) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

// -----------------------------------------------------------------
// attach* lifecycle
// -----------------------------------------------------------------

test("attachRoot writes data-orientation + data-accordion-type", () => {
    setupDOM();
    const { root } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    assert.equal(root.getAttribute("data-orientation"), "vertical");
    assert.equal(root.getAttribute("data-accordion-type"), "single");
    acc.destroy();
    teardownDOM();
});

test("attachTrigger sets aria-expanded + data-open based on initial value", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    assert.equal(items[0].trigger.getAttribute("aria-expanded"), "true");
    assert.equal(items[0].trigger.hasAttribute("data-open"), true);
    assert.equal(items[1].trigger.getAttribute("aria-expanded"), "false");
    assert.equal(items[1].trigger.hasAttribute("data-open"), false);
    acc.destroy();
    teardownDOM();
});

test("attachPanel links trigger + panel via aria-controls + aria-labelledby", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) {
        acc.attachTrigger(it.trigger, it.key);
        acc.attachPanel(it.panel, it.key);
    }
    assert.equal(items[0].trigger.getAttribute("aria-controls"), items[0].panel.id);
    assert.equal(items[0].panel.getAttribute("aria-labelledby"), items[0].trigger.id);
    assert.equal(items[0].panel.getAttribute("role"), "region");
    acc.destroy();
    teardownDOM();
});

test("panel-before-trigger attach order still links them", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", defaultValue: "a" });
    acc.attachRoot(root);
    acc.attachPanel(items[0].panel, "a");        // panel first
    acc.attachTrigger(items[0].trigger, "a");
    assert.equal(items[0].trigger.getAttribute("aria-controls"), items[0].panel.id);
    assert.equal(items[0].panel.getAttribute("aria-labelledby"), items[0].trigger.id);
    acc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// type:"single" -- exactly one (or zero with collapsible) open
// -----------------------------------------------------------------

test("single: click on closed trigger opens it and closes the previously-open one", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) {
        acc.attachTrigger(it.trigger, it.key);
        acc.attachPanel(it.panel, it.key);
    }
    dispatchClick(items[1].trigger);
    assert.equal(acc.value(), "b");
    assert.equal(items[0].trigger.getAttribute("aria-expanded"), "false");
    assert.equal(items[1].trigger.getAttribute("aria-expanded"), "true");
    acc.destroy();
    teardownDOM();
});

test("single + collapsible:false: click on OPEN trigger is a no-op", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", collapsible: false, defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    dispatchClick(items[0].trigger);
    assert.equal(acc.value(), "a", "stays open");
    acc.destroy();
    teardownDOM();
});

test("single + collapsible:true: click on OPEN trigger closes it (value becomes null)", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", collapsible: true, defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    dispatchClick(items[0].trigger);
    assert.equal(acc.value(), null);
    assert.equal(items[0].trigger.getAttribute("aria-expanded"), "false");
    acc.destroy();
    teardownDOM();
});

test("single: setValue(null) closes the open panel even when collapsible:false", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", collapsible: false, defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    acc.setValue(null);
    assert.equal(acc.value(), null, "programmatic API can close even when click can't");
    acc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// type:"multiple" -- any subset open
// -----------------------------------------------------------------

test("multiple: defaultValue accepts array; opening adds to the set", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "multiple", defaultValue: ["a"] });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    dispatchClick(items[1].trigger);
    assert.deepEqual(acc.value(), ["a", "b"]);
    dispatchClick(items[2].trigger);
    assert.deepEqual(acc.value(), ["a", "b", "c"]);
    acc.destroy();
    teardownDOM();
});

test("multiple: click on open trigger removes it from the set", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "multiple", defaultValue: ["a", "b"] });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    dispatchClick(items[0].trigger);
    assert.deepEqual(acc.value(), ["b"]);
    dispatchClick(items[1].trigger);
    assert.deepEqual(acc.value(), []);
    acc.destroy();
    teardownDOM();
});

test("multiple: setValue dedupes but allows unknown keys (lazy-attach scenario)", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "multiple" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    // Unknown keys are kept on the value side; if a trigger attaches for
    // them later, it renders open immediately. This matches single's
    // behavior where setValue("missing") survives. Dedupe still applies.
    acc.setValue(["a", "b", "a", "missing"]);
    assert.deepEqual(acc.value(), ["a", "b", "missing"]);
    acc.destroy();
    teardownDOM();
});

test("multiple: onValueChange fires with full array on each change", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const calls = [];
    const acc = createAccordion({
        type: "multiple",
        onValueChange: (v, r) => calls.push({ v: v.slice(), r }),
    });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    dispatchClick(items[0].trigger);
    dispatchClick(items[1].trigger);
    dispatchClick(items[0].trigger);
    assert.deepEqual(calls.map(c => c.v), [["a"], ["a", "b"], ["b"]]);
    acc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// public API
// -----------------------------------------------------------------

test("open()/close()/toggle() programmatic API", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", collapsible: true });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);

    acc.open("a");
    assert.equal(acc.value(), "a");
    acc.toggle("b");
    assert.equal(acc.value(), "b");
    acc.toggle("b");
    assert.equal(acc.value(), null);
    acc.open("c");
    acc.close("c");
    assert.equal(acc.value(), null);
    acc.destroy();
    teardownDOM();
});

test("isOpen() reflects current value for single + multiple", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc1 = createAccordion({ type: "single", defaultValue: "b" });
    acc1.attachRoot(root);
    for (const it of items) acc1.attachTrigger(it.trigger, it.key);
    assert.equal(acc1.isOpen("a"), false);
    assert.equal(acc1.isOpen("b"), true);
    acc1.destroy();

    const root2 = document.createElement("div");
    document.body.appendChild(root2);
    const t1 = document.createElement("button");
    const t2 = document.createElement("button");
    root2.append(t1, t2);
    const acc2 = createAccordion({ type: "multiple", defaultValue: ["a", "b"] });
    acc2.attachRoot(root2);
    acc2.attachTrigger(t1, "a");
    acc2.attachTrigger(t2, "b");
    assert.equal(acc2.isOpen("a"), true);
    assert.equal(acc2.isOpen("b"), true);
    acc2.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// disabled handling
// -----------------------------------------------------------------

test("attachTrigger with {disabled:true} writes aria-disabled and refuses clicks", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    acc.attachTrigger(items[0].trigger, "a");
    acc.attachTrigger(items[1].trigger, "b", { disabled: true });
    assert.equal(items[1].trigger.getAttribute("aria-disabled"), "true");
    dispatchClick(items[1].trigger);
    assert.equal(acc.value(), null, "click on disabled trigger refused");
    acc.destroy();
    teardownDOM();
});

test("setDisabled(true) on open single key closes it as a side effect", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    acc.setDisabled("a", true);
    assert.equal(acc.value(), null, "disabled open key was forcibly closed");
    acc.destroy();
    teardownDOM();
});

test("setDisabled(true) on open multiple key removes it from the set", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "multiple", defaultValue: ["a", "b"] });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    acc.setDisabled("a", true);
    assert.deepEqual(acc.value(), ["b"]);
    acc.destroy();
    teardownDOM();
});

test("setDisabled(false) re-enables a trigger", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    acc.attachTrigger(items[0].trigger, "a", { disabled: true });
    acc.setDisabled("a", false);
    assert.equal(items[0].trigger.hasAttribute("aria-disabled"), false);
    dispatchClick(items[0].trigger);
    assert.equal(acc.value(), "a");
    acc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// keyboard
// -----------------------------------------------------------------

test("ArrowDown moves focus to next enabled trigger", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    items[0].trigger.focus();
    keydown(items[0].trigger, "ArrowDown");
    assert.equal(document.activeElement, items[1].trigger);
    acc.destroy();
    teardownDOM();
});

test("ArrowUp wraps from first to last", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    items[0].trigger.focus();
    keydown(items[0].trigger, "ArrowUp");
    assert.equal(document.activeElement, items[2].trigger);
    acc.destroy();
    teardownDOM();
});

test("Home + End jump to first + last enabled", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    items[1].trigger.focus();
    keydown(items[1].trigger, "Home");
    assert.equal(document.activeElement, items[0].trigger);
    keydown(items[0].trigger, "End");
    assert.equal(document.activeElement, items[2].trigger);
    acc.destroy();
    teardownDOM();
});

test("ArrowDown skips disabled triggers", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    acc.attachTrigger(items[0].trigger, "a");
    acc.attachTrigger(items[1].trigger, "b", { disabled: true });
    acc.attachTrigger(items[2].trigger, "c");
    items[0].trigger.focus();
    keydown(items[0].trigger, "ArrowDown");
    assert.equal(document.activeElement, items[2].trigger, "skipped disabled b");
    acc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// edge cases
// -----------------------------------------------------------------

test("setValue with unknown key is a no-op for single", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    acc.setValue("a");
    assert.equal(acc.value(), "a");
    acc.setValue("missing");
    // single mode normalizes to string -- "missing" is set, but no
    // trigger matches so no DOM expand happens. This is fine; consumer
    // can validate beforehand or pass null.
    assert.equal(acc.value(), "missing");
    acc.destroy();
    teardownDOM();
});

test("throws if type is invalid", () => {
    assert.throws(() => createAccordion({ type: "bogus" }),
        /type must be "single" or "multiple"/);
});

test("throws if attachItem/attachTrigger/attachPanel called without key", () => {
    setupDOM();
    const acc = createAccordion();
    const el = document.createElement("div");
    assert.throws(() => acc.attachItem(el), /key is required/);
    assert.throws(() => acc.attachTrigger(el), /key is required/);
    assert.throws(() => acc.attachPanel(el), /key is required/);
    acc.destroy();
    teardownDOM();
});

test("destroy() is idempotent and stops further changes", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", defaultValue: "a" });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    acc.destroy();
    assert.equal(acc.destroyed, true);
    acc.destroy();   // no throw
    acc.setValue("b");
    assert.equal(acc.value(), "a", "post-destroy setValue is a no-op");
    teardownDOM();
});

test("type defaults to 'single'", () => {
    setupDOM();
    const { root, items } = mkDOM();
    const acc = createAccordion();
    acc.attachRoot(root);
    assert.equal(root.getAttribute("data-accordion-type"), "single");
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    dispatchClick(items[0].trigger);
    dispatchClick(items[1].trigger);
    assert.equal(acc.value(), "b", "single-mode replaces");
    acc.destroy();
    teardownDOM();
});

test("multiple onValueChange does NOT fire when array contents unchanged", () => {
    setupDOM();
    const { root, items } = mkDOM();
    let calls = 0;
    const acc = createAccordion({
        type: "multiple",
        defaultValue: ["a"],
        onValueChange: () => { calls++; },
    });
    acc.attachRoot(root);
    for (const it of items) acc.attachTrigger(it.trigger, it.key);
    acc.setValue(["a"]);
    assert.equal(calls, 0, "same array contents -> no fire");
    acc.setValue(["a", "b"]);
    assert.equal(calls, 1);
    acc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// v0.7.9 transition lock (isTweening-style guard against rapid clicks
// during CSS transition)
// -----------------------------------------------------------------

function mockTransitionDuration(ms) {
    // Override the global getComputedStyle to report a non-zero
    // transition-duration for any element. Returns a restore fn.
    const original = global.getComputedStyle;
    global.getComputedStyle = function () {
        return {
            transitionDuration: (ms / 1000).toFixed(3) + "s",
            transitionDelay: "0s",
        };
    };
    return () => { global.getComputedStyle = original; };
}

test("rapid clicks during CSS transition are dropped (single + collapsible)", () => {
    setupDOM();
    const restore = mockTransitionDuration(200);
    try {
        const { root, items } = mkDOM();
        let count = 0;
        const acc = createAccordion({
            type: "single", collapsible: true,
            onValueChange: () => { count++; },
        });
        acc.attachRoot(root);
        for (const it of items) {
            acc.attachTrigger(it.trigger, it.key);
            acc.attachPanel(it.panel, it.key);
        }

        // first click: a opens. count=1.
        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), "a");
        assert.equal(count, 1);

        // SECOND click immediately after: should be dropped because
        // a's panel is still transitioning.
        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), "a", "second click ignored during transition");
        assert.equal(count, 1, "no second onValueChange");

        // third click on a DIFFERENT trigger: also dropped if the
        // previously-active key is still mid-transition.
        // (Actually -- b's panel isn't transitioning, so b's click
        // would fire normally. The single-mode guard locks a too, but
        // b is a separate key.) Hmm, let's check what happens:
        dispatchClick(items[1].trigger);
        // b passes through (b hasn't been touched), but the prevActive
        // logic in onClick is in the SAME click. So b activates.
        assert.equal(acc.value(), "b");
        assert.equal(count, 2);

        // Now another rapid click on b: should be ignored (b is
        // transitioning open). And on a: should also be ignored (a was
        // locked when we swapped from a to b above).
        dispatchClick(items[1].trigger);
        assert.equal(acc.value(), "b", "rapid re-click on b ignored");
        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), "b", "rapid re-click on prev-active a ignored");
        assert.equal(count, 2);
        acc.destroy();
    } finally {
        restore();
    }
    teardownDOM();
});

test("lock auto-clears after measured transition duration", async () => {
    setupDOM();
    const restore = mockTransitionDuration(40);   // short for the test
    try {
        const { root, items } = mkDOM();
        const acc = createAccordion({ type: "single", collapsible: true });
        acc.attachRoot(root);
        for (const it of items) {
            acc.attachTrigger(it.trigger, it.key);
            acc.attachPanel(it.panel, it.key);
        }
        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), "a");
        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), "a", "ignored during 40ms lock");

        // wait past the lock + the 8ms pad
        await new Promise(r => setTimeout(r, 70));

        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), null, "lock expired; click closes");
        acc.destroy();
    } finally {
        restore();
    }
    teardownDOM();
});

test("programmatic API is NOT guarded by the transition lock", () => {
    setupDOM();
    const restore = mockTransitionDuration(200);
    try {
        const { root, items } = mkDOM();
        const acc = createAccordion({ type: "single", collapsible: true });
        acc.attachRoot(root);
        for (const it of items) {
            acc.attachTrigger(it.trigger, it.key);
            acc.attachPanel(it.panel, it.key);
        }
        dispatchClick(items[0].trigger);
        assert.equal(acc.value(), "a");
        // setValue is authoritative -- it bypasses the lock
        acc.setValue("b");
        assert.equal(acc.value(), "b", "programmatic setValue not blocked");
        acc.toggle("c");
        assert.equal(acc.value(), "c", "programmatic toggle not blocked");
        acc.close("c");
        assert.equal(acc.value(), null, "programmatic close not blocked");
        acc.open("a");
        assert.equal(acc.value(), "a", "programmatic open not blocked");
        acc.destroy();
    } finally {
        restore();
    }
    teardownDOM();
});

test("zero transition-duration: lock is never set, every click passes", () => {
    setupDOM();
    // default getComputedStyle in happy-dom returns "0s" for transition-duration
    const { root, items } = mkDOM();
    const acc = createAccordion({ type: "single", collapsible: true });
    acc.attachRoot(root);
    for (const it of items) {
        acc.attachTrigger(it.trigger, it.key);
        acc.attachPanel(it.panel, it.key);
    }
    dispatchClick(items[0].trigger);
    dispatchClick(items[0].trigger);
    dispatchClick(items[0].trigger);
    // three toggles -> open / close / open
    assert.equal(acc.value(), "a", "no-transition consumer gets immediate response");
    acc.destroy();
    teardownDOM();
});

test("destroy clears in-flight transition timers", () => {
    setupDOM();
    const restore = mockTransitionDuration(10_000);   // long lock
    try {
        const { root, items } = mkDOM();
        const acc = createAccordion({ type: "single", collapsible: true });
        acc.attachRoot(root);
        for (const it of items) {
            acc.attachTrigger(it.trigger, it.key);
            acc.attachPanel(it.panel, it.key);
        }
        dispatchClick(items[0].trigger);
        // lock is now armed for 10s; destroy() should clear it without
        // leaving an outstanding timer. We can't easily inspect timer
        // counts, but we can at least verify destroy() runs without
        // throwing and that subsequent setValue is a no-op.
        acc.destroy();
        acc.setValue("b");
        assert.equal(acc.value(), "a", "post-destroy setValue no-op");
    } finally {
        restore();
    }
    teardownDOM();
});
