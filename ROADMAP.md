# lite-headless -- enriched roadmap (H8-H13)

Six sessions continuing the package's own H-numbering (H1-H7 shipped 1.0.0
through 1.5.0). lite-headless is a HEALTHY package: 59 ARIA-correct primitives,
1633 node:test cases + playwright + type tests, an api-surface snapshot gate
with a may-only-shrink undocumented allowlist, per-primitive llms.txt, an
H-numbered ruling system, and a torture gate with a control mode. Nothing here
is a rescue. What this roadmap does is (a) close the gap between what the gate
CLAIMS and what it can SEE, (b) pay the package's own recorded debts, and
(c) land the integration seams the rest of the suite needs (lite-query async
options; the lite-form 1.3.0 forms seam -- H11 + H13, a parallel forms track
added 2026-09-06 when lite-form 1.3.0 shipped its S3).

**Evidence discipline.** Unlike the lite-form roadmap, the findings below were
NOT reproduced by live probe. Each is tagged: [self] = the package's own
changelog/llms records it as deferred; [inspected] = verified by reading the
live tree on 2026-09-06 (file:line cited); [registry] = verified by direct npm
registry query on 2026-09-06. Every session opens by REPRODUCING its findings
before fixing them -- a finding that does not reproduce is retired with an ADR
line, not silently skipped.

| Axis | State |
| --- | --- |
| **Publishing** | Good. files[] correct, sideEffects false, per-primitive subpath exports + types, CHANGELOG cadence active, 1.5.0 on npm. One drift: the npm description says "58 ARIA-correct factories"; 1.5.0 shipped the 59th (LH-08). |
| **Correctness (shallow)** | Strong. 1633 tests, playwright browser lane, type tests, api-surface snapshot diffed both directions, ascii-law test, exact-pixel positioner contract. |
| **Correctness (adversarial)** | Two self-recorded fail-open edges: per-CALL option bags unvalidated (their H-04b) while construction bags throw with did-you-mean; 3 dangling type re-exports alive only under skipLibCheck. |
| **Gate** | The weak axis. Phase A (lite-leak retention) + Phase B (checkNoGc, maxMajor 0 / maxPause 4ms) cover exactly TWO hot paths (slider update, positioner tick) out of 59 primitives' worth -- and BOTH lanes are structurally blind to per-op transient garbage (the suite-wide lesson that falsified lite-project 1.4.0 at ~40 B/op and exposed 47x debt in lite-store). "Zero-GC hot paths" ships in the npm description with no witness that can see the class. One control exists (TORTURE_CONTROL=1); it flips only the lanes that are blind. |
| **Ecosystem fit** | Value-lane lite-form integration documented (README composability, datepicker llms). The error lane and the lite-form 1.3.0 async-validation lane (shipped 2026-09-06) have no landing surface (form-field has no pending state), and the 1.3.0 server-data surface (merge reinitialize, patch submit) has no recipe (LH-11). Combobox async/remote options -- the lite-query pairing its own docs gesture at -- is recorded deferred. |

The one sentence this roadmap turns on:

> **The primitives are ahead of their gate. Fifty-nine hot paths are vouched
> for by a witness that watches two of them through lanes that cannot see the
> dominant failure class. Port the transient witness first; every later
> session then inherits a gate that can call its bluff.**

---

## 1. Scope check (verified 2026-09-06)

| Package | Role | State |
| --- | --- | --- |
| `@zakkster/lite-signal` | required peer `^1.2.0` (devDep `^1.2.2`) | Works today; the floor predates the 1.5.0 owner API (`createRoot`/`runWithOwner`). Any future feature that lazily allocates signals under a live tracking context hits the LF-04 zombie class without it (LH-09). No session below needs the raise; the first one that does raises it deliberately. |
| `@zakkster/lite-element` | optional peer `^1.0.0` | */element wrappers only. Untouched by this roadmap. |
| `@zakkster/lite-floating` | optional peer `^1.1.0` | hover-card + floating-adapter. Untouched. |
| `@zakkster/lite-observe` | optional peer `^1.0.1` | transitive via lite-floating. Untouched. |
| `@zakkster/lite-form` | ecosystem, not a dep | 1.3.0 SHIPPED (S3 complete 2026-09-06): per-field/form `isValidating`, `validatorsAsync` + `asyncSources`, merge `reinitialize(next, policy)`, `reconcile`, `submit(ev, {patch:true})`. Registry visibility is re-verified fail-closed at every forms-track session start -- the H11/H13 gate. |
| `@zakkster/lite-query` | ecosystem, not a dep | catalog says 2.2.0; VERIFY on npm at H10 start before any recipe test imports it (devDep only if a test does). |
| happy-dom `^15.11.0` (pinned), playwright, typescript `^5.9.3`, `@zakkster/lite-gc-profiler` `^1.16.0`, `@zakkster/lite-leak` `^1.10.0` | dev stack | The torture harness sets up happy-dom ONCE (test/torture.mjs:45). See the trap in section 4. |

STYLEGUIDE.md is in-repo and binds naming/conventions; every session's coder
reads it before writing. api-surface-snapshot.json is regenerated ONLY via
`npm run api:update` and its `undocumented` allowlist may only shrink.

---

## 2. Shared law (holds every session)

1. **A claim without a witness does not ship.** After H8, "zero-GC hot path"
   means: gated by the V8 new-space transient witness, not only by pool
   census, GC-observer rules, or retention trackers -- those lanes are blind
   to per-op transient garbage (suite-wide ruling; see the lite-form /
   lite-project / lite-store harnesses for the ported pattern).
2. **Fail closed on every unverified input.** Construction bags already throw
   with a did-you-mean hint; H9 extends the same contract to per-call bags.
   Silently ignored input is the bug class this suite exists to kill.
3. **The api-surface snapshot is the export law.** Every live export is
   declared in its own subpath's `declare module` block or pinned in the
   shrinking allowlist. H9 drives the allowlist to zero and makes the
   dangling-re-export class impossible under `skipLibCheck: false`.
4. **Additive only.** Every session below is additive on the public surface.
   A behaviour flip (H9's per-call throws) is a minor with each changed call
   site named in the CHANGELOG.
5. **Recipes may only grow downward.** When a primitive lands that a recipe
   hand-rolled (H12 checkbox), the recipe is refactored to consume it -- a
   recipe must never contradict the catalog.
6. **One package at a time.** H11 composes with lite-form but changes only
   lite-headless; anything lite-form must add belongs to lite-form's own
   roadmap and blocks, not bends, this one.

---

## 3. Findings

| ID | Sev | Evidence | Finding |
| --- | --- | --- | --- |
| **LH-01** | **S2 (gate)** | [inspected] test/torture.mjs:10-15, 45 | **The transient witness is missing and coverage is 2/59.** Phase B drives slider updates + positioner ticks under `checkNoGc({maxMajor:0, maxPauseMs:4})`; Phase A is lite-leak retention. Neither lane can see per-op transient allocation, and 57 primitives' hot paths (combobox/pin-input/stepper/time-picker keystrokes, kanban/sortable/split-panels drags, toast churn) are not driven at all. Precedent says the witness finds real defects (lite-project ~40 B/op; lite-store 47x). |
| **LH-02** | S2 | [self] CHANGELOG 1.1.x block ("deferred as H-04b") | **Per-call option bags unvalidated** (`toast.show`, `notificationCenter.add`, tour steps, sortable/kanban payloads, per-item `attach*` opts) while construction bags fail closed. |
| **LH-03** | S3 | [self] CHANGELOG 1.4.0 block | **Declaration parity debt**: 32 live exports typed nowhere (10 color-picker math, 18 datepicker helpers, avatar x2, `buildItems`, `DIALOG_OPTION_KEYS`) held in the allowlist; 3 dangling barrel re-exports survive only under `skipLibCheck`; the DIALOG_OPTION_KEYS public-or-not ruling is open. |
| **LH-04** | S3 (feature) | [self] src/combobox/llms.txt:86 | **Combobox async surface deferred**: `filter`, `loading`, `onQueryChange`, remote options (out of H7 G-01's slice). |
| **LH-05** | S3 (feature) | [inspected] src/form-field/llms.txt | **form-field has no pending state** (valid/errorMessage/required/touched/showsError only). lite-form 1.3.0's per-field `isValidating` will have no landing surface (aria-busy, `data-validating`). |
| **LH-06** | S3 (docs) | [inspected] README + docs/recipes/ | **Error-lane wiring to lite-form undocumented.** The value lane is documented; `field.error/touched -> setValid/setTouched` is not, and the two reveal systems (`validateOn` vs `showErrorsBeforeTouched`) fight if wired naively. |
| **LH-07** | S3 (feature) | [inspected] exports map vs APG/ecosystem | **Canon primitives absent**: standalone select/listbox (combobox is the editable pattern only), checkbox (+group, indeterminate -- currently hand-rolled inside two recipes). Lesser: context-menu, menubar, scroll-area. |
| **LH-08** | S3 (docs) | [registry] 2026-09-06 | **npm description says "58 ARIA-correct factories"**; 59 shipped in 1.5.0. Description edits change the npm listing -- deliberate edit at the next publish. |
| **LH-09** | S3 (note) | [inspected] package.json:521 | lite-signal peer floor `^1.2.0` predates the owner API; fine today, a trap for any future lazy-alloc-under-effect feature. Raise only when a session needs it. |
| **LH-10** | S3 (ledger) | [inspected] grep over repo | **G-03 is unaccounted**: of H7's gap ledger, G-01/04/10 shipped, G-02/05-09/12 became recipes, G-11 landed inside crud-list-page -- G-03 appears nowhere in the repo. Its content exists only in the out-of-repo H7 brief. Recover it or retire the number formally. |
| **LH-11** | S3 (docs) | [inspected] docs/recipes/ vs lite-form 1.3.0 CHANGELOG, 2026-09-06 | **The lite-form 1.3.0 server-data surface has no lite-headless landing.** lite-form now ships merge `reinitialize(next, policy)` (drafts survive a server refresh), `toPatch()` / `submit(ev, {patch:true})` (minimal-diff submit), `reconcile`, and strict-false-while-pending submit -- and no recipe shows a headless form surviving a refresh mid-edit, painting the conflict list, posting the minimal patch, or gating the submit button on `isSubmitting`/`isValidating`. |

---

## 4. The torture upgrade (H8 spec) -- and the happy-dom trap

Port the suite's transient witness (the lite-store/lite-form harness pattern):
`newSpaceUsed()` via `v8.getHeapSpaceStatistics()` and `allocTotal(fn, ops,
warmup)` -- warmup, `gc()`, sample, run the synchronous loop, sample; negative
delta means a GC ran mid-window and the measurement is VOID (die, shrink ops).

**The trap this package has that the DOM-free packages did not:** the torture
harness runs under happy-dom, and happy-dom is a JS DOM -- every event
dispatch, attribute write, and layout-ish query it services allocates on the
SAME heap the witness reads. A window that drives an attached primitive
measures the primitive PLUS happy-dom. Therefore every measured path is
classified, permanently, as one of:

- **ENGINE window** -- drives the handle's state machine with no DOM event in
  the loop (`setOpen` toggle where legal, `selectIndex`/highlight moves,
  stepper spin on a detached value lane, pin-input digit accept, time-picker
  segment spin). GATED at the suite constant `<= 16384 B / 50,000 ops` once
  measured clean; a dirty engine window is a REAL defect (pay it down in H8
  or record it as a numbered finding with the ratchet pinned at measured).
- **DOM window** -- the loop necessarily crosses happy-dom (slider drag via
  synthesized pointer events, positioner update tick, overlay open/close with
  focus trap, toast show/dismiss). RECORDED, not gated at zero: the recorded
  number is `primitive + happy-dom floor`, and the floor is measured once by
  an empty-op calibration window and documented beside every DOM number
  (the lite-form "fixed window floor" precedent). Ratchet at measured + noise
  so regressions still fail.

Aria attribute writes on keystroke-class paths deserve suspicion on sight:
`setAttribute("aria-valuenow", String(v))` allocates a string per op by
construction. Where the string is unavoidable (it is DOM), the cost lands in
the DOM window's recorded number; where a code path allocates scratch beyond
the unavoidable string (template concat, array spread, options re-read), that
is H8 paydown material. `Intl.NumberFormat.format` in stepper display is in
the same class: measure, attribute, record; never wave through.

**Controls:** keep TORTURE_CONTROL=1 and add the transient control -- a
per-iteration TRANSIENT allocation (dead garbage, retained by nothing) inside
a gated engine window. Phase A cannot see it (nothing retained), Phase B's
checkNoGc may not see it (scavenges are legal) -- the witness MUST kill it.
Marker: `"h8 transient witness sees"`. A gate that cannot fail is not a gate,
and a NEW lane that the OLD controls already flip proves nothing.

---

## 5. Session order

```
main lane                              forms track (parallel lane)
H8 ---> H9 ---> H10 ---> H12           H11 ---> H13
 |       |        |       |             |         |
1.5.1  1.6.0   1.7.0    1.9.0          1.8.0    1.10.0
gate   fail-   combobox  canon         form     server-data
truth  closed  async     prims         seam     recipes
                                       gate: lite-form >= 1.3.0
                                       registry-visible (verify at start)
```

H8 blocks the MAIN lane: every later session's "zero-GC" claim is
unwitnessable until the lane exists, and H8's re-baseline may itself produce
the next session's paydown list. H9 is the fail-closed brand. H10 is the
biggest user-visible feature and the lite-query pairing. H12 is elective
breadth.

**The forms track (H11 -> H13) is a parallel lane**, added 2026-09-06 when
lite-form 1.3.0 shipped its S3 (merge reinitialize, async validation lane,
patch submit): startable immediately, independent of H8-H10, so lite-headless
forms work can run while lite-form's own roadmap continues on its side. Two
rulings make the lane legal:

1. **H8 is SOFTENED for this track only.** H11's old `depends_on: [H8]` is
   downgraded to soft ordering: pending-state wiring flips per async
   settlement, not per keystroke -- it is not a keystroke-class hot path, so
   it does not need the transient witness to ship honestly. Whatever the
   forms track adds enters the H8 window ledger when H8 lands, like every
   other pre-H8 surface. The hard gate stays and is fail-closed: lite-form
   >= 1.3.0 must be registry-visible, verified at session start with a
   cache-busted query -- not visible means the session does not start.
2. **Version slots are claimed at ship time.** Each brief's version_target
   assumes the default order; whichever session actually ships next takes
   the next free version (patch for H8, minor for the rest), and this file
   records the actual beside the slot after each /release. Two lanes, one
   ladder, no collisions.

Load-bearing orderings: H8 -> H9 (per-call validation must be written
against witnessed hot paths so the validation itself proves allocation-free)
and H11 -> H13 (the server-data recipes consume H11's pending paint and its
one-reveal-gate wiring). H12 is independent of everything but H8.

---

## 6. The briefs

===============================================================================
# H8 -- lite-headless v1.5.1 -- the gate learns to see
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.5.1 (escalates to 1.6.0 ONLY if a paydown forces an API change -- record the ruling)
findings: [LH-01, LH-08]
depends_on: []
blocks: [H9, H10, H11, H12]
---

# the witness port and the re-baseline

PURPOSE
  The gate watches 2 of 59 primitives through lanes that cannot see per-op
  transient garbage. Port the suite witness, classify every measured path as
  ENGINE (gated) or DOM (recorded over a calibrated happy-dom floor), pay
  down what the new lane finds where the fix is local, and re-baseline the
  package's zero-GC claims on numbers that can fail.

TASKS
  - Harness: newSpaceUsed()/allocTotal() with the void-measurement guard
    (negative delta = GC ran = die), warmup discipline, calibration window
    measuring the happy-dom empty-op floor once per run.
  - Windows, per section 4: engine class (combobox highlight/selectIndex,
    stepper spin, pin-input digit, time-picker segment spin, setOpen toggle
    where DOM-free is honest) GATED <= 16384 B / 50k ops; DOM class (slider
    drag tick, positioner update, dialog/popover open-close incl. focus
    trap, toast show/dismiss churn) RECORDED with the floor documented.
  - Pay down what the witness finds when the fix is local (hoist closures,
    reuse scratch, kill spreads); a non-local finding gets an LH number, a
    pinned ratchet, and a line here -- never a silent waiver.
  - The transient control (marker "h8 transient witness sees") proving the
    new lane catches what Phase A/B cannot. Existing TORTURE_CONTROL kept.
  - GATE line extended with transient= fields per window class.
  - LH-08: description "58" -> "59 ARIA-correct factories" (npm listing
    edit, deliberate). CHANGELOG entries for every recorded number.

ASSERTIONS
  - Torture prints ok exit 0 with the new lane live; the transient control
    exits non-zero with its marker; TORTURE_CONTROL still fails.
  - Every engine window <= 16384 B / 50k; every DOM window recorded with the
    floor beside it; the calibration floor itself is printed on the GATE line.
  - Paydowns: byte-identical public semantics, proven by the untouched 1633
    fast tests + playwright lane.

NON-GOALS
  No API change (escalation rule above). No new primitives. No per-call bag
  validation (H9). No peer floor moves.

DONE WHEN
  every zero-GC claim in README/llms is backed by a window that can fail,
  the recorded-vs-gated split is documented, and the paydown ledger is empty
  or numbered
```

===============================================================================
# H9 -- lite-headless v1.6.0 -- fail-closed completion + declaration parity
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.6.0
findings: [LH-02, LH-03, LH-10]
depends_on: [H8]
---

# per-call bags throw; the allowlist reaches zero

PURPOSE
  Finish the package's own two recorded debts. Per-call option bags get the
  same did-you-mean fail-closed contract construction bags already have
  (their H-04b). The 32-export undocumented allowlist goes to zero, the 3
  dangling re-exports die structurally, and DIALOG_OPTION_KEYS gets its
  public-or-not ruling. Minor bump: throws where input was silently ignored.

TASKS
  - H-04b: validate toast.show / notificationCenter.add / tour steps /
    sortable+kanban payloads / per-item attach* bags. Zero-alloc validation
    on hot-adjacent paths (frozen key sets, own-key for-in scan -- no
    Object.keys, no spread), witnessed by the H8 windows (toast.show gets
    one if it lacks one).
  - Declaration parity: type the 32 or demote them (the ruling, per export
    family); fix types.d.ts:56/:80 dangling re-exports; add a type-test
    entry that compiles under skipLibCheck:false so the class cannot
    return; rule DIALOG_OPTION_KEYS (lean: internal -- it is a cross-module
    validation seam, not consumer API; record either way).
  - LH-10: recover G-03 from the H7 brief (ask the maintainer) or retire
    the number with an ADR line. A ledger with a hole is not a ledger.
  - CHANGELOG names every call site whose behaviour changed.

ASSERTIONS
  - Every per-call bag path: unknown key -> TypeError with did-you-mean;
    null/non-object -> TypeError; undefined/omitted legal. One test per
    bag, plus one hostile fuzz sweep reusing the construction-bag suite.
  - npm run types green with skipLibCheck:false on the type-test entry;
    api-surface snapshot undocumented allowlist === [].
  - H8 windows unmoved (validation added zero bytes to gated paths).

NON-GOALS
  No new options, no new primitives, no async surface (H10).

DONE WHEN
  no input path in the package silently ignores what it is handed, and the
  export surface is 100% declared
```

===============================================================================
# H10 -- lite-headless v1.7.0 -- combobox async (the G-01 completion)
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.7.0
findings: [LH-04]
depends_on: [H8]
---

# filter, loading, onQueryChange, remote options

PURPOSE
  Ship the surface H7 G-01 recorded as deferred (src/combobox/llms.txt:86):
  sync filter, loading state, query-change notification, and the remote-
  options pattern -- the lite-query pairing the ecosystem docs already
  gesture at. Both select modes (single + 1.5.0 multiple) covered.

DECISIONS TO RECORD (session ADR, before coding)
  - Option-set generations: an async replace stamps a generation; commit
    (Enter/click) against a SUPERSEDED generation is a no-op, never a
    selection from a list the user is no longer looking at (the lite-form
    S3 stale-seq law, transposed). Highlight preservation policy across
    replaces (by value identity, else reset) pinned and tested.
  - loading is a signal + painted data-loading + aria-busy on the listbox;
    loading NEVER blocks typing or dismiss (fail-open UI is the bug;
    fail-closed means the COMMIT is guarded, not the keyboard).
  - filter is a sync predicate option running per keystroke: zero-alloc
    (reused visible-index buffer, no array method chains); async filtering
    IS the remote pattern -- filter and remote options are exclusive,
    enforced with a construction TypeError.
  - onQueryChange fires once per committed input mutation, never
    re-entrantly; remote flow: onQueryChange -> caller fetches (lite-query
    recipe) -> setOptions(next) with generation semantics.

TASKS
  - The four options + setOptions/generation machinery; multiple:true
    parity; painted attributes per the CSS contract (appendix regenerated).
  - H8 windows extended: filter keystroke (engine, gated), option-replace
    (DOM, recorded).
  - docs/recipes/ gains combobox-remote-options (lite-query devDep ONLY if
    the recipe test imports it; verify its npm floor first).
  - Per-primitive llms.txt rewritten; the deferred paragraph deleted.

ASSERTIONS
  - Stale-generation commit proven impossible under a seeded interleaving
    fuzz (type/replace/commit shuffles); highlight policy truth-table.
  - Filter keystroke window gated <= 16384 B / 50k ops.
  - Single-select hot paths byte-unchanged when the new options are absent
    (the 1.5.0 off-cost precedent, re-proven by H8 windows).

NON-GOALS
  No fetching inside the package (callers own IO; lite-query is a recipe).
  No virtualized listbox (lite-virtual's job). No debounce machinery
  (lite-debounce recipe).

DONE WHEN
  a remote combobox composes from primitive + lite-query recipe with the
  stale-commit class provably dead, and every prior mode is byte-stable
```

===============================================================================
# H11 -- lite-headless v1.8.0 -- the lite-form seam (forms track, startable)
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.8.0 (slot -- ship-time version rule, section 5)
findings: [LH-05, LH-06]
depends_on: ["lite-form >= 1.3.0 registry-visible, verified fail-closed at session start", "H8 SOFT (section 5 ruling: pending wiring is not keystroke-class; enters the H8 ledger when H8 lands)"]
---

# form-field learns pending; the error lane gets its recipe

PURPOSE
  lite-form 1.3.0 (shipped 2026-09-06) ships per-field isValidating designed
  with createFormField as the intended consumer. Land the consumer: a pending
  state on form-field (aria-busy + data-validating paint), and the documented
  error-lane wiring that today every integrator improvises.

THE 1.3.0 SURFACE (verified against the shipped API -- no archaeology needed)
  - field.isValidating: ReadSignal<boolean> -- true exactly while the LATEST
    async check is unsettled. Sync-only fields share ONE frozen false
    (identity-stable; safe to wire unconditionally).
  - form.isValidating: ReadSignal<boolean> -- any field pending.
  - Ordering law: stale settlements (resolve AND reject) are dropped whole --
    pending never flashes off early; the latest rejection surfaces as the
    field error, never silent validity.
  - isValid is STRICT-FALSE while any check is pending, so form.submit()
    refuses by itself during validation -- consumers paint WHY (pending),
    they do not add a second gate.
  - field.error() is reveal-gated display, field.rawError() always-live
    validity; form.submitAttempted (writable) force-reveals; the reveal mode
    is validateOn: "change" | "blur" | "submit".
  - Debounce is caller-side by design (no timers in lite-form): asyncSources
    + lite-debounce -- `username: (fld) => debounce(() => fld.value(), 300)`.

TASKS
  - form-field: pending signal + setPending(bool), painted data-validating,
    aria-busy on the control wiring, showsError interplay RULED in the
    session ADR (lean: a stale revealed error stays visible while pending
    -- honest state -- and the spinner paints beside it; record either way).
  - The wiring recipe (docs/recipes/lite-form-field.md + a fast test):
    exactly ONE reveal gate exists -- form-field sets
    showErrorsBeforeTouched: true and defers gating to lite-form
    (ff.setValid driven by the reveal-gated field.error(), ff.setTouched by
    field.touched, ff.setPending by field.isValidating). The double-gate
    footgun is named in the recipe prose.
  - element wrapper attribute for pending; CSS contract appendix regen.

ASSERTIONS
  - Pending truth table incl. the S3 edges: out-of-order settlements never
    flash pending off early (drive with lite-form's own deferred-based
    tests as the oracle pattern); destroy() during pending seals cleanly
    (H-12).
  - submit() during pending resolves false with zero onSubmit calls (the
    strict-false gate is lite-form's; the wiring defers to it) -- asserted
    once from the consumer side.
  - The recipe test runs against PUBLISHED lite-form >= 1.3.0 (devDep), not
    a symlink -- this session proves the seam as consumers will install it.

NON-GOALS
  No lite-form changes (one package at a time). No new form primitives.

DONE WHEN
  a lite-form async-validated field drives a form-field spinner + error
  display with one documented wiring and zero improvised gating
```

===============================================================================
# H12 -- lite-headless v1.9.0 -- canon primitives
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.9.0
findings: [LH-07]
depends_on: [H8]
---

# select, checkbox -- the two defensible absences

PURPOSE
  The catalog's two real gaps against the APG/ecosystem canon: a select
  (button trigger + listbox, typeahead, no text editing -- the pattern
  combobox deliberately is not) and a checkbox (+ group, indeterminate)
  that two recipes currently hand-roll around native inputs.

TASKS
  - createSelect: reuse combobox's listbox/highlight internals minus the
    input lane; APG select pattern ARIA; both element wrappers; H8 windows.
  - createCheckbox + createCheckboxGroup: indeterminate/tri-state as state
    (not just paint), group aggregation, form-field pairing documented.
  - Refactor tree-checkbox-cascade and the indeterminate recipe onto the
    primitive (shared law 5: recipes may only grow downward).
  - Context-menu: STRETCH ONLY as a menu slice (contextmenu trigger +
    position-at-pointer); ships only if it lands additive on the existing
    menu with no new layer. Menubar and scroll-area: RECORDED OUT --
    menubar is a large low-demand ARIA surface; scroll-area is CSS.

ASSERTIONS
  - Select keyboard truth table (typeahead, home/end, disabled skip) at
    APG parity with combobox's existing suite as the template.
  - Checkbox group: indeterminate derived, never stored inconsistently;
    the refactored recipes' tests unchanged in meaning.
  - New primitives enter the H8 window ledger on day one.

NON-GOALS
  No date-range picker (datepicker owns it), no menubar, no scroll-area,
  no styled anything.

DONE WHEN
  the catalog's NOT-FOR list is the only honest answer to "why is X
  missing", for every X a Radix/Ark user would ask about
```

===============================================================================
# H13 -- lite-headless v1.10.0 -- server-data form recipes (forms track)
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.10.0 (slot -- ship-time version rule, section 5)
findings: [LH-11]
depends_on: [H11, "lite-form >= 1.3.0 registry-visible, verified fail-closed at session start"]
---

# the refresh-while-editing story, composed and proven

PURPOSE
  lite-form 1.3.0's server-data engine is complete: merge reinitialize keeps
  drafts through a refresh, toPatch()/submit({patch:true}) posts the minimal
  diff, strict-false-while-pending makes submit self-refusing. None of it has
  a lite-headless composition -- integrators improvise exactly the wiring
  this package exists to make canonical. Land it as recipes (docs/recipes/ +
  fast tests); source changes only if a recipe exposes a missing paint hook.

THE 1.3.0 SURFACE THIS SESSION COMPOSES (verified against the shipped API)
  - reinitialize(next, policy?): default mode only. The merge table: a
    pristine field ADOPTS the server value; dirty + (Object.is(n, d) or
    policy(n, d) === true) ECHOES (overlay cleared, pristine at n); anything
    else is a CONFLICT -- the draft stays visible, the baseline re-seeds
    underneath (field.reset() lands the server value; toPatch().from is the
    server value). Deep-copied payloads mean object leaves never auto-echo
    under the default policy -- recipes pass a structural policy for
    object-valued fields.
  - The policy is PURE: any mutating form call inside the merge window
    throws TypeError (lite-form's re-entrancy latch). Recipe policies are
    (n, d) => boolean, nothing else.
  - Source-mode forms refresh via reconcile(policy?) instead; the 2-arg
    reinitialize throws there by design. One recipe paragraph, not a lane.
  - submit(ev, { patch: true }) posts toPatch() -- [{path, from, to}] of
    exactly the dirty paths; an empty patch still submits [].
  - Server field errors: NO setFieldError exists, on purpose -- the shipped
    pattern merges a caller-owned serverErrors signal into `validate` (the
    "Surfacing server errors WITHOUT a setFieldError API" recipe in
    lite-form's llms.txt).

DECISIONS TO RECORD (session ADR, before coding)
  - Refresh-while-editing safety is BY CONSTRUCTION, so the recipe documents
    rather than defends: a focused input's in-progress draft is a dirty
    overlay, and a merge never overwrites a dirty conflict -- the recipe's
    job is the AFTERMATH: paint the conflict list from toPatch(), offer
    keep-mine (no-op) vs take-server (field.reset(), which lands the server
    value post-merge).
  - Busy submit: the button disables on isSubmitting() OR isValidating();
    isValid is strict-false while pending so submit() already refuses -- the
    recipe paints WHY instead of adding a second gate (the H11 one-gate law,
    extended to submit).
  - Whether H13 ships any source change at all: if the recipes need zero
    code, they ride the next release instead of forcing an empty minor --
    record the ruling.

TASKS
  - docs/recipes/lite-form-server-data.md + fast test: a form-field-wired
    form takes reinitialize(next) mid-edit (poll/socket tick simulated); the
    focused field's draft survives; pristine siblings adopt silently; the
    conflict list paints from toPatch() with per-row keep/take actions.
  - docs/recipes/lite-form-patch-submit.md (or one combined recipe file):
    submit(ev, {patch:true}) posting the minimal diff; the 409 lane reusing
    the serverErrors-signal pattern; busy-button wiring off
    isSubmitting/isValidating (+ H11's pending paint on the field).
  - CSS contract appendix regen ONLY if a painted attribute is added.

ASSERTIONS
  - The refresh test drives a real attached form-field input (happy-dom)
    mid-edit through reinitialize: the input's value never flickers (the
    merge is one batch -- no transient adopt), pristine siblings show the
    server value, and after take-server the input shows it too.
  - Patch submit posts exactly the dirty paths, asserted against a captured
    onSubmit; an empty patch posts [].
  - A throwing policy leaves the recipe's form byte-identical (atomicity is
    lite-form's; asserted once from the consumer side).
  - All recipe tests run against PUBLISHED lite-form >= 1.3.0 (devDep, not a
    symlink) -- the same law as H11.
  - api-surface snapshot unchanged if the zero-code ruling holds.

NON-GOALS
  No transport/fetch machinery beyond a stubbed poster. No lite-form changes
  (one package at a time). No conflict-resolution UI framework -- a list and
  two actions is the honest scope. No undo (lite-undo's job).

DONE WHEN
  an integrator can copy two recipes and have a headless form that survives
  server refreshes mid-edit, posts minimal patches, and explains its own
  pending/busy state -- every gating decision documented, none improvised
```

---

## 7. How to run it

Main lane in order, H8 first; the forms track (H11 -> H13) runs in parallel
whenever wanted (section 5 rulings). `status: planned -> shipped` after each
/release, actual version recorded beside the slot. Author
BRIEF.md in the package from the session block, then planner -> coder ->
reviewer -> qa; reviewer REJECTED goes back to coder. Every session runs
`npm run verify` (tests + types + torture) and, after H8, the witness lane is
part of "no gate output is a FAIL". /sync-card after every /release.

### If you only do a subset

1. **H8, always.** It is the only session that changes what every OTHER
   claim in the package is worth. History says the witness pays for itself
   (two packages, two real finds).
2. **H9 second** -- fail-closed is the suite's brand, and both halves are
   debts the package already owes itself in writing.
3. **H10 or the forms track by calendar**: H10 is the feature users hit
   daily; the forms track (H11 -> H13) is unblocked as of 2026-09-06 and is
   the lane to run in parallel with lite-form's own S4.
4. **H12 is elective** -- breadth, not depth.

### The habit this roadmap is built around

H1-H7 built a package that validates its inputs, seals its teardowns, pins
its export surface, and regenerates its CSS contract from source. The one
habit it never adopted is the suite's hardest-won: the lanes that prove
"zero-GC" must be the lanes that CAN see the garbage. Two packages were
falsified by that lesson in a single week -- one of them while this suite's
own gate said ok. After H8, lite-headless's gate can call its own bluff;
every session after that is ordinary, well-lit work.

MIT (c) Zahary Shinikchiev <shinikchiev@yahoo.com>
