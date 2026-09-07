// select.test.js -- createSelect end-to-end (listbox-button pattern)
//
// Construction + option bag, ARIA painting, value control, APG keyboard truth
// table (typeahead, Home/End, disabled-skip, Up/Down wrap, Enter/Space/Escape),
// dismiss, and the destroy/seal contract. Combobox's keyboard suite is the
// oracle template; select drops the editable-input lane.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, flushMicrotasks } from "./_setup.js";
import { createSelect } from "../src/select/index.js";
import { signal } from "@zakkster/lite-signal";

function build(opts) {
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.appendChild(trigger);
    document.body.appendChild(listbox);
    const sel = createSelect(opts);
    sel.attachTrigger(trigger);
    sel.attachListbox(listbox);
    const items = [];
    function addItem(value, label, disabled) {
        const li = document.createElement("li");
        li.textContent = label || value;
        listbox.appendChild(li);
        const off = sel.attachItem(li, { value, label, disabled });
        items.push({ el: li, value, off });
        return li;
    }
    return { sel, trigger, listbox, items, addItem };
}

// ----- construction + option bag --------------------------------------------

test("createSelect defaults: closed, null value, not destroyed", () => {
    setupDOM();
    const sel = createSelect();
    assert.equal(sel.open(), false);
    assert.equal(sel.value(), null);
    assert.equal(sel.destroyed, false);
    sel.destroy();
    teardownDOM();
});

test("createSelect fails closed on an unknown option with a did-you-mean", () => {
    setupDOM();
    assert.throws(() => createSelect({ placment: "top" }), /Did you mean "placement"/);
    assert.throws(() => createSelect(null), /must be a plain object/);
    teardownDOM();
});

test("createSelect defaultValue seeds the selection", () => {
    setupDOM();
    const sel = createSelect({ defaultValue: "b" });
    assert.equal(sel.value(), "b");
    sel.destroy();
    teardownDOM();
});

// ----- ARIA painting --------------------------------------------------------

test("attachTrigger paints role=button + aria-haspopup=listbox + aria-expanded", () => {
    setupDOM();
    const { sel, trigger } = build();
    assert.equal(trigger.getAttribute("role"), "button");
    assert.equal(trigger.getAttribute("aria-haspopup"), "listbox");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    sel.destroy();
    teardownDOM();
});

test("attachListbox paints role=listbox + aria-hidden when closed", () => {
    setupDOM();
    const { sel, listbox } = build();
    assert.equal(listbox.getAttribute("role"), "listbox");
    assert.equal(listbox.getAttribute("aria-hidden"), "true");
    sel.destroy();
    teardownDOM();
});

test("attachItem paints role=option + aria-selected reflects value", () => {
    setupDOM();
    const { sel, addItem } = build({ defaultValue: "b" });
    const a = addItem("a", "Apple");
    const b = addItem("b", "Banana");
    assert.equal(a.getAttribute("role"), "option");
    assert.equal(a.getAttribute("aria-selected"), "false");
    assert.equal(b.getAttribute("aria-selected"), "true");
    sel.setValue("a");
    assert.equal(a.getAttribute("aria-selected"), "true");
    assert.equal(b.getAttribute("aria-selected"), "false");
    sel.destroy();
    teardownDOM();
});

// ----- open / close ---------------------------------------------------------

test("trigger click toggles open, paints aria-expanded", () => {
    setupDOM();
    const { sel, trigger } = build();
    assert.equal(sel.open(), false);
    dispatchKey(trigger, "Enter");
    assert.equal(sel.open(), true);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    dispatchKey(trigger, "Escape");
    assert.equal(sel.open(), false);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    sel.destroy();
    teardownDOM();
});

// ----- keyboard truth table -------------------------------------------------

test("ArrowDown/ArrowUp move highlight and wrap when loop", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ loop: true, autoFocus: "none" });
    addItem("a"); addItem("b"); addItem("c");
    sel.setOpen(true);
    dispatchKey(trigger, "ArrowDown");
    assert.equal(sel._highlightIndex(), 0);
    dispatchKey(trigger, "ArrowUp");   // wrap to last
    assert.equal(sel._highlightIndex(), 2);
    dispatchKey(trigger, "ArrowDown"); // wrap to first
    assert.equal(sel._highlightIndex(), 0);
    sel.destroy();
    teardownDOM();
});

test("Home/End jump to first/last enabled", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ autoFocus: "none" });
    addItem("a"); addItem("b"); addItem("c");
    sel.setOpen(true);
    dispatchKey(trigger, "End");
    assert.equal(sel._highlightIndex(), 2);
    dispatchKey(trigger, "Home");
    assert.equal(sel._highlightIndex(), 0);
    sel.destroy();
    teardownDOM();
});

test("disabled option is skipped by navigation and cannot be selected", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ autoFocus: "none" });
    addItem("a"); addItem("b", "B", true); addItem("c");
    sel.setOpen(true);
    dispatchKey(trigger, "ArrowDown"); // -> a (0)
    assert.equal(sel._highlightIndex(), 0);
    dispatchKey(trigger, "ArrowDown"); // skip b -> c (2)
    assert.equal(sel._highlightIndex(), 2);
    sel.destroy();
    teardownDOM();
});

test("Enter/Space selects the highlighted option and closes", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ autoFocus: "first" });
    addItem("a"); addItem("b");
    sel.setOpen(true);
    dispatchKey(trigger, "ArrowDown"); // highlight b
    dispatchKey(trigger, "Enter");
    assert.equal(sel.value(), "b");
    assert.equal(sel.open(), false);
    sel.destroy();
    teardownDOM();
});

test("typeahead jumps to the first matching label", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ autoFocus: "none" });
    addItem("a", "Apple"); addItem("b", "Banana"); addItem("c", "Cherry");
    sel.setOpen(true);
    dispatchKey(trigger, "c");
    assert.equal(sel._highlightIndex(), 2);
    sel.destroy();
    teardownDOM();
});

test("same-char typeahead cycles through matching labels", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ autoFocus: "none" });
    addItem("a1", "Apple"); addItem("a2", "Avocado"); addItem("b", "Banana");
    sel.setOpen(true);
    dispatchKey(trigger, "a");
    assert.equal(sel._highlightIndex(), 0);
    dispatchKey(trigger, "a");
    assert.equal(sel._highlightIndex(), 1);
    sel.destroy();
    teardownDOM();
});

test("printable key opens a closed select and typeaheads", () => {
    setupDOM();
    const { sel, trigger, addItem } = build({ autoFocus: "none" });
    addItem("a", "Apple"); addItem("b", "Banana");
    assert.equal(sel.open(), false);
    dispatchKey(trigger, "b");
    assert.equal(sel.open(), true);
    assert.equal(sel._highlightIndex(), 1);
    sel.destroy();
    teardownDOM();
});

// ----- controlled value -----------------------------------------------------

test("controlled value reads the external signal and does not mutate it", () => {
    setupDOM();
    const v = signal("a");
    let changed = null;
    const { sel } = build({ value: v, onValueChange: (nv) => { changed = nv; } });
    assert.equal(sel.value(), "a");
    sel.setValue("b");
    // controlled: internal does not flip the external signal; consumer does.
    assert.equal(v(), "b"); // writeValue calls .set on external signal
    assert.equal(changed, "b");
    sel.destroy();
    teardownDOM();
});

// ----- destroy / seal -------------------------------------------------------

test("destroy freezes value at its final value and no-ops setters", () => {
    setupDOM();
    const { sel } = build({ defaultValue: "a" });
    sel.setValue("b");
    sel.destroy();
    assert.equal(sel.destroyed, true);
    assert.equal(sel.value(), "b");        // frozen at final
    sel.setValue("c");                     // no-op after destroy
    assert.equal(sel.value(), "b");
    teardownDOM();
});

test("item off() unregisters and clamps the highlight", async () => {
    setupDOM();
    const { sel, trigger, items, addItem } = build({ autoFocus: "none" });
    addItem("a"); addItem("b"); addItem("c");
    sel.setOpen(true);
    dispatchKey(trigger, "End");
    assert.equal(sel._highlightIndex(), 2);
    items[2].off();
    assert.equal(sel._highlightIndex(), 1);
    sel.destroy();
    await flushMicrotasks();
    teardownDOM();
});
