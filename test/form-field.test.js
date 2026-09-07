// form-field.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createRegistry, setDefaultRegistry, effect } from "@zakkster/lite-signal";
import { createFormField } from "../src/form-field/index.js";

// H-12 retention witness (A2): a small fixed-capacity registry swapped in as
// the default before any factory constructs. node:test runs each file in its
// own process (see test/signal-pool.test.js), so this swap cannot leak into
// other suites. activeNodes returning to the pre-cycle baseline after every
// destroy() is the pool-return proof for the new _pending signal.
const REG = createRegistry({ maxNodes: 256 });
setDefaultRegistry(REG);
function activeNodes() { return REG.stats().activeNodes; }

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

// =====================================================================
// State defaults
// =====================================================================

test("defaults to valid + not required + not touched", () => {
    setupDOM();
    const ff = createFormField();
    assert.equal(ff.valid(), true);
    assert.equal(ff.required(), false);
    assert.equal(ff.touched(), false);
    assert.equal(ff.errorMessage(), null);
    ff.destroy();
    teardownDOM();
});

test("setValid(false, msg) flips valid + stores msg", () => {
    setupDOM();
    let cbValid = null;
    let cbMsg = null;
    const ff = createFormField({
        onValidChange: (v, m) => { cbValid = v; cbMsg = m; },
    });
    ff.setValid(false, "Required");
    assert.equal(ff.valid(), false);
    assert.equal(ff.errorMessage(), "Required");
    assert.equal(cbValid, false);
    assert.equal(cbMsg, "Required");
    ff.destroy();
    teardownDOM();
});

test("setValid(true) clears errorMessage", () => {
    setupDOM();
    const ff = createFormField();
    ff.setValid(false, "Bad");
    ff.setValid(true);
    assert.equal(ff.valid(), true);
    assert.equal(ff.errorMessage(), null);
    ff.destroy();
    teardownDOM();
});

test("setValid idempotent: no onValidChange fire when state is same", () => {
    setupDOM();
    let fires = 0;
    const ff = createFormField({ onValidChange: () => { fires++; } });
    ff.setValid(true);    // already true
    assert.equal(fires, 0);
    ff.setValid(false, "X");
    ff.setValid(false, "X");   // same -- no fire
    assert.equal(fires, 1);
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// showsError (touched gate)
// =====================================================================

test("showsError is false while not touched (default gate)", () => {
    setupDOM();
    const ff = createFormField();
    ff.setValid(false, "Bad");
    assert.equal(ff.valid(), false);
    assert.equal(ff.showsError(), false);
    ff.setTouched(true);
    assert.equal(ff.showsError(), true);
    ff.destroy();
    teardownDOM();
});

test("showsError respects showErrorsBeforeTouched option", () => {
    setupDOM();
    const ff = createFormField({ showErrorsBeforeTouched: true });
    ff.setValid(false, "Bad");
    assert.equal(ff.showsError(), true);     // no touch needed
    ff.destroy();
    teardownDOM();
});

test("onTouch fires once when touched goes false->true", () => {
    setupDOM();
    let fires = 0;
    const ff = createFormField({ onTouch: () => { fires++; } });
    ff.setTouched(true);
    ff.setTouched(true);   // no fire (already touched)
    ff.setTouched(false);
    ff.setTouched(true);   // fires again
    assert.equal(fires, 2);
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// Reset
// =====================================================================

test("reset restores defaults", () => {
    setupDOM();
    const ff = createFormField({ defaultValid: true });
    ff.setValid(false, "Bad");
    ff.setRequired(true);
    ff.setTouched(true);
    ff.reset();
    assert.equal(ff.valid(), true);
    assert.equal(ff.errorMessage(), null);
    assert.equal(ff.required(), false);
    assert.equal(ff.touched(), false);
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot paint
// =====================================================================

test("attachRoot paints data-invalid + data-required + data-touched + data-shows-error", () => {
    setupDOM();
    const ff = createFormField();
    const root = mkEl();
    ff.attachRoot(root);
    // Initial: valid, not required, not touched, no error.
    assert.equal(root.hasAttribute("data-invalid"), false);
    assert.equal(root.hasAttribute("data-required"), false);
    assert.equal(root.hasAttribute("data-touched"), false);
    assert.equal(root.hasAttribute("data-shows-error"), false);
    // Flip everything.
    ff.setRequired(true);
    ff.setValid(false, "Bad");
    ff.setTouched(true);
    assert.equal(root.getAttribute("data-invalid"), "");
    assert.equal(root.getAttribute("data-required"), "");
    assert.equal(root.getAttribute("data-touched"), "");
    assert.equal(root.getAttribute("data-shows-error"), "");
    ff.destroy();
    teardownDOM();
});

test("attachRoot off() removes paint attrs", () => {
    setupDOM();
    const ff = createFormField({ defaultRequired: true, defaultValid: false, defaultErrorMessage: "X", defaultTouched: true });
    const root = mkEl();
    const off = ff.attachRoot(root);
    assert.equal(root.hasAttribute("data-required"), true);
    off();
    assert.equal(root.hasAttribute("data-required"), false);
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// Label + control wiring
// =====================================================================

test("attachLabel + attachControl wires label.for to control.id", () => {
    setupDOM();
    const ff = createFormField();
    const lbl = mkEl("label");
    const input = mkEl("input");
    ff.attachLabel(lbl);
    ff.attachControl(input);
    assert.equal(lbl.getAttribute("for"), input.id);
    ff.destroy();
    teardownDOM();
});

test("attachControl-first-then-label also wires correctly", () => {
    setupDOM();
    const ff = createFormField();
    const input = mkEl("input");
    const lbl = mkEl("label");
    ff.attachControl(input);
    ff.attachLabel(lbl);
    assert.equal(lbl.getAttribute("for"), input.id);
    ff.destroy();
    teardownDOM();
});

test("attachLabel paints data-required reactively", () => {
    setupDOM();
    const ff = createFormField();
    const lbl = mkEl("label");
    ff.attachLabel(lbl);
    assert.equal(lbl.hasAttribute("data-required"), false);
    ff.setRequired(true);
    assert.equal(lbl.getAttribute("data-required"), "");
    ff.setRequired(false);
    assert.equal(lbl.hasAttribute("data-required"), false);
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// Control ARIA wiring
// =====================================================================

test("attachControl sets aria-invalid + aria-required reactively", () => {
    setupDOM();
    const ff = createFormField();
    const input = mkEl("input");
    ff.attachControl(input);
    assert.equal(input.getAttribute("aria-invalid"), "false");
    assert.equal(input.getAttribute("aria-required"), "false");
    ff.setRequired(true);
    assert.equal(input.getAttribute("aria-required"), "true");
    ff.setValid(false, "Bad");
    ff.setTouched(true);
    assert.equal(input.getAttribute("aria-invalid"), "true");
    ff.destroy();
    teardownDOM();
});

test("control blur sets touched", () => {
    setupDOM();
    const ff = createFormField();
    const input = mkEl("input");
    ff.attachControl(input);
    assert.equal(ff.touched(), false);
    input.dispatchEvent(new Event("blur"));
    assert.equal(ff.touched(), true);
    ff.destroy();
    teardownDOM();
});

test("aria-describedby chain includes helper id always", () => {
    setupDOM();
    const ff = createFormField();
    const input = mkEl("input");
    const helper = mkEl("p");
    ff.attachControl(input);
    ff.attachHelperText(helper);
    const desc = input.getAttribute("aria-describedby") || "";
    assert.ok(desc.includes(helper.id));
    ff.destroy();
    teardownDOM();
});

test("aria-describedby includes error id only when shown", () => {
    setupDOM();
    const ff = createFormField();
    const input = mkEl("input");
    const errEl = mkEl("p");
    ff.attachControl(input);
    ff.attachErrorText(errEl);
    // Not shown yet (valid).
    let desc = input.getAttribute("aria-describedby") || "";
    assert.equal(desc.includes(errEl.id), false);
    // Now shown.
    ff.setValid(false, "Bad");
    ff.setTouched(true);
    desc = input.getAttribute("aria-describedby") || "";
    assert.ok(desc.includes(errEl.id));
    // Back to valid.
    ff.setValid(true);
    desc = input.getAttribute("aria-describedby") || "";
    assert.equal(desc.includes(errEl.id), false);
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// Error text paint
// =====================================================================

test("attachErrorText writes textContent + role=alert + data-hidden", () => {
    setupDOM();
    const ff = createFormField();
    const errEl = mkEl("p");
    ff.attachErrorText(errEl);
    assert.equal(errEl.getAttribute("role"), "alert");
    assert.equal(errEl.getAttribute("aria-live"), "polite");
    assert.equal(errEl.getAttribute("data-hidden"), "");  // hidden by default (valid)
    ff.setValid(false, "Required field");
    ff.setTouched(true);
    assert.equal(errEl.textContent, "Required field");
    assert.equal(errEl.hasAttribute("data-hidden"), false);
    ff.setValid(true);
    assert.equal(errEl.getAttribute("data-hidden"), "");
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy detaches all attached elements", () => {
    setupDOM();
    const ff = createFormField();
    const root = mkEl();
    const lbl = mkEl("label");
    const input = mkEl("input");
    const helper = mkEl("p");
    const errEl = mkEl("p");
    ff.attachRoot(root);
    ff.attachLabel(lbl);
    ff.attachControl(input);
    ff.attachHelperText(helper);
    ff.attachErrorText(errEl);
    ff.destroy();
    assert.equal(input.hasAttribute("aria-invalid"), false);
    assert.equal(input.hasAttribute("aria-required"), false);
    assert.equal(errEl.hasAttribute("role"), false);
    assert.equal(lbl.hasAttribute("for"), false);
    teardownDOM();
});

test("destroy is idempotent + blocks mutations", () => {
    setupDOM();
    const ff = createFormField();
    ff.destroy();
    ff.destroy();
    ff.setValid(false, "X");
    assert.equal(ff.destroyed, true);
    teardownDOM();
});

// =====================================================================
// A3 (H-12 seal): destroy() while pending() is true freezes the read at
// its final value; setPending after destroy is a silent no-op; a second
// destroy() neither throws nor unfreezes the value.
// =====================================================================

test("A3 destroy while pending seals: pending() frozen true; setPending after destroy no-ops", () => {
    setupDOM();
    const ff = createFormField();
    ff.setPending(true);
    assert.equal(ff.pending(), true);
    ff.destroy();
    assert.equal(ff.pending(), true, "pending frozen at final (true) value after destroy");
    ff.setPending(false); // post-destroy mutation must be swallowed silently
    assert.equal(ff.pending(), true, "post-destroy setPending(false) did not change the frozen value");
    ff.destroy(); // idempotent: does not throw, does not unfreeze
    assert.equal(ff.pending(), true);
    assert.equal(ff.destroyed, true);
    teardownDOM();
});

test("A3b destroy while NOT pending freezes pending() false; setPending(true) after destroy no-ops", () => {
    setupDOM();
    const ff = createFormField();
    assert.equal(ff.pending(), false);
    ff.destroy();
    assert.equal(ff.pending(), false, "pending frozen at final (false) value after destroy");
    ff.setPending(true); // post-destroy mutation must be swallowed silently
    assert.equal(ff.pending(), false, "post-destroy setPending(true) did not change the frozen value");
    teardownDOM();
});

test("adversarial: re-entrant setPending from inside a pending-driven consumer effect settles without throwing or looping", () => {
    setupDOM();
    const ff = createFormField();
    const root = mkEl();
    ff.attachRoot(root);
    let runs = 0;
    // Consumer-side effect that reacts to pending() and writes it back
    // (re-entrant write while the reactive graph is still propagating the
    // PRIOR write). setPending's own idempotence guard (next === current
    // is a no-op) must break the cycle rather than looping or throwing.
    const stop = effect(() => {
        runs++;
        if (ff.pending()) ff.setPending(false);
    });
    assert.doesNotThrow(() => ff.setPending(true));
    assert.equal(ff.pending(), false, "re-entrant write inside the reaction wins -- settles false");
    assert.ok(runs >= 2 && runs < 1000, "settled within a bounded number of reactions (got " + runs + ")");
    assert.equal(root.hasAttribute("data-validating"), false, "paint reflects the settled (false) state");
    stop();
    ff.destroy();
    teardownDOM();
});

// =====================================================================
// A2 (retention/H-12): bounded create -> attach -> setPending churn ->
// destroy returns every pooled node, including the new _pending signal.
// activeNodes returning to baseline after each cycle is the pool-return
// proof (mirrors test/signal-pool.test.js's attach/open/close churn).
// =====================================================================

test("A2 retention: 512x create -> attachRoot+attachControl -> setPending churn -> destroy returns the pool", () => {
    setupDOM();
    const CYCLES = 512;
    const baseline = activeNodes();
    for (let i = 0; i < CYCLES; i++) {
        const ff = createFormField();
        const root = mkEl();
        const input = mkEl("input");
        ff.attachRoot(root);
        ff.attachControl(input);
        ff.setPending(true);
        ff.setPending(false);
        ff.setPending(true);
        ff.setPending(true); // idempotent set -- no extra node, no throw
        ff.destroy();
        ff.destroy(); // idempotent destroy -- no throw, no double free
        assert.equal(
            activeNodes(), baseline,
            "cycle " + i + ": activeNodes " + activeNodes() + " != baseline " + baseline +
            " -- destroy() did not return every signal node (including _pending) to the pool",
        );
    }
    teardownDOM();
});

test("A2b retention: 200x churn with all five attach points + pending toggled mid-life", () => {
    setupDOM();
    const CYCLES = 200;
    const baseline = activeNodes();
    for (let i = 0; i < CYCLES; i++) {
        const ff = createFormField();
        const root = mkEl();
        const lbl = mkEl("label");
        const input = mkEl("input");
        const helper = mkEl("p");
        const errEl = mkEl("p");
        ff.attachRoot(root);
        ff.attachLabel(lbl);
        ff.attachControl(input);
        ff.attachHelperText(helper);
        ff.attachErrorText(errEl);
        ff.setPending(true);
        ff.setValid(false, "async check failed");
        ff.setPending(false);
        ff.destroy();
        assert.equal(
            activeNodes(), baseline,
            "cycle " + i + ": activeNodes " + activeNodes() + " != baseline " + baseline,
        );
    }
    teardownDOM();
});
