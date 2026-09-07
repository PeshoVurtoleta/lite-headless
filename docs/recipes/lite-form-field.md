# Recipe: async-validated field -- lite-form + form-field, the one-reveal-gate wiring

Cross-package: [`@zakkster/lite-form`](https://www.npmjs.com/package/@zakkster/lite-form)
(state + validation engine) + `@zakkster/lite-headless/form-field` (ARIA + paint).

lite-form owns the value, runs the validators (sync AND async), and decides WHEN
an error is allowed to show (`validateOn`). form-field owns the DOM: label.for,
control.id, the aria-describedby chain, aria-invalid, aria-required, aria-busy,
and the painted `data-*` state. This recipe wires an ASYNC-validated field (e.g.
a "username already taken" check) so the field paints a spinner while the check
is in flight, keeps the last error visible during a re-validation, and lets
`submit()` refuse by itself while any check is pending.

Verified against PUBLISHED lite-form `^1.3.0` (installs 1.4.0). The seam and
every assertion below are exercised in `test/lite-form-field.test.js` and ruled
in `docs/decisions/0007-form-field-pending-and-one-reveal-gate.md`.

## Install

    npm i @zakkster/lite-form @zakkster/lite-signal @zakkster/lite-project @zakkster/lite-headless

`@zakkster/lite-project` is a static peer of lite-form (its projection engine) --
install it even if you never pass `source`.

## The one reveal gate

There is exactly ONE reveal gate in the paired system, and it is lite-form's
`validateOn` ("change" | "blur" | "submit"). form-field is constructed with
`showErrorsBeforeTouched: true` so it does NOT re-gate on its own `touched` flag
-- it paints whatever lite-form has already decided to reveal.

    ff.setValid   <- reveal-gated field.error()   (null => valid)
    ff.setTouched <- field.touched()
    ff.setPending <- field.isValidating()

> [!WARNING]
> **The double-gate footgun.** Leaving form-field at the DEFAULT
> `showErrorsBeforeTouched: false` while lite-form ALSO reveal-gates hides the
> error behind BOTH gates: it shows only once lite-form reveals AND form-field's
> `touched` flips true -- so errors appear late or never. Pick ONE gate. When you
> pair with lite-form, that gate is lite-form's: set
> `showErrorsBeforeTouched: true` and drive `ff.setValid` from the already-gated
> `field.error()` (never from `field.rawError()`).

## The wiring

    import { createForm }      from "@zakkster/lite-form";
    import { createFormField } from "@zakkster/lite-headless/form-field";
    import { effect }          from "@zakkster/lite-signal";

    // 1. lite-form: value + validators. The async lane is `validatorsAsync`;
    //    lite-form has NO timers -- debounce is caller-side via `asyncSources`
    //    + @zakkster/lite-debounce (see below). The default async trigger is the
    //    field's own value.
    const form = createForm({
        initialValues: { username: "" },
        validators: {
            username: (v) => (v ? null : "Username is required"),   // sync, instant
        },
        validatorsAsync: {
            username: async (v) => {
                if (!v) return null;                                 // sync lane owns "required"
                const res = await fetch("/api/username-free?u=" + encodeURIComponent(v));
                const { free } = await res.json();
                return free ? null : "That username is taken";
            },
        },
        validateOn: "change",
        onSubmit: async (vals) => {
            await fetch("/api/signup", { method: "POST", body: JSON.stringify(vals) });
        },
    });

    // 2. form-field: ARIA + paint. Defer the reveal gate to lite-form.
    const ff = createFormField({ showErrorsBeforeTouched: true });
    ff.attachRoot(rootEl);
    ff.attachLabel(labelEl);
    ff.attachControl(inputEl);
    ff.attachHelperText(helperEl);
    ff.attachErrorText(errorEl);

    // 3. the three bridges.
    const field = form.field("username");

    effect(() => {                       // validity + message (reveal-gated)
        const e = field.error();         // null until lite-form's gate opens
        ff.setValid(e == null, e);
    });
    effect(() => { ff.setTouched(field.touched()); });
    effect(() => { ff.setPending(field.isValidating()); });   // spinner lane

    // 4. value binding (lite-form owns the value).
    inputEl.value = field.value();
    inputEl.addEventListener("input", (ev) => field.set(ev.target.value));
    inputEl.addEventListener("blur",  () => field.blur());

## What paints, and when

`ff.setPending(field.isValidating())` drives two zero-alloc attributes:

- `data-validating` on the ROOT -- style a spinner with `[data-validating]::after`.
- `aria-busy="true"` on the CONTROL -- announces "busy" to assistive tech.

`field.isValidating()` is true exactly while the LATEST async check is unsettled.
A sync-only field (no `validatorsAsync`) shares lite-form's single frozen `false`,
so wiring `ff.setPending` unconditionally is safe -- it simply never paints.

    /* demo CSS */
    [data-validating] .control::after { content: ""; /* spinner */ }
    [data-shows-error] .error { display: block; }

## The stale error stays visible during a re-validation

When the user edits a field that already shows an error, the new async check goes
pending -- but lite-form keeps the last revealed `field.error()` until the LATEST
check settles (stale settlements are dropped whole: no early clear, no flash of a
false "valid"). Because form-field's `setPending` is ORTHOGONAL to `showsError()`
(ADR 0007 decision 1), the spinner paints BESIDE the stale error rather than
blanking it. The user sees "That username is taken" + a spinner, then the error
updates or clears exactly once the new check settles.

## submit() refuses by itself while pending -- do NOT add a second gate

lite-form's `isValid` is STRICT-FALSE while any check is pending, so `form.submit()`
returns `false` and never calls `onSubmit` during validation. The consumer's job
is to paint WHY, not to add a second submit gate:

    formEl.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const ok = await form.submit();   // false while pending OR invalid
        if (!ok && form.field("username").isValidating()) {
            // optional: surface "still checking..." -- submit already refused
        }
    });

`submit()` also flips `submitAttempted`, force-revealing every field's error
regardless of `validateOn` -- so a user who hits submit early sees all errors at
once, painted through the same single gate.

## Debounce the async lane (caller-side)

lite-form ships no timers on purpose. To debounce the network check, wrap the
async trigger with `asyncSources` + `@zakkster/lite-debounce`:

    import { debounce } from "@zakkster/lite-debounce";

    createForm({
        // ...
        asyncSources: {
            username: (fld) => debounce(() => fld.value(), 300),
        },
    });

The sync `validators.username` still runs instantly (required check); only the
network `validatorsAsync.username` waits for the debounce.

## See also

- `docs/decisions/0007-form-field-pending-and-one-reveal-gate.md` -- the rulings.
- `src/form-field/llms.txt` -- the pending/setPending surface and painted attrs.
- lite-form's `llms.txt` -- the async ordering law and the submit lifecycle.
