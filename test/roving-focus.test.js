// roving-focus.test.js -- the shared keyboard-driven highlight engine

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import {
    createRovingFocus,
    STRATEGY_DOM_FOCUS,
    STRATEGY_ACTIVE_DESCENDANT,
} from "../src/_overlay/roving-focus.js";

function mkItems(labels) {
    const out = [];
    for (let i = 0; i < labels.length; i++) {
        const el = document.createElement("li");
        el.textContent = labels[i];
        el.id = `item-${i}`;
        document.body.append(el);
        out.push({ el, id: el.id, label: labels[i].toLowerCase() });
    }
    return out;
}

// -----------------------------------------------------------------
// strategy: dom-focus (menu pattern)
// -----------------------------------------------------------------

test("dom-focus: setIndex applies tabindex + data-focused + DOM focus", () => {
    setupDOM();
    const items = mkItems(["apple", "banana", "cherry"]);
    const r = createRovingFocus({ getItems: () => items, strategy: STRATEGY_DOM_FOCUS });

    r.setIndex(1);
    assert.equal(items[0].el.getAttribute("tabindex"), "-1");
    assert.equal(items[1].el.getAttribute("tabindex"), "0");
    assert.equal(items[2].el.getAttribute("tabindex"), "-1");
    assert.equal(items[1].el.getAttribute("data-focused"), "");
    assert.equal(items[0].el.hasAttribute("data-focused"), false);
    assert.equal(r.index, 1);
    teardownDOM();
});

test("dom-focus: move(+1) advances + wraps when loop=true", () => {
    setupDOM();
    const items = mkItems(["a", "b", "c"]);
    const r = createRovingFocus({ getItems: () => items, loop: true });
    r.setIndex(0);
    r.move(+1); assert.equal(r.index, 1);
    r.move(+1); assert.equal(r.index, 2);
    r.move(+1); assert.equal(r.index, 0);   // wrapped
    teardownDOM();
});

test("dom-focus: move clamps at ends when loop=false", () => {
    setupDOM();
    const items = mkItems(["a", "b", "c"]);
    const r = createRovingFocus({ getItems: () => items, loop: false });
    r.setIndex(2);
    r.move(+1); assert.equal(r.index, 2);   // clamped
    r.move(-1); assert.equal(r.index, 1);
    r.setIndex(0);
    r.move(-1); assert.equal(r.index, 0);   // clamped
    teardownDOM();
});

test("dom-focus: disabled items are skipped during move", () => {
    setupDOM();
    const items = mkItems(["a", "b", "c", "d"]);
    items[1].disabled = true;
    items[2].disabled = true;
    const r = createRovingFocus({ getItems: () => items });
    r.setIndex(0);
    r.move(+1);
    assert.equal(r.index, 3, "skipped past disabled b and c -> d");
    teardownDOM();
});

test("dom-focus: first() / last() honor disabled", () => {
    setupDOM();
    const items = mkItems(["a", "b", "c", "d"]);
    items[0].disabled = true;
    items[3].disabled = true;
    const r = createRovingFocus({ getItems: () => items });
    r.first(); assert.equal(r.index, 1);    // first enabled
    r.last();  assert.equal(r.index, 2);    // last enabled
    teardownDOM();
});

test("dom-focus: typeahead -- prefix match jumps to matching item", () => {
    setupDOM();
    const items = mkItems(["Apple", "Banana", "Cherry", "Date"]);
    const r = createRovingFocus({ getItems: () => items });
    r.typeChar("c");
    assert.equal(r.index, 2, "typed 'c' -> Cherry");
    teardownDOM();
});

test("dom-focus: typeahead -- same-char hammering cycles among matches", () => {
    setupDOM();
    const items = mkItems(["Apple", "Apricot", "Avocado", "Banana"]);
    const r = createRovingFocus({ getItems: () => items });
    r.typeChar("a"); assert.equal(r.index, 0, "first 'a' -> Apple");
    r.typeChar("a"); assert.equal(r.index, 1, "second 'a' (cycle) -> Apricot");
    r.typeChar("a"); assert.equal(r.index, 2, "third 'a' -> Avocado");
    r.typeChar("a"); assert.equal(r.index, 0, "fourth 'a' wraps");
    teardownDOM();
});

test("dom-focus: typeahead -- mixed chars within window form a prefix", () => {
    setupDOM();
    const items = mkItems(["Apple", "Apricot", "Avocado"]);
    const r = createRovingFocus({ getItems: () => items });
    r.typeChar("a"); assert.equal(r.index, 0);
    r.typeChar("p");   // "ap" -> Apple matches first
    assert.equal(r.index, 0);
    r.typeChar("r");   // "apr" -> Apricot
    assert.equal(r.index, 1);
    teardownDOM();
});

test("dom-focus: typeahead skips disabled items", () => {
    setupDOM();
    const items = mkItems(["Apple", "Apricot"]);
    items[0].disabled = true;
    const r = createRovingFocus({ getItems: () => items });
    r.typeChar("a");
    assert.equal(r.index, 1, "disabled Apple is skipped -> Apricot");
    teardownDOM();
});

test("dom-focus: reset clears index, typeahead buffer, and data-focused", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    const r = createRovingFocus({ getItems: () => items });
    r.setIndex(0);
    r.typeChar("b");
    assert.equal(r.index, 1);
    r.reset();
    assert.equal(r.index, -1);
    assert.equal(items[0].el.hasAttribute("data-focused"), false);
    assert.equal(items[1].el.hasAttribute("data-focused"), false);
    teardownDOM();
});

test("dom-focus: setIndex(-1) clears highlight without setting focus", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    const r = createRovingFocus({ getItems: () => items });
    r.setIndex(0);
    r.setIndex(-1);
    assert.equal(r.index, -1);
    assert.equal(items[0].el.hasAttribute("data-focused"), false);
    teardownDOM();
});

test("dom-focus: setIndex out-of-range falls back to -1", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    const r = createRovingFocus({ getItems: () => items });
    r.setIndex(99);
    assert.equal(r.index, -1);
    r.setIndex(-5);
    assert.equal(r.index, -1);
    teardownDOM();
});

test("dom-focus: onIndexChange fires with new + previous", () => {
    setupDOM();
    const items = mkItems(["a", "b", "c"]);
    const calls = [];
    const r = createRovingFocus({
        getItems: () => items,
        onIndexChange: (idx, prev) => calls.push({ idx, prev }),
    });
    r.setIndex(1);
    r.setIndex(2);
    r.setIndex(2);   // same idx -> no fire
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { idx: 1, prev: -1 });
    assert.deepEqual(calls[1], { idx: 2, prev: 1 });
    teardownDOM();
});

// -----------------------------------------------------------------
// strategy: active-descendant (combobox pattern)
// -----------------------------------------------------------------

test("active-descendant: setIndex applies aria-activedescendant on host + data-highlighted on item", () => {
    setupDOM();
    const items = mkItems(["a", "b", "c"]);
    const host = document.createElement("input");
    document.body.append(host);
    const r = createRovingFocus({
        getItems: () => items,
        strategy: STRATEGY_ACTIVE_DESCENDANT,
        getFocusHost: () => host,
    });
    r.setIndex(1);
    assert.equal(host.getAttribute("aria-activedescendant"), "item-1");
    assert.equal(items[1].el.getAttribute("data-highlighted"), "");
    // siblings DON'T get tabindex changes in active-descendant mode
    assert.equal(items[0].el.hasAttribute("tabindex"), false);
    teardownDOM();
});

test("active-descendant: move + typeahead cycle work + update host attr", () => {
    setupDOM();
    const items = mkItems(["Apple", "Banana", "Apricot"]);
    const host = document.createElement("input");
    document.body.append(host);
    const r = createRovingFocus({
        getItems: () => items,
        strategy: STRATEGY_ACTIVE_DESCENDANT,
        getFocusHost: () => host,
    });
    r.move(+1); assert.equal(r.index, 0);
    r.move(+1); assert.equal(r.index, 1);
    assert.equal(host.getAttribute("aria-activedescendant"), "item-1");
    r.typeChar("a");
    // From Banana, typing 'a' cycles to next match -> Apricot (idx 2)
    assert.equal(r.index, 2);
    assert.equal(host.getAttribute("aria-activedescendant"), "item-2");
    teardownDOM();
});

test("active-descendant: setIndex(-1) removes aria-activedescendant from host", () => {
    setupDOM();
    const items = mkItems(["a"]);
    const host = document.createElement("input");
    document.body.append(host);
    const r = createRovingFocus({
        getItems: () => items,
        strategy: STRATEGY_ACTIVE_DESCENDANT,
        getFocusHost: () => host,
    });
    r.setIndex(0);
    assert.equal(host.getAttribute("aria-activedescendant"), "item-0");
    r.setIndex(-1);
    assert.equal(host.hasAttribute("aria-activedescendant"), false);
    teardownDOM();
});

test("active-descendant: reset also clears host aria-activedescendant", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    const host = document.createElement("input");
    document.body.append(host);
    const r = createRovingFocus({
        getItems: () => items,
        strategy: STRATEGY_ACTIVE_DESCENDANT,
        getFocusHost: () => host,
    });
    r.setIndex(1);
    assert.equal(host.getAttribute("aria-activedescendant"), "item-1");
    r.reset();
    assert.equal(host.hasAttribute("aria-activedescendant"), false);
    assert.equal(r.index, -1);
    teardownDOM();
});

// -----------------------------------------------------------------
// shared
// -----------------------------------------------------------------

test("custom getLabel is used for typeahead matching", () => {
    setupDOM();
    const items = mkItems(["ignored1", "ignored2"]);
    // Override label resolution with a synthetic field
    items[0].customLabel = "apple";
    items[1].customLabel = "banana";
    const r = createRovingFocus({
        getItems: () => items,
        getLabel: (it) => it.customLabel,
    });
    r.typeChar("b");
    assert.equal(r.index, 1);
    teardownDOM();
});

test("typeahead disabled via option", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    const r = createRovingFocus({ getItems: () => items, typeahead: false });
    const result = r.typeChar("b");
    assert.equal(result, false);
    assert.equal(r.index, -1, "typeahead disabled -> no highlight change");
    teardownDOM();
});

test("destroy is idempotent and clears the typeahead timer", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    const r = createRovingFocus({ getItems: () => items });
    r.typeChar("a");
    r.destroy();
    r.destroy();   // no throw
    teardownDOM();
});

test("empty items list: move/first/last/typeChar are no-ops", () => {
    setupDOM();
    const r = createRovingFocus({ getItems: () => [] });
    r.move(+1); assert.equal(r.index, -1);
    r.first();  assert.equal(r.index, -1);
    r.last();   assert.equal(r.index, -1);
    r.typeChar("x"); assert.equal(r.index, -1);
    teardownDOM();
});

test("all-disabled items: move/first/last skip cleanly", () => {
    setupDOM();
    const items = mkItems(["a", "b"]);
    items[0].disabled = true;
    items[1].disabled = true;
    const r = createRovingFocus({ getItems: () => items });
    r.move(+1); assert.equal(r.index, -1);
    r.first();  assert.equal(r.index, -1);
    teardownDOM();
});
