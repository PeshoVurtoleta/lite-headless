// rtl-alias-boundary.test.js -- qa boundary matrix for the RTL logical
// placement aliases ("inline-start" / "inline-end" [+ alignment suffix]) in
// src/_overlay/position.js, targeting gaps NOT already covered by the
// coder's alias tests at the tail of test/overlay-position.test.js (basic
// LTR/RTL resolution for both aliases, and inline-start-start alignment
// preservation). This file adds: alignment-suffix resolution for BOTH
// aliases in BOTH directions, per-open re-sampling (a fresh positioner is
// constructed on every doOpen -- direction is never cached across opens),
// and the fail-closed floating-adapter + alias interaction (the built-in
// engine resolves aliases; a pluggable positioner never sees them -- it
// gets the raw string and lite-floating rejects it loudly).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createPositioner } from "../src/_overlay/position.js";
import { createTooltip } from "../src/tooltip/index.js";
import { createFloatingPositioner } from "../src/floating-adapter.js";

function rect(left, top, width, height) {
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
}

function mkPair() {
    const anchor = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(anchor, content);
    return { anchor, content };
}

function mkRects(map) {
    return (el) => map.get(el) || rect(0, 0, 0, 0);
}

const VIEWPORT = () => ({ width: 1024, height: 768 });

// ---------------------------------------------------------------------------
// alignment suffix resolves with the physical side, in both directions
// ---------------------------------------------------------------------------

test("alias+alignment: inline-start-end resolves to left-end in LTR", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const map = new Map([[anchor, rect(200, 100, 100, 40)], [content, rect(0, 0, 60, 30)]]);
    const p = createPositioner({
        anchor, content, placement: "inline-start-end", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    p.update();
    assert.equal(p.side, "left");
    assert.equal(p.placement, "left-end", "physical side + alignment suffix both survive the alias resolution");
    assert.equal(content.getAttribute("data-side"), "left");
    assert.equal(content.getAttribute("data-align"), "end");
    p.destroy();
    teardownDOM();
});

test("alias+alignment: inline-end-end resolves to right-end in LTR", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const map = new Map([[anchor, rect(200, 100, 100, 40)], [content, rect(0, 0, 60, 30)]]);
    const p = createPositioner({
        anchor, content, placement: "inline-end-end", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    p.update();
    assert.equal(p.side, "right");
    assert.equal(p.placement, "right-end");
    assert.equal(content.getAttribute("data-side"), "right");
    assert.equal(content.getAttribute("data-align"), "end");
    p.destroy();
    teardownDOM();
});

test("alias+alignment: inline-start-start flips to right-start when anchor direction is RTL", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    anchor.style.direction = "rtl";
    const map = new Map([[anchor, rect(200, 100, 100, 40)], [content, rect(0, 0, 60, 30)]]);
    const p = createPositioner({
        anchor, content, placement: "inline-start-start", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    p.update();
    assert.equal(p.side, "right", "inline-start -> right under RTL");
    assert.equal(p.placement, "right-start", "the -start alignment suffix is preserved through the direction flip");
    p.destroy();
    teardownDOM();
});

test("alias+alignment: inline-end-start flips to left-start when anchor direction is RTL", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    anchor.style.direction = "rtl";
    const map = new Map([[anchor, rect(200, 100, 100, 40)], [content, rect(0, 0, 60, 30)]]);
    const p = createPositioner({
        anchor, content, placement: "inline-end-start", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    p.update();
    assert.equal(p.side, "left", "inline-end -> left under RTL");
    assert.equal(p.placement, "left-start");
    p.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// invalid placement string: unchanged from before this feature landed --
// the built-in engine still does not throw (raw string flows through as the
// requested side; this is pre-existing behavior, not a regression the RTL
// alias work introduced). The fail-closed guarantee lives entirely in the
// pluggable-positioner seam (below), exactly as it did before.
// ---------------------------------------------------------------------------

test("built-in engine: a garbage placement string is NOT rejected (pre-existing behavior, unaffected by the alias addition)", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const map = new Map([[anchor, rect(200, 100, 100, 40)], [content, rect(0, 0, 60, 30)]]);
    const p = createPositioner({
        anchor, content, placement: "not-a-real-placement", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    assert.doesNotThrow(() => p.update());
    p.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// dir flip between two opens re-samples direction (a fresh positioner is
// built on every doOpen; direction is never cached across the overlay's
// lifetime)
// ---------------------------------------------------------------------------

test("dir flip between two opens re-samples: LTR then RTL construction of the SAME anchor produces opposite sides", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const map = new Map([[anchor, rect(200, 100, 100, 40)], [content, rect(0, 0, 60, 30)]]);

    const p1 = createPositioner({
        anchor, content, placement: "inline-start", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    p1.update();
    assert.equal(p1.side, "left", "first open: LTR (default) -> left");
    p1.destroy();

    anchor.style.direction = "rtl";
    // A real overlay primitive (tooltip/popover/combobox) constructs a BRAND
    // NEW positioner instance in doOpen() every time -- see tooltip's
    // `_positioner = _positionerFactory({...})` at open. Direction is
    // resolved once per CONSTRUCTION, not once per overlay lifetime, so the
    // second open re-samples and flips.
    const p2 = createPositioner({
        anchor, content, placement: "inline-start", offset: 5, flip: false,
        getRect: mkRects(map), getViewport: VIEWPORT,
    });
    p2.update();
    assert.equal(p2.side, "right", "second open (fresh positioner, anchor now RTL) -> right");
    p2.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// floating-adapter + alias: the pluggable positioner never resolves the
// alias -- it forwards the raw string to lite-floating, which throws
// synchronously at first open.
// ---------------------------------------------------------------------------

test("floating-adapter + alias: an unresolved logical alias surfaces lite-floating's TypeError at first open", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(trigger, content);

    const tt = createTooltip({
        positioner: createFloatingPositioner(),
        placement: "inline-start",
        container: null,
    });
    tt.attachTrigger(trigger);
    tt.attachContent(content);

    assert.throws(
        () => tt.setOpen(true),
        (e) => e.name === "TypeError" && e.message === "lite-floating: invalid placement: inline-start",
        "the built-in engine's alias resolution is scoped to itself -- a pluggable positioner gets the raw, unresolved string",
    );
    tt.destroy();
    teardownDOM();
});
