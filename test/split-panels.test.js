// split-panels.test.js -- end-to-end createSplitPanels wiring

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createSplitPanels } from "../src/split-panels/index.js";

function mkDOM(orientation = "horizontal") {
    const container = document.createElement("div");
    container.style.width = "1000px";
    container.style.height = "600px";
    // happy-dom doesn't compute layout, so we patch getBoundingClientRect
    // to return our fixed dimensions. This is enough to exercise the
    // pointer math; real-browser layout is tested by playwright specs.
    container.getBoundingClientRect = () => ({
        x: 0, y: 0, top: 0, left: 0,
        width: 1000, height: 600,
        right: 1000, bottom: 600,
    });
    const panelA = document.createElement("div");
    const panelB = document.createElement("div");
    const panelC = document.createElement("div");
    const handle1 = document.createElement("div");
    const handle2 = document.createElement("div");
    container.append(panelA, handle1, panelB, handle2, panelC);
    document.body.append(container);
    return { container, panelA, panelB, panelC, handle1, handle2 };
}

function approxEqual(a, b, eps = 0.01) {
    return Math.abs(a - b) < eps;
}

test("default layout splits evenly across N panels when no defaults given", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels();
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);

    const layout = split.layout();
    assert.equal(layout.length, 2);
    assert.ok(approxEqual(layout[0], 50), `panelA ~50%, got ${layout[0]}`);
    assert.ok(approxEqual(layout[1], 50), `panelB ~50%, got ${layout[1]}`);

    split.destroy();
    teardownDOM();
});

test("defaultLayout option seeds initial sizes", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [30, 70] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);

    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 30));
    assert.ok(approxEqual(layout[1], 70));
    split.destroy();
    teardownDOM();
});

test("CSS custom properties are written to the container", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [25, 75] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);

    assert.equal(container.style.getPropertyValue("--lh-panel-0-pct"), "25.0000");
    assert.equal(container.style.getPropertyValue("--lh-panel-1-pct"), "75.0000");
    split.destroy();
    teardownDOM();
});

test("setLayout publishes new sizes and triggers paint", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);

    split.setLayout([20, 80]);
    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 20));
    assert.ok(approxEqual(layout[1], 80));
    assert.equal(container.style.getPropertyValue("--lh-panel-0-pct"), "20.0000");
    split.destroy();
    teardownDOM();
});

test("setLayout enforces panel minSize via redistribution", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels();
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 20 });
    split.attachPanel(panelB, 1, { minSize: 20 });

    // Ask for 5/95 -- panelA is below its minSize:20, so the engine should
    // clamp it up and take the difference from panelB.
    split.setLayout([5, 95]);
    const layout = split.layout();
    assert.ok(layout[0] >= 20, `panelA clamped to >= 20, got ${layout[0]}`);
    assert.ok(layout[1] >= 20);
    assert.ok(approxEqual(layout[0] + layout[1], 100));
    split.destroy();
    teardownDOM();
});

test("attachHandle sets role + aria-orientation + tabindex (W3C: perpendicular to panel arrangement)", () => {
    setupDOM();
    // vertical panel arrangement (stacked top/bottom) -> separator is
    // a HORIZONTAL line per W3C ARIA spec
    const { container, panelA, panelB, handle1 } = mkDOM("vertical");
    const split = createSplitPanels({ orientation: "vertical" });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    assert.equal(handle1.getAttribute("role"), "separator");
    assert.equal(handle1.getAttribute("aria-orientation"), "horizontal",
        "vertical panel arrangement -> horizontal separator line per W3C ARIA spec");
    assert.equal(handle1.getAttribute("tabindex"), "0");
    split.destroy();
    teardownDOM();
});

test("aria-orientation: horizontal panel arrangement -> vertical separator line", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM("horizontal");
    const split = createSplitPanels({ orientation: "horizontal" });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);
    assert.equal(handle1.getAttribute("aria-orientation"), "vertical",
        "horizontal panel arrangement -> vertical separator line per W3C ARIA spec");
    split.destroy();
    teardownDOM();
});

test("aria-valuenow on handle reflects left panel size", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [40, 60] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    assert.equal(handle1.getAttribute("aria-valuenow"), "40");
    split.setLayout([65, 35]);
    assert.equal(handle1.getAttribute("aria-valuenow"), "65");
    split.destroy();
    teardownDOM();
});

test("keyboard ArrowRight increments left panel by keyboardStep", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50], keyboardStep: 10 });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    handle1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 60), `expected 60, got ${layout[0]}`);
    assert.ok(approxEqual(layout[1], 40));
    split.destroy();
    teardownDOM();
});

test("keyboard ArrowLeft decrements with mirrored result", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50], keyboardStep: 5 });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    handle1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 45));
    assert.ok(approxEqual(layout[1], 55));
    split.destroy();
    teardownDOM();
});

test("vertical orientation uses ArrowUp/ArrowDown for keyboard", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM("vertical");
    const split = createSplitPanels({
        orientation: "vertical",
        defaultLayout: [40, 60],
        keyboardStep: 10,
    });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    // ArrowLeft should be ignored (horizontal key, vertical orientation)
    handle1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    assert.ok(approxEqual(split.layout()[0], 40), "horizontal key ignored on vertical handle");

    // ArrowDown should advance the left panel
    handle1.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    assert.ok(approxEqual(split.layout()[0], 50));
    split.destroy();
    teardownDOM();
});

test("Home pushes left panel to minSize", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [70, 30] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 15 });
    split.attachPanel(panelB, 1, { minSize: 15 });
    split.attachHandle(handle1, 0);

    handle1.dispatchEvent(new KeyboardEvent("keydown", { key: "Home" }));
    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 15));
    assert.ok(approxEqual(layout[1], 85));
    split.destroy();
    teardownDOM();
});

test("End pushes left panel as far right as constraints allow", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [30, 70] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 10, maxSize: 80 });
    split.attachPanel(panelB, 1, { minSize: 20 });
    split.attachHandle(handle1, 0);

    handle1.dispatchEvent(new KeyboardEvent("keydown", { key: "End" }));
    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 80), `End -> max 80, got ${layout[0]}`);
    assert.ok(approxEqual(layout[1], 20));
    split.destroy();
    teardownDOM();
});

test("pointerdown -> pointermove -> pointerup updates layout via drag", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    // Simulate a drag of +100px on a 1000px-wide container (= +10%).
    handle1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 500, clientY: 300, pointerId: 1, button: 0 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 600, clientY: 300, pointerId: 1 }));
    document.dispatchEvent(new PointerEvent("pointerup",   { clientX: 600, clientY: 300, pointerId: 1 }));

    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 60), `after +10% drag, panelA=60, got ${layout[0]}`);
    assert.ok(approxEqual(layout[1], 40));
    split.destroy();
    teardownDOM();
});

test("drag respects panel minSize -- excess goes nowhere", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 30 });
    split.attachPanel(panelB, 1, { minSize: 30 });
    split.attachHandle(handle1, 0);

    // Drag -300px (would push panelA to 20% -- below its min of 30%).
    handle1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 500, clientY: 300, pointerId: 1, button: 0 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 200, clientY: 300, pointerId: 1 }));
    document.dispatchEvent(new PointerEvent("pointerup",   { clientX: 200, clientY: 300, pointerId: 1 }));

    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 30), `clamped at min 30, got ${layout[0]}`);
    assert.ok(approxEqual(layout[1], 70));
    split.destroy();
    teardownDOM();
});

test("collapsible panel snaps to 0 below threshold", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [40, 60], snapThreshold: 0.5 });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 20, collapsible: true });
    split.attachPanel(panelB, 1, { minSize: 20 });
    split.attachHandle(handle1, 0);

    // Drag panelA toward 5% (below minSize:20 * snapThreshold:0.5 = 10%);
    // should snap to 0.
    handle1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 400, clientY: 300, pointerId: 1, button: 0 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 300, pointerId: 1 }));
    document.dispatchEvent(new PointerEvent("pointerup",   { clientX: 50, clientY: 300, pointerId: 1 }));

    const layout = split.layout();
    assert.equal(layout[0], 0, `panelA collapsed to 0, got ${layout[0]}`);
    assert.ok(approxEqual(layout[1], 100));
    split.destroy();
    teardownDOM();
});

test("non-collapsible panel does NOT snap to 0; clamps at min", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [40, 60] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 20 /* no collapsible */ });
    split.attachPanel(panelB, 1, { minSize: 20 });
    split.attachHandle(handle1, 0);

    handle1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 400, clientY: 300, pointerId: 1, button: 0 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 50, clientY: 300, pointerId: 1 }));
    document.dispatchEvent(new PointerEvent("pointerup",   { clientX: 50, clientY: 300, pointerId: 1 }));

    const layout = split.layout();
    assert.ok(approxEqual(layout[0], 20), `clamps at min 20, got ${layout[0]}`);
    split.destroy();
    teardownDOM();
});

test("collapsePanel + expandPanel programmatic API", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [30, 70] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { minSize: 10, collapsible: true });
    split.attachPanel(panelB, 1, { minSize: 10 });

    split.collapsePanel(0);
    assert.equal(split.layout()[0], 0);
    assert.ok(approxEqual(split.layout()[1], 100));

    split.expandPanel(0);
    // Restored to last non-zero (the original 30)
    assert.ok(approxEqual(split.layout()[0], 30));
    split.destroy();
    teardownDOM();
});

test("expandPanel with sizeOverride", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [30, 70] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0, { collapsible: true });
    split.attachPanel(panelB, 1);

    split.collapsePanel(0);
    split.expandPanel(0, 45);
    assert.ok(approxEqual(split.layout()[0], 45));
    split.destroy();
    teardownDOM();
});

test("3-panel layout: dragging handle 0 doesn't affect panel 2", () => {
    setupDOM();
    const { container, panelA, panelB, panelC, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [30, 40, 30] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachPanel(panelC, 2);
    split.attachHandle(handle1, 0);

    handle1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 300, clientY: 300, pointerId: 1, button: 0 }));
    document.dispatchEvent(new PointerEvent("pointermove", { clientX: 400, clientY: 300, pointerId: 1 }));
    document.dispatchEvent(new PointerEvent("pointerup",   { clientX: 400, clientY: 300, pointerId: 1 }));

    const layout = split.layout();
    // Handle 0 moves panel A and B by +/-10%. Panel C is untouched.
    assert.ok(approxEqual(layout[0], 40));
    assert.ok(approxEqual(layout[1], 30));
    assert.ok(approxEqual(layout[2], 30), `panel C untouched, got ${layout[2]}`);
    split.destroy();
    teardownDOM();
});

test("onLayoutChange fires with sizes + reason", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const calls = [];
    const split = createSplitPanels({
        defaultLayout: [50, 50],
        onLayoutChange: (sizes, reason) => calls.push({ sizes: sizes.slice(), reason }),
    });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    // attach normalizes -> publishes; setLayout publishes again
    const before = calls.length;
    split.setLayout([35, 65]);
    assert.ok(calls.length > before);
    const last = calls[calls.length - 1];
    assert.equal(last.reason, "set");
    assert.ok(approxEqual(last.sizes[0], 35));
    split.destroy();
    teardownDOM();
});

test("destroy is idempotent and stops further publishes", () => {
    setupDOM();
    const { container, panelA, panelB } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);

    split.destroy();
    assert.equal(split.destroyed, true);
    split.destroy();   // no throw
    // After destroy, setLayout is a no-op (no publish).
    split.setLayout([20, 80]);
    // Last published layout was the initial; we don't enforce identity but
    // the container's CSS var should not reflect the post-destroy attempt.
    assert.notEqual(container.style.getPropertyValue("--lh-panel-0-pct"), "20.0000");
    teardownDOM();
});

test("attaching a third panel after construction recomputes the layout", () => {
    setupDOM();
    const { container, panelA, panelB, panelC } = mkDOM();
    const split = createSplitPanels();
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    assert.equal(split.layout().length, 2);
    split.attachPanel(panelC, 2);
    assert.equal(split.layout().length, 3);
    // All three should sum to 100
    const total = split.layout().reduce((a, b) => a + b, 0);
    assert.ok(approxEqual(total, 100));
    split.destroy();
    teardownDOM();
});

test("data-resizing on container during drag, removed on release", () => {
    setupDOM();
    const { container, panelA, panelB, handle1 } = mkDOM();
    const split = createSplitPanels({ defaultLayout: [50, 50] });
    split.attachContainer(container);
    split.attachPanel(panelA, 0);
    split.attachPanel(panelB, 1);
    split.attachHandle(handle1, 0);

    assert.equal(container.hasAttribute("data-resizing"), false);
    handle1.dispatchEvent(new PointerEvent("pointerdown", { clientX: 500, clientY: 300, pointerId: 1, button: 0 }));
    assert.equal(container.hasAttribute("data-resizing"), true);
    assert.equal(handle1.hasAttribute("data-dragging"), true);
    document.dispatchEvent(new PointerEvent("pointerup", { clientX: 500, clientY: 300, pointerId: 1 }));
    assert.equal(container.hasAttribute("data-resizing"), false);
    assert.equal(handle1.hasAttribute("data-dragging"), false);
    split.destroy();
    teardownDOM();
});
