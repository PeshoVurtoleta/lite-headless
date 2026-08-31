// time-picker.test.js -- createTimePicker: spinbutton ARIA, spin/wrap,
// typeahead, hour12 resolution, boundary options, destroy/seal semantics.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey } from "./_setup.js";
import { createTimePicker } from "../src/time-picker/index.js";

function seg() { return document.createElement("span"); }

test("hour12: true -- hour segment ARIA range is 1..12, valuetext unpadded", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: true, defaultValue: { hour: 9, minute: 5 } });
        const h = seg();
        tp.attachHourSegment(h);
        assert.equal(h.getAttribute("role"), "spinbutton");
        assert.equal(h.getAttribute("aria-valuemin"), "1");
        assert.equal(h.getAttribute("aria-valuemax"), "12");
        assert.equal(h.getAttribute("aria-valuenow"), "9");
        assert.equal(h.getAttribute("aria-valuetext"), "9");
        tp.destroy();
    } finally { teardownDOM(); }
});

test("hour12: false -- hour segment range 0..23, valuetext zero-padded", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 9, minute: 5 } });
        const h = seg();
        tp.attachHourSegment(h);
        assert.equal(h.getAttribute("aria-valuemin"), "0");
        assert.equal(h.getAttribute("aria-valuemax"), "23");
        assert.equal(h.getAttribute("aria-valuenow"), "9");
        assert.equal(h.getAttribute("aria-valuetext"), "09");
        tp.destroy();
    } finally { teardownDOM(); }
});

test("hour12 resolution: explicit option always wins over Intl", () => {
    setupDOM();
    try {
        const a = createTimePicker({ hour12: true });
        assert.equal(a.hour12, true);
        const b = createTimePicker({ hour12: false });
        assert.equal(b.hour12, false);
        // No override -> a boolean is resolved once from Intl.
        const c = createTimePicker({});
        assert.equal(typeof c.hour12, "boolean");
        a.destroy(); b.destroy(); c.destroy();
    } finally { teardownDOM(); }
});

test("spin: ArrowUp/Down on minute wraps 0<->59", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
        const m = seg();
        tp.attachMinuteSegment(m);
        dispatchKey(m, "ArrowDown");             // 0 -> 59 (wrap)
        assert.equal(tp.minute(), 59);
        assert.equal(m.getAttribute("aria-valuenow"), "59");
        assert.equal(m.getAttribute("aria-valuetext"), "59");
        dispatchKey(m, "ArrowUp");               // 59 -> 0 (wrap)
        assert.equal(tp.minute(), 0);
        assert.equal(m.getAttribute("aria-valuetext"), "00");
        tp.destroy();
    } finally { teardownDOM(); }
});

test("spin: hour wraps 23<->0 in 24h mode", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 23, minute: 0 } });
        const h = seg();
        tp.attachHourSegment(h);
        dispatchKey(h, "ArrowUp");               // 23 -> 0
        assert.equal(tp.hour(), 0);
        dispatchKey(h, "ArrowDown");             // 0 -> 23
        assert.equal(tp.hour(), 23);
        tp.destroy();
    } finally { teardownDOM(); }
});

test("typeahead: consecutive digits accumulate then clamp (12h hour)", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: true, defaultValue: { hour: 0, minute: 0 } });
        const h = seg();
        tp.attachHourSegment(h);
        dispatchKey(h, "1");
        dispatchKey(h, "2");                     // "12" -> display 12 -> 0 or 12 hour
        assert.equal(h.getAttribute("aria-valuenow"), "12");
        tp.destroy();
    } finally { teardownDOM(); }
});

test("typeahead: minute digits accumulate to two-digit value", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
        const m = seg();
        tp.attachMinuteSegment(m);
        dispatchKey(m, "4");
        dispatchKey(m, "5");                     // -> 45
        assert.equal(tp.minute(), 45);
        tp.destroy();
    } finally { teardownDOM(); }
});

test("meridiem: spin toggles AM<->PM and shifts hour by 12", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: true, defaultValue: { hour: 9, minute: 0 } });
        const md = seg();
        tp.attachMeridiem(md);
        assert.equal(md.getAttribute("aria-valuetext"), "AM");
        assert.equal(md.getAttribute("aria-valuenow"), "0");
        dispatchKey(md, "ArrowUp");              // AM -> PM
        assert.equal(tp.hour(), 21);
        assert.equal(md.getAttribute("aria-valuetext"), "PM");
        assert.equal(md.getAttribute("aria-valuenow"), "1");
        dispatchKey(md, "p");                    // already PM -> no change
        assert.equal(tp.hour(), 21);
        dispatchKey(md, "a");                    // PM -> AM
        assert.equal(tp.hour(), 9);
        tp.destroy();
    } finally { teardownDOM(); }
});

test("meridiem attach is a no-op in 24h mode", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false });
        const md = seg();
        const off = tp.attachMeridiem(md);
        assert.equal(md.hasAttribute("role"), false);
        off();
        tp.destroy();
    } finally { teardownDOM(); }
});

test("boundary options: out-of-range defaultValue members clamp to valid range", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 99, minute: -5 } });
        assert.equal(tp.hour(), 23);
        assert.equal(tp.minute(), 0);
        tp.destroy();
    } finally { teardownDOM(); }
});

test("Home/End jump to segment bounds", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 10, minute: 10 } });
        const m = seg();
        tp.attachMinuteSegment(m);
        dispatchKey(m, "End");
        assert.equal(tp.minute(), 59);
        dispatchKey(m, "Home");
        assert.equal(tp.minute(), 0);
        tp.destroy();
    } finally { teardownDOM(); }
});

test("listbox slot mode: attachSlot selects on click, reflects aria-selected", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 0, minute: 0 } });
        const list = document.createElement("div");
        tp.attachSlotList(list);
        assert.equal(list.getAttribute("role"), "listbox");
        const slot = document.createElement("div");
        tp.attachSlot(slot, { hour: 14, minute: 30 });
        assert.equal(slot.getAttribute("role"), "option");
        assert.equal(slot.getAttribute("aria-selected"), "false");
        slot.dispatchEvent(new globalThis.Event("click", { bubbles: true, cancelable: true }));
        assert.equal(tp.hour(), 14);
        assert.equal(tp.minute(), 30);
        assert.equal(slot.getAttribute("aria-selected"), "true");
        tp.destroy();
    } finally { teardownDOM(); }
});

test("unknown option key throws TypeError with did-you-mean", () => {
    setupDOM();
    try {
        assert.throws(() => createTimePicker({ hour_12: true }), (e) => e.name === "TypeError");
        assert.throws(() => createTimePicker({ minuteStepp: 5 }), (e) => /minuteStep/.test(e.message));
    } finally { teardownDOM(); }
});

test("destroy: reads freeze at final value, writes no-op (H-12 seal)", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 8, minute: 15 } });
        const h = seg();
        tp.attachHourSegment(h);
        tp.destroy();
        assert.equal(tp.destroyed, true);
        // frozen reads
        assert.equal(tp.hour(), 8);
        assert.equal(tp.minute(), 15);
        // writes are inert after destroy
        tp.setValue({ hour: 1, minute: 1 });
        tp.spinHour(1);
        assert.equal(tp.hour(), 8);
        assert.equal(tp.minute(), 15);
    } finally { teardownDOM(); }
});

test("controlled value: external accessor is the source of truth", () => {
    setupDOM();
    try {
        let state = { hour: 3, minute: 3 };
        const sig = () => state;
        sig.set = (v) => { state = v; };
        const tp = createTimePicker({ hour12: false, value: sig });
        const m = seg();
        tp.attachMinuteSegment(m);
        assert.equal(tp.minute(), 3);
        dispatchKey(m, "ArrowUp");               // 3 -> 4
        assert.equal(state.minute, 4);
        assert.equal(tp.minute(), 4);
        tp.destroy();
    } finally { teardownDOM(); }
});

test("destroy: runs segment/slot cleanups -- roles + listeners removed from consumer els", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: true, defaultValue: { hour: 9, minute: 5 } });
        const h = seg(), m = seg(), md = seg();
        const list = document.createElement("div");
        const slot = document.createElement("div");
        tp.attachHourSegment(h);
        tp.attachMinuteSegment(m);
        tp.attachMeridiem(md);
        tp.attachSlotList(list);
        tp.attachSlot(slot, { hour: 10, minute: 30 });
        assert.equal(h.getAttribute("role"), "spinbutton");
        assert.equal(list.getAttribute("role"), "listbox");
        assert.equal(slot.getAttribute("role"), "option");
        tp.destroy();
        // roles stripped from every consumer element
        assert.equal(h.hasAttribute("role"), false);
        assert.equal(m.hasAttribute("role"), false);
        assert.equal(md.hasAttribute("role"), false);
        assert.equal(list.hasAttribute("role"), false);
        assert.equal(slot.hasAttribute("role"), false);
        // slot click listener gone: a click after destroy changes nothing
        slot.dispatchEvent(new globalThis.Event("click", { bubbles: true, cancelable: true }));
        assert.equal(tp.hour(), 9);
        assert.equal(tp.minute(), 5);
    } finally { teardownDOM(); }
});

test("destroy: double-destroy is safe (idempotent)", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 1, minute: 2 } });
        tp.attachHourSegment(seg());
        tp.destroy();
        assert.doesNotThrow(() => tp.destroy());
        assert.equal(tp.hour(), 1);
    } finally { teardownDOM(); }
});

test("destroy: a cleanup that throws does not stop the remaining cleanups", () => {
    setupDOM();
    try {
        const tp = createTimePicker({ hour12: false, defaultValue: { hour: 3, minute: 4 } });
        const h = seg();
        const m = seg();
        tp.attachHourSegment(h);
        tp.attachMinuteSegment(m);
        // Poison the hour element's removeEventListener so its off() throws.
        h.removeEventListener = () => { throw new Error("boom"); };
        assert.doesNotThrow(() => tp.destroy());
        // the minute cleanup still ran despite the hour cleanup throwing
        assert.equal(m.hasAttribute("role"), false);
    } finally { teardownDOM(); }
});
