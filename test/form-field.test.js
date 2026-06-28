// form-field.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createFormField } from "../src/form-field/index.js";

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
