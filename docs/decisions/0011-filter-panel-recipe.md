# ADR 0011: the deferred filter-panel recipe

- Status: Accepted
- Date: 2026-09-14
- Scope: `docs/recipes/lite-table-filter-panel.md`,
  `test/lite-table-filter-panel.test.js`, `llms.txt` (recipe enumeration)
- Session: zero-source recipe -- rides the next release (an instance of ADR 0009's
  zero-source ruling, like H13's server-data recipes)

## Context

`@zakkster/lite-table` 1.3.0 ships a complete per-column filter API
(`setColumnFilter`, `columnFilters()`, `clearColumnFilters()`, the
`rows -> filteredRows() -> visibleRows()` pipeline) AND saved views
(`getViewState()` / `setViewState()` round-trip the filter query strings). It
also mounts a LIVE, per-keystroke filter row. Integrators building back-office
tables repeatedly asked for the DEFERRED variant -- a panel of inputs staged
behind an Apply button -- and improvised it, usually by reaching for a raw
predicate that quietly broke saved views. The user's framing settled the design:
"it's basically a form." This ADR records the rulings made before writing the
recipe.

## Decision R1 -- a deferred filter panel is a RECIPE, not a core feature

The panel is a composition of existing surfaces: lite-headless `form-field`
(ARIA per input) + `button` (accessible Apply/Reset) + lite-table's per-column
filter API. Nothing about it needs new source in either package. The deferred-
apply panel IS a form -- draft signals staged, committed on submit -- so it lands
as a documented recipe with a boundary test, exactly like the ADR 0009 server-
data recipes. No new primitive, no new lite-table option.

## Decision R2 -- saved-views compatible FOR FREE, because it routes through setColumnFilter

Apply commits each draft via `table.setColumnFilter(key, query)`. lite-table's
`getViewState().filters` is a JSON-safe `{ [key]: query }` map, so the applied
panel state is captured and restored by a saved view with zero extra plumbing.
This is a direct consequence of committing through the per-column API rather than
an opaque predicate: a query string round-trips; a function would not (see R4).
Proven by A5 (JSON round-trip deep-equals the applied map; `setViewState` on a
fresh identical table reproduces the filtering).

## Decision R3 -- Apply is atomic (one batch -> one recompute)

Apply wraps its `setColumnFilter` calls in `batch(...)` from `@zakkster/lite-signal`,
so `visibleRows()` recomputes exactly ONCE for the whole Apply, regardless of how
many columns changed -- not once per column. Proven by A2 (an effect subscribed to
`visibleRows()` fires exactly once across a two-column Apply). Reset batches the
same way.

## Decision R4 -- compound filters need a SERIALIZABLE descriptor seam, NOT setRowFilter(fn)

The recipe's boundary is per-column filters, AND-combined. Compound/operator
logic (AND/OR groups, `>`, `between`, `in`, negation) is OUT. It must NOT be
introduced as a raw `setRowFilter(fn)` predicate: a function is not
JSON-serializable and would silently break saved views (a view could no longer
round-trip the filter, violating R2). If real query-builder needs arise,
lite-table gains a SERIALIZABLE filter-descriptor seam -- a tiny
`{op, field, value}` / `{and:[...]}` AST that lite-table both interprets and
persists through `getViewState` -- as its own future brief. It is not smuggled
into this recipe.

## Decision R5 -- one-package law

No source change to lite-table or lite-headless. lite-table (and its load-time
peers `lite-signal-dom`, `lite-virtual`) stay DEV-only devDependencies used by
the boundary test; they are NEVER added to `dependencies` or `peerDependencies`.
The recipe is pure documentation + a boundary test. Per ADR 0009's zero-source
ruling, it carries no version bump and no CHANGELOG entry of its own -- it rides
the next release.

## Consequences

- A new recipe (`docs/recipes/lite-table-filter-panel.md`) and boundary test
  (`test/lite-table-filter-panel.test.js`, A1-A6) proven against PUBLISHED
  lite-table 1.3.0; the recipe is added to the `llms.txt` enumeration.
- No source, no version bump, no CHANGELOG now (ADR 0009 zero-source ruling).
- The torture GATE is unchanged: the recipe is not in torture; the devDep add
  perturbs nothing (`leak 0/0`, `alloc 0 B/op`, `gc major=0`, gated 9/9).
- If a future filter feature finds itself adding a predicate seam that a saved
  view cannot round-trip, that is the R4 signal -- STOP and open the descriptor-
  seam brief instead.
