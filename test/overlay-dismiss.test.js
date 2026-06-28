// overlay/dismiss.test.js -- Escape key + outside-click

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, dispatchPointer } from "./_setup.js";
import { createOverlayCore } from "../src/_overlay/core.js";
import { bindEscape, bindOutsideClick } from "../src/_overlay/dismiss.js";

test("Escape closes when overlay is open", () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: true });
    bindEscape(c);
    dispatchKey(document, "Escape");
    assert.equal(c.open(), false);
    c.destroy();
    teardownDOM();
});

test("Escape is a no-op when overlay is closed", () => {
    setupDOM();
    let calls = 0;
    const c = createOverlayCore({ defaultOpen: false, onOpenChange: () => calls++ });
    bindEscape(c);
    dispatchKey(document, "Escape");
    assert.equal(calls, 0);
    c.destroy();
    teardownDOM();
});

test("Escape uses reason='escape'", () => {
    setupDOM();
    let lastReason = null;
    const c = createOverlayCore({ defaultOpen: true, onOpenChange: (_, r) => { lastReason = r; } });
    bindEscape(c);
    dispatchKey(document, "Escape");
    assert.equal(lastReason, "escape");
    c.destroy();
    teardownDOM();
});

test("Escape stack: topmost overlay receives, others stay open", () => {
    setupDOM();
    const a = createOverlayCore({ defaultOpen: true });
    const b = createOverlayCore({ defaultOpen: true });
    bindEscape(a);
    bindEscape(b); // b is topmost
    dispatchKey(document, "Escape");
    assert.equal(b.open(), false, "topmost b closes");
    assert.equal(a.open(), true,  "underneath a stays open");
    a.destroy(); b.destroy();
    teardownDOM();
});

test("destroying topmost surfaces the next one as topmost", () => {
    setupDOM();
    const a = createOverlayCore({ defaultOpen: true });
    const b = createOverlayCore({ defaultOpen: true });
    bindEscape(a);
    const offB = bindEscape(b);
    offB();
    dispatchKey(document, "Escape");
    assert.equal(a.open(), false, "with b's escape unbound, a is topmost and closes");
    a.destroy(); b.destroy();
    teardownDOM();
});

test("outside click closes when target is outside content", () => {
    setupDOM();
    const content = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(content);
    document.body.appendChild(outside);

    const c = createOverlayCore({ defaultOpen: true });
    bindOutsideClick(c, () => [content]);

    dispatchPointer(outside, "pointerdown");
    assert.equal(c.open(), false);
    c.destroy();
    teardownDOM();
});

test("outside click does NOT close when target is the content itself", () => {
    setupDOM();
    const content = document.createElement("div");
    document.body.appendChild(content);

    const c = createOverlayCore({ defaultOpen: true });
    bindOutsideClick(c, () => [content]);

    dispatchPointer(content, "pointerdown");
    assert.equal(c.open(), true);
    c.destroy();
    teardownDOM();
});

test("outside click does NOT close when target is a descendant of content", () => {
    setupDOM();
    const content = document.createElement("div");
    const child = document.createElement("button");
    content.appendChild(child);
    document.body.appendChild(content);

    const c = createOverlayCore({ defaultOpen: true });
    bindOutsideClick(c, () => [content]);

    dispatchPointer(child, "pointerdown");
    assert.equal(c.open(), true);
    c.destroy();
    teardownDOM();
});

test("outside click uses reason='outside'", () => {
    setupDOM();
    const content = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(content);
    document.body.appendChild(outside);

    let r = null;
    const c = createOverlayCore({ defaultOpen: true, onOpenChange: (_, reason) => { r = reason; } });
    bindOutsideClick(c, () => [content]);
    dispatchPointer(outside, "pointerdown");
    assert.equal(r, "outside");
    c.destroy();
    teardownDOM();
});

test("getInsides() is called fresh each event -- can be dynamic", () => {
    setupDOM();
    const a = document.createElement("div");
    const b = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(a);
    document.body.appendChild(b);
    document.body.appendChild(outside);

    let insides = [a];
    const c = createOverlayCore({ defaultOpen: true });
    bindOutsideClick(c, () => insides);

    dispatchPointer(b, "pointerdown");
    assert.equal(c.open(), false, "b was outside the dynamic insides list");

    c.destroy();
    teardownDOM();
});

test("manual off() of escape binding removes the listener", () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: true });
    const off = bindEscape(c);
    off();
    dispatchKey(document, "Escape");
    assert.equal(c.open(), true, "escape no longer reaches the overlay");
    c.destroy();
    teardownDOM();
});

test("destroy() unbinds dismiss handlers automatically", () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: true });
    bindEscape(c);
    c.destroy();
    // recreate one open for a clean check
    const c2 = createOverlayCore({ defaultOpen: true });
    dispatchKey(document, "Escape");
    assert.equal(c2.open(), true, "destroyed overlay's listener is gone");
    c2.destroy();
    teardownDOM();
});

test("outside-click checks composedPath() before falling back to contains()", () => {
    setupDOM();
    const content = document.createElement("div");
    const outside = document.createElement("div");
    document.body.appendChild(content);
    document.body.appendChild(outside);

    const c = createOverlayCore({ defaultOpen: true });
    bindOutsideClick(c, () => [content]);

    // Simulate a shadow-retargeted event: target is `outside`, but composedPath
    // includes `content` (as if the original click came from inside content's
    // descendant tree but was retargeted by shadow boundary semantics).
    const e = new globalThis.Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "composedPath", {
        value: () => [outside, content, document.body, document],
        configurable: true,
    });
    outside.dispatchEvent(e);
    assert.equal(c.open(), true, "composedPath includes inside -> NOT outside");

    c.destroy();
    teardownDOM();
});

test("outside-click uses contains() when composedPath returns a sparse path", () => {
    setupDOM();
    const content = document.createElement("div");
    const child = document.createElement("button");
    content.appendChild(child);
    document.body.appendChild(content);

    const c = createOverlayCore({ defaultOpen: true });
    bindOutsideClick(c, () => [content]);

    // composedPath returns ONLY the target -- doesn't include `content`. This
    // simulates a polyfilled or unreliable composedPath. The check is OR:
    // path-match fails, but contains() succeeds, so we stay open.
    const e = new globalThis.Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "composedPath", {
        value: () => [child],
        configurable: true,
    });
    child.dispatchEvent(e);
    assert.equal(c.open(), true, "contains() fallback recognized child as inside");

    c.destroy();
    teardownDOM();
});
