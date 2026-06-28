// pagination.test.js -- createPagination + buildItems algorithm
//
// Heavy on the buildItems algorithm since the ellipsis-merging
// + boundary-overlap logic is subtle. ARIA painting and click
// behavior covered with attachX + markPage.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createPagination, buildItems } from "../src/pagination/index.js";

// -----------------------------------------------------------------
// buildItems algorithm
// -----------------------------------------------------------------

// Helper: convert items to a compact string for readability
function fmt(items) {
    return items.map(i => i.type === "ellipsis" ? "…" : (i.current ? `[${i.page}]` : String(i.page))).join(" ");
}

test("buildItems: fewer pages than total visible -> show all", () => {
    // 5 pages, sibling=1, boundary=1, current=3 -> 1 2 [3] 4 5
    assert.equal(fmt(buildItems(3, 5, 1, 1)), "1 2 [3] 4 5");
});

test("buildItems: current at start", () => {
    // 20 pages, sibling=1, boundary=1, current=1 -> [1] 2 … 20
    assert.equal(fmt(buildItems(1, 20, 1, 1)), "[1] 2 … 20");
});

test("buildItems: current at end", () => {
    // 20 pages, sibling=1, boundary=1, current=20 -> 1 … 19 [20]
    assert.equal(fmt(buildItems(20, 20, 1, 1)), "1 … 19 [20]");
});

test("buildItems: current in middle", () => {
    // 20 pages, sibling=1, boundary=1, current=10
    // -> 1 … 9 [10] 11 … 20
    assert.equal(fmt(buildItems(10, 20, 1, 1)), "1 … 9 [10] 11 … 20");
});

test("buildItems: ellipsis would hide a single page -> show the page instead", () => {
    // 10 pages, sibling=1, boundary=1, current=4
    // raw: 1 ... 3 [4] 5 6 ... 10
    // but gap between boundary (1) and sibling start (3) is 1 page,
    // so we render '2' instead of '...'
    // Result: 1 2 3 [4] 5 … 10
    assert.equal(fmt(buildItems(4, 10, 1, 1)), "1 2 3 [4] 5 … 10");
});

test("buildItems: boundary 2, sibling 1", () => {
    // 20 pages, sibling=1, boundary=2, current=10
    // -> 1 2 … 9 [10] 11 … 19 20
    assert.equal(fmt(buildItems(10, 20, 1, 2)), "1 2 … 9 [10] 11 … 19 20");
});

test("buildItems: boundary 0, sibling 1", () => {
    // No boundary at all. 10 pages, current=5 -> 4 [5] 6
    assert.equal(fmt(buildItems(5, 10, 1, 0)), "4 [5] 6");
});

test("buildItems: sibling 2", () => {
    // 20 pages, sibling=2, boundary=1, current=10
    // -> 1 … 8 9 [10] 11 12 … 20
    assert.equal(fmt(buildItems(10, 20, 2, 1)), "1 … 8 9 [10] 11 12 … 20");
});

test("buildItems: single page", () => {
    assert.equal(fmt(buildItems(1, 1, 1, 1)), "[1]");
});

test("buildItems: empty pageCount", () => {
    assert.deepEqual(buildItems(1, 0, 1, 1), []);
});

test("buildItems: page out of range clamps", () => {
    // page > total clamps to total
    assert.equal(fmt(buildItems(99, 5, 1, 1)), "1 2 3 4 [5]");
    // page < 1 clamps to 1
    assert.equal(fmt(buildItems(-1, 5, 1, 1)), "[1] 2 3 4 5");
});

// -----------------------------------------------------------------
// Construction
// -----------------------------------------------------------------

test("createPagination defaults", () => {
    setupDOM();
    const p = createPagination();
    assert.equal(p.page(), 1);
    assert.equal(p.pageCount(), 1);
    assert.equal(p.destroyed, false);
    p.destroy();
    teardownDOM();
});

test("createPagination with pageCount + defaultPage", () => {
    setupDOM();
    const p = createPagination({ pageCount: 20, defaultPage: 5 });
    assert.equal(p.page(), 5);
    assert.equal(p.pageCount(), 20);
    p.destroy();
    teardownDOM();
});

test("createPagination rejects invalid pageCount", () => {
    setupDOM();
    assert.throws(() => createPagination({ pageCount: 0 }), /positive integer/);
    assert.throws(() => createPagination({ pageCount: -5 }), /positive integer/);
    teardownDOM();
});

test("createPagination rejects negative siblingCount / boundaryCount", () => {
    setupDOM();
    assert.throws(() => createPagination({ siblingCount: -1 }), /non-negative/);
    assert.throws(() => createPagination({ boundaryCount: -1 }), /non-negative/);
    teardownDOM();
});

test("defaultPage clamped to range", () => {
    setupDOM();
    const p = createPagination({ pageCount: 10, defaultPage: 100 });
    assert.equal(p.page(), 10);
    const p2 = createPagination({ pageCount: 10, defaultPage: 0 });
    assert.equal(p2.page(), 1);
    p.destroy(); p2.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Navigation
// -----------------------------------------------------------------

test("next() advances and onChange fires", () => {
    setupDOM();
    const changes = [];
    const p = createPagination({
        pageCount: 5,
        onChange: (n, r) => changes.push([n, r]),
    });
    p.next();
    p.next();
    assert.deepEqual(changes, [[2, "next"], [3, "next"]]);
    p.destroy();
    teardownDOM();
});

test("prev() retreats; cannot go below 1", () => {
    setupDOM();
    const p = createPagination({ pageCount: 5, defaultPage: 2 });
    p.prev();
    assert.equal(p.page(), 1);
    p.prev();      // no-op
    assert.equal(p.page(), 1);
    p.destroy();
    teardownDOM();
});

test("first / last jump", () => {
    setupDOM();
    const p = createPagination({ pageCount: 20, defaultPage: 10 });
    p.first();
    assert.equal(p.page(), 1);
    p.last();
    assert.equal(p.page(), 20);
    p.destroy();
    teardownDOM();
});

test("setPage clamps to range", () => {
    setupDOM();
    const p = createPagination({ pageCount: 10 });
    p.setPage(99);
    assert.equal(p.page(), 10);
    p.setPage(-5);
    assert.equal(p.page(), 1);
    p.destroy();
    teardownDOM();
});

test("setPage same value is a no-op", () => {
    setupDOM();
    let count = 0;
    const p = createPagination({ pageCount: 5, onChange: () => count++ });
    p.setPage(1);
    p.setPage(1);
    assert.equal(count, 0);
    p.setPage(2);
    assert.equal(count, 1);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// setPageCount
// -----------------------------------------------------------------

test("setPageCount clamps current page if it overflows", () => {
    setupDOM();
    const p = createPagination({ pageCount: 20, defaultPage: 15 });
    p.setPageCount(10);
    assert.equal(p.page(), 10, "current page clamped to new max");
    p.destroy();
    teardownDOM();
});

test("setPageCount with smaller value doesn't move page if still in range", () => {
    setupDOM();
    const p = createPagination({ pageCount: 20, defaultPage: 3 });
    p.setPageCount(10);
    assert.equal(p.page(), 3);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// items() reactivity
// -----------------------------------------------------------------

test("items() reflects current page + pageCount", () => {
    setupDOM();
    const p = createPagination({ pageCount: 20, defaultPage: 10 });
    assert.equal(fmt(p.items()), "1 … 9 [10] 11 … 20");
    p.next();
    assert.equal(fmt(p.items()), "1 … 10 [11] 12 … 20");
    p.setPageCount(5);
    // page clamped to 5
    assert.equal(fmt(p.items()), "1 2 3 4 [5]");
    p.destroy();
    teardownDOM();
});

test("onItemsChange fires on every page/pageCount change", () => {
    setupDOM();
    const calls = [];
    const p = createPagination({
        pageCount: 20,
        defaultPage: 10,
        onItemsChange: (items) => calls.push(items.length),
    });
    const initialLen = calls[calls.length - 1];
    p.next();
    p.next();
    p.setPageCount(50);
    assert.ok(calls.length >= 3, "fires at least 3 times for 3 mutations after construction");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachments + ARIA
// -----------------------------------------------------------------

test("attachRoot writes role=navigation + aria-label", () => {
    setupDOM();
    const el = document.createElement("nav");
    document.body.appendChild(el);
    const p = createPagination();
    p.attachRoot(el);
    assert.equal(el.getAttribute("role"), "navigation");
    assert.equal(el.getAttribute("aria-label"), "Pagination");
    p.destroy();
    teardownDOM();
});

test("attachRoot respects consumer aria-label", () => {
    setupDOM();
    const el = document.createElement("nav");
    el.setAttribute("aria-label", "Page nav");
    document.body.appendChild(el);
    const p = createPagination();
    p.attachRoot(el);
    assert.equal(el.getAttribute("aria-label"), "Page nav");
    p.destroy();
    teardownDOM();
});

test("attachPrev: disabled at page 1, click moves to prev", () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const p = createPagination({ pageCount: 5, defaultPage: 1 });
    p.attachPrev(btn);
    assert.equal(btn.hasAttribute("data-disabled"), true, "disabled at page 1");
    assert.equal(btn.disabled, true);
    p.setPage(3);
    assert.equal(btn.hasAttribute("data-disabled"), false);
    btn.click();
    assert.equal(p.page(), 2);
    p.destroy();
    teardownDOM();
});

test("attachNext: disabled at last page", () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const p = createPagination({ pageCount: 5, defaultPage: 5 });
    p.attachNext(btn);
    assert.equal(btn.hasAttribute("data-disabled"), true);
    p.setPage(3);
    assert.equal(btn.hasAttribute("data-disabled"), false);
    btn.click();
    assert.equal(p.page(), 4);
    p.destroy();
    teardownDOM();
});

test("attachFirst / attachLast jump and disable correctly", () => {
    setupDOM();
    const first = document.createElement("button");
    const last  = document.createElement("button");
    document.body.appendChild(first);
    document.body.appendChild(last);
    const p = createPagination({ pageCount: 10, defaultPage: 1 });
    p.attachFirst(first);
    p.attachLast(last);
    // page 1: first disabled, last enabled
    assert.equal(first.hasAttribute("data-disabled"), true);
    assert.equal(last.hasAttribute("data-disabled"), false);
    last.click();
    assert.equal(p.page(), 10);
    // page 10: first enabled, last disabled
    assert.equal(first.hasAttribute("data-disabled"), false);
    assert.equal(last.hasAttribute("data-disabled"), true);
    first.click();
    assert.equal(p.page(), 1);
    p.destroy();
    teardownDOM();
});

test("markPage paints aria-current=page on current, removes on others", () => {
    setupDOM();
    const btn1 = document.createElement("button");
    const btn2 = document.createElement("button");
    const btn3 = document.createElement("button");
    document.body.append(btn1, btn2, btn3);
    const p = createPagination({ pageCount: 5, defaultPage: 2 });
    p.markPage(btn1, 1);
    p.markPage(btn2, 2);
    p.markPage(btn3, 3);
    assert.equal(btn1.getAttribute("aria-current"), null);
    assert.equal(btn2.getAttribute("aria-current"), "page");
    assert.equal(btn2.getAttribute("data-current"), "true");
    assert.equal(btn3.getAttribute("aria-current"), null);
    // change page
    p.setPage(3);
    assert.equal(btn3.getAttribute("aria-current"), "page");
    assert.equal(btn2.getAttribute("aria-current"), null);
    p.destroy();
    teardownDOM();
});

test("markPage button click navigates to that page", () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const p = createPagination({ pageCount: 10 });
    p.markPage(btn, 7);
    btn.click();
    assert.equal(p.page(), 7);
    p.destroy();
    teardownDOM();
});

test("markPage assigns aria-label='Go to page N'", () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const p = createPagination({ pageCount: 10 });
    p.markPage(btn, 4);
    assert.equal(btn.getAttribute("aria-label"), "Go to page 4");
    p.destroy();
    teardownDOM();
});

test("markPage respects consumer-provided aria-label", () => {
    setupDOM();
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "Jump to results page 4");
    document.body.appendChild(btn);
    const p = createPagination({ pageCount: 10 });
    p.markPage(btn, 4);
    assert.equal(btn.getAttribute("aria-label"), "Jump to results page 4");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Disabled state for nav buttons
// -----------------------------------------------------------------

test("clicking disabled nav button is a no-op", () => {
    setupDOM();
    const prev = document.createElement("button");
    document.body.appendChild(prev);
    const p = createPagination({ pageCount: 5, defaultPage: 1 });
    p.attachPrev(prev);
    let count = 0;
    p.attachRoot(document.createElement("nav"));  // no-op but exercise
    prev.click();
    assert.equal(p.page(), 1, "no movement when disabled");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Destroy
// -----------------------------------------------------------------

test("destroy() removes aria-current from page buttons", () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.appendChild(btn);
    const p = createPagination({ pageCount: 5, defaultPage: 1 });
    p.markPage(btn, 1);
    assert.equal(btn.getAttribute("aria-current"), "page");
    p.destroy();
    assert.equal(btn.hasAttribute("aria-current"), false);
    teardownDOM();
});

test("destroy() is idempotent", () => {
    setupDOM();
    const p = createPagination();
    p.destroy();
    p.destroy();
    assert.equal(p.destroyed, true);
    teardownDOM();
});

test("setPage after destroy returns false", () => {
    setupDOM();
    const p = createPagination({ pageCount: 5 });
    p.destroy();
    assert.equal(p.setPage(3), false);
    teardownDOM();
});
