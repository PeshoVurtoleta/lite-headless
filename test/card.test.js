// Tests: card.
//
// Slot painting, collapsible state machine, dismissible flow, ARIA wiring.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createCard } from "../src/card/index.js";

function mkDiv(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

function setup() {
    setupDOM();
    const root = mkDiv();
    const body = document.createElement("div");
    root.appendChild(body);
    return { root, body };
}

// ─── basic paint ─────────────────────────────────────────────────────

test("attachRoot paints data-card-root", () => {
    const { root } = setup();
    const c = createCard({});
    c.attachRoot(root);
    assert.equal(root.hasAttribute("data-card-root"), true);
    c.destroy();
    teardownDOM();
});

test("label option sets aria-label + role=region (when label set and no pre-set)", () => {
    const { root } = setup();
    const c = createCard({ label: "Recent orders" });
    c.attachRoot(root);
    assert.equal(root.getAttribute("aria-label"), "Recent orders");
    assert.equal(root.getAttribute("role"), "region");
    c.destroy();
    teardownDOM();
});

test("attachBody paints data-card-body", () => {
    const { root, body } = setup();
    const c = createCard({});
    c.attachRoot(root);
    c.attachBody(body);
    assert.equal(body.hasAttribute("data-card-body"), true);
    c.destroy();
    teardownDOM();
});

// ─── collapsible ─────────────────────────────────────────────────────

test("collapsible: false (default) -> toggle is a no-op", () => {
    const { root } = setup();
    const c = createCard({});
    c.attachRoot(root);
    c.toggle();
    assert.equal(c.isCollapsed(), false);
    c.destroy();
    teardownDOM();
});

test("collapsible: collapsed=true at init paints data-open + body hidden", () => {
    const { root, body } = setup();
    const c = createCard({ collapsible: true, collapsed: true });
    c.attachRoot(root);
    c.attachBody(body);
    assert.equal(root.hasAttribute("data-open"), false);
    assert.equal(body.hasAttribute("hidden"), true);
    c.destroy();
    teardownDOM();
});

test("toggle flips state, paints attributes, fires callback", () => {
    const { root, body } = setup();
    const events = [];
    const c = createCard({
        collapsible: true,
        onCollapseChange: (col, r) => events.push({ col, r }),
    });
    c.attachRoot(root);
    c.attachBody(body);
    c.toggle();
    assert.equal(c.isCollapsed(), true);
    assert.equal(root.hasAttribute("data-open"), false);
    assert.equal(body.hasAttribute("hidden"), true);
    c.toggle();
    assert.equal(c.isCollapsed(), false);
    assert.equal(body.hasAttribute("hidden"), false);
    assert.deepEqual(events.map(e => [e.col, e.r]), [[true, "toggle"], [false, "toggle"]]);
    c.destroy();
    teardownDOM();
});

test("attachCollapseTrigger wires aria-expanded + click", () => {
    const { root, body } = setup();
    const trigger = mkDiv("button");
    root.appendChild(trigger);
    const c = createCard({ collapsible: true });
    c.attachRoot(root);
    c.attachBody(body);
    c.attachCollapseTrigger(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    trigger.click();
    assert.equal(c.isCollapsed(), true);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    c.destroy();
    teardownDOM();
});

test("attachCollapseTrigger after attachBody wires aria-controls to body id", () => {
    const { root, body } = setup();
    const trigger = mkDiv("button");
    const c = createCard({ collapsible: true });
    c.attachRoot(root);
    c.attachBody(body);
    c.attachCollapseTrigger(trigger);
    assert.ok(body.id);
    assert.equal(trigger.getAttribute("aria-controls"), body.id);
    c.destroy();
    teardownDOM();
});

test("non-button trigger reacts to Enter + Space", () => {
    const { root, body } = setup();
    const trigger = mkDiv("div");
    const c = createCard({ collapsible: true });
    c.attachRoot(root);
    c.attachBody(body);
    c.attachCollapseTrigger(trigger);
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    assert.equal(c.isCollapsed(), true);
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
    assert.equal(c.isCollapsed(), false);
    c.destroy();
    teardownDOM();
});

// ─── dismissible ─────────────────────────────────────────────────────

test("dismissible: dismiss paints data-hidden + hidden on root, fires callback", () => {
    const { root } = setup();
    const fires = [];
    const c = createCard({ dismissible: true, onDismiss: (r) => fires.push(r) });
    c.attachRoot(root);
    c.dismiss();
    assert.equal(c.isDismissed(), true);
    assert.equal(root.hasAttribute("data-hidden"), true);
    assert.equal(root.hasAttribute("hidden"), true);
    assert.deepEqual(fires, ["api"]);
    c.destroy();
    teardownDOM();
});

test("dismiss is idempotent (second call is no-op)", () => {
    const { root } = setup();
    let fires = 0;
    const c = createCard({ dismissible: true, onDismiss: () => fires++ });
    c.attachRoot(root);
    c.dismiss();
    c.dismiss();
    assert.equal(fires, 1);
    c.destroy();
    teardownDOM();
});

test("reopen un-dismisses + removes hidden", () => {
    const { root } = setup();
    const c = createCard({ dismissible: true });
    c.attachRoot(root);
    c.dismiss();
    c.reopen();
    assert.equal(c.isDismissed(), false);
    assert.equal(root.hasAttribute("data-hidden"), false);
    assert.equal(root.hasAttribute("hidden"), false);
    c.destroy();
    teardownDOM();
});

test("attachDismissButton: click triggers dismiss + paints data-card-dismiss + aria-label", () => {
    const { root } = setup();
    const btn = mkDiv("button");
    const c = createCard({ dismissible: true });
    c.attachRoot(root);
    c.attachDismissButton(btn);
    assert.equal(btn.hasAttribute("data-card-dismiss"), true);
    assert.equal(btn.getAttribute("aria-label"), "Dismiss");
    btn.click();
    assert.equal(c.isDismissed(), true);
    c.destroy();
    teardownDOM();
});

// ─── lifecycle ───────────────────────────────────────────────────────

test("destroy is idempotent + clears attributes", () => {
    const { root, body } = setup();
    const c = createCard({ collapsible: true, label: "X" });
    c.attachRoot(root);
    c.attachBody(body);
    c.destroy();
    c.destroy();
    assert.equal(c.destroyed, true);
    assert.equal(root.hasAttribute("data-card-root"), false);
    assert.equal(root.hasAttribute("aria-label"), false);
    teardownDOM();
});

test("dismiss method on non-dismissible card is a no-op", () => {
    const { root } = setup();
    const c = createCard({});
    c.attachRoot(root);
    c.dismiss();
    assert.equal(c.isDismissed(), false);
    c.destroy();
    teardownDOM();
});
