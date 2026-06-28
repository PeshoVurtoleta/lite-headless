// @zakkster/lite-headless / _overlay / roving-focus.js
//
// Shared keyboard-driven highlight engine for primitives that present a
// list of selectable items. Replaces the duplicated typeahead + arrow-key
// state that lived in createCombobox and createMenu (and would have been
// duplicated again in tabs, tree-view, sortable, stepper-list, etc.).
//
// The helper owns:
//   - the current "highlighted index" (renamed from _focusIndex /
//     _highlightIndex)
//   - the typeahead buffer + timeout
//   - the DOM-state writes that follow the highlight (roving tabindex OR
//     aria-activedescendant, plus a per-item data attribute)
//
// It does NOT own:
//   - the items array itself (each primitive shapes its items differently
//     -- menus have onSelect/hasSubmenu/group, comboboxes have value/label,
//     trees have level/expanded; the helper consumes a getItems() callback)
//   - keyboard EVENT routing (each primitive has different keys -- menu
//     has submenu navigation, combobox has Tab-to-select, tree has
//     Right-to-expand-or-descend). The helper exposes the primitive
//     operations (`move`, `first`, `last`, `typeChar`) and the consumer
//     wires its own switch statement.
//
// STRATEGIES
//
// "dom-focus" (default): roving tabindex pattern. The highlighted item
// gets `tabindex="0"` and real DOM focus via `.focus()`; siblings get
// `tabindex="-1"`. Use this when the items themselves should receive
// keyboard input (menu items, treeitems with their own click handlers).
//
// "active-descendant": aria-activedescendant pattern. DOM focus stays on
// a single "host" element (e.g. the combobox trigger / input); items are
// marked via a data attribute and the host element's
// `aria-activedescendant` is updated to reference the item's id. Use this
// when the host needs to keep receiving keyboard input (combobox input
// text, listbox-with-input, autosuggest).
//
// HOT-PATH POSTURE
//
// Typeahead allocates one `enabled[]` array per keystroke (bounded by
// human typing rate). The `same-char` cycle detection uses a char-code
// walk rather than `split("").every()` -- no temporary char-array.
// `setIndex` writes to at most 2 elements (clear previous + set current)
// in active-descendant mode; in dom-focus mode it walks the items once to
// set tabindex (necessary for roving tabindex correctness; can't be
// avoided without WeakMap bookkeeping that would cost as much as the
// walk for the typical N=20 menu).

const noop = () => {};

export const STRATEGY_DOM_FOCUS = "dom-focus";
export const STRATEGY_ACTIVE_DESCENDANT = "active-descendant";

/**
 * @param {object} opts
 * @param {() => Array<{el: Element, id?: string, disabled?: boolean, label?: string}>} opts.getItems
 *   Returns the live items array. Called on every operation; the helper
 *   does not cache.
 * @param {string} [opts.strategy="dom-focus"]
 *   Either STRATEGY_DOM_FOCUS or STRATEGY_ACTIVE_DESCENDANT.
 * @param {() => Element | null} [opts.getFocusHost]
 *   Required for active-descendant strategy. The element whose
 *   `aria-activedescendant` is updated to the highlighted item's id.
 * @param {boolean} [opts.loop=true]
 *   Whether `move(±1)` wraps at the ends.
 * @param {boolean} [opts.typeahead=true]
 * @param {number}  [opts.typeaheadTimeout=500]
 * @param {(item) => string} [opts.getLabel]
 *   Lowercased label used for typeahead matching. Defaults to
 *   `(item.label || item.el.textContent || "").toLowerCase()`.
 * @param {string} [opts.itemAttr]
 *   Per-item attribute applied to the highlighted item. Defaults to
 *   "data-focused" in dom-focus mode and "data-highlighted" in
 *   active-descendant mode -- preserves prior contract on both primitives.
 * @param {(idx: number, prev: number) => void} [opts.onIndexChange]
 *   Optional callback fired AFTER the DOM writes have been applied.
 */
export function createRovingFocus(opts) {
    const {
        getItems,
        strategy = STRATEGY_DOM_FOCUS,
        getFocusHost,
        loop = true,
        typeahead = true,
        typeaheadTimeout = 500,
        getLabel,
        onIndexChange,
    } = opts;

    const itemAttr = opts.itemAttr || (strategy === STRATEGY_DOM_FOCUS ? "data-focused" : "data-highlighted");

    let _index = -1;
    let _typeBuf = "";
    let _typeTimer = null;

    function defaultLabel(item) {
        return (item.label || item.el.textContent || "").toLowerCase();
    }
    const labelOf = getLabel || defaultLabel;

    // Enabled-index helper. One small allocation per call; could be cached
    // on the items array via a WeakMap if profiling shows it dominates,
    // but for typical N<=50 it's noise.
    function enabledIndices(items) {
        const out = [];
        for (let i = 0; i < items.length; i++) {
            if (!items[i].disabled) out.push(i);
        }
        return out;
    }

    function writeDomState(items, idx, prev) {
        // Clear previous item's per-item attribute (both strategies).
        if (prev >= 0 && prev < items.length && items[prev]) {
            items[prev].el.removeAttribute(itemAttr);
        }
        if (strategy === STRATEGY_DOM_FOCUS) {
            // Roving tabindex: only the highlighted item is tabbable. We
            // walk all items each time because there's no per-item "is
            // currently tabbable" cache; the walk is O(N) but N is the
            // menu/list size, which is human-bounded.
            for (let i = 0; i < items.length; i++) {
                items[i].el.setAttribute("tabindex", i === idx ? "0" : "-1");
            }
            if (idx >= 0 && items[idx]) {
                items[idx].el.setAttribute(itemAttr, "");
                try { items[idx].el.focus({ preventScroll: true }); }
                catch { try { items[idx].el.focus(); } catch { /* noop */ } }
                try { items[idx].el.scrollIntoView({ block: "nearest" }); }
                catch { /* noop */ }
            }
        } else {
            // active-descendant: DOM focus stays on the host, items are
            // marked via attribute, host's aria-activedescendant points
            // at the highlighted item's id.
            const host = getFocusHost && getFocusHost();
            if (idx >= 0 && items[idx]) {
                items[idx].el.setAttribute(itemAttr, "");
                if (host && items[idx].id) host.setAttribute("aria-activedescendant", items[idx].id);
                try { items[idx].el.scrollIntoView({ block: "nearest" }); }
                catch { /* noop */ }
            } else if (host) {
                host.removeAttribute("aria-activedescendant");
            }
        }
    }

    function setIndex(idx) {
        const items = getItems();
        if (idx < -1) idx = -1;
        if (idx >= items.length) idx = -1;
        if (idx === _index) return;
        const prev = _index;
        _index = idx;
        writeDomState(items, idx, prev);
        if (onIndexChange) {
            try { onIndexChange(idx, prev); } catch { /* swallow */ }
        }
    }

    function move(delta) {
        const items = getItems();
        if (items.length === 0) return;
        const enabled = enabledIndices(items);
        if (enabled.length === 0) return;
        const cur = enabled.indexOf(_index);
        let next;
        if (cur < 0) {
            next = delta > 0 ? enabled[0] : enabled[enabled.length - 1];
        } else {
            let i = cur + delta;
            if (loop) {
                if (i < 0) i = enabled.length - 1;
                if (i >= enabled.length) i = 0;
            } else {
                if (i < 0) i = 0;
                if (i >= enabled.length) i = enabled.length - 1;
            }
            next = enabled[i];
        }
        setIndex(next);
    }

    function first() {
        const items = getItems();
        const enabled = enabledIndices(items);
        if (enabled.length > 0) setIndex(enabled[0]);
    }

    function last() {
        const items = getItems();
        const enabled = enabledIndices(items);
        if (enabled.length > 0) setIndex(enabled[enabled.length - 1]);
    }

    function typeChar(ch) {
        if (!typeahead) return false;
        // Defensive: callers pass e.key into typeChar; e.key can be
        // undefined on synthetic events. Bail out cleanly instead of
        // letting `.toLowerCase()` throw.
        if (typeof ch !== "string" || ch.length === 0) return false;
        if (_typeTimer) clearTimeout(_typeTimer);
        _typeBuf += ch.toLowerCase();
        _typeTimer = setTimeout(() => { _typeBuf = ""; _typeTimer = null; }, typeaheadTimeout);

        const items = getItems();
        if (items.length === 0) return false;
        const enabled = enabledIndices(items);
        if (enabled.length === 0) return false;

        // Same-char hammering = single-char cycling. Char-code walk avoids
        // the temp char-array `split("").every()` would allocate.
        let allSame = _typeBuf.length > 0;
        if (allSame) {
            const c0 = _typeBuf.charCodeAt(0);
            for (let i = 1; i < _typeBuf.length; i++) {
                if (_typeBuf.charCodeAt(i) !== c0) { allSame = false; break; }
            }
        }
        const buf = allSame ? _typeBuf.charAt(0) : _typeBuf;

        let found = -1;
        if (allSame) {
            const curPos = enabled.indexOf(_index);
            const startPos = curPos >= 0 ? (curPos + 1) % enabled.length : 0;
            for (let i = 0; i < enabled.length; i++) {
                const j = enabled[(startPos + i) % enabled.length];
                if (labelOf(items[j]).startsWith(buf)) { found = j; break; }
            }
        } else {
            for (let i = 0; i < enabled.length; i++) {
                const j = enabled[i];
                if (labelOf(items[j]).startsWith(buf)) { found = j; break; }
            }
        }
        if (found >= 0) {
            setIndex(found);
            return true;
        }
        return false;
    }

    /**
     * Reset the highlight to -1 and clear typeahead buffer. Called on
     * close in both primitives so the next open starts clean.
     */
    function reset() {
        const items = getItems();
        if (_index >= 0 && _index < items.length && items[_index]) {
            items[_index].el.removeAttribute(itemAttr);
        }
        _index = -1;
        _typeBuf = "";
        if (_typeTimer) { clearTimeout(_typeTimer); _typeTimer = null; }
        if (strategy === STRATEGY_ACTIVE_DESCENDANT) {
            const host = getFocusHost && getFocusHost();
            if (host) host.removeAttribute("aria-activedescendant");
        }
    }

    function destroy() {
        if (_typeTimer) { clearTimeout(_typeTimer); _typeTimer = null; }
    }

    return {
        // Read the current highlighted index. -1 = no highlight.
        get index() { return _index; },
        // Operations -- consumer wires these into its own key handler.
        setIndex,
        move,
        first,
        last,
        typeChar,
        // Lifecycle.
        reset,
        destroy,
    };
}
