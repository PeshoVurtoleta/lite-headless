// signal-pool.test.js
//
// H-12: signal-node pool return on destroy.
//
// Every factory creates lite-signal nodes (signal/computed) at construction
// (and some per item at runtime). lite-signal pools nodes in a fixed-capacity
// registry (default 1024, fail-fast CapacityError). destroy() must return
// every node the factory allocated, or churned create/destroy cycles exhaust
// the pool ledger: this is NOT an object-retention leak (FinalizationRegistry
// collects the handles; lite-leak reports clean) -- it is pool-slot
// accumulation, invisible to a GC profiler and fatal to long sessions.
//
// The whole file runs against a SMALL fixed registry (256 nodes, "throw"
// policy) swapped in as the default before any factory constructs. Each churn
// asserts two things:
//
//   1. capacity survival -- more create/destroy cycles than the registry has
//      nodes complete without CapacityError;
//   2. exact pool return -- activeNodes is back to the pre-cycle baseline
//      after every destroy() (one un-returned node fails cycle 1, loudly).
//
// node:test runs each file in its own process, so the registry swap cannot
// leak into other suites.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks } from "./_setup.js";
import { createRegistry, setDefaultRegistry, signal as makeSignal } from "@zakkster/lite-signal";
import * as barrel from "../src/index.js";

// Small fixed pool, fail-fast. Swapped in before any factory constructs.
const REG = createRegistry({ maxNodes: 256 });
setDefaultRegistry(REG);

const CYCLES = 300; // > maxNodes: a single leaked node per cycle cannot survive this

function active() { return REG.stats().activeNodes; }

// Options for factories whose bare construction needs them. Everything else
// constructs with defaults.
const FACTORY_OPTIONS = {
    createPicture: { src: "x.png" },
    createSlider: { min: 0, max: 100, step: 1, defaultValue: [50] },
    createTabs: { defaultValue: "a" },
};

// =====================================================================
// Harness self-check: the gate can fail. A fixed "throw" registry really
// does exhaust when nodes are created and never disposed.
// =====================================================================

test("H-12 control: an undisposed churn exhausts a fixed registry", () => {
    const tiny = createRegistry({ maxNodes: 64 });
    assert.throws(() => {
        for (let i = 0; i < 65; i++) tiny.signal(i);
    }, /capacity/i);
});

// =====================================================================
// Construction-only churn: every barrel factory
// =====================================================================

test("H-12: create/destroy x" + CYCLES + " on a 256-node fixed registry (every factory)", () => {
    setupDOM();
    const names = Object.keys(barrel)
        .filter((k) => k.startsWith("create") && typeof barrel[k] === "function")
        .sort();
    assert.ok(names.length >= 50, "barrel exports factories (got " + names.length + ")");

    for (const name of names) {
        const make = barrel[name];
        const opts = FACTORY_OPTIONS[name];
        const baseline = active();
        for (let i = 0; i < CYCLES; i++) {
            let prim;
            try {
                prim = opts ? make(opts) : make();
            } catch (err) {
                assert.fail(name + " cycle " + i + " threw during construction: " + err.message);
            }
            if (prim && typeof prim.destroy === "function") prim.destroy();
            assert.equal(
                active(), baseline,
                name + " cycle " + i + ": activeNodes " + active() + " != baseline " + baseline +
                " -- destroy() did not return every signal node to the pool",
            );
        }
    }
    teardownDOM();
});

// =====================================================================
// Attach + exercise churn: the torture-harness recipes, on the small
// fixed registry (open/close transitions, listbox items, thumbs, tabs)
// =====================================================================

test("H-12: attach/open/close churn returns the pool (overlay + interactive)", async () => {
    setupDOM();
    const el = (tag) => document.createElement(tag || "div");
    const recipes = [
        [barrel.createDialog, undefined, (x) => { x.attachTrigger(el("button")); x.attachContent(el("div")); x.setOpen(true); x.setOpen(false); }],
        [barrel.createPopover, undefined, (x) => { x.attachTrigger(el("button")); x.attachAnchor(el("div")); x.attachContent(el("div")); x.setOpen(true); x.setOpen(false); }],
        [barrel.createMenu, undefined, (x) => { x.attachTrigger(el("button")); x.attachMenu(el("div")); x.attachItem(el("div")); x.setOpen(true); x.setOpen(false); }],
        [barrel.createCombobox, undefined, (x) => { x.attachTrigger(el("input")); x.attachListbox(el("div")); x.attachItem(el("div"), { value: "a" }); x.setOpen(true); x.setOpen(false); }],
        [barrel.createDrawer, undefined, (x) => { x.attachContent(el("div")); x.attachTrigger(el("button")); x.setOpen(true); x.setOpen(false); }],
        [barrel.createSlider, { min: 0, max: 100, step: 1, defaultValue: [50] }, (x) => { x.attachTrack(el("div")); x.attachThumb(el("div"), 0); x.setValue([60]); }],
        [barrel.createTabs, { defaultValue: "a" }, (x) => { x.attachTablist(el("div")); x.attachTab(el("button"), { value: "a" }); x.attachPanel(el("div"), { value: "a" }); x.setValue("a"); }],
        [barrel.createTree, undefined, (x) => { x.attachRoot(el("ul")); x.attachNode(el("li"), { key: "a" }); x.attachLabel(el("span")); }],
    ];
    for (const [make, opts, exercise] of recipes) {
        const baseline = active();
        for (let i = 0; i < 64; i++) {
            const prim = opts ? make(opts) : make();
            exercise(prim);
            prim.destroy();
            assert.equal(
                active(), baseline,
                make.name + " attach cycle " + i + ": activeNodes " + active() + " != baseline " + baseline,
            );
        }
        await flushMicrotasks(); // drain superseded status finalizers between recipes
    }
    teardownDOM();
});

// =====================================================================
// Dynamic per-item nodes: created after construction, dropped before or
// at destroy. Removal paths and destroy must both return them.
// =====================================================================

test("H-12: kanban per-column order signals are returned (removeColumn + destroy)", () => {
    setupDOM();
    const baseline = active();
    for (let i = 0; i < 64; i++) {
        const kb = barrel.createKanban();
        kb.addColumn({ id: "a", title: "A" });
        kb.addColumn({ id: "b", title: "B" });
        kb.addCard({ id: "c1", columnId: "a" });
        kb.moveCard("c1", "b", 0);
        kb.removeColumn("a");      // mid-life drop of a per-column order signal
        kb.destroy();              // remaining per-column signals returned here
        assert.equal(active(), baseline, "kanban cycle " + i + ": activeNodes " + active());
    }
    teardownDOM();
});

test("H-12: file-upload per-entry nodes are returned (removeEntry + clear + destroy)", () => {
    setupDOM();
    const mkFile = (name) => new window.File(["abc"], name, { type: "text/plain" });
    const baseline = active();
    for (let i = 0; i < 64; i++) {
        const fu = barrel.createFileUpload({ autoUpload: false });
        fu.addFiles([mkFile("a.txt"), mkFile("b.txt"), mkFile("c.txt")]);
        const entries = fu.entries();
        fu.removeEntry(entries[0].id);  // mid-life drop of bytesLoaded + progress
        fu.clear();                     // drops the rest
        fu.addFiles([mkFile("d.txt")]);
        fu.destroy();                   // remaining entry nodes returned here
        assert.equal(active(), baseline, "file-upload cycle " + i + ": activeNodes " + active());
    }
    teardownDOM();
});

test("H-12: radio-group per-item disabled signals are returned (detach + destroy)", () => {
    setupDOM();
    const baseline = active();
    for (let i = 0; i < 64; i++) {
        const rg = barrel.createRadioGroup();
        rg.attachRoot(document.createElement("div"));
        const offA = rg.attachItem(document.createElement("button"), "a");
        rg.attachItem(document.createElement("button"), "b");
        rg.attachItem(document.createElement("button"), "c", { disabled: true });
        offA();                    // mid-life detach drops one per-item signal
        rg.destroy();              // the rest are returned here
        assert.equal(active(), baseline, "radio-group cycle " + i + ": activeNodes " + active());
    }
    teardownDOM();
});

// =====================================================================
// Controlled mode: consumer-owned signals are NEVER disposed by destroy()
// =====================================================================

test("H-12: destroy() leaves consumer-supplied controlled signals alive", () => {
    setupDOM();
    const baseline = active();

    const open = makeSignal(false);
    const dlg = barrel.createDialog({ open });
    dlg.destroy();
    assert.equal(open.peek(), false, "controlled open signal still readable after destroy");
    open.set(true);
    assert.equal(open.peek(), true, "controlled open signal still writable after destroy");

    const value = makeSignal("a");
    const tabs = barrel.createTabs({ value });
    tabs.destroy();
    assert.equal(value.peek(), "a", "controlled tabs value survives destroy");

    // exactly the two consumer signals remain -- everything factory-owned went back
    assert.equal(active(), baseline + 2, "only the consumer's signals remain live");
    REG.dispose(open);
    REG.dispose(value);
    assert.equal(active(), baseline);
    teardownDOM();
});

// =====================================================================
// Seal semantics: pool return must NOT break the destroy contract --
// reads freeze at the final pre-destroy value, subscribe fires once
// =====================================================================

test("H-12: destroyed handles keep answering their frozen final values", () => {
    setupDOM();
    const baseline = active();

    const r = barrel.createRating({ defaultValue: 2 });
    r.setValue(4);
    r.destroy();
    assert.equal(r.value(), 4, "rating value frozen at destroy");
    assert.equal(r.isReadOnly(), false, "readOnly frozen at destroy");
    r.setValue(1);
    assert.equal(r.value(), 4, "post-destroy write is a no-op");

    const dlg = barrel.createDialog({ defaultOpen: true });
    dlg.destroy();
    assert.equal(dlg.open(), true, "open frozen at destroy while open");
    assert.equal(dlg.open.peek(), true, "peek answers the frozen value too");
    let seen = null, calls = 0;
    const unsub = dlg.open.subscribe((v) => { seen = v; calls++; });
    assert.equal(calls, 1, "sealed subscribe fires exactly once");
    assert.equal(seen, true, "sealed subscribe hands the frozen value");
    assert.equal(typeof unsub, "function");
    unsub(); // no-op, no throw

    // datepicker exposes its view/focus accessors ON the handle; they must
    // resolve the sealed binding, not a raw signal captured at construction
    const dp = barrel.createDatePicker();
    dp.goToNextMonth();
    const finalMonth = dp.viewMonth();
    dp.destroy();
    assert.ok(dp.viewMonth() instanceof Date, "handle.viewMonth() frozen, not undefined");
    assert.equal(dp.viewMonth().getTime(), finalMonth.getTime(), "frozen at the final view month");
    assert.equal(dp.view(), "days", "handle.view() frozen at final view");

    assert.equal(active(), baseline, "sealing returned every pooled node");
    teardownDOM();
});

// =====================================================================
// Double destroy: disposal is idempotent, the pool is not double-freed
// =====================================================================

test("H-12: double destroy() neither throws nor corrupts the pool", () => {
    setupDOM();
    const baseline = active();
    const r = barrel.createRating();
    r.destroy();
    r.destroy();
    assert.equal(active(), baseline);
    // pool still coherent: a fresh factory constructs and returns cleanly
    const r2 = barrel.createRating({ defaultValue: 3 });
    assert.equal(r2.value(), 3);
    r2.destroy();
    assert.equal(active(), baseline);
    teardownDOM();
});
