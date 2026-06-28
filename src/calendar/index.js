// @zakkster/lite-headless / calendar / index.js
//
// createCalendar(options) -> CalendarHandle
//
// Headless month-view calendar primitive for admin dashboards. Designed
// for displaying events/appointments on a date grid, NOT for picking a
// date (use createDatePicker for input). The two primitives share the
// same date helpers but solve different problems:
//
//                     datepicker             calendar
//   purpose           input control          event display
//   value             reactive Date          set of events
//   focus model       roving (keyboard)      free click
//   range selection   yes (single + range)   no (use 'selectedDate' opt)
//
// The calendar is otherwise as headless as the datepicker: it doesn't
// build any DOM. The consumer creates day-cell elements (typically a
// 6x7 grid for a month view + adjacent-month overflow) and attaches
// them via attachDayCell. Events live in a reactive list; the consumer
// queries `eventsForDay(date)` to know what to render in each cell.
//
// Event shape (consumers may add arbitrary extra fields via `meta`):
//   {
//     id:       string              -- required, unique
//     start:    Date                 -- required
//     end:      Date | null          -- optional; same-day at start time if null
//     title:    string               -- required (consumer renders)
//     allDay:   boolean              -- defaults to false
//     color:    string | null        -- CSS color string for chip styling
//     meta:     {}                   -- consumer-defined extras
//   }
//
// Multi-day events: an event with start = day A and end = day B (A < B)
// returns from eventsForDay() for every day in [A..B] (inclusive). The
// consumer can detect this via `event.start` < cellDate.startOfDay or
// `event.end` > cellDate.endOfDay to choose continuation styling.
//
// Reactivity:
//   - view (start-of-month) is a signal; the consumer's render effect
//     reads it to know which days to draw.
//   - events is a signal of the events array; mutations replace the
//     whole array (set + add/remove/update return new arrays).
//   - selectedDate is a signal of Date | null for "currently focused"
//     state -- handy for highlighting today or a row the user clicked.
//
// All cleanup goes through addCleanup/destroy; the primitive holds no
// global state and is safe to instantiate many times per document.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { uniqueId, setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";
import {
    startOfDay, startOfMonth, addDays, addMonths,
    isSameDay, isSameMonth, isBefore, isAfter,
    buildDaysInView, dayKey,
} from "../datepicker/index.js";

function endOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

// True iff `event` overlaps the calendar day represented by `dayStart`
// (which is at 00:00). end-defaulting matches the documented shape:
// null end => same-day event.
function eventOverlapsDay(event, dayStart) {
    const dayEnd = endOfDay(dayStart);
    const evStart = event.start;
    const evEnd = event.end != null ? event.end : event.start;
    // Overlap test: [evStart..evEnd] intersects [dayStart..dayEnd]
    // iff evStart <= dayEnd AND evEnd >= dayStart.
    return !isAfter(evStart, dayEnd) && !isBefore(evEnd, dayStart);
}

// Stable sort key: earlier-starting events first; tie-break by id for
// deterministic ordering across renders.
function compareEvents(a, b) {
    const dt = a.start.getTime() - b.start.getTime();
    if (dt !== 0) return dt;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

export function createCalendar(options = {}) {
    const {
        defaultView,
        defaultEvents = [],
        defaultSelectedDate = null,
        weekStartsOn = 0,
        onViewChange,
        onEventClick,
        onDateClick,
        onSelectedDateChange,
    } = options;

    // ----- state ----------------------------------------------------------
    let _destroyed = false;
    const _view = makeSignal(startOfMonth(defaultView || new Date()));
    const _events = makeSignal(defaultEvents.slice().sort(compareEvents));
    const _selected = makeSignal(defaultSelectedDate);

    // Element registries. Keyed by element identity (consumer DOM nodes).
    const _dayCells = new Map();     // el -> { date, off, paintCache }
    const _eventEls = new Map();     // el -> { eventId, off }
    let _grid = null;
    let _root = null;
    let _monthLabel = null;
    let _prevBtn = null;
    let _nextBtn = null;

    // Cleanup chain (LIFO at destroy)
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- public reactive accessors --------------------------------------

    function view() { return _view(); }
    function events() { return _events(); }
    function selectedDate() { return _selected(); }

    function setView(d) {
        if (_destroyed) return;
        const next = startOfMonth(d);
        const cur = _view();
        if (isSameMonth(next, cur)) return;
        _view.set(next);
        if (onViewChange) onViewChange(next, "api");
    }

    function setSelectedDate(d) {
        if (_destroyed) return;
        const next = d ? startOfDay(d) : null;
        const cur = _selected();
        if (next === cur) return;
        if (next && cur && isSameDay(next, cur)) return;
        _selected.set(next);
        if (onSelectedDateChange) onSelectedDateChange(next, "api");
    }

    function goToPrevMonth() { setView(addMonths(_view(), -1)); }
    function goToNextMonth() { setView(addMonths(_view(),  1)); }
    function goToToday()     { setView(new Date()); }

    // ----- events list mutations ------------------------------------------

    function setEvents(next) {
        if (_destroyed) return;
        const arr = (next || []).slice().sort(compareEvents);
        _events.set(arr);
    }

    function addEvent(event) {
        if (_destroyed || !event || !event.id) return;
        const cur = _events();
        // Reject duplicate ids silently to keep mutations idempotent.
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === event.id) return;
        }
        const next = cur.slice();
        next.push(event);
        next.sort(compareEvents);
        _events.set(next);
    }

    function removeEvent(eventId) {
        if (_destroyed || eventId == null) return;
        const cur = _events();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === eventId) { idx = i; break; }
        }
        if (idx === -1) return;
        const next = cur.slice();
        next.splice(idx, 1);
        _events.set(next);
    }

    function updateEvent(eventId, partial) {
        if (_destroyed || eventId == null || !partial) return;
        const cur = _events();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === eventId) { idx = i; break; }
        }
        if (idx === -1) return;
        const next = cur.slice();
        next[idx] = Object.assign({}, cur[idx], partial, { id: eventId });
        next.sort(compareEvents);
        _events.set(next);
    }

    function getEvent(eventId) {
        const cur = _events();
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === eventId) return cur[i];
        }
        return null;
    }

    // Pure query (NOT a signal). Returns events overlapping `date`.
    // The consumer wraps the call in their own effect if they want
    // reactivity. Result is sorted (compareEvents) so iteration order
    // is stable across calls.
    function eventsForDay(date) {
        const dayStart = startOfDay(date);
        const arr = _events();
        const out = [];
        for (let i = 0; i < arr.length; i++) {
            if (eventOverlapsDay(arr[i], dayStart)) out.push(arr[i]);
        }
        return out;
    }

    // Visible-month grid as an array of {date, inMonth, isToday}. The
    // consumer typically iterates this once on view change to build/
    // update cells. Reads viewMonth + weekStartsOn.
    function getDaysInView(monthDate) {
        return buildDaysInView(monthDate || _view(), weekStartsOn);
    }

    // ----- root / grid / nav attachment -----------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _root = el;
        ensureId(el, "lh-cal");
        setAttr(el, "role", "application");
        setAttr(el, "aria-roledescription", "calendar");
        const off = () => {
            if (_root === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-roledescription");
                _root = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachGrid(el) {
        if (!el || _destroyed) return noop;
        _grid = el;
        ensureId(el, "lh-cal-grid");
        setAttr(el, "role", "grid");
        const off = () => {
            if (_grid === el) {
                el.removeAttribute("role");
                _grid = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachMonthLabel(el) {
        if (!el || _destroyed) return noop;
        _monthLabel = el;
        ensureId(el, "lh-cal-label");
        setAttr(el, "aria-live", "polite");
        // Effect paints the label whenever view changes.
        const stop = effect(() => {
            const v = _view();
            const formatter = new Intl.DateTimeFormat(undefined, {
                month: "long", year: "numeric",
            });
            const next = formatter.format(v);
            if (el.textContent !== next) el.textContent = next;
        });
        addCleanup(stop);
        const off = () => {
            stop();
            if (_monthLabel === el) {
                el.removeAttribute("aria-live");
                _monthLabel = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachPrevMonth(el) {
        if (!el || _destroyed) return noop;
        _prevBtn = el;
        if (!el.hasAttribute("type")) setAttr(el, "type", "button");
        setAttr(el, "aria-label", "Previous month");
        const onClick = (e) => { e.preventDefault(); goToPrevMonth(); };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            if (_prevBtn === el) {
                el.removeAttribute("aria-label");
                _prevBtn = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachNextMonth(el) {
        if (!el || _destroyed) return noop;
        _nextBtn = el;
        if (!el.hasAttribute("type")) setAttr(el, "type", "button");
        setAttr(el, "aria-label", "Next month");
        const onClick = (e) => { e.preventDefault(); goToNextMonth(); };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            if (_nextBtn === el) {
                el.removeAttribute("aria-label");
                _nextBtn = null;
            }
        };
        addCleanup(off);
        return off;
    }

    // ----- day cell attachment --------------------------------------------
    //
    // The cell carries:
    //   role=gridcell, data-date=YYYY-MM-DD, data-day-of-week=0..6,
    //   data-outside-month (if not in current view), data-today (if today),
    //   data-selected (if matches selectedDate), aria-selected accordingly.
    //
    // A cache (paintCache) per cell lets the paint effect skip writes when
    // nothing changed -- the same pattern as datepicker's grid.

    function attachDayCell(el, date) {
        if (!el || _destroyed) return noop;
        const day = startOfDay(date);
        const prev = _dayCells.get(el);
        if (prev) prev.off();

        ensureId(el, "lh-cal-day");
        setAttr(el, "role", "gridcell");
        setAttr(el, "data-date", dayKey(day));
        setAttr(el, "data-day-of-week", String(day.getDay()));

        // Click delegation
        const onClick = (ev) => {
            if (onDateClick) onDateClick(day, ev);
            setSelectedDate(day);
        };
        el.addEventListener("click", onClick);

        // Paint effect: outside-month, today, selected
        const today = startOfDay(new Date());
        const stop = effect(() => {
            const v = _view();
            const sel = _selected();
            const inMonth = isSameMonth(day, v);
            const isToday = isSameDay(day, today);
            const isSel   = sel && isSameDay(day, sel);
            toggleAttr(el, "data-outside-month", !inMonth);
            toggleAttr(el, "data-today", isToday);
            toggleAttr(el, "data-selected", !!isSel);
            setAttr(el, "aria-selected", isSel ? "true" : "false");
        });

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeAttribute("role");
            el.removeAttribute("data-date");
            el.removeAttribute("data-day-of-week");
            el.removeAttribute("data-outside-month");
            el.removeAttribute("data-today");
            el.removeAttribute("data-selected");
            el.removeAttribute("aria-selected");
            _dayCells.delete(el);
        };
        _dayCells.set(el, { date: day, off });
        addCleanup(off);
        return off;
    }

    // ----- event element attachment ---------------------------------------
    //
    // The consumer creates an element per (event, day) pair and attaches
    // it. Multi-day events span multiple cells, so a single event id may
    // have multiple attached elements -- one per visible day. We track
    // them all and paint each on event mutations.
    //
    // The element gets data-event-id, data-event-color, click delegation,
    // and a paint effect that mirrors the current event's title/state.

    function attachEvent(el, eventId) {
        if (!el || _destroyed || eventId == null) return noop;
        const prev = _eventEls.get(el);
        if (prev) prev.off();

        ensureId(el, "lh-cal-event");
        setAttr(el, "data-event-id", String(eventId));
        setAttr(el, "role", "button");
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "0");

        // Click + Enter/Space delegation
        const onClick = (ev) => {
            ev.stopPropagation();   // don't bubble to the cell
            const found = getEvent(eventId);
            if (found && onEventClick) onEventClick(found, ev);
        };
        const onKey = (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                onClick(ev);
            }
        };
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        // Paint effect: data-event-color tracks the current event's color
        // (consumers may set CSS vars from it). The chip's title text is
        // the consumer's job -- the primitive doesn't write textContent
        // because the consumer might want to render extras (icons, time).
        let _lastColor = null;
        const stop = effect(() => {
            const found = getEvent(eventId);
            if (!found) {
                // Event was removed; clean up paint attrs but leave the
                // off() invocation to the consumer or to the cell's
                // detach. Don't auto-remove the element -- consumer owns
                // DOM lifecycle.
                if (_lastColor !== null) {
                    el.removeAttribute("data-event-color");
                    _lastColor = null;
                }
                toggleAttr(el, "data-event-missing", true);
                return;
            }
            toggleAttr(el, "data-event-missing", false);
            const color = found.color != null ? String(found.color) : null;
            if (_lastColor !== color) {
                if (color) setAttr(el, "data-event-color", color);
                else       el.removeAttribute("data-event-color");
                _lastColor = color;
            }
            toggleAttr(el, "data-event-all-day", !!found.allDay);
        });

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("data-event-id");
            el.removeAttribute("data-event-color");
            el.removeAttribute("data-event-all-day");
            el.removeAttribute("data-event-missing");
            el.removeAttribute("role");
            _eventEls.delete(el);
        };
        _eventEls.set(el, { eventId, off });
        addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        // Run cleanups LIFO; safer for attach order assumptions.
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
        _dayCells.clear();
        _eventEls.clear();
        _grid = null;
        _root = null;
        _monthLabel = null;
        _prevBtn = null;
        _nextBtn = null;
    }

    return {
        // reactive accessors
        view, events, selectedDate,
        // mutations
        setView, setSelectedDate, setEvents,
        addEvent, removeEvent, updateEvent,
        goToPrevMonth, goToNextMonth, goToToday,
        // queries (non-reactive)
        eventsForDay, getEvent, getDaysInView,
        weekStartsOn,
        // attach
        attachRoot, attachGrid, attachMonthLabel,
        attachPrevMonth, attachNextMonth,
        attachDayCell, attachEvent,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        // introspection (tests)
        _dayCells: () => _dayCells,
        _eventEls: () => _eventEls,
    };
}

function noop() {}
