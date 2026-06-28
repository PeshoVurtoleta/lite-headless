// Tests: button.
//
// State paint, toggle semantics, async runner, click gating.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createButton } from "../src/button/index.js";

function mkBtn() {
    const el = document.createElement("button");
    document.body.appendChild(el);
    return el;
}

// ─── basic paint ─────────────────────────────────────────────────────

test("attachRoot paints data-button-root + initial state attrs", () => {
    setupDOM();
    const btn = createButton({});
    const el = mkBtn();
    btn.attachRoot(el);
    assert.equal(el.hasAttribute("data-button-root"), true);
    assert.equal(el.hasAttribute("data-pressed"), false);
    assert.equal(el.hasAttribute("data-loading"), false);
    assert.equal(el.hasAttribute("aria-pressed"), false);    // not a toggle
    btn.destroy();
    teardownDOM();
});

test("toggle=true paints aria-pressed=false at start", () => {
    setupDOM();
    const btn = createButton({ toggle: true });
    const el = mkBtn();
    btn.attachRoot(el);
    assert.equal(el.getAttribute("aria-pressed"), "false");
    btn.destroy();
    teardownDOM();
});

test("pressed: true implies toggle", () => {
    setupDOM();
    const btn = createButton({ pressed: true });
    const el = mkBtn();
    btn.attachRoot(el);
    assert.equal(el.getAttribute("aria-pressed"), "true");
    assert.equal(el.hasAttribute("data-pressed"), true);
    btn.destroy();
    teardownDOM();
});

// ─── mutations + paint ───────────────────────────────────────────────

test("setPressed updates aria-pressed + data-pressed", () => {
    setupDOM();
    const btn = createButton({ toggle: true });
    const el = mkBtn();
    btn.attachRoot(el);
    btn.setPressed(true);
    assert.equal(el.getAttribute("aria-pressed"), "true");
    assert.equal(el.hasAttribute("data-pressed"), true);
    btn.setPressed(false);
    assert.equal(el.getAttribute("aria-pressed"), "false");
    assert.equal(el.hasAttribute("data-pressed"), false);
    btn.destroy();
    teardownDOM();
});

test("setPressed on non-toggle button is a no-op", () => {
    setupDOM();
    const btn = createButton({});
    const el = mkBtn();
    btn.attachRoot(el);
    btn.setPressed(true);
    assert.equal(btn.isPressed(), false);
    assert.equal(el.hasAttribute("aria-pressed"), false);
    btn.destroy();
    teardownDOM();
});

test("setLoading paints aria-busy + data-loading + disabled lock", () => {
    setupDOM();
    const btn = createButton({});
    const el = mkBtn();
    btn.attachRoot(el);
    btn.setLoading(true);
    assert.equal(el.getAttribute("aria-busy"), "true");
    assert.equal(el.hasAttribute("data-loading"), true);
    assert.equal(el.hasAttribute("disabled"), true);
    btn.setLoading(false);
    assert.equal(el.hasAttribute("aria-busy"), false);
    assert.equal(el.hasAttribute("data-loading"), false);
    assert.equal(el.hasAttribute("disabled"), false);
    btn.destroy();
    teardownDOM();
});

test("setDisabled paints disabled + data-disabled (no aria-busy)", () => {
    setupDOM();
    const btn = createButton({});
    const el = mkBtn();
    btn.attachRoot(el);
    btn.setDisabled(true);
    assert.equal(el.hasAttribute("disabled"), true);
    assert.equal(el.hasAttribute("data-disabled"), true);
    assert.equal(el.hasAttribute("aria-busy"), false);
    btn.destroy();
    teardownDOM();
});

// ─── canPress gate ───────────────────────────────────────────────────

test("canPress true at construction; false when disabled or loading", () => {
    setupDOM();
    const btn = createButton({});
    assert.equal(btn.canPress(), true);
    btn.setDisabled(true);
    assert.equal(btn.canPress(), false);
    btn.setDisabled(false);
    assert.equal(btn.canPress(), true);
    btn.setLoading(true);
    assert.equal(btn.canPress(), false);
    btn.destroy();
    teardownDOM();
});

// ─── click handler ───────────────────────────────────────────────────

test("click fires onPress when canPress", () => {
    setupDOM();
    let presses = 0;
    const btn = createButton({ onPress: () => { presses++; } });
    const el = mkBtn();
    btn.attachRoot(el);
    el.click();
    el.click();
    assert.equal(presses, 2);
    btn.destroy();
    teardownDOM();
});

test("click ignored when disabled", () => {
    setupDOM();
    let presses = 0;
    const btn = createButton({ disabled: true, onPress: () => { presses++; } });
    const el = mkBtn();
    btn.attachRoot(el);
    el.click();
    assert.equal(presses, 0);
    btn.destroy();
    teardownDOM();
});

test("click ignored when loading", () => {
    setupDOM();
    let presses = 0;
    const btn = createButton({ loading: true, onPress: () => { presses++; } });
    const el = mkBtn();
    btn.attachRoot(el);
    el.click();
    assert.equal(presses, 0);
    btn.destroy();
    teardownDOM();
});

test("click on toggle button flips pressed", () => {
    setupDOM();
    const btn = createButton({ toggle: true });
    const el = mkBtn();
    btn.attachRoot(el);
    el.click();
    assert.equal(btn.isPressed(), true);
    el.click();
    assert.equal(btn.isPressed(), false);
    btn.destroy();
    teardownDOM();
});

// ─── runAsync ────────────────────────────────────────────────────────

test("runAsync locks button during await + clears on resolve", async () => {
    setupDOM();
    const btn = createButton({});
    const el = mkBtn();
    btn.attachRoot(el);
    let resolveIt;
    const p = btn.runAsync(() => new Promise(r => { resolveIt = r; }));
    assert.equal(btn.isLoading(), true);
    assert.equal(el.hasAttribute("disabled"), true);
    resolveIt(42);
    const result = await p;
    assert.equal(result, 42);
    assert.equal(btn.isLoading(), false);
    assert.equal(el.hasAttribute("disabled"), false);
    btn.destroy();
    teardownDOM();
});

test("runAsync clears loading even when fn throws", async () => {
    setupDOM();
    const btn = createButton({});
    const el = mkBtn();
    btn.attachRoot(el);
    let caught = false;
    try {
        await btn.runAsync(() => { throw new Error("boom"); });
    } catch {
        caught = true;
    }
    assert.equal(caught, true);
    assert.equal(btn.isLoading(), false);
    btn.destroy();
    teardownDOM();
});

test("runAsync called while loading is a no-op (no double-fire)", async () => {
    setupDOM();
    const btn = createButton({});
    let invocations = 0;
    let resolveIt;
    btn.runAsync(() => {
        invocations++;
        return new Promise(r => { resolveIt = r; });
    });
    // Second call while still loading -- runAsync is async, so it
    // returns Promise<undefined>; the fn must NOT run.
    const r2 = await btn.runAsync(() => { invocations++; });
    assert.equal(r2, undefined);
    assert.equal(invocations, 1);
    resolveIt();
    btn.destroy();
    teardownDOM();
});

test("onPress returning a promise auto-routes through loading lock", async () => {
    setupDOM();
    let resolveIt;
    const btn = createButton({
        onPress: () => new Promise(r => { resolveIt = r; }),
    });
    const el = mkBtn();
    btn.attachRoot(el);
    el.click();
    // Synchronously after click, loading should be set
    assert.equal(btn.isLoading(), true);
    resolveIt();
    // Wait for the .finally to run
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    assert.equal(btn.isLoading(), false);
    btn.destroy();
    teardownDOM();
});

// ─── destroy ─────────────────────────────────────────────────────────

test("destroy is idempotent + removes state attrs", () => {
    setupDOM();
    const btn = createButton({ toggle: true, pressed: true });
    const el = mkBtn();
    btn.attachRoot(el);
    btn.destroy();
    btn.destroy();
    assert.equal(btn.destroyed, true);
    assert.equal(el.hasAttribute("data-button-root"), false);
    assert.equal(el.hasAttribute("aria-pressed"), false);
    teardownDOM();
});
