// @zakkster/lite-headless / pagination / element.js
//
// <lite-pagination> wrapping createPagination.
//
// Markup contract:
//
//   <lite-pagination page-count="20" page="5" sibling-count="1" boundary-count="1">
//       <button data-pgn-first>« First</button>
//       <button data-pgn-prev>‹ Prev</button>
//       <ol data-pgn-list></ol>          <!-- wrapper renders <li> items into this -->
//       <button data-pgn-next>Next ›</button>
//       <button data-pgn-last>Last »</button>
//   </lite-pagination>
//
// Wrapper RENDERS the page items into the [data-pgn-list]. Each
// rendered <li> contains either a <button> for a page number or a
// span with "…" for an ellipsis. The consumer can style the <li>
// elements + their children freely.
//
// Imperative API on host:
//   host.setPage(n, reason?)
//   host.first() / last() / next() / prev()
//   host.setPageCount(n)
//   host.page              -> number
//   host.pageCount         -> number
//   host.items             -> Item[]
//
// Reactive attributes:
//   page         observed -> setPage()
//   page-count   observed -> setPageCount()
//
// Dispatched events:
//   change       { detail: { page, reason } }
//   itemschange  { detail: { items } }

import { define } from "@zakkster/lite-element";
import { createPagination } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

function parseIntAttr(raw, fallback) {
    if (raw == null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

define("lite-pagination", (host, scope) => {
    const initialPageCount  = parseIntAttr(host.getAttribute("page-count"), 1);
    const defaultPage       = parseIntAttr(host.getAttribute("page"), 1);
    const siblingCount      = parseIntAttr(host.getAttribute("sibling-count"), 1);
    const boundaryCount     = parseIntAttr(host.getAttribute("boundary-count"), 1);

    const _itemOffs = [];          // per-render markPage cleanups

    const pg = createPagination({
        pageCount: initialPageCount,
        defaultPage,
        siblingCount,
        boundaryCount,
        onChange: (page, reason) => {
            // mirror to host attribute (suppressed to avoid cascade)
            _suppressPageEffect = true;
            host.setAttribute("page", String(page));
            queueMicrotask(() => { _suppressPageEffect = false; });
            host.dispatchEvent(new CustomEvent("change", {
                detail: { page, reason }, bubbles: true,
            }));
        },
        onItemsChange: (items) => {
            renderItems(items);
            host.dispatchEvent(new CustomEvent("itemschange", {
                detail: { items }, bubbles: true,
            }));
        },
    });

    let _suppressPageEffect = false;
    let _listEl = null;

    // Role observer. scopedQuery prevents an outer pagination from
    // claiming an inner pagination's role slots (uncommon nesting
    // pattern, but consumers may put a paginated table-of-contents
    // beside a paginated row list).
    const _attached = { root: null, prev: null, next: null, first: null, last: null, list: null };
    function syncRoles() {
        const root  = host;                                       // host IS the root
        const prev  = scopedQuery(host, "[data-pgn-prev]");
        const next  = scopedQuery(host, "[data-pgn-next]");
        const first = scopedQuery(host, "[data-pgn-first]");
        const last  = scopedQuery(host, "[data-pgn-last]");
        const list  = scopedQuery(host, "[data-pgn-list]");

        if (_attached.root !== root)  { pg.attachRoot(root);   _attached.root  = root; }
        if (prev && _attached.prev !== prev)  { pg.attachPrev(prev);  _attached.prev  = prev; }
        if (next && _attached.next !== next)  { pg.attachNext(next);  _attached.next  = next; }
        if (first && _attached.first !== first){ pg.attachFirst(first); _attached.first = first; }
        if (last && _attached.last !== last)  { pg.attachLast(last);  _attached.last  = last; }
        if (list && _attached.list !== list)  {
            pg.attachPageList(list);
            _attached.list = list;
            _listEl = list;
            // Initial render — pg.items() is an accessor that returns
            // the current Item[]; without the parens you'd pass the
            // function itself and trigger "items is not iterable".
            renderItems(pg.items());
        }
    }

    // ----- render items into the list ----------------------------
    // Tears down previous <li>s + their markPage cleanups, then
    // builds fresh ones. The active <li>'s button gets a "current"
    // class via the primitive's data-current attribute (consumer
    // styles).
    function renderItems(items) {
        if (!_listEl) return;
        // Tear down previous
        for (const off of _itemOffs) { try { off(); } catch {} }
        _itemOffs.length = 0;
        _listEl.innerHTML = "";
        for (const item of items) {
            const li = document.createElement("li");
            li.setAttribute("data-pgn-item", "");
            if (item.type === "ellipsis") {
                li.setAttribute("data-pgn-ellipsis", item.position || "");
                const span = document.createElement("span");
                span.textContent = "\u2026";       // …
                span.setAttribute("aria-hidden", "true");
                li.appendChild(span);
            } else {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.textContent = String(item.page);
                btn.setAttribute("data-pgn-page", String(item.page));
                li.appendChild(btn);
                _itemOffs.push(pg.markPage(btn, item.page));
            }
            _listEl.appendChild(li);
        }
    }

    // Observe host attribute changes
    const attrMo = new MutationObserver((muts) => {
        if (_suppressPageEffect) return;
        for (const m of muts) {
            if (m.attributeName === "page") {
                const n = parseIntAttr(host.getAttribute("page"), 1);
                pg.setPage(n, "attribute");
            } else if (m.attributeName === "page-count") {
                const n = parseIntAttr(host.getAttribute("page-count"), 1);
                pg.setPageCount(n);
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["page", "page-count"] });

    // Role observer for children (initial + subsequent re-renders)
    const childMo = new MutationObserver(syncRoles);
    childMo.observe(host, { childList: true, subtree: true });
    syncRoles();

    // Expose imperative API
    host._paginationInstance = pg;
    host.setPage       = (n, reason) => pg.setPage(n, reason);
    host.setPageCount  = (n) => pg.setPageCount(n);
    host.first         = () => pg.first();
    host.last          = () => pg.last();
    host.next          = () => pg.next();
    host.prev          = () => pg.prev();
    Object.defineProperty(host, "page",      { get: () => pg.page(),      configurable: true });
    Object.defineProperty(host, "pageCount", { get: () => pg.pageCount(), configurable: true });
    Object.defineProperty(host, "items",     { get: () => pg.items(),     configurable: true });

    scope.onCleanup(() => {
        childMo.disconnect();
        attrMo.disconnect();
        for (const off of _itemOffs) { try { off(); } catch {} }
        pg.destroy();
    });
});
