// checkbox-group.test.js -- createCheckboxGroup derived tri-state
//
// Members join via register() (member checkbox allocated there, not in an
// effect). Group state() is DERIVED (never stored): all "true" -> "true",
// all "false" -> "false", else "mixed". value() reflects checked members. A
// master derives from state(); setting the master sets all members. Removal +
// destroy pool-return per-member nodes (H-12).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createCheckboxGroup } from "../src/checkbox-group/index.js";

// ----- construction + option bag --------------------------------------------

test("createCheckboxGroup defaults: empty group reads false", () => {
    setupDOM();
    const g = createCheckboxGroup();
    assert.equal(g.state(), "false");
    assert.deepEqual(g.value(), []);
    assert.equal(g.memberCount, 0);
    g.destroy();
    teardownDOM();
});

test("createCheckboxGroup fails closed on an unknown option", () => {
    setupDOM();
    assert.throws(() => createCheckboxGroup({ disabld: true }), /Did you mean "disabled"/);
    assert.throws(() => createCheckboxGroup(null), /must be a plain object/);
    teardownDOM();
});

test("register fails closed on an unknown member option", () => {
    setupDOM();
    const g = createCheckboxGroup();
    assert.throws(() => g.register("a", { defaultChekced: true }), /Did you mean "defaultChecked"/);
    g.destroy();
    teardownDOM();
});

// ----- derived state (A4) ---------------------------------------------------

test("group state is DERIVED: 3/3 -> true, 1/3 -> mixed, 0/3 -> false", () => {
    setupDOM();
    const g = createCheckboxGroup();
    const a = g.register("a");
    const b = g.register("b");
    const c = g.register("c");
    assert.equal(g.state(), "false");     // 0/3
    a.checkbox.setChecked(true);
    assert.equal(g.state(), "mixed");     // 1/3
    b.checkbox.setChecked(true);
    c.checkbox.setChecked(true);
    assert.equal(g.state(), "true");      // 3/3
    assert.deepEqual(g.value().sort(), ["a", "b", "c"]);
    g.destroy();
    teardownDOM();
});

test("a member's own indeterminate makes the group mixed", () => {
    setupDOM();
    const g = createCheckboxGroup();
    const a = g.register("a");
    g.register("b");
    a.checkbox.setIndeterminate(true);
    assert.equal(g.state(), "mixed");
    g.destroy();
    teardownDOM();
});

// ----- master / select-all --------------------------------------------------

test("master derives from state and setting it sets all members", () => {
    setupDOM();
    const el = document.createElement("span");
    const g = createCheckboxGroup();
    g.attachMaster(el);
    const a = g.register("a");
    const b = g.register("b");
    assert.equal(el.getAttribute("aria-checked"), "false");
    a.checkbox.setChecked(true);          // partial -> master mixed
    assert.equal(el.getAttribute("aria-checked"), "mixed");
    assert.equal(el.hasAttribute("data-indeterminate"), true);
    dispatchClick(el);                    // not all-on -> turn all on
    assert.equal(a.checkbox.checked(), true);
    assert.equal(b.checkbox.checked(), true);
    assert.equal(el.getAttribute("aria-checked"), "true");
    dispatchClick(el);                    // all-on -> clear
    assert.equal(a.checkbox.checked(), false);
    assert.equal(b.checkbox.checked(), false);
    g.destroy();
    teardownDOM();
});

// ----- membership change reactivity -----------------------------------------

test("removing a member updates the derived state and value", () => {
    setupDOM();
    const g = createCheckboxGroup();
    const a = g.register("a");
    const b = g.register("b");
    a.checkbox.setChecked(true);
    b.checkbox.setChecked(true);
    assert.equal(g.state(), "true");
    a.off();                              // drop a checked member
    assert.equal(g.memberCount, 1);
    assert.deepEqual(g.value(), ["b"]);
    assert.equal(g.state(), "true");
    g.destroy();
    teardownDOM();
});

// ----- onChange -------------------------------------------------------------

test("group onChange fires with the derived value array", () => {
    setupDOM();
    let seen = null;
    const g = createCheckboxGroup({ onChange: (vals) => { seen = vals; } });
    const a = g.register("a");
    g.register("b");
    a.checkbox.setChecked(true);
    assert.deepEqual(seen, ["a"]);
    g.destroy();
    teardownDOM();
});

// ----- destroy --------------------------------------------------------------

test("destroy is idempotent and no-ops mutations", () => {
    setupDOM();
    const g = createCheckboxGroup();
    const a = g.register("a");
    a.checkbox.setChecked(true);
    g.destroy();
    assert.equal(g.destroyed, true);
    assert.equal(g.memberCount, 0);       // members pool-returned + cleared
    g.setAll(true);                       // no-op, no throw
    assert.doesNotThrow(() => g.destroy());
    teardownDOM();
});

// ----- setAll batching (H12 reviewer NIT: one onChange, not per-member) ------

test("setAll fires the group onChange exactly once, not once per member", () => {
    setupDOM();
    let calls = 0;
    let lastVals = null;
    const g = createCheckboxGroup({ onChange: (vals) => { calls++; lastVals = vals; } });
    g.register("a");
    g.register("b");
    g.register("c");
    assert.equal(calls, 0, "register must not fire onChange");
    g.setAll(true);
    assert.equal(calls, 1, "setAll fired onChange once (got " + calls + ")");
    assert.deepEqual(lastVals, ["a", "b", "c"], "onChange got the full derived array");
    g.setAll(true);                       // already all-on -> no member change
    assert.equal(calls, 1, "setAll with no change fires no onChange (still " + calls + ")");
    g.setAll(false);
    assert.equal(calls, 2, "setAll(false) fired once more");
    assert.deepEqual(lastVals, [], "cleared -> empty array");
    g.destroy();
    teardownDOM();
});
