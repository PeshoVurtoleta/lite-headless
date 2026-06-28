// sortable.test.js -- createSortable
//
// Pointer-driven drag is exercised in test-browser/sortable.spec.js
// where real pointermove events fire with realistic timing and
// happy-dom's no-layout limitations don't apply. Here we cover:
//   - imperative API (move, swap, setOrder, insertAt, removeKey)
//   - attachItem builds the order incrementally if not preseeded
//   - attachHandle gates pointerdown to the handle element
//   - keyboard "picked up" mode (Space to pick up, arrows to move,
//     Space to drop, Escape to cancel)
//   - ARIA painting (role=listbox/option, aria-grabbed, aria-disabled,
//     aria-orientation)
//   - destroy idempotence

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createSortable } from "../src/sortable/index.js";

function mkList(keys) {
    const root = document.createElement("ul");
    const els = {};
    for (const k of keys) {
        const li = document.createElement("li");
        li.textContent = k;
        li.id = "item-" + k;
        root.appendChild(li);
        els[k] = li;
    }
    document.body.appendChild(root);
    return { root, els };
}

function dispatchKey(el, key) {
    const ev = new window.KeyboardEvent("keydown", {
        key, bubbles: true, cancelable: true,
    });
    el.dispatchEvent(ev);
}

// -----------------------------------------------------------------
// Construction
// -----------------------------------------------------------------

test("createSortable rejects invalid orientation", () => {
    setupDOM();
    assert.throws(() => createSortable({ orientation: "diagonal" }),
        /orientation must be/);
    teardownDOM();
});

test("createSortable default state", () => {
    setupDOM();
    const s = createSortable();
    assert.deepEqual(s.items(), []);
    assert.equal(s.isDragging(), false);
    assert.equal(s.destroyed, false);
    s.destroy();
    teardownDOM();
});

test("createSortable with initial items seeds the order", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c"] });
    assert.deepEqual(s.items(), ["a", "b", "c"]);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachRoot / attachItem
// -----------------------------------------------------------------

test("attachRoot writes role + aria-orientation + data-orientation", () => {
    setupDOM();
    const { root } = mkList([]);
    const s = createSortable({ orientation: "vertical" });
    s.attachRoot(root, { label: "Reorder list" });
    assert.equal(root.getAttribute("role"), "listbox");
    assert.equal(root.getAttribute("aria-orientation"), "vertical");
    assert.equal(root.getAttribute("aria-label"), "Reorder list");
    assert.equal(root.getAttribute("data-orientation"), "vertical");
    s.destroy();
    teardownDOM();
});

test("attachRoot creates an internal aria-live region (visually hidden)", () => {
    setupDOM();
    const { root } = mkList([]);
    const s = createSortable();
    s.attachRoot(root);
    const live = root.querySelector('[aria-live="polite"]');
    assert.ok(live, "live region appended to root");
    assert.equal(live.style.position, "absolute", "visually hidden positioning");
    s.destroy();
    teardownDOM();
});

test("attachItem stamps key, sets role=option, makes focusable", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable();
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    assert.equal(els.a.getAttribute("role"), "option");
    assert.equal(els.a.getAttribute("tabindex"), "0");
    assert.equal(els.a._lhSortableKey, "a");
    s.destroy();
    teardownDOM();
});

test("attachItem incrementally builds the order if not preseeded", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable();      // no initial items
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    assert.deepEqual(s.items(), ["a", "b", "c"]);
    s.destroy();
    teardownDOM();
});

test("attachItem with opts.disabled paints aria-disabled", () => {
    setupDOM();
    const { root, els } = mkList(["a"]);
    const s = createSortable();
    s.attachRoot(root);
    s.attachItem(els.a, "a", { disabled: true });
    assert.equal(els.a.getAttribute("aria-disabled"), "true");
    s.destroy();
    teardownDOM();
});

test("attachItem detach removes the key from order", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable();
    s.attachRoot(root);
    const offA = s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    assert.deepEqual(s.items(), ["a", "b", "c"]);
    offA();
    assert.deepEqual(s.items(), ["b", "c"]);
    s.destroy();
    teardownDOM();
});

test("attachItem throws when key is null/undefined", () => {
    setupDOM();
    const s = createSortable();
    const el = document.createElement("li");
    assert.throws(() => s.attachItem(el, null), /key is required/);
    assert.throws(() => s.attachItem(el, undefined), /key is required/);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachHandle
// -----------------------------------------------------------------

test("attachHandle marks element with data-sortable-handle + grab cursor", () => {
    setupDOM();
    const { root, els } = mkList(["a"]);
    const s = createSortable();
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    const handle = document.createElement("span");
    els.a.appendChild(handle);
    s.attachHandle(handle, "a");
    assert.equal(handle.getAttribute("data-sortable-handle"), "true");
    assert.equal(handle.style.cursor, "grab");
    assert.equal(handle._lhSortableHandle, true);
    s.destroy();
    teardownDOM();
});

test("attachHandle throws if item not attached first", () => {
    setupDOM();
    const s = createSortable();
    const handle = document.createElement("span");
    assert.throws(() => s.attachHandle(handle, "nope"), /no item attached/);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Imperative API
// -----------------------------------------------------------------

test("move(key, toIndex) reorders + fires onReorder", () => {
    setupDOM();
    const calls = [];
    const s = createSortable({ items: ["a", "b", "c", "d"],
        onReorder: (order, info) => calls.push([order, info.reason]) });
    s.move("a", 2);
    assert.deepEqual(s.items(), ["b", "c", "a", "d"]);
    assert.deepEqual(calls, [[["b", "c", "a", "d"], "api"]]);
    s.destroy();
    teardownDOM();
});

test("move clamps out-of-range to last", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c"] });
    s.move("a", 99);
    assert.deepEqual(s.items(), ["b", "c", "a"]);
    s.destroy();
    teardownDOM();
});

test("move with same index is a no-op (no event)", () => {
    setupDOM();
    const calls = [];
    const s = createSortable({ items: ["a", "b", "c"],
        onReorder: (o) => calls.push(o) });
    s.move("b", 1);   // already there
    assert.deepEqual(calls, []);
    s.destroy();
    teardownDOM();
});

test("swap(a, b) swaps positions", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c", "d"] });
    s.swap("a", "c");
    assert.deepEqual(s.items(), ["c", "b", "a", "d"]);
    s.destroy();
    teardownDOM();
});

test("setOrder replaces the order array", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c"] });
    s.setOrder(["c", "a", "b"]);
    assert.deepEqual(s.items(), ["c", "a", "b"]);
    s.destroy();
    teardownDOM();
});

test("insertAt adds a new key at the given index", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c"] });
    s.insertAt("x", 1);
    assert.deepEqual(s.items(), ["a", "x", "b", "c"]);
    s.destroy();
    teardownDOM();
});

test("insertAt is a no-op if key already exists", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b"] });
    const ok = s.insertAt("a", 0);
    assert.equal(ok, false);
    assert.deepEqual(s.items(), ["a", "b"]);
    s.destroy();
    teardownDOM();
});

test("removeKey removes the key", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c"] });
    s.removeKey("b");
    assert.deepEqual(s.items(), ["a", "c"]);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// onReorder + info
// -----------------------------------------------------------------

test("onReorder info includes from + to indices + key for api moves", () => {
    setupDOM();
    let lastInfo = null;
    const s = createSortable({ items: ["a", "b", "c"],
        onReorder: (_, info) => { lastInfo = info; } });
    s.move("a", 2);
    assert.equal(lastInfo.reason, "api");
    assert.equal(lastInfo.from, 0);
    assert.equal(lastInfo.to, 2);
    assert.equal(lastInfo.key, "a");
    s.destroy();
    teardownDOM();
});

test("onReorder errors swallowed (don't break navigation)", () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b"],
        onReorder: () => { throw new Error("boom"); } });
    s.move("a", 1);  // should not throw
    assert.deepEqual(s.items(), ["b", "a"]);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// applyDOMReorder
// -----------------------------------------------------------------

test("applyDOMReorder: true moves DOM nodes on commit", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable({ items: ["a", "b", "c"], applyDOMReorder: true });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    s.move("a", 2);
    const ids = Array.from(root.children)
        .filter(c => c.id && c.id.startsWith("item-"))
        .map(c => c.id);
    assert.deepEqual(ids, ["item-b", "item-c", "item-a"]);
    s.destroy();
    teardownDOM();
});

test("applyDOMReorder: false (default) does NOT touch DOM", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable({ items: ["a", "b", "c"] });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    s.move("a", 2);
    const ids = Array.from(root.children)
        .filter(c => c.id && c.id.startsWith("item-"))
        .map(c => c.id);
    assert.deepEqual(ids, ["item-a", "item-b", "item-c"], "DOM unchanged in framework mode");
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Keyboard "picked up" mode
// -----------------------------------------------------------------

test("Space picks up an item; arrow moves it; Space drops", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c", "d"]);
    const calls = [];
    const s = createSortable({ items: ["a", "b", "c", "d"],
        onReorder: (o, info) => calls.push([o.slice(), info.reason]) });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    s.attachItem(els.d, "d");

    // Space picks up "a"
    dispatchKey(els.a, " ");
    assert.equal(els.a.getAttribute("aria-grabbed"), "true");
    assert.equal(els.a.getAttribute("data-dragging"), "true");

    // ArrowDown moves it by 1
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b", "a", "c", "d"]);

    // ArrowDown again
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b", "c", "a", "d"]);

    // Space drops
    dispatchKey(els.a, " ");
    assert.equal(els.a.hasAttribute("aria-grabbed"), false);
    assert.equal(els.a.hasAttribute("data-dragging"), false);

    // Two reorders happened
    assert.equal(calls.length, 2);
    assert.equal(calls[0][1], "keyboard");
    assert.equal(calls[1][1], "keyboard");

    s.destroy();
    teardownDOM();
});

test("Escape cancels keyboard pickup (no commit)", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const calls = [];
    const s = createSortable({ items: ["a", "b", "c"],
        onReorder: (o) => calls.push(o.slice()) });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");

    dispatchKey(els.a, " ");
    dispatchKey(els.a, "ArrowDown");      // tentative move
    assert.deepEqual(s.items(), ["b", "a", "c"]);
    assert.equal(calls.length, 1);

    dispatchKey(els.a, "Escape");
    // Escape ends pickup but the moves already happened (we don't
    // implement a revert-stack; the contract is that moves commit
    // as they happen). aria-grabbed cleared.
    assert.equal(els.a.hasAttribute("aria-grabbed"), false);
    assert.deepEqual(s.items(), ["b", "a", "c"], "tentative moves stay; cancel only ends pickup mode");

    s.destroy();
    teardownDOM();
});

test("Home / End jump to first / last position", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c", "d"]);
    const s = createSortable({ items: ["a", "b", "c", "d"] });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    s.attachItem(els.d, "d");

    dispatchKey(els.b, " ");
    dispatchKey(els.b, "End");
    assert.deepEqual(s.items(), ["a", "c", "d", "b"]);
    dispatchKey(els.b, "Home");
    assert.deepEqual(s.items(), ["b", "a", "c", "d"]);
    dispatchKey(els.b, "Escape");
    s.destroy();
    teardownDOM();
});

test("horizontal orientation uses Left/Right instead of Up/Down", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable({ orientation: "horizontal", items: ["a", "b", "c"] });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");

    dispatchKey(els.a, " ");
    dispatchKey(els.a, "ArrowRight");
    assert.deepEqual(s.items(), ["b", "a", "c"]);
    // ArrowDown should be no-op in horizontal mode
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b", "a", "c"]);
    dispatchKey(els.a, "Escape");
    s.destroy();
    teardownDOM();
});

test("keyboard disabled when keyboardEnabled: false", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b"]);
    const s = createSortable({ items: ["a", "b"], keyboardEnabled: false });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    dispatchKey(els.a, " ");
    assert.equal(els.a.hasAttribute("aria-grabbed"), false, "Space ignored");
    s.destroy();
    teardownDOM();
});

test("disabled item ignored by keyboard pickup", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b"]);
    const s = createSortable({ items: ["a", "b"] });
    s.attachRoot(root);
    s.attachItem(els.a, "a", { disabled: true });
    s.attachItem(els.b, "b");
    dispatchKey(els.a, " ");
    assert.equal(els.a.hasAttribute("aria-grabbed"), false);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// setItemDisabled
// -----------------------------------------------------------------

test("setItemDisabled toggles aria-disabled", () => {
    setupDOM();
    const { root, els } = mkList(["a"]);
    const s = createSortable({ items: ["a"] });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    assert.equal(els.a.hasAttribute("aria-disabled"), false);
    s.setItemDisabled("a", true);
    assert.equal(els.a.getAttribute("aria-disabled"), "true");
    s.setItemDisabled("a", false);
    assert.equal(els.a.hasAttribute("aria-disabled"), false);
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Destroy
// -----------------------------------------------------------------

test("destroy() is idempotent", () => {
    setupDOM();
    const s = createSortable({ items: ["a"] });
    s.destroy();
    assert.equal(s.destroyed, true);
    s.destroy();  // no throw
    teardownDOM();
});

test("destroy() stops further mutations", () => {
    setupDOM();
    const calls = [];
    const s = createSortable({ items: ["a", "b"],
        onReorder: (o) => calls.push(o) });
    s.move("a", 1);
    s.destroy();
    s.move("a", 0);  // should be no-op
    assert.equal(calls.length, 1);
    teardownDOM();
});

// -----------------------------------------------------------------
// Reactive order signal
// -----------------------------------------------------------------

test("order() returns signal getter that updates with mutations", async () => {
    setupDOM();
    const s = createSortable({ items: ["a", "b", "c"] });
    const seen = [];
    const { effect } = await import("@zakkster/lite-signal");
    const stop = effect(() => seen.push(s.order().slice()));
    s.move("a", 2);
    s.swap("b", "c");
    assert.deepEqual(seen, [
        ["a", "b", "c"],
        ["b", "c", "a"],
        ["c", "b", "a"],
    ]);
    stop();
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Regression: applyDOMReorder must preserve focus on the moved item
// -----------------------------------------------------------------
// Without focus preservation, appendChild blurs the focused element,
// breaking keyboard pickup mode after the first arrow press.

test("applyDOMReorder preserves focus on a moved sortable item", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable({ items: ["a","b","c"], applyDOMReorder: true });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    els.a.focus();
    assert.equal(document.activeElement, els.a, "precondition: a is focused");
    s.move("a", 2);                               // triggers applyDOMReorder
    assert.equal(document.activeElement, els.a, "focus on a survives applyDOMReorder");
    s.destroy();
    teardownDOM();
});

test("keyboard pickup: arrows continue to work after the first move (focus preserved)", () => {
    setupDOM();
    const { root, els } = mkList(["a","b","c","d"]);
    const s = createSortable({ items: ["a","b","c","d"], applyDOMReorder: true });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    s.attachItem(els.d, "d");

    els.a.focus();
    dispatchKey(els.a, " ");           // pick up
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b","a","c","d"], "first arrow moves");
    // After applyDOMReorder, a must still be focused so the NEXT keydown
    // routes to its listener.
    assert.equal(document.activeElement, els.a, "focus preserved after first move");
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b","c","a","d"], "second arrow ALSO moves");
    dispatchKey(els.a, "Escape");
    s.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Regression: disabled items remain valid as DROP NEIGHBORS
// (i.e., the rect cache and slot detection still include them so
// you can drop other items into the gap above/below a disabled
// neighbor). Before v0.7.20, `_buildRectCache` skipped disabled
// items, which caused slot detection to fall through past their
// slot -- the indicator painted on the wrong gap and the drop
// landed one position too far.
// -----------------------------------------------------------------

test("keyboard pickup: can move past a disabled neighbor (disabled is a valid drop target gap)", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c", "d"]);
    const s = createSortable({ items: ["a","b","c","d"], applyDOMReorder: true });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c", { disabled: true });        // c is disabled
    s.attachItem(els.d, "d");

    // pick up a, move down twice — should slot BEFORE c (the
    // disabled neighbor), producing [b, a, c, d]. Without the
    // rect-cache fix, the second arrow press would either no-op
    // or skip past c entirely.
    els.a.focus();
    dispatchKey(els.a, " ");
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b", "a", "c", "d"],
        "first ArrowDown moves past b");
    dispatchKey(els.a, "ArrowDown");
    assert.deepEqual(s.items(), ["b", "c", "a", "d"],
        "second ArrowDown moves past disabled c -- c remains a valid drop neighbor");
    dispatchKey(els.a, "Escape");
    s.destroy();
    teardownDOM();
});

test("setItemDisabled keeps the item in rect cache for slot detection", () => {
    setupDOM();
    const { root, els } = mkList(["a", "b", "c"]);
    const s = createSortable({ items: ["a","b","c"] });
    s.attachRoot(root);
    s.attachItem(els.a, "a");
    s.attachItem(els.b, "b");
    s.attachItem(els.c, "c");
    // disable c after attachment
    s.setItemDisabled("c", true);
    // c should still be marked aria-disabled
    assert.equal(els.c.getAttribute("aria-disabled"), "true");
    // and crucially -- if we move a to position 2, c is still part of
    // the layout, not silently filtered out. (Validates that
    // setItemDisabled doesn't trigger a cache invalidation that
    // would remove c.)
    s.move("a", 2);
    assert.deepEqual(s.items(), ["b", "c", "a"]);
    s.destroy();
    teardownDOM();
});
