// Tests: hover-card (createHoverCard; positioned by @zakkster/lite-floating).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchPointer, dispatchKey } from "./_setup.js";
import { createRegistry, setDefaultRegistry } from "@zakkster/lite-signal";
import { createHoverCard } from "../src/hover-card/index.js";

function mkDOM() {
    const trigger = document.createElement("a");
    trigger.setAttribute("href", "/u/zak");
    const content = document.createElement("div");
    content.innerHTML = `<strong>Zak</strong>`;
    document.body.append(trigger);
    return { trigger, content };
}
function fire(el, type) { el.dispatchEvent(new globalThis.Event(type, { bubbles: false })); }

// Synthetic-rect helpers (mirror test/overlay-position.test.js): let the
// injected getRect/getViewport seam drive exact-pixel placement with NO
// dependence on the real window. See ADR 0010.
function rect(left, top, width, height) {
    return {
        left, top, width, height,
        right: left + width,
        bottom: top + height,
        x: left, y: top,
    };
}
function mkRects(map) {
    return (el) => map.get(el) || rect(0, 0, 0, 0);
}
function parseTranslate(content) {
    const t = content.style.transform || "";
    const m = /translate3d\((-?\d+)px,\s*(-?\d+)px/.exec(t);
    if (!m) return { x: null, y: null };
    return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
}

test("attachTrigger paints marker + aria-expanded=false; not open", () => {
    setupDOM();
    const { trigger } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    assert.equal(trigger.hasAttribute("data-hover-card-trigger"), true);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.hasAttribute("data-open"), false);
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("attachContent: no role, aria-hidden, data-status=closed, tabindex", () => {
    setupDOM();
    const { content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachContent(content);
    assert.equal(content.hasAttribute("data-hover-card-content"), true);
    assert.equal(content.hasAttribute("role"), false);
    assert.equal(content.getAttribute("aria-hidden"), "true");
    assert.equal(content.getAttribute("data-status"), "closed");
    assert.equal(content.getAttribute("tabindex"), "-1");
    hc.destroy(); teardownDOM();
});

test("hover opens; paints data-open/placement; lite-floating handle is live", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0, placement: "bottom-start" });
    hc.attachTrigger(trigger);
    hc.attachContent(content);

    dispatchPointer(trigger, "pointerenter");
    assert.equal(hc.open(), true);
    assert.equal(content.hasAttribute("data-open"), true);
    assert.equal(content.hasAttribute("aria-hidden"), false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    // placement painted from the floating engine
    assert.equal(content.getAttribute("data-placement"), "bottom-start");
    assert.equal(content.getAttribute("data-side"), "bottom");
    assert.equal(content.getAttribute("data-align"), "start");
    // the lite-floating instance exists while open
    assert.ok(hc._floating());
    hc.destroy(); teardownDOM();
});

test("pointer stays alive across trigger->content; closes only after both leave", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);

    dispatchPointer(trigger, "pointerenter");
    assert.equal(hc.open(), true);
    dispatchPointer(content, "pointerenter");
    dispatchPointer(trigger, "pointerleave");   // still over content
    assert.equal(hc.open(), true);
    dispatchPointer(content, "pointerleave");    // now over neither
    assert.equal(hc.open(), false);
    // floating disposed on close
    assert.equal(hc._floating(), null);
    hc.destroy(); teardownDOM();
});

test("focus opens instantly; blur closes", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 999, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);

    fire(trigger, "focus");
    assert.equal(hc.open(), true);   // focus bypasses openDelay
    fire(trigger, "blur");
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("Escape closes when open", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    dispatchPointer(trigger, "pointerenter");
    assert.equal(hc.open(), true);
    dispatchKey(document.body, "Escape");
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("setOpen(true) opens programmatically + paints content", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    hc.setOpen(true);
    assert.equal(hc.open(), true);
    assert.equal(content.hasAttribute("data-open"), true);
    assert.equal(content.getAttribute("data-placement"), "bottom");
    hc.setOpen(false);
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("attachRoot paints data-hover-card-root + mirrors data-open", () => {
    setupDOM();
    const root = document.createElement("div");
    const { trigger, content } = mkDOM();
    root.append(trigger);
    document.body.append(root);
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachRoot(root);
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    assert.equal(root.hasAttribute("data-hover-card-root"), true);
    assert.equal(root.hasAttribute("data-open"), false);
    hc.setOpen(true);
    assert.equal(root.hasAttribute("data-open"), true);
    hc.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    hc.setOpen(true);
    hc.destroy(); hc.destroy();
    assert.equal(hc.destroyed, true);
    assert.equal(trigger.hasAttribute("data-hover-card-trigger"), false);
    assert.equal(content.hasAttribute("data-hover-card-content"), false);
    teardownDOM();
});

// ---------------------------------------------------------------------------
// Injected measurement providers (getRect / getViewport) -- lite-floating
// 1.2.0's measurement seam forwarded through createHoverCard. See ADR 0010.
// requestAnimationFrame is undefined in this env, so createFloating computes
// synchronously: transform + data-side are painted by the time setOpen returns.
// ---------------------------------------------------------------------------

test("injected viewport drives flip through createHoverCard (side top, y 652)", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const rects = new Map([
        [trigger, rect(100, 760, 80, 30)],
        [content, rect(0, 0, 200, 100)],
    ]);
    const hc = createHoverCard({
        openDelay: 0, closeDelay: 0, placement: "bottom",
        getRect: mkRects(rects),
        getViewport: () => ({ width: 1000, height: 800 }),
    });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    hc.setOpen(true);
    // bottom edge 798+100=898 > 800 -> flip to top; y = 760 - 100 - 8 = 652.
    assert.equal(content.getAttribute("data-side"), "top", "flips to top when bottom overflows the injected 800-tall viewport");
    assert.equal(parseTranslate(content).y, 652, "top: y = 760 - 100 - 8");
    hc.destroy(); teardownDOM();
});

// A4 -- default path (no getRect/getViewport) unchanged.
test("A4: no getRect/getViewport -- default engine path unchanged (placement bottom painted as before)", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0, placement: "bottom" });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    hc.setOpen(true);
    assert.equal(hc.open(), true);
    assert.equal(content.getAttribute("data-placement"), "bottom");
    assert.equal(content.getAttribute("data-side"), "bottom");
    assert.equal(content.getAttribute("data-align"), "center");
    assert.ok(hc._floating(), "the default lite-floating instance is live while open");
    hc.destroy(); teardownDOM();
});

// A5 -- retention: 1000 open/destroy cycles return every signal node to the
// pool (net activeNodes back to baseline == 0 growth). Follows the repo's
// H-12 fixed-registry idiom (test/signal-pool.test.js). MUST be the last test
// in this file: setDefaultRegistry mutates the process-global default.
test("A5: 1000 open/destroy cycles leak nothing (activeNodes returns to baseline)", () => {
    setupDOM();
    const REG = createRegistry({ maxNodes: 4096 });
    setDefaultRegistry(REG);
    const baseline = REG.stats().activeNodes;
    for (let i = 0; i < 1000; i++) {
        const trigger = document.createElement("a");
        const content = document.createElement("div");
        document.body.append(trigger);
        const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
        hc.attachTrigger(trigger);
        hc.attachContent(content);
        hc.setOpen(true);
        hc.setOpen(false);
        hc.destroy();
    }
    assert.equal(REG.stats().activeNodes, baseline, "every signal node returned to the pool -- no retention across 1000 cycles");
    teardownDOM();
});
