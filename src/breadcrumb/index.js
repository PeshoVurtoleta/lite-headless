// @zakkster/lite-headless / breadcrumb
//
// Navigation trail showing the user's path through hierarchical
// content. Last item is marked aria-current="page" (the current
// location). Earlier items are typically links back to ancestors.
//
// API
//
//   createBreadcrumb({
//       separator?: "/",            // text for default separators
//       onItemClick?: (key, index, event) => void,
//   })
//
//   attachRoot(navEl)              // nav element wrapping the trail
//   attachList(olEl)               // role=list; consumer renders <li>s
//   attachItem(el, key, opts?)     // wires click + paints aria-current
//                                   // opts: { current?: false, label? }
//   attachSeparator(el)            // optional explicit separator wiring
//                                   // (auto sets aria-hidden=true)
//
//   setCurrent(key)                // mark a specific item as current
//                                   // moves aria-current="page" + data-current
//   items()                        // [{ key, current }, ...]
//   destroy()
//
// ARIA
//
//   Root:        role="navigation" aria-label="Breadcrumb"
//   List:        role="list"
//   Items:       role="listitem"; aria-current="page" on the current
//                (last by default); data-current="true" for CSS
//   Separator:   aria-hidden="true"
//
// CSS contract
//
//   .item[data-current="true"]    -- current location (typically dim/no link)
//   .item:not([data-current])     -- ancestor (typically styled as link)
//
// COMMON USAGE
//
// The last item attached is automatically marked current unless the
// consumer explicitly passes current:false. Consumers can also call
// setCurrent(key) to move the marker (useful for SPA route changes).
//
//   bc.attachItem(homeEl, "home");
//   bc.attachItem(projectsEl, "projects");
//   bc.attachItem(currentEl, "this-project");      // auto-current
//
// SEPARATOR HANDLING
//
// Separators can be:
//   (a) Pure CSS via ::after pseudos with content (no JS required;
//       consumer adds [data-bc-sep] css that draws " / " between items)
//   (b) Real DOM elements that the consumer creates and passes to
//       attachSeparator(el) so the primitive can set aria-hidden=true
//       (important: screen readers should NOT read the separator)
//
// We support both. Consumers can mix and match.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createBreadcrumb(options = {}) {
    const {
        separator = "/",
        onItemClick,
    } = options;

    let _destroyed = false;
    let _rootEl = null;
    let _listEl = null;
    // items in order of attachment; current is whichever has current:true
    // (or the last attached if none marked)
    const _items = [];       // { el, key, off, label }
    const _currentKey = makeSignal(null);
    // Tick counter: bumped whenever the items list mutates. The paint
    // effect tracks this so it re-runs even when _currentKey's value
    // doesn't change between attaches (e.g., still null -> null but
    // the LAST-item resolution result differs).
    const _itemsTick = makeSignal(0);
    const _separators = new Set();

    function _resolveCurrentKey() {
        // If an explicit current key is set AND it matches an item, use it.
        // Otherwise fall back to the last attached item.
        const explicit = _currentKey();
        if (explicit) {
            for (const it of _items) if (it.key === explicit) return explicit;
        }
        if (_items.length === 0) return null;
        return _items[_items.length - 1].key;
    }

    // ----- paint effect: aria-current on the right item ---------
    const stopPaint = effect(() => {
        _currentKey();        // track explicit selection changes
        _itemsTick();         // track items-list mutations
        const currKey = _resolveCurrentKey();
        for (const it of _items) {
            if (!it.el) continue;
            if (it.key === currKey) {
                setAttr(it.el, "aria-current", "page");
                setAttr(it.el, "data-current", "true");
            } else {
                removeAttr(it.el, "aria-current");
                removeAttr(it.el, "data-current");
            }
        }
    });

    // ----- attach root ----------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "role", "navigation");
        if (!el.hasAttribute("aria-label")) setAttr(el, "aria-label", "Breadcrumb");
        const off = () => {
            removeAttr(el, "role");
            if (_rootEl === el) _rootEl = null;
        };
        return off;
    }

    // ----- attach list ----------------------------------------
    function attachList(el) {
        if (!el || _destroyed) return noop;
        _listEl = el;
        if (!el.hasAttribute("role")) setAttr(el, "role", "list");
        const off = () => {
            if (_listEl === el) _listEl = null;
        };
        return off;
    }

    // ----- attach item ----------------------------------------
    // The first attached item is the root of the trail; the last is
    // the current location. Click handlers fire the onItemClick callback
    // so consumers can intercept navigation (e.g., SPA router pushState
    // instead of native navigation).
    function attachItem(el, key, opts = {}) {
        if (!el || _destroyed) return noop;
        if (typeof key !== "string" || !key) {
            throw new Error("attachItem: key must be a non-empty string");
        }
        const idx = _items.length;
        const item = { el, key, label: opts.label || el.textContent };
        _items.push(item);

        if (!el.hasAttribute("role")) setAttr(el, "role", "listitem");

        // If consumer passed current:true explicitly, set it now
        if (opts.current === true) {
            _currentKey.set(key);
        }
        // Bump the items tick so the paint effect re-runs with the new
        // items list (the last-item-as-default may have shifted).
        _itemsTick.set(_itemsTick() + 1);

        const onClick = (e) => {
            // Don't prevent default by default -- if the consumer wrapped
            // the item in an <a href>, let native nav happen. Consumers
            // who want SPA behavior call e.preventDefault() themselves.
            if (onItemClick) {
                try { onItemClick(key, idx, e); } catch { /* swallow */ }
            }
        };
        el.addEventListener("click", onClick);

        const off = () => {
            el.removeEventListener("click", onClick);
            removeAttr(el, "aria-current");
            removeAttr(el, "data-current");
            const i = _items.indexOf(item);
            if (i >= 0) _items.splice(i, 1);
            // re-resolve current via tick
            _itemsTick.set(_itemsTick() + 1);
        };
        item.off = off;
        return off;
    }

    // ----- attach separator -----------------------------------
    function attachSeparator(el) {
        if (!el || _destroyed) return noop;
        _separators.add(el);
        setAttr(el, "aria-hidden", "true");
        setAttr(el, "data-bc-sep", "");
        // If no text content, populate with the configured separator
        if (!el.textContent.trim()) el.textContent = separator;
        const off = () => {
            removeAttr(el, "aria-hidden");
            removeAttr(el, "data-bc-sep");
            _separators.delete(el);
        };
        return off;
    }

    // ----- imperative -----------------------------------------
    function setCurrent(key) {
        if (_destroyed) return false;
        // Allow null to clear (falls back to last-attached)
        if (key != null && typeof key !== "string") return false;
        _currentKey.set(key);
        return true;
    }

    function items() {
        const curr = _resolveCurrentKey();
        return _items.map(it => ({
            key: it.key,
            label: it.label,
            current: it.key === curr,
        }));
    }

    // ----- destroy --------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        for (const it of _items) {
            if (it.el) {
                removeAttr(it.el, "aria-current");
                removeAttr(it.el, "data-current");
            }
        }
        _items.length = 0;
        for (const sep of _separators) {
            removeAttr(sep, "aria-hidden");
            removeAttr(sep, "data-bc-sep");
        }
        _separators.clear();
        _rootEl = null;
        _listEl = null;
    }

    return {
        items,
        setCurrent,
        currentKey: () => _resolveCurrentKey(),
        attachRoot, attachList, attachItem, attachSeparator,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
