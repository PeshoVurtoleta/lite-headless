// skeleton.test.js -- createSkeleton state + multi-source + minVisibleMs guard
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createSkeleton } from "../src/skeleton/index.js";

function mkDiv() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// =====================================================================
// Construction
// =====================================================================

test("createSkeleton: default state is loading (ready=false)", () => {
    setupDOM();
    const sk = createSkeleton();
    assert.equal(sk.ready(), false);
    assert.deepEqual(sk.pendingSources(), []);
    sk.destroy();
    teardownDOM();
});

test("createSkeleton: initiallyReady=true starts ready", () => {
    setupDOM();
    const sk = createSkeleton({ initiallyReady: true });
    assert.equal(sk.ready(), true);
    sk.destroy();
    teardownDOM();
});

test("createSkeleton: sources declared up front are tracked as pending", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["user", "posts"] });
    assert.deepEqual(sk.pendingSources().sort(), ["posts", "user"]);
    assert.equal(sk.isResolved("user"), false);
    assert.equal(sk.isResolved("posts"), false);
    sk.destroy();
    teardownDOM();
});

test("createSkeleton: throws on non-array sources", () => {
    setupDOM();
    assert.throws(() => createSkeleton({ sources: "user" }), /sources must be an array/);
    teardownDOM();
});

// =====================================================================
// attachRoot
// =====================================================================

test("attachRoot paints data-skeleton-root + role=status + aria-busy=true", () => {
    setupDOM();
    const root = mkDiv();
    const sk = createSkeleton();
    sk.attachRoot(root);
    assert.equal(root.hasAttribute("data-skeleton-root"), true);
    assert.equal(root.getAttribute("role"), "status");
    assert.equal(root.getAttribute("aria-live"), "polite");
    assert.equal(root.getAttribute("aria-busy"), "true");
    assert.equal(root.hasAttribute("data-loading"), true);
    sk.destroy();
    teardownDOM();
});

test("attachRoot when initiallyReady paints state=ready + aria-busy=false", () => {
    setupDOM();
    const root = mkDiv();
    const sk = createSkeleton({ initiallyReady: true });
    sk.attachRoot(root);
    assert.equal(root.getAttribute("aria-busy"), "false");
    assert.equal(root.hasAttribute("data-loading"), false);
    sk.destroy();
    teardownDOM();
});

test("attachRoot: off() cleans up all painted attrs", () => {
    setupDOM();
    const root = mkDiv();
    const sk = createSkeleton();
    const off = sk.attachRoot(root);
    off();
    assert.equal(root.hasAttribute("data-skeleton-root"), false);
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("aria-busy"), false);
    assert.equal(root.hasAttribute("data-loading"), false);
    sk.destroy();
    teardownDOM();
});

// =====================================================================
// attachPlaceholder + attachContent
// =====================================================================

test("attachPlaceholder paints data-skeleton; aria-hidden when ready", () => {
    setupDOM();
    const ph = mkDiv();
    const sk = createSkeleton();
    sk.attachPlaceholder(ph);
    assert.equal(ph.hasAttribute("data-skeleton"), true);
    assert.equal(ph.hasAttribute("data-loading"), true);
    assert.equal(ph.hasAttribute("aria-hidden"), false);   // not hidden during loading
    sk.reveal();
    assert.equal(ph.hasAttribute("data-loading"), false);
    assert.equal(ph.getAttribute("aria-hidden"), "true");  // hidden once content is visible
    sk.destroy();
    teardownDOM();
});

test("attachContent paints data-skeleton-content; aria-hidden when loading", () => {
    setupDOM();
    const content = mkDiv();
    const sk = createSkeleton();
    sk.attachContent(content);
    assert.equal(content.hasAttribute("data-skeleton-content"), true);
    assert.equal(content.hasAttribute("data-loading"), true);
    assert.equal(content.getAttribute("aria-hidden"), "true");
    sk.reveal();
    assert.equal(content.hasAttribute("data-loading"), false);
    assert.equal(content.hasAttribute("aria-hidden"), false);
    sk.destroy();
    teardownDOM();
});

test("multiple placeholders + contents all flip together", () => {
    setupDOM();
    const sk = createSkeleton();
    const ph1 = mkDiv(), ph2 = mkDiv(), c1 = mkDiv(), c2 = mkDiv();
    sk.attachPlaceholder(ph1);
    sk.attachPlaceholder(ph2);
    sk.attachContent(c1);
    sk.attachContent(c2);
    sk.reveal();
    for (const el of [ph1, ph2, c1, c2]) {
        assert.equal(el.hasAttribute("data-loading"), false);
    }
    sk.destroy();
    teardownDOM();
});

// =====================================================================
// setReady / reveal / conceal
// =====================================================================

test("setReady(true) reveals immediately when no minVisibleMs guard", () => {
    setupDOM();
    const root = mkDiv();
    const sk = createSkeleton();
    sk.attachRoot(root);
    sk.setReady(true);
    assert.equal(sk.ready(), true);
    assert.equal(root.hasAttribute("data-loading"), false);
    sk.destroy();
    teardownDOM();
});

test("setReady is idempotent (same value)", () => {
    setupDOM();
    let revealCount = 0;
    const sk = createSkeleton({ onReveal: () => revealCount++ });
    sk.setReady(true);
    sk.setReady(true);
    sk.setReady(true);
    assert.equal(revealCount, 1);
    sk.destroy();
    teardownDOM();
});

test("conceal goes back to loading immediately", () => {
    setupDOM();
    const root = mkDiv();
    const sk = createSkeleton({ initiallyReady: true });
    sk.attachRoot(root);
    sk.conceal();
    assert.equal(sk.ready(), false);
    assert.equal(root.hasAttribute("data-loading"), true);
    assert.equal(root.getAttribute("aria-busy"), "true");
    sk.destroy();
    teardownDOM();
});

test("onReveal fires on edge transition", () => {
    setupDOM();
    let calls = 0;
    const sk = createSkeleton({ onReveal: () => calls++ });
    assert.equal(calls, 0);
    sk.reveal();
    assert.equal(calls, 1);
    sk.conceal();
    sk.reveal();
    assert.equal(calls, 2);
    sk.destroy();
    teardownDOM();
});

test("onConceal fires on edge transition", () => {
    setupDOM();
    let calls = 0;
    const sk = createSkeleton({ initiallyReady: true, onConceal: () => calls++ });
    assert.equal(calls, 0);
    sk.conceal();
    assert.equal(calls, 1);
    sk.reveal();
    sk.conceal();
    assert.equal(calls, 2);
    sk.destroy();
    teardownDOM();
});

// =====================================================================
// Multi-source coordination
// =====================================================================

test("declared sources: resolve()ing each one eventually reveals", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["user", "posts"] });
    assert.equal(sk.ready(), false);
    sk.resolve("user");
    assert.equal(sk.ready(), false);   // still pending: posts
    sk.resolve("posts");
    assert.equal(sk.ready(), true);    // all resolved
    sk.destroy();
    teardownDOM();
});

test("resolve order doesn't matter", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["a", "b", "c"] });
    sk.resolve("c");
    sk.resolve("a");
    assert.equal(sk.ready(), false);
    sk.resolve("b");
    assert.equal(sk.ready(), true);
    sk.destroy();
    teardownDOM();
});

test("resolve on undeclared source auto-registers + marks resolved", () => {
    setupDOM();
    const sk = createSkeleton();   // no sources declared
    sk.resolve("dynamic");
    assert.equal(sk.isResolved("dynamic"), true);
    // Single-source map -> all resolved -> ready
    assert.equal(sk.ready(), true);
    sk.destroy();
    teardownDOM();
});

test("resolve on already-resolved source is a no-op", () => {
    setupDOM();
    let revealCount = 0;
    const sk = createSkeleton({ sources: ["a"], onReveal: () => revealCount++ });
    sk.resolve("a");
    assert.equal(revealCount, 1);
    sk.resolve("a");
    assert.equal(revealCount, 1);
    sk.destroy();
    teardownDOM();
});

test("pendingSources updates reactively as sources resolve", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["a", "b", "c"] });
    assert.deepEqual(sk.pendingSources().sort(), ["a", "b", "c"]);
    sk.resolve("b");
    assert.deepEqual(sk.pendingSources().sort(), ["a", "c"]);
    sk.resolve("a");
    sk.resolve("c");
    assert.deepEqual(sk.pendingSources(), []);
    sk.destroy();
    teardownDOM();
});

test("reset clears all sources + goes back to loading", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["a", "b"] });
    sk.resolve("a");
    sk.resolve("b");
    assert.equal(sk.ready(), true);
    sk.reset();
    assert.equal(sk.ready(), false);
    assert.deepEqual(sk.pendingSources().sort(), ["a", "b"]);
    sk.destroy();
    teardownDOM();
});

test("reset followed by re-resolve fires reveal again", () => {
    setupDOM();
    let revealCount = 0;
    const sk = createSkeleton({ sources: ["a"], onReveal: () => revealCount++ });
    sk.resolve("a");
    assert.equal(revealCount, 1);
    sk.reset();
    sk.resolve("a");
    assert.equal(revealCount, 2);
    sk.destroy();
    teardownDOM();
});

test("isResolved on unknown source returns false", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["a"] });
    assert.equal(sk.isResolved("nonexistent"), false);
    sk.destroy();
    teardownDOM();
});

// =====================================================================
// minVisibleMs guard
// =====================================================================

test("minVisibleMs defers reveal if data arrives too fast", async () => {
    setupDOM();
    const root = mkDiv();
    const sk = createSkeleton({ minVisibleMs: 100 });
    sk.attachRoot(root);
    sk.setReady(true);
    // Should still be loading because <100ms have passed since construction
    assert.equal(sk.ready(), false);
    assert.equal(root.hasAttribute("data-loading"), true);

    await new Promise(r => setTimeout(r, 130));

    assert.equal(sk.ready(), true);
    assert.equal(root.hasAttribute("data-loading"), false);
    sk.destroy();
    teardownDOM();
});

test("minVisibleMs: reveal fires synchronously if enough time has elapsed", async () => {
    setupDOM();
    const sk = createSkeleton({ minVisibleMs: 50 });
    await new Promise(r => setTimeout(r, 80));   // wait past the threshold
    sk.setReady(true);
    assert.equal(sk.ready(), true);
    sk.destroy();
    teardownDOM();
});

test("conceal cancels a pending reveal timer", async () => {
    setupDOM();
    const sk = createSkeleton({ minVisibleMs: 100 });
    sk.setReady(true);
    sk.conceal();
    // Wait past the deferred timer window
    await new Promise(r => setTimeout(r, 130));
    // conceal cancelled the timer; we should still be loading
    assert.equal(sk.ready(), false);
    sk.destroy();
    teardownDOM();
});

test("destroy clears a pending reveal timer", async () => {
    setupDOM();
    let revealed = false;
    const sk = createSkeleton({
        minVisibleMs: 100,
        onReveal: () => { revealed = true; },
    });
    sk.setReady(true);
    sk.destroy();
    await new Promise(r => setTimeout(r, 130));
    assert.equal(revealed, false);
    teardownDOM();
});

// =====================================================================
// destroy
// =====================================================================

test("destroy clears all painted attrs from each attached element", () => {
    setupDOM();
    const root = mkDiv(), ph = mkDiv(), content = mkDiv();
    const sk = createSkeleton();
    sk.attachRoot(root);
    sk.attachPlaceholder(ph);
    sk.attachContent(content);
    sk.destroy();
    assert.equal(sk.destroyed, true);
    assert.equal(root.hasAttribute("data-skeleton-root"), false);
    assert.equal(root.hasAttribute("aria-busy"), false);
    assert.equal(ph.hasAttribute("data-skeleton"), false);
    assert.equal(content.hasAttribute("data-skeleton-content"), false);
    teardownDOM();
});

test("destroy is idempotent", () => {
    setupDOM();
    const sk = createSkeleton();
    sk.destroy();
    sk.destroy();
    assert.equal(sk.destroyed, true);
    teardownDOM();
});

test("setReady/resolve/reveal after destroy are no-ops (no throw)", () => {
    setupDOM();
    const sk = createSkeleton({ sources: ["a"] });
    sk.destroy();
    sk.setReady(true);
    sk.resolve("a");
    sk.reveal();
    sk.conceal();
    sk.reset();
    // No assertions beyond "no throw"
    assert.equal(sk.destroyed, true);
    teardownDOM();
});
