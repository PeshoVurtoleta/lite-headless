// Tests: empty-state.
//
// Structural primitive: ARIA wiring, slot markers, variant switching,
// labelledby/describedby chain, idempotent destroy.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createEmptyState } from "../src/empty-state/index.js";

function mkDiv(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

// ─── variant ─────────────────────────────────────────────────────────

test("default variant is 'empty'", () => {
    setupDOM();
    const es = createEmptyState();
    assert.equal(es.variant(), "empty");
    es.destroy();
    teardownDOM();
});

test("setVariant updates the signal and the painted data-variant", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    es.attachRoot(root);
    es.setVariant("error");
    assert.equal(es.variant(), "error");
    assert.equal(root.getAttribute("data-variant"), "error");
    es.setVariant("loading");
    assert.equal(root.getAttribute("data-variant"), "loading");
    es.destroy();
    teardownDOM();
});

test("setVariant is a no-op when value equals current", () => {
    setupDOM();
    const es = createEmptyState({ variant: "error" });
    es.setVariant("error");
    assert.equal(es.variant(), "error");
    es.destroy();
    teardownDOM();
});

// ─── attachRoot ──────────────────────────────────────────────────────

test("attachRoot writes role=status + aria-live + data markers", () => {
    setupDOM();
    const es = createEmptyState({ variant: "empty" });
    const root = mkDiv();
    es.attachRoot(root);
    assert.equal(root.getAttribute("role"), "status");
    assert.equal(root.getAttribute("aria-live"), "polite");
    assert.equal(root.getAttribute("data-empty-state-root"), "");
    assert.equal(root.getAttribute("data-variant"), "empty");
    assert.equal(root.getAttribute("data-empty"), "");
    es.destroy();
    teardownDOM();
});

test("attachRoot does not override an existing role attribute", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    root.setAttribute("role", "region");
    es.attachRoot(root);
    assert.equal(root.getAttribute("role"), "region");
    es.destroy();
    teardownDOM();
});

// ─── title / description / labelledby chain ──────────────────────────

test("attachTitle sets data-empty-title + ensures id + wires aria-labelledby", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const title = mkDiv("h3");
    es.attachRoot(root);
    es.attachTitle(title);
    assert.equal(title.hasAttribute("data-empty-title"), true);
    assert.ok(title.id.length > 0);
    assert.equal(root.getAttribute("aria-labelledby"), title.id);
    es.destroy();
    teardownDOM();
});

test("real <h2>/<h3>/<h4> title keeps native role (no role=heading override)", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const title = mkDiv("h2");
    es.attachRoot(root);
    es.attachTitle(title);
    assert.equal(title.hasAttribute("role"), false);
    assert.equal(title.hasAttribute("aria-level"), false);
    es.destroy();
    teardownDOM();
});

test("div title gets role=heading + aria-level=2 fallback", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const title = mkDiv("div");
    es.attachRoot(root);
    es.attachTitle(title);
    assert.equal(title.getAttribute("role"), "heading");
    assert.equal(title.getAttribute("aria-level"), "2");
    es.destroy();
    teardownDOM();
});

test("attachDescription wires aria-describedby on root", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const desc = mkDiv("p");
    es.attachRoot(root);
    es.attachDescription(desc);
    assert.ok(desc.id.length > 0);
    assert.equal(root.getAttribute("aria-describedby"), desc.id);
    es.destroy();
    teardownDOM();
});

test("title and description order doesn't matter (relinkAria runs both ways)", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const title = mkDiv("h3");
    const desc = mkDiv("p");
    // Attach title FIRST, then root: relinkAria runs from attachRoot too
    es.attachTitle(title);
    es.attachDescription(desc);
    es.attachRoot(root);
    assert.equal(root.getAttribute("aria-labelledby"), title.id);
    assert.equal(root.getAttribute("aria-describedby"), desc.id);
    es.destroy();
    teardownDOM();
});

test("detaching title clears aria-labelledby", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const title = mkDiv("h3");
    es.attachRoot(root);
    const offTitle = es.attachTitle(title);
    assert.equal(root.getAttribute("aria-labelledby"), title.id);
    offTitle();
    assert.equal(root.hasAttribute("aria-labelledby"), false);
    es.destroy();
    teardownDOM();
});

// ─── icon ────────────────────────────────────────────────────────────

test("attachIcon marks aria-hidden + data-empty-icon", () => {
    setupDOM();
    const es = createEmptyState();
    const icon = mkDiv();
    es.attachIcon(icon);
    assert.equal(icon.getAttribute("aria-hidden"), "true");
    assert.equal(icon.hasAttribute("data-empty-icon"), true);
    es.destroy();
    teardownDOM();
});

// ─── actions ─────────────────────────────────────────────────────────

test("attachActions sets role=group + data-empty-actions", () => {
    setupDOM();
    const es = createEmptyState();
    const actions = mkDiv();
    es.attachActions(actions);
    assert.equal(actions.getAttribute("role"), "group");
    assert.equal(actions.hasAttribute("data-empty-actions"), true);
    es.destroy();
    teardownDOM();
});

test("attachActions preserves an existing role", () => {
    setupDOM();
    const es = createEmptyState();
    const actions = mkDiv();
    actions.setAttribute("role", "toolbar");
    es.attachActions(actions);
    assert.equal(actions.getAttribute("role"), "toolbar");
    es.destroy();
    teardownDOM();
});

// ─── destroy ─────────────────────────────────────────────────────────

test("destroy is idempotent + clears root attributes", () => {
    setupDOM();
    const es = createEmptyState();
    const root = mkDiv();
    const title = mkDiv("h3");
    es.attachRoot(root);
    es.attachTitle(title);
    es.destroy();
    es.destroy();    // no throw
    assert.equal(es.destroyed, true);
    assert.equal(root.hasAttribute("data-empty-state-root"), false);
    assert.equal(root.hasAttribute("data-variant"), false);
    assert.equal(root.hasAttribute("role"), false);
    teardownDOM();
});
