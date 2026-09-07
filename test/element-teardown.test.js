// element-teardown.test.js
//
// H-12 witness, ELEMENT level, for the 16 wrappers repaired alongside the
// checkbox/checkbox-group/select canon (see test/checkbox-element-teardown.test.js
// for those). The signal-pool suite proves every FACTORY returns its nodes on
// destroy(); it never mounts a custom element, so it cannot see whether the
// <lite-*> wrapper's disconnect path actually CALLS that destroy(). This file
// closes that gap for the legacy wrappers.
//
// The class it guards: under @zakkster/lite-element 1.1.0, mount() DISCARDS the
// value setup returns; only teardown registered via `scope.onCleanup(fn)` runs
// on disconnect (dispose() replays it, each callback in its own try/catch).
// A wrapper that wrote
//
//     return () => { roles.disconnect(); ...; instance.destroy(); };
//
// therefore never disposed its factory instance, never disconnected its
// MutationObserver(s)/role observer, and (in empty-state/radio-group/toolbar,
// which also called the nonexistent roles.destroy()) would have thrown had the
// arrow run at all. Churned mount/unmount then walks the fixed lite-signal
// registry to a CapacityError. Same failure mode the checkbox-group blocker
// hit, one rung lower: there the throw lived INSIDE a live onCleanup; here the
// whole arrow was dead. The fix makes all 16 match the 43 correct wrappers.
//
// The primary witness is `instance.destroyed` after unmount. instance.destroy()
// is the LAST statement in every wrapper's cleanup closure, so `destroyed ===
// true` proves the WHOLE closure ran -- nothing earlier threw and stranded it,
// and (on the pre-fix code) the closure ran at all. It holds for signal-less
// wrappers (toolbar, affix, ...) that a pure registry-baseline check cannot see.
// `activeNodes === baseline` is the secondary, H-12-specific check: for the
// wrappers that DO pool per-item signals it proves destroy() returned them.
//
// Mechanics: setupDOM() exposes a global MutationObserver (the wrappers
// construct one unguarded); the torture harness intentionally does not, which
// is why element mounts live in node:test, not torture. Wrappers are imported
// AFTER setupDOM (define() needs customElements) into ONE window for the file
// (import is cached, so define runs once). node runs each test file in its own
// process, so the module-scoped default registry cannot leak to siblings.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks } from "./_setup.js";
import { createRegistry, setDefaultRegistry } from "@zakkster/lite-signal";

const REG = createRegistry({ maxNodes: 512 });
setDefaultRegistry(REG);
const active = () => REG.stats().activeNodes;

// The 16 wrappers repaired this change (return-arrow teardown -> onCleanup; and
// roles.destroy() -> roles.disconnect() in the three that carried the typo),
// each with its host instance-handle property.
const WRAPPERS = [
    ["affix",        "_affixInstance"],
    ["anchor",       "_anchorInstance"],
    ["backtop",      "_backtopInstance"],
    ["badge",        "_badgeInstance"],
    ["button",       "_buttonInstance"],
    ["card",         "_cardInstance"],
    ["color-picker", "_colorPickerInstance"],
    ["descriptions", "_descriptionsInstance"],
    ["empty-state",  "_emptyStateInstance"],
    ["meter",        "_meterInstance"],
    ["radio-group",  "_radioGroupInstance"],
    ["result",       "_resultInstance"],
    ["tag",          "_tagInstance"],
    ["timeline",     "_timelineInstance"],
    ["toolbar",      "_toolbarInstance"],
    ["tour",         "_tourInstance"],
];

// The role/slot wrappers: mounting with children exercises the live role
// observer + per-item signal allocation. empty-state/radio-group/toolbar are
// the three that carried the roles.destroy() typo.
const ROLE_WRAPPERS = ["radio-group", "toolbar", "empty-state", "descriptions", "timeline"];

let document = null;

before(async () => {
    ({ document } = setupDOM());
    await Promise.all(WRAPPERS.map(([name]) => import(`../src/${name}/element.js`)));
});

after(() => {
    teardownDOM();
});

// Representative role/slot children for the wrappers whose leak includes
// per-item signals and a live role observer. Bare mounts (everything else)
// still construct the factory instance -- enough for the .destroyed witness.
function addChildren(tag, host) {
    const mk = (t, attrs, kids) => {
        const el = document.createElement(t);
        if (attrs) for (const k in attrs) el.setAttribute(k, attrs[k]);
        if (kids) for (const c of kids) el.appendChild(c);
        return el;
    };
    if (tag === "lite-radio-group") {
        host.setAttribute("value", "b");
        for (const v of ["a", "b", "c"]) {
            host.appendChild(mk("button", { "data-radio-item": "", value: v }));
        }
    } else if (tag === "lite-toolbar") {
        host.appendChild(mk("button", { "data-toolbar-item": "" }));
        host.appendChild(mk("button", { "data-toolbar-item": "" }));
        host.appendChild(mk("div", { "data-toolbar-separator": "" }));
        host.appendChild(mk("div", { "data-toolbar-group": "" }, [
            mk("button", { "data-toolbar-item": "" }),
            mk("button", { "data-toolbar-item": "" }),
        ]));
    } else if (tag === "lite-empty-state") {
        host.appendChild(mk("div", { "data-empty-icon": "" }));
        host.appendChild(mk("h3", { "data-empty-title": "" }));
        host.appendChild(mk("p", { "data-empty-description": "" }));
        host.appendChild(mk("div", { "data-empty-actions": "" }, [mk("button")]));
    } else if (tag === "lite-descriptions") {
        for (let i = 0; i < 2; i++) {
            host.appendChild(mk("div", { "data-desc-item": "" }, [
                mk("div", { "data-desc-label": "" }),
                mk("div", { "data-desc-value": "" }),
            ]));
        }
    } else if (tag === "lite-timeline") {
        for (const type of ["success", "default"]) {
            host.appendChild(mk("div", { "data-timeline-item": "", "data-type": type }));
        }
    }
}

// One mount/unmount cycle. Children (if any) are appended BEFORE connect so the
// wrapper's synchronous initial scan wires them; teardown is deferred one
// microtask by lite-element's disconnect gate, so we flush. Returns the factory
// instance captured while mounted (still readable after destroy).
async function mountUnmount(tag, prop, withChildren) {
    const host = document.createElement(tag);
    if (withChildren) addChildren(tag, host);
    document.body.appendChild(host);
    const inst = host[prop];
    document.body.removeChild(host);
    await flushMicrotasks();
    return inst;
}

// =====================================================================
// Self-check: the witness can fail. A fixed "throw" registry really does
// exhaust when nodes are created and never disposed.
// =====================================================================

test("control: an undisposed churn exhausts a fixed registry", () => {
    const tiny = createRegistry({ maxNodes: 64 });
    assert.throws(() => {
        for (let i = 0; i < 65; i++) tiny.signal(i);
    }, /capacity/i);
});

// =====================================================================
// Bare mount/unmount: every repaired wrapper's cleanup runs to completion
// (instance destroyed) and returns the signal pool.
// =====================================================================

test("H-12 element: bare mount/unmount destroys the instance and returns the pool (all 16)", async () => {
    for (const [name, prop] of WRAPPERS) {
        const tag = "lite-" + name;
        const baseline = active();
        for (let i = 0; i < 8; i++) {
            const inst = await mountUnmount(tag, prop, false);
            assert.ok(inst, tag + " cycle " + i + ": instance present on mount");
            assert.equal(
                inst.destroyed, true,
                tag + " cycle " + i + ": instance.destroy() did not run on disconnect " +
                "(dead return-arrow teardown?)",
            );
            assert.equal(
                active(), baseline,
                tag + " cycle " + i + ": activeNodes " + active() + " != baseline " + baseline,
            );
        }
    }
});

// =====================================================================
// Rich mount/unmount: the role/slot wrappers wire a live role observer and
// per-item signals. This is the path the three roles.destroy() typos would
// have thrown on, had the arrow ever run -- so instance.destroyed here proves
// roles.disconnect() executed before instance.destroy().
// =====================================================================

test("H-12 element: role/slot wrappers tear down cleanly with children", async () => {
    for (const name of ROLE_WRAPPERS) {
        const tag = "lite-" + name;
        const prop = WRAPPERS.find(([n]) => n === name)[1];
        const baseline = active();
        for (let i = 0; i < 8; i++) {
            const inst = await mountUnmount(tag, prop, true);
            assert.equal(inst.destroyed, true, tag + " (with children) cycle " + i + ": instance destroyed");
            assert.equal(
                active(), baseline,
                tag + " (with children) cycle " + i + ": activeNodes " + active() + " != baseline " + baseline,
            );
        }
    }
});

// =====================================================================
// Capacity survival: the user-visible symptom was churned mount/unmount
// walking the registry to a CapacityError. radio-group pools per-item signals,
// so a per-cycle leak would fail the baseline assert (cycle 0) or, unguarded,
// exhaust the pool. 300 cycles > 512-node pool headroom for a multi-node leak.
// =====================================================================

test("H-12 element: churned mount/unmount does not walk the registry to CapacityError", async () => {
    const baseline = active();
    for (let i = 0; i < 300; i++) {
        const inst = await mountUnmount("lite-radio-group", "_radioGroupInstance", true);
        assert.equal(inst.destroyed, true, "radio-group churn cycle " + i + ": destroyed");
        assert.equal(active(), baseline, "radio-group churn cycle " + i + ": activeNodes " + active());
    }
});
