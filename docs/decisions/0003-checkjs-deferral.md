# ADR 0003: checkJs adoption is deferred (measured over budget)

- Status: Accepted
- Date: 2026-08-31
- Scope: the whole `src/` tree; specifically the `_validate` + `_overlay` slice
  measured as the pilot surface for a `checkJs: true` tsconfig.

## Context

types.d.ts is a hand-authored declaration file. The api-surface gate proves the
NAME-level export surface matches, and `type-tests/api-surface.ts` exercises the
declared shapes at `tsc` time, but neither checks the declared types against the
actual JavaScript VALUES in `src/` -- `src` is excluded from the tsconfig, so a
declared return shape can drift from the emitted one silently (exactly the class
of bug ADR-adjacent to the H6b `PaginationItem.position` fix: caught only by
hand-verification against the emit sites).

Turning on `checkJs` (with `allowJs`) over `src/` would let `tsc --noEmit`
type-check the implementation itself, closing that gap. H7 measured the cost on
the smallest coherent pilot slice -- the `_validate.js` validator plus the
`_overlay/*` composition core, the code every primitive depends on -- to decide
whether adoption fits a single cycle's budget.

## Options

### A. ADOPT NOW -- enable checkJs across src this cycle

Rejected. The measured error count on the pilot slice alone is **44** `tsc`
diagnostics under `checkJs` (implicit-any on untyped closure params, index-
signature access on the mutable scratch objects the positioner reuses by design,
`possibly-undefined` on the pooled-signal `let` bindings that the seal pattern
reassigns, and JSDoc-vs-inferred mismatches in the aria helpers). The adoption
budget agreed for a single cycle is **<= 25** errors' worth of annotation work.
44 on `_validate` + `_overlay` alone -- before the 59 primitives on top -- puts
a correct, no-shortcut adoption well outside one cycle. Rushing it would mean
either `// @ts-nocheck` pragmas (which re-open the exact gap checkJs is meant to
close) or hasty `any` annotations (which launder the drift instead of catching
it). Neither is worth shipping.

### B. DEFER, record the measurement, keep the seam ready

Accepted. Leave `src` out of the type-check for now; keep types.d.ts + the
name-level api-surface gate + `type-tests/api-surface.ts` as the enforced
surface. Record the 44-vs-25 measurement here so the deferral is a decision on
record, not an oversight, and so the next attempt starts from a known number
rather than re-measuring.

## Consequences

- `src/` remains unchecked by `tsc`; declared-vs-emitted drift is still caught
  only by the name-level gate plus hand-verification (documented per fix, as in
  the H6b changelog entry).
- No `checkJs`, `allowJs`, or `// @ts-*` pragmas are added to the tree this
  cycle -- the tsconfig and source stay as they are.
- The measurement (44 errors on `_validate` + `_overlay`, budget 25) is the
  baseline for the next adoption attempt.

## Revisit trigger

Re-open when any one holds:

1. The pilot-slice error count drops to <= 25 (e.g. after unrelated annotation
   work lands), making one-cycle adoption feasible.
2. A declared-vs-emitted drift bug ships to consumers despite the name-level
   gate -- evidence the gap is costing more than the annotation budget.
3. The adoption budget per cycle is raised above 44.
