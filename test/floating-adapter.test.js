// floating-adapter.test.js -- qa boundary matrix for H5 (pluggable positioner +
// @zakkster/lite-headless/floating-adapter).
//
// Covers, in order:
//   1. checkPositioner construction matrix, all four positioner-capable
//      factories (createTooltip / createPopover / createCombobox / createMenu).
//   2. checkPositionerHandle first-open matrix (missing update/autoUpdate/
//      destroy, one case each; a conforming minimal handle; the verify-guard-
//      runs-once contract, proven across three opens: N-1, N, N+1).
//   3. Custom-positioner threading: spec shape, update()-on-open,
//      destroy()-on-close/destroy, and proof the DEFAULT path never touches
//      a positioner spy.
//   4. Menu's two anchor call sites (initial open + context-menu re-anchor)
//      share the same `_positioner` slot and the same once-only verify guard.
//   5. src/floating-adapter.js exercised for real under happy-dom (the
//      hover-card pattern): handle shape, element-boundary fail-closed throw
//      (re-fires on a second open), string-boundary accepted, destroy() stops
//      further paint.
//   6. Sealed-read sanity: suite contract (accessors keep answering after
//      destroy()) holds on the new custom-positioner path too.
//
// The generic 0/1/N-1/N/N+1/empty/null/undefined/NaN/-0/duplicate-dispose/
// dispose-during-iteration/re-entrant-write/adversarial boundary matrix is
// folded into the sections above rather than padded as a separate block;
// each cell is call out by name in a comment at its point of use. Two cells
// have no real analogue on these entry points (both are synchronous,
// stateless validators with no dispose object of their own) and are noted
// explicitly rather than faked:
//   - "duplicate dispose" of checkPositioner/checkPositionerHandle themselves:
//     N/A (no dispose object) -- the closest REAL analogue, double-disposing
//     the positioner HANDLE a custom positioner returns, is covered in
//     section 2 (verify-once) and section 3 (destroy-on-close/destroy).
//   - "dispose-during-iteration": N/A for the two validators (no iteration) --
//     the closest real analogue, destroying an in-flight positioner handle
//     while a new one is being created (menu's rapid re-right-click path),
//     is covered in section 4.

import { test } from "node:test";
import assert from "node:assert/strict";

import { setupDOM, teardownDOM } from "./_setup.js";
import { checkPositioner, checkPositionerHandle } from "../src/_validate.js";
import { createTooltip } from "../src/tooltip/index.js";
import { createPopover } from "../src/popover/index.js";
import { createCombobox } from "../src/combobox/index.js";
import { createMenu } from "../src/menu/index.js";
import { createFloatingPositioner } from "../src/floating-adapter.js";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

// A spy positioner factory. Records every spec it receives and every handle
// it hands back (with per-handle call counters), and never touches real DOM
// geometry -- pure bookkeeping, so it is safe to use across all four
// factories without an actual layout engine.
function createSpyPositioner() {
    const specs = [];
    const handles = [];
    function factory(spec) {
        specs.push(spec);
        const h = {
            updateCount: 0,
            autoUpdateCount: 0,
            destroyCount: 0,
            update() { h.updateCount++; },
            autoUpdate() { h.autoUpdateCount++; return function stop() {}; },
            destroy() { h.destroyCount++; },
        };
        handles.push(h);
        return h;
    }
    factory.specs = specs;
    factory.handles = handles;
    return factory;
}

function mkTooltipDOM() {
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(trigger, content);
    return { trigger, content };
}

function mkPopoverDOM() {
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(trigger, content);
    return { trigger, content };
}

function mkComboboxDOM() {
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    return { trigger, listbox };
}

function mkMenuDOM() {
    const trigger = document.createElement("button");
    const menuEl = document.createElement("ul");
    const target = document.createElement("div");
    document.body.append(trigger, menuEl, target);
    return { trigger, menuEl, target };
}

function fireContextMenu(target, x, y) {
    const e = new globalThis.Event("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clientX", { value: x });
    Object.defineProperty(e, "clientY", { value: y });
    target.dispatchEvent(e);
    return e;
}

// ===========================================================================
// 1. checkPositioner construction matrix -- all four factories
// ===========================================================================
//
// Boundary matrix cells covered directly: undefined (legal), null, {} (empty
// object), a non-empty string ("fn"), 0, NaN, -0, [] (array). One byte-exact
// full-message anchor per factory (createPopover) plus a cross-factory sweep
// that only checks the diction prefix + trailing "got <desc>", matching the
// house style in options-boundary.test.js (one exact anchor, many spot
// checks).

const FACTORY_TABLE = [
    ["createTooltip", (opts) => createTooltip(opts)],
    ["createPopover", (opts) => createPopover(opts)],
    ["createCombobox", (opts) => createCombobox(opts)],
    ["createMenu", (opts) => createMenu(opts)],
];

test("checkPositioner: undefined is legal on all four factories (no positioner key at all -- default engine)", () => {
    setupDOM();
    try {
        for (const [, make] of FACTORY_TABLE) {
            assert.doesNotThrow(() => make({}));
            assert.doesNotThrow(() => make({ positioner: undefined }));
        }
    } finally {
        teardownDOM();
    }
});

test("checkPositioner: null / {} / \"fn\" / 0 / NaN / -0 / [] all throw TypeError naming the factory, on all four factories", () => {
    setupDOM();
    try {
        const badValues = [
            ["null", null, "null"],
            ["object", {}, "object"],
            ["string", "fn", "string"],
            ["number 0", 0, "number"],
            ["NaN", NaN, "number"],
            ["-0", -0, "number"],
            ["array", [], "array"],
        ];
        for (const [fnName, make] of FACTORY_TABLE) {
            for (const [label, value, desc] of badValues) {
                assert.throws(
                    () => make({ positioner: value }),
                    (err) => {
                        assert.equal(err.name, "TypeError", `${fnName}/${label}: wrong error type`);
                        assert.equal(
                            err.message,
                            `${fnName}: positioner must be a function, got ${desc}`,
                            `${fnName}/${label}: message mismatch`,
                        );
                        return true;
                    },
                    `${fnName}/${label} should throw`,
                );
            }
        }
    } finally {
        teardownDOM();
    }
});

test("checkPositioner: byte-anchor -- exact createPopover message, diction matches checkOptions style", () => {
    setupDOM();
    try {
        assert.throws(
            () => createPopover({ positioner: {} }),
            (err) => {
                assert.equal(err.message, "createPopover: positioner must be a function, got object");
                return true;
            },
        );
    } finally {
        teardownDOM();
    }
});

test('did-you-mean: {positionr: ...} suggests "positioner" on all four factories', () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        for (const [fnName, make] of FACTORY_TABLE) {
            assert.throws(
                () => make({ positionr: spy }),
                (err) => {
                    assert.equal(
                        err.message,
                        `${fnName}: unknown option "positionr". Did you mean "positioner"?`,
                    );
                    return true;
                },
                `${fnName} should suggest "positioner"`,
            );
        }
    } finally {
        teardownDOM();
    }
});

// direct unit coverage of checkPositioner (no factory indirection): the
// isolated "0" and "1" boundary-matrix cells, plus a genuinely deceptive
// adversarial case a naive reviewer would not think to try -- a generator
// FUNCTION. typeof a generator function is "function", so checkPositioner
// (a pure type gate) correctly lets it through; the malformed HANDLE it
// produces is caught one layer down by checkPositionerHandle (section 2).
// This is defense-in-depth, not a redundant check.
test("checkPositioner: adversarial -- a generator function passes (typeof is \"function\"); its handle is rejected downstream", () => {
    assert.doesNotThrow(() => checkPositioner("probe", function* gen() {}));
    function* gen(spec) { yield spec; }
    const iter = gen({ anchor: null });
    assert.throws(
        () => checkPositionerHandle("probe", iter),
        /probe: positioner handle is missing "update"/,
    );
});

test("checkPositioner: 1 -- a bound function is still a function, legal", () => {
    function real() {}
    const bound = real.bind(null);
    assert.doesNotThrow(() => checkPositioner("probe", bound));
});

// re-entrant-write analogue (checkPositioner has no module-scope mutable
// state to corrupt): interleaved calls across two different factory names
// must not cross-contaminate each other's thrown message.
test("checkPositioner: re-entrant analogue -- interleaved calls across factory names do not share state", () => {
    let a, b;
    try { checkPositioner("createTooltip", null); } catch (e) { a = e.message; }
    try { checkPositioner("createPopover", {}); } catch (e) { b = e.message; }
    assert.equal(a, "createTooltip: positioner must be a function, got null");
    assert.equal(b, "createPopover: positioner must be a function, got object");
    // run createTooltip's case again after the interleaving -- no residue
    let a2;
    try { checkPositioner("createTooltip", null); } catch (e) { a2 = e.message; }
    assert.equal(a2, a);
});

// ===========================================================================
// 2. checkPositionerHandle first-open matrix
// ===========================================================================

test("checkPositionerHandle: undefined / null / 0 / \"\" / NaN / -0 all throw \"must return a handle object\"", () => {
    const cases = [
        [undefined, "undefined"],
        [null, "null"],
        [0, "number"],
        ["", "string"],
        [NaN, "number"],
        [-0, "number"],
    ];
    for (const [value, desc] of cases) {
        assert.throws(
            () => checkPositionerHandle("probe", value),
            (err) => {
                assert.equal(err.message, `probe: positioner must return a handle object, got ${desc}`);
                return true;
            },
        );
    }
});

// [] is typeof "object" (unlike the primitives above), so it does NOT hit the
// "must return a handle object" branch at all -- it falls through to the
// per-method checks, same as any other object missing "update". Distinct
// code path from the primitives above; called out explicitly so a reader
// does not assume arrays are rejected the same way objects-with-null-proto
// or primitives are.
test("checkPositionerHandle: [] (array) is typeof \"object\" -- falls through to the per-method check, not the object-shape check", () => {
    assert.throws(
        () => checkPositionerHandle("probe", []),
        /probe: positioner handle is missing "update"/,
    );
});

test("checkPositionerHandle: handle missing update / autoUpdate / destroy -- one case each, exact message, at FIRST open (createTooltip)", () => {
    setupDOM();
    try {
        const missingUpdate = () => ({ autoUpdate() { return () => {}; }, destroy() {} });
        const missingAutoUpdate = () => ({ update() {}, destroy() {} });
        const missingDestroy = () => ({ update() {}, autoUpdate() { return () => {}; } });

        const tt1 = createTooltip({ positioner: missingUpdate, container: null });
        const { trigger: t1, content: c1 } = mkTooltipDOM();
        tt1.attachTrigger(t1);
        tt1.attachContent(c1);
        assert.throws(
            () => tt1.setOpen(true),
            /createTooltip: positioner handle is missing "update"/,
        );

        const tt2 = createTooltip({ positioner: missingAutoUpdate, container: null });
        const { trigger: t2, content: c2 } = mkTooltipDOM();
        tt2.attachTrigger(t2);
        tt2.attachContent(c2);
        assert.throws(
            () => tt2.setOpen(true),
            /createTooltip: positioner handle is missing "autoUpdate"/,
        );

        const tt3 = createTooltip({ positioner: missingDestroy, container: null });
        const { trigger: t3, content: c3 } = mkTooltipDOM();
        tt3.attachTrigger(t3);
        tt3.attachContent(c3);
        assert.throws(
            () => tt3.setOpen(true),
            /createTooltip: positioner handle is missing "destroy"/,
        );
    } finally {
        teardownDOM();
    }
});

test("checkPositionerHandle: a conforming minimal handle opens clean (no throw), 0/1 boundary -- offset:0 threads through untouched", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const tt = createTooltip({ positioner: spy, container: null, offset: 0 });
        const { trigger, content } = mkTooltipDOM();
        tt.attachTrigger(trigger);
        tt.attachContent(content);
        assert.doesNotThrow(() => tt.setOpen(true));
        assert.equal(tt.open(), true);
        assert.equal(spy.specs[0].offset, 0);
        assert.doesNotThrow(() => tt.setOpen(false));
        tt.destroy();
    } finally {
        teardownDOM();
    }
});

// Verify-guard-runs-ONCE, proven across three opens (N-1, N, N+1 of the
// "first open" boundary). The SAME handle object (module-level, not
// recreated per factory call) exposes update/autoUpdate/destroy as
// accessor properties that count every property GET. checkPositionerHandle
// itself performs one GET per property (typeof handle.xxx) BEFORE doOpen
// invokes .update()/.autoUpdate() (also a GET, via the call). So:
//   open #1 (verify RUNS):     update +2 (check-get + call-get), autoUpdate +2, destroy +1 (check-get only)
//   close #1:                                                                    destroy +1 (call-get)
//   open #2 (verify SKIPPED):  update +1 (call-get only),        autoUpdate +1,  destroy +0
//   close #2:                                                                    destroy +1
//   open #3 (verify SKIPPED):  update +1,                        autoUpdate +1,  destroy +0
// A regression that re-runs the check on open #2 or #3 adds one extra GET to
// each of update/autoUpdate/destroy for that open -- this test would catch it
// deterministically (no flakiness, no need to spy on _validate.js itself).
test("checkPositionerHandle: verify guard runs exactly ONCE across opens 1 (N-1), 2 (N), 3 (N+1)", () => {
    setupDOM();
    try {
        let updateGets = 0, autoUpdateGets = 0, destroyGets = 0;
        const handle = {
            get update() { updateGets++; return function () {}; },
            get autoUpdate() { autoUpdateGets++; return function () { return function stop() {}; }; },
            get destroy() { destroyGets++; return function () {}; },
        };
        const factory = () => handle;

        const tt = createTooltip({ positioner: factory, container: null });
        const { trigger, content } = mkTooltipDOM();
        tt.attachTrigger(trigger);
        tt.attachContent(content);

        tt.setOpen(true); // open #1 (N-1): verify runs
        assert.equal(updateGets, 2, "open#1: update should be read by both the check and the call");
        assert.equal(autoUpdateGets, 2, "open#1: autoUpdate should be read by both the check and the call");
        assert.equal(destroyGets, 1, "open#1: destroy should be read by the check only (not yet called)");

        tt.setOpen(false); // close #1
        assert.equal(destroyGets, 2, "close#1: destroy call is one more GET");

        tt.setOpen(true); // open #2 (N): verify must be SKIPPED
        assert.equal(updateGets, 3, "open#2: verify skipped -- only the call-site GET");
        assert.equal(autoUpdateGets, 3, "open#2: verify skipped -- only the call-site GET");
        assert.equal(destroyGets, 2, "open#2: destroy not touched at open time");

        tt.setOpen(false); // close #2
        assert.equal(destroyGets, 3);

        tt.setOpen(true); // open #3 (N+1): verify STILL skipped
        assert.equal(updateGets, 4, "open#3: verify still skipped");
        assert.equal(autoUpdateGets, 4, "open#3: verify still skipped");
        assert.equal(destroyGets, 3, "open#3: destroy not touched at open time");

        tt.setOpen(false);
        tt.destroy();
    } finally {
        teardownDOM();
    }
});

// re-entrant write: the positioner's own update() synchronously drives
// ANOTHER write to the same overlay's open state while the first open is
// still being constructed. Proves the adapter/factory wiring survives
// reentrancy instead of corrupting `_positioner`.
test("checkPositionerHandle / positioner threading: re-entrant write -- positioner.update() synchronously closes the overlay it is opening", () => {
    setupDOM();
    try {
        let reentered = false;
        const factory = () => ({
            update() {
                if (!reentered) {
                    reentered = true;
                    tt.setOpen(false); // re-entrant write into the SAME instance
                }
            },
            autoUpdate() { return () => {}; },
            destroy() {},
        });
        const tt = createTooltip({ positioner: factory, container: null });
        const { trigger, content } = mkTooltipDOM();
        tt.attachTrigger(trigger);
        tt.attachContent(content);

        assert.doesNotThrow(() => tt.setOpen(true));
        // the re-entrant setOpen(false) is the last write to win: closed.
        assert.equal(tt.open(), false);
        tt.destroy();
    } finally {
        teardownDOM();
    }
});

// adversarial: a handle that is shape-conformant (passes checkPositionerHandle)
// but whose autoUpdate() THROWS at call time -- outside checkPositionerHandle's
// scope (it only checks shape, never invokes anything). Observes what actually
// happens; not asserted as a "must not throw" contract since the planner never
// promised runtime-safety of a hostile custom engine, only construction-time
// shape validation.
test("adversarial: autoUpdate() throwing at call time is NOT caught by checkPositionerHandle (shape-only contract) -- propagates", () => {
    setupDOM();
    try {
        const factory = () => ({
            update() {},
            autoUpdate() { throw new Error("boom"); },
            destroy() {},
        });
        const tt = createTooltip({ positioner: factory, container: null });
        const { trigger, content } = mkTooltipDOM();
        tt.attachTrigger(trigger);
        tt.attachContent(content);
        assert.throws(() => tt.setOpen(true), /boom/);
        tt.destroy();
    } finally {
        teardownDOM();
    }
});

// ===========================================================================
// 3. Custom-positioner threading: spec shape, update/destroy lifecycle,
//    default path never touches the spy.
// ===========================================================================

test("spec threading (createTooltip): anchor/content/arrow/placement/offset/flip/shift/boundary all carried", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const tt = createTooltip({
            positioner: spy, container: null,
            placement: "right-start", offset: 12, flip: false, shift: false, boundary: "viewport",
        });
        const { trigger, content } = mkTooltipDOM();
        const arrow = document.createElement("div");
        document.body.append(arrow);
        tt.attachArrow(arrow);
        tt.attachTrigger(trigger);
        tt.attachContent(content);
        tt.setOpen(true);

        assert.equal(spy.specs.length, 1);
        const spec = spy.specs[0];
        assert.equal(spec.anchor, trigger);
        assert.equal(spec.content, content);
        assert.equal(spec.arrow, arrow);
        assert.equal(spec.placement, "right-start");
        assert.equal(spec.offset, 12);
        assert.equal(spec.flip, false);
        assert.equal(spec.shift, false);
        assert.equal(spec.boundary, "viewport");

        tt.destroy();
    } finally {
        teardownDOM();
    }
});

test("spec threading (createCombobox): spec has no \"arrow\" key at all (combobox never attaches one)", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const combo = createCombobox({ positioner: spy, container: null });
        const { trigger, listbox } = mkComboboxDOM();
        combo.attachTrigger(trigger);
        combo.attachListbox(listbox);
        combo.setOpen(true);

        assert.equal(spy.specs.length, 1);
        assert.equal("arrow" in spy.specs[0], false);
        assert.equal(spy.specs[0].anchor, trigger);
        assert.equal(spy.specs[0].content, listbox);

        combo.destroy();
    } finally {
        teardownDOM();
    }
});

test("update() called on open; destroy() called on close (createPopover)", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const pop = createPopover({ positioner: spy, container: null, modal: false });
        const { trigger, content } = mkPopoverDOM();
        pop.attachTrigger(trigger);
        pop.attachContent(content);

        pop.setOpen(true);
        const h = spy.handles[0];
        assert.equal(h.updateCount, 1);
        assert.equal(h.autoUpdateCount, 1);
        assert.equal(h.destroyCount, 0);

        pop.setOpen(false);
        assert.equal(h.destroyCount, 1, "destroy() must be called on close");

        pop.destroy();
        assert.equal(spy.handles.length, 1, "destroy() while already closed must not create a second handle");
    } finally {
        teardownDOM();
    }
});

test("update() called on open; destroy() called on destroy() while still open (createPopover)", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const pop = createPopover({ positioner: spy, container: null, modal: false });
        const { trigger, content } = mkPopoverDOM();
        pop.attachTrigger(trigger);
        pop.attachContent(content);

        pop.setOpen(true);
        const h = spy.handles[0];
        assert.equal(h.updateCount, 1);
        assert.equal(h.destroyCount, 0);

        pop.destroy(); // destroy while open -- must still tear down the positioner
        assert.equal(h.destroyCount, 1);

        // duplicate dispose: destroy() again must not re-invoke the (already
        // destroyed) positioner handle's destroy() a second time.
        pop.destroy();
        assert.equal(h.destroyCount, 1, "duplicate destroy() must be idempotent -- no double positioner.destroy()");
    } finally {
        teardownDOM();
    }
});

test("DEFAULT path (no positioner option) never invokes the spy, across all four factories", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();

        const tt = createTooltip({ container: null });
        const { trigger: t1, content: c1 } = mkTooltipDOM();
        tt.attachTrigger(t1); tt.attachContent(c1); tt.setOpen(true); tt.setOpen(false); tt.destroy();

        const pop = createPopover({ container: null, modal: false });
        const { trigger: t2, content: c2 } = mkPopoverDOM();
        pop.attachTrigger(t2); pop.attachContent(c2); pop.setOpen(true); pop.setOpen(false); pop.destroy();

        const combo = createCombobox({ container: null });
        const { trigger: t3, listbox } = mkComboboxDOM();
        combo.attachTrigger(t3); combo.attachListbox(listbox); combo.setOpen(true); combo.setOpen(false); combo.destroy();

        const { trigger: t4, menuEl } = mkMenuDOM();
        const menu = createMenu({ container: null });
        menu.attachTrigger(t4); menu.attachMenu(menuEl); menu.setOpen(true); menu.setOpen(false); menu.destroy();

        assert.equal(spy.specs.length, 0, "the spy positioner factory (unused here) must never be called");
    } finally {
        teardownDOM();
    }
});

// ===========================================================================
// 4. Menu's two anchor call sites (doOpen + attachContextTarget's re-anchor)
//    share ONE `_positioner` slot and ONE once-only verify guard, per the
//    contract read directly from src/menu/index.js: BOTH call sites read
//    the same `positioner`/`_positionerVerified` closure variables and both
//    assign into the same `_positioner` variable. The factory is invoked
//    once PER call site event (not once per menu instance) -- a rapid
//    re-right-click while already open destroys the current handle and
//    creates a fresh one via a SECOND factory call.
// ===========================================================================

test("menu: initial open (trigger) and context-menu re-anchor both route through the spy, sharing one verify guard", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const { trigger, menuEl, target } = mkMenuDOM();
        const menu = createMenu({ container: null, positioner: spy });
        menu.attachTrigger(trigger);
        menu.attachMenu(menuEl);
        menu.attachContextTarget(target);

        // call site 1: initial open via the trigger.
        menu.setOpen(true, "trigger");
        assert.equal(spy.specs.length, 1, "call site 1 (doOpen) invokes the factory once");
        const h1 = spy.handles[0];
        assert.equal(h1.updateCount, 1);
        assert.equal(h1.destroyCount, 0);

        // call site 2: right-click re-anchor WHILE ALREADY OPEN. Per the
        // read contract this destroys the current handle and creates a new
        // one, still through the SAME `_positioner` slot.
        fireContextMenu(target, 42, 84);
        assert.equal(spy.specs.length, 2, "call site 2 (context re-anchor) invokes the factory a second time");
        assert.equal(h1.destroyCount, 1, "the first handle must be destroyed when the second is created");
        const h2 = spy.handles[1];
        assert.equal(h2.updateCount, 1, "the second (now-active) handle is update()d");
        assert.equal(h2.destroyCount, 0);

        // the anchor threaded through call site 2 is the virtual (pointer)
        // anchor, not the original trigger.
        assert.notEqual(spy.specs[1].anchor, trigger);
        assert.equal(spy.specs[1].anchor.hasAttribute("data-menu-virtual-anchor"), true);

        // closing now must destroy the CURRENTLY active handle (h2), and
        // must not touch h1 again (already destroyed).
        menu.setOpen(false, "api");
        assert.equal(h2.destroyCount, 1);
        assert.equal(h1.destroyCount, 1, "h1 must not be double-destroyed by the close of h2's owner");

        menu.destroy();
    } finally {
        teardownDOM();
    }
});

test("menu: verify guard fires only on the very first positioner creation, regardless of which call site created it", () => {
    setupDOM();
    try {
        let updateGets = 0, autoUpdateGets = 0, destroyGets = 0;
        const handle = {
            get update() { updateGets++; return function () {}; },
            get autoUpdate() { autoUpdateGets++; return function () { return function stop() {}; }; },
            get destroy() { destroyGets++; return function () {}; },
        };
        const factory = () => handle;

        const { trigger, menuEl, target } = mkMenuDOM();
        const menu = createMenu({ container: null, positioner: factory });
        menu.attachTrigger(trigger);
        menu.attachMenu(menuEl);
        menu.attachContextTarget(target);

        // call site 2 FIRST (context menu on a not-yet-open menu -- this
        // takes the core.setOpen(true) branch inside attachContextTarget,
        // which itself routes into doOpen -- call site 1 code path, still
        // the FIRST ever creation for this instance).
        fireContextMenu(target, 1, 1);
        assert.equal(updateGets, 2, "first-ever open: verify runs (check-get + call-get)");
        assert.equal(autoUpdateGets, 2);
        assert.equal(destroyGets, 1, "check-get only; not yet destroyed");

        // call site 2 AGAIN, now while already open -- this is the SECOND
        // ever creation for this instance, verify must be skipped.
        fireContextMenu(target, 2, 2);
        assert.equal(updateGets, 3, "second creation: verify skipped");
        assert.equal(autoUpdateGets, 3);
        assert.equal(destroyGets, 2, "the FIRST handle's destroy was called (call-get) when re-anchoring");

        menu.setOpen(false, "api");
        menu.destroy();
    } finally {
        teardownDOM();
    }
});

// ===========================================================================
// 5. src/floating-adapter.js exercised for real under happy-dom
// ===========================================================================

function mkFloatingDOM() {
    const anchor = document.createElement("button");
    const content = document.createElement("div");
    document.body.append(anchor, content);
    return { anchor, content };
}

test("createFloatingPositioner(): factory + handle shape -- update/autoUpdate/destroy all functions", () => {
    setupDOM();
    try {
        const factory = createFloatingPositioner();
        assert.equal(typeof factory, "function");
        const { anchor, content } = mkFloatingDOM();
        const handle = factory({ anchor, content, placement: "bottom" });
        assert.equal(typeof handle.update, "function");
        assert.equal(typeof handle.autoUpdate, "function");
        assert.equal(typeof handle.destroy, "function");
        assert.doesNotThrow(() => handle.update());
        const stop = handle.autoUpdate();
        assert.equal(typeof stop, "function");
        assert.doesNotThrow(() => stop());
        handle.destroy();
    } finally {
        teardownDOM();
    }
});

test("createFloatingPositioner(): element boundary throws when the positioner runs at open, and re-fires on a SECOND open", () => {
    setupDOM();
    try {
        const factory = createFloatingPositioner();
        const { anchor, content } = mkFloatingDOM();
        const boundaryEl = document.createElement("div");
        document.body.append(boundaryEl);

        assert.throws(
            () => factory({ anchor, content, boundary: boundaryEl }),
            /createFloatingPositioner: element boundary is unsupported/,
        );
        // re-fires: a second, independent call (as a second open would make)
        // throws again -- not a one-shot guard that silently degrades.
        assert.throws(
            () => factory({ anchor, content, boundary: boundaryEl }),
            /createFloatingPositioner: element boundary is unsupported/,
        );
    } finally {
        teardownDOM();
    }
});

test("createFloatingPositioner(): string boundaries (\"viewport\" and \"clipping\") are accepted, no throw", () => {
    setupDOM();
    try {
        const factory = createFloatingPositioner();
        const { anchor, content } = mkFloatingDOM();
        let h1, h2;
        assert.doesNotThrow(() => { h1 = factory({ anchor, content, boundary: "viewport" }); });
        h1.destroy();
        assert.doesNotThrow(() => { h2 = factory({ anchor, content, boundary: "clipping" }); });
        h2.destroy();
    } finally {
        teardownDOM();
    }
});

test("createFloatingPositioner(): destroy() stops further paint -- placement attribute frozen after destroy even if update() is called again", () => {
    setupDOM();
    try {
        const factory = createFloatingPositioner();
        const { anchor, content } = mkFloatingDOM();
        const handle = factory({ anchor, content, placement: "top" });
        handle.update();
        const before = content.getAttribute("data-placement");
        assert.ok(before, "placement must have painted once while live");

        handle.destroy();
        content.removeAttribute("data-placement"); // simulate external tampering
        // calling update() on an already-destroyed handle must not repaint
        // (the paint effect was disposed by destroy()).
        assert.doesNotThrow(() => handle.update());
        assert.equal(content.getAttribute("data-placement"), null);
    } finally {
        teardownDOM();
    }
});

test("createFloatingPositioner() threaded end-to-end through createTooltip under happy-dom", () => {
    setupDOM();
    try {
        const tt = createTooltip({ positioner: createFloatingPositioner(), container: null });
        const { trigger, content } = mkTooltipDOM();
        tt.attachTrigger(trigger);
        tt.attachContent(content);
        tt.setOpen(true);
        assert.equal(tt.open(), true);
        assert.ok(content.getAttribute("data-placement"));
        tt.setOpen(false);
        tt.destroy();
    } finally {
        teardownDOM();
    }
});

// ===========================================================================
// 6. Sealed-read sanity: suite contract (reads-freeze-at-final-value on
//    destroy, H-12) holds on the custom-positioner path too.
// ===========================================================================

test("sealed-read sanity: after tooltip destroy() with a custom positioner, accessors still answer", () => {
    setupDOM();
    try {
        const spy = createSpyPositioner();
        const tt = createTooltip({ positioner: spy, container: null });
        const { trigger, content } = mkTooltipDOM();
        tt.attachTrigger(trigger);
        tt.attachContent(content);
        tt.setOpen(true);
        assert.equal(tt.open(), true);

        tt.destroy();

        // suite contract: a destroyed handle keeps answering its FINAL value
        // (frozen), it does not throw and does not silently return undefined.
        // destroy() tears down the positioner/timers but does NOT force a
        // setOpen(false) transition first, so the sealed `open` read freezes
        // at "true" -- the value in effect the instant destroy() ran.
        assert.equal(tt.destroyed, true);
        assert.doesNotThrow(() => tt.open());
        assert.doesNotThrow(() => tt.status());
        assert.equal(tt.open(), true, "sealed read freezes at the value in effect at destroy time (still open)");
        assert.equal(tt.open(), true, "repeated reads after destroy are stable, not one-shot");
        assert.equal(typeof tt.status(), "string");

        // duplicate dispose: destroy() again must not throw and must not
        // re-invoke the positioner's destroy() a second time.
        const h = spy.handles[0];
        const destroyCountAfterFirst = h.destroyCount;
        assert.doesNotThrow(() => tt.destroy());
        assert.equal(h.destroyCount, destroyCountAfterFirst);
    } finally {
        teardownDOM();
    }
});
