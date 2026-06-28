// @zakkster/lite-headless / datepicker / index.js
//
// createDatePicker(options) -> DatePickerHandle
//
// Headless date-picker primitive. Like the slider, it's a form-control --
// no portal, no positioner, no dismiss layer. Consumer renders the calendar
// markup; the picker attaches behavior + ARIA + state.
//
// Value shape (matches the slider precedent): always an array.
//   single mode:  [Date | null]
//   range mode:   [Date | null, Date | null]
//
// In range mode, the array is sorted (start <= end) after a complete
// selection. While the user has clicked the start but not the end, the
// array is [startDate, null]. Clicking a third time resets to a new start.
//
// Hover preview: while [start, null], hovering a day cell adds
// data-in-range-preview to the cells between start and hover. Pure visual;
// no value mutation until click.
//
// "Today" comes from the `today` option which is:
//   - undefined (default): startOfDay(new Date()) computed at construction
//   - a Date: used as today
//   - a function: called and its return used. If reactive (a signal-like
//     getter that subscribes), the picker reacts to it via an effect --
//     drop-in for @zakkster/lite-time's midnight-rollover signal.
//
// No overlay machinery is used. The picker composes naturally with
// createPopover: wrap the consumer's calendar markup in a popover content
// element, and the popover's outside-click handling covers the cells via
// composedPath (they're descendants of the content tree).

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { uniqueId, setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";

// Module-scoped Intl.DateTimeFormat. Construction is non-trivial (locale
// resolution + options parsing); doing it on every effect run in the
// month-label paint allocates an object + a slew of intermediate
// records per repaint. The formatter itself is locale-aware (undefined
// locale = current browser locale, which is stable within a session);
// reusing one instance across all datepickers in the document is safe
// and saves ~20 microseconds + an allocation per repaint.
const _defaultMonthYearFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

// Pure label computation shared by the reactive effect and the
// initial-paint code in attachMonthLabel. Keeps the two call sites in
// sync without duplicating the branch ladder.
function computeMonthLabel(viewMonth, view, customFormatter) {
    if (customFormatter) return customFormatter(viewMonth, view);
    if (view === "days")   return _defaultMonthYearFormat.format(viewMonth);
    if (view === "months") return String(viewMonth.getFullYear());
    const r = decadeRange(viewMonth.getFullYear());
    return r.start + " \u2013 " + r.end;     // en-dash
}

// ----- date helpers (pure) ----------------------------------------------
//
// All math is day-precision. We do NOT touch hours/minutes/seconds beyond
// stripping them via startOfDay. DST happens automatically because we use
// Date constructor with (year, month, day) which respects local time --
// adding a day across a DST boundary stays correct.

function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function startOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}
function addMonths(d, n) {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function addYears(d, n) {
    return new Date(d.getFullYear() + n, d.getMonth(), 1);
}
function isSameDay(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
}
function isSameMonth(a, b) {
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}
function dayCmp(a, b) {
    // returns negative if a < b, 0 if a == b, positive if a > b (day-precision)
    const ay = a.getFullYear(), by = b.getFullYear();
    if (ay !== by) return ay - by;
    const am = a.getMonth(), bm = b.getMonth();
    if (am !== bm) return am - bm;
    return a.getDate() - b.getDate();
}
function isBefore(a, b) { return dayCmp(a, b) < 0; }
function isAfter(a, b)  { return dayCmp(a, b) > 0; }
function isInRange(d, lo, hi) {
    return !isBefore(d, lo) && !isAfter(d, hi);
}
function clampDate(d, lo, hi) {
    if (lo && isBefore(d, lo)) return startOfDay(lo);
    if (hi && isAfter(d, hi)) return startOfDay(hi);
    return startOfDay(d);
}

// Stable key for a day; used as Map key for the day-element registry.
function dayKey(d) {
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// Build the 42-cell array for a month view, given the day of week the week
// starts on. Padding days from prev/next month are included.
function buildDaysInView(monthDate, weekStartsOn) {
    const firstOfMonth = startOfMonth(monthDate);
    const offset = (firstOfMonth.getDay() - weekStartsOn + 7) % 7;
    const start = addDays(firstOfMonth, -offset);
    const out = new Array(42);
    for (let i = 0; i < 42; i++) {
        out[i] = addDays(start, i);
    }
    return out;
}

// Build the 12 months of a year (Jan..Dec) for the months view. All have day=1.
function buildMonthsInView(year) {
    const out = new Array(12);
    for (let i = 0; i < 12; i++) out[i] = new Date(year, i, 1);
    return out;
}

// A decade is the run of 10 years starting at (year - year%10). We return
// 12 cells: the year before the decade, the 10 in-decade years, and the
// year after -- with the 2 padding cells marked data-outside-decade.
// This matches the conventional year-picker layout (4 cols x 3 rows).
function buildYearsInView(year) {
    const decadeStart = Math.floor(year / 10) * 10;
    const out = new Array(12);
    for (let i = 0; i < 12; i++) {
        out[i] = new Date(decadeStart - 1 + i, 0, 1);
    }
    return out;
}

function decadeRange(year) {
    const start = Math.floor(year / 10) * 10;
    return { start, end: start + 9 };
}

function isInDecade(year, decadeStartYear) {
    return year >= decadeStartYear && year < decadeStartYear + 10;
}

// Stable keys for month/year cells.
function monthKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1); }
function yearKey(d)  { return String(d.getFullYear()); }

// Normalize an arbitrary value input into a fixed-length array for the
// given mode. Accepts Date | null | array | undefined.
function normalizeValue(v, mode) {
    if (mode === "range") {
        if (!Array.isArray(v)) {
            // accept null/undefined for empty range
            return [null, null];
        }
        const a = v[0] ? startOfDay(v[0]) : null;
        const b = v[1] ? startOfDay(v[1]) : null;
        // sort if both present
        if (a && b && isAfter(a, b)) return [b, a];
        return [a, b];
    }
    // single mode
    if (v == null) return [null];
    if (Array.isArray(v)) return [v[0] ? startOfDay(v[0]) : null];
    return [startOfDay(v)];
}

// ----- main factory ------------------------------------------------------

export function createDatePicker(options = {}) {
    const {
        mode = "single",                        // "single" | "range"
        value: externalValue,
        defaultValue,
        onValueChange,
        minDate,
        maxDate,
        weekStartsOn = 0,                       // 0=Sunday ... 6=Saturday
        now: nowFn = () => new Date(),
        today: todayOpt,                        // undefined | Date | () => Date
        disabled = false,
    } = options;

    if (mode !== "single" && mode !== "range") {
        throw new Error("[lite-headless datepicker] mode must be 'single' or 'range'");
    }
    if (minDate && maxDate && isAfter(startOfDay(minDate), startOfDay(maxDate))) {
        throw new Error("[lite-headless datepicker] minDate must be <= maxDate");
    }

    const _min = minDate ? startOfDay(minDate) : null;
    const _max = maxDate ? startOfDay(maxDate) : null;

    // ----- value signal --------------------------------------------------
    const _initial = externalValue
        ? normalizeValue(externalValue(), mode)
        : normalizeValue(defaultValue, mode);
    const _value = externalValue || makeSignal(_initial);
    if (!externalValue) _value.set(_initial);

    // ----- "today" -------------------------------------------------------
    // If todayOpt is a function, treat it as signal-like and run inside an
    // effect so we re-render when it updates (e.g. lite-time's midnight tick).
    // Otherwise compute once.
    const _todayFn = typeof todayOpt === "function" ? todayOpt : null;
    let _today = startOfDay(todayOpt instanceof Date ? todayOpt : nowFn());

    // ----- focused/view state -------------------------------------------
    // focusedDate is where the keyboard cursor is.
    // viewMonth is the month being displayed (day=1).
    // Both are signals so consumers can re-render reactively.
    const _focusedDate = makeSignal(initialFocused());
    const _viewMonth   = makeSignal(startOfMonth(_focusedDate()));

    // hover preview for range mode (the cell the pointer is over while
    // start is set but end is not)
    const _hoverDate = makeSignal(null);

    function initialFocused() {
        const v = _value();
        for (let i = 0; i < v.length; i++) {
            if (v[i]) return v[i];
        }
        if (_today) return clampDate(_today, _min, _max);
        return _min || new Date(2026, 0, 1);
    }

    // ----- registries ---------------------------------------------------
    let _grid = null;
    let _monthLabel = null;
    let _prevBtn = null;
    let _nextBtn = null;
    const _dayElements   = new Map();    // dayKey -> { el, date }
    const _monthElements = new Map();    // monthKey -> { el, date }
    const _yearElements  = new Map();    // yearKey -> { el, date }
    const _cellOffs      = new WeakMap();    // el -> off function (per-cell cleanup)
    const _cleanups = [];
    let _destroyed = false;

    // v0.7: view signal. "days" (default) | "months" | "years". Drives
    // both the label formatter and the keyboard nav. Click month label to
    // cycle up; click a month/year cell to drill back down.
    const _view = makeSignal("days");
    // The "anchor year" for the months view (which year's 12 months we show)
    // and for the years view (which decade we show, determined by anchor%10).
    // Driven by _viewMonth's getFullYear() but can be set explicitly via
    // setView.
    function viewAnchorYear() { return _viewMonth().getFullYear(); }

    // ----- mutation helpers ---------------------------------------------
    function arrayEq(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (a[i] === b[i]) continue;
            if (!a[i] || !b[i]) return false;
            if (!isSameDay(a[i], b[i])) return false;
        }
        return true;
    }
    function setValue(next, reason) {
        const norm = normalizeValue(next, mode);
        if (arrayEq(_value(), norm)) return;
        _value.set(norm);
        if (onValueChange) {
            try { onValueChange(norm.slice(), reason); } catch { /* swallow */ }
        }
    }

    function isCellDisabled(date) {
        if (disabled) return true;
        if (_min && isBefore(date, _min)) return true;
        if (_max && isAfter(date, _max)) return true;
        return false;
    }

    // Click handling. Modal semantics:
    //   single: replace value with [date]
    //   range:  if both ends set, OR only end set, start a new range = [date, null]
    //           if only start set, complete the range with the second click
    function pickDate(date) {
        if (isCellDisabled(date)) return;
        const d = startOfDay(date);
        if (mode === "single") {
            setValue([d], "pick");
            return;
        }
        // range mode
        const [start, end] = _value();
        if (!start || (start && end)) {
            // start a new range
            setValue([d, null], "pick-start");
            _hoverDate.set(null);  // clear preview when we commit a new start
        } else {
            // completing the range
            if (isBefore(d, start)) {
                setValue([d, start], "pick-end");
            } else if (isSameDay(d, start)) {
                // clicking the same day twice -- treat as 1-day range
                setValue([start, start], "pick-end");
            } else {
                setValue([start, d], "pick-end");
            }
            _hoverDate.set(null);
        }
    }

    // ----- keyboard nav --------------------------------------------------
    function moveFocus(deltaDays) {
        const cur = _focusedDate() || _today;
        let next = addDays(cur, deltaDays);
        next = clampDate(next, _min, _max);
        _focusedDate.set(next);
        // if next is in a different month, switch view
        if (!isSameMonth(next, _viewMonth())) {
            _viewMonth.set(startOfMonth(next));
        }
    }
    function moveFocusMonths(deltaMonths) {
        const cur = _focusedDate() || _today;
        // try same day-of-month in target month; if out of range, clamp to last day
        const target = new Date(cur.getFullYear(), cur.getMonth() + deltaMonths, cur.getDate());
        // if Date overshot to next month (e.g. Jan 31 + 1 month -> Mar 3), pin to last day of target
        const expectedMonth = ((cur.getMonth() + deltaMonths) % 12 + 12) % 12;
        let next;
        if (target.getMonth() !== expectedMonth) {
            next = new Date(cur.getFullYear() + Math.floor((cur.getMonth() + deltaMonths) / 12), expectedMonth + 1, 0);
        } else {
            next = target;
        }
        next = clampDate(next, _min, _max);
        _focusedDate.set(next);
        if (!isSameMonth(next, _viewMonth())) _viewMonth.set(startOfMonth(next));
    }
    function moveFocusYears(deltaYears) {
        moveFocusMonths(deltaYears * 12);
    }
    function focusStartOfWeek() {
        const cur = _focusedDate() || _today;
        const dow = cur.getDay();
        const offset = (dow - weekStartsOn + 7) % 7;
        moveFocus(-offset);
    }
    function focusEndOfWeek() {
        const cur = _focusedDate() || _today;
        const dow = cur.getDay();
        const offset = (dow - weekStartsOn + 7) % 7;
        moveFocus(6 - offset);
    }

    // ----- reactive cell painters ---------------------------------------
    // One effect updates per-cell ARIA + data attributes whenever any of
    // value, focusedDate, today, hoverDate, or viewMonth changes.
    const stopCellPaint = effect(() => {
        // read all the inputs so the effect re-runs on any change
        const values = _value();
        const focused = _focusedDate();
        const hover = _hoverDate();
        const view = _viewMonth();
        // pull today from the reactive function if provided
        if (_todayFn) {
            const t = _todayFn();
            if (t instanceof Date) _today = startOfDay(t);
        }

        // range info
        let rangeLo = null, rangeHi = null;
        let previewLo = null, previewHi = null;
        if (mode === "range") {
            if (values[0] && values[1]) {
                rangeLo = values[0]; rangeHi = values[1];
            } else if (values[0] && !values[1] && hover) {
                if (isBefore(hover, values[0])) {
                    previewLo = hover; previewHi = values[0];
                } else {
                    previewLo = values[0]; previewHi = hover;
                }
            }
        }

        // iterate every registered cell
        // Capture whether DOM focus is currently INSIDE the grid so we
        // know whether to move it along with the roving tabindex.
        let _hadFocusInGrid = false;
        if (typeof document !== "undefined") {
            const ae = document.activeElement;
            if (ae) {
                for (const entry of _dayElements.values()) {
                    if (entry.el === ae) { _hadFocusInGrid = true; break; }
                }
            }
        }

        for (const entry of _dayElements.values()) {
            const { el, date } = entry;
            const inMonth = isSameMonth(date, view);
            const selected = mode === "single"
                ? isSameDay(date, values[0])
                : (isSameDay(date, values[0]) || isSameDay(date, values[1]));
            const inRange = rangeLo && isInRange(date, rangeLo, rangeHi);
            const inPreview = previewLo && isInRange(date, previewLo, previewHi);
            const isFoc = isSameDay(date, focused);
            const isToday = _today && isSameDay(date, _today);
            const cellDisabled = isCellDisabled(date);

            // Boolean attributes use toggleAttr to skip the DOM write
            // when state hasn't changed (typical case in a 42-cell grid
            // where a range-hover preview moves the right edge by one).
            toggleAttr(el, "data-outside-month", !inMonth);
            toggleAttr(el, "data-selected", selected);
            setAttr(el, "aria-selected", selected ? "true" : "false");
            toggleAttr(el, "data-in-range", !!inRange);
            toggleAttr(el, "data-in-range-preview", !!inPreview);

            // range endpoints get extra data attributes for asymmetric styling
            if (mode === "range") {
                toggleAttr(el, "data-range-start", !!(rangeLo && isSameDay(date, rangeLo)));
                toggleAttr(el, "data-range-end", !!(rangeHi && isSameDay(date, rangeHi)));
            }

            toggleAttr(el, "data-today", !!isToday);
            setAttr(el, "aria-current", isToday ? "date" : null);

            toggleAttr(el, "data-disabled", cellDisabled);
            setAttr(el, "aria-disabled", cellDisabled ? "true" : null);

            // roving tabindex: only the focused cell is tabbable
            setAttr(el, "tabindex", isFoc ? "0" : "-1");
            toggleAttr(el, "data-focused", isFoc);
        }

        // Roving tabindex demands that DOM focus follow the active cell
        // when keyboard nav is happening INSIDE the grid (otherwise the
        // user's focus is stranded on a cell that now has tabindex=-1).
        //
        // We defer to a microtask for two reasons:
        //   1. On a view-month change, consumer-side subscribers (the
        //      fixture's repaint, or any wrapper that owns cell DOM) may
        //      re-attach the same physical cell elements with NEW dates.
        //      Resolving the focus target by date AFTER those subscribers
        //      finish guarantees we land on the cell that currently shows
        //      the focused date, not on the slot it occupied before the
        //      re-attach.
        //   2. queueMicrotask drains within the current task, so the focus
        //      lands before the next paint and well before any subsequent
        //      keypress -- no visible lag.
        //
        // The day-view gate (`_view() === "days"`) keeps the month-paint
        // and year-paint effects below from competing for focus when we're
        // on a different view.
        if (_hadFocusInGrid && _view() === "days"
            && typeof queueMicrotask === "function"
            && typeof document !== "undefined") {
            queueMicrotask(() => {
                if (_destroyed || _view() !== "days") return;
                const f = _focusedDate();
                if (!f) return;
                const entry = _dayElements.get(dayKey(f));
                if (!entry || !entry.el) return;
                if (document.activeElement === entry.el) return;
                try { entry.el.focus({ preventScroll: true }); }
                catch { /* element may be detached; harmless */ }
            });
        }
    });
    _cleanups.push(stopCellPaint);

    // viewMonth -> month label text
    const stopMonthLabel = effect(() => {
        const v = _viewMonth();
        const view = _view();
        if (!_monthLabel) return;
        const next = computeMonthLabel(v, view, _monthLabelFormatter);
        if (_monthLabel.textContent !== next) _monthLabel.textContent = next;
    });
    _cleanups.push(stopMonthLabel);

    let _monthLabelFormatter = null;

    // ----- attach methods ----------------------------------------------
    function attachGrid(el) {
        if (!el || _destroyed) return noop;
        _grid = el;
        ensureId(el, "lh-dp-grid");
        setAttr(el, "role", "grid");
        if (_monthLabel) addIdToken(el, "aria-labelledby", _monthLabel.id);
        setAttr(el, "data-mode", mode);
        setAttr(el, "data-view", _view());
        if (disabled) setAttr(el, "aria-disabled", "true");

        // keep data-view in sync with the signal so consumer CSS can react
        const stopViewAttr = effect(() => setAttr(el, "data-view", _view()));
        _cleanups.push(stopViewAttr);

        // keyboard listener lives on the grid since focus moves around it.
        // Branches by view: days = 1 day per arrow / 7 per row; months = 1
        // month per arrow / 3 per row; years = 1 year per arrow / 3 per row.
        const onKey = (e) => {
            const k = e.key;
            if (disabled) return;
            const view = _view();

            if (view === "days") {
                if (k === "ArrowLeft")       { e.preventDefault(); moveFocus(-1); }
                else if (k === "ArrowRight") { e.preventDefault(); moveFocus(1); }
                else if (k === "ArrowUp")    { e.preventDefault(); moveFocus(-7); }
                else if (k === "ArrowDown")  { e.preventDefault(); moveFocus(7); }
                else if (k === "PageUp")     {
                    e.preventDefault();
                    if (e.shiftKey) moveFocusYears(-1); else moveFocusMonths(-1);
                }
                else if (k === "PageDown")   {
                    e.preventDefault();
                    if (e.shiftKey) moveFocusYears(1); else moveFocusMonths(1);
                }
                else if (k === "Home")       { e.preventDefault(); focusStartOfWeek(); }
                else if (k === "End")        { e.preventDefault(); focusEndOfWeek(); }
                else if (k === "Enter" || k === " ") {
                    e.preventDefault();
                    const f = _focusedDate();
                    if (f) pickDate(f);
                }
            } else if (view === "months") {
                // 3-column grid; arrows step by 1 month, up/down step by 3
                if (k === "ArrowLeft")       { e.preventDefault(); moveFocusMonths(-1); }
                else if (k === "ArrowRight") { e.preventDefault(); moveFocusMonths(1); }
                else if (k === "ArrowUp")    { e.preventDefault(); moveFocusMonths(-3); }
                else if (k === "ArrowDown")  { e.preventDefault(); moveFocusMonths(3); }
                else if (k === "PageUp")     { e.preventDefault(); moveFocusYears(-1); }
                else if (k === "PageDown")   { e.preventDefault(); moveFocusYears(1); }
                else if (k === "Home")       { e.preventDefault(); setFocusedMonth(0); }
                else if (k === "End")        { e.preventDefault(); setFocusedMonth(11); }
                else if (k === "Enter" || k === " ") {
                    e.preventDefault();
                    // drill down: set viewMonth's month to focused, return to days view
                    const f = _focusedDate() || _viewMonth();
                    _viewMonth.set(new Date(f.getFullYear(), f.getMonth(), 1));
                    _view.set("days");
                }
            } else /* years */ {
                if (k === "ArrowLeft")       { e.preventDefault(); moveFocusYears(-1); }
                else if (k === "ArrowRight") { e.preventDefault(); moveFocusYears(1); }
                else if (k === "ArrowUp")    { e.preventDefault(); moveFocusYears(-3); }
                else if (k === "ArrowDown")  { e.preventDefault(); moveFocusYears(3); }
                else if (k === "PageUp")     { e.preventDefault(); moveFocusYears(-10); }
                else if (k === "PageDown")   { e.preventDefault(); moveFocusYears(10); }
                else if (k === "Home")       { e.preventDefault(); setFocusedYearInDecade(0); }
                else if (k === "End")        { e.preventDefault(); setFocusedYearInDecade(9); }
                else if (k === "Enter" || k === " ") {
                    e.preventDefault();
                    // drill down: set viewMonth's year to focused, switch to months view
                    const f = _focusedDate() || _viewMonth();
                    _viewMonth.set(new Date(f.getFullYear(), _viewMonth().getMonth(), 1));
                    _view.set("months");
                }
            }
        };
        el.addEventListener("keydown", onKey);

        const off = () => {
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("role");
            el.removeAttribute("data-mode");
            el.removeAttribute("data-view");
            el.removeAttribute("aria-disabled");
            if (_monthLabel) removeIdToken(el, "aria-labelledby", _monthLabel.id);
            if (_grid === el) _grid = null;
        };
        _cleanups.push(off);
        return off;
    }

    // helpers for months/years keyboard nav
    function setFocusedMonth(monthIdx) {
        const cur = _focusedDate() || _viewMonth();
        const next = new Date(cur.getFullYear(), monthIdx, 1);
        _focusedDate.set(clampDate(next, _min, _max));
    }
    function setFocusedYearInDecade(idxWithinDecade) {
        const r = decadeRange((_focusedDate() || _viewMonth()).getFullYear());
        const next = new Date(r.start + idxWithinDecade, 0, 1);
        _focusedDate.set(clampDate(next, _min, _max));
    }


    // attachDay is idempotent: re-attaching the same element with a new
    // date replaces the previous binding (the consumer can reuse cells
    // across month changes instead of churning DOM).
    function attachDay(el, date) {
        if (!el || _destroyed) return noop;
        const d = startOfDay(date);

        // detach previous binding for this element (if any)
        const prevOff = _cellOffs.get(el);
        if (prevOff) prevOff();

        ensureId(el, "lh-dp-day");
        setAttr(el, "role", "gridcell");
        el.setAttribute("data-date", dayKey(d));

        // unregister the old date entry if this element was previously
        // associated with a different date
        for (const [k, entry] of _dayElements) {
            if (entry.el === el && k !== dayKey(d)) {
                _dayElements.delete(k);
                break;
            }
        }
        _dayElements.set(dayKey(d), { el, date: d });

        const onClick = (e) => {
            e.preventDefault();
            if (isCellDisabled(d)) return;
            _focusedDate.set(d);
            if (!isSameMonth(d, _viewMonth())) _viewMonth.set(startOfMonth(d));
            pickDate(d);
        };
        const onPointerEnter = () => {
            if (isCellDisabled(d)) return;
            if (mode === "range") {
                const [start, end] = _value();
                if (start && !end) _hoverDate.set(d);
            }
        };
        const onPointerLeave = () => {
            // clear hover only when leaving the grid entirely; per-cell
            // pointer-leave events fire on every cross-cell move which would
            // cause flicker. We rely on a grid-level pointerleave (installed
            // separately on the grid element) to clear the preview.
        };
        const onFocus = () => {
            _focusedDate.set(d);
        };

        el.addEventListener("click", onClick);
        el.addEventListener("pointerenter", onPointerEnter);
        el.addEventListener("pointerleave", onPointerLeave);
        el.addEventListener("focus", onFocus);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("pointerenter", onPointerEnter);
            el.removeEventListener("pointerleave", onPointerLeave);
            el.removeEventListener("focus", onFocus);
            el.removeAttribute("role");
            el.removeAttribute("aria-selected");
            el.removeAttribute("aria-current");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("data-date");
            el.removeAttribute("data-selected");
            el.removeAttribute("data-in-range");
            el.removeAttribute("data-in-range-preview");
            el.removeAttribute("data-range-start");
            el.removeAttribute("data-range-end");
            el.removeAttribute("data-today");
            el.removeAttribute("data-outside-month");
            el.removeAttribute("data-focused");
            el.removeAttribute("data-disabled");
            el.removeAttribute("tabindex");
            // Only delete the _dayElements entry if it still points to THIS
            // cell. During a month change, the fixture (or any caller that
            // recycles cells) re-attaches each cell with a new date; if the
            // new date for cell-A happens to be the same key that cell-B
            // currently holds, our `set(key, …)` would overwrite cell-B's
            // entry. Then cell-B's own off() (about to run as its prevOff
            // when it gets re-attached) would unconditionally
            // `delete(dayKey(B's old d))` and erase our just-written entry
            // for cell-A. Guarding by element identity keeps stale off()s
            // from corrupting the map.
            const cur = _dayElements.get(dayKey(d));
            if (cur && cur.el === el) _dayElements.delete(dayKey(d));
            _cellOffs.delete(el);
        };
        _cellOffs.set(el, off);
        // Don't push to _cleanups -- per-cell offs are tracked via the
        // WeakMap and called explicitly on re-attach or on destroy via the
        // _dayElements walk.

        // Force one effect tick so the new cell paints immediately. The
        // existing effect won't re-run unless one of its tracked deps
        // changes; we touch _focusedDate to nudge it. Cheaper alternative:
        // call the paint logic inline here. We do that to avoid disturbing
        // the focused signal.
        paintCell(el, d);

        return off;
    }

    // Single-cell paint, used to repaint a freshly-attached cell without
    // tickling the global effect. Mirrors the effect logic above.
    function paintCell(el, date) {
        const values = _value();
        const focused = _focusedDate();
        const hover = _hoverDate();
        const view = _viewMonth();
        const inMonth = isSameMonth(date, view);
        const selected = mode === "single"
            ? isSameDay(date, values[0])
            : (isSameDay(date, values[0]) || isSameDay(date, values[1]));

        let inRange = false, inPreview = false;
        let rangeLo = null, rangeHi = null;
        if (mode === "range") {
            if (values[0] && values[1]) {
                rangeLo = values[0]; rangeHi = values[1];
                inRange = isInRange(date, rangeLo, rangeHi);
            } else if (values[0] && !values[1] && hover) {
                const lo = isBefore(hover, values[0]) ? hover : values[0];
                const hi = isBefore(hover, values[0]) ? values[0] : hover;
                inPreview = isInRange(date, lo, hi);
            }
        }
        const isFoc = isSameDay(date, focused);
        const isToday = _today && isSameDay(date, _today);
        const cellDisabled = isCellDisabled(date);

        if (inMonth) el.removeAttribute("data-outside-month");
        else el.setAttribute("data-outside-month", "");
        toggleAttr(el, "data-selected", selected);
        setAttr(el, "aria-selected", selected ? "true" : "false");
        toggleAttr(el, "data-in-range", !!inRange);
        toggleAttr(el, "data-in-range-preview", !!inPreview);
        if (mode === "range") {
            toggleAttr(el, "data-range-start", !!(rangeLo && isSameDay(date, rangeLo)));
            toggleAttr(el, "data-range-end", !!(rangeHi && isSameDay(date, rangeHi)));
        }
        toggleAttr(el, "data-today", !!isToday);
        setAttr(el, "aria-current", isToday ? "date" : null);
        toggleAttr(el, "data-disabled", cellDisabled);
        setAttr(el, "aria-disabled", cellDisabled ? "true" : null);
        setAttr(el, "tabindex", isFoc ? "0" : "-1");
        toggleAttr(el, "data-focused", isFoc);
    }

    // ─── months view ──────────────────────────────────────────────────
    //
    // attachMonth(el, monthDate) attaches a cell representing a month.
    // monthDate's year is what matters; the cell's "month index" is the
    // date's getMonth(). Idempotent on the same element.
    function attachMonth(el, monthDate) {
        if (!el || _destroyed) return noop;
        const m = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);

        const prevOff = _cellOffs.get(el);
        if (prevOff) prevOff();

        ensureId(el, "lh-dp-monthcell");
        setAttr(el, "role", "gridcell");
        setAttr(el, "data-cell-kind", "month");
        el.setAttribute("data-month-key", monthKey(m));

        for (const [k, entry] of _monthElements) {
            if (entry.el === el && k !== monthKey(m)) {
                _monthElements.delete(k);
                break;
            }
        }
        _monthElements.set(monthKey(m), { el, date: m });

        const onClick = (e) => {
            e.preventDefault();
            if (isCellDisabled(m)) return;
            _focusedDate.set(m);
            // drill back to days view, centered on this month
            _viewMonth.set(m);
            _view.set("days");
        };
        const onFocus = () => _focusedDate.set(m);
        el.addEventListener("click", onClick);
        el.addEventListener("focus", onFocus);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("focus", onFocus);
            el.removeAttribute("role");
            el.removeAttribute("data-cell-kind");
            el.removeAttribute("data-month-key");
            el.removeAttribute("aria-selected");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("aria-current");
            el.removeAttribute("data-selected");
            el.removeAttribute("data-current");
            el.removeAttribute("data-focused");
            el.removeAttribute("data-disabled");
            el.removeAttribute("tabindex");
            // See attachDay's off() for the rationale: only delete if
            // the entry still points to THIS cell.
            const cur = _monthElements.get(monthKey(m));
            if (cur && cur.el === el) _monthElements.delete(monthKey(m));
            _cellOffs.delete(el);
        };
        _cellOffs.set(el, off);
        paintMonthCell(el, m);
        return off;
    }

    function paintMonthCell(el, monthDate) {
        const values = _value();
        const focused = _focusedDate();
        const view = _viewMonth();
        // selected = any of the value dates fall inside this month/year
        const selected = values.some((d) =>
            d && d.getFullYear() === monthDate.getFullYear() &&
                 d.getMonth() === monthDate.getMonth());
        const isCurrent = view.getFullYear() === monthDate.getFullYear() &&
                          view.getMonth() === monthDate.getMonth();
        const isFoc = focused && focused.getFullYear() === monthDate.getFullYear() &&
                                 focused.getMonth() === monthDate.getMonth();
        // disabled if the entire month is outside [min, max]
        let cellDisabled = false;
        if (disabled) cellDisabled = true;
        else if (_min && new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0) < _min) cellDisabled = true;
        else if (_max && monthDate > _max) cellDisabled = true;

        toggleAttr(el, "data-selected", selected);
        setAttr(el, "aria-selected", selected ? "true" : "false");
        toggleAttr(el, "data-current", !!isCurrent);
        setAttr(el, "aria-current", isCurrent ? "true" : null);
        toggleAttr(el, "data-disabled", cellDisabled);
        setAttr(el, "aria-disabled", cellDisabled ? "true" : null);
        setAttr(el, "tabindex", isFoc ? "0" : "-1");
        toggleAttr(el, "data-focused", isFoc);
    }

    // Single effect repaints all month cells when value / focused / view changes
    const stopMonthPaint = effect(() => {
        _value(); _focusedDate(); _viewMonth();   // read deps
        // See day-paint above for the focus-follow rationale.
        let _hadFocusInGrid = false;
        if (typeof document !== "undefined") {
            const ae = document.activeElement;
            if (ae) {
                for (const entry of _monthElements.values()) {
                    if (entry.el === ae) { _hadFocusInGrid = true; break; }
                }
            }
        }
        for (const entry of _monthElements.values()) {
            paintMonthCell(entry.el, entry.date);
        }
        if (_hadFocusInGrid && _view() === "months"
            && typeof queueMicrotask === "function"
            && typeof document !== "undefined") {
            queueMicrotask(() => {
                if (_destroyed || _view() !== "months") return;
                const f = _focusedDate();
                if (!f) return;
                const entry = _monthElements.get(monthKey(f));
                if (!entry || !entry.el) return;
                if (document.activeElement === entry.el) return;
                try { entry.el.focus({ preventScroll: true }); }
                catch { /* swallow */ }
            });
        }
    });
    _cleanups.push(stopMonthPaint);

    // ─── years view ───────────────────────────────────────────────────
    function attachYear(el, yearDate) {
        if (!el || _destroyed) return noop;
        const y = new Date(yearDate.getFullYear(), 0, 1);

        const prevOff = _cellOffs.get(el);
        if (prevOff) prevOff();

        ensureId(el, "lh-dp-yearcell");
        setAttr(el, "role", "gridcell");
        setAttr(el, "data-cell-kind", "year");
        el.setAttribute("data-year-key", yearKey(y));

        for (const [k, entry] of _yearElements) {
            if (entry.el === el && k !== yearKey(y)) {
                _yearElements.delete(k);
                break;
            }
        }
        _yearElements.set(yearKey(y), { el, date: y });

        const onClick = (e) => {
            e.preventDefault();
            if (isCellDisabled(y)) return;
            _focusedDate.set(y);
            // drill back to months view of this year
            _viewMonth.set(new Date(y.getFullYear(), _viewMonth().getMonth(), 1));
            _view.set("months");
        };
        const onFocus = () => _focusedDate.set(y);
        el.addEventListener("click", onClick);
        el.addEventListener("focus", onFocus);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("focus", onFocus);
            el.removeAttribute("role");
            el.removeAttribute("data-cell-kind");
            el.removeAttribute("data-year-key");
            el.removeAttribute("aria-selected");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("aria-current");
            el.removeAttribute("data-selected");
            el.removeAttribute("data-current");
            el.removeAttribute("data-focused");
            el.removeAttribute("data-disabled");
            el.removeAttribute("data-outside-decade");
            el.removeAttribute("tabindex");
            // See attachDay's off() for the rationale.
            const cur = _yearElements.get(yearKey(y));
            if (cur && cur.el === el) _yearElements.delete(yearKey(y));
            _cellOffs.delete(el);
        };
        _cellOffs.set(el, off);
        paintYearCell(el, y);
        return off;
    }

    function paintYearCell(el, yearDate) {
        const values = _value();
        const focused = _focusedDate();
        const view = _viewMonth();
        const yearN = yearDate.getFullYear();
        const decade = decadeRange(view.getFullYear());
        const inDecade = isInDecade(yearN, decade.start);
        const selected = values.some((d) => d && d.getFullYear() === yearN);
        const isCurrent = view.getFullYear() === yearN;
        const isFoc = focused && focused.getFullYear() === yearN;
        let cellDisabled = false;
        if (disabled) cellDisabled = true;
        else if (_min && new Date(yearN + 1, 0, 0) < _min) cellDisabled = true;
        else if (_max && yearDate > _max) cellDisabled = true;

        toggleAttr(el, "data-outside-decade", !inDecade);
        toggleAttr(el, "data-selected", selected);
        setAttr(el, "aria-selected", selected ? "true" : "false");
        toggleAttr(el, "data-current", !!isCurrent);
        setAttr(el, "aria-current", isCurrent ? "true" : null);
        toggleAttr(el, "data-disabled", cellDisabled);
        setAttr(el, "aria-disabled", cellDisabled ? "true" : null);
        setAttr(el, "tabindex", isFoc ? "0" : "-1");
        toggleAttr(el, "data-focused", isFoc);
    }

    const stopYearPaint = effect(() => {
        _value(); _focusedDate(); _viewMonth();
        // See day-paint above for the focus-follow rationale.
        let _hadFocusInGrid = false;
        if (typeof document !== "undefined") {
            const ae = document.activeElement;
            if (ae) {
                for (const entry of _yearElements.values()) {
                    if (entry.el === ae) { _hadFocusInGrid = true; break; }
                }
            }
        }
        for (const entry of _yearElements.values()) {
            paintYearCell(entry.el, entry.date);
        }
        if (_hadFocusInGrid && _view() === "years"
            && typeof queueMicrotask === "function"
            && typeof document !== "undefined") {
            queueMicrotask(() => {
                if (_destroyed || _view() !== "years") return;
                const f = _focusedDate();
                if (!f) return;
                const entry = _yearElements.get(yearKey(f));
                if (!entry || !entry.el) return;
                if (document.activeElement === entry.el) return;
                try { entry.el.focus({ preventScroll: true }); }
                catch { /* swallow */ }
            });
        }
    });
    _cleanups.push(stopYearPaint);

    // Cycle the view: days -> months -> years -> days. The consumer wires
    // this to the month label click (or wherever). Going from years back
    // to days re-anchors the focused date to today (or first value) so the
    // user doesn't lose their place if they were just browsing decades.
    function cycleView() {
        const v = _view();
        if (v === "days") _view.set("months");
        else if (v === "months") _view.set("years");
        else _view.set("days");
    }

    // Prev/next buttons stride by the right unit for the current view:
    // -1 month in days view, -1 year in months view, -10 years (a decade)
    // in years view. Same for next.
    function stepView(direction) {
        const v = _view();
        if (v === "days")   _viewMonth.set(addMonths(_viewMonth(), direction));
        else if (v === "months") _viewMonth.set(addYears(_viewMonth(), direction));
        else /* years */    _viewMonth.set(addYears(_viewMonth(), direction * 10));
    }

    function attachPrevMonth(el) {
        if (!el || _destroyed) return noop;
        _prevBtn = el;
        setAttr(el, "aria-label", el.getAttribute("aria-label") || "Previous");
        const onClick = (e) => {
            e.preventDefault();
            if (disabled) return;
            stepView(-1);
        };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            if (_prevBtn === el) _prevBtn = null;
        };
        _cleanups.push(off);
        return off;
    }
    function attachNextMonth(el) {
        if (!el || _destroyed) return noop;
        _nextBtn = el;
        setAttr(el, "aria-label", el.getAttribute("aria-label") || "Next");
        const onClick = (e) => {
            e.preventDefault();
            if (disabled) return;
            stepView(1);
        };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            if (_nextBtn === el) _nextBtn = null;
        };
        _cleanups.push(off);
        return off;
    }
    // attachMonthLabel(el, opts?)
    //   opts.formatter(viewMonth, view): custom label formatter
    //   opts.clickToCycle: boolean = false -- when true, clicking the label
    //                                          cycles days -> months -> years -> days
    //
    // Backward-compat: if opts is a function, treat it as opts.formatter
    // (the v0.6 signature).
    function attachMonthLabel(el, opts) {
        if (!el || _destroyed) return noop;
        let formatter = null;
        let clickToCycle = false;
        if (typeof opts === "function") formatter = opts;
        else if (opts && typeof opts === "object") {
            formatter = opts.formatter || null;
            clickToCycle = !!opts.clickToCycle;
        }
        _monthLabel = el;
        if (formatter) _monthLabelFormatter = formatter;
        ensureId(el, "lh-dp-month");
        setAttr(el, "aria-live", "polite");
        if (_grid) addIdToken(_grid, "aria-labelledby", el.id);

        // initial paint -- mirror the effect logic since the effect won't
        // re-run until something changes
        const initial = computeMonthLabel(_viewMonth(), _view(), _monthLabelFormatter);
        if (el.textContent !== initial) el.textContent = initial;

        let onClick = null;
        if (clickToCycle) {
            // Make the label behave like a button for accessibility.
            if (!el.hasAttribute("role"))     setAttr(el, "role", "button");
            if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");
            setAttr(el, "aria-label", "Switch calendar view");
            onClick = (e) => {
                e.preventDefault();
                if (disabled) return;
                cycleView();
            };
            el.addEventListener("click", onClick);
            el.addEventListener("keydown", (e) => {
                if (e.key === "Enter" || e.key === " ") onClick(e);
            });
        }

        const off = () => {
            if (_grid) removeIdToken(_grid, "aria-labelledby", el.id);
            el.removeAttribute("aria-live");
            if (onClick) el.removeEventListener("click", onClick);
            if (_monthLabel === el) {
                _monthLabel = null;
                _monthLabelFormatter = null;
            }
        };
        _cleanups.push(off);
        return off;
    }

    // Grid-level pointerleave to clear hover preview (avoids flicker on
    // per-cell pointer events).
    function attachGridContainer(el) {
        if (!el || _destroyed) return noop;
        const onLeave = () => {
            if (mode === "range") _hoverDate.set(null);
        };
        el.addEventListener("pointerleave", onLeave);
        const off = () => el.removeEventListener("pointerleave", onLeave);
        _cleanups.push(off);
        return off;
    }

    // ----- destroy -----------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        // detach all day cells via their WeakMap-tracked off fns
        for (const entry of _dayElements.values()) {
            const off = _cellOffs.get(entry.el);
            if (off) off();
        }
        for (const entry of _monthElements.values()) {
            const off = _cellOffs.get(entry.el);
            if (off) off();
        }
        for (const entry of _yearElements.values()) {
            const off = _cellOffs.get(entry.el);
            if (off) off();
        }
        _dayElements.clear();
        _monthElements.clear();
        _yearElements.clear();
        // run other cleanups in reverse order
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
        _destroyed = true;
    }

    // value() returns a defensive deep-clone of the internal _value
    // array so consumers can't mutate the internal Date objects.
    // Identity-cached: re-clone only when the underlying signal value
    // changes, so a consumer that reads value() inside an effect (or a
    // tight render loop) doesn't allocate a fresh array + Date objects
    // every call. The cached clone is shared across callers; the
    // contract is read-only (mutating the returned array is a consumer
    // bug, and the next _value change will replace the snapshot anyway).
    let _valueCloneSrc = null;
    let _valueClone = null;
    function valueAccessor() {
        const cur = _value();
        if (cur !== _valueCloneSrc) {
            _valueCloneSrc = cur;
            _valueClone = cur.map((d) => d ? new Date(d.getTime()) : null);
        }
        return _valueClone;
    }

    return {
        // value access
        value:    valueAccessor,
        setValue,
        // view + focus state (signals)
        viewMonth:    _viewMonth,    // read via viewMonth(); subscribe via viewMonth.subscribe
        focusedDate:  _focusedDate,
        hoverDate:    _hoverDate,
        view:         _view,         // v0.7: "days" | "months" | "years"
        setView:      (v) => {
            if (v !== "days" && v !== "months" && v !== "years") {
                throw new Error("[lite-headless datepicker] view must be 'days', 'months', or 'years'");
            }
            _view.set(v);
        },
        cycleView,
        // imperative view controls
        goToPrevMonth: () => _viewMonth.set(addMonths(_viewMonth(), -1)),
        goToNextMonth: () => _viewMonth.set(addMonths(_viewMonth(), 1)),
        goToMonth:     (d) => _viewMonth.set(startOfMonth(d)),
        // grid helpers
        getDaysInView:   (monthDate) => buildDaysInView(monthDate || _viewMonth(), weekStartsOn),
        getMonthsInView: (yearAnchor) => buildMonthsInView((yearAnchor || _viewMonth()).getFullYear()),
        getYearsInView:  (yearAnchor) => buildYearsInView((yearAnchor || _viewMonth()).getFullYear()),
        weekStartsOn,
        mode,
        // attach
        attachGrid,
        attachGridContainer,
        attachDay,
        attachMonth,        // v0.7
        attachYear,         // v0.7
        attachPrevMonth,
        attachNextMonth,
        attachMonthLabel,
        destroy,
        get destroyed() { return _destroyed; },
        // metadata
        minDate: _min, maxDate: _max,
        // introspection (tests)
        _dayElements:   () => _dayElements,
        _monthElements: () => _monthElements,
        _yearElements:  () => _yearElements,
        _today: () => _today,
    };
}

function noop() {}

// Re-export the date helpers for advanced consumers (custom grid renderers,
// week-row builders, range computations against picker.value()).
export {
    startOfDay, startOfMonth, addDays, addMonths, addYears,
    isSameDay, isSameMonth, isBefore, isAfter, isInRange,
    buildDaysInView, buildMonthsInView, buildYearsInView,
    decadeRange, isInDecade,
    dayKey, monthKey, yearKey,
};
