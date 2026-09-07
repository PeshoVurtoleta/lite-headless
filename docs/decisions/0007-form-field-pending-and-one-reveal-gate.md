# ADR 0007: form-field pending state and the one-reveal-gate law

- Status: Accepted
- Date: 2026-09-07
- Scope: `src/form-field/index.js`, `src/form-field/element.js`,
  `docs/recipes/lite-form-field.md`, the form-field pending surface
  (pending / setPending / data-validating / aria-busy)
- Session: H11 (findings LH-05, LH-06)

## Context

`@zakkster/lite-form` 1.3.0 shipped per-field `isValidating` (true exactly while
the LATEST async check is unsettled; sync-only fields share one frozen `false`),
designed with `createFormField` as the intended landing consumer. lite-headless
had no surface for it (LH-05: form-field painted valid / errorMessage / required /
touched / showsError only), and no documented wiring between the two libraries
(LH-06: every integrator improvised the error-lane bridge). This ADR records the
two rulings made before coding the seam.

## Decision 1 -- showsError x pending are ORTHOGONAL

`pending` does NOT touch `showsError()`. When a re-validation is pending, the
last known revealed error stays visible and the spinner paints beside it via
`data-validating` (root) + `aria-busy` (control). `showsError()`
(`src/form-field/index.js`) is left byte-unchanged.

Rationale: while the latest async check is unsettled, the last known error is
still the truth. Blanking it on entering pending would flash a false
"resolved / valid" impression, then snap the error back when the check settles.
lite-form's own async ordering law keeps the stale error until the LATEST
settlement lands (stale settlements are dropped whole -- no early flash, no
silent validity), so the honest paint is: stale error + spinner, together.

## Decision 2 -- one reveal gate; form-field DEFERS to lite-form

Exactly ONE reveal gate exists in the paired system. The recipe constructs
form-field with `showErrorsBeforeTouched: true` so form-field does NOT re-gate on
its own `touched` flag; the single reveal gate is lite-form's `validateOn`
("change" | "blur" | "submit"). Wiring:

- `ff.setValid`   <- driven by the reveal-gated `field.error()` (null => valid)
- `ff.setTouched` <- driven by `field.touched()`
- `ff.setPending` <- driven by `field.isValidating()`

FOOTGUN (named in the recipe prose): leaving form-field at
`showErrorsBeforeTouched: false` (the default) while lite-form ALSO reveal-gates
double-gates the error -- it hides until BOTH lite-form reveals its error AND
form-field's `touched` flag is set, so errors appear late or never. Pick ONE
gate; when paired with lite-form, that gate is lite-form's.

`submit()` self-refuses while any check is pending because lite-form's `isValid`
is strict-false during validation -- the consumer paints WHY (the pending state),
it does NOT add a second submit gate.

## Decision 3 -- no defaultPending option, no onPendingChange callback

`pending` is a transient async state driven ENTIRELY by `setPending`, never
consumer-configured at construction. This deliberately deviates from the
`default*`-per-signal + `on*Change`-callback pattern the other four state signals
(valid / errorMessage / required / touched) follow: a default or a change
callback for pending would be public surface with no use -- there is no
meaningful "initial validating" state to seed, and a consumer that needs to react
to pending already owns the async source driving it (e.g. lite-form's
`field.isValidating`, itself a signal). `reset()` sets pending back to false.

## Paint / zero-alloc discipline

- `data-validating` on the ROOT: added to `attachRoot`'s existing single effect
  (one `_pending()` read), removed in that attach's `off()`.
- `aria-busy` on the CONTROL: its OWN effect in `attachControl`, mirroring
  `stopAriaRequired`; always `"true"` / `"false"` string literals (zero alloc),
  like the sibling `aria-invalid` / `aria-required`; removed in `off()`.

Both effects re-run per async settlement (a `setPending` flip), not per keystroke
-- not a keystroke-class hot path. No template concat, no array/spread; attr
names and the two literals are the only strings. `setValid` / `setTouched` /
`setRequired` gain nothing.

## H-12 seal

`destroy()` seals `_pending` alongside the other four owned signals: the pooled
node returns to the registry, reads freeze at the final value, and `setPending`
after destroy is a silent no-op.

## Element mapping

`validating` is an observed INPUT attribute on `<lite-form-field>` -> `setPending`
(mirrors `required`). The painted OUTPUT is `data-validating` on the host via
`attachRoot` (mirrors `invalid` vs `data-invalid`). The initial state is seeded
once after the instance is created; there is no new event (pending has no
callback, matching Decision 3).

## Consequences

- The public surface grows additively: `pending`, `setPending`, `data-validating`,
  `aria-busy`, the `validating` element attribute, and `host.pending` /
  `host.setPending`. No existing behavior changes.
- No new torture window: pending flips per async settlement, not per keystroke,
  so it is not a gated hot path (SOFT). Its zero-alloc property is enforced by
  review (literals only) and its retention/seal by the existing Phase A churn.
- No lite-form change (one package at a time). The seam consumes lite-form's
  published surface exactly as an integrator installs it; the recipe test imports
  the PUBLISHED devDep, not a symlink.
