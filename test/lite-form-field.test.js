// lite-form-field.test.js -- the H11 (LH-06) seam proven against PUBLISHED
// @zakkster/lite-form (devDep ^1.3.0, installs 1.4.0; NOT a symlink). Proves the
// one-reveal-gate wiring from docs/recipes/lite-form-field.md and ADR 0007:
//
//   ff.setValid   <- reveal-gated field.error()  (null => valid)
//   ff.setTouched <- field.touched()
//   ff.setPending <- field.isValidating()
//
// with form-field constructed showErrorsBeforeTouched:true so lite-form owns the
// ONLY reveal gate. Async ordering is driven with hand-resolved deferreds so the
// stale-settlement law is asserted deterministically; a setTimeout(0) flush
// settles each lite-form async check (the async lane has no timers of its own).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { effect } from "@zakkster/lite-signal";
import { createForm } from "@zakkster/lite-form";
import { createFormField } from "../src/form-field/index.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    return { p, resolve };
}

// Build the one-reveal-gate wiring. `formConfig` is passed straight to createForm
// (the test supplies validators/validatorsAsync/validateOn). Returns the handles
// plus the painted DOM so paint assertions read the real elements.
function wire(formConfig) {
    const root = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const errEl = document.createElement("p");
    root.append(label, input, errEl);
    document.body.append(root);

    const form = createForm(formConfig);
    const field = form.field(formConfig._path);

    // form-field defers ALL reveal gating to lite-form (single gate).
    const ff = createFormField({ showErrorsBeforeTouched: true });
    ff.attachRoot(root);
    ff.attachLabel(label);
    ff.attachControl(input);
    ff.attachErrorText(errEl);

    // The three documented bridges.
    const stops = [
        effect(() => { const e = field.error(); ff.setValid(e == null, e); }),
        effect(() => { ff.setTouched(field.touched()); }),
        effect(() => { ff.setPending(field.isValidating()); }),
    ];

    input.addEventListener("input", (ev) => field.set(ev.target.value));
    input.addEventListener("blur", () => field.blur());

    function teardown() {
        for (const s of stops) s();
        ff.destroy();
        form.dispose();
    }
    return { form, field, ff, root, input, errEl, teardown };
}

// A4: submit() while a field is validating resolves false with ZERO onSubmit
// calls. The strict-false gate is lite-form's; the wiring adds no second gate.
test("A4 submit self-refuses while pending -- zero onSubmit calls", async () => {
    setupDOM();
    const gates = {};
    let onSubmitCalls = 0;
    const { form, field, teardown } = wire({
        _path: "u",
        initialValues: { u: "" },
        validatorsAsync: {
            u: async (v) => { const d = gates[v] || (gates[v] = deferred()); return await d.p; },
        },
        validateOn: "change",
        onSubmit: () => { onSubmitCalls++; },
    });

    field.set("bob");
    await flush();
    assert.equal(field.isValidating(), true, "async check is in flight");

    const r = await form.submit();
    assert.equal(r, false, "submit refuses while pending");
    assert.equal(onSubmitCalls, 0, "onSubmit was never called");

    gates["bob"].resolve(null);
    await flush();
    assert.equal(field.isValidating(), false, "pending cleared after settle");
    assert.equal(form.isValid(), true, "valid once the check settles clean");

    teardown();
    teardownDOM();
});

// A5: two overlapping validations -- pending stays true until the LATEST settles;
// a stale (earlier) settlement neither clears pending early nor flips validity.
test("A5 out-of-order settlements never flash pending off early", async () => {
    setupDOM();
    const gates = {};
    const { field, ff, root, teardown } = wire({
        _path: "u",
        initialValues: { u: "" },
        validatorsAsync: {
            u: async (v) => { const d = gates[v] || (gates[v] = deferred()); return await d.p; },
        },
        validateOn: "change",
    });

    field.set("aa");   // generation 1
    await flush();
    field.set("bb");   // generation 2 (overlaps)
    await flush();
    assert.equal(field.isValidating(), true, "both in flight -> pending");
    assert.equal(ff.pending(), true, "form-field mirrors pending");
    assert.ok(root.hasAttribute("data-validating"), "data-validating painted while pending");

    // Settle the STALE (aa) first: must be dropped whole -- no pending flash off,
    // no error surface.
    gates["aa"].resolve("stale-error");
    await flush();
    assert.equal(field.isValidating(), true, "stale settle did NOT clear pending");
    assert.equal(field.error(), null, "stale settle did NOT surface an error");

    // Settle the latest.
    gates["bb"].resolve(null);
    await flush();
    assert.equal(field.isValidating(), false, "latest settle clears pending");
    assert.equal(ff.pending(), false);
    assert.equal(root.hasAttribute("data-validating"), false, "data-validating removed");

    teardown();
    teardownDOM();
});

// A6: a field with no async validators shares lite-form's frozen-false
// isValidating; ff.setPending wired unconditionally stays false; data-validating
// is never painted and aria-busy stays "false".
test("A6 sync-only field is never pending -- data-validating never paints", async () => {
    setupDOM();
    const { field, ff, root, input, teardown } = wire({
        _path: "s",
        initialValues: { s: "" },
        validators: { s: (v) => (!v ? "required" : null) },
        validateOn: "change",
    });

    assert.equal(field.isValidating(), false, "sync-only field frozen-false");
    assert.equal(ff.pending(), false);
    assert.equal(root.hasAttribute("data-validating"), false);
    assert.equal(input.getAttribute("aria-busy"), "false", "aria-busy literal false");

    field.set("hello");
    await flush();
    assert.equal(field.isValidating(), false, "still frozen-false after edit");
    assert.equal(root.hasAttribute("data-validating"), false);
    assert.equal(input.getAttribute("aria-busy"), "false");

    teardown();
    teardownDOM();
});

// A7: the paint proof against PUBLISHED lite-form -- data-validating + aria-busy
// paint on pending, the stale error stays VISIBLE during a re-validation, and the
// error reveals exactly per lite-form's validateOn (single gate, not double-gated).
test("A7 pending paints; stale error stays visible; single reveal gate", async () => {
    setupDOM();
    const gates = {};
    const { field, ff, root, input, errEl, teardown } = wire({
        _path: "u",
        initialValues: { u: "" },
        validatorsAsync: {
            u: async (v) => { const d = gates[v] || (gates[v] = deferred()); return await d.p; },
        },
        validateOn: "change",
    });

    // First edit -> pending paints on both root and control.
    field.set("x1");
    await flush();
    assert.equal(ff.pending(), true);
    assert.ok(root.hasAttribute("data-validating"), "root paints data-validating");
    assert.equal(input.getAttribute("aria-busy"), "true", "control paints aria-busy=true");

    // Settle x1 as taken -> error revealed (validateOn:"change" reveals on dirty).
    gates["x1"].resolve("already taken");
    await flush();
    assert.equal(field.isValidating(), false);
    assert.equal(input.getAttribute("aria-busy"), "false");
    assert.equal(ff.showsError(), true, "error is revealed (single gate: lite-form)");
    assert.equal(errEl.textContent, "already taken", "error text painted");
    assert.ok(root.hasAttribute("data-shows-error"));

    // Re-validate: the STALE error stays visible while the new check is pending;
    // the spinner paints BESIDE it (ADR 0007 decision 1 -- not blanked).
    field.set("x2");
    await flush();
    assert.equal(ff.pending(), true, "re-validation pending");
    assert.ok(root.hasAttribute("data-validating"), "spinner paints during re-validation");
    assert.equal(errEl.textContent, "already taken", "stale error STILL visible while pending");
    assert.equal(ff.showsError(), true, "stale error not blanked on entering pending");

    // Latest settles clean -> error clears.
    gates["x2"].resolve(null);
    await flush();
    assert.equal(ff.pending(), false);
    assert.equal(root.hasAttribute("data-validating"), false);
    assert.equal(ff.showsError(), false, "error cleared once the latest check settles clean");
    assert.equal(errEl.textContent, "", "error text cleared");

    teardown();
    teardownDOM();
});
