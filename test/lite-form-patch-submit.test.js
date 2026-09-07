// lite-form-patch-submit.test.js -- the H13 (LH-11) write path proven against
// PUBLISHED @zakkster/lite-form (devDep ^1.3.0, installs 1.4.0; NOT a symlink).
// Proves docs/recipes/lite-form-patch-submit.md and ADR 0009: submit(ev,{patch:
// true}) posts exactly the dirty paths; an empty patch posts []; and the busy
// submit button is ONE gate mirrored -- while a field is validating, submit()
// self-refuses, the button paints disabled + aria-busy + data-loading, and a
// JS-dispatched click fires onPress zero times (createButton.canPress() is the
// only click gate; there is NO second handler guard).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { effect } from "@zakkster/lite-signal";
import { createForm } from "@zakkster/lite-form";
import { createButton } from "../src/button/index.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    return { p, resolve };
}

// A6: { patch: true } posts EXACTLY the dirty paths as [{path, from, to}].
test("A6 patch submit posts exactly the dirty paths", async () => {
    setupDOM();
    const captured = [];
    const form = createForm({
        initialValues: { name: "Ada", email: "ada@x.io", role: "admin", bio: "" },
        onSubmit: (payload) => { captured.push(payload); },
    });

    form.field("email").set("ada@new.io");
    form.field("role").set("owner");

    const ok = await form.submit(undefined, { patch: true });
    assert.equal(ok, true, "submit resolved true");
    assert.equal(captured.length, 1, "onSubmit called once");

    const payload = captured[0];
    assert.equal(payload.length, 2, "patch has exactly the 2 dirty paths");
    const paths = payload.map((e) => e.path).sort();
    assert.deepEqual(paths, ["email", "role"], "the two edited paths");
    for (const entry of payload) {
        assert.deepEqual(Object.keys(entry).sort(), ["from", "path", "to"], "entry has exactly path,from,to");
    }
    const byPath = Object.fromEntries(payload.map((e) => [e.path, e]));
    assert.equal(byPath.email.from, "ada@x.io");
    assert.equal(byPath.email.to, "ada@new.io");
    assert.equal(byPath.role.from, "admin");
    assert.equal(byPath.role.to, "owner");

    form.dispose();
    teardownDOM();
});

// A7: an empty patch still submits -- onSubmit is called ONCE with [], not
// values().
test("A7 empty patch posts [] (not values())", async () => {
    setupDOM();
    const captured = [];
    const form = createForm({
        initialValues: { name: "Ada", email: "ada@x.io" },
        onSubmit: (payload) => { captured.push(payload); },
    });

    const ok = await form.submit(undefined, { patch: true });
    assert.equal(ok, true, "empty patch still resolves true");
    assert.equal(captured.length, 1, "onSubmit called once");
    assert.ok(Array.isArray(captured[0]), "payload is the patch array");
    assert.equal(captured[0].length, 0, "payload is [] -- not values()");

    form.dispose();
    teardownDOM();
});

// A8: ONE gate, mirrored. While a field is validating: submit() -> false, zero
// onSubmit calls, the button paints disabled + aria-busy + data-loading, and a
// JS-dispatched click fires onPress zero times. After a clean settle all three
// clear and submit succeeds.
test("A8 one gate: busy button mirrors isValidating, no second gate", async () => {
    setupDOM();
    const gates = {};
    let onSubmitCalls = 0;
    let onPressCalls = 0;

    const form = createForm({
        initialValues: { email: "" },
        validatorsAsync: {
            email: async (v) => { const d = gates[v] || (gates[v] = deferred()); return await d.p; },
        },
        validateOn: "change",
        onSubmit: () => { onSubmitCalls++; },
    });

    const buttonEl = document.createElement("button");
    document.body.append(buttonEl);
    const btn = createButton({ onPress: () => { onPressCalls++; } });
    btn.attachRoot(buttonEl);

    // Busy = form-level isSubmitting OR any field validating. Per-field
    // isSubmitting does not exist; the per-field pending signal is isValidating.
    const stop = effect(() => { btn.setLoading(form.isSubmitting() || form.isValidating()); });

    // Kick the async check pending.
    form.field("email").set("ada@x.io");
    await flush();
    assert.equal(form.field("email").isValidating(), true, "field is validating");

    // Button mirrors the busy state -- three attributes, painted.
    assert.ok(buttonEl.hasAttribute("disabled"), "disabled painted while busy");
    assert.equal(buttonEl.getAttribute("aria-busy"), "true", "aria-busy=true while busy");
    assert.ok(buttonEl.hasAttribute("data-loading"), "data-loading painted while busy");

    // A JS-dispatched click fires onPress 0 times -- canPress() is the only gate.
    dispatchClick(buttonEl);
    assert.equal(onPressCalls, 0, "click blocked while loading (canPress gate)");

    // submit() self-refuses while pending (isValid strict-false). No second gate.
    const refused = await form.submit();
    assert.equal(refused, false, "submit refuses while validating");
    assert.equal(onSubmitCalls, 0, "onSubmit never called while pending");

    // Settle clean -> pending clears, the button clears, submit succeeds.
    gates["ada@x.io"].resolve(null);
    await flush();
    assert.equal(form.field("email").isValidating(), false, "validation settled");
    assert.ok(!buttonEl.hasAttribute("disabled"), "disabled cleared");
    assert.equal(buttonEl.getAttribute("aria-busy"), null, "aria-busy cleared");
    assert.ok(!buttonEl.hasAttribute("data-loading"), "data-loading cleared");

    const ok = await form.submit();
    assert.equal(ok, true, "submit succeeds once the check settles clean");
    assert.equal(onSubmitCalls, 1, "onSubmit called exactly once after settle");

    stop();
    btn.destroy();
    form.dispose();
    teardownDOM();
});
