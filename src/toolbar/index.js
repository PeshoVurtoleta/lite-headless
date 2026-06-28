// @zakkster/lite-headless / toolbar
//
// Headless ARIA toolbar. A container of grouped controls with:
//
//   - role="toolbar" on the root (with aria-orientation when vertical)
//   - roving tabindex (single tab stop; arrow keys traverse items)
//   - Home/End jump
//   - Disabled items skipped during arrow navigation
//   - Optional separators (role="separator") between groups
//
// Slot markers (consumer markup -> wrapper inputs):
//
//   data-toolbar-item         each focusable control
//   data-toolbar-separator    visual separator between groups
//   data-toolbar-group        wrap related items (purely structural)
//
// The primitive is intentionally thin: arrow nav + roving focus + the
// ARIA paint. Items themselves are whatever the consumer drops in
// (button, menu trigger, toggle, etc.).

import { setAttr, toggleAttr } from "../_overlay/aria.js";
import { createRovingFocus, STRATEGY_DOM_FOCUS } from "../_overlay/roving-focus.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createToolbar(opts = {}) {
    const o = opts || {};
    const orientation = o.orientation === "vertical" ? "vertical" : "horizontal";
    const loop = o.loop !== false;    // default true

    let _rootEl = null;
    const _items = [];    // [{ el, disabled }]
    const _destroyed = { v: false };
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    // ─── roving focus ────────────────────────────────────────────────

    const roving = createRovingFocus({
        getItems: () => _items,
        strategy: STRATEGY_DOM_FOCUS,
        loop,
        itemAttr: "data-toolbar-item-focused",
        // Disable typeahead -- toolbars don't expect alpha keys to jump.
        typeahead: false,
    });

    // ─── root attach (binds the keyboard handler) ────────────────────

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "role", "toolbar");
        setAttr(el, "data-toolbar-root", "");
        setAttr(el, "data-orientation", orientation);
        // aria-orientation: W3C default is horizontal; only set when vertical.
        if (orientation === "vertical") {
            setAttr(el, "aria-orientation", "vertical");
        }

        const NEXT = orientation === "vertical" ? "ArrowDown"  : "ArrowRight";
        const PREV = orientation === "vertical" ? "ArrowUp"    : "ArrowLeft";

        // Before delegating to roving, make sure roving's internal index
        // matches the actually-focused item. Without this, focusing an
        // item from OUTSIDE the toolbar (page Tab in, programmatic
        // focus, etc.) leaves roving at index=-1; the first arrow press
        // would then land on the FIRST enabled item -- which is often
        // the same one already focused, looking like the key did nothing.
        function syncIndexFromActiveElement() {
            const active = document.activeElement;
            if (!active) return;
            for (let i = 0; i < _items.length; i++) {
                if (_items[i].el === active) {
                    roving.setIndex(i);
                    return;
                }
            }
        }

        const onKey = (ev) => {
            if (!ev || typeof ev.key !== "string") return;
            switch (ev.key) {
                case NEXT:    ev.preventDefault(); syncIndexFromActiveElement(); roving.move(+1); break;
                case PREV:    ev.preventDefault(); syncIndexFromActiveElement(); roving.move(-1); break;
                case "Home":  ev.preventDefault(); roving.first(); break;
                case "End":   ev.preventDefault(); roving.last();  break;
            }
        };
        el.addEventListener("keydown", onKey);

        // Click + Tab-in sync. Without this, focusing a toolbar item
        // from outside (mouse click on an item, Tab into the toolbar,
        // programmatic focus) updates `document.activeElement` but
        // leaves roving's internal `_index` stale. Subsequent arrow
        // presses then jump from wherever roving "thinks" you are,
        // rather than where you actually are. focusin bubbles, so
        // a single listener on the root catches focus on any item.
        const onFocusIn = () => { syncIndexFromActiveElement(); };
        el.addEventListener("focusin", onFocusIn);

        const off = () => {
            el.removeEventListener("keydown", onKey);
            el.removeEventListener("focusin", onFocusIn);
            removeAttr(el, "role");
            removeAttr(el, "data-toolbar-root");
            removeAttr(el, "data-orientation");
            removeAttr(el, "aria-orientation");
            if (_rootEl === el) _rootEl = null;
        };
        addCleanup(off);
        return off;
    }

    // ─── item attach ─────────────────────────────────────────────────

    function attachItem(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-toolbar-item", "");
        // Initial tabindex: 0 for the first item, -1 for the rest.
        // roving-focus updates these as the user navigates.
        if (_items.length === 0) setAttr(el, "tabindex", "0");
        else                     setAttr(el, "tabindex", "-1");

        const entry = {
            el,
            disabled: el.hasAttribute("data-disabled") || el.getAttribute("aria-disabled") === "true",
        };
        _items.push(entry);

        const off = () => {
            removeAttr(el, "data-toolbar-item");
            removeAttr(el, "data-toolbar-item-focused");
            removeAttr(el, "tabindex");
            const idx = _items.indexOf(entry);
            if (idx >= 0) _items.splice(idx, 1);
        };
        addCleanup(off);
        return off;
    }

    function attachSeparator(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "role", "separator");
        setAttr(el, "data-toolbar-separator", "");
        // Separator's own orientation is PERPENDICULAR to the toolbar.
        setAttr(el, "aria-orientation", orientation === "vertical" ? "horizontal" : "vertical");
        const off = () => {
            removeAttr(el, "role");
            removeAttr(el, "data-toolbar-separator");
            removeAttr(el, "aria-orientation");
        };
        addCleanup(off);
        return off;
    }

    function attachGroup(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "role", "group");
        setAttr(el, "data-toolbar-group", "");
        const off = () => {
            removeAttr(el, "role");
            removeAttr(el, "data-toolbar-group");
        };
        addCleanup(off);
        return off;
    }

    // ─── per-item disabled state ─────────────────────────────────────

    function setItemDisabled(el, disabled) {
        if (_destroyed.v) return;
        const d = !!disabled;
        toggleAttr(el, "data-disabled", d);
        setAttr(el, "aria-disabled", d ? "true" : "false");
        for (let i = 0; i < _items.length; i++) {
            if (_items[i].el === el) {
                _items[i].disabled = d;
                break;
            }
        }
    }

    // ─── programmatic focus ──────────────────────────────────────────

    function focusFirst() { roving.first(); }
    function focusLast()  { roving.last(); }
    function focusItem(el) {
        for (let i = 0; i < _items.length; i++) {
            if (_items[i].el === el) {
                roving.setIndex(i);
                return;
            }
        }
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
        roving.destroy();
        _items.length = 0;
    }

    return {
        attachRoot,
        attachItem,
        attachSeparator,
        attachGroup,
        setItemDisabled,
        focusFirst, focusLast, focusItem,
        destroy,
        get destroyed() { return _destroyed.v; },
        // Introspection (tests)
        _items: () => _items.slice(),
    };
}
