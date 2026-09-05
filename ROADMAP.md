# lite-headless -- enriched roadmap (H8-H12)

Five sessions continuing the package's own H-numbering (H1-H7 shipped 1.0.0
through 1.5.0). lite-headless is a HEALTHY package: 59 ARIA-correct primitives,
1633 node:test cases + playwright + type tests, an api-surface snapshot gate
with a may-only-shrink undocumented allowlist, per-primitive llms.txt, an
H-numbered ruling system, and a torture gate with a control mode. Nothing here
is a rescue. What this roadmap does is (a) close the gap between what the gate
CLAIMS and what it can SEE, (b) pay the package's own recorded debts, and
(c) land the two integration seams the rest of the suite is about to need
(lite-query async options, lite-form 1.3.0 async validation).

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
| **Ecosystem fit** | Value-lane lite-form integration documented (README composability, datepicker llms). The error lane and the coming lite-form 1.3.0 async-validation lane have no landing surface (form-field has no pending state). Combobox async/remote options -- the lite-query pairing its own docs gesture at -- is recorded deferred. |

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
| `@zakkster/lite-form` | ecosystem, not a dep | 1.2.0 published; 1.3.0 (async validation, per-field `isValidating`) in flight as its S3. H11 is GATED on it shipping. |
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
H8 ---> H9 ---> H10 ---> H12
 |       |        |
1.5.1  1.6.0   1.7.0    1.9.0
gate   fail-   combobox  canon
truth  closed  async     prims
        |
        +----> H11 (1.8.0, form seam)
               GATED on lite-form >= 1.3.0 published
```

H8 blocks everything: every later session's "zero-GC" claim is unwitnessable
until the lane exists, and H8's re-baseline may itself produce the next
session's paydown list. H9 is the fail-closed brand. H10 is the biggest
user-visible feature and the lite-query pairing. H11 is small but time-gated
on lite-form 1.3.0 (its S3 pipeline is running as this roadmap is written).
H12 is elective breadth. H11 and H12 are independent of each other and of
H10; only H8 -> H9 ordering is load-bearing (H9's per-call validation must
be written against witnessed hot paths so the validation itself proves
allocation-free).

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
# H11 -- lite-headless v1.8.0 -- the lite-form seam (GATED)
===============================================================================

```markdown
---
package: "@zakkster/lite-headless"
version_target: 1.8.0
findings: [LH-05, LH-06]
depends_on: [H8, "lite-form >= 1.3.0 PUBLISHED (per-field isValidating)"]
---

# form-field learns pending; the error lane gets its recipe

PURPOSE
  lite-form 1.3.0 ships per-field isValidating designed with createFormField
  as the intended consumer. Land the consumer: a pending state on form-field
  (aria-busy + data-validating paint), and the documented error-lane wiring
  that today every integrator improvises.

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

---

## 7. How to run it

In order, H8 first, `status: planned -> shipped` after each /release. Author
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
3. **H10 or H11 by calendar**: H10 is the feature users hit daily; H11 is
   small and unblocks the moment lite-form 1.3.0 publishes.
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
