# ADR 0004: Declaration parity is enforced by the api-surface gate plus a consumer type-test, not by skipLibCheck:false

- Status: Accepted
- Date: 2026-09-07
- Scope: types.d.ts (the bare-package barrel re-exports), type-tests/, and the
  `npm run types` + api-surface node:test gates
- Session: H9 (finding LH-03)

## Context

LH-03 recorded a "declaration parity debt" in three parts: (1) 32 live exports
held in the api-surface `undocumented` allowlist; (2) the `DIALOG_OPTION_KEYS`
public-or-not question; (3) "3 dangling barrel re-exports survive only under
skipLibCheck".

Reproduction at the H9 open found parts (1) and (2) already closed by ADR 0002:
the `undocumented` allowlist is `[]` (pin 32 -> 0), every live export is declared
in its subpath's `declare module` block, and `DIALOG_OPTION_KEYS` is relocated
into the private `src/_validate.js` and reachable through no subpath. Only part
(3) remained open: is there a guard that a bare-package barrel re-export
(e.g. `export { deriveInitials, hueFromString } from ".../avatar"`,
types.d.ts:56; `export { buildItems } from ".../pagination"`, :80) actually
resolves?

The obvious mechanism -- compile the whole project under `skipLibCheck:false` --
is not viable and never was. The tsconfig maps BOTH `@zakkster/lite-headless`
and `@zakkster/lite-headless/*` to `./types.d.ts` via `paths`, so a strict
full-file check treats every barrel re-export as a self-referential module
augmentation: ~353 structural errors, dominated by TS2666 ("exports and export
assignments are not permitted in module augmentations") and TS2303 ("circular
definition of import alias"), plus an unrelated `LiteToggleGroupElement.contains`
(key: string) vs `Node.contains(other)` DOM-lib conflict (TS2344). These are
artifacts of the self-mapping-paths + single-file-.d.ts shape, not real dangling
re-exports; the standing pre-briefing already recorded "no tsc value-signature
assertions ... parity lives in the block-scoped api-surface node:test gate".

## Options

### A. Flip `skipLibCheck:false` for the whole project

Rejected. The self-mapping `paths` produce ~353 structural errors that swamp any
real signal; the DOM-lib `contains` conflict is a separate concern. This would
report noise, not dangling re-exports, and force a full barrel restructure to
silence it.

### B. Restructure the barrel to non-circular re-declaration

Rejected for H9 (out of scope). The current barrel resolves correctly for real
consumers under `moduleResolution: bundler`; the "circularity" is a self-map
artifact of the type-test tsconfig, not a defect a consumer can observe. A
restructure is a large, separate piece of work with no consumer-visible payoff.

### C. Consumer-simulation type-test + the api-surface node:test gate

Chosen. Two complementary guards, no `skipLibCheck` change:

1. `type-tests/consumer-surface.ts` -- a `.ts` consumer that VALUE-imports the
   bare-barrel re-exports (the LH-03 class: deriveInitials/hueFromString from
   ./avatar, buildItems from ./pagination) and uses each as a value. (Subpath-
   ONLY helpers cannot be import-probed in this harness: the type-test `paths`
   self-map resolves any subpath specifier to the bare module, so they stay
   covered by guard 2 and type-tests/api-surface.ts.)
   An unresolved import in a `.ts` consumer is reported by tsc even under
   `skipLibCheck:true` (that flag only silences errors INSIDE `.d.ts` files), so
   a barrel re-export that stopped resolving fails `npm run types` here. Proven
   to bite: deleting a name from a barrel re-export in types.d.ts makes tsc fail
   in this file (qa asserts this, then reverts).
2. `test/api-surface.test.js` -- the block-scoped gate that enumerates every live
   JS export and requires each to be declared in its subpath's `declare module`
   block (allowlist must stay empty).

## Consequences

- `skipLibCheck` stays `true` (tsconfig.json). No barrel restructure.
- A dangling bare-package re-export now fails `npm run types` via
  type-tests/consumer-surface.ts; an undeclared new JS export fails the
  api-surface node:test gate. The parity class is closed from both directions.
- The `undocumented` allowlist remains `[]` and is expected to stay empty.

## Revisit trigger

If `moduleResolution` or the `paths` self-map is ever changed so that a strict
full-file check of types.d.ts is clean, reconsider a global `skipLibCheck:false`
as a stronger single guard -- and at that point resolve the
`LiteToggleGroupElement.contains` / `Node.contains` signature conflict rather
than working around it.
