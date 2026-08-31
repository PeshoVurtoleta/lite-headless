// combobox.test.js -- createCombobox: keyboard nav, typeahead, ARIA, selection

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks, dispatchKey, dispatchClick, dispatchPointer } from "./_setup.js";
import { createCombobox } from "../src/combobox/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    trigger.textContent = "Pick one";
    const listbox = document.createElement("ul");
    const items = ["Apple", "Banana", "Cherry", "Apricot"].map((label) => {
        const li = document.createElement("li");
        li.textContent = label;
        listbox.appendChild(li);
        return { el: li, value: label.toLowerCase(), label };
    });
    document.body.append(trigger, listbox);
    return { trigger, listbox, items };
}

function build(opts = {}) {
    const { trigger, listbox, items } = mkDOM();
    const combo = createCombobox({ container: null, ...opts });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const { el, value, label } of items) combo.attachItem(el, { value, label });
    return { combo, trigger, listbox, items };
}

test("trigger gets ARIA combobox attributes when attached", () => {
    setupDOM();
    const { combo, trigger, listbox } = build();
    assert.equal(trigger.getAttribute("aria-haspopup"), "listbox");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.getAttribute("aria-controls"), listbox.id);
    assert.equal(listbox.getAttribute("role"), "listbox");
    combo.destroy();
    teardownDOM();
});

test("items get role=option and unique ids", () => {
    setupDOM();
    const { combo, items } = build();
    for (const it of items) {
        assert.equal(it.el.getAttribute("role"), "option");
        assert.ok(it.el.id.startsWith("lh-option-"));
    }
    const ids = new Set(items.map((i) => i.el.id));
    assert.equal(ids.size, items.length, "ids are unique");
    combo.destroy();
    teardownDOM();
});

test("clicking trigger opens the listbox", () => {
    setupDOM();
    const { combo, trigger } = build();
    dispatchClick(trigger);
    assert.equal(combo.open(), true);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    combo.destroy();
    teardownDOM();
});

test("clicking an item selects its value and closes", () => {
    setupDOM();
    let lastReason = null;
    const { combo, items } = build({
        onValueChange: (_, reason) => { lastReason = reason; },
    });
    combo.setOpen(true, "api");
    dispatchClick(items[2].el);
    assert.equal(combo.value(), "cherry");
    assert.equal(combo.open(), false);
    assert.equal(lastReason, "select");
    assert.equal(items[2].el.getAttribute("aria-selected"), "true");
    combo.destroy();
    teardownDOM();
});

test("aria-selected reflects current value on existing items", () => {
    setupDOM();
    const { combo, items } = build({ defaultValue: "banana" });
    assert.equal(items[1].el.getAttribute("aria-selected"), "true");
    assert.equal(items[1].el.getAttribute("data-selected"), "");
    assert.equal(items[0].el.getAttribute("aria-selected"), "false");
    combo.destroy();
    teardownDOM();
});

test("ArrowDown opens the listbox when closed", () => {
    setupDOM();
    const { combo, trigger } = build();
    dispatchKey(trigger, "ArrowDown");
    assert.equal(combo.open(), true);
    combo.destroy();
    teardownDOM();
});

test("ArrowDown/Up moves highlight while open (with loop)", () => {
    setupDOM();
    const { combo, trigger, items } = build({ autoFocus: "first" });
    combo.setOpen(true, "api");
    assert.equal(combo._highlightIndex(), 0);

    dispatchKey(trigger, "ArrowDown");
    assert.equal(combo._highlightIndex(), 1);
    dispatchKey(trigger, "ArrowDown");
    dispatchKey(trigger, "ArrowDown");
    assert.equal(combo._highlightIndex(), 3);
    dispatchKey(trigger, "ArrowDown");  // wraps
    assert.equal(combo._highlightIndex(), 0);

    dispatchKey(trigger, "ArrowUp");    // wraps backward
    assert.equal(combo._highlightIndex(), 3);
    combo.destroy();
    teardownDOM();
});

test("loop:false clamps at boundaries instead of wrapping", () => {
    setupDOM();
    const { combo, trigger } = build({ loop: false, autoFocus: "first" });
    combo.setOpen(true, "api");
    for (let i = 0; i < 10; i++) dispatchKey(trigger, "ArrowDown");
    assert.equal(combo._highlightIndex(), 3, "stays at last");
    for (let i = 0; i < 10; i++) dispatchKey(trigger, "ArrowUp");
    assert.equal(combo._highlightIndex(), 0, "stays at first");
    combo.destroy();
    teardownDOM();
});

test("Home / End jump to first / last item", () => {
    setupDOM();
    const { combo, trigger } = build();
    combo.setOpen(true, "api");
    dispatchKey(trigger, "End");
    assert.equal(combo._highlightIndex(), 3);
    dispatchKey(trigger, "Home");
    assert.equal(combo._highlightIndex(), 0);
    combo.destroy();
    teardownDOM();
});

test("Enter on highlighted item selects it", () => {
    setupDOM();
    const { combo, trigger } = build();
    combo.setOpen(true, "api");
    dispatchKey(trigger, "ArrowDown");  // -> index 1: banana
    dispatchKey(trigger, "Enter");
    assert.equal(combo.value(), "banana");
    assert.equal(combo.open(), false);
    combo.destroy();
    teardownDOM();
});

test("Escape closes without selecting", () => {
    setupDOM();
    const { combo, trigger } = build({ defaultValue: "apple" });
    combo.setOpen(true, "api");
    dispatchKey(trigger, "ArrowDown");
    dispatchKey(document, "Escape");
    assert.equal(combo.open(), false);
    assert.equal(combo.value(), "apple", "value unchanged on Escape");
    combo.destroy();
    teardownDOM();
});

test("aria-activedescendant points at highlighted item id", () => {
    setupDOM();
    const { combo, trigger, items } = build();
    combo.setOpen(true, "api");
    // autoFocus:first -> highlight index 0
    assert.equal(trigger.getAttribute("aria-activedescendant"), items[0].el.id);
    dispatchKey(trigger, "ArrowDown");
    assert.equal(trigger.getAttribute("aria-activedescendant"), items[1].el.id);
    combo.setOpen(false, "api");
    assert.equal(trigger.hasAttribute("aria-activedescendant"), false, "cleared on close");
    combo.destroy();
    teardownDOM();
});

test("typeahead: single-char advances among matching items", () => {
    setupDOM();
    // items: Apple(0), Banana(1), Cherry(2), Apricot(3) -- two 'a' items
    const { combo, trigger } = build();
    combo.setOpen(true, "api");
    dispatchKey(trigger, "a");
    assert.equal(combo._highlightIndex(), 3, "advances past apple (already highlighted) to apricot");
    dispatchKey(trigger, "a");
    assert.equal(combo._highlightIndex(), 0, "wraps back to apple");
    combo.destroy();
    teardownDOM();
});

test("typeahead while closed opens the listbox and jumps", () => {
    setupDOM();
    const { combo, trigger } = build();
    dispatchKey(trigger, "c");
    assert.equal(combo.open(), true);
    assert.equal(combo._highlightIndex(), 2, "jumped to cherry");
    combo.destroy();
    teardownDOM();
});

test("pointermove on item updates highlight (mouse + keyboard coexist)", () => {
    setupDOM();
    const { combo, items } = build();
    combo.setOpen(true, "api");
    const e = new globalThis.Event("pointermove", { bubbles: true });
    items[2].el.dispatchEvent(e);
    assert.equal(combo._highlightIndex(), 2);
    combo.destroy();
    teardownDOM();
});

test("outside-click closes (and inside-click doesn't)", () => {
    setupDOM();
    const { combo, items } = build({ closeOnOutsideClick: true });
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    combo.setOpen(true, "api");

    dispatchPointer(items[0].el, "pointerdown");
    assert.equal(combo.open(), true, "clicking an item is inside");

    dispatchPointer(outside, "pointerdown");
    assert.equal(combo.open(), false, "outside dismisses");
    combo.destroy();
    teardownDOM();
});

test("Tab closes the listbox (so normal tab flow continues)", () => {
    setupDOM();
    const { combo, trigger } = build();
    combo.setOpen(true, "api");
    dispatchKey(trigger, "Tab");
    assert.equal(combo.open(), false);
    combo.destroy();
    teardownDOM();
});

test("setValue updates value and reflects on items even while closed", () => {
    setupDOM();
    const { combo, items } = build();
    combo.setValue("cherry");
    assert.equal(combo.value(), "cherry");
    assert.equal(items[2].el.getAttribute("aria-selected"), "true");
    combo.destroy();
    teardownDOM();
});

test("autoFocus:'selected' highlights the currently-selected item on open", () => {
    setupDOM();
    const { combo } = build({ defaultValue: "cherry", autoFocus: "selected" });
    combo.setOpen(true, "api");
    assert.equal(combo._highlightIndex(), 2, "started at the selected item");
    combo.destroy();
    teardownDOM();
});

test("destroy clears ARIA on trigger and items", () => {
    setupDOM();
    const { combo, trigger, items } = build();
    combo.setOpen(true, "api");
    combo.destroy();
    assert.equal(trigger.hasAttribute("aria-haspopup"), false);
    assert.equal(trigger.hasAttribute("aria-expanded"), false);
    assert.equal(items[0].el.hasAttribute("role"), false);
    teardownDOM();
});

test("attachInside protects external controls from outside-click dismissal", () => {
    setupDOM();
    const { combo } = build();
    const external = document.createElement("button");
    document.body.appendChild(external);
    combo.attachInside(external);
    combo.setOpen(true, "api");
    dispatchPointer(external, "pointerdown");
    assert.equal(combo.open(), true, "external button now treated as inside");
    combo.destroy();
    teardownDOM();
});

// ---------------------------------------------------------------------------
// multi-select (G-01 R1 slice): multiple:true adds has/toggleValue/values/
// attachChip + data-count + Backspace-on-empty; single-select paths untouched.
// ---------------------------------------------------------------------------

test("multiple: toggleValue adds/removes membership + fires onValueChange", () => {
    setupDOM();
    const changes = [];
    const combo = createCombobox({ multiple: true, onValueChange: (v, r) => changes.push([v.slice(), r]) });
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    assert.equal(combo.multiple, true);
    assert.equal(combo.has("apple"), false);
    combo.toggleValue("apple");
    assert.equal(combo.has("apple"), true);
    assert.deepEqual(combo.values(), ["apple"]);
    combo.toggleValue("banana");
    assert.deepEqual(combo.values().sort(), ["apple", "banana"]);
    combo.toggleValue("apple");
    assert.deepEqual(combo.values(), ["banana"]);
    assert.equal(changes[changes.length - 1][1], "api");
    combo.destroy();
    teardownDOM();
});

test("multiple: item click toggles (does not close), reflects aria-selected + data-count", () => {
    setupDOM();
    const combo = createCombobox({ multiple: true });
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    combo.setOpen(true);
    dispatchClick(items[0].el);
    assert.equal(items[0].el.getAttribute("aria-selected"), "true");
    assert.equal(combo.open(), true, "multi-select click keeps listbox open");
    assert.equal(trigger.getAttribute("data-count"), "1");
    dispatchClick(items[1].el);
    assert.equal(trigger.getAttribute("data-count"), "2");
    dispatchClick(items[0].el);
    assert.equal(items[0].el.getAttribute("aria-selected"), "false");
    assert.equal(trigger.getAttribute("data-count"), "1");
    combo.destroy();
    teardownDOM();
});

test("multiple: Backspace on empty trigger deselects the last value", () => {
    setupDOM();
    const combo = createCombobox({ multiple: true });
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    combo.toggleValue("apple");
    combo.toggleValue("banana");
    dispatchKey(trigger, "Backspace");
    assert.deepEqual(combo.values(), ["apple"]);
    dispatchKey(trigger, "Backspace");
    assert.deepEqual(combo.values(), []);
    dispatchKey(trigger, "Backspace"); // empty -> no throw
    assert.deepEqual(combo.values(), []);
    combo.destroy();
    teardownDOM();
});

test("multiple: attachChip removal deselects the value (click + keyboard)", () => {
    setupDOM();
    const combo = createCombobox({ multiple: true });
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    combo.toggleValue("apple");
    combo.toggleValue("banana");
    const chip = document.createElement("span");
    combo.attachChip(chip, "apple");
    assert.equal(chip.getAttribute("data-chip-value"), "apple");
    dispatchClick(chip);
    assert.equal(combo.has("apple"), false);
    const chip2 = document.createElement("span");
    combo.attachChip(chip2, "banana");
    dispatchKey(chip2, "Backspace");
    assert.equal(combo.has("banana"), false);
    combo.destroy();
    teardownDOM();
});

test("multiple: defaultValue array seeds the selection", () => {
    setupDOM();
    const combo = createCombobox({ multiple: true, defaultValue: ["apple", "cherry"] });
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    assert.deepEqual(combo.values().sort(), ["apple", "cherry"]);
    assert.equal(items[0].el.getAttribute("aria-selected"), "true"); // apple
    assert.equal(trigger.getAttribute("data-count"), "2");
    combo.destroy();
    teardownDOM();
});

test("multiple:false -- multi surface is inert (single-select untouched)", () => {
    setupDOM();
    const combo = createCombobox({});
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    assert.equal(combo.multiple, false);
    assert.deepEqual(combo.values(), []);
    const chip = document.createElement("span");
    assert.equal(typeof combo.attachChip(chip, "apple"), "function");
    assert.equal(chip.hasAttribute("data-chip"), false, "attachChip no-op when not multiple");
    assert.equal(trigger.hasAttribute("data-count"), false);
    combo.destroy();
    teardownDOM();
});

test("multiple omitted: toggleValue throws TypeError and leaves single-select intact (R6 fail-closed)", () => {
    setupDOM();
    const combo = createCombobox({});   // multiple omitted
    const { trigger, listbox, items } = mkDOM();
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });
    combo.setValue("a");
    assert.throws(
        () => combo.toggleValue("a"),
        (e) => e.name === "TypeError" && e.message === "createCombobox: toggleValue requires multiple: true",
    );
    // shadow set provably empty; single-select value untouched
    assert.equal(combo.has("a"), false);
    assert.deepEqual(combo.values(), []);
    assert.equal(combo.value(), "a");
    combo.destroy();
    teardownDOM();
});

test("multiple:false explicit: toggleValue throws the same TypeError", () => {
    setupDOM();
    const combo = createCombobox({ multiple: false });
    assert.throws(
        () => combo.toggleValue("x"),
        (e) => e.name === "TypeError" && e.message === "createCombobox: toggleValue requires multiple: true",
    );
    assert.equal(combo.has("x"), false);
    assert.deepEqual(combo.values(), []);
    combo.destroy();
    teardownDOM();
});
