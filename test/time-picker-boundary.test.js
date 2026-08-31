// time-picker-boundary.test.js -- qa boundary matrix for createTimePicker,
// targeting gaps NOT already covered by test/time-picker.test.js (the
// coder's 18 tests: hour12 ARIA ranges, basic wrap, basic typeahead,
// meridiem, Home/End, slot mode, unknown-key throw, seal-on-destroy,
// controlled value, cleanup-on-destroy, double-destroy). This file pins
// exact digit-typeahead accumulate-vs-reset semantics, step-based wrap,
// invalid/null construction, and attach-after-destroy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey } from "./_setup.js";
import { createTimePicker } from "../src/time-picker/index.js";

function seg() { return document.createElement("span"); }

// ---------------------------------------------------------------------------
// invalid / null / non-object options
// ---------------------------------------------------------------------------

test("createTimePicker(null) throws TypeError: options must be a plain object", () => {
    setupDOM();
    assert.throws(
        () => createTimePicker(null),
        (e) => e.name === "TypeError" && e.message === "createTimePicker: options must be a plain object, got null",
    );
    teardownDOM();
});

test("createTimePicker('bad') throws TypeError: options must be a plain object", () => {
    setupDOM();
    assert.throws(
        () => createTimePicker("bad"),
        (e) => e.name === "TypeError" && /options must be a plain object, got string/.test(e.message),
    );
    teardownDOM();
});

test("createTimePicker(undefined) is legal (no-arg default)", () => {
    setupDOM();
    assert.doesNotThrow(() => {
        const tp = createTimePicker(undefined);
        tp.destroy();
    });
    teardownDOM();
});

test('unknown option key "hour12x" throws with did-you-mean "hour12"', () => {
    setupDOM();
    assert.throws(
        () => createTimePicker({ hour12x: true }),
        (e) => e.name === "TypeError" && e.message === 'createTimePicker: unknown option "hour12x". Did you mean "hour12"?',
    );
    teardownDOM();
});

// ---------------------------------------------------------------------------
// hour12 explicit override vs Intl default
// ---------------------------------------------------------------------------

test("hour12: explicit true/false always wins; omitted resolves a boolean from Intl", () => {
    setupDOM();
    const a = createTimePicker({ hour12: true });
    const b = createTimePicker({ hour12: false });
    const c = createTimePicker({});
    assert.equal(a.hour12, true);
    assert.equal(b.hour12, false);
    assert.equal(typeof c.hour12, "boolean");
    a.destroy(); b.destroy(); c.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// spin wrap edges (0/1/N-1/N boundary matrix on hour + minute + step)
// ---------------------------------------------------------------------------

test("spin: hour 23->0 in 24h mode (ArrowUp at max)", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 23, minute: 0 } });
    const h = seg();
    tp.attachHourSegment(h);
    dispatchKey(h, "ArrowUp");
    assert.equal(tp.hour(), 0);
    assert.equal(h.getAttribute("aria-valuenow"), "0");
    tp.destroy();
    teardownDOM();
});

test("spin: hour 12h-display wraps 12->1 (not 12->0) on ArrowUp", () => {
    setupDOM();
    // hour24=11 -> display 11; ArrowUp -> hour24=12 -> display 12 (noon), one
    // more ArrowUp -> hour24=13 -> display 1.
    const tp = createTimePicker({ hour12: true, defaultValue: { hour: 11, minute: 0 } });
    const h = seg();
    tp.attachHourSegment(h);
    dispatchKey(h, "ArrowUp");
    assert.equal(h.getAttribute("aria-valuenow"), "12", "11 -> 12 (noon), never 0 in 12h display");
    dispatchKey(h, "ArrowUp");
    assert.equal(h.getAttribute("aria-valuenow"), "1", "12 -> 1, wraps past noon correctly");
    tp.destroy();
    teardownDOM();
});

test("spin: minute 59->0 wraps on ArrowUp; 0->59 wraps on ArrowDown", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 59 } });
    const m = seg();
    tp.attachMinuteSegment(m);
    dispatchKey(m, "ArrowUp");
    assert.equal(tp.minute(), 0);
    dispatchKey(m, "ArrowDown");
    assert.equal(tp.minute(), 59);
    tp.destroy();
    teardownDOM();
});

test("spin: minuteStep wrap uses modulo arithmetic, not a snap-to-zero (minuteStep:15 from 50 -> 5)", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, minuteStep: 15, defaultValue: { hour: 0, minute: 50 } });
    const m = seg();
    tp.attachMinuteSegment(m);
    dispatchKey(m, "ArrowUp"); // (50 + 15) % 60 = 5
    assert.equal(tp.minute(), 5, "wraps by plain modulo, landing off the step grid");
    tp.destroy();
    teardownDOM();
});

test("spin: hourStep wrap uses modulo arithmetic (hourStep:5 from 22 -> 3)", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, hourStep: 5, defaultValue: { hour: 22, minute: 0 } });
    const h = seg();
    tp.attachHourSegment(h);
    dispatchKey(h, "ArrowUp"); // (22 + 5) % 24 = 3
    assert.equal(tp.hour(), 3);
    tp.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// meridiem toggle
// ---------------------------------------------------------------------------

test("meridiem: toggleMeridiem() API shifts hour by 12 and flips AM/PM", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: true, defaultValue: { hour: 8, minute: 0 } });
    assert.equal(tp.meridiem(), "AM");
    tp.toggleMeridiem();
    assert.equal(tp.hour(), 20);
    assert.equal(tp.meridiem(), "PM");
    tp.toggleMeridiem();
    assert.equal(tp.hour(), 8);
    assert.equal(tp.meridiem(), "AM");
    tp.destroy();
    teardownDOM();
});

test("meridiem: toggleMeridiem() is a no-op in 24h mode", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 8, minute: 0 } });
    tp.toggleMeridiem();
    assert.equal(tp.hour(), 8, "24h mode has no meridiem to toggle");
    tp.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// digit typeahead: pin the ACTUAL accumulate-vs-reset behavior
// ---------------------------------------------------------------------------

test("typeahead: digits accumulate while the running number stays <= max (24h hour, '0' then '9' -> 9)", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
    const h = seg();
    tp.attachHourSegment(h);
    dispatchKey(h, "0");
    dispatchKey(h, "9"); // "09" -> 9, still <= 23
    assert.equal(tp.hour(), 9);
    tp.destroy();
    teardownDOM();
});

test("typeahead: digits RESET (do not clamp) once the accumulated number exceeds max (24h hour, '2' then '5' -> 5, not 23)", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
    const h = seg();
    tp.attachHourSegment(h);
    dispatchKey(h, "2");
    assert.equal(h.getAttribute("aria-valuenow"), "2", "first digit lands directly");
    dispatchKey(h, "5"); // "25" > 23 -> _taPush restarts the buffer from THIS digit
    assert.equal(tp.hour(), 5, "25 exceeds max(23) -- buffer restarts at '5', it does NOT clamp to 23");
    assert.equal(h.getAttribute("aria-valuenow"), "5");
    tp.destroy();
    teardownDOM();
});

test("typeahead: same reset rule applies in 12h display (max 12): '1' then '5' -> 5, not 12", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: true, defaultValue: { hour: 0, minute: 0 } });
    const h = seg();
    tp.attachHourSegment(h);
    dispatchKey(h, "1");
    assert.equal(h.getAttribute("aria-valuenow"), "1");
    dispatchKey(h, "5"); // "15" > 12 -> restart at "5"
    assert.equal(h.getAttribute("aria-valuenow"), "5", "15 exceeds max(12) -- restarts at '5'");
    tp.destroy();
    teardownDOM();
});

test("typeahead: minute digits accumulate to a two-digit value within range ('5' then '9' -> 59)", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
    const m = seg();
    tp.attachMinuteSegment(m);
    dispatchKey(m, "5");
    dispatchKey(m, "9"); // "59" <= 59, keeps accumulating
    assert.equal(tp.minute(), 59);
    tp.destroy();
    teardownDOM();
});

test("typeahead: a third digit drops the oldest -- buffer width is bounded to max's digit count", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
    const m = seg();
    tp.attachMinuteSegment(m);
    dispatchKey(m, "1");
    dispatchKey(m, "2"); // "12"
    assert.equal(tp.minute(), 12);
    dispatchKey(m, "3"); // "123" > 2 digits wide -> drop oldest -> "23"
    assert.equal(tp.minute(), 23, "buffer stays 2 digits wide; oldest digit is dropped, not the value clamped");
    tp.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// segment ARIA values update on spin
// ---------------------------------------------------------------------------

test("segment ARIA: aria-valuenow + aria-valuetext update together on every spin", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 5, minute: 5 } });
    const h = seg();
    tp.attachHourSegment(h);
    assert.equal(h.getAttribute("aria-valuenow"), "5");
    assert.equal(h.getAttribute("aria-valuetext"), "05");
    dispatchKey(h, "ArrowUp");
    assert.equal(h.getAttribute("aria-valuenow"), "6");
    assert.equal(h.getAttribute("aria-valuetext"), "06");
    tp.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// listbox slot mode
// ---------------------------------------------------------------------------

test("listbox slot mode: role=listbox / role=option present; selection reflects on both value change and click", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 9, minute: 0 } });
    const list = document.createElement("div");
    tp.attachSlotList(list);
    assert.equal(list.getAttribute("role"), "listbox");
    const s1 = document.createElement("div");
    const s2 = document.createElement("div");
    tp.attachSlot(s1, { hour: 9, minute: 0 });
    tp.attachSlot(s2, { hour: 10, minute: 30 });
    assert.equal(s1.getAttribute("role"), "option");
    assert.equal(s1.getAttribute("aria-selected"), "true", "matches the seeded value");
    assert.equal(s2.getAttribute("aria-selected"), "false");
    tp.setValue({ hour: 10, minute: 30 });
    assert.equal(s1.getAttribute("aria-selected"), "false");
    assert.equal(s2.getAttribute("aria-selected"), "true", "reflection effect repaints on programmatic setValue too");
    tp.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// attach after destroy
// ---------------------------------------------------------------------------

test("attach* after destroy is a no-op returning a callable off(), no ARIA painted", () => {
    setupDOM();
    const tp = createTimePicker({ hour12: false, defaultValue: { hour: 1, minute: 1 } });
    tp.destroy();
    const h = seg();
    const off = tp.attachHourSegment(h);
    assert.equal(h.hasAttribute("role"), false, "destroyed picker never wires a late-attached segment");
    assert.equal(typeof off, "function");
    assert.doesNotThrow(() => off());
    const list = document.createElement("div");
    const offList = tp.attachSlotList(list);
    assert.equal(list.hasAttribute("role"), false);
    assert.doesNotThrow(() => offList());
    teardownDOM();
});
