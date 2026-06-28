// stepper.test.js -- createStepper end-to-end wiring

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createStepper } from "../src/stepper/index.js";

function mkInput() {
    const el = document.createElement("input");
    el.type = "text";
    document.body.append(el);
    return el;
}
function mkBtn() {
    const el = document.createElement("button");
    document.body.append(el);
    return el;
}

// -----------------------------------------------------------------
// construction + normalization
// -----------------------------------------------------------------

test("defaultValue is clamped to [min, max] at construction", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 999, min: 0, max: 100 });
    assert.equal(s.value(), 100);
    s.destroy(); teardownDOM();
});

test("defaultValue is snapped to step grid anchored at min", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 7, min: 0, max: 100, step: 5 });
    assert.equal(s.value(), 5, "7 snapped to nearest step:5 grid = 5");
    s.destroy(); teardownDOM();
});

test("step grid is anchored at min (not 0)", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 2, min: 0.7, step: 1 });
    // grid: 0.7, 1.7, 2.7; nearest to 2 is 1.7
    assert.equal(s.value(), 1.7);
    s.destroy(); teardownDOM();
});

test("floating-point hygiene: step=0.1 doesn't accumulate drift", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 0, min: 0, max: 1, step: 0.1 });
    s.increment(); assert.equal(s.value(), 0.1);
    s.increment(); assert.equal(s.value(), 0.2);
    s.increment(); assert.equal(s.value(), 0.3, "no 0.30000000000000004 drift");
    s.destroy(); teardownDOM();
});

test("invalid step throws", () => {
    setupDOM();
    assert.throws(() => createStepper({ step: 0 }));
    assert.throws(() => createStepper({ step: -1 }));
    assert.throws(() => createStepper({ step: NaN }));
    teardownDOM();
});

test("invalid min > max throws", () => {
    setupDOM();
    assert.throws(() => createStepper({ min: 10, max: 5 }));
    teardownDOM();
});

// -----------------------------------------------------------------
// programmatic API
// -----------------------------------------------------------------

test("setValue clamps + snaps + fires onValueChange", () => {
    setupDOM();
    const calls = [];
    const s = createStepper({
        defaultValue: 0, min: 0, max: 100, step: 5,
        onValueChange: (n, reason) => calls.push({ n, reason }),
    });
    s.setValue(73);    assert.equal(s.value(), 75);   // snap to nearest 5
    s.setValue(200);   assert.equal(s.value(), 100);  // clamp to max
    s.setValue(-50);   assert.equal(s.value(), 0);    // clamp to min
    assert.equal(calls.length, 3);
    assert.equal(calls[0].reason, "set");
    s.destroy(); teardownDOM();
});

test("setValue with same value is a no-op (doesn't fire callback)", () => {
    setupDOM();
    let count = 0;
    const s = createStepper({ defaultValue: 5, step: 1, onValueChange: () => count++ });
    s.setValue(5);    assert.equal(count, 0);
    s.setValue(6);    assert.equal(count, 1);
    s.setValue(6);    assert.equal(count, 1);
    s.destroy(); teardownDOM();
});

test("increment / decrement step by configured step", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 10, step: 2 });
    s.increment(); assert.equal(s.value(), 12);
    s.increment(); assert.equal(s.value(), 14);
    s.decrement(); assert.equal(s.value(), 12);
    s.destroy(); teardownDOM();
});

test("increment(amount) accepts custom delta", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 0, step: 1, max: 100 });
    s.increment(5);    // explicit amount overrides step
    assert.equal(s.value(), 5);
    s.decrement(2);
    assert.equal(s.value(), 3);
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// formatting + display
// -----------------------------------------------------------------

test("default formatter renders raw number via Intl.NumberFormat", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 42 });
    assert.equal(s.displayValue(), "42");
    s.destroy(); teardownDOM();
});

test("precision option controls fixed decimal places", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 3.5, step: 0.1, precision: 2 });
    assert.equal(s.displayValue(), "3.50");
    s.setValue(7);
    assert.equal(s.displayValue(), "7.00");
    s.destroy(); teardownDOM();
});

test("locale-aware formatting (de-DE uses ',' as decimal separator)", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 1.5, step: 0.1, precision: 1, locale: "de-DE" });
    assert.equal(s.displayValue(), "1,5");
    s.destroy(); teardownDOM();
});

test("custom formatter overrides Intl.NumberFormat", () => {
    setupDOM();
    const s = createStepper({
        defaultValue: 50, step: 1,
        formatter: (n) => `${n}%`,
    });
    assert.equal(s.displayValue(), "50%");
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// attachInput: focus / blur / typing / commit
// -----------------------------------------------------------------

test("attachInput sets role=spinbutton + aria attrs + initial display", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 42, min: 0, max: 100 });
    s.attachInput(input);
    assert.equal(input.getAttribute("role"), "spinbutton");
    assert.equal(input.getAttribute("aria-valuemin"), "0");
    assert.equal(input.getAttribute("aria-valuemax"), "100");
    assert.equal(input.getAttribute("aria-valuenow"), "42");
    assert.equal(input.value, "42");
    s.destroy(); teardownDOM();
});

test("setValue updates input.value when not focused", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 0 });
    s.attachInput(input);
    s.setValue(25);
    assert.equal(input.value, "25");
    assert.equal(input.getAttribute("aria-valuenow"), "25");
    s.destroy(); teardownDOM();
});

test("typing in input doesn't trigger value commit until blur/Enter", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 10 });
    s.attachInput(input);
    input.focus();
    input.value = "99";
    // No commit fires from raw assignment -- only on Enter or blur
    assert.equal(s.value(), 10);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(s.value(), 99);
    s.destroy(); teardownDOM();
});

test("Enter commits + clamps + snaps", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 0, min: 0, max: 100, step: 5 });
    s.attachInput(input);
    input.focus();
    input.value = "77";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(s.value(), 75, "77 snapped to step:5 = 75");
    // Enter triggered syncDisplay since it forces commit
    assert.equal(input.value, "75");
    s.destroy(); teardownDOM();
});

test("blur commits + reformats", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 0, step: 1, precision: 2 });
    s.attachInput(input);
    input.focus();
    input.value = "5";
    input.dispatchEvent(new Event("blur"));
    assert.equal(s.value(), 5);
    assert.equal(input.value, "5.00", "blur reformats");
    s.destroy(); teardownDOM();
});

test("invalid input text on commit leaves value unchanged + restores display", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 10 });
    s.attachInput(input);
    input.focus();
    input.value = "not a number";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(s.value(), 10, "value unchanged");
    assert.equal(input.value, "10", "display restored from value");
    s.destroy(); teardownDOM();
});

test("locale parsing: de-DE input with ',' decimal separator", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({
        defaultValue: 0, step: 0.01, precision: 2, locale: "de-DE",
    });
    s.attachInput(input);
    input.focus();
    input.value = "3,14";    // German decimal
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(s.value(), 3.14);
    assert.equal(input.value, "3,14", "display uses German format");
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// keyboard navigation
// -----------------------------------------------------------------

test("ArrowUp increments by step", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 4, step: 2 });   // 4 is on the step:2 grid
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    assert.equal(s.value(), 6);
    s.destroy(); teardownDOM();
});

test("ArrowDown decrements by step", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 4, step: 2 });
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    assert.equal(s.value(), 2);
    s.destroy(); teardownDOM();
});

test("Shift+ArrowUp uses largeStep", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 0, step: 1, largeStep: 25 });
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true }));
    assert.equal(s.value(), 25);
    s.destroy(); teardownDOM();
});

test("PageUp/PageDown use largeStep", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 50, step: 1, largeStep: 10 });
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp" }));
    assert.equal(s.value(), 60);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
    assert.equal(s.value(), 50);
    s.destroy(); teardownDOM();
});

test("Home / End jump to min / max when finite", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 50, min: 0, max: 100, step: 1 });
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    assert.equal(s.value(), 0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    assert.equal(s.value(), 100);
    s.destroy(); teardownDOM();
});

test("Home / End are no-ops when min / max are infinite", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 50, step: 1 });   // no min/max
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    assert.equal(s.value(), 50);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    assert.equal(s.value(), 50);
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// attachIncrement / attachDecrement
// -----------------------------------------------------------------

test("pointerdown on increment button fires one step", () => {
    setupDOM();
    const btn = mkBtn();
    const s = createStepper({ defaultValue: 6, step: 3 });   // 6 is on step:3 grid
    s.attachIncrement(btn);
    btn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
    btn.dispatchEvent(new PointerEvent("pointerup",   { pointerId: 1 }));
    assert.equal(s.value(), 9);
    s.destroy(); teardownDOM();
});

test("Enter/Space on increment button activates", () => {
    setupDOM();
    const btn = mkBtn();
    const s = createStepper({ defaultValue: 6, step: 3 });
    s.attachIncrement(btn);
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(s.value(), 9);
    btn.dispatchEvent(new KeyboardEvent("keydown", { key: " " }));
    assert.equal(s.value(), 12);
    s.destroy(); teardownDOM();
});

test("attachDecrement decrements on pointerdown", () => {
    setupDOM();
    const btn = mkBtn();
    const s = createStepper({ defaultValue: 5, step: 1 });
    s.attachDecrement(btn);
    btn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
    btn.dispatchEvent(new PointerEvent("pointerup",   { pointerId: 1 }));
    assert.equal(s.value(), 4);
    s.destroy(); teardownDOM();
});

test("aria-label is set on increment/decrement controls when absent", () => {
    setupDOM();
    const inc = mkBtn(), dec = mkBtn();
    const s = createStepper({});
    s.attachIncrement(inc);
    s.attachDecrement(dec);
    assert.equal(inc.getAttribute("aria-label"), "Increment");
    assert.equal(dec.getAttribute("aria-label"), "Decrement");
    s.destroy(); teardownDOM();
});

test("pre-existing aria-label is preserved on increment/decrement", () => {
    setupDOM();
    const inc = mkBtn();
    inc.setAttribute("aria-label", "Bump up");
    const s = createStepper({});
    s.attachIncrement(inc);
    assert.equal(inc.getAttribute("aria-label"), "Bump up");
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// attachReadout
// -----------------------------------------------------------------

test("attachReadout renders formatted display + reactively updates", () => {
    setupDOM();
    const span = document.createElement("span");
    document.body.append(span);
    const s = createStepper({ defaultValue: 10, precision: 1, step: 0.1 });
    s.attachReadout(span);
    assert.equal(span.textContent, "10.0");
    s.setValue(25.5);
    assert.equal(span.textContent, "25.5");
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// disabled
// -----------------------------------------------------------------

test("setDisabled flips aria-disabled and native .disabled", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 5 });
    s.attachInput(input);
    s.setDisabled(true);
    assert.equal(input.getAttribute("aria-disabled"), "true");
    assert.equal(input.disabled, true);
    s.setDisabled(false);
    assert.equal(input.hasAttribute("aria-disabled"), false);
    assert.equal(input.disabled, false);
    s.destroy(); teardownDOM();
});

test("keyboard increments are no-ops when disabled", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 5, step: 1, disabled: true });
    s.attachInput(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    assert.equal(s.value(), 5);
    s.destroy(); teardownDOM();
});

test("disabled button pointerdown is a no-op", () => {
    setupDOM();
    const btn = mkBtn();
    const s = createStepper({ defaultValue: 5, step: 1, disabled: true });
    s.attachIncrement(btn);
    btn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
    btn.dispatchEvent(new PointerEvent("pointerup",   { pointerId: 1 }));
    assert.equal(s.value(), 5);
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// lifecycle
// -----------------------------------------------------------------

test("destroy is idempotent and stops further publishes via signal", () => {
    setupDOM();
    let count = 0;
    const s = createStepper({ defaultValue: 0, onValueChange: () => count++ });
    s.setValue(5);     assert.equal(count, 1);
    s.destroy();
    assert.equal(s.destroyed, true);
    s.destroy();       // no throw
    s.setValue(99);    assert.equal(count, 1, "no callback after destroy");
    teardownDOM();
});

test("attachInput teardown removes aria + listeners", () => {
    setupDOM();
    const input = mkInput();
    const s = createStepper({ defaultValue: 5, step: 1 });
    const off = s.attachInput(input);
    off();
    assert.equal(input.hasAttribute("role"), false);
    assert.equal(input.hasAttribute("aria-valuenow"), false);
    // After detach, keydown shouldn't fire the handler
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
    assert.equal(s.value(), 5);
    s.destroy(); teardownDOM();
});

test("controlled mode: external signal writes flow through to display", async () => {
    // Late import: lite-signal is the consumer-facing factory the same
    // way createStepper imports it internally. We can't import it at
    // module top because the test file shouldn't take a hard dep on
    // lite-signal; consumers who pass a controlled signal own that dep.
    const { signal } = await import("@zakkster/lite-signal");
    setupDOM();
    const input = mkInput();
    const external = signal(10);
    const s = createStepper({ value: external, step: 1 });
    s.attachInput(input);
    assert.equal(input.value, "10");
    external.set(42);
    assert.equal(s.value(), 42);
    assert.equal(input.value, "42");
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// integration: full input + buttons together
// -----------------------------------------------------------------

test("input + increment + decrement compose correctly", () => {
    setupDOM();
    const input = mkInput();
    const inc = mkBtn(), dec = mkBtn();
    const s = createStepper({ defaultValue: 5, min: 0, max: 10, step: 1 });
    s.attachInput(input);
    s.attachIncrement(inc);
    s.attachDecrement(dec);

    inc.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
    inc.dispatchEvent(new PointerEvent("pointerup",   { pointerId: 1 }));
    assert.equal(s.value(), 6);
    assert.equal(input.value, "6");
    assert.equal(input.getAttribute("aria-valuenow"), "6");

    dec.dispatchEvent(new PointerEvent("pointerdown", { button: 0, pointerId: 1 }));
    dec.dispatchEvent(new PointerEvent("pointerup",   { pointerId: 1 }));
    assert.equal(s.value(), 5);

    input.focus();
    input.value = "12";   // above max
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    assert.equal(s.value(), 10, "clamped to max");
    s.destroy(); teardownDOM();
});

// -----------------------------------------------------------------
// v0.7.11: dynamic constraints (setMin / setMax / setStep) +
// precomputed step multiplier + contenteditable disabled
// -----------------------------------------------------------------

test("setMax re-normalizes current value if it exceeds the new max", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 10, min: 0, max: 100, step: 1 });
    assert.equal(s.value(), 10);
    s.setMax(5);
    assert.equal(s.value(), 5, "clamped to new max");
    assert.equal(s.max(), 5);
    s.destroy(); teardownDOM();
});

test("setMin re-normalizes current value if it falls below the new min", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 3, min: 0, max: 100, step: 1 });
    s.setMin(10);
    assert.equal(s.value(), 10, "clamped to new min");
    assert.equal(s.min(), 10);
    s.destroy(); teardownDOM();
});

test("setMax does not change value when current is already within bounds", () => {
    setupDOM();
    const calls = [];
    const s = createStepper({ defaultValue: 5, min: 0, max: 100, step: 1,
        onValueChange: (v, r) => calls.push([v, r]) });
    s.setMax(50);
    assert.equal(s.value(), 5);
    assert.equal(calls.length, 0, "no onValueChange when value already in bounds");
    s.destroy(); teardownDOM();
});

test("setMax with reason 'constraint' fires onValueChange only when value moves", () => {
    setupDOM();
    const calls = [];
    const s = createStepper({ defaultValue: 80, min: 0, max: 100, step: 1,
        onValueChange: (v, r) => calls.push([v, r]) });
    s.setMax(50);
    assert.deepEqual(calls, [[50, "constraint"]]);
    s.destroy(); teardownDOM();
});

test("setMin > current max is ignored (invalid range)", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 5, min: 0, max: 10, step: 1 });
    s.setMin(20);     // would invert: min > max
    assert.equal(s.min(), 0, "min unchanged");
    s.destroy(); teardownDOM();
});

test("setStep updates the snap grid and re-normalizes", () => {
    setupDOM();
    const s = createStepper({ defaultValue: 5, min: 0, max: 10, step: 1 });
    s.setValue(4);
    s.setStep(0.5);
    assert.equal(s.step(), 0.5);
    // 4 is already on the 0.5 grid; verify a finer set snaps correctly
    s.setValue(4.3);
    assert.equal(s.value(), 4.5, "snapped to 0.5 grid");
    s.destroy(); teardownDOM();
});

test("step multiplier precomputed once (no per-call Math.pow)", () => {
    // Indirect verification: many normalization calls in tight loop don't
    // produce floating-point drift, and the result matches what the old
    // Math.pow path produced.
    setupDOM();
    const s = createStepper({ defaultValue: 0, min: 0, max: 10, step: 0.01 });
    for (let i = 0; i < 100; i++) s.increment();
    assert.equal(s.value(), 1, "exact float, no drift over 100 increments");
    s.destroy(); teardownDOM();
});

test("setDisabled(true) on contenteditable input flips contenteditable to false", () => {
    setupDOM();
    const span = document.createElement("span");
    span.setAttribute("contenteditable", "true");
    span.setAttribute("data-input", "");
    document.body.appendChild(span);
    const s = createStepper({ defaultValue: 5 });
    s.attachInput(span);
    assert.equal(span.getAttribute("contenteditable"), "true", "initially editable");
    s.setDisabled(true);
    assert.equal(span.getAttribute("contenteditable"), "false",
        "contenteditable disabled when stepper disabled (loophole closed)");
    s.setDisabled(false);
    assert.equal(span.getAttribute("contenteditable"), "true", "re-enabled");
    s.destroy(); teardownDOM();
});

test("setDisabled does not add contenteditable to inputs that didn't have it", () => {
    setupDOM();
    const input = document.createElement("input");
    input.setAttribute("data-input", "");
    document.body.appendChild(input);
    const s = createStepper({ defaultValue: 5 });
    s.attachInput(input);
    s.setDisabled(true);
    assert.equal(input.hasAttribute("contenteditable"), false,
        "contenteditable attribute not synthesized on inputs that lacked it");
    s.destroy(); teardownDOM();
});
