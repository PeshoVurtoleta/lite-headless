// lite-table-filter-panel.test.js -- the DEFERRED (Apply-button) filter panel
// recipe proven against PUBLISHED @zakkster/lite-table (devDep ^1.3.0, installs
// 1.3.0; NOT a symlink). Proves docs/recipes/lite-table-filter-panel.md and
// ADR 0011: a filter panel is a FORM whose Apply batches setColumnFilter into
// the table's EXISTING per-column filter API -- no source change to either
// package. Drafts are staged (deferred); Apply pushes them in ONE batch (atomic
// -- a single visibleRows recompute); Reset clears filters and drafts; because
// the panel routes through setColumnFilter its applied state is captured by a
// saved view (getViewState/setViewState) for free. A6 wires a real input through
// createFormField to prove the label/control ARIA association the panel gets.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { signal, effect, batch } from "@zakkster/lite-signal";
import { createTable } from "@zakkster/lite-table";
import { createFormField } from "../src/form-field/index.js";

// Clean fixture: no status value is a substring of another, and no city query
// leaks across cities (the default filter is a case-insensitive SUBSTRING, so
// "active" would match "inactive" -- avoided here on purpose).
//   city="lon" -> {1,3} (London); does NOT match "Lyon" (l-y-o-n).
//   status="active" -> {1,4}; "active" is not a substring of "paused".
//   AND(city="lon", status="active") -> {1}.
function makeRows() {
    return [
        { id: 1, city: "London", status: "active" },
        { id: 2, city: "Paris", status: "paused" },
        { id: 3, city: "London", status: "paused" },
        { id: 4, city: "Lyon", status: "active" },
    ];
}

const COLUMNS = [
    { key: "city", header: "City", filterable: true },
    { key: "status", header: "Status", filterable: true },
];

// The deferred panel: one draft signal per filterable column, staged and only
// pushed on Apply. Apply batches setColumnFilter over every draft (atomic);
// Reset clears the table filters and returns every draft to "".
function makePanel(table, keys) {
    const drafts = {};
    for (const k of keys) drafts[k] = signal("");
    function applyPanel() {
        batch(() => {
            for (const k of keys) table.setColumnFilter(k, drafts[k]());
        });
    }
    function resetPanel() {
        batch(() => {
            table.clearColumnFilters();
            for (const k of keys) drafts[k].set("");
        });
    }
    return { drafts, applyPanel, resetPanel };
}

function ids(rows) {
    return rows.map((r) => r.id);
}

// A1 deferred: staging drafts changes NOTHING on the table until Apply.
test("A1 deferred: staging drafts leaves columnFilters/visibleRows untouched until applyPanel", () => {
    setupDOM();
    const table = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    const panel = makePanel(table, ["city", "status"]);

    panel.drafts.city.set("lon");
    panel.drafts.status.set("active");

    assert.equal(table.columnFilters().size, 0, "no column filter applied while drafts are only staged");
    assert.deepEqual(ids(table.visibleRows()), [1, 2, 3, 4], "all rows still visible pre-Apply");

    panel.applyPanel();

    assert.equal(table.columnFilters().size, 2, "Apply pushed both drafts");
    assert.deepEqual(ids(table.visibleRows()), [1], "post-Apply visibleRows reflect the drafts");

    table.dispose();
    teardownDOM();
});

// A2 atomic: an effect reading visibleRows() runs EXACTLY ONCE across an Apply
// that sets two filters (proves the batch collapses to a single recompute).
test("A2 atomic: applyPanel setting two filters triggers exactly one visibleRows recompute", () => {
    setupDOM();
    const table = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    const panel = makePanel(table, ["city", "status"]);

    let runs = 0;
    const stop = effect(() => { table.visibleRows(); runs++; });
    assert.equal(runs, 1, "initial subscribe run");

    panel.drafts.city.set("lon");
    panel.drafts.status.set("active");
    const before = runs;
    panel.applyPanel();

    assert.equal(runs - before, 1, "one Apply -> exactly one recompute, not one per column");

    stop();
    table.dispose();
    teardownDOM();
});

// A3 correctness: AND across two columns; a non-matching combo yields [].
test("A3 correctness: applied drafts AND-combine; a non-matching combo yields []", () => {
    setupDOM();
    const table = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    const panel = makePanel(table, ["city", "status"]);

    panel.drafts.city.set("lon");
    panel.drafts.status.set("active");
    panel.applyPanel();
    assert.deepEqual(ids(table.visibleRows()), [1], "London AND active -> row 1 only");

    panel.drafts.city.set("paris");
    panel.drafts.status.set("active");
    panel.applyPanel();
    assert.deepEqual(ids(table.visibleRows()), [], "Paris AND active -> no row matches both");

    table.dispose();
    teardownDOM();
});

// A4 reset: resetPanel clears filters, restores all rows, and empties drafts.
test("A4 reset: resetPanel clears columnFilters, restores all rows, and empties every draft", () => {
    setupDOM();
    const table = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    const panel = makePanel(table, ["city", "status"]);

    panel.drafts.city.set("lon");
    panel.drafts.status.set("active");
    panel.applyPanel();
    assert.deepEqual(ids(table.visibleRows()), [1], "filtered before reset");

    panel.resetPanel();

    assert.equal(table.columnFilters().size, 0, "columnFilters empty after reset");
    assert.deepEqual(ids(table.visibleRows()), [1, 2, 3, 4], "all rows visible after reset");
    assert.equal(panel.drafts.city(), "", "city draft back to empty");
    assert.equal(panel.drafts.status(), "", "status draft back to empty");

    table.dispose();
    teardownDOM();
});

// A5 saved-views: the applied panel state round-trips through getViewState/
// setViewState for FREE, because it routed through setColumnFilter.
test("A5 saved-views: applied panel state JSON round-trips and re-applies on a fresh table", () => {
    setupDOM();
    const table = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    const panel = makePanel(table, ["city", "status"]);

    panel.drafts.city.set("lon");
    panel.drafts.status.set("active");
    panel.applyPanel();

    const saved = JSON.parse(JSON.stringify(table.getViewState()));
    assert.deepEqual(saved.filters, { city: "lon", status: "active" }, "getViewState captured the applied panel map");

    const fresh = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    assert.deepEqual(ids(fresh.visibleRows()), [1, 2, 3, 4], "fresh table starts unfiltered");
    fresh.setViewState(saved);
    assert.deepEqual(ids(fresh.visibleRows()), [1], "setViewState restored the saved filtering");
    assert.deepEqual(
        [...fresh.columnFilters().entries()],
        [["city", "lon"], ["status", "active"]],
        "restored columnFilters match the saved map",
    );

    fresh.dispose();
    table.dispose();
    teardownDOM();
});

// A6 a11y: a filter <input> wired through createFormField carries the
// label/control ARIA association the form-field paints -- label[for] === the
// control's own id (id linkage). Uses real happy-dom nodes.
test("A6 a11y: a filter input wired via createFormField carries the label[for]=control.id association", () => {
    setupDOM();
    const table = createTable({ rows: makeRows(), columns: COLUMNS, getRowId: (r) => r.id });
    const panel = makePanel(table, ["city", "status"]);

    const root = document.createElement("div");
    const label = document.createElement("label");
    const input = document.createElement("input");
    root.append(label, input);
    document.body.append(root);

    const ff = createFormField();
    ff.attachRoot(root);
    ff.attachLabel(label);
    ff.attachControl(input);

    // bind the draft to a real input event (the panel stages, does not apply)
    input.addEventListener("input", (ev) => panel.drafts.city.set(ev.target.value));

    assert.ok(input.id, "form-field assigned an id to the control");
    assert.equal(label.getAttribute("for"), input.id, "label[for] points at the control's id (label/control association)");

    // staging through the real input still does not touch the table
    input.value = "lon";
    input.dispatchEvent(new globalThis.Event("input", { bubbles: true }));
    assert.equal(panel.drafts.city(), "lon", "the draft captured the typed value");
    assert.equal(table.columnFilters().size, 0, "staging via the wired input is still deferred");

    ff.destroy();
    table.dispose();
    teardownDOM();
});
