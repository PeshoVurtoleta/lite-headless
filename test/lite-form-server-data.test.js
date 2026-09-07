// lite-form-server-data.test.js -- the H13 (LH-11) read path proven against
// PUBLISHED @zakkster/lite-form (devDep ^1.3.0, installs 1.4.0; NOT a symlink).
// Proves docs/recipes/lite-form-server-data.md and ADR 0009: reinitialize(next,
// policy) merges a server snapshot into a live form-field-wired form in ONE batch
// -- a dirty draft never flickers through the server value; pristine siblings
// adopt silently; the conflict list renders straight off toPatch() with
// keep-mine (no-op) / take-server (field.reset()); a throwing/mutating policy is
// inert (atomicity is lite-form's, asserted from the consumer side).
//
// "poll tick" == a synchronous form.reinitialize(server, policy) -- no transport
// lives in the form. Mid-edit is a real `input` event on a real happy-dom node.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { effect } from "@zakkster/lite-signal";
import { createForm } from "@zakkster/lite-form";
import { createFormField } from "../src/form-field/index.js";

// Build one form-field-wired leaf against `form`, with a REAL attached input and
// a value-bind write log (every write of input.value is recorded, so A1/A2 can
// count re-runs and prove no transient server value ever lands in the DOM).
function wireField(form, path) {
    const root = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    const errEl = document.createElement("p");
    root.append(label, input, errEl);
    document.body.append(root);

    const field = form.field(path);
    const ff = createFormField({ showErrorsBeforeTouched: true });
    ff.attachRoot(root);
    ff.attachLabel(label);
    ff.attachControl(input);
    ff.attachErrorText(errEl);

    const writes = [];
    const stops = [
        effect(() => { const e = field.error(); ff.setValid(e == null, e); }),
        effect(() => { ff.setTouched(field.touched()); }),
        effect(() => { ff.setPending(field.isValidating()); }),
        effect(() => { writes.push(input.value = field.value()); }),
    ];
    input.addEventListener("input", (ev) => field.set(ev.target.value));
    input.addEventListener("blur", () => field.blur());

    function stop() { for (const s of stops) s(); ff.destroy(); }
    return { field, ff, root, input, errEl, writes, stop };
}

// Simulate the user typing into a real input (element value pre-set, then a real
// `input` event the wire listener handles).
function typeInto(input, value) {
    input.value = value;
    input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
}

// A1: a dirty conflict field NEVER flickers through the server value. The value
// bind gains ZERO entries across the merge, input.value stays byte-equal to the
// draft, and no recorded write ever equals the server value.
test("A1 dirty conflict field does not flicker through the server value", () => {
    setupDOM();
    const form = createForm({ initialValues: { title: "orig" } });
    const f = wireField(form, "title");

    typeInto(f.input, "my draft");
    f.input.focus();
    assert.equal(f.field.dirty(), true, "field is dirty after the edit");
    assert.equal(f.input.value, "my draft");

    const before = f.writes.length;

    // poll tick: strict merge (keep every draft). title conflicts (draft differs
    // from the incoming server value, policy returns false).
    form.reinitialize({ title: "server value" }, () => false);

    assert.equal(f.writes.length, before, "value bind gained 0 entries (no flicker)");
    assert.equal(f.input.value, "my draft", "input still shows the draft, byte-equal");
    assert.ok(!f.writes.includes("server value"), "no write ever equaled the server value");
    // baseline re-seeded underneath: the patch reports the server value as `from`.
    const patch = form.toPatch();
    assert.equal(patch.length, 1);
    assert.equal(patch[0].from, "server value");
    assert.equal(patch[0].to, "my draft");

    f.stop();
    form.dispose();
    teardownDOM();
});

// A2: two PRISTINE siblings adopt silently in ONE batch. Each value bind runs
// exactly once for the whole merge, both inputs show the server value, and
// touched is false on both.
test("A2 pristine siblings adopt in one batch, silently", () => {
    setupDOM();
    const form = createForm({ initialValues: { a: "", b: "" } });
    const fa = wireField(form, "a");
    const fb = wireField(form, "b");

    // reset the write logs to the post-setup baseline
    fa.writes.length = 0;
    fb.writes.length = 0;

    form.reinitialize({ a: "SA", b: "SB" }, () => false);

    assert.equal(fa.writes.length, 1, "field a value bind ran exactly once");
    assert.equal(fb.writes.length, 1, "field b value bind ran exactly once");
    assert.equal(fa.input.value, "SA", "field a shows the server value");
    assert.equal(fb.input.value, "SB", "field b shows the server value");
    assert.equal(fa.field.touched(), false, "pristine adopt clears touched (a)");
    assert.equal(fb.field.touched(), false, "pristine adopt clears touched (b)");
    assert.equal(form.toPatch().length, 0, "adopted fields are pristine -> empty patch");

    fa.stop();
    fb.stop();
    form.dispose();
    teardownDOM();
});

// A3: take-server lands the server value in the DOM. toPatch() reports the
// conflict; field.reset() lands `from` and empties the patch; data-touched drops
// because reset() clears touched.
test("A3 take-server (field.reset) lands the server value and clears touched", () => {
    setupDOM();
    const form = createForm({ initialValues: { title: "orig" } });
    const f = wireField(form, "title");

    typeInto(f.input, "my draft");
    f.field.blur();                     // touched -> true
    assert.equal(f.field.touched(), true);

    form.reinitialize({ title: "server value" }, () => false);

    let patch = form.toPatch();
    assert.equal(patch.length, 1);
    assert.equal(patch[0].from, "server value", "post-merge .from is the server value");
    assert.equal(patch[0].to, "my draft", "post-merge .to is the draft");
    assert.equal(f.field.touched(), true, "conflict keeps touched");
    assert.ok(f.root.hasAttribute("data-touched"), "data-touched painted before take-server");

    // take-server:
    f.field.reset();

    assert.equal(f.input.value, "server value", "input now shows the server value");
    assert.equal(form.toPatch().length, 0, "patch empty after take-server");
    assert.equal(f.field.touched(), false, "reset() clears touched");
    assert.ok(!f.root.hasAttribute("data-touched"), "data-touched dropped after reset()");

    f.stop();
    form.dispose();
    teardownDOM();
});

// A4: keep-mine is a pure no-op. No form call is made; the patch entry stays with
// the same from/to and the field is still dirty.
test("A4 keep-mine is a no-op -- patch entry survives", () => {
    setupDOM();
    const form = createForm({ initialValues: { title: "orig" } });
    const f = wireField(form, "title");

    typeInto(f.input, "my draft");
    form.reinitialize({ title: "server value" }, () => false);

    const before = form.toPatch();
    assert.equal(before.length, 1);

    // keep-mine: literally nothing happens.

    const after = form.toPatch();
    assert.equal(after.length, 1, "patch entry survives keep-mine");
    assert.equal(after[0].from, before[0].from);
    assert.equal(after[0].to, before[0].to);
    assert.equal(f.field.dirty(), true, "field is still dirty");
    assert.equal(f.input.value, "my draft", "draft still shown");

    f.stop();
    form.dispose();
    teardownDOM();
});

// ECHO (by policy): dirty draft + policy() === true confirms the echo. The
// overlay clears, the field lands PRISTINE at the server value, touched
// clears, and toPatch() is empty -- an echo is NOT a conflict.
test("ECHO by policy: confirmed dirty field lands pristine at the server value", () => {
    setupDOM();
    const form = createForm({ initialValues: { title: "orig" } });
    const f = wireField(form, "title");

    typeInto(f.input, "my draft");
    f.field.blur();                     // touched -> true
    assert.equal(f.field.dirty(), true);
    assert.equal(f.field.touched(), true);

    form.reinitialize({ title: "server" }, () => true);

    assert.equal(f.field.dirty(), false, "echo lands pristine (not merely equal-looking)");
    assert.equal(f.field.value(), "server", "field value is the server value");
    assert.equal(f.input.value, "server", "input shows the server value");
    assert.equal(f.field.touched(), false, "echo clears touched");
    assert.ok(!f.root.hasAttribute("data-touched"), "data-touched dropped on echo");
    assert.equal(form.toPatch().length, 0, "echo clears the overlay -- empty patch, not a conflict");

    f.stop();
    form.dispose();
    teardownDOM();
});

// ECHO (by Object.is, force-echo BEFORE the policy runs): the draft happens to
// equal the incoming server value byte-for-byte. Object.is(n, d) must confirm
// the echo regardless of what the policy returns -- here the policy returns
// false and the field still lands pristine, proving Object.is short-circuits
// ahead of the policy call (llms.txt:250-251). The value bind must not
// spuriously re-write an already-equal input.
test("ECHO by Object.is: equal draft force-echoes even when the policy says false", () => {
    setupDOM();
    const form = createForm({ initialValues: { title: "orig" } });
    const f = wireField(form, "title");

    typeInto(f.input, "server");        // draft happens to equal the incoming server value
    f.field.blur();
    assert.equal(f.field.dirty(), true);
    assert.equal(f.input.value, "server");

    const before = f.writes.length;
    let policyCalls = 0;

    form.reinitialize({ title: "server" }, (n, d) => { policyCalls++; return false; });

    assert.equal(policyCalls, 0, "Object.is short-circuits -- the policy is never even called for this field");
    assert.equal(f.field.dirty(), false, "Object.is force-echoes despite policy() === false");
    assert.equal(f.field.value(), "server");
    assert.equal(f.field.touched(), false, "force-echo clears touched");
    assert.equal(form.toPatch().length, 0, "force-echo clears the overlay -- empty patch");
    // an echo of an already-equal value must not spuriously re-write the DOM
    assert.equal(f.writes.length, before, "value bind gained 0 entries -- input already showed the equal value");
    assert.equal(f.input.value, "server", "input unchanged, still byte-equal");

    f.stop();
    form.dispose();
    teardownDOM();
});

// A5: a throwing policy is inert (atomicity), and a MUTATING policy throws a
// TypeError (the re-entrancy latch). The form is byte-identical after the throw.
test("A5 throwing/mutating policy leaves the form byte-identical", () => {
    setupDOM();
    const form = createForm({ initialValues: { title: "orig", note: "" } });
    const f = wireField(form, "title");
    const g = wireField(form, "note");

    typeInto(f.input, "my draft");     // title dirty -> policy will run for it
    f.field.blur();

    const valuesBefore = JSON.stringify(form.values());
    const patchBefore = JSON.stringify(form.toPatch());
    const stateBefore = {
        title: [f.field.dirty(), f.field.touched()],
        note: [g.field.dirty(), g.field.touched()],
    };

    // a policy that throws -> merge mutates nothing (verdicts pre-scanned).
    assert.throws(
        () => form.reinitialize({ title: "server value", note: "srv note" }, () => { throw new Error("boom"); }),
        /boom/,
    );

    // a policy that mutates the form -> TypeError (re-entrancy latch).
    assert.throws(
        () => form.reinitialize({ title: "server value", note: "srv note" }, () => { form.field("title").set("hijack"); return false; }),
        TypeError,
    );

    assert.equal(JSON.stringify(form.values()), valuesBefore, "values() byte-identical");
    assert.equal(JSON.stringify(form.toPatch()), patchBefore, "toPatch() byte-identical");
    assert.deepEqual(
        { title: [f.field.dirty(), f.field.touched()], note: [g.field.dirty(), g.field.touched()] },
        stateBefore,
        "per-field [dirty, touched] byte-identical",
    );
    assert.equal(f.input.value, "my draft", "draft unchanged after both throws");

    f.stop();
    g.stop();
    form.dispose();
    teardownDOM();
});
