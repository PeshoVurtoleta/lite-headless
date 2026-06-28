// datepicker.test.js -- createDatePicker: value normalization, picking,
// hover preview, keyboard nav across months, attachDay idempotency,
// min/max disabling, viewMonth + focusedDate signals.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, dispatchClick } from "./_setup.js";
import { createDatePicker } from "../src/datepicker/index.js";

// fixed "today" so the today-marker is deterministic in tests
const TODAY = new Date(2026, 5, 11);   // 11 June 2026

function build(opts = {}) {
    setupDOM();
    const grid = document.createElement("div");
    const label = document.createElement("h2");
    const prev = document.createElement("button");
    const next = document.createElement("button");
    document.body.append(label, prev, grid, next);

    const picker = createDatePicker({ today: TODAY, ...opts });
    picker.attachGrid(grid);
    picker.attachMonthLabel(label);
    picker.attachPrevMonth(prev);
    picker.attachNextMonth(next);
    return { picker, grid, label, prev, next };
}

// Render 42 cells for the current viewMonth and attach them. Returns the
// cell elements so tests can click/key on them.
function renderCells(picker, grid) {
    // detach previous cells (we recreate fresh ones)
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const days = picker.getDaysInView();
    const cells = [];
    for (const d of days) {
        const cell = document.createElement("button");
        cell.textContent = String(d.getDate());
        grid.appendChild(cell);
        picker.attachDay(cell, d);
        cells.push({ el: cell, date: d });
    }
    return cells;
}

// ─── value normalization ───────────────────────────────────────────────────

test("default single value is [null]", () => {
    setupDOM();
    const p = createDatePicker({ today: TODAY });
    assert.deepEqual(p.value(), [null]);
    p.destroy();
    teardownDOM();
});

test("default range value is [null, null]", () => {
    setupDOM();
    const p = createDatePicker({ mode: "range", today: TODAY });
    assert.deepEqual(p.value(), [null, null]);
    p.destroy();
    teardownDOM();
});

test("setValue normalizes a bare Date to [Date] in single mode", () => {
    setupDOM();
    const p = createDatePicker({ today: TODAY });
    p.setValue(new Date(2026, 5, 15));
    const v = p.value();
    assert.equal(v.length, 1);
    assert.equal(v[0].getFullYear(), 2026);
    assert.equal(v[0].getMonth(), 5);
    assert.equal(v[0].getDate(), 15);
    p.destroy();
    teardownDOM();
});

test("setValue strips time-of-day (day precision only)", () => {
    setupDOM();
    const p = createDatePicker({ today: TODAY });
    p.setValue(new Date(2026, 5, 15, 14, 30, 22));
    const v = p.value();
    assert.equal(v[0].getHours(), 0);
    assert.equal(v[0].getMinutes(), 0);
    assert.equal(v[0].getSeconds(), 0);
    p.destroy();
    teardownDOM();
});

test("range value is auto-sorted (later first arg -> swapped)", () => {
    setupDOM();
    const p = createDatePicker({ mode: "range", today: TODAY });
    p.setValue([new Date(2026, 5, 20), new Date(2026, 5, 10)]);
    const [a, b] = p.value();
    assert.equal(a.getDate(), 10, "earlier date sorted to position 0");
    assert.equal(b.getDate(), 20);
    p.destroy();
    teardownDOM();
});

test("constructor throws when minDate > maxDate", () => {
    setupDOM();
    assert.throws(() => createDatePicker({
        minDate: new Date(2026, 5, 20), maxDate: new Date(2026, 5, 10), today: TODAY,
    }), /minDate must be <= maxDate/);
    teardownDOM();
});

test("constructor throws on unknown mode", () => {
    setupDOM();
    assert.throws(() => createDatePicker({ mode: "multi", today: TODAY }), /mode must be/);
    teardownDOM();
});

// ─── viewMonth + focusedDate ──────────────────────────────────────────────

test("initial viewMonth follows today (or first value)", () => {
    setupDOM();
    const p = createDatePicker({ today: TODAY });   // June 2026
    const v = p.viewMonth();
    assert.equal(v.getFullYear(), 2026);
    assert.equal(v.getMonth(), 5);
    assert.equal(v.getDate(), 1, "viewMonth has day=1");
    p.destroy();
    teardownDOM();
});

test("initial viewMonth follows the first existing value over today", () => {
    setupDOM();
    const p = createDatePicker({
        today: TODAY,
        defaultValue: new Date(2027, 0, 15),  // Jan 2027
    });
    assert.equal(p.viewMonth().getFullYear(), 2027);
    assert.equal(p.viewMonth().getMonth(), 0);
    p.destroy();
    teardownDOM();
});

test("goToPrevMonth / goToNextMonth shift viewMonth and label updates", () => {
    const { picker, label } = build();
    assert.equal(picker.viewMonth().getMonth(), 5);    // June
    picker.goToPrevMonth();
    assert.equal(picker.viewMonth().getMonth(), 4);    // May
    assert.ok(label.textContent.toLowerCase().includes("may"));
    picker.goToNextMonth();
    picker.goToNextMonth();
    assert.equal(picker.viewMonth().getMonth(), 6);    // July
    picker.destroy();
    teardownDOM();
});

test("attachPrevMonth / attachNextMonth buttons shift viewMonth on click", () => {
    const { picker, prev, next } = build();
    dispatchClick(prev);
    assert.equal(picker.viewMonth().getMonth(), 4);    // May
    dispatchClick(next);
    dispatchClick(next);
    assert.equal(picker.viewMonth().getMonth(), 6);    // July
    picker.destroy();
    teardownDOM();
});

// ─── getDaysInView ─────────────────────────────────────────────────────────

test("getDaysInView returns 42 cells starting on weekStartsOn day-of-week", () => {
    const { picker } = build();
    const days = picker.getDaysInView();
    assert.equal(days.length, 42);
    assert.equal(days[0].getDay(), 0, "starts on Sunday by default (weekStartsOn=0)");
    picker.destroy();
    teardownDOM();
});

test("weekStartsOn=1 (Monday) shifts the grid", () => {
    setupDOM();
    const p = createDatePicker({ today: TODAY, weekStartsOn: 1 });
    const days = p.getDaysInView();
    assert.equal(days[0].getDay(), 1, "grid starts on Monday");
    p.destroy();
    teardownDOM();
});

test("June 2026 starts with May 31 (Sunday-start week)", () => {
    const { picker } = build();
    const days = picker.getDaysInView();
    // 2026-06-01 is Monday; with weekStartsOn=0 the grid starts with the
    // previous Sunday = May 31.
    assert.equal(days[0].getFullYear(), 2026);
    assert.equal(days[0].getMonth(), 4);   // May
    assert.equal(days[0].getDate(), 31);
    picker.destroy();
    teardownDOM();
});

// ─── attachDay + ARIA painting ────────────────────────────────────────────

test("attached cells get role=gridcell and data-date", () => {
    const { picker, grid } = build();
    const cells = renderCells(picker, grid);
    for (const c of cells) {
        assert.equal(c.el.getAttribute("role"), "gridcell");
        assert.ok(c.el.getAttribute("data-date"));
    }
    picker.destroy();
    teardownDOM();
});

test("today cell gets data-today + aria-current=date", () => {
    const { picker, grid } = build();
    const cells = renderCells(picker, grid);
    const todayCell = cells.find((c) =>
        c.date.getFullYear() === 2026 && c.date.getMonth() === 5 && c.date.getDate() === 11);
    assert.ok(todayCell, "found today cell");
    assert.equal(todayCell.el.hasAttribute("data-today"), true);
    assert.equal(todayCell.el.getAttribute("aria-current"), "date");
    picker.destroy();
    teardownDOM();
});

test("padding days from prev month get data-outside-month", () => {
    const { picker, grid } = build();
    const cells = renderCells(picker, grid);
    const may31 = cells[0];   // first cell of grid is May 31 in June 2026 view
    assert.equal(may31.el.getAttribute("data-outside-month"), "");
    // a day inside June does not have it
    const jun5 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 5);
    assert.equal(jun5.el.hasAttribute("data-outside-month"), false);
    picker.destroy();
    teardownDOM();
});

test("focused cell has tabindex=0, others tabindex=-1", () => {
    const { picker, grid } = build();
    const cells = renderCells(picker, grid);
    // focused is today (June 11)
    let tabbable = 0;
    for (const c of cells) {
        if (c.el.getAttribute("tabindex") === "0") tabbable++;
    }
    assert.equal(tabbable, 1);
    picker.destroy();
    teardownDOM();
});

// ─── picking: single mode ──────────────────────────────────────────────────

test("clicking a cell in single mode sets the value", () => {
    const { picker, grid } = build();
    const cells = renderCells(picker, grid);
    const jun15 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 15);
    dispatchClick(jun15.el);
    const v = picker.value();
    assert.equal(v.length, 1);
    assert.equal(v[0].getDate(), 15);
    assert.equal(jun15.el.getAttribute("data-selected"), "");
    assert.equal(jun15.el.getAttribute("aria-selected"), "true");
    picker.destroy();
    teardownDOM();
});

test("onValueChange fires with the new array", () => {
    setupDOM();
    const calls = [];
    const grid = document.createElement("div");
    document.body.appendChild(grid);
    const picker = createDatePicker({
        today: TODAY,
        onValueChange: (v, reason) => calls.push({ v: v.map((d) => d?.getDate() ?? null), reason }),
    });
    picker.attachGrid(grid);
    const cells = renderCells(picker, grid);
    const jun20 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 20);
    dispatchClick(jun20.el);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { v: [20], reason: "pick" });
    picker.destroy();
    teardownDOM();
});

// ─── picking: range mode ───────────────────────────────────────────────────

test("range mode: first click sets start, second click completes the range", () => {
    const { picker, grid } = build({ mode: "range" });
    const cells = renderCells(picker, grid);
    const jun10 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 10);
    const jun20 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 20);

    dispatchClick(jun10.el);
    let v = picker.value();
    assert.equal(v[0].getDate(), 10);
    assert.equal(v[1], null);

    dispatchClick(jun20.el);
    v = picker.value();
    assert.equal(v[0].getDate(), 10);
    assert.equal(v[1].getDate(), 20);
    picker.destroy();
    teardownDOM();
});

test("range mode: second click before start swaps the order", () => {
    const { picker, grid } = build({ mode: "range" });
    const cells = renderCells(picker, grid);
    const jun20 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 20);
    const jun10 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 10);
    dispatchClick(jun20.el);
    dispatchClick(jun10.el);
    const v = picker.value();
    assert.equal(v[0].getDate(), 10, "swapped to sorted order");
    assert.equal(v[1].getDate(), 20);
    picker.destroy();
    teardownDOM();
});

test("range mode: third click resets to a new start (after both ends set)", () => {
    const { picker, grid } = build({ mode: "range" });
    const cells = renderCells(picker, grid);
    const jun10 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 10);
    const jun20 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 20);
    const jun25 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 25);
    dispatchClick(jun10.el);
    dispatchClick(jun20.el);
    dispatchClick(jun25.el);
    const v = picker.value();
    assert.equal(v[0].getDate(), 25, "reset to new start");
    assert.equal(v[1], null);
    picker.destroy();
    teardownDOM();
});

test("range mode: in-range cells get data-in-range, endpoints get extra markers", () => {
    const { picker, grid } = build({ mode: "range" });
    const cells = renderCells(picker, grid);
    const jun10 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 10);
    const jun15 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 15);
    const jun20 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 20);
    dispatchClick(jun10.el);
    dispatchClick(jun20.el);
    assert.equal(jun15.el.getAttribute("data-in-range"), "");
    assert.equal(jun10.el.getAttribute("data-range-start"), "");
    assert.equal(jun20.el.getAttribute("data-range-end"), "");
    picker.destroy();
    teardownDOM();
});

test("range mode: hover preview between start and pointer", () => {
    const { picker, grid } = build({ mode: "range" });
    const cells = renderCells(picker, grid);
    const jun10 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 10);
    const jun15 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 15);
    const jun20 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 20);

    dispatchClick(jun10.el);
    // hover jun20 -- pointerenter
    const e = new globalThis.Event("pointerenter", { bubbles: true });
    jun20.el.dispatchEvent(e);

    assert.equal(jun15.el.getAttribute("data-in-range-preview"), "");
    assert.equal(jun20.el.getAttribute("data-in-range-preview"), "");
    picker.destroy();
    teardownDOM();
});

// ─── keyboard nav ─────────────────────────────────────────────────────────

test("ArrowRight advances focused date by 1 day", () => {
    const { picker, grid } = build();
    renderCells(picker, grid);
    dispatchKey(grid, "ArrowRight");
    assert.equal(picker.focusedDate().getDate(), 12);    // 11 -> 12
    picker.destroy();
    teardownDOM();
});

test("ArrowDown advances focused date by 7 days", () => {
    const { picker, grid } = build();
    renderCells(picker, grid);
    dispatchKey(grid, "ArrowDown");
    assert.equal(picker.focusedDate().getDate(), 18);    // 11 -> 18
    picker.destroy();
    teardownDOM();
});

test("ArrowLeft past day 1 switches viewMonth to previous month", () => {
    const { picker, grid } = build({ defaultValue: new Date(2026, 5, 1) });
    renderCells(picker, grid);
    assert.equal(picker.focusedDate().getDate(), 1);
    assert.equal(picker.viewMonth().getMonth(), 5);
    dispatchKey(grid, "ArrowLeft");
    assert.equal(picker.focusedDate().getMonth(), 4, "moved to May");
    assert.equal(picker.focusedDate().getDate(), 31);
    assert.equal(picker.viewMonth().getMonth(), 4, "viewMonth followed");
    picker.destroy();
    teardownDOM();
});

test("PageDown jumps focused date by 1 month", () => {
    const { picker, grid } = build();
    renderCells(picker, grid);
    dispatchKey(grid, "PageDown");
    assert.equal(picker.focusedDate().getMonth(), 6, "moved to July");
    assert.equal(picker.focusedDate().getDate(), 11);
    picker.destroy();
    teardownDOM();
});

test("Shift+PageUp jumps focused date by 1 year", () => {
    const { picker, grid } = build();
    renderCells(picker, grid);
    dispatchKey(grid, "PageUp", { shiftKey: true });
    assert.equal(picker.focusedDate().getFullYear(), 2025);
    assert.equal(picker.focusedDate().getMonth(), 5);   // still June
    assert.equal(picker.focusedDate().getDate(), 11);
    picker.destroy();
    teardownDOM();
});

test("Enter on the grid picks the focused date", () => {
    const { picker, grid } = build();
    renderCells(picker, grid);
    dispatchKey(grid, "Enter");
    const v = picker.value();
    assert.equal(v[0].getDate(), 11);
    picker.destroy();
    teardownDOM();
});

test("Home moves focus to start of week (Sunday by default)", () => {
    const { picker, grid } = build();   // focused is June 11, a Thursday
    renderCells(picker, grid);
    dispatchKey(grid, "Home");
    // June 11 is Thursday; previous Sunday is June 7
    assert.equal(picker.focusedDate().getDate(), 7);
    picker.destroy();
    teardownDOM();
});

test("End moves focus to end of week", () => {
    const { picker, grid } = build();
    renderCells(picker, grid);
    dispatchKey(grid, "End");
    // June 11 Thu; next Saturday is June 13
    assert.equal(picker.focusedDate().getDate(), 13);
    picker.destroy();
    teardownDOM();
});

// ─── min / max constraints ─────────────────────────────────────────────────

test("cells outside [minDate, maxDate] get data-disabled and aria-disabled", () => {
    const { picker, grid } = build({
        minDate: new Date(2026, 5, 5),
        maxDate: new Date(2026, 5, 20),
    });
    const cells = renderCells(picker, grid);
    const jun3 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 3);
    const jun10 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 10);
    const jun25 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 25);
    assert.equal(jun3.el.getAttribute("data-disabled"), "");
    assert.equal(jun3.el.getAttribute("aria-disabled"), "true");
    assert.equal(jun10.el.hasAttribute("data-disabled"), false);
    assert.equal(jun25.el.getAttribute("data-disabled"), "");
    picker.destroy();
    teardownDOM();
});

test("clicking a disabled cell does not pick it", () => {
    const { picker, grid } = build({ minDate: new Date(2026, 5, 5) });
    const cells = renderCells(picker, grid);
    const jun3 = cells.find((c) => c.date.getMonth() === 5 && c.date.getDate() === 3);
    dispatchClick(jun3.el);
    assert.equal(picker.value()[0], null);
    picker.destroy();
    teardownDOM();
});

test("keyboard nav clamps within minDate/maxDate", () => {
    const { picker, grid } = build({
        defaultValue: new Date(2026, 5, 5),
        minDate: new Date(2026, 5, 5),
    });
    renderCells(picker, grid);
    dispatchKey(grid, "ArrowLeft");
    assert.equal(picker.focusedDate().getDate(), 5, "clamped at min");
    picker.destroy();
    teardownDOM();
});

// ─── attachDay idempotency ─────────────────────────────────────────────────

test("re-attaching the same element with a new date replaces the binding", () => {
    setupDOM();
    const grid = document.createElement("div");
    document.body.appendChild(grid);
    const picker = createDatePicker({ today: TODAY });
    picker.attachGrid(grid);
    const cell = document.createElement("button");
    grid.appendChild(cell);

    picker.attachDay(cell, new Date(2026, 5, 11));
    assert.equal(cell.getAttribute("data-today"), "");

    // re-attach the same element with a different date
    picker.attachDay(cell, new Date(2026, 5, 20));
    // new date is NOT today
    assert.equal(cell.hasAttribute("data-today"), false);
    // and clicking now picks the new date
    dispatchClick(cell);
    assert.equal(picker.value()[0].getDate(), 20);

    picker.destroy();
    teardownDOM();
});

// ─── lifecycle ─────────────────────────────────────────────────────────────

test("destroy clears ARIA and removes event listeners", () => {
    const { picker, grid } = build();
    const cells = renderCells(picker, grid);
    picker.destroy();
    for (const c of cells) {
        assert.equal(c.el.hasAttribute("role"), false);
        assert.equal(c.el.hasAttribute("data-date"), false);
    }
    // post-destroy keypress on grid does nothing (no throw)
    dispatchKey(grid, "ArrowRight");
    teardownDOM();
});

test("today is reactive when passed as a function (lite-time integration)", () => {
    setupDOM();
    let t = new Date(2026, 5, 11);
    const todayFn = () => t;
    const picker = createDatePicker({ today: todayFn });
    const grid = document.createElement("div");
    document.body.appendChild(grid);
    picker.attachGrid(grid);
    // The function is called inside the paint effect on every value/focused/view
    // change. Force a re-paint by changing viewMonth (within same value).
    const cell = document.createElement("button");
    grid.appendChild(cell);
    picker.attachDay(cell, new Date(2026, 5, 11));
    assert.equal(cell.getAttribute("data-today"), "");

    // simulate midnight rollover
    t = new Date(2026, 5, 12);
    picker.goToNextMonth();
    picker.goToPrevMonth();   // tickle viewMonth so the paint effect re-runs
    assert.equal(cell.hasAttribute("data-today"), false, "no longer today");

    // attach a fresh cell for the new today
    const cell2 = document.createElement("button");
    grid.appendChild(cell2);
    picker.attachDay(cell2, new Date(2026, 5, 12));
    assert.equal(cell2.getAttribute("data-today"), "");
    picker.destroy();
    teardownDOM();
});
