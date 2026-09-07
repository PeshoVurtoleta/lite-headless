// checkbox.test.js -- createCheckbox tri-state (role=checkbox)
//
// Construction + option bag, tri-state transitions (APG), ARIA/data painting
// straight from the single 3-valued signal, Space keyboard, disabled, native
// input pairing, and the destroy/seal contract.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, dispatchClick } from "./_setup.js";
import { createCheckbox } from "../src/checkbox/index.js";

// ----- construction + option bag --------------------------------------------

test("createCheckbox defaults: unchecked, not indeterminate, not destroyed", () => {
    setupDOM();
    const cb = createCheckbox();
    assert.equal(cb.checked(), false);
    assert.equal(cb.indeterminate(), false);
    assert.equal(cb.destroyed, false);
    cb.destroy();
    teardownDOM();
});

test("createCheckbox fails closed on an unknown option with a did-you-mean", () => {
    setupDOM();
    assert.throws(() => createCheckbox({ defaultChekced: true }), /Did you mean "defaultChecked"/);
    assert.throws(() => createCheckbox(null), /must be a plain object/);
    teardownDOM();
});

test("defaultChecked / defaultIndeterminate seed the state", () => {
    setupDOM();
    const a = createCheckbox({ defaultChecked: true });
    assert.equal(a.checked(), true);
    assert.equal(a.indeterminate(), false);
    const b = createCheckbox({ defaultIndeterminate: true });
    assert.equal(b.checked(), false);
    assert.equal(b.indeterminate(), true);
    a.destroy(); b.destroy();
    teardownDOM();
});

// ----- tri-state transitions (APG) ------------------------------------------

test("toggle follows APG: mixed -> true -> false -> true", () => {
    setupDOM();
    const cb = createCheckbox({ defaultIndeterminate: true });
    assert.equal(cb.indeterminate(), true);
    cb.toggle();                       // mixed -> true
    assert.equal(cb.checked(), true);
    assert.equal(cb.indeterminate(), false);
    cb.toggle();                       // true -> false
    assert.equal(cb.checked(), false);
    cb.toggle();                       // false -> true
    assert.equal(cb.checked(), true);
    cb.destroy();
    teardownDOM();
});

test("setChecked clears mixed; setIndeterminate(true) sets mixed", () => {
    setupDOM();
    const cb = createCheckbox({ defaultIndeterminate: true });
    cb.setChecked(true);
    assert.equal(cb.indeterminate(), false);
    assert.equal(cb.checked(), true);
    cb.setIndeterminate(true);
    assert.equal(cb.indeterminate(), true);
    assert.equal(cb.checked(), false);
    cb.setIndeterminate(false);        // mixed -> resolve to unchecked
    assert.equal(cb.indeterminate(), false);
    assert.equal(cb.checked(), false);
    cb.destroy();
    teardownDOM();
});

// ----- painting straight from _state ----------------------------------------

test("attachRoot paints role=checkbox and aria-checked straight from _state", () => {
    setupDOM();
    const el = document.createElement("span");
    const cb = createCheckbox({ defaultIndeterminate: true });
    cb.attachRoot(el);
    assert.equal(el.getAttribute("role"), "checkbox");
    assert.equal(el.getAttribute("aria-checked"), "mixed");
    assert.equal(el.hasAttribute("data-indeterminate"), true);
    cb.toggle();
    assert.equal(el.getAttribute("aria-checked"), "true");
    assert.equal(el.hasAttribute("data-checked"), true);
    assert.equal(el.hasAttribute("data-indeterminate"), false);
    cb.setChecked(false);
    assert.equal(el.getAttribute("aria-checked"), "false");
    assert.equal(el.hasAttribute("data-checked"), false);
    cb.destroy();
    teardownDOM();
});

// ----- keyboard + click -----------------------------------------------------

test("Space toggles; click toggles", () => {
    setupDOM();
    const el = document.createElement("span");
    const cb = createCheckbox();
    cb.attachRoot(el);
    dispatchKey(el, " ");
    assert.equal(cb.checked(), true);
    dispatchClick(el);
    assert.equal(cb.checked(), false);
    cb.destroy();
    teardownDOM();
});

// ----- disabled -------------------------------------------------------------

test("disabled blocks toggle and paints aria-disabled", () => {
    setupDOM();
    const el = document.createElement("span");
    const cb = createCheckbox({ disabled: true });
    cb.attachRoot(el);
    assert.equal(el.getAttribute("aria-disabled"), "true");
    assert.equal(el.hasAttribute("data-disabled"), true);
    dispatchKey(el, " ");
    assert.equal(cb.checked(), false);   // blocked
    cb.setDisabled(false);
    dispatchKey(el, " ");
    assert.equal(cb.checked(), true);
    cb.destroy();
    teardownDOM();
});

// ----- native input pairing -------------------------------------------------

test("attachInput syncs checked + indeterminate to the native input", () => {
    setupDOM();
    const input = document.createElement("input");
    const cb = createCheckbox({ defaultIndeterminate: true });
    cb.attachInput(input);
    assert.equal(input.indeterminate, true);
    assert.equal(input.checked, false);
    cb.toggle();
    assert.equal(input.checked, true);
    assert.equal(input.indeterminate, false);
    cb.destroy();
    teardownDOM();
});

// ----- onChange -------------------------------------------------------------

test("onChange fires with the derived boolean + reason", () => {
    setupDOM();
    let seen = null, reason = null;
    const cb = createCheckbox({ onChange: (c, r) => { seen = c; reason = r; } });
    cb.toggle();
    assert.equal(seen, true);
    assert.equal(reason, "toggle");
    cb.destroy();
    teardownDOM();
});

// ----- destroy / seal -------------------------------------------------------

test("destroy freezes state at its final value and no-ops setters", () => {
    setupDOM();
    const cb = createCheckbox();
    cb.setChecked(true);
    cb.destroy();
    assert.equal(cb.destroyed, true);
    assert.equal(cb.checked(), true);     // frozen at final
    cb.setChecked(false);                 // no-op after destroy
    assert.equal(cb.checked(), true);
    teardownDOM();
});
