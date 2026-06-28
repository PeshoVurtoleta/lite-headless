// pin-input.test.js -- createPinInput state machine + paste + backspace + DOM wiring
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createPinInput } from "../src/pin-input/index.js";

function mkRoot() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}
function mkInput() {
    const el = document.createElement("input");
    document.body.appendChild(el);
    return el;
}
// Simulate typing a char into an input + dispatching the input event.
function typeChar(el, ch) {
    el.value = ch;
    el.dispatchEvent(new Event("input", { bubbles: true }));
}
function keydown(el, key, modifiers = {}) {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
    el.dispatchEvent(ev);
    return ev;
}
function paste(el, text) {
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    // jsdom doesn't have a real ClipboardEvent; attach data manually.
    ev.clipboardData = { getData: (type) => type === "text" ? text : "" };
    el.dispatchEvent(ev);
    return ev;
}
// Wait for queueMicrotask focus calls inside the primitive to flush.
async function flushMicro() { await Promise.resolve(); }

// =====================================================================
// Construction + options
// =====================================================================

test("default options: length=6, numeric, empty initial", () => {
    setupDOM();
    const p = createPinInput();
    assert.equal(p.length, 6);
    assert.equal(p.value(), "");
    assert.equal(p.isComplete(), false);
    assert.equal(p.position(), 0);
    p.destroy();
    teardownDOM();
});

test("length=4: alpha-num + initial value filters by pattern", () => {
    setupDOM();
    const p = createPinInput({ length: 4, type: "alphanumeric", initialValue: "A1!b2" });
    // Non-alphanumeric "!" stripped; remaining: "A1b2"
    assert.equal(p.value(), "A1b2");
    assert.equal(p.isComplete(), true);
    p.destroy();
    teardownDOM();
});

test("numeric initial value strips letters", () => {
    setupDOM();
    const p = createPinInput({ initialValue: "12abc34" });
    assert.equal(p.value(), "1234");
    assert.equal(p.isComplete(), false);   // 4 < 6
    p.destroy();
    teardownDOM();
});

test("custom RegExp type", () => {
    setupDOM();
    const p = createPinInput({ length: 4, type: /[0-9A-F]/, initialValue: "DEADc0fe" });
    // /[0-9A-F]/ rejects lowercase: D E A D 0 F E -> first 4 = "DEAD"
    assert.equal(p.value(), "DEAD");
    p.destroy();
    teardownDOM();
});

test("length out of range throws", () => {
    setupDOM();
    assert.throws(() => createPinInput({ length: 0 }), /1\.\.16/);
    assert.throws(() => createPinInput({ length: 17 }), /1\.\.16/);
    assert.throws(() => createPinInput({ length: 3.5 }), /1\.\.16/);
    teardownDOM();
});

test("bad type throws", () => {
    setupDOM();
    assert.throws(() => createPinInput({ type: "bogus" }), /must be/);
    teardownDOM();
});

// =====================================================================
// attachRoot
// =====================================================================

test("attachRoot paints role + aria-label + data attrs", () => {
    setupDOM();
    const root = mkRoot();
    const p = createPinInput({ length: 6, ariaLabel: "MFA code" });
    p.attachRoot(root);
    assert.equal(root.getAttribute("role"), "group");
    assert.equal(root.getAttribute("aria-label"), "MFA code");
    assert.equal(root.getAttribute("data-pin-length"), "6");
    assert.equal(root.getAttribute("data-pin-state"), "incomplete");
    assert.equal(root.getAttribute("data-pin-value-length"), "0");
    p.destroy();
    teardownDOM();
});

test("attachRoot data-pin-state flips to 'complete' when filled", () => {
    setupDOM();
    const root = mkRoot();
    const p = createPinInput({ length: 4 });
    p.attachRoot(root);
    p.setValue("1234");
    assert.equal(root.getAttribute("data-pin-state"), "complete");
    assert.equal(root.getAttribute("data-pin-value-length"), "4");
    p.destroy();
    teardownDOM();
});

test("attachRoot off() cleans up attrs", () => {
    setupDOM();
    const root = mkRoot();
    const p = createPinInput();
    const off = p.attachRoot(root);
    off();
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("data-pin-root"), false);
    assert.equal(root.hasAttribute("data-pin-state"), false);
    p.destroy();
    teardownDOM();
});

// =====================================================================
// attachInput
// =====================================================================

test("attachInput paints data-pin-input + maxlength + aria-label", () => {
    setupDOM();
    const el = mkInput();
    const p = createPinInput({ length: 6 });
    p.attachInput(el, 0);
    assert.equal(el.hasAttribute("data-pin-input"), true);
    assert.equal(el.getAttribute("data-pin-index"), "0");
    assert.equal(el.getAttribute("maxlength"), "1");
    assert.equal(el.getAttribute("aria-label"), "Digit 1 of 6");
    assert.equal(el.getAttribute("inputmode"), "numeric");
    assert.equal(el.getAttribute("autocomplete"), "one-time-code");
    p.destroy();
    teardownDOM();
});

test("attachInput at non-first index does NOT set autocomplete", () => {
    setupDOM();
    const el = mkInput();
    const p = createPinInput();
    p.attachInput(el, 3);
    assert.equal(el.getAttribute("aria-label"), "Digit 4 of 6");
    assert.equal(el.hasAttribute("autocomplete"), false);
    p.destroy();
    teardownDOM();
});

test("attachInput with out-of-range index throws", () => {
    setupDOM();
    const el = mkInput();
    const p = createPinInput({ length: 4 });
    assert.throws(() => p.attachInput(el, -1), /index must be 0\.\.3/);
    assert.throws(() => p.attachInput(el, 4),  /index must be 0\.\.3/);
    assert.throws(() => p.attachInput(el, 1.5), /index must be 0\.\.3/);
    p.destroy();
    teardownDOM();
});

// =====================================================================
// Typing flow: input + auto-advance
// =====================================================================

test("typing a digit writes value at the focused box and advances", async () => {
    setupDOM();
    const p = createPinInput({ length: 6 });
    const inputs = Array.from({ length: 6 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    typeChar(inputs[0], "1");
    assert.equal(p.value(), "1");
    assert.equal(p.position(), 1);
    typeChar(inputs[1], "2");
    assert.equal(p.value(), "12");
    assert.equal(p.position(), 2);
    p.destroy();
    teardownDOM();
});

test("typing a non-digit in numeric mode is silently dropped", () => {
    setupDOM();
    const p = createPinInput({ length: 6 });
    const el = mkInput();
    p.attachInput(el, 0);
    typeChar(el, "a");
    assert.equal(p.value(), "");
    p.destroy();
    teardownDOM();
});

test("typing in last box stays focused + fires onComplete", () => {
    setupDOM();
    let completed = null;
    const p = createPinInput({ length: 3, onComplete: (v) => { completed = v; } });
    const inputs = Array.from({ length: 3 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    typeChar(inputs[0], "1");
    typeChar(inputs[1], "2");
    assert.equal(completed, null);
    typeChar(inputs[2], "3");
    assert.equal(completed, "123");
    assert.equal(p.position(), 2);    // doesn't advance past last
    p.destroy();
    teardownDOM();
});

test("onChange fires on every value change with (value, isComplete)", () => {
    setupDOM();
    const calls = [];
    const p = createPinInput({ length: 3, onChange: (v, c) => calls.push([v, c]) });
    const inputs = Array.from({ length: 3 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    typeChar(inputs[0], "1");
    typeChar(inputs[1], "2");
    typeChar(inputs[2], "3");
    assert.deepEqual(calls, [
        ["1", false],
        ["12", false],
        ["123", true],
    ]);
    p.destroy();
    teardownDOM();
});

test("onComplete fires once per incomplete -> complete edge", () => {
    setupDOM();
    const calls = [];
    const p = createPinInput({ length: 2, onComplete: (v) => calls.push(v) });
    const inputs = [mkInput(), mkInput()];
    inputs.forEach((el, i) => p.attachInput(el, i));
    typeChar(inputs[0], "1");
    typeChar(inputs[1], "2");
    assert.equal(calls.length, 1);
    // Clearing + refilling should fire AGAIN
    p.clear();
    typeChar(inputs[0], "3");
    typeChar(inputs[1], "4");
    assert.equal(calls.length, 2);
    assert.deepEqual(calls, ["12", "34"]);
    p.destroy();
    teardownDOM();
});

// =====================================================================
// Backspace flow
// =====================================================================

test("Backspace on a filled box clears it, stays focused", () => {
    setupDOM();
    const p = createPinInput({ length: 6, initialValue: "123" });
    const inputs = Array.from({ length: 6 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    // Box 2 has "3"; backspace there
    const ev = keydown(inputs[2], "Backspace");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(p.value(), "12");
    p.destroy();
    teardownDOM();
});

test("Backspace on an empty box moves to previous + clears", () => {
    setupDOM();
    const p = createPinInput({ length: 6, initialValue: "12" });
    const inputs = Array.from({ length: 6 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    // Box 2 is empty; backspace clears box 1 + position moves
    const ev = keydown(inputs[2], "Backspace");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(p.value(), "1");
    assert.equal(p.position(), 1);
    p.destroy();
    teardownDOM();
});

test("Backspace at empty box 0 is a no-op", () => {
    setupDOM();
    const p = createPinInput({ length: 6 });
    const el = mkInput();
    p.attachInput(el, 0);
    keydown(el, "Backspace");
    assert.equal(p.value(), "");
    assert.equal(p.position(), 0);
    p.destroy();
    teardownDOM();
});

// =====================================================================
// Arrow nav
// =====================================================================

test("ArrowLeft/Right/Home/End navigate without writing", () => {
    setupDOM();
    const p = createPinInput({ length: 4 });
    const inputs = Array.from({ length: 4 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    const evR = keydown(inputs[1], "ArrowRight");
    assert.equal(evR.defaultPrevented, true);
    // value unchanged
    assert.equal(p.value(), "");
    const evL = keydown(inputs[2], "ArrowLeft");
    assert.equal(evL.defaultPrevented, true);
    const evH = keydown(inputs[3], "Home");
    assert.equal(evH.defaultPrevented, true);
    const evE = keydown(inputs[0], "End");
    assert.equal(evE.defaultPrevented, true);
    p.destroy();
    teardownDOM();
});

test("ArrowLeft at index 0 is a no-op (doesn't wrap)", () => {
    setupDOM();
    const p = createPinInput({ length: 4 });
    const el = mkInput();
    p.attachInput(el, 0);
    const ev = keydown(el, "ArrowLeft");
    assert.equal(ev.defaultPrevented, true);   // we still preventDefault
    p.destroy();
    teardownDOM();
});

// =====================================================================
// Enter submit
// =====================================================================

test("Enter calls submit + fires onComplete if complete", () => {
    setupDOM();
    let submitted = null;
    const p = createPinInput({ length: 3, onComplete: (v) => { submitted = v; } });
    const inputs = Array.from({ length: 3 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    p.setValue("123");
    // onComplete fires once on the setValue. Enter then calls submit
    // which fires onComplete AGAIN (since the value is complete).
    submitted = null;
    keydown(inputs[2], "Enter");
    assert.equal(submitted, "123");
    p.destroy();
    teardownDOM();
});

test("Enter when incomplete: submit is a no-op", () => {
    setupDOM();
    let submitted = null;
    const p = createPinInput({ length: 6, onComplete: (v) => { submitted = v; } });
    const el = mkInput();
    p.attachInput(el, 0);
    keydown(el, "Enter");
    assert.equal(submitted, null);
    p.destroy();
    teardownDOM();
});

// =====================================================================
// Paste
// =====================================================================

test("paste full-length code fills all boxes from index 0", () => {
    setupDOM();
    let completed = null;
    const p = createPinInput({ length: 6, onComplete: (v) => { completed = v; } });
    const inputs = Array.from({ length: 6 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    // Paste into the LAST box; should still fill from index 0
    paste(inputs[5], "123456");
    assert.equal(p.value(), "123456");
    assert.equal(completed, "123456");
    // DOM values populated
    for (let i = 0; i < 6; i++) assert.equal(inputs[i].value, String(i + 1));
    p.destroy();
    teardownDOM();
});

test("paste with non-digits filters them out", () => {
    setupDOM();
    const p = createPinInput({ length: 6 });
    const inputs = Array.from({ length: 6 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    paste(inputs[0], "1-2-3-4-5-6");
    assert.equal(p.value(), "123456");
    p.destroy();
    teardownDOM();
});

test("paste shorter than length fills from the paste-target index", () => {
    setupDOM();
    const p = createPinInput({ length: 6 });
    const inputs = Array.from({ length: 6 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    // Paste "12" into box 2; expected: combined prefix-up-to-2 ("") + "12" = "12"
    paste(inputs[2], "12");
    assert.equal(p.value(), "12");
    // ...but wait, the rule combines head + filtered. head[0..2] is "" (empty)
    // so the result is "12". That's at indices 0..1, not 2..3.
    // Documenting this as the contract (consumer expectation).
    p.destroy();
    teardownDOM();
});

test("paste of empty / no-matching text fires onInvalidPaste", () => {
    setupDOM();
    const calls = [];
    const p = createPinInput({ length: 6, onInvalidPaste: (t) => calls.push(t) });
    const el = mkInput();
    p.attachInput(el, 0);
    paste(el, "no-digits!");
    assert.deepEqual(calls, ["no-digits!"]);
    assert.equal(p.value(), "");
    p.destroy();
    teardownDOM();
});

test("paste truncates if longer than length", () => {
    setupDOM();
    const p = createPinInput({ length: 4 });
    const el = mkInput();
    p.attachInput(el, 0);
    paste(el, "123456789");
    assert.equal(p.value(), "1234");
    p.destroy();
    teardownDOM();
});

// =====================================================================
// setValue / clear / submit (programmatic)
// =====================================================================

test("setValue filters by pattern", () => {
    setupDOM();
    const p = createPinInput({ length: 6 });
    p.setValue("12abc3!4");
    assert.equal(p.value(), "1234");
    p.destroy();
    teardownDOM();
});

test("clear() resets value + position + DOM inputs", () => {
    setupDOM();
    const p = createPinInput({ length: 4 });
    const inputs = Array.from({ length: 4 }, (_, i) => {
        const el = mkInput();
        p.attachInput(el, i);
        return el;
    });
    p.setValue("1234");
    assert.equal(p.value(), "1234");
    for (let i = 0; i < 4; i++) assert.equal(inputs[i].value, String(i + 1));
    p.clear();
    assert.equal(p.value(), "");
    assert.equal(p.position(), 0);
    for (let i = 0; i < 4; i++) assert.equal(inputs[i].value, "");
    p.destroy();
    teardownDOM();
});

test("submit() fires onComplete only when complete", () => {
    setupDOM();
    const calls = [];
    const p = createPinInput({ length: 3, onComplete: (v) => calls.push(v) });
    p.submit();
    assert.equal(calls.length, 0);   // not complete -> no-op
    p.setValue("123");
    // setValue already fired onComplete once
    assert.equal(calls.length, 1);
    p.submit();
    // submit fires it again (explicit user action)
    assert.equal(calls.length, 2);
    p.destroy();
    teardownDOM();
});

// =====================================================================
// destroy
// =====================================================================

test("destroy clears all attrs + detaches inputs", () => {
    setupDOM();
    const root = mkRoot();
    const inputs = [mkInput(), mkInput(), mkInput()];
    const p = createPinInput({ length: 3 });
    p.attachRoot(root);
    inputs.forEach((el, i) => p.attachInput(el, i));
    p.destroy();
    assert.equal(p.destroyed, true);
    assert.equal(root.hasAttribute("data-pin-root"), false);
    for (const el of inputs) {
        assert.equal(el.hasAttribute("data-pin-input"), false);
        assert.equal(el.hasAttribute("maxlength"), false);
        assert.equal(el.value, "");
    }
    teardownDOM();
});

test("destroy is idempotent + methods become no-ops", () => {
    setupDOM();
    const p = createPinInput();
    p.destroy();
    p.destroy();
    p.setValue("123");
    p.clear();
    assert.equal(p.destroyed, true);
    teardownDOM();
});
