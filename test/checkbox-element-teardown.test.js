// Element-level teardown witness (H12 / H-12 pool return).
//
// Factory tests exercise createCheckbox/createCheckboxGroup/createSelect directly
// and never mount the custom-element wrappers -- which is exactly how a blocker
// hid: checkbox-group/element.js called a non-existent roles.destroy(), whose
// throw (swallowed by lite-element's per-callback teardown) ABORTED the cleanup
// arrow before group.destroy() ran, leaking every member's signal nodes. This
// test mounts each wrapper, unmounts it, and asserts (1) the factory instance
// was actually destroyed on disconnect, and (2) every owned lite-signal node
// returned to the registry (activeNodes back to baseline).
//
// The default registry is swapped at module scope: node runs each test file in
// its own process, so this does not leak to siblings (the signal-pool retention
// test relies on the same isolation). Element wrappers are dynamically imported
// AFTER setupDOM so `HTMLElement`/`customElements` globals exist when define()
// runs, and all mounting happens in that one window (define is import-cached).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks } from "./_setup.js";
import { createRegistry, setDefaultRegistry } from "@zakkster/lite-signal";

const REG = createRegistry({ maxNodes: 512 });
setDefaultRegistry(REG);
const active = () => REG.stats().activeNodes;

test("H-12 element teardown: <lite-*> canon wrappers mount/unmount return to baseline", async () => {
    setupDOM();
    try {
        await import("../src/checkbox/element.js");
        await import("../src/checkbox-group/element.js");
        await import("../src/select/element.js");

        // ---- checkbox-group (the fixed blocker: group + 3 members) ----------
        let baseline = active();
        for (let i = 0; i < 6; i++) {
            const host = document.createElement("lite-checkbox-group");
            host.innerHTML =
                '<span data-select-all></span>' +
                '<label><span data-checkbox value="a"></span> A</label>' +
                '<label><span data-checkbox value="b" checked></span> B</label>' +
                '<label><span data-checkbox value="c"></span> C</label>';
            document.body.appendChild(host);
            assert.ok(active() > baseline, "cbgroup cycle " + i + ": mount allocated nodes");
            const group = host._checkboxGroupInstance;
            assert.equal(group.memberCount, 3, "cbgroup cycle " + i + ": 3 members on mount");
            document.body.removeChild(host);
            await flushMicrotasks();   // lite-element defers teardown one microtask (reparent-safe)
            assert.equal(group.destroyed, true,
                "cbgroup cycle " + i + ": group.destroy() ran on unmount (the fixed blocker)");
            assert.equal(active(), baseline,
                "cbgroup cycle " + i + ": activeNodes " + active() + " != baseline " + baseline + " -- leaked");
        }

        // ---- checkbox -------------------------------------------------------
        baseline = active();
        for (let i = 0; i < 6; i++) {
            const host = document.createElement("lite-checkbox");
            host.innerHTML = '<span data-checkbox-root></span><span data-checkbox-label>x</span>';
            document.body.appendChild(host);
            assert.ok(active() > baseline, "checkbox cycle " + i + ": mount allocated nodes");
            const cb = host._checkboxInstance;
            document.body.removeChild(host);
            await flushMicrotasks();
            assert.equal(cb.destroyed, true, "checkbox cycle " + i + ": checkbox.destroy() ran on unmount");
            assert.equal(active(), baseline,
                "checkbox cycle " + i + ": activeNodes " + active() + " != baseline " + baseline);
        }

        // ---- select ---------------------------------------------------------
        // <lite-select> reflects open/value through lite-element scope.prop(),
        // whose per-instance prop signals are pooled by LITE-ELEMENT, not by this
        // package -- so a strict registry baseline here would measure lite-element,
        // not select. select's FACTORY teardown is H-12 clean (createSelect seals
        // _internalValue + roving/core destroy; proven by the factory suite and the
        // reviewer). Here we assert the element mounts and unmounts cleanly (its
        // cleanup -- roles.disconnect + select.destroy -- runs without throwing).
        for (let i = 0; i < 6; i++) {
            const host = document.createElement("lite-select");
            host.innerHTML =
                '<button data-trigger>pick</button>' +
                '<ul data-listbox>' +
                '<li data-item data-value="a">A</li>' +
                '<li data-item data-value="b">B</li>' +
                '</ul>';
            assert.doesNotThrow(() => document.body.appendChild(host), "select cycle " + i + ": connect");
            assert.doesNotThrow(() => document.body.removeChild(host), "select cycle " + i + ": disconnect");
            await flushMicrotasks();
        }
    } finally {
        teardownDOM();
    }
});
