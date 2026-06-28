// calendar.test.js -- createCalendar state, events, navigation, cell paint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createCalendar } from "../src/calendar/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

// Stable date helper -- avoids timezone surprises in test assertions.
function D(y, m, d, hh, mm) {
    return new Date(y, m, d, hh || 0, mm || 0, 0, 0);
}

// =====================================================================
// Construction defaults
// =====================================================================

test("createCalendar: default view is the current month at construction", () => {
    setupDOM();
    const cal = createCalendar();
    const v = cal.view();
    const now = new Date();
    assert.equal(v.getFullYear(), now.getFullYear());
    assert.equal(v.getMonth(), now.getMonth());
    assert.equal(v.getDate(), 1);
    cal.destroy();
    teardownDOM();
});

test("createCalendar: defaultView option is honored (normalized to startOfMonth)", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 17) });
    const v = cal.view();
    assert.equal(v.getFullYear(), 2026);
    assert.equal(v.getMonth(), 5);
    assert.equal(v.getDate(), 1);
    cal.destroy();
    teardownDOM();
});

test("createCalendar: events default to empty list", () => {
    setupDOM();
    const cal = createCalendar();
    assert.deepEqual(cal.events(), []);
    cal.destroy();
    teardownDOM();
});

test("createCalendar: defaultEvents are sorted on construction", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [
            { id: "b", start: D(2026, 5, 12), title: "B" },
            { id: "a", start: D(2026, 5, 10), title: "A" },
            { id: "c", start: D(2026, 5, 12), title: "C" },
        ],
    });
    const evs = cal.events();
    assert.equal(evs.length, 3);
    assert.equal(evs[0].id, "a");
    // tie-break by id when start ties
    assert.equal(evs[1].id, "b");
    assert.equal(evs[2].id, "c");
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Navigation
// =====================================================================

test("goToNextMonth advances by one calendar month and fires onViewChange", () => {
    setupDOM();
    let viewArg = null;
    let reasonArg = null;
    const cal = createCalendar({
        defaultView: D(2026, 5, 1),
        onViewChange: (v, r) => { viewArg = v; reasonArg = r; },
    });
    cal.goToNextMonth();
    assert.equal(cal.view().getMonth(), 6);
    assert.equal(viewArg.getMonth(), 6);
    assert.equal(reasonArg, "api");
    cal.destroy();
    teardownDOM();
});

test("goToPrevMonth retreats by one calendar month", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    cal.goToPrevMonth();
    assert.equal(cal.view().getMonth(), 4);
    cal.destroy();
    teardownDOM();
});

test("goToToday jumps to current month", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2020, 0, 1) });
    cal.goToToday();
    const now = new Date();
    assert.equal(cal.view().getFullYear(), now.getFullYear());
    assert.equal(cal.view().getMonth(), now.getMonth());
    cal.destroy();
    teardownDOM();
});

test("setView is idempotent when given a date in the same month", () => {
    setupDOM();
    let fires = 0;
    const cal = createCalendar({
        defaultView: D(2026, 5, 1),
        onViewChange: () => { fires++; },
    });
    cal.setView(D(2026, 5, 15));    // same month
    cal.setView(D(2026, 5, 28));    // same month
    assert.equal(fires, 0);
    cal.setView(D(2026, 6, 1));     // different month
    assert.equal(fires, 1);
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Events list mutations
// =====================================================================

test("addEvent appends + re-sorts; ignores duplicate ids", () => {
    setupDOM();
    const cal = createCalendar();
    cal.addEvent({ id: "b", start: D(2026, 5, 10), title: "B" });
    cal.addEvent({ id: "a", start: D(2026, 5, 5),  title: "A" });
    cal.addEvent({ id: "a", start: D(2026, 5, 99), title: "Dup" });   // ignored
    const evs = cal.events();
    assert.equal(evs.length, 2);
    assert.equal(evs[0].id, "a");
    assert.equal(evs[1].id, "b");
    cal.destroy();
    teardownDOM();
});

test("removeEvent removes by id; missing id is a no-op", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [
            { id: "a", start: D(2026, 5, 5),  title: "A" },
            { id: "b", start: D(2026, 5, 10), title: "B" },
        ],
    });
    cal.removeEvent("a");
    assert.deepEqual(cal.events().map(e => e.id), ["b"]);
    cal.removeEvent("zzz");
    assert.deepEqual(cal.events().map(e => e.id), ["b"]);
    cal.destroy();
    teardownDOM();
});

test("updateEvent merges partial; missing id is a no-op", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 5), title: "A", color: "red" }],
    });
    cal.updateEvent("a", { title: "A renamed" });
    const a = cal.getEvent("a");
    assert.equal(a.title, "A renamed");
    assert.equal(a.color, "red");
    cal.updateEvent("zzz", { title: "x" });   // no-op
    assert.equal(cal.events().length, 1);
    cal.destroy();
    teardownDOM();
});

test("setEvents replaces the whole list and re-sorts", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 5), title: "A" }],
    });
    cal.setEvents([
        { id: "z", start: D(2026, 5, 20), title: "Z" },
        { id: "m", start: D(2026, 5, 1),  title: "M" },
    ]);
    assert.deepEqual(cal.events().map(e => e.id), ["m", "z"]);
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// eventsForDay overlap logic
// =====================================================================

test("eventsForDay returns same-day events", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [
            { id: "a", start: D(2026, 5, 10, 9, 0),  end: D(2026, 5, 10, 10, 0), title: "Meeting" },
            { id: "b", start: D(2026, 5, 11),                                    title: "Other day" },
        ],
    });
    const hits = cal.eventsForDay(D(2026, 5, 10));
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, "a");
    cal.destroy();
    teardownDOM();
});

test("eventsForDay handles multi-day spans (returns event for every day in [start..end])", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [
            { id: "vac", start: D(2026, 5, 10), end: D(2026, 5, 13), title: "Vacation" },
        ],
    });
    for (let day = 10; day <= 13; day++) {
        const hits = cal.eventsForDay(D(2026, 5, day));
        assert.equal(hits.length, 1, "day " + day);
        assert.equal(hits[0].id, "vac");
    }
    // Days outside the span are not hit.
    assert.equal(cal.eventsForDay(D(2026, 5, 9)).length, 0);
    assert.equal(cal.eventsForDay(D(2026, 5, 14)).length, 0);
    cal.destroy();
    teardownDOM();
});

test("eventsForDay defaults end=null to same-day", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10, 14, 30), title: "A" }],
    });
    assert.equal(cal.eventsForDay(D(2026, 5, 10)).length, 1);
    assert.equal(cal.eventsForDay(D(2026, 5, 11)).length, 0);
    cal.destroy();
    teardownDOM();
});

test("eventsForDay returns sorted-by-start results", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [
            { id: "later",   start: D(2026, 5, 10, 14, 0), title: "Later" },
            { id: "morning", start: D(2026, 5, 10, 9, 0),  title: "Morning" },
            { id: "noon",    start: D(2026, 5, 10, 12, 0), title: "Noon" },
        ],
    });
    const hits = cal.eventsForDay(D(2026, 5, 10));
    assert.deepEqual(hits.map(e => e.id), ["morning", "noon", "later"]);
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Day cell attach + paint
// =====================================================================

test("attachDayCell sets role + data-date + data-day-of-week", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const el = mkEl("button");
    cal.attachDayCell(el, D(2026, 5, 15));
    assert.equal(el.getAttribute("role"), "gridcell");
    assert.equal(el.getAttribute("data-date"), "2026-6-15");
    assert.equal(el.getAttribute("data-day-of-week"), "1");
    cal.destroy();
    teardownDOM();
});

test("attachDayCell paints data-outside-month when date is in adjacent month", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const inMonth = mkEl();
    const outOfMonth = mkEl();
    cal.attachDayCell(inMonth, D(2026, 5, 15));
    cal.attachDayCell(outOfMonth, D(2026, 4, 28));   // May 28, view is June
    assert.equal(inMonth.hasAttribute("data-outside-month"), false);
    assert.equal(outOfMonth.hasAttribute("data-outside-month"), true);
    cal.destroy();
    teardownDOM();
});

test("attachDayCell updates outside-month flag when view changes", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const el = mkEl();
    cal.attachDayCell(el, D(2026, 5, 15));
    assert.equal(el.hasAttribute("data-outside-month"), false);
    cal.goToNextMonth();
    assert.equal(el.hasAttribute("data-outside-month"), true);
    cal.goToPrevMonth();
    assert.equal(el.hasAttribute("data-outside-month"), false);
    cal.destroy();
    teardownDOM();
});

test("attachDayCell fires onDateClick on click and updates selectedDate", () => {
    setupDOM();
    let clickedDate = null;
    const cal = createCalendar({
        defaultView: D(2026, 5, 1),
        onDateClick: (date) => { clickedDate = date; },
    });
    const el = mkEl();
    cal.attachDayCell(el, D(2026, 5, 15));
    el.click();
    assert.equal(clickedDate.getDate(), 15);
    assert.equal(cal.selectedDate().getDate(), 15);
    cal.destroy();
    teardownDOM();
});

test("attachDayCell paints data-selected when selectedDate matches", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const a = mkEl();
    const b = mkEl();
    cal.attachDayCell(a, D(2026, 5, 10));
    cal.attachDayCell(b, D(2026, 5, 11));
    cal.setSelectedDate(D(2026, 5, 10));
    assert.equal(a.getAttribute("data-selected"), "");
    assert.equal(b.hasAttribute("data-selected"), false);
    assert.equal(a.getAttribute("aria-selected"), "true");
    assert.equal(b.getAttribute("aria-selected"), "false");
    cal.destroy();
    teardownDOM();
});

test("attachDayCell off() removes registration", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const el = mkEl();
    const off = cal.attachDayCell(el, D(2026, 5, 15));
    assert.equal(cal._dayCells().size, 1);
    off();
    assert.equal(cal._dayCells().size, 0);
    assert.equal(el.hasAttribute("role"), false);
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Event element attach + paint
// =====================================================================

test("attachEvent sets data-event-id + role=button + click delegation", () => {
    setupDOM();
    let clicked = null;
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A" }],
        onEventClick: (ev) => { clicked = ev; },
    });
    const el = mkEl();
    cal.attachEvent(el, "a");
    assert.equal(el.getAttribute("data-event-id"), "a");
    assert.equal(el.getAttribute("role"), "button");
    assert.equal(el.getAttribute("tabindex"), "0");
    el.click();
    assert.ok(clicked);
    assert.equal(clicked.id, "a");
    cal.destroy();
    teardownDOM();
});

test("attachEvent paints data-event-color from event metadata", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A", color: "#3b82f6" }],
    });
    const el = mkEl();
    cal.attachEvent(el, "a");
    assert.equal(el.getAttribute("data-event-color"), "#3b82f6");
    cal.updateEvent("a", { color: null });
    assert.equal(el.hasAttribute("data-event-color"), false);
    cal.updateEvent("a", { color: "red" });
    assert.equal(el.getAttribute("data-event-color"), "red");
    cal.destroy();
    teardownDOM();
});

test("attachEvent paints data-event-all-day from event metadata", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A", allDay: true }],
    });
    const el = mkEl();
    cal.attachEvent(el, "a");
    assert.equal(el.getAttribute("data-event-all-day"), "");
    cal.updateEvent("a", { allDay: false });
    assert.equal(el.hasAttribute("data-event-all-day"), false);
    cal.destroy();
    teardownDOM();
});

test("attachEvent paints data-event-missing when event is removed", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A" }],
    });
    const el = mkEl();
    cal.attachEvent(el, "a");
    assert.equal(el.hasAttribute("data-event-missing"), false);
    cal.removeEvent("a");
    assert.equal(el.getAttribute("data-event-missing"), "");
    cal.destroy();
    teardownDOM();
});

test("attachEvent Enter/Space keyboard activation fires onEventClick", () => {
    setupDOM();
    let fires = 0;
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A" }],
        onEventClick: () => { fires++; },
    });
    const el = mkEl();
    cal.attachEvent(el, "a");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ",     bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab",   bubbles: true }));   // ignored
    assert.equal(fires, 2);
    cal.destroy();
    teardownDOM();
});

test("attachEvent click does NOT bubble to the parent cell's click handler", () => {
    setupDOM();
    let cellClicks = 0;
    let eventClicks = 0;
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A" }],
        onDateClick:  () => { cellClicks++; },
        onEventClick: () => { eventClicks++; },
    });
    const cell = mkEl();
    const ev = mkEl();
    cell.appendChild(ev);
    cal.attachDayCell(cell, D(2026, 5, 10));
    cal.attachEvent(ev, "a");
    ev.click();
    assert.equal(eventClicks, 1);
    assert.equal(cellClicks, 0);   // stopPropagation in attachEvent
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Month label
// =====================================================================

test("attachMonthLabel sets aria-live + paints initial month/year", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const el = mkEl();
    cal.attachMonthLabel(el);
    assert.equal(el.getAttribute("aria-live"), "polite");
    // The exact format depends on locale, but the year should be present.
    assert.ok(el.textContent.includes("2026"));
    cal.destroy();
    teardownDOM();
});

test("attachMonthLabel reacts to view changes", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const el = mkEl();
    cal.attachMonthLabel(el);
    const june = el.textContent;
    cal.goToNextMonth();
    assert.notEqual(el.textContent, june);
    assert.ok(el.textContent.includes("2026"));
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Navigation buttons
// =====================================================================

test("attachPrevMonth / attachNextMonth wire click to navigation", () => {
    setupDOM();
    const cal = createCalendar({ defaultView: D(2026, 5, 1) });
    const prev = mkEl("button");
    const next = mkEl("button");
    cal.attachPrevMonth(prev);
    cal.attachNextMonth(next);
    next.click();
    assert.equal(cal.view().getMonth(), 6);
    prev.click(); prev.click();
    assert.equal(cal.view().getMonth(), 4);
    cal.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy is idempotent and prevents further mutations", () => {
    setupDOM();
    const cal = createCalendar({
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A" }],
    });
    cal.destroy();
    cal.destroy();   // no throw
    cal.addEvent({ id: "b", start: D(2026, 5, 11), title: "B" });
    cal.setView(D(2027, 0, 1));
    assert.equal(cal.destroyed, true);
    teardownDOM();
});

test("destroy detaches all day cells and event elements", () => {
    setupDOM();
    const cal = createCalendar({
        defaultView: D(2026, 5, 1),
        defaultEvents: [{ id: "a", start: D(2026, 5, 10), title: "A" }],
    });
    const cell = mkEl();
    const ev = mkEl();
    cal.attachDayCell(cell, D(2026, 5, 10));
    cal.attachEvent(ev, "a");
    cal.destroy();
    assert.equal(cell.hasAttribute("role"), false);
    assert.equal(ev.hasAttribute("data-event-id"), false);
    teardownDOM();
});
