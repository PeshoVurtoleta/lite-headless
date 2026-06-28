// overlay-position.test.js -- placement math + flip + shift + arrow

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createPositioner } from "../src/_overlay/position.js";

// Synthetic rect helper: returns DOMRect-like with width/height computed.
function rect(left, top, width, height) {
    return {
        left, top, width, height,
        right: left + width,
        bottom: top + height,
        x: left, y: top,
    };
}

function mkPair() {
    const anchor = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(anchor, content);
    return { anchor, content };
}

function parseTranslate(content) {
    // expected: translate3d(Xpx, Ypx, 0)
    const t = content.style.transform || "";
    const m = /translate3d\((-?\d+)px,\s*(-?\d+)px/.exec(t);
    if (!m) return { x: null, y: null };
    return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

function mkRects(map) {
    // map: Map<element, rect>
    return (el) => map.get(el) || rect(0, 0, 0, 0);
}

test("placement: bottom (default) centers content under anchor", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],   // anchor at (100,100), 80x30
        [content, rect(0, 0, 200, 100)],     // content size 200x100
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    // bottom: y = 100 + 30 + 8 = 138; x centered: 100 + 40 - 100 = 40
    assert.equal(out.x, 40);
    assert.equal(out.y, 138);
    assert.equal(out.side, "bottom");
    assert.equal(content.getAttribute("data-side"), "bottom");
    assert.equal(content.getAttribute("data-align"), "center");
    teardownDOM();
});

test("placement: top -- content above anchor", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(200, 300, 60, 40)],
        [content, rect(0, 0, 100, 50)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "top", offset: 10,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    // top: y = 300 - 50 - 10 = 240; x = 200 + 30 - 50 = 180
    assert.equal(out.x, 180);
    assert.equal(out.y, 240);
    teardownDOM();
});

test("placement: left -- content to left of anchor, vertically centered", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(200, 200, 50, 50)],
        [content, rect(0, 0, 80, 40)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "left", offset: 5,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    // left: x = 200 - 80 - 5 = 115; y = 200 + 25 - 20 = 205
    assert.equal(out.x, 115);
    assert.equal(out.y, 205);
    teardownDOM();
});

test("placement: right -- content to right of anchor", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 40, 60)],
        [content, rect(0, 0, 120, 60)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "right", offset: 0,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    // right: x = 100 + 40 + 0 = 140; y = 100 + 30 - 30 = 100
    assert.equal(out.x, 140);
    assert.equal(out.y, 100);
    teardownDOM();
});

test("align: bottom-start aligns content's left edge to anchor's left edge", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom-start", offset: 8,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    assert.equal(out.x, 100, "x = anchor.left");
    assert.equal(content.getAttribute("data-align"), "start");
    teardownDOM();
});

test("align: bottom-end aligns content's right edge to anchor's right edge", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom-end", offset: 8,
        shift: false,            // raw alignment math (shift would clamp x to >= 0)
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    // x = anchor.right - content.width = 180 - 200 = -20
    assert.equal(out.x, -20);
    assert.equal(content.getAttribute("data-align"), "end");
    teardownDOM();
});

test("flip: bottom flips to top when no room below", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    // anchor near the BOTTOM of the viewport
    const rects = new Map([
        [anchor,  rect(100, 750, 80, 30)],   // anchor.bottom = 780
        [content, rect(0, 0, 100, 100)],     // content height 100
    ]);
    // viewport height 800. bottom: y = 780+8=788, +100=888 > 800 -> overflow.
    // top: y = 750-100-8 = 642 (safely above)
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8, flip: true,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    assert.equal(out.side, "top", "flipped to top");
    assert.equal(out.y, 642);
    teardownDOM();
});

test("flip: doesn't flip when there's room on the requested side", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],
        [content, rect(0, 0, 100, 100)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8, flip: true,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    assert.equal(out.side, "bottom");
    teardownDOM();
});

test("flip: keeps original side when BOTH sides overflow", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    // small viewport, content taller than viewport
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],
        [content, rect(0, 0, 100, 500)],  // 500 tall in a 200-tall viewport
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8, flip: true,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 200 }),
    });
    const out = p.update();
    // both top and bottom overflow; should keep bottom (the requested side)
    assert.equal(out.side, "bottom");
    teardownDOM();
});

test("shift: pushes content right when it would clip viewport's left edge", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    // anchor near left edge; content centered would put x = anchor.center - half = 5 - 100 = -95
    const rects = new Map([
        [anchor,  rect(0, 100, 10, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8, shift: true,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    assert.equal(out.x, 0, "shifted to boundary.left");
    teardownDOM();
});

test("shift: pulls content left when it would clip viewport's right edge", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(950, 100, 30, 30)],  // anchor right at 980
        [content, rect(0, 0, 200, 100)],
    ]);
    // bottom center: x = 950 + 15 - 100 = 865; x + 200 = 1065 > 1000 -> shift left to 800
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8, shift: true,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    assert.equal(out.x, 800);
    teardownDOM();
});

test("flip + shift compose: flip side, then shift cross-axis", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    // anchor at bottom-right corner; bottom overflows -> flip to top; right edge clipping shifts left
    const rects = new Map([
        [anchor,  rect(950, 750, 30, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom", offset: 8, flip: true, shift: true,
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    const out = p.update();
    assert.equal(out.side, "top");
    assert.ok(out.x + 200 <= 1000, "x stays inside viewport");
    teardownDOM();
});

test("transform is written as translate3d for compositor-only updates", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    const p = createPositioner({
        anchor, content, placement: "bottom",
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    p.update();
    const { x, y } = parseTranslate(content);
    assert.equal(x, 40);
    assert.equal(y, 138);
    assert.equal(content.style.position, "fixed");
    teardownDOM();
});

test("arrow gets data-side + cross-axis offset", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const arrow = document.createElement("span");
    content.appendChild(arrow);
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],   // anchor center x = 140
        [content, rect(0, 0, 200, 100)],
    ]);
    const p = createPositioner({
        anchor, content, arrow, placement: "bottom",
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    p.update();
    // content placed at x=40; anchor center at 140; arrow offset = 140 - 40 = 100
    assert.equal(arrow.style.left, "100px");
    assert.equal(arrow.getAttribute("data-side"), "bottom");
    teardownDOM();
});

test("autoUpdate binds and unbinds listeners idempotently", () => {
    setupDOM();
    const { anchor, content } = mkPair();
    const rects = new Map([
        [anchor,  rect(100, 100, 80, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    let updates = 0;
    const p = createPositioner({
        anchor, content,
        getRect: (el) => { updates++; return rects.get(el); },
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    p.update();
    const baseline = updates;

    const stop1 = p.autoUpdate();
    const stop2 = p.autoUpdate();
    assert.equal(stop1, stop2, "autoUpdate is idempotent");

    // trigger a scroll event
    window.dispatchEvent(new globalThis.Event("resize"));
    assert.ok(updates > baseline, "resize triggered an update");

    stop1();
    const after = updates;
    window.dispatchEvent(new globalThis.Event("resize"));
    assert.equal(updates, after, "no further updates after stop");

    p.destroy();
    teardownDOM();
});
