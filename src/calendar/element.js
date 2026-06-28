// @zakkster/lite-headless / calendar / element.js
//
// <lite-calendar> wrapping createCalendar.
//
//   <lite-calendar view="2026-06-01">
//       <header>
//           <button data-cal-prev>‹</button>
//           <span  data-cal-label></span>
//           <button data-cal-next>›</button>
//       </header>
//       <div data-cal-grid>
//           <!-- consumer renders day cells; the wrapper does NOT build
//                them automatically -- use the eventsForDay() accessor
//                from the host instance to know what to render. -->
//       </div>
//   </lite-calendar>
//
// Reactive attributes:
//   view             ISO date string (YYYY-MM-DD); start-of-month is used
//   week-starts-on   0..6 (defaults to 0 = Sunday)
//
// Imperative API on host:
//   host.view                              -- accessor: Date
//   host.events                            -- accessor: Event[]
//   host.selectedDate                      -- accessor: Date | null
//   host.setView(d)
//   host.setEvents(arr)
//   host.addEvent(ev) / .removeEvent(id) / .updateEvent(id, partial)
//   host.goToPrevMonth() / .goToNextMonth() / .goToToday()
//   host.eventsForDay(date)                -- query, non-reactive
//   host.getEvent(id)
//   host.getDaysInView(monthDate?)
//   host._calendarInstance                 -- the underlying primitive
//
// Events:
//   viewchange       { detail: { view: Date, reason } }
//   eventclick       { detail: { event } }
//   dateclick        { detail: { date } }
//   selectedchange   { detail: { date: Date | null } }
//
// Consumer-facing slots discovered via belongsToHost scope guard so
// nested calendars (e.g. an event-detail popover containing a tiny
// calendar) don't have their slots claimed by the outer.

import { define } from "@zakkster/lite-element";
import { createCalendar } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

function scopedQueryAll(host, selector) {
    const all = host.querySelectorAll(selector);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

function parseViewAttr(raw) {
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
}

define("lite-calendar", (host, scope) => {
    const viewAttr = parseViewAttr(host.getAttribute("view"));
    const weekStartsOn = parseInt(host.getAttribute("week-starts-on") || "0", 10);

    const cal = createCalendar({
        defaultView: viewAttr || new Date(),
        weekStartsOn: Number.isFinite(weekStartsOn) ? weekStartsOn : 0,
        onViewChange: (v, reason) => {
            host.dispatchEvent(new CustomEvent("viewchange", {
                detail: { view: v, reason }, bubbles: true,
            }));
        },
        onEventClick: (event) => {
            host.dispatchEvent(new CustomEvent("eventclick", {
                detail: { event }, bubbles: true,
            }));
        },
        onDateClick: (date) => {
            host.dispatchEvent(new CustomEvent("dateclick", {
                detail: { date }, bubbles: true,
            }));
        },
        onSelectedDateChange: (date) => {
            host.dispatchEvent(new CustomEvent("selectedchange", {
                detail: { date }, bubbles: true,
            }));
        },
    });

    cal.attachRoot(host);

    // ----- role wiring ----------------------------------------------------
    // The wrapper discovers [data-cal-grid], [data-cal-label],
    // [data-cal-prev], [data-cal-next], [data-cal-day], and [data-cal-event].
    // Day cells must carry data-date="YYYY-M-D" (unpadded, matching
    // dayKey() from datepicker). Event elements must carry
    // data-cal-event-id="<eventId>".

    const _attached = {
        grid: null, gridOff: null,
        label: null, labelOff: null,
        prev: null, prevOff: null,
        next: null, nextOff: null,
    };
    const _dayCellOffs = new Map();   // el -> off
    const _eventOffs = new Map();     // el -> off

    function parseDayKey(s) {
        if (!s) return null;
        const parts = s.split("-");
        if (parts.length !== 3) return null;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
        return new Date(y, m - 1, d);
    }

    function syncRoles() {
        // Grid
        const grid = scopedQuery(host, "[data-cal-grid]");
        if (grid !== _attached.grid) {
            if (_attached.gridOff) _attached.gridOff();
            _attached.grid = grid;
            _attached.gridOff = grid ? cal.attachGrid(grid) : null;
        }
        // Label
        const label = scopedQuery(host, "[data-cal-label]");
        if (label !== _attached.label) {
            if (_attached.labelOff) _attached.labelOff();
            _attached.label = label;
            _attached.labelOff = label ? cal.attachMonthLabel(label) : null;
        }
        // Prev / next buttons
        const prev = scopedQuery(host, "[data-cal-prev]");
        if (prev !== _attached.prev) {
            if (_attached.prevOff) _attached.prevOff();
            _attached.prev = prev;
            _attached.prevOff = prev ? cal.attachPrevMonth(prev) : null;
        }
        const next = scopedQuery(host, "[data-cal-next]");
        if (next !== _attached.next) {
            if (_attached.nextOff) _attached.nextOff();
            _attached.next = next;
            _attached.nextOff = next ? cal.attachNextMonth(next) : null;
        }
        // Day cells: anything with [data-cal-day] AND [data-date].
        const dayEls = scopedQueryAll(host, "[data-cal-day][data-date]");
        const seenDays = new Set();
        for (let i = 0; i < dayEls.length; i++) {
            const el = dayEls[i];
            seenDays.add(el);
            if (_dayCellOffs.has(el)) continue;
            const date = parseDayKey(el.getAttribute("data-date"));
            if (!date) continue;
            _dayCellOffs.set(el, cal.attachDayCell(el, date));
        }
        // Detach removed day cells.
        for (const [el, off] of _dayCellOffs) {
            if (!seenDays.has(el)) { off(); _dayCellOffs.delete(el); }
        }
        // Event elements
        const evEls = scopedQueryAll(host, "[data-cal-event-id]");
        const seenEvs = new Set();
        for (let i = 0; i < evEls.length; i++) {
            const el = evEls[i];
            seenEvs.add(el);
            if (_eventOffs.has(el)) continue;
            const id = el.getAttribute("data-cal-event-id");
            if (id == null || id === "") continue;
            _eventOffs.set(el, cal.attachEvent(el, id));
        }
        for (const [el, off] of _eventOffs) {
            if (!seenEvs.has(el)) { off(); _eventOffs.delete(el); }
        }
    }
    syncRoles();

    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // React to view-attribute writes (e.g. router-driven navigation).
    let _suppressViewAttr = false;
    const attrMo = new MutationObserver(() => {
        if (_suppressViewAttr) return;
        const next = parseViewAttr(host.getAttribute("view"));
        if (next) cal.setView(next);
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["view"] });

    // Imperative surface
    host._calendarInstance = cal;
    host.setView         = (d) => cal.setView(d);
    host.setEvents       = (arr) => cal.setEvents(arr);
    host.addEvent        = (ev) => cal.addEvent(ev);
    host.removeEvent     = (id) => cal.removeEvent(id);
    host.updateEvent     = (id, partial) => cal.updateEvent(id, partial);
    host.goToPrevMonth   = () => cal.goToPrevMonth();
    host.goToNextMonth   = () => cal.goToNextMonth();
    host.goToToday       = () => cal.goToToday();
    host.setSelectedDate = (d) => cal.setSelectedDate(d);
    host.eventsForDay    = (d) => cal.eventsForDay(d);
    host.getEvent        = (id) => cal.getEvent(id);
    host.getDaysInView   = (d) => cal.getDaysInView(d);
    Object.defineProperty(host, "view",          { get: () => cal.view(),          configurable: true });
    Object.defineProperty(host, "events",        { get: () => cal.events(),        configurable: true });
    Object.defineProperty(host, "selectedDate",  { get: () => cal.selectedDate(),  configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        for (const off of _dayCellOffs.values()) { try { off(); } catch {} }
        for (const off of _eventOffs.values()) { try { off(); } catch {} }
        _dayCellOffs.clear();
        _eventOffs.clear();
        if (_attached.gridOff)  _attached.gridOff();
        if (_attached.labelOff) _attached.labelOff();
        if (_attached.prevOff)  _attached.prevOff();
        if (_attached.nextOff)  _attached.nextOff();
        cal.destroy();
    });
});
