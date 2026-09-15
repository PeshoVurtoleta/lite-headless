// saved-views.test.js -- createSavedViews state, dirty, persistence, fail-closed,
// reactivity, and H-12 pool return. Driven by a STUB getState/setState (a plain
// object, or a signal-backed one where reactivity is under test) so the core is
// proven WITHOUT importing @zakkster/lite-table (it is not a dep/peer).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import {
    signal, effect, dispose,
    createRegistry, setDefaultRegistry,
} from "@zakkster/lite-signal";
import { createSavedViews } from "../src/saved-views/index.js";

// Own registry so A6 can read activeNodes and assert exact pool return. Sized
// large so the handful of undisposed signal-stubs in reactivity tests never
// crowd the churn assertion.
const REG = createRegistry({ maxNodes: 100000 });
setDefaultRegistry(REG);
const activeNodes = () => REG.stats().activeNodes;

// Plain-object stub: no signal, so nothing accumulates in the pool. getState
// returns the current object BY REFERENCE; setState replaces it and records the
// call; set() simulates an external state change.
function plainStub(initial) {
    let st = initial;
    const calls = [];
    return {
        getState: () => st,
        setState: (v) => { calls.push(v); st = v; },
        set: (v) => { st = v; },
        calls,
    };
}

// Signal-backed stub: getState reads the signal, so isDirty() read inside an
// effect re-runs when the underlying state changes (the reactive-when-wrapped
// contract). Disposed by the test that builds it.
function signalStub(initial) {
    const s = signal(initial);
    return {
        getState: () => s(),
        setState: (v) => s.set(v),
        set: (v) => s.set(v),
        release: () => dispose(s),
    };
}

// =====================================================================
// A1 -- round-trip: apply(save("v").id) hands setState the EXACT captured state
// =====================================================================

test("A1 round-trip: apply passes the exact snapshot captured by save (100 cycles)", () => {
    for (let i = 0; i < 100; i++) {
        const stub = plainStub({ q: "a" + i, sort: i });
        const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
        const captured = stub.getState();
        const v = sv.save("view" + i);
        assert.equal(v.state, captured, "snapshot stored by reference");
        stub.set({ q: "drifted", sort: -1 });     // move the state away
        sv.apply(v.id);
        assert.equal(stub.calls[stub.calls.length - 1], captured, "setState got the exact captured object");
        sv.destroy();
    }
});

// =====================================================================
// A2 -- dirty transitions: false after save, true after drift, false after apply
// =====================================================================

test("A2 dirty: false after save, true after state drifts, false after apply", () => {
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    const v = sv.save("v");
    assert.equal(sv.isDirty(), false, "not dirty immediately after save");
    stub.set({ q: "b" });
    assert.equal(sv.isDirty(), true, "dirty after the state mutates");
    sv.apply(v.id);
    assert.equal(sv.isDirty(), false, "not dirty after apply of the active view");
    sv.destroy();
});

test("A2b dirty: false when there is no active view", () => {
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    assert.equal(sv.isDirty(), false, "no active view -> not dirty (fail safe)");
    sv.destroy();
});

// =====================================================================
// A3 -- fail-closed: five throws
// =====================================================================

test("A3 fail-closed: missing getState throws TypeError", () => {
    assert.throws(() => createSavedViews({ setState: () => {} }), /getState must be a function/);
});

test("A3 fail-closed: missing setState throws TypeError", () => {
    assert.throws(() => createSavedViews({ getState: () => ({}) }), /setState must be a function/);
});

test("A3 fail-closed: unknown id on apply throws TypeError", () => {
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    assert.throws(() => sv.apply("nope"), /unknown view id/);
    sv.destroy();
});

test("A3 fail-closed: blank name on save throws TypeError", () => {
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    assert.throws(() => sv.save(""), /non-blank string/);
    assert.throws(() => sv.save("   "), /non-blank string/);
    sv.destroy();
});

test("A3 fail-closed: unknown option key throws with a did-you-mean hint", () => {
    assert.throws(
        () => createSavedViews({ getState: () => ({}), setState: () => {}, generatId: () => "x" }),
        /Did you mean "generateId"\?/,
    );
});

test("A3 fail-closed: unknown id on update/remove/rename; blank rename", () => {
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    const v = sv.save("v");
    assert.throws(() => sv.update("nope"), /unknown view id/);
    assert.throws(() => sv.remove("nope"), /unknown view id/);
    assert.throws(() => sv.rename("nope", "x"), /unknown view id/);
    assert.throws(() => sv.rename(v.id, ""), /non-blank string/);
    sv.destroy();
});

// =====================================================================
// A4 -- persistence: load seeds the collection; save persists on collection
// change but NOT on apply
// =====================================================================

test("A4 persistence: load() seeds; save/update/remove/rename persist; apply does not", () => {
    let saved = "UNSET";
    const store = {
        load: () => [{ id: "x", name: "X", state: { q: 1 } }],
        save: (views) => { saved = views; },
    };
    const stub = plainStub({ q: 2 });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState, storage: store });

    assert.equal(sv.views().length, 1, "seeded from storage.load()");
    assert.equal(sv.views()[0].id, "x", "seeded view id");

    // save -> persist
    const v = sv.save("new");
    assert.ok(Array.isArray(saved) && saved.length === 2, "save persisted the collection");

    // apply -> NO persist
    saved = "SENTINEL";
    sv.apply("x");
    assert.equal(saved, "SENTINEL", "apply did not persist (active id is session state)");

    // update -> persist
    sv.update("x");
    assert.notEqual(saved, "SENTINEL", "update persisted");

    // rename -> persist
    saved = "SENTINEL2";
    sv.rename(v.id, "renamed");
    assert.notEqual(saved, "SENTINEL2", "rename persisted");
    assert.equal(sv.getView(v.id).name, "renamed");

    // remove -> persist
    saved = "SENTINEL3";
    sv.remove(v.id);
    assert.notEqual(saved, "SENTINEL3", "remove persisted");

    // clearActive -> NO persist
    saved = "SENTINEL4";
    sv.clearActive();
    assert.equal(saved, "SENTINEL4", "clearActive did not persist");

    sv.destroy();
});

test("A4b persistence: a null load() falls back to the views option", () => {
    const store = { load: () => null, save: () => {} };
    const stub = plainStub({ q: 1 });
    const sv = createSavedViews({
        getState: stub.getState, setState: stub.setState, storage: store,
        views: [{ id: "seed", name: "Seed", state: { q: 0 } }],
    });
    assert.equal(sv.views().length, 1);
    assert.equal(sv.views()[0].id, "seed", "null load -> views option seeds (null is not empty)");
    sv.destroy();
});

// =====================================================================
// A5 -- reactive-when-wrapped: isDirty() inside an effect re-runs on drift
// =====================================================================

test("A5 reactive dirty: reading isDirty() inside an effect re-runs on state change", () => {
    const stub = signalStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    sv.save("v");
    let runs = 0;
    let last = null;
    const stop = effect(() => { runs++; last = sv.isDirty(); });
    const r0 = runs;
    assert.equal(last, false, "initial effect read: not dirty");
    stub.set({ q: "b" });      // underlying signal changes -> getState() dep fires
    assert.ok(runs > r0, "effect re-ran when the underlying state changed");
    assert.equal(last, true, "effect observed dirty=true");
    stop();
    sv.destroy();
    stub.release();
});

// =====================================================================
// A6 -- H-12: 2000 create/destroy cycles leave the signal pool at baseline
// =====================================================================

test("A6 H-12: 2000 create/destroy cycles return every owned signal to the pool", () => {
    const baseline = activeNodes();
    for (let i = 0; i < 2000; i++) {
        const stub = plainStub({ n: i });
        const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
        sv.save("v" + i);
        sv.apply(sv.views()[0].id);
        sv.destroy();
    }
    assert.equal(activeNodes(), baseline, "activeNodes back to baseline -- destroy() sealed both signals");
});

// =====================================================================
// generateId isolation: two instances sharing one storage never collide
// =====================================================================

test("generateId: per-instance prefix keeps ids distinct across instances", () => {
    const store = { load: () => null, save: () => {} };
    const a = createSavedViews({ getState: () => ({}), setState: () => {}, storage: store });
    const b = createSavedViews({ getState: () => ({}), setState: () => {}, storage: store });
    const va = a.save("a");
    const vb = b.save("b");
    assert.notEqual(va.id, vb.id, "ids from two instances differ");
    a.destroy();
    b.destroy();
});

// =====================================================================
// Attach: root paints count + active; item click applies
// =====================================================================

test("attachRoot paints data-sv-count and data-sv-active; attachItem click applies", () => {
    setupDOM();
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    const root = document.createElement("div");
    document.body.appendChild(root);
    const offRoot = sv.attachRoot(root);
    assert.equal(root.getAttribute("role"), "group");
    assert.equal(root.getAttribute("data-sv-count"), "0");

    const v1 = sv.save("one");
    assert.equal(root.getAttribute("data-sv-count"), "1");
    assert.equal(root.getAttribute("data-sv-active"), v1.id);

    const v2 = sv.save("two");
    assert.equal(root.getAttribute("data-sv-count"), "2");

    // an item wired to v1: clicking it applies v1
    const item = document.createElement("div");
    document.body.appendChild(item);
    const offItem = sv.attachItem(item, v1.id);
    assert.equal(item.getAttribute("role"), "option");
    assert.equal(item.getAttribute("data-sv-id"), v1.id);
    assert.equal(item.hasAttribute("data-sv-active"), false, "v2 is active, not v1");

    dispatchClick(item);
    assert.equal(sv.activeId(), v1.id, "click applied v1");
    assert.equal(item.hasAttribute("data-sv-active"), true);
    void v2;

    offItem();
    assert.equal(item.hasAttribute("data-sv-id"), false, "off removes item attrs");
    offRoot();
    assert.equal(root.hasAttribute("data-sv-count"), false, "off removes root attrs");
    sv.destroy();
    teardownDOM();
});

// =====================================================================
// Reads freeze after destroy (H-12 seal contract)
// =====================================================================

test("destroy: reads freeze at the final value, mutations no-op", () => {
    const stub = plainStub({ q: "a" });
    const sv = createSavedViews({ getState: stub.getState, setState: stub.setState });
    sv.save("v");
    const countBefore = sv.views().length;
    sv.destroy();
    assert.equal(sv.destroyed, true);
    assert.equal(sv.views().length, countBefore, "views() reads frozen final value");
    assert.equal(sv.save("after"), undefined, "save after destroy is a no-op");
    assert.equal(sv.views().length, countBefore, "collection unchanged after destroy");
});
