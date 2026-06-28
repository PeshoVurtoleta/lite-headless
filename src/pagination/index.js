// @zakkster/lite-headless / pagination
//
// Headless pagination control: page-N-of-M navigation with
// configurable sibling + boundary counts and automatic ellipsis
// insertion for long ranges.
//
// API
//
//   createPagination({
//       pageCount:     1,        // total pages
//       defaultPage:   1,        // uncontrolled seed
//       page?:         Signal<n>,// controlled mode
//       siblingCount:  1,        // pages shown either side of current
//       boundaryCount: 1,        // pages shown at start/end
//       onChange?:     (page, reason) => void,
//   })
//
//   // navigation buttons (static)
//   attachRoot(el)               // role=navigation, aria-label
//   attachPrev(el)               // data-disabled at page 1
//   attachNext(el)               // data-disabled at last page
//   attachFirst(el)              // jumps to 1
//   attachLast(el)               // jumps to total
//
//   // dynamic page buttons
//   attachPageList(el)           // role=list; consumer renders li's
//   markPage(el, page)           // attach a page button; click moves there
//                                // gets aria-current="page" when current,
//                                // data-current="true" for CSS
//
//   // reactive
//   page()                       // current 1-indexed
//   pageCount()
//   items()                      // [{type:"page",page} | {type:"ellipsis",position}]
//
//   // imperative
//   setPage(n, reason?)
//   setPageCount(n)
//   first() / last() / next() / prev()
//   destroy()
//
// ITEMS LIST
//
// items() returns a list describing what to render. For pageCount=20,
// page=10, siblingCount=1, boundaryCount=1:
//
//   [
//     { type: "page", page: 1 },                       // boundary start
//     { type: "ellipsis", position: "left" },          // gap
//     { type: "page", page: 9 },                       // sibling
//     { type: "page", page: 10, current: true },       // current
//     { type: "page", page: 11 },                      // sibling
//     { type: "ellipsis", position: "right" },         // gap
//     { type: "page", page: 20 },                      // boundary end
//   ]
//
// The consumer subscribes to itemschange (via the wrapper) or reads
// items() directly to render the UI. Each rendered page button is
// then registered via markPage(el, page) so the primitive can wire
// the click handler and paint aria-current.
//
// ARIA
//
// Root        role="navigation" aria-label="Pagination"
// Page list   role="list" (semantic only; consumers may also use <ol>)
// Page items  role="listitem"  aria-current="page" when current
// Buttons     standard <button> semantics; aria-label="Go to page N"
// Disabled    data-disabled attribute (consumer styles + the wrapper
//             may set the `disabled` attribute on real <button>s)

import { signal as makeSignal, effect, untrack } from "@zakkster/lite-signal";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

// ----- items algorithm -----------------------------------------------
//
// Standard pagination expansion. Edges (boundaryCount pages at the
// start and end) are always shown. Around the current page,
// siblingCount pages on each side are shown. Gaps between groups
// produce ellipsis markers. Adjacent groups merge so no ellipsis
// hides a single page.

export function buildItems(page, total, siblingCount, boundaryCount) {
    if (total <= 0) return [];
    page = Math.max(1, Math.min(total, page | 0));

    // Short-circuit: if all pages fit without ellipses, just show them.
    // Visual budget: boundary + 1 ellipsis + (2*sibling + 1 siblings) + 1 ellipsis + boundary
    //              = 2*sibling + 2*boundary + 3
    // If total <= that, we can show every page directly.
    const minTotalForEllipsis = 2 * siblingCount + 2 * boundaryCount + 3;
    if (total <= minTotalForEllipsis) {
        const items = [];
        for (let i = 1; i <= total; i++) {
            items.push({ type: "page", page: i, current: i === page });
        }
        return items;
    }

    const items = [];

    // Start boundary
    for (let i = 1; i <= boundaryCount; i++) {
        items.push({ type: "page", page: i, current: i === page });
    }

    // Sibling range, clipped so it doesn't overlap boundaries
    const siblingStart = Math.max(page - siblingCount, boundaryCount + 1);
    const siblingEnd   = Math.min(page + siblingCount, total - boundaryCount);

    // Left ellipsis (only meaningful if there's a start boundary to be
    // separated from -- otherwise the ellipsis dangles in space)
    if (boundaryCount > 0 && siblingStart > boundaryCount + 1) {
        if (siblingStart === boundaryCount + 2) {
            // gap of exactly 1: show that single missing page rather
            // than an ellipsis hiding it
            items.push({ type: "page", page: boundaryCount + 1, current: boundaryCount + 1 === page });
        } else {
            items.push({ type: "ellipsis", position: "left" });
        }
    }

    // Sibling range
    for (let i = siblingStart; i <= siblingEnd; i++) {
        items.push({ type: "page", page: i, current: i === page });
    }

    // Right ellipsis (same boundary-aware logic)
    if (boundaryCount > 0 && siblingEnd < total - boundaryCount) {
        if (siblingEnd === total - boundaryCount - 1) {
            items.push({ type: "page", page: total - boundaryCount, current: total - boundaryCount === page });
        } else {
            items.push({ type: "ellipsis", position: "right" });
        }
    }

    // End boundary
    for (let i = total - boundaryCount + 1; i <= total; i++) {
        items.push({ type: "page", page: i, current: i === page });
    }

    return items;
}

// ----- primitive -----------------------------------------------------

export function createPagination(options = {}) {
    const {
        pageCount: initialPageCount = 1,
        defaultPage = 1,
        page: externalPage,
        siblingCount = 1,
        boundaryCount = 1,
        onChange,
        onItemsChange,
    } = options;

    if (!Number.isInteger(initialPageCount) || initialPageCount < 1) {
        throw new Error(`createPagination: pageCount must be a positive integer, got ${initialPageCount}`);
    }
    if (!Number.isInteger(siblingCount) || siblingCount < 0) {
        throw new Error(`createPagination: siblingCount must be a non-negative integer, got ${siblingCount}`);
    }
    if (!Number.isInteger(boundaryCount) || boundaryCount < 0) {
        throw new Error(`createPagination: boundaryCount must be a non-negative integer, got ${boundaryCount}`);
    }

    // ----- state -----------------------------------------------------
    const _own = externalPage ? null : makeSignal(Math.max(1, Math.min(initialPageCount, defaultPage | 0)));
    function _read() { return externalPage ? Math.max(1, externalPage() | 0) : _own(); }
    function _write(v) {
        if (externalPage) return;
        _own.set(v);
    }

    const _pageCount = makeSignal(initialPageCount);
    let _destroyed = false;
    let _rootEl = null, _prevEl = null, _nextEl = null, _firstEl = null, _lastEl = null;
    let _pageListEl = null;
    const _pageEls = new Map();           // page number -> el
    const _detach = new Map();

    // ----- core ------------------------------------------------------
    function setPage(n, reason) {
        if (_destroyed) return false;
        const total = _pageCount();
        n = Math.max(1, Math.min(total, n | 0));
        const cur = _read();
        if (n === cur) return false;
        _write(n);
        if (onChange) { try { onChange(n, reason || "set"); } catch { /* swallow */ } }
        return true;
    }
    function setPageCount(n) {
        if (!Number.isInteger(n) || n < 1) return;
        _pageCount.set(n);
        // clamp current page if it overflowed
        const cur = _read();
        if (cur > n) _write(n);
    }
    function next() { return setPage(_read() + 1, "next"); }
    function prev() { return setPage(_read() - 1, "prev"); }
    function first(){ return setPage(1, "first"); }
    function last() { return setPage(_pageCount(), "last"); }

    // ----- items computed --------------------------------------------
    // Recomputed whenever page or pageCount changes. We expose the
    // most-recent items array via a signal so the wrapper can
    // subscribe via effect().
    const _items = makeSignal([]);
    const stopItemsEffect = effect(() => {
        const p = _read();
        const total = _pageCount();
        const list = untrack(() => buildItems(p, total, siblingCount, boundaryCount));
        _items.set(list);
        if (onItemsChange) {
            try { onItemsChange(list); } catch { /* swallow */ }
        }
    });

    // ----- ARIA paint effect -----------------------------------------
    // Re-paint disabled state on prev/next/first/last + page item
    // aria-current as page changes.
    const stopPaint = effect(() => {
        const p = _read();
        const total = _pageCount();
        paintNavButton(_prevEl, p <= 1, `Go to previous page`);
        paintNavButton(_nextEl, p >= total, `Go to next page`);
        paintNavButton(_firstEl, p <= 1, `Go to first page`);
        paintNavButton(_lastEl, p >= total, `Go to last page`);
        for (const [page, el] of _pageEls) {
            const isCurrent = page === p;
            if (isCurrent) {
                setAttr(el, "aria-current", "page");
                setAttr(el, "data-current", "true");
            } else {
                removeAttr(el, "aria-current");
                removeAttr(el, "data-current");
            }
        }
    });
    function paintNavButton(el, isDisabled, label) {
        if (!el) return;
        if (isDisabled) {
            setAttr(el, "data-disabled", "");
            setAttr(el, "aria-disabled", "true");
            // Set actual disabled attribute too if it's a button
            if (el.tagName === "BUTTON") el.disabled = true;
        } else {
            removeAttr(el, "data-disabled");
            removeAttr(el, "aria-disabled");
            if (el.tagName === "BUTTON") el.disabled = false;
        }
        if (!el.hasAttribute("aria-label")) {
            setAttr(el, "aria-label", label);
        }
    }

    // ----- attachments ----------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "role", "navigation");
        if (!el.hasAttribute("aria-label")) setAttr(el, "aria-label", "Pagination");
        const off = () => {
            removeAttr(el, "role");
            // don't remove aria-label (consumer may have set it)
            if (_rootEl === el) _rootEl = null;
        };
        _detach.set("root", off);
        return off;
    }

    function _attachNavButton(slotName, el, action, label) {
        if (!el || _destroyed) return noop;
        const onClick = (e) => {
            // Use the data-disabled attr (and aria-disabled) as source
            // of truth -- some consumers don't use real <button>s.
            if (el.hasAttribute("data-disabled")) return;
            e.preventDefault();
            action();
        };
        el.addEventListener("click", onClick);
        // Initial paint: disabled state + aria-label
        const p = _read();
        const total = _pageCount();
        const disabledNow =
            slotName === "prev" || slotName === "first" ? p <= 1
          : slotName === "next" || slotName === "last"  ? p >= total
          : false;
        paintNavButton(el, disabledNow, label);
        const off = () => {
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-disabled");
            removeAttr(el, "aria-disabled");
            if (el.tagName === "BUTTON") el.disabled = false;
        };
        _detach.set(slotName, off);
        return off;
    }

    function attachPrev(el) {
        _prevEl = el;
        return _attachNavButton("prev", el, prev, "Go to previous page");
    }
    function attachNext(el) {
        _nextEl = el;
        return _attachNavButton("next", el, next, "Go to next page");
    }
    function attachFirst(el) {
        _firstEl = el;
        return _attachNavButton("first", el, first, "Go to first page");
    }
    function attachLast(el) {
        _lastEl = el;
        return _attachNavButton("last", el, last, "Go to last page");
    }

    function attachPageList(el) {
        if (!el || _destroyed) return noop;
        _pageListEl = el;
        if (!el.hasAttribute("role")) setAttr(el, "role", "list");
        const off = () => {
            // don't remove role if it was already there
            if (_pageListEl === el) _pageListEl = null;
        };
        _detach.set("pageList", off);
        return off;
    }

    function markPage(el, page) {
        if (!el || _destroyed) return noop;
        const n = page | 0;
        if (n < 1 || n > _pageCount()) return noop;
        _pageEls.set(n, el);
        // Initial ARIA paint
        const isCurrent = n === _read();
        if (isCurrent) {
            setAttr(el, "aria-current", "page");
            setAttr(el, "data-current", "true");
        } else {
            removeAttr(el, "aria-current");
            removeAttr(el, "data-current");
        }
        if (!el.hasAttribute("aria-label")) {
            setAttr(el, "aria-label", `Go to page ${n}`);
        }
        const onClick = (e) => {
            e.preventDefault();
            setPage(n, "click");
        };
        el.addEventListener("click", onClick);
        // The cleanup removes the click listener AND drops the el
        // from _pageEls. Useful when re-rendering the page list.
        const off = () => {
            el.removeEventListener("click", onClick);
            removeAttr(el, "aria-current");
            removeAttr(el, "data-current");
            if (_pageEls.get(n) === el) _pageEls.delete(n);
        };
        return off;
    }

    // ----- destroy ---------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopItemsEffect();
        stopPaint();
        for (const off of _detach.values()) { try { off(); } catch { /* swallow */ } }
        _detach.clear();
        // clean up page el ARIA
        for (const [, el] of _pageEls) {
            removeAttr(el, "aria-current");
            removeAttr(el, "data-current");
        }
        _pageEls.clear();
        _rootEl = null; _prevEl = null; _nextEl = null;
        _firstEl = null; _lastEl = null; _pageListEl = null;
    }

    return {
        // reactive
        page:      () => _read(),
        pageCount: () => _pageCount(),
        items:     () => _items(),
        // imperative
        setPage, setPageCount, first, last, next, prev,
        // attachments
        attachRoot, attachPrev, attachNext, attachFirst, attachLast,
        attachPageList, markPage,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
