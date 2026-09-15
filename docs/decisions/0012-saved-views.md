# ADR 0012: the saved-views primitive (G-03)

- Status: Accepted
- Date: 2026-09-14
- Scope: `src/saved-views/index.js`, `src/saved-views/element.js`,
  `src/saved-views/llms.txt`, `test/saved-views.test.js`, barrel + package
  exports, `types.d.ts`, `test/torture.mjs` (Phase A churn),
  `test/element-teardown.test.js` (A7 witness), `test/signal-pool.test.js`
  (factory options)
- Session: G-03 -- a NEW primitive, target v1.13.0. Catalog 62 -> 63.

## Context

`@zakkster/lite-table` 1.3.0 ships a saved-views SEAM -- `getViewState()` /
`setViewState(view)` round-trip a table's filter/sort/layout as JSON-safe state.
What it does NOT ship is the CONTROLLER around that seam: a named collection of
snapshots, an active view, dirty detection, and persistence. Integrators
improvised exactly that, usually badly (deep-cloning snapshots, colliding ids
across instances, painting dirty in an always-on effect that fired every column
drag). lite-headless is where that controller belongs -- it is a headless state
machine with a documented CSS-attribute contract, not table-specific.

## Decision 1 -- a GENERIC controller over getState/setState, decoupled from lite-table

`createSavedViews` is generic over any `getState` / `setState` pair. It has NO
import, peer, or devDep on lite-table; the pairing is DOCUMENTED, not baked in.
A plain object stub drives the tests and torture. This keeps the primitive
honest (any serializable state source works: a form, a canvas, a query builder)
and keeps the dependency graph clean (one package at a time).

## Decision 2 -- isDirty() is PULL-only, reactive-when-wrapped

`isDirty()` is `activeView() ? !equals(getState(), activeView().state) : false`.
It reads getState() at CALL time. Because getState() reads the underlying state
signals, reading isDirty() INSIDE a computed/effect re-runs on drift for free --
no second reactive path is built. Critically, it is NEVER painted in an
always-on effect: attachRoot paints ONLY `data-sv-count` and `data-sv-active`
(two cheap signal reads). Painting dirty on the root would call getState() (e.g.
lite-table's getViewState(), which allocates) on every underlying-signal change
-- once per column-drag pixel. Dirty is the consumer's to read where they need
it.

## Decision 3 -- snapshots stored BY REFERENCE

getState() is expected to return a FRESH object per call (lite-table's
getViewState() does). So a snapshot can be stored by reference with no aliasing
risk, and the primitive clones on NO path. A source that returns a shared
mutable object is the source's bug to fix, not this primitive's to paper over.

## Decision 4 -- fail closed

getState/setState are REQUIRED functions (TypeError at construction if missing
or non-function -- null is not a function). `apply`/`update`/`remove`/`rename`
throw a TypeError on an unknown view id; `save`/`rename` throw on a blank name;
an unknown option key throws with a did-you-mean hint. null is not zero.

## Decision 5 -- property-driven element; injectable, env-agnostic persistence

`<lite-saved-views>` CANNOT be attribute-driven -- getState/setState are
functions. It is PROPERTY-DRIVEN: the consumer sets `el.getState` / `el.setState`
(and optional `el.views` / `el.activeId` / `el.storage`) before connect. On
connect, if both hooks are functions it instantiates and paints role=group via
attachRoot; otherwise it stays INERT (no throw). Teardown runs through
`scope.onCleanup` -- never a returned arrow (the 1.9.1 element-teardown fix), so
the instance's signals return to the pool on disconnect (A7 witness).

Persistence is an INJECTABLE `{ load, save }` adapter, NOT hardcoded to
localStorage. The COLLECTION persists on save/update/remove/rename; the ACTIVE
ID is session state (apply/clearActive do not persist -- consumers persist it via
onActiveChange). `generateId` defaults to a PER-INSTANCE prefix
(`sv-<instanceStamp>-<n>`) so two controllers sharing one storage never collide.

## Consequences

- One new primitive; catalog 62 -> 63. Barrel + package `exports`
  (`./saved-views`, `./saved-views/element`) + `types.d.ts` declare-module blocks
  added; api-surface snapshot regenerated.
- H-12: destroy() seals both owned signals. Proven three ways -- the 2000-cycle
  pool-baseline test (A6), the signal-pool factory churn (createSavedViews added
  to its options table), and the torture Phase A create/attach/mutate/destroy
  churn. attachRoot paint is zero-alloc; save/apply allocate legitimately (a user
  gesture, not a hot loop) and are NOT gated at 0 B.
- Deferred: `save/apply` transient windows are not added as gated torture windows
  (they legitimately allocate). Multi-select / compound-filter concerns are out
  of scope (they belong to lite-table, not this controller).
