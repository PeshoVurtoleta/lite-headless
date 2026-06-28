// banner.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createBanner } from "../src/banner/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

test("defaults to open=true + kind=info", () => {
    setupDOM();
    const b = createBanner();
    assert.equal(b.isOpen(), true);
    assert.equal(b.kind(), "info");
    b.destroy();
    teardownDOM();
});

test("dismiss closes + fires onDismiss + onOpenChange(false)", () => {
    setupDOM();
    let dismissed = false;
    let openCb = null;
    const b = createBanner({
        onDismiss: () => { dismissed = true; },
        onOpenChange: (o) => { openCb = o; },
    });
    b.dismiss();
    assert.equal(b.isOpen(), false);
    assert.equal(dismissed, true);
    assert.equal(openCb, false);
    b.destroy();
    teardownDOM();
});

test("show re-opens; idempotent calls don't re-fire", () => {
    setupDOM();
    let fires = 0;
    const b = createBanner({
        defaultOpen: false,
        onOpenChange: () => { fires++; },
    });
    b.show();
    b.show();   // already open
    assert.equal(fires, 1);
    b.destroy();
    teardownDOM();
});

test("setKind clamps invalid values to 'info'", () => {
    setupDOM();
    const b = createBanner();
    b.setKind("error");
    assert.equal(b.kind(), "error");
    b.setKind("purple");
    assert.equal(b.kind(), "info");
    b.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot paint
// =====================================================================

test("attachRoot paints data-kind + role=status + aria-live=polite for info", () => {
    setupDOM();
    const b = createBanner({ defaultKind: "info" });
    const root = mkEl();
    b.attachRoot(root);
    assert.equal(root.getAttribute("data-kind"), "info");
    assert.equal(root.getAttribute("role"), "status");
    assert.equal(root.getAttribute("aria-live"), "polite");
    assert.equal(root.getAttribute("data-open"), "");
    assert.equal(root.hasAttribute("data-hidden"), false);
    b.destroy();
    teardownDOM();
});

test("error kind upgrades to role=alert + aria-live=assertive", () => {
    setupDOM();
    const b = createBanner({ defaultKind: "error" });
    const root = mkEl();
    b.attachRoot(root);
    assert.equal(root.getAttribute("role"), "alert");
    assert.equal(root.getAttribute("aria-live"), "assertive");
    b.destroy();
    teardownDOM();
});

test("warning kind also uses role=alert", () => {
    setupDOM();
    const b = createBanner({ defaultKind: "warning" });
    const root = mkEl();
    b.attachRoot(root);
    assert.equal(root.getAttribute("role"), "alert");
    b.destroy();
    teardownDOM();
});

test("setKind at runtime updates role + aria-live", () => {
    setupDOM();
    const b = createBanner({ defaultKind: "info" });
    const root = mkEl();
    b.attachRoot(root);
    b.setKind("error");
    assert.equal(root.getAttribute("role"), "alert");
    assert.equal(root.getAttribute("aria-live"), "assertive");
    b.setKind("success");
    assert.equal(root.getAttribute("role"), "status");
    assert.equal(root.getAttribute("aria-live"), "polite");
    b.destroy();
    teardownDOM();
});

test("dismiss toggles data-open and data-hidden", () => {
    setupDOM();
    const b = createBanner();
    const root = mkEl();
    b.attachRoot(root);
    assert.equal(root.getAttribute("data-open"), "");
    assert.equal(root.hasAttribute("data-hidden"), false);
    b.dismiss();
    assert.equal(root.hasAttribute("data-open"), false);
    assert.equal(root.getAttribute("data-hidden"), "");
    b.show();
    assert.equal(root.getAttribute("data-open"), "");
    assert.equal(root.hasAttribute("data-hidden"), false);
    b.destroy();
    teardownDOM();
});

// =====================================================================
// Dismiss button
// =====================================================================

test("attachDismissButton wires click to dismiss + sets aria-label", () => {
    setupDOM();
    const b = createBanner();
    const root = mkEl();
    const btn = mkEl("button");
    b.attachRoot(root);
    b.attachDismissButton(btn);
    assert.equal(btn.getAttribute("type"), "button");
    assert.equal(btn.getAttribute("aria-label"), "Dismiss");
    btn.click();
    assert.equal(b.isOpen(), false);
    b.destroy();
    teardownDOM();
});

// =====================================================================
// Escape dismiss
// =====================================================================

test("dismissOnEscape=true: Escape key dismisses while open", () => {
    setupDOM();
    const b = createBanner({ dismissOnEscape: true });
    const root = mkEl();
    b.attachRoot(root);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(b.isOpen(), false);
    b.destroy();
    teardownDOM();
});

test("dismissOnEscape=false (default): Escape does nothing", () => {
    setupDOM();
    const b = createBanner();
    const root = mkEl();
    b.attachRoot(root);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    assert.equal(b.isOpen(), true);
    b.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy detaches root + button + escape listener", () => {
    setupDOM();
    const b = createBanner({ dismissOnEscape: true });
    const root = mkEl();
    const btn = mkEl("button");
    b.attachRoot(root);
    b.attachDismissButton(btn);
    b.destroy();
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("data-kind"), false);
    // Escape after destroy should not throw or affect state.
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    teardownDOM();
});

test("destroy idempotent + blocks mutations", () => {
    setupDOM();
    const b = createBanner();
    b.destroy();
    b.destroy();
    b.dismiss();
    b.setKind("error");
    assert.equal(b.destroyed, true);
    teardownDOM();
});
