# Recipe: patch submit -- post the minimal diff, surface a 409, drive one busy gate

Cross-package: [`@zakkster/lite-form`](https://www.npmjs.com/package/@zakkster/lite-form)
(state + submit lifecycle) + `@zakkster/lite-headless/form-field` (error paint) +
`@zakkster/lite-headless/button` (the busy submit button).

An edit form on an existing record should POST only what changed, not the whole
document. lite-form's `submit(ev, { patch: true })` posts `toPatch()` -- exactly
the dirty paths as `[{path, from, to}]` -- instead of the full `values()`. This
recipe wires that write path: the minimal-diff POST, a 409 "already taken" server
error surfaced through the reveal gate, and a submit button whose busy state is a
MIRROR of the form, never a second gate.

Verified against PUBLISHED lite-form `^1.3.0` (installs 1.4.0). The seam and every
assertion below are exercised in `test/lite-form-patch-submit.test.js` and ruled in
`docs/decisions/0009-server-data-recipes-and-the-zero-source-ruling.md`.

For the READ path (surviving a server refresh mid-edit, the conflict list) see the
companion `docs/recipes/lite-form-server-data.md`.

## Install

    npm i @zakkster/lite-form @zakkster/lite-signal @zakkster/lite-project @zakkster/lite-headless

## Patch submit posts exactly the dirty paths

    import { createForm } from "@zakkster/lite-form";

    const form = createForm({
        initialValues: { name: "Ada", email: "ada@x.io", role: "admin", bio: "" },
        onSubmit: async (payload) => {
            // With { patch: true } payload is toPatch(): [{path, from, to}], the
            // dirty paths only. PATCH it; the server applies the diff.
            await fetch("/api/users/42", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(payload),
            });
        },
    });

    // Somewhere the user edits two of the four fields:
    form.field("email").set("ada@new.io");
    form.field("role").set("owner");

    // Submit the diff, not the document:
    await form.submit(ev, { patch: true });
    // onSubmit receives:
    //   [ { path: "email", from: "ada@x.io", to: "ada@new.io" },
    //     { path: "role",  from: "admin",    to: "owner" } ]

Each entry has exactly three keys: `path`, `from` (the baseline), `to` (the current
value). A field set back to its initial reference is excluded. `toPatch()` is
untracked and read-only.

> [!NOTE]
> **An empty patch still submits.** With no edits, `toPatch()` is `[]` and
> `submit(ev, { patch: true })` resolves `true` calling `onSubmit([])` -- an empty
> array, NOT `values()`. If your endpoint should be skipped when nothing changed,
> branch on `form.toPatch().length` BEFORE calling submit; lite-form will not
> decide that for you.

## The 409 lane -- a server error, without a setFieldError API

lite-form has no `setFieldError()` on purpose. Per-field validators run inside a
computed, so any signal they read is TRACKED. Hold the server error in a signal,
read it inside the field's validator, and flip it from your submit handler -- the
field re-validates automatically and form-field paints the message through the
same single reveal gate.

    import { signal, effect } from "@zakkster/lite-signal";

    const emailTaken = signal(null);   // null | "That email is already in use"

    const form = createForm({
        initialValues: { email: "" },
        validators: {
            email: (v) => {
                if (!/@/.test(v)) return "Enter a valid email";
                return emailTaken() || null;   // TRACKED -> re-validates on flip
            },
        },
        validateOn: "change",
        onSubmit: async (payload) => {
            const res = await fetch("/api/users", {
                method: "POST", body: JSON.stringify(payload),
            });
            if (res.status === 409) {
                emailTaken.set("That email is already in use");
                throw new Error("conflict");   // submit() returns false
            }
        },
    });

    // Clear the server error when the user edits the field again. Install this
    // AFTER a 409 (or guard on a captured value), because a bare
    //   effect(() => { form.field("email").value(); emailTaken.set(null); })
    // fires ONCE at setup and clears immediately -- the error would never show.
    let clearArmed = false;
    effect(() => {
        form.field("email").value();       // subscribe to edits
        if (clearArmed) emailTaken.set(null);
        clearArmed = true;                 // skip the setup run
    });

## The busy submit button -- one gate, mirrored

lite-form's `isValid` is strict-false while any async check is pending, so
`submit()` already refuses (returns `false`, never calls `onSubmit`) during
validation. The button is a MIRROR of the form's busy state, painted so the user
sees WHY -- it is NOT a second gate.

    import { createButton }    from "@zakkster/lite-headless/button";
    import { createFormField } from "@zakkster/lite-headless/form-field";
    import { effect }          from "@zakkster/lite-signal";

    const btn = createButton({});
    btn.attachRoot(submitButtonEl);

    // Busy = an async onSubmit in flight (form-level) OR any field validating.
    // Per-field isSubmitting does NOT exist -- isSubmitting is form-level only;
    // the per-field pending signal is isValidating.
    effect(() => {
        btn.setLoading(form.isSubmitting() || form.isValidating());
    });

    // Pending PAINT on the editing field (H11): spinner + aria-busy while its
    // async check is unsettled. Single reveal gate deferred to lite-form.
    const emailFf = createFormField({ showErrorsBeforeTouched: true });
    emailFf.attachRoot(emailRootEl);
    emailFf.attachControl(emailInputEl);
    emailFf.attachErrorText(emailErrorEl);
    effect(() => { const e = form.field("email").error(); emailFf.setValid(e == null, e); });
    effect(() => { emailFf.setPending(form.field("email").isValidating()); });

    // The form submit -- NO second gate. createButton.canPress() already blocks a
    // click while loading (a JS-dispatched click during loading fires onPress 0
    // times); submit() already refuses while pending. Do NOT add
    //   if (form.isSubmitting.peek()) return
    // on top -- that is the double-gate footgun (ADR 0007 D2 / ADR 0009 R2).
    formEl.addEventListener("submit", (ev) => {
        ev.preventDefault();
        form.submit(ev, { patch: true });
    });

While `setLoading(true)` is painted, `createButton` puts `disabled` +
`aria-busy="true"` + `data-loading` on the button and blocks clicks -- one gate,
three attributes, zero handler branches.

> [!WARNING]
> **No second submit gate.** `createButton.canPress()`
> (`src/button/index.js:96,150`) already refuses a click while loading, and
> `submit()` already refuses while `isValid` is strict-false. Adding an
> `if (isSubmitting.peek()) return` at the top of your handler re-introduces the
> exact double-gate class ADR 0007 ruled out -- now on the submit lane. Mirror the
> state; do not re-decide it.

## Keep the single reveal gate

Construct every form-field with `showErrorsBeforeTouched: true` so lite-form's
`validateOn` is the ONLY reveal gate. Leaving the default (`false`) while lite-form
also reveal-gates double-gates the error -- it shows only once lite-form reveals AND
form-field's `touched` flips, so a 409 painted through the validator would appear
late or never. See `docs/recipes/lite-form-field.md` for the full treatment.

## See also

- `docs/recipes/lite-form-server-data.md` -- the read path: refresh mid-edit + the
  conflict list.
- `docs/recipes/lite-form-field.md` -- the one-reveal-gate wiring.
- `docs/decisions/0009-server-data-recipes-and-the-zero-source-ruling.md` -- the
  zero-source ruling and the one-gate law extended to submit.
- lite-form's `llms.txt` -- `toPatch()`, `submit(ev, { patch })`, the submit
  lifecycle, and the "server errors without setFieldError" pattern.
