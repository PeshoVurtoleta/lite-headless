// @zakkster/lite-headless / rating / index.js
//
// createRating(options) -> RatingHandle
//
// Star/icon rating input. Used for reviews, feedback, satisfaction
// scores. Supports:
//
//   - configurable item count (default 5)
//   - half-step or whole-step values
//   - hover preview (mouse hovering shows a transient value distinct
//     from the committed value)
//   - keyboard nav (left/right arrows, home/end, number keys 1-9)
//   - read-only mode (display a value without allowing changes)
//   - clearable (click the active item to zero the rating)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}

function clamp(n, lo, hi) {
    return n < lo ? lo : (n > hi ? hi : n);
}

export function createRating(options = {}) {
    const {
        max = 5,
        defaultValue = 0,
        step = 1,                  // 1 = whole-star; 0.5 = half-star
        readOnly = false,
        clearable = false,
        onValueChange,
        onHoverChange,
        ariaLabel = "Rating",
    } = options;

    if (max < 1) throw new Error("createRating: max must be >= 1");
    if (step !== 1 && step !== 0.5) {
        throw new Error("createRating: step must be 1 or 0.5");
    }

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- state ---------------------------------------------------------

    const _value = makeSignal(clamp(Number(defaultValue) || 0, 0, max));
    const _hoverValue = makeSignal(null);    // null when not hovering
    const _readOnly = makeSignal(!!readOnly);

    // ----- accessors -----------------------------------------------------

    function value()     { return _value(); }
    function hoverValue(){ return _hoverValue(); }
    // displayValue is hoverValue when hovering, otherwise the committed value.
    function displayValue() {
        const hv = _hoverValue();
        return hv != null ? hv : _value();
    }
    function isReadOnly() { return _readOnly(); }

    // ----- mutations -----------------------------------------------------

    function setValue(v, reason) {
        if (_destroyed) return;
        if (_readOnly()) return;
        let next = clamp(Number(v) || 0, 0, max);
        // Snap to step
        next = Math.round(next / step) * step;
        const cur = _value();
        if (next === cur) return;
        _value.set(next);
        if (onValueChange) {
            try { onValueChange(next, cur, reason || "api"); } catch {}
        }
    }

    function setHoverValue(v) {
        if (_destroyed) return;
        if (_readOnly()) return;
        let next;
        if (v == null) {
            next = null;
        } else {
            next = clamp(Number(v) || 0, 0, max);
            next = Math.round(next / step) * step;
        }
        const cur = _hoverValue();
        if (next === cur) return;
        _hoverValue.set(next);
        if (onHoverChange) {
            try { onHoverChange(next); } catch {}
        }
    }

    function clear() {
        if (_readOnly()) return;
        setValue(0, "clear");
    }

    function setReadOnly(b) {
        if (_destroyed) return;
        const next = !!b;
        if (next === _readOnly()) return;
        _readOnly.set(next);
    }

    // ----- attach: root --------------------------------------------------

    let _root = null;
    const _itemEls = new Map();   // el -> { index, off }

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _root = el;
        ensureId(el, "lh-rating");
        setAttr(el, "role", "radiogroup");
        setAttr(el, "aria-label", ariaLabel);

        // Keyboard nav on the root element itself.
        // We DON'T set tabindex on the root because each item handles its
        // own focus. But we listen to keydown bubbled from items.
        const onKey = (ev) => {
            if (_readOnly()) return;
            const cur = _value();
            let next = null;
            if (ev.key === "ArrowRight" || ev.key === "ArrowUp") {
                next = Math.min(max, cur + step);
            } else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") {
                next = Math.max(0,   cur - step);
            } else if (ev.key === "Home") {
                next = 0;
            } else if (ev.key === "End") {
                next = max;
            } else if (/^[0-9]$/.test(ev.key)) {
                const n = parseInt(ev.key, 10);
                if (n <= max) next = n;
            }
            if (next != null) {
                ev.preventDefault();
                setValue(next, "keyboard");
            }
        };
        el.addEventListener("keydown", onKey);

        const stop = effect(() => {
            setAttr(el, "data-max", String(max));
            setAttr(el, "data-step", String(step));
            setAttr(el, "data-value", String(_value()));
            setAttr(el, "data-display-value", String(displayValue()));
            toggleAttr(el, "data-read-only", _readOnly());
            toggleAttr(el, "data-hovering", _hoverValue() != null);
        });
        addCleanup(stop);

        const off = () => {
            stop();
            el.removeEventListener("keydown", onKey);
            if (_root === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-label");
                el.removeAttribute("data-max");
                el.removeAttribute("data-step");
                el.removeAttribute("data-value");
                el.removeAttribute("data-display-value");
                el.removeAttribute("data-read-only");
                el.removeAttribute("data-hovering");
                _root = null;
            }
        };
        addCleanup(off);
        return off;
    }

    // ----- attach: item --------------------------------------------------
    //
    // Each "item" represents one position in the rating (1-indexed via
    // the index argument). For half-step ratings, two visual halves may
    // share the same index but the consumer typically renders them as
    // a single element (using CSS pseudo-elements + the displayValue
    // attribute on the root for the fill percentage).
    //
    // For pointer support, the consumer typically passes the whole-item
    // index. If half-step support is needed, the consumer can attach
    // two sub-handles per item via attachSubItem (one for the left half
    // representing index-0.5, one for the right half representing
    // index). Or attach a "rail" via attachRail for pointer-x mapping.

    function attachItem(el, index) {
        if (!el || _destroyed || typeof index !== "number") return noop;
        const prev = _itemEls.get(el);
        if (prev) prev.off();

        ensureId(el, "lh-rating-item");
        setAttr(el, "role", "radio");
        setAttr(el, "data-index", String(index));
        // The item is focusable only when it's the currently-selected
        // index (or no selection yet, in which case the first item).
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "-1");

        const onClick = (ev) => {
            if (_readOnly()) return;
            ev.preventDefault();
            const cur = _value();
            // Clear behavior: click on the currently-selected item zeros
            // the rating (when clearable=true).
            if (clearable && cur === index) {
                setValue(0, "click");
            } else {
                setValue(index, "click");
            }
        };
        const onMouseEnter = () => {
            if (_readOnly()) return;
            setHoverValue(index);
        };
        const onMouseLeave = () => {
            if (_readOnly()) return;
            setHoverValue(null);
        };
        el.addEventListener("click", onClick);
        el.addEventListener("mouseenter", onMouseEnter);
        el.addEventListener("mouseleave", onMouseLeave);

        // Reactive paint of fill state.
        const stop = effect(() => {
            const dv = displayValue();
            const filled = index <= dv;
            const half = !filled && (index - step) < dv && dv < index;
            toggleAttr(el, "data-filled", filled);
            toggleAttr(el, "data-half-filled", half);
            toggleAttr(el, "data-empty", !filled && !half);
            const cur = _value();
            const checked = index <= cur;
            setAttr(el, "aria-checked", checked ? "true" : "false");
            // Focusable when this is the "current" item (lowest filled
            // or the next-to-fill if nothing's selected).
            const focusedIdx = cur > 0 ? Math.ceil(cur) : 1;
            setAttr(el, "tabindex", index === focusedIdx ? "0" : "-1");
        });

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeEventListener("mouseenter", onMouseEnter);
            el.removeEventListener("mouseleave", onMouseLeave);
            el.removeAttribute("role");
            el.removeAttribute("data-index");
            el.removeAttribute("data-filled");
            el.removeAttribute("data-half-filled");
            el.removeAttribute("data-empty");
            el.removeAttribute("aria-checked");
            el.removeAttribute("tabindex");
            _itemEls.delete(el);
        };
        _itemEls.set(el, { index, off });
        addCleanup(off);
        return off;
    }

    // ----- attach: rail (for half-step pointer support) ------------------
    //
    // The rail is the parent container of all items. Hovering the rail
    // sets hoverValue based on pointer.x relative to the rail width.
    // Clicking commits the value. This is the "drag the pointer across
    // 3.5 stars" gesture.

    function attachRail(el) {
        if (!el || _destroyed) return noop;
        // Layout-thrash guard: caching the rail's bounding rect on enter
        // (and invalidating on scroll/resize) is necessary because
        // mousemove fires up to 120Hz on high-refresh displays. Reading
        // getBoundingClientRect each move forces a style-and-layout
        // reflow per frame, which on a page with non-trivial layout
        // (the admin theme's data tables, for example) is observable
        // jank. Pointer events don't change geometry, so the rect can
        // be read once per drag session.
        let _railRect = null;
        function invalidateRect() { _railRect = null; }
        function ensureRect() {
            if (!_railRect) _railRect = el.getBoundingClientRect();
            return _railRect;
        }
        const onEnter = () => { ensureRect(); };
        const onMove = (ev) => {
            if (_readOnly()) return;
            const rect = ensureRect();
            const x = ev.clientX - rect.left;
            const frac = clamp(x / rect.width, 0, 1);
            const raw = frac * max;
            const snapped = Math.round(raw / step) * step;
            setHoverValue(snapped);
        };
        const onLeave = () => {
            invalidateRect();
            setHoverValue(null);
        };
        const onClick = (ev) => {
            if (_readOnly()) return;
            const rect = ensureRect();
            const x = ev.clientX - rect.left;
            const frac = clamp(x / rect.width, 0, 1);
            const raw = frac * max;
            const snapped = Math.round(raw / step) * step;
            setValue(snapped, "rail-click");
        };
        el.addEventListener("mouseenter", onEnter);
        el.addEventListener("mousemove",  onMove);
        el.addEventListener("mouseleave", onLeave);
        el.addEventListener("click",      onClick);
        // Window-level invalidation: any layout change wipes the cache.
        // `passive: true` because we never preventDefault on these.
        const win = (typeof window !== "undefined") ? window : null;
        if (win) {
            win.addEventListener("scroll", invalidateRect, { passive: true, capture: true });
            win.addEventListener("resize", invalidateRect, { passive: true });
        }
        const off = () => {
            el.removeEventListener("mouseenter", onEnter);
            el.removeEventListener("mousemove",  onMove);
            el.removeEventListener("mouseleave", onLeave);
            el.removeEventListener("click",      onClick);
            if (win) {
                win.removeEventListener("scroll", invalidateRect, { capture: true });
                win.removeEventListener("resize", invalidateRect);
            }
        };
        addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _itemEls.clear();
        _root = null;
    }

    return {
        // reactive
        value, hoverValue, displayValue, isReadOnly,
        // mutations
        setValue, setHoverValue, clear, setReadOnly,
        // attach
        attachRoot, attachItem, attachRail,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        get max()  { return max; },
        get step() { return step; },
    };
}
