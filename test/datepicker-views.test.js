// datepicker-views.test.js
// v0.7: "days" | "months" | "years" view state machine, drilldown wiring,
// keyboard nav per view, label formatter, attach{Month,Year} idempotency.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, dispatchClick } from "./_setup.js";
import { createDatePicker } from "../src/datepicker/index.js";

const TODAY = new Date(2026, 5, 11);

// ─── helpers ───────────────────────────────────────────────────────────────

function build(opts = {}) {
    setupDOM();
    const grid = document.createElement("div");
    const label = document.createElement("h2");
    const prev = document.createElement("button");
    const next = document.createElement("button");
    document.body.append(label, prev, grid, next);
    const picker = createDatePicker({ today: TODAY, ...opts });
    picker.attachGrid(grid);
    picker.attachMonthLabel(label, { clickToCycle: true });
    picker.attachPrevMonth(prev);
    picker.attachNextMonth(next);
    return { picker, grid, label, prev, next };
}

function renderMonthCells(picker, grid) {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const months = picker.getMonthsInView();
    const cells = [];
    for (const m of months) {
        const c = document.createElement("button");
        c.textContent = m.toLocaleDateString(undefined, { month: "short" });
        grid.appendChild(c);
        picker.attachMonth(c, m);
        cells.push({ el: c, date: m });
    }
    return cells;
}

function renderYearCells(picker, grid) {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const years = picker.getYearsInView();
    const cells = [];
    for (const y of years) {
        const c = document.createElement("button");
        c.textContent = String(y.getFullYear());
        grid.appendChild(c);
        picker.attachYear(c, y);
        cells.push({ el: c, date: y });
    }
    return cells;
}

// ─── view state machine ───────────────────────────────────────────────────

test("default view is 'days'", () => {
    const { picker } = build();
    assert.equal(picker.view(), "days");
    picker.destroy();
    teardownDOM();
});

test("setView rejects unknown values", () => {
    const { picker } = build();
    assert.throws(() => picker.setView("decade"), /view must be/);
    picker.destroy();
    teardownDOM();
});

test("cycleView walks days -> months -> years -> days", () => {
    const { picker } = build();
    assert.equal(picker.view(), "days");
    picker.cycleView();
    assert.equal(picker.view(), "months");
    picker.cycleView();
    assert.equal(picker.view(), "years");
    picker.cycleView();
    assert.equal(picker.view(), "days");
    picker.destroy();
    teardownDOM();
});

test("clicking the month label cycles views (clickToCycle:true)", () => {
    const { picker, label } = build();
    assert.equal(picker.view(), "days");
    dispatchClick(label);
    assert.equal(picker.view(), "months");
    dispatchClick(label);
    assert.equal(picker.view(), "years");
    dispatchClick(label);
    assert.equal(picker.view(), "days");
    picker.destroy();
    teardownDOM();
});

test("clickToCycle:false (default) leaves the label inert", () => {
    setupDOM();
    const label = document.createElement("h2");
    document.body.appendChild(label);
    const picker = createDatePicker({ today: TODAY });
    picker.attachMonthLabel(label);  // no opts
    assert.equal(picker.view(), "days");
    dispatchClick(label);
    assert.equal(picker.view(), "days", "click was ignored");
    picker.destroy();
    teardownDOM();
});

test("data-view on the grid mirrors the view signal", () => {
    const { picker, grid } = build();
    assert.equal(grid.getAttribute("data-view"), "days");
    picker.setView("months");
    assert.equal(grid.getAttribute("data-view"), "months");
    picker.setView("years");
    assert.equal(grid.getAttribute("data-view"), "years");
    picker.destroy();
    teardownDOM();
});

// ─── label formatting per view ────────────────────────────────────────────

test("label is month+year in days view, year only in months, decade in years", () => {
    const { picker, label } = build();
    assert.ok(label.textContent.toLowerCase().includes("june"));
    assert.ok(label.textContent.includes("2026"));

    picker.setView("months");
    assert.equal(label.textContent.trim(), "2026");

    picker.setView("years");
    // 2026 decade -> 2020 .. 2029
    assert.ok(label.textContent.includes("2020"), "got: " + label.textContent);
    assert.ok(label.textContent.includes("2029"));
    picker.destroy();
    teardownDOM();
});

test("custom formatter wins, receives (viewMonth, view)", () => {
    setupDOM();
    const calls = [];
    const label = document.createElement("h2");
    document.body.appendChild(label);
    const picker = createDatePicker({ today: TODAY });
    picker.attachMonthLabel(label, {
        formatter: (v, view) => {
            calls.push({ year: v.getFullYear(), view });
            return view + ":" + v.getFullYear();
        },
    });
    assert.equal(label.textContent, "days:2026");
    picker.setView("months");
    assert.equal(label.textContent, "months:2026");
    picker.setView("years");
    assert.equal(label.textContent, "years:2026");
    assert.ok(calls.length >= 3);
    picker.destroy();
    teardownDOM();
});

test("v0.6 backward-compat: passing a function as second arg works as formatter", () => {
    setupDOM();
    const label = document.createElement("h2");
    document.body.appendChild(label);
    const picker = createDatePicker({ today: TODAY });
    picker.attachMonthLabel(label, (v) => "X" + v.getFullYear());
    assert.equal(label.textContent, "X2026");
    picker.destroy();
    teardownDOM();
});

// ─── getMonthsInView / getYearsInView ──────────────────────────────────────

test("getMonthsInView returns 12 cells Jan..Dec of viewMonth's year", () => {
    const { picker } = build();
    const months = picker.getMonthsInView();
    assert.equal(months.length, 12);
    assert.equal(months[0].getMonth(), 0);
    assert.equal(months[0].getDate(), 1);
    assert.equal(months[0].getFullYear(), 2026);
    assert.equal(months[11].getMonth(), 11);
    picker.destroy();
    teardownDOM();
});

test("getYearsInView returns 12 cells: 1 before + 10 in decade + 1 after", () => {
    const { picker } = build();
    const years = picker.getYearsInView();
    assert.equal(years.length, 12);
    // 2026 decade is 2020..2029; padding year before = 2019, after = 2030
    assert.equal(years[0].getFullYear(),  2019);
    assert.equal(years[1].getFullYear(),  2020);
    assert.equal(years[10].getFullYear(), 2029);
    assert.equal(years[11].getFullYear(), 2030);
    picker.destroy();
    teardownDOM();
});

// ─── prev/next stride by view ─────────────────────────────────────────────

test("prev/next button strides by month in days, year in months, decade in years", () => {
    const { picker, prev, next } = build();
    assert.equal(picker.viewMonth().getMonth(), 5);
    dispatchClick(next);
    assert.equal(picker.viewMonth().getMonth(), 6, "+1 month in days view");

    picker.setView("months");
    const yearBefore = picker.viewMonth().getFullYear();
    dispatchClick(next);
    assert.equal(picker.viewMonth().getFullYear(), yearBefore + 1, "+1 year in months view");

    picker.setView("years");
    const yearBefore2 = picker.viewMonth().getFullYear();
    dispatchClick(prev);
    assert.equal(picker.viewMonth().getFullYear(), yearBefore2 - 10, "-1 decade in years view");
    picker.destroy();
    teardownDOM();
});

// ─── attachMonth: paint + state ───────────────────────────────────────────

test("attached month cell gets role=gridcell + data-cell-kind=month", () => {
    const { picker, grid } = build({ defaultValue: new Date(2026, 5, 15) });
    picker.setView("months");
    const cells = renderMonthCells(picker, grid);
    for (const c of cells) {
        assert.equal(c.el.getAttribute("role"), "gridcell");
        assert.equal(c.el.getAttribute("data-cell-kind"), "month");
        assert.ok(c.el.getAttribute("data-month-key"));
    }
    picker.destroy();
    teardownDOM();
});

test("month cell containing the selected day gets data-selected", () => {
    const { picker, grid } = build({ defaultValue: new Date(2026, 5, 15) });
    picker.setView("months");
    const cells = renderMonthCells(picker, grid);
    const june = cells.find((c) => c.date.getMonth() === 5);
    assert.equal(june.el.getAttribute("data-selected"), "");
    const jan = cells.find((c) => c.date.getMonth() === 0);
    assert.equal(jan.el.hasAttribute("data-selected"), false);
    picker.destroy();
    teardownDOM();
});

test("month cell matching viewMonth gets data-current", () => {
    const { picker, grid } = build();
    picker.setView("months");
    const cells = renderMonthCells(picker, grid);
    const june = cells.find((c) => c.date.getMonth() === 5);
    assert.equal(june.el.getAttribute("data-current"), "");
    picker.destroy();
    teardownDOM();
});

test("clicking a month cell drills down to days view with viewMonth set", () => {
    const { picker, grid } = build();
    picker.setView("months");
    const cells = renderMonthCells(picker, grid);
    const sep = cells.find((c) => c.date.getMonth() === 8);   // September
    dispatchClick(sep.el);
    assert.equal(picker.view(), "days", "drilled back to days");
    assert.equal(picker.viewMonth().getMonth(), 8);
    assert.equal(picker.viewMonth().getFullYear(), 2026);
    picker.destroy();
    teardownDOM();
});

// ─── attachYear: paint + state ────────────────────────────────────────────

test("year cells outside the decade get data-outside-decade", () => {
    const { picker, grid } = build();
    picker.setView("years");
    const cells = renderYearCells(picker, grid);
    // 2019 is before decade, 2030 is after
    const c2019 = cells.find((c) => c.date.getFullYear() === 2019);
    const c2025 = cells.find((c) => c.date.getFullYear() === 2025);
    const c2030 = cells.find((c) => c.date.getFullYear() === 2030);
    assert.equal(c2019.el.getAttribute("data-outside-decade"), "");
    assert.equal(c2030.el.getAttribute("data-outside-decade"), "");
    assert.equal(c2025.el.hasAttribute("data-outside-decade"), false);
    picker.destroy();
    teardownDOM();
});

test("year cell containing a selected date gets data-selected", () => {
    const { picker, grid } = build({ defaultValue: new Date(2027, 3, 5) });
    picker.setView("years");
    const cells = renderYearCells(picker, grid);
    const c2027 = cells.find((c) => c.date.getFullYear() === 2027);
    const c2025 = cells.find((c) => c.date.getFullYear() === 2025);
    assert.equal(c2027.el.getAttribute("data-selected"), "");
    assert.equal(c2025.el.hasAttribute("data-selected"), false);
    picker.destroy();
    teardownDOM();
});

test("clicking a year drills down to months view with viewMonth's year set", () => {
    const { picker, grid } = build();
    picker.setView("years");
    const cells = renderYearCells(picker, grid);
    const c2028 = cells.find((c) => c.date.getFullYear() === 2028);
    dispatchClick(c2028.el);
    assert.equal(picker.view(), "months", "drilled to months");
    assert.equal(picker.viewMonth().getFullYear(), 2028);
    picker.destroy();
    teardownDOM();
});

// ─── keyboard nav per view ────────────────────────────────────────────────

test("months view: ArrowRight steps focused date by 1 month", () => {
    const { picker, grid } = build();
    picker.setView("months");
    renderMonthCells(picker, grid);
    dispatchKey(grid, "ArrowRight");
    assert.equal(picker.focusedDate().getMonth(), 6, "Jun -> Jul");
    picker.destroy();
    teardownDOM();
});

test("months view: ArrowDown steps by 3 months (3-col grid layout)", () => {
    const { picker, grid } = build();
    picker.setView("months");
    renderMonthCells(picker, grid);
    dispatchKey(grid, "ArrowDown");
    assert.equal(picker.focusedDate().getMonth(), 8, "Jun -> Sep");
    picker.destroy();
    teardownDOM();
});

test("months view: Home jumps focus to January, End to December", () => {
    const { picker, grid } = build();
    picker.setView("months");
    renderMonthCells(picker, grid);
    dispatchKey(grid, "Home");
    assert.equal(picker.focusedDate().getMonth(), 0);
    dispatchKey(grid, "End");
    assert.equal(picker.focusedDate().getMonth(), 11);
    picker.destroy();
    teardownDOM();
});

test("months view: Enter drills down to days with focused month as viewMonth", () => {
    const { picker, grid } = build();
    picker.setView("months");
    renderMonthCells(picker, grid);
    dispatchKey(grid, "ArrowRight");   // focus = July
    dispatchKey(grid, "ArrowRight");   // focus = August
    dispatchKey(grid, "Enter");
    assert.equal(picker.view(), "days");
    assert.equal(picker.viewMonth().getMonth(), 7, "August is now the viewMonth");
    picker.destroy();
    teardownDOM();
});

test("months view: PageUp/PageDown steps by year", () => {
    const { picker, grid } = build();
    picker.setView("months");
    renderMonthCells(picker, grid);
    const beforeYear = picker.focusedDate().getFullYear();
    dispatchKey(grid, "PageDown");
    assert.equal(picker.focusedDate().getFullYear(), beforeYear + 1);
    dispatchKey(grid, "PageUp");
    assert.equal(picker.focusedDate().getFullYear(), beforeYear);
    picker.destroy();
    teardownDOM();
});

test("years view: ArrowRight steps by 1 year, ArrowDown by 3", () => {
    const { picker, grid } = build();
    picker.setView("years");
    renderYearCells(picker, grid);
    const yearBefore = picker.focusedDate().getFullYear();
    dispatchKey(grid, "ArrowRight");
    assert.equal(picker.focusedDate().getFullYear(), yearBefore + 1);
    dispatchKey(grid, "ArrowDown");
    assert.equal(picker.focusedDate().getFullYear(), yearBefore + 4);
    picker.destroy();
    teardownDOM();
});

test("years view: PageDown strides a decade (10 years)", () => {
    const { picker, grid } = build();
    picker.setView("years");
    renderYearCells(picker, grid);
    const yearBefore = picker.focusedDate().getFullYear();
    dispatchKey(grid, "PageDown");
    assert.equal(picker.focusedDate().getFullYear(), yearBefore + 10);
    picker.destroy();
    teardownDOM();
});

test("years view: Home/End jump to first/last year of the decade", () => {
    const { picker, grid } = build();
    picker.setView("years");
    renderYearCells(picker, grid);
    dispatchKey(grid, "Home");
    assert.equal(picker.focusedDate().getFullYear(), 2020);
    dispatchKey(grid, "End");
    assert.equal(picker.focusedDate().getFullYear(), 2029);
    picker.destroy();
    teardownDOM();
});

test("years view: Enter drills to months view with focused year applied", () => {
    const { picker, grid } = build();
    picker.setView("years");
    renderYearCells(picker, grid);
    dispatchKey(grid, "Home");        // focus 2020
    dispatchKey(grid, "ArrowRight");  // focus 2021
    dispatchKey(grid, "ArrowRight");  // focus 2022
    dispatchKey(grid, "Enter");
    assert.equal(picker.view(), "months");
    assert.equal(picker.viewMonth().getFullYear(), 2022);
    picker.destroy();
    teardownDOM();
});

// ─── attachMonth/attachYear idempotency ───────────────────────────────────

test("re-attaching same element with a new month replaces binding", () => {
    const { picker, grid } = build();
    picker.setView("months");
    const cell = document.createElement("button");
    grid.appendChild(cell);
    picker.attachMonth(cell, new Date(2026, 5, 1));
    assert.equal(cell.getAttribute("data-current"), "");
    // re-attach to Jan
    picker.attachMonth(cell, new Date(2026, 0, 1));
    assert.equal(cell.hasAttribute("data-current"), false, "no longer current");
    dispatchClick(cell);
    assert.equal(picker.viewMonth().getMonth(), 0, "click set viewMonth to Jan");
    picker.destroy();
    teardownDOM();
});

test("re-attaching year cells across decades works", () => {
    const { picker, grid } = build();
    picker.setView("years");
    const cell = document.createElement("button");
    grid.appendChild(cell);
    picker.attachYear(cell, new Date(2025, 0, 1));
    assert.equal(cell.hasAttribute("data-outside-decade"), false, "in current decade");
    picker.attachYear(cell, new Date(2031, 0, 1));
    assert.equal(cell.getAttribute("data-outside-decade"), "", "now outside");
    picker.destroy();
    teardownDOM();
});

// ─── full drilldown flow ──────────────────────────────────────────────────

test("full flow: days -> months -> years -> month -> day", () => {
    const { picker, grid, label } = build();
    // start in days view
    assert.equal(picker.view(), "days");

    // cycle to months via label click
    dispatchClick(label);
    assert.equal(picker.view(), "months");

    // cycle to years
    dispatchClick(label);
    assert.equal(picker.view(), "years");

    // render years cells, click 2027
    let cells = renderYearCells(picker, grid);
    dispatchClick(cells.find((c) => c.date.getFullYear() === 2027).el);
    assert.equal(picker.view(), "months");
    assert.equal(picker.viewMonth().getFullYear(), 2027);

    // render months cells, click March
    cells = renderMonthCells(picker, grid);
    dispatchClick(cells.find((c) => c.date.getMonth() === 2).el);
    assert.equal(picker.view(), "days");
    assert.equal(picker.viewMonth().getMonth(), 2);
    assert.equal(picker.viewMonth().getFullYear(), 2027);

    picker.destroy();
    teardownDOM();
});

// ─── destroy still cleans up new registries ───────────────────────────────

test("destroy clears month + year cell ARIA", () => {
    const { picker, grid } = build();
    picker.setView("months");
    const mCells = renderMonthCells(picker, grid);
    picker.setView("years");
    const yCells = renderYearCells(picker, grid);
    picker.destroy();
    // since we destroyed, both registries should be cleared and elements stripped
    for (const c of mCells) assert.equal(c.el.hasAttribute("role"), false);
    for (const c of yCells) assert.equal(c.el.hasAttribute("role"), false);
    teardownDOM();
});
