# ADR 0009: server-data form recipes and the zero-source ruling

- Status: Accepted
- Date: 2026-09-07
- Scope: `docs/recipes/lite-form-server-data.md`,
  `docs/recipes/lite-form-patch-submit.md`,
  `test/lite-form-server-data.test.js`, `test/lite-form-patch-submit.test.js`,
  `llms.txt` (recipe enumeration)
- Session: H13 (finding LH-11) -- the LAST session of the H8-H13 roadmap

## Context

`@zakkster/lite-form` 1.3.0 shipped a server-data engine -- the merge
`reinitialize(next, policy)`, `toPatch()` / patch submit, and a strict-false
`isValid` while any async check is pending -- with `createFormField` and
`createButton` as the intended landing consumers. lite-headless had NO documented
composition for any of it (LH-11), so every integrator improvised: how a focused
draft survives a poll tick, how a conflict list is painted, how a minimal patch is
posted, and how the busy submit button is driven. This ADR records the three
rulings made before writing the recipes, plus the conflict-row mapping law the
recipes lean on.

## Decision R1 -- refresh-while-editing safety is BY CONSTRUCTION

A focused input's draft is a dirty overlay. `reinitialize(next, policy)` in the
default (non-source) mode NEVER overwrites a dirty conflict: the draft stays
visible, the baseline re-seeds underneath, and the whole merge lands in one batch
with exactly one `baselineRev` bump (no transient adopt-then-restore flicker).
This safety is lite-form's, proven by lite-form's own suite -- the recipe DOCUMENTS
it, it does not defend it. The recipe owns only the AFTERMATH: paint the conflict
list from `toPatch()` and offer per-row keep-mine (a no-op) vs. take-server
(`field.reset()`). No debounce-the-merge, no "is the field focused" guard, no
snapshot-and-restore -- every one of those would be re-implementing an invariant
the engine already guarantees.

## Decision R2 -- the one-gate law, extended to submit

lite-form's `isValid` is strict-false while any async check is pending, so
`submit()` already refuses (returns `false`, never calls `onSubmit`) during
validation. That is the SOLE authority. The busy submit button's
`disabled` / `aria-busy` / `data-loading` is a MIRROR of
`form.isSubmitting() || form.isValidating()`, painted so the user sees WHY -- it is
NEVER an independent `if (...) return` in the submit handler. `createButton`'s own
`canPress()` gate (`src/button/index.js:96,150`) already blocks a JS-dispatched
click while loading; stacking a handler guard on top would be the double-gate
footgun ADR 0007 D2 ruled out, now extended from the reveal lane to the submit
lane. Per-field `isSubmitting` does NOT exist -- `isSubmitting` is form-level only
(lite-form llms.txt:110); the per-field pending signal is `isValidating`
(:86). The busy wire reads BOTH: `form.isSubmitting() || form.isValidating()`.

## Decision R3 -- the zero-source ruling (docs + tests only, no 1.10.0 bump)

Every painted state and interaction these recipes need already has a seam:

- pending spinner: form-field `_pending` -> `data-validating` (root) + `aria-busy`
  (control), `src/form-field/index.js:148,214` (H11)
- stale error stays visible during re-validation: `showsError()` orthogonal to
  pending, `index.js:76-80` (ADR 0007 D1)
- 409 error text + describedby: `attachErrorText` paint effect,
  `index.js:270-289`, fed by a caller-owned `serverErrors` signal read inside a
  `validate`r (lite-form llms.txt:407)
- busy submit button: `createButton.setLoading` -> `src/button/index.js:132-144`;
  its `canPress()` gate (:96) already blocks double-submit
- conflict list + keep/take: plain DOM + `form.toPatch()`; take = `field.reset()`,
  keep = no-op
- per-field "conflict" paint: the consumer sets its OWN `data-conflict` on the
  form-field root; `attachRoot`'s effect only toggles its five attrs
  (`index.js:143-149`), so a consumer-owned `data-conflict` is never clobbered

Because the recipes need ZERO new code, H13 ships NO source change, NO
`types.d.ts` change, NO `api-surface-snapshot.json` regen, NO CSS appendix regen,
and NO version bump. The 1.10.0 slot ships docs + tests + this ADR and RIDES the
next release rather than forcing an empty minor. A `setConflict` /
`data-conflict` hook was explicitly REJECTED: conflict is not a validity state, it
would be public surface with exactly one caller, and the consumer can own the
attribute directly with no clobber. If a future recipe finds itself needing to
edit `src/`, that is the signal the design is wrong -- STOP and re-open the ruling.

## The conflict-row mapping law

After a merge, `toPatch()` returns `[{path, from, to}]` for exactly the dirty
paths. In the POST-MERGE window `from` is the SERVER value (the baseline
re-seeded underneath the conflict) and `to` is the user's draft
(lite-form llms.txt:104). So a conflict row renders straight off the patch entry
with NO side bookkeeping:

- the "server says" cell reads `entry.from`
- the "your edit" cell reads `entry.to`
- take-server = `form.field(entry.path).reset()` -- lands `from`, and (because
  `reset()` clears touched) drops `data-touched`
- keep-mine = a no-op -- the draft already masks the server value; the patch entry
  stays until the user submits or resets

`toPatch()` is untracked and read-only, safe to call inside an effect. Object
leaves are deep-copied on both sides, so `Object.is(n, d)` always fails for them
under the default policy -- an object-valued field needs a STRUCTURAL policy
(compare by content) or every refresh reports a phantom conflict.

## Consequences

- Public surface is UNCHANGED. `test/api-surface.test.js` passes against an
  untouched `api-surface-snapshot.json` (that is assertion A9); `types.d.ts` is
  byte-identical.
- No new torture window: the recipes drive existing seams (form-field pending
  paints per async settlement, not per keystroke; the merge/patch calls are not
  keystroke-class hot paths), and zero-source means no primitive to churn. The
  existing GATE line is unchanged.
- Both recipe tests import the PUBLISHED `@zakkster/lite-form` devDep via a bare
  specifier (resolves to 1.4.0), never a relative or symlinked path -- same law as
  H11 (assertion A10).
- Two recipe files, 1:1, cross-linked -- they answer different integrator
  questions (refresh aftermath vs. write path). Combining them would bury the
  patch lane behind the merge table.
