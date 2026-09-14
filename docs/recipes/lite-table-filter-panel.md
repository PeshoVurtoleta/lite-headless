# Recipe: deferred filter panel -- lite-headless form-field + button over a lite-table

Cross-package: [`@zakkster/lite-table`](https://www.npmjs.com/package/@zakkster/lite-table)
(the data grid, incl. per-column filtering + saved views) +
`@zakkster/lite-headless/form-field` (ARIA + paint) +
`@zakkster/lite-headless/button` (accessible activation).

lite-table already mounts a LIVE, per-keystroke filter row (`.lt-filter-row`).
This recipe builds the DEFERRED alternative: a panel whose inputs are STAGED and
only pushed to the table when the user presses **Apply**. It is the classic
back-office pattern -- use it for admin panels, expensive queries, or anywhere
per-keystroke recompute is wasteful. The whole thing is "basically a form": one
draft signal per filterable column, a form-field per input for the ARIA, and an
Apply button that batches the drafts into the table's EXISTING
`setColumnFilter` API. No source change to either package.

Verified against PUBLISHED lite-table `^1.3.0`. Every assertion below is
exercised in `test/lite-table-filter-panel.test.js` and ruled in
`docs/decisions/0011-filter-panel-recipe.md`.

## Install

    npm i @zakkster/lite-headless @zakkster/lite-table

`@zakkster/lite-signal` is a peer of both (the reactive core). lite-table also
pulls its own load-time peers (`lite-signal-dom`, `lite-virtual`).

## The pattern

A deferred panel is a form with a two-phase commit:

    draft signals (staged)  --Apply-->  table.setColumnFilter(...)  -->  visibleRows()

- ONE `signal("")` per filterable column holds the STAGED query. Editing a draft
  changes nothing on the table.
- **Apply** = `batch(() => { for each column: table.setColumnFilter(key, draft()); })`.
  One batch -> one `visibleRows()` recompute, no matter how many columns changed.
- **Reset** = `table.clearColumnFilters()` + every draft back to `""`.

The table's own filter pipeline does the matching: `rows -> filteredRows() ->
visibleRows()` (post-filter + sort). The panel never re-implements filtering; it
only decides WHEN the drafts land.

## The wiring

    import { createTable }      from "@zakkster/lite-table";
    import { createFormField }  from "@zakkster/lite-headless/form-field";
    import { createButton }     from "@zakkster/lite-headless/button";
    import { signal, batch }    from "@zakkster/lite-signal";

    // 1. lite-table: mark the columns you want filterable. The default filter
    //    predicate is a case-insensitive substring on the stringified cell;
    //    pass a `filter:(value,query,row)=>boolean` for custom matching.
    const table = createTable({
        rows,
        columns: [
            { key: "city",   header: "City",   filterable: true },
            { key: "status", header: "Status", filterable: true },
        ],
        getRowId: (r) => r.id,
    });

    // 2. one draft signal per filterable column -- STAGED, not applied.
    const drafts = {
        city:   signal(""),
        status: signal(""),
    };

    // 3. one form-field per input for the ARIA (label[for] <-> control.id,
    //    aria-invalid/aria-required, the aria-describedby chain). form-field
    //    does NOT own the value; the draft signal does.
    function wireFilterInput(key, rootEl, labelEl, inputEl) {
        const ff = createFormField();
        ff.attachRoot(rootEl);
        ff.attachLabel(labelEl);      // paints label[for] = inputEl.id
        ff.attachControl(inputEl);    // ensures inputEl.id, aria-*
        inputEl.value = drafts[key].peek();                         // hook initial value
        inputEl.addEventListener("input", (ev) => drafts[key].set(ev.target.value));
        return ff;
    }

    // 4. Apply = ONE batch of setColumnFilter over every draft. Atomic:
    //    visibleRows() recomputes exactly once for the whole Apply.
    const applyBtn = createButton({
        onPress: () => batch(() => {
            for (const key of Object.keys(drafts)) {
                table.setColumnFilter(key, drafts[key]());   // ""/whitespace clears that column
            }
        }),
    });
    applyBtn.attachRoot(applyEl);

    // 5. Reset = clear every column filter and empty every draft.
    const resetBtn = createButton({
        onPress: () => batch(() => {
            table.clearColumnFilters();
            for (const key of Object.keys(drafts)) drafts[key].set("");
        }),
    });
    resetBtn.attachRoot(resetEl);

> [!NOTE]
> **Deferred (this) vs lite-table's built-in LIVE filter row.** lite-table's
> `.lt-filter-row` applies each keystroke immediately -- great for cheap,
> interactive grids. This recipe is the DEFERRED opposite: the drafts sit in the
> panel and only reach the table on Apply, which is **one batch** -- a single
> `visibleRows()` recompute regardless of how many columns changed. Pick deferred
> for admin panels and expensive queries; pick the live row for snappy small
> tables. Do not run both against the same columns.

> [!WARNING]
> Do NOT bind a draft `effect` straight into `setColumnFilter` -- that recreates
> the live per-keystroke behavior and defeats the point. The ONLY thing that
> calls `setColumnFilter` is the Apply button's `onPress`.

An optional dirty gate mirrors the one-gate law: a `computed` comparing the
drafts to `table.columnFilters()` drives `applyBtn.setDisabled(!dirty())`, so
Apply is inert until something actually changed. Keep it optional.

## Saved views come for free

Because the panel routes through `setColumnFilter`, its applied state is part of
the table's view state -- no extra plumbing:

    const saved = JSON.parse(JSON.stringify(table.getViewState()));
    // saved.filters === { city: "lon", status: "active" }  -- the applied panel map

    // later, on any identical table:
    table.setViewState(saved);   // REPLACE semantics, atomic -> visibleRows() matches

`getViewState().filters` is a plain `{ [key]: query }` object (JSON-safe), so a
saved view persists and restores the applied panel exactly. This works BECAUSE
the panel commits through the per-column filter API rather than an opaque
predicate -- a query string round-trips; a function would not.

## When you outgrow per-column filters

This recipe covers per-column filters, AND-combined (every applied column must
match). That is the boundary. Compound/operator logic -- AND/OR groups,
`>`, `between`, `in`, negation -- is deliberately OUT.

The tempting escape hatch is a raw `setRowFilter(fn)` taking a predicate. Do NOT
reach for it: a function is not JSON-serializable, so it would silently break
saved views (a view could no longer round-trip the filter). The correct future
seam is a SERIALIZABLE filter descriptor -- a tiny `{op, field, value}` /
`{and:[...]}` AST that lite-table interprets AND persists through
`getViewState`. That is a separate lite-table brief, not something to smuggle
into a recipe. Until it exists, per-column AND filters are the supported ceiling.

## See also

- `docs/decisions/0011-filter-panel-recipe.md` -- the rulings (recipe not core,
  saved-views-compatible, Apply atomic, the descriptor-seam boundary).
- `docs/recipes/lite-form-field.md` -- the form-field ARIA + reveal-gate wiring
  this panel reuses per input.
- lite-table's `llms.txt` -- `setColumnFilter` / `columnFilters` /
  `getViewState` / `setViewState`, and the `rows -> filteredRows -> visibleRows`
  pipeline.
