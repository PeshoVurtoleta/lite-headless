// @zakkster/lite-headless / datepicker / element.js
//
// <lite-date-picker mode="single">
//     <button data-prev-month aria-label="prev">‹</button>
//     <h2 data-month-label></h2>
//     <button data-next-month aria-label="next">›</button>
//     <div data-grid>
//         <!-- consumer either pre-renders cells with data-day, or lets
//              the element auto-render them when the view/viewMonth changes -->
//     </div>
// </lite-date-picker>
//
// Auto-rendering. If [data-grid] is empty at connect, the wrapper builds
// three cell pools (42 day buttons, 12 month buttons, 12 year buttons),
// hidden via display:none on the pools not matching the current view. The
// grid's `data-view` attribute (driven by the primitive) is the CSS hook
// consumers use to lay out each pool. Repaint subscribes to BOTH
// `picker.viewMonth` and `picker.view` so month-nav AND view-cycling both
// refresh the visible pool.
//
// Pre-rendered. If [data-grid] is non-empty at connect, the wrapper
// treats whatever is there as the day cells (consumer markup). The cells
// are re-attached to the primitive's date array on EVERY viewMonth change
// (the "dead grid" bug from v0.7.0 -- previously only attached once at
// mount, so "next month" updated state but not the visible dates). Pre-
// rendered markup currently only supports the days view; consumers wanting
// month/year drill-down should let the wrapper auto-render.
//
// Reactive attributes. v0.7.0 declared `observedAttributes: ["value",
// "disabled"]` but never read attribute changes. The wrapper now uses
// `scope.useAttr("value")` inside an effect: external setAttribute calls
// flow into the primitive via `picker.setValue`. Disabled syncing is
// deferred until the primitive exposes setDisabled (currently constructor-
// only); see the slider's element file for the same outstanding issue.
//
// Dispatches CustomEvent('valuechange', { detail: { value, reason } }) on
// the host on every change.

import { define } from "@zakkster/lite-element";
import { effect, signal as makeSignal } from "@zakkster/lite-signal";
import { createDatePicker } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-grid],[data-month-label],[data-prev-month],[data-next-month]";

define("lite-date-picker", (host, scope) => {
    const mode = host.getAttribute("mode") || "single";
    const weekStartsOn = parseInt(host.getAttribute("week-starts-on") || "0", 10);
    const minDate = host.getAttribute("min-date") ? new Date(host.getAttribute("min-date")) : null;
    const maxDate = host.getAttribute("max-date") ? new Date(host.getAttribute("max-date")) : null;

    function parseValueAttr(v) {
        if (!v) return mode === "range" ? [null, null] : [null];
        const parts = v.split(",");
        const dates = [];
        for (let i = 0; i < parts.length; i++) {
            const s = parts[i].trim();
            if (!s) continue;
            // "YYYY-MM-DD" is parsed by `new Date(s)` as UTC midnight per
            // ECMA-262, which shifts the calendar date in any non-UTC
            // timezone (a user in UTC+3 sees the day before; a user in
            // UTC-5 sees the day before for early-AM ISO times). For a
            // date picker the attribute should mean "calendar date" in
            // the consumer's local frame, so we parse "YYYY-MM-DD"
            // ourselves into a local-midnight Date. Other formats (full
            // ISO with timezone, RFC 2822, etc.) fall through to the
            // built-in parser unchanged.
            const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
            const d = m
                ? new Date(+m[1], +m[2] - 1, +m[3])
                : new Date(s);
            dates.push(Number.isNaN(d.getTime()) ? null : d);
        }
        return mode === "range" ? [dates[0] || null, dates[1] || null] : [dates[0] || null];
    }

    const valueSig = makeSignal(parseValueAttr(host.getAttribute("value")));

    const picker = createDatePicker({
        mode,
        value: valueSig,
        minDate, maxDate,
        weekStartsOn,
        disabled: host.hasAttribute("disabled"),
        onValueChange: (next, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value: next.slice(), reason }, bubbles: true,
            }));
        },
    });

    // ----- role wiring (label/prev/next) ---------------------------------
    // Grid is special: it needs cell-pool management on top of the
    // primitive's attachGrid/attachGridContainer, so we handle it separately
    // below.
    function wire(node) {
        if (node.hasAttribute("data-month-label")) {
            return picker.attachMonthLabel(node, { clickToCycle: true });
        }
        if (node.hasAttribute("data-prev-month")) return picker.attachPrevMonth(node);
        if (node.hasAttribute("data-next-month")) return picker.attachNextMonth(node);
        if (node.hasAttribute("data-grid")) return wireGrid(node);
        return null;
    }

    // ----- grid management -----------------------------------------------
    // Per-grid setup. Returns a single teardown that unwinds everything
    // (attachGrid + attachGridContainer + cell-pool + viewMonth/view
    // subscriptions).
    function wireGrid(gridEl) {
        const gridOff = picker.attachGrid(gridEl);
        const containerOff = picker.attachGridContainer(gridEl);

        const preExisting = gridEl.querySelectorAll("[data-day]");
        const useAutoRender = preExisting.length === 0;

        let dayCells = null;
        let monthCells = null;
        let yearCells = null;

        if (useAutoRender) {
            // Build three pools. The data-view attribute on the grid (kept in
            // sync by the primitive via attachGrid) is the CSS hook for
            // showing/hiding the pool that matches the current view.
            dayCells = createPool(gridEl, 42, "data-day", "lh-day-cell");
            monthCells = createPool(gridEl, 12, "data-month-cell", "lh-month-cell");
            yearCells = createPool(gridEl, 12, "data-year-cell", "lh-year-cell");
        } else {
            // Consumer pre-rendered day cells; collect them.
            dayCells = [];
            for (let i = 0; i < preExisting.length && i < 42; i++) dayCells.push(preExisting[i]);
            // No month/year pools -- the consumer is in charge.
        }

        function repaint() {
            const view = picker.view();
            if (view === "days") {
                togglePool(dayCells, true);
                if (monthCells) togglePool(monthCells, false);
                if (yearCells)  togglePool(yearCells, false);
                const days = picker.getDaysInView();
                for (let i = 0; i < dayCells.length && i < days.length; i++) {
                    if (useAutoRender) dayCells[i].textContent = String(days[i].getDate());
                    picker.attachDay(dayCells[i], days[i]);
                }
            } else if (view === "months" && monthCells) {
                togglePool(dayCells, false);
                togglePool(monthCells, true);
                if (yearCells) togglePool(yearCells, false);
                const months = picker.getMonthsInView();
                for (let i = 0; i < monthCells.length && i < months.length; i++) {
                    monthCells[i].textContent = MONTH_LABELS[months[i].getMonth()];
                    picker.attachMonth(monthCells[i], months[i]);
                }
            } else if (view === "years" && yearCells) {
                togglePool(dayCells, false);
                if (monthCells) togglePool(monthCells, false);
                togglePool(yearCells, true);
                const years = picker.getYearsInView();
                for (let i = 0; i < yearCells.length && i < years.length; i++) {
                    yearCells[i].textContent = String(years[i].getFullYear());
                    picker.attachYear(yearCells[i], years[i]);
                }
            }
            // (Pre-rendered, non-days view: nothing happens. Consumer is
            //  expected to handle drill-down themselves in that mode.)
        }

        repaint();
        const stopMonth = picker.viewMonth.subscribe(repaint);
        const stopView  = picker.view.subscribe(repaint);

        return () => {
            stopMonth();
            stopView();
            if (containerOff) containerOff();
            if (gridOff) gridOff();
            // Auto-rendered cells are children of the grid; remove them so a
            // detach/reattach doesn't leave stale pools behind.
            if (useAutoRender) {
                if (dayCells)   removePool(dayCells);
                if (monthCells) removePool(monthCells);
                if (yearCells)  removePool(yearCells);
            }
        };
    }

    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    // ----- reactive value attribute sync ---------------------------------
    // Uses lite-element's useAttr() to get a reactive getter; the effect
    // re-runs whenever the attribute changes externally. We skip the
    // initial run (the signal is already initialized from parseValueAttr).
    let _attrFirstRun = true;
    const valueAttr = scope.useAttr("value");
    const stopAttrSync = effect(() => {
        const raw = valueAttr();
        if (_attrFirstRun) { _attrFirstRun = false; return; }
        const parsed = parseValueAttr(raw);
        picker.setValue(parsed, "attribute");
    });

    Object.defineProperty(host, "value", { get: () => picker.value(), configurable: true });
    host.setValue = (v, reason) => picker.setValue(v, reason);

    scope.onCleanup(() => {
        stopAttrSync();
        roles.disconnect();
        picker.destroy();
    });
}, { observedAttributes: ["value", "disabled"] });

// ----- pool helpers ----------------------------------------------------

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function createPool(gridEl, n, roleAttr, className) {
    const out = new Array(n);
    for (let i = 0; i < n; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute(roleAttr, "");
        b.className = className;
        // Default-hide non-active pools; togglePool flips this.
        b.style.display = "none";
        gridEl.appendChild(b);
        out[i] = b;
    }
    return out;
}

function togglePool(cells, visible) {
    const d = visible ? "" : "none";
    for (let i = 0; i < cells.length; i++) {
        if (cells[i].style.display !== d) cells[i].style.display = d;
    }
}

function removePool(cells) {
    for (let i = 0; i < cells.length; i++) {
        const el = cells[i];
        if (el.parentNode) el.parentNode.removeChild(el);
    }
}
