// slider.test.js -- createSlider: value bounds, snapping, keyboard nav,
// pointer drag (with a stubbed track rect since happy-dom doesn't lay out),
// range constraints, ARIA, CSS variable sync, orientation + inversion.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey } from "./_setup.js";
import { createSlider } from "../src/slider/index.js";

// Force a known bounding rect on the track so pointer-to-value math works
// in happy-dom (which doesn't simulate layout). The slider primitive calls
// _track.getBoundingClientRect() inside pointerToValue.
function stubTrackRect(trackEl, { left = 0, top = 0, width = 200, height = 8 } = {}) {
    Object.defineProperty(trackEl, "getBoundingClientRect", {
        value: () => ({
            left, top, width, height,
            right: left + width, bottom: top + height,
            x: left, y: top,
        }),
        configurable: true,
    });
}

function dispatchPointerEvent(target, type, opts = {}) {
    const e = new globalThis.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clientX", { value: opts.clientX ?? 0 });
    Object.defineProperty(e, "clientY", { value: opts.clientY ?? 0 });
    Object.defineProperty(e, "pointerId", { value: opts.pointerId ?? 1 });
    Object.defineProperty(e, "target", { value: opts.target ?? target });
    target.dispatchEvent(e);
    return e;
}

function build(opts = {}) {
    setupDOM();
    const track = document.createElement("div");
    const range = document.createElement("div");
    const thumb0 = document.createElement("div");
    const thumb1 = document.createElement("div");
    document.body.append(track);
    track.append(range, thumb0, thumb1);
    stubTrackRect(track);
    const slider = createSlider(opts);
    slider.attachTrack(track);
    slider.attachRange(range);
    slider.attachThumb(thumb0, 0);
    if (slider.thumbCount > 1) slider.attachThumb(thumb1, 1);
    return { slider, track, range, thumb0, thumb1 };
}

// ─── construction + invariants ─────────────────────────────────────────────

test("default value is [min] when no value given", () => {
    setupDOM();
    const s = createSlider({ min: 10, max: 50 });
    assert.deepEqual(s.value(), [10]);
    assert.equal(s.thumbCount, 1);
    s.destroy();
    teardownDOM();
});

test("defaultValue determines thumb count", () => {
    setupDOM();
    const s = createSlider({ defaultValue: [20, 60] });
    assert.deepEqual(s.value(), [20, 60]);
    assert.equal(s.thumbCount, 2);
    s.destroy();
    teardownDOM();
});

test("constructor throws on inverted bounds and on non-positive step", () => {
    setupDOM();
    assert.throws(() => createSlider({ min: 50, max: 10 }), /min must be < max/);
    assert.throws(() => createSlider({ step: 0 }), /step must be > 0/);
    assert.throws(() => createSlider({ step: -1 }), /step must be > 0/);
    teardownDOM();
});

test("initial value is clamped to min/max and snapped to step", () => {
    setupDOM();
    const s = createSlider({ min: 0, max: 100, step: 5, defaultValue: [37] });
    assert.deepEqual(s.value(), [35], "37 snapped to nearest multiple of 5 within [0,100]");
    s.destroy();
    teardownDOM();
});

test("initial value out of range is clamped", () => {
    setupDOM();
    const s = createSlider({ min: 0, max: 100, defaultValue: [-50, 200] });
    assert.deepEqual(s.value(), [0, 100]);
    s.destroy();
    teardownDOM();
});

// ─── ARIA + data attributes ────────────────────────────────────────────────

test("thumb gets role=slider with aria-valuemin/max/now + orientation", () => {
    const { slider, thumb0 } = build({ min: 0, max: 200, defaultValue: [80] });
    assert.equal(thumb0.getAttribute("role"), "slider");
    assert.equal(thumb0.getAttribute("aria-valuemin"), "0");
    assert.equal(thumb0.getAttribute("aria-valuemax"), "200");
    assert.equal(thumb0.getAttribute("aria-valuenow"), "80");
    assert.equal(thumb0.getAttribute("aria-orientation"), "horizontal");
    assert.equal(thumb0.getAttribute("tabindex"), "0");
    slider.destroy();
    teardownDOM();
});

test("track and thumb advertise orientation via data attribute", () => {
    const { slider, track, thumb0 } = build({ orientation: "vertical" });
    assert.equal(track.getAttribute("data-orientation"), "vertical");
    assert.equal(thumb0.getAttribute("data-orientation"), "vertical");
    assert.equal(thumb0.getAttribute("aria-orientation"), "vertical");
    slider.destroy();
    teardownDOM();
});

test("attachLabel wires aria-labelledby on every thumb", () => {
    const { slider, thumb0, thumb1 } = build({ defaultValue: [20, 80] });
    const label = document.createElement("span");
    label.textContent = "Volume";
    document.body.appendChild(label);
    slider.attachLabel(label);
    assert.ok(thumb0.getAttribute("aria-labelledby"));
    assert.equal(thumb0.getAttribute("aria-labelledby"), thumb1.getAttribute("aria-labelledby"));
    assert.equal(thumb0.getAttribute("aria-labelledby"), label.id);
    slider.destroy();
    teardownDOM();
});

test("disabled slider: thumb tabindex=-1 and aria-disabled set", () => {
    const { slider, thumb0 } = build({ disabled: true });
    assert.equal(thumb0.getAttribute("aria-disabled"), "true");
    assert.equal(thumb0.getAttribute("tabindex"), "-1");
    slider.destroy();
    teardownDOM();
});

// ─── CSS variable sync ─────────────────────────────────────────────────────

test("CSS variable --lh-thumb-pct reflects value at attach time", () => {
    const { slider, thumb0 } = build({ defaultValue: [25] });
    const pct = parseFloat(thumb0.style.getPropertyValue("--lh-thumb-pct"));
    assert.ok(Math.abs(pct - 25) < 0.01, "thumb at 25% (got " + pct + ")");
    slider.destroy();
    teardownDOM();
});

test("setValue updates --lh-thumb-pct on the thumb", () => {
    const { slider, thumb0 } = build({ defaultValue: [0] });
    slider.setValue([75]);
    const pct = parseFloat(thumb0.style.getPropertyValue("--lh-thumb-pct"));
    assert.ok(Math.abs(pct - 75) < 0.01);
    assert.equal(thumb0.getAttribute("aria-valuenow"), "75");
    slider.destroy();
    teardownDOM();
});

test("range fill --lh-range-start/-end span the two thumbs", () => {
    const { slider, range } = build({ defaultValue: [20, 80] });
    const start = parseFloat(range.style.getPropertyValue("--lh-range-start"));
    const end   = parseFloat(range.style.getPropertyValue("--lh-range-end"));
    assert.ok(Math.abs(start - 20) < 0.01, "start = " + start);
    assert.ok(Math.abs(end - 80) < 0.01, "end = " + end);
    slider.destroy();
    teardownDOM();
});

test("range fill on single-thumb slider spans from 0 to thumb", () => {
    const { slider, range } = build({ defaultValue: [40] });
    const start = parseFloat(range.style.getPropertyValue("--lh-range-start"));
    const end   = parseFloat(range.style.getPropertyValue("--lh-range-end"));
    assert.ok(Math.abs(start - 0) < 0.01);
    assert.ok(Math.abs(end - 40) < 0.01);
    slider.destroy();
    teardownDOM();
});

test("inverted: --lh-thumb-pct mirrors across the axis (value=25 -> pct=75)", () => {
    const { slider, thumb0 } = build({ defaultValue: [25], inverted: true });
    const pct = parseFloat(thumb0.style.getPropertyValue("--lh-thumb-pct"));
    assert.ok(Math.abs(pct - 75) < 0.01);
    slider.destroy();
    teardownDOM();
});

// ─── keyboard nav ─────────────────────────────────────────────────────────

test("ArrowRight increments by step; aria-valuenow updates", () => {
    const { slider, thumb0 } = build({ defaultValue: [50], step: 5 });
    dispatchKey(thumb0, "ArrowRight");
    assert.deepEqual(slider.value(), [55]);
    assert.equal(thumb0.getAttribute("aria-valuenow"), "55");
    slider.destroy();
    teardownDOM();
});

test("ArrowUp also increments (keyboard semantics > axis direction)", () => {
    const { slider, thumb0 } = build({ defaultValue: [50] });
    dispatchKey(thumb0, "ArrowUp");
    assert.deepEqual(slider.value(), [51]);
    slider.destroy();
    teardownDOM();
});

test("ArrowDown decrements regardless of orientation", () => {
    const { slider, thumb0 } = build({ defaultValue: [50], orientation: "vertical" });
    dispatchKey(thumb0, "ArrowDown");
    assert.deepEqual(slider.value(), [49]);
    slider.destroy();
    teardownDOM();
});

test("Shift+Arrow uses largeStep (default = 10x step)", () => {
    const { slider, thumb0 } = build({ defaultValue: [50], step: 1 });
    dispatchKey(thumb0, "ArrowRight", { shiftKey: true });
    assert.deepEqual(slider.value(), [60], "+ largeStep=10");
    slider.destroy();
    teardownDOM();
});

test("Custom largeStep is honored", () => {
    const { slider, thumb0 } = build({ defaultValue: [50], step: 1, largeStep: 25 });
    dispatchKey(thumb0, "PageUp");
    assert.deepEqual(slider.value(), [75]);
    dispatchKey(thumb0, "PageDown");
    assert.deepEqual(slider.value(), [50]);
    slider.destroy();
    teardownDOM();
});

test("Home/End jump to min/max", () => {
    const { slider, thumb0 } = build({ defaultValue: [50], min: -100, max: 100 });
    dispatchKey(thumb0, "End");
    assert.deepEqual(slider.value(), [100]);
    dispatchKey(thumb0, "Home");
    assert.deepEqual(slider.value(), [-100]);
    slider.destroy();
    teardownDOM();
});

test("ArrowRight at max is a no-op (clamped)", () => {
    const { slider, thumb0 } = build({ defaultValue: [100], max: 100 });
    dispatchKey(thumb0, "ArrowRight");
    assert.deepEqual(slider.value(), [100]);
    slider.destroy();
    teardownDOM();
});

test("disabled: keyboard events are ignored", () => {
    const { slider, thumb0 } = build({ defaultValue: [50], disabled: true });
    dispatchKey(thumb0, "ArrowRight");
    assert.deepEqual(slider.value(), [50]);
    slider.destroy();
    teardownDOM();
});

// ─── range constraints ────────────────────────────────────────────────────

test("range slider: keyboard cannot push a thumb past its neighbor", () => {
    const { slider, thumb0 } = build({ defaultValue: [49, 50], step: 1, minStepsBetweenThumbs: 0 });
    dispatchKey(thumb0, "ArrowRight");
    // thumb0 was 49, +1 = 50 which equals thumb1; with minStepsBetweenThumbs=0
    // thumbs can touch but not cross, so 50 is allowed.
    assert.deepEqual(slider.value(), [50, 50]);
    dispatchKey(thumb0, "ArrowRight");
    // now thumb0=50 trying to go to 51 -- but thumb1 is at 50, gap=0 means
    // thumb0 must stay <= thumb1 = 50, so this is blocked.
    assert.deepEqual(slider.value(), [50, 50], "blocked from crossing");
    slider.destroy();
    teardownDOM();
});

test("minStepsBetweenThumbs > 0 enforces a separation gap", () => {
    const { slider, thumb1 } = build({
        defaultValue: [20, 80], step: 1, minStepsBetweenThumbs: 10,
    });
    // try to push thumb1 down (left) to 25 -- should stop at 20+10 = 30
    slider.setValue([20, 25]);
    assert.deepEqual(slider.value(), [20, 30], "snapped to maintain 10-step gap");
    slider.destroy();
    teardownDOM();
});

test("minStepsBetweenThumbs = -Infinity allows crossing (advanced)", () => {
    const { slider } = build({
        defaultValue: [30, 70], step: 1, minStepsBetweenThumbs: -Infinity,
    });
    slider.setValue([80, 70]);
    assert.deepEqual(slider.value(), [80, 70], "crossing allowed");
    slider.destroy();
    teardownDOM();
});

// ─── track click + drag ────────────────────────────────────────────────────

test("clicking the track moves the nearest thumb to that position", () => {
    const { slider, track, thumb0 } = build({ defaultValue: [10], min: 0, max: 100 });
    // track is 200px wide at x=0..200; clicking at clientX=100 = 50%
    dispatchPointerEvent(track, "pointerdown", { clientX: 100, clientY: 4, target: track });
    assert.deepEqual(slider.value(), [50]);
    slider.destroy();
    teardownDOM();
});

test("track click + document pointermove drags the nearest thumb", () => {
    const { slider, track } = build({ defaultValue: [50], min: 0, max: 100 });
    dispatchPointerEvent(track, "pointerdown", { clientX: 100, clientY: 4, target: track });
    assert.equal(slider._dragging(), true);

    // simulate dragging on document
    const move = new globalThis.Event("pointermove", { bubbles: true });
    Object.defineProperty(move, "clientX", { value: 150 });
    Object.defineProperty(move, "clientY", { value: 4 });
    Object.defineProperty(move, "pointerId", { value: 1 });
    document.dispatchEvent(move);
    assert.deepEqual(slider.value(), [75]);

    // pointerup ends drag
    const up = new globalThis.Event("pointerup", { bubbles: true });
    Object.defineProperty(up, "pointerId", { value: 1 });
    document.dispatchEvent(up);
    assert.equal(slider._dragging(), false);
    slider.destroy();
    teardownDOM();
});

test("track click picks the nearest thumb in a range slider", () => {
    const { slider, track } = build({ defaultValue: [20, 80], min: 0, max: 100 });
    // click at value=75 (clientX=150 on 200px track) -- nearest is thumb1 (at 80)
    dispatchPointerEvent(track, "pointerdown", { clientX: 150, clientY: 4, target: track });
    assert.deepEqual(slider.value(), [20, 75]);
    slider.destroy();
    teardownDOM();
});

test("disabled slider: track click does nothing", () => {
    const { slider, track } = build({ defaultValue: [10], disabled: true });
    dispatchPointerEvent(track, "pointerdown", { clientX: 100, clientY: 4, target: track });
    assert.deepEqual(slider.value(), [10]);
    assert.equal(slider._dragging(), false);
    slider.destroy();
    teardownDOM();
});

// ─── vertical + inverted ──────────────────────────────────────────────────

test("vertical slider: clientY position maps to value (bottom=min, top=max)", () => {
    setupDOM();
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track);
    track.append(thumb);
    stubTrackRect(track, { left: 0, top: 0, width: 8, height: 200 });
    const slider = createSlider({ orientation: "vertical", defaultValue: [0], min: 0, max: 100 });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);
    // clientY=50 is 75% from bottom (bottom=200, 200-50=150, 150/200=75%)
    dispatchPointerEvent(track, "pointerdown", { clientX: 4, clientY: 50, target: track });
    assert.deepEqual(slider.value(), [75]);
    slider.destroy();
    teardownDOM();
});

test("inverted horizontal: clientX rises but value falls", () => {
    setupDOM();
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track);
    track.append(thumb);
    stubTrackRect(track);
    const slider = createSlider({ inverted: true, defaultValue: [0], min: 0, max: 100 });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);
    // clientX=50 on 200px = 25%, inverted -> 75%
    dispatchPointerEvent(track, "pointerdown", { clientX: 50, clientY: 4, target: track });
    assert.deepEqual(slider.value(), [75]);
    slider.destroy();
    teardownDOM();
});

// ─── lifecycle ────────────────────────────────────────────────────────────

test("destroy removes ARIA + CSS-var hooks and clears event listeners", () => {
    const { slider, thumb0, track } = build({ defaultValue: [50] });
    slider.destroy();
    assert.equal(thumb0.hasAttribute("role"), false);
    assert.equal(thumb0.hasAttribute("aria-valuenow"), false);
    assert.equal(thumb0.style.getPropertyValue("--lh-thumb-pct"), "");
    assert.equal(track.hasAttribute("data-orientation"), false);
    // post-destroy keypress does nothing
    dispatchKey(thumb0, "ArrowRight");
    // value signal is the slider's internal one and we can't easily read it
    // post-destroy; the lack of throw is the assertion here
    teardownDOM();
});

test("onValueChange fires with the full array on every change", () => {
    setupDOM();
    const calls = [];
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track, thumb);
    stubTrackRect(track);
    const slider = createSlider({
        defaultValue: [10],
        onValueChange: (v) => calls.push(v.slice()),
    });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);
    dispatchKey(thumb, "ArrowRight");
    dispatchKey(thumb, "ArrowRight");
    assert.deepEqual(calls, [[11], [12]]);
    slider.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// v0.7.9: runtime setDisabled
// -----------------------------------------------------------------

import { dispatchPointer } from "./_setup.js";

test("setDisabled(true) writes aria-disabled + data-disabled + tabindex=-1 on thumbs", () => {
    setupDOM();
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track, thumb);
    const slider = createSlider({ min: 0, max: 100, step: 1, defaultValue: [50] });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);
    assert.equal(slider.isDisabled(), false);
    assert.equal(thumb.hasAttribute("aria-disabled"), false);
    assert.equal(thumb.getAttribute("tabindex"), "0");

    slider.setDisabled(true);
    assert.equal(slider.isDisabled(), true);
    assert.equal(thumb.getAttribute("aria-disabled"), "true");
    assert.equal(thumb.getAttribute("data-disabled"), "");
    assert.equal(thumb.getAttribute("tabindex"), "-1");
    assert.equal(track.getAttribute("data-disabled"), "");
    slider.destroy();
    teardownDOM();
});

test("setDisabled(false) clears aria-disabled + data-disabled + restores tabindex", () => {
    setupDOM();
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track, thumb);
    const slider = createSlider({ min: 0, max: 100, step: 1, defaultValue: [50], disabled: true });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);
    assert.equal(slider.isDisabled(), true);
    assert.equal(thumb.getAttribute("aria-disabled"), "true");

    slider.setDisabled(false);
    assert.equal(slider.isDisabled(), false);
    assert.equal(thumb.hasAttribute("aria-disabled"), false);
    assert.equal(thumb.hasAttribute("data-disabled"), false);
    assert.equal(thumb.getAttribute("tabindex"), "0");
    assert.equal(track.hasAttribute("data-disabled"), false);
    slider.destroy();
    teardownDOM();
});

test("setDisabled(true) blocks keyboard nudges on already-attached thumbs", () => {
    setupDOM();
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track, thumb);
    const slider = createSlider({ min: 0, max: 100, step: 1, defaultValue: [50] });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);

    dispatchKey(thumb, "ArrowRight");
    assert.deepEqual(slider.value(), [51]);

    slider.setDisabled(true);
    dispatchKey(thumb, "ArrowRight");
    assert.deepEqual(slider.value(), [51], "keyboard nudge blocked when disabled");
    dispatchKey(thumb, "Home");
    assert.deepEqual(slider.value(), [51], "Home also blocked");

    slider.setDisabled(false);
    dispatchKey(thumb, "ArrowRight");
    assert.deepEqual(slider.value(), [52], "re-enable restores keyboard");
    slider.destroy();
    teardownDOM();
});

test("setDisabled is a no-op when already at the target state", () => {
    setupDOM();
    const track = document.createElement("div");
    const thumb = document.createElement("div");
    document.body.append(track, thumb);
    const slider = createSlider({ min: 0, max: 100, step: 1, defaultValue: [50] });
    slider.attachTrack(track);
    slider.attachThumb(thumb, 0);
    slider.setDisabled(false);     // already false
    slider.setDisabled(false);
    assert.equal(slider.isDisabled(), false);
    slider.setDisabled(true);
    slider.setDisabled(true);
    assert.equal(slider.isDisabled(), true);
    slider.destroy();
    teardownDOM();
});

test("setDisabled affects ALL thumbs in a multi-thumb slider", () => {
    setupDOM();
    const track = document.createElement("div");
    const t1 = document.createElement("div");
    const t2 = document.createElement("div");
    document.body.append(track, t1, t2);
    const slider = createSlider({ min: 0, max: 100, step: 1, defaultValue: [20, 80] });
    slider.attachTrack(track);
    slider.attachThumb(t1, 0);
    slider.attachThumb(t2, 1);
    slider.setDisabled(true);
    assert.equal(t1.getAttribute("aria-disabled"), "true");
    assert.equal(t2.getAttribute("aria-disabled"), "true");
    assert.equal(t1.getAttribute("tabindex"), "-1");
    assert.equal(t2.getAttribute("tabindex"), "-1");
    slider.destroy();
    teardownDOM();
});
