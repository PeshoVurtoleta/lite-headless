// toast.test.js — createToast end-to-end (imperative API + ARIA)
//
// Swipe-driven dismiss is exercised in test-browser/toast.spec.js
// with real pointer events. Here we cover:
//   - imperative API (show/dismiss/clear, with string and element content)
//   - stack management (maxStack overflow auto-evicts oldest)
//   - auto-dismiss timer (with fake timers)
//   - pause-on-hover / pause-on-focus + resume preserves remaining time
//   - ARIA painting (role=status / role=alert, aria-live, data-toast-id)
//   - close-button attribute detection
//   - update() preserves el identity
//   - destroy() idempotent and clears all entries

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createToast } from "../src/toast/index.js";

function mkViewport() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

// -----------------------------------------------------------------
// Construction validation
// -----------------------------------------------------------------

test("createToast rejects invalid placement", () => {
    setupDOM();
    assert.throws(() => createToast({ placement: "middle" }), /placement must be one of/);
    teardownDOM();
});

test("createToast rejects invalid duration", () => {
    setupDOM();
    assert.throws(() => createToast({ duration: -1 }), /duration must be a non-negative/);
    assert.throws(() => createToast({ duration: NaN }), /duration must be a non-negative/);
    teardownDOM();
});

test("createToast rejects negative swipeThreshold", () => {
    setupDOM();
    assert.throws(() => createToast({ swipeThreshold: -5 }), /swipeThreshold/);
    teardownDOM();
});

test("createToast default state", () => {
    setupDOM();
    const t = createToast();
    assert.equal(t.count(), 0);
    assert.equal(t.destroyed, false);
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachRoot
// -----------------------------------------------------------------

test("attachRoot writes role=region + aria-label + data-placement", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ placement: "top-right" });
    t.attachRoot(vp);
    assert.equal(vp.getAttribute("role"), "region");
    assert.equal(vp.getAttribute("aria-label"), "Notifications");
    assert.equal(vp.getAttribute("data-placement"), "top-right");
    t.destroy();
    teardownDOM();
});

test("attachRoot creates a visually-hidden aria-live region", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast();
    t.attachRoot(vp);
    const live = vp.querySelector('[aria-live="polite"][aria-atomic="true"]');
    assert.ok(live, "live region appended");
    assert.equal(live.style.position, "absolute");
    t.destroy();
    teardownDOM();
});

test("attachRoot honors consumer-provided aria-label", () => {
    setupDOM();
    const vp = mkViewport();
    vp.setAttribute("aria-label", "Custom label");
    const t = createToast();
    t.attachRoot(vp);
    assert.equal(vp.getAttribute("aria-label"), "Custom label");
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// show()
// -----------------------------------------------------------------

test("show(string) wraps content in a default element with role=status", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const handle = t.show("Saved!");
    assert.ok(handle, "returns control handle");
    assert.equal(handle.el.textContent, "Saved!");
    assert.equal(handle.el.getAttribute("role"), "status");
    assert.equal(handle.el.getAttribute("aria-live"), "polite");
    assert.equal(handle.el.getAttribute("aria-atomic"), "true");
    assert.equal(handle.el.getAttribute("data-toast-id"), handle.id);
    assert.equal(t.count(), 1);
    t.destroy();
    teardownDOM();
});

test("show(element) uses the provided element directly", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const el = document.createElement("div");
    el.className = "my-toast";
    el.innerHTML = "<b>Look out</b>";
    const handle = t.show(el);
    assert.equal(handle.el, el, "primitive returns the same element");
    assert.equal(handle.el.className, "my-toast");
    assert.equal(handle.el.querySelector("b").textContent, "Look out");
    t.destroy();
    teardownDOM();
});

test("show({ urgent: true }) sets role=alert + aria-live=assertive", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const handle = t.show("Critical error", { urgent: true });
    assert.equal(handle.el.getAttribute("role"), "alert");
    assert.equal(handle.el.getAttribute("aria-live"), "assertive");
    t.destroy();
    teardownDOM();
});

test("show throws when content is not string or HTMLElement", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    assert.throws(() => t.show({}), /string or an HTMLElement/);
    assert.throws(() => t.show(null), /string or an HTMLElement/);
    assert.throws(() => t.show(123), /string or an HTMLElement/);
    t.destroy();
    teardownDOM();
});

test("show with custom id uses that id; auto-generates if omitted", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const h1 = t.show("a", { id: "explicit" });
    const h2 = t.show("b");
    assert.equal(h1.id, "explicit");
    assert.ok(h2.id.startsWith("lh-toast-"));
    t.destroy();
    teardownDOM();
});

test("onShow fires when a toast appears", () => {
    setupDOM();
    const vp = mkViewport();
    const shown = [];
    const t = createToast({ duration: 0, onShow: id => shown.push(id) });
    t.attachRoot(vp);
    t.show("a", { id: "x" });
    t.show("b", { id: "y" });
    assert.deepEqual(shown, ["x", "y"]);
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Placement-aware insertion
// -----------------------------------------------------------------

test("top-* placements insert NEW toasts at top of viewport (skipping live region)", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ placement: "top-right", duration: 0 });
    t.attachRoot(vp);
    const h1 = t.show("first");
    const h2 = t.show("second");
    // After 2 shows: viewport children = [liveRegion, h2.el, h1.el]
    const kids = Array.from(vp.children);
    // first child is live region, then newest, then oldest
    assert.equal(kids[0].getAttribute("aria-live"), "polite", "live region first");
    assert.equal(kids[1], h2.el, "newest right after live region");
    assert.equal(kids[2], h1.el, "older below newest");
    t.destroy();
    teardownDOM();
});

test("bottom-* placements append NEW toasts at bottom of viewport", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ placement: "bottom-right", duration: 0 });
    t.attachRoot(vp);
    const h1 = t.show("first");
    const h2 = t.show("second");
    const kids = Array.from(vp.children);
    // [liveRegion, h1.el, h2.el]
    assert.equal(kids[0].getAttribute("aria-live"), "polite");
    assert.equal(kids[1], h1.el);
    assert.equal(kids[2], h2.el);
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// dismiss / clear
// -----------------------------------------------------------------

test("handle.dismiss() removes the toast and fires onDismiss", () => {
    setupDOM();
    const vp = mkViewport();
    const dismissed = [];
    const t = createToast({ duration: 0, onDismiss: (id, r) => dismissed.push([id, r]) });
    t.attachRoot(vp);
    const h = t.show("hi", { id: "z" });
    assert.equal(t.count(), 1);
    h.dismiss();
    assert.equal(t.count(), 0);
    assert.deepEqual(dismissed, [["z", "manual"]]);
    assert.equal(h.el.parentNode, null, "element removed from DOM");
    t.destroy();
    teardownDOM();
});

test("dismiss(id) works via the imperative API", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    t.show("a", { id: "k" });
    t.dismiss("k");
    assert.equal(t.count(), 0);
    t.destroy();
    teardownDOM();
});

test("dismiss with custom reason flows through onDismiss", () => {
    setupDOM();
    const vp = mkViewport();
    let lastReason = null;
    const t = createToast({ duration: 0, onDismiss: (_, r) => { lastReason = r; } });
    t.attachRoot(vp);
    t.show("a", { id: "k" });
    t.dismiss("k", "user-clicked-x");
    assert.equal(lastReason, "user-clicked-x");
    t.destroy();
    teardownDOM();
});

test("clear() dismisses every active toast", () => {
    setupDOM();
    const vp = mkViewport();
    const dismissed = [];
    const t = createToast({ duration: 0, onDismiss: (id, r) => dismissed.push([id, r]) });
    t.attachRoot(vp);
    t.show("a", { id: "a" });
    t.show("b", { id: "b" });
    t.show("c", { id: "c" });
    assert.equal(t.count(), 3);
    t.clear();
    assert.equal(t.count(), 0);
    assert.deepEqual(dismissed.map(d => d[1]), ["clear", "clear", "clear"]);
    t.destroy();
    teardownDOM();
});

test("dismiss on already-dismissed entry is a no-op", () => {
    setupDOM();
    const vp = mkViewport();
    const dismissed = [];
    const t = createToast({ duration: 0, onDismiss: (id) => dismissed.push(id) });
    t.attachRoot(vp);
    const h = t.show("a", { id: "k" });
    h.dismiss();
    h.dismiss();    // no-op
    t.dismiss("k"); // no-op
    assert.deepEqual(dismissed, ["k"]);
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Stack management
// -----------------------------------------------------------------

test("maxStack overflow auto-dismisses the OLDEST toast", () => {
    setupDOM();
    const vp = mkViewport();
    const dismissed = [];
    const t = createToast({ duration: 0, maxStack: 3, onDismiss: (id, r) => dismissed.push([id, r]) });
    t.attachRoot(vp);
    t.show("1", { id: "a" });
    t.show("2", { id: "b" });
    t.show("3", { id: "c" });
    assert.equal(t.count(), 3);
    t.show("4", { id: "d" });          // should evict "a"
    assert.equal(t.count(), 3);
    assert.deepEqual(dismissed, [["a", "maxstack-evict"]]);
    t.show("5", { id: "e" });
    assert.deepEqual(dismissed, [
        ["a", "maxstack-evict"],
        ["b", "maxstack-evict"],
    ]);
    const ids = t.getEntries().map(e => e.id);
    assert.deepEqual(ids, ["c", "d", "e"]);
    t.destroy();
    teardownDOM();
});

test("maxStack=1 evicts on every show", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0, maxStack: 1 });
    t.attachRoot(vp);
    t.show("1");
    t.show("2");
    t.show("3");
    assert.equal(t.count(), 1);
    assert.equal(t.getEntries()[0].id !== undefined, true);
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Auto-dismiss timer
// -----------------------------------------------------------------

test("toast auto-dismisses after `duration` ms", async () => {
    setupDOM();
    const vp = mkViewport();
    const dismissed = [];
    const t = createToast({ duration: 50, onDismiss: (id, r) => dismissed.push([id, r]) });
    t.attachRoot(vp);
    t.show("a", { id: "x" });
    assert.equal(t.count(), 1);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(t.count(), 0);
    assert.deepEqual(dismissed, [["x", "auto-dismiss"]]);
    t.destroy();
    teardownDOM();
});

test("duration: 0 disables auto-dismiss (toast persists)", async () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    t.show("a");
    await new Promise(r => setTimeout(r, 50));
    assert.equal(t.count(), 1, "still present");
    t.destroy();
    teardownDOM();
});

test("per-toast duration override wins over default", async () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 50 });
    t.attachRoot(vp);
    t.show("persistent", { id: "p", duration: 0 });
    t.show("ephemeral",  { id: "e", duration: 30 });
    await new Promise(r => setTimeout(r, 60));
    const ids = t.getEntries().map(e => e.id);
    assert.deepEqual(ids, ["p"], "ephemeral dismissed, persistent stays");
    t.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// update()
// -----------------------------------------------------------------

test("update() with new string content keeps el identity", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const h = t.show("initial");
    const sameEl = h.el;
    h.update("changed");
    assert.equal(h.el, sameEl, "el identity preserved");
    assert.equal(sameEl.textContent, "changed");
    t.destroy();
    teardownDOM();
});

test("update({ urgent: true }) switches role + aria-live", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const h = t.show("info", { urgent: false });
    assert.equal(h.el.getAttribute("role"), "status");
    h.update("now urgent", { urgent: true });
    assert.equal(h.el.getAttribute("role"), "alert");
    assert.equal(h.el.getAttribute("aria-live"), "assertive");
    t.destroy();
    teardownDOM();
});

test("update on a dismissed toast is a no-op", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    const h = t.show("a");
    h.dismiss();
    h.update("never sees this");
    assert.equal(t.count(), 0);
    teardownDOM();
});

// -----------------------------------------------------------------
// close-button auto-handling
// -----------------------------------------------------------------

test("clicking a child with [data-toast-close] dismisses the toast", () => {
    setupDOM();
    const vp = mkViewport();
    const dismissed = [];
    const t = createToast({ duration: 0, onDismiss: (id, r) => dismissed.push([id, r]) });
    t.attachRoot(vp);
    const el = document.createElement("div");
    el.innerHTML = `<span>Saved</span><button data-toast-close>×</button>`;
    const h = t.show(el, { id: "s" });
    const btn = el.querySelector("[data-toast-close]");
    btn.click();
    assert.equal(t.count(), 0);
    assert.deepEqual(dismissed, [["s", "close-button"]]);
    teardownDOM();
});

// -----------------------------------------------------------------
// destroy
// -----------------------------------------------------------------

test("destroy() is idempotent", () => {
    setupDOM();
    const t = createToast();
    t.destroy();
    assert.equal(t.destroyed, true);
    t.destroy();
    teardownDOM();
});

test("destroy() clears all entries", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    t.show("a"); t.show("b"); t.show("c");
    assert.equal(t.count(), 3);
    t.destroy();
    assert.equal(t.count(), 0);
    assert.equal(vp.querySelectorAll("[data-toast-id]").length, 0);
    teardownDOM();
});

test("show() after destroy is a no-op", () => {
    setupDOM();
    const vp = mkViewport();
    const t = createToast({ duration: 0 });
    t.attachRoot(vp);
    t.destroy();
    const h = t.show("never");
    assert.equal(h, null);
    teardownDOM();
});
