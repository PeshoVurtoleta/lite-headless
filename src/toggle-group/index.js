// @zakkster/lite-headless / toggle-group
//
// Headless segmented-control / toggle-group with WAI-ARIA semantics.
// Two modes:
//   - "single": exclusive selection (like a radio group, but rendered
//              as buttons with aria-pressed -- the segmented-control pattern)
//   - "multi":  independent toggles (each item has its own aria-pressed)
//
// References:
//   - Toolbar APG:    https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/
//   - Radio APG:      https://www.w3.org/WAI/ARIA/apg/patterns/radio/
//   - Radix:          single/multi-select with aria-pressed pattern
//
// PRIMITIVE OWNS
//   - Selection logic (single or multi)
//   - Roving-tabindex keyboard navigation
//   - ARIA: role=group, aria-pressed per item, optional aria-label
//   - data-* state attrs for CSS styling
//   - Disabled handling (per item AND group-wide)
//
// API
//
//   createToggleGroup({
//       type:           "single" | "multi",   // default "single"
//       value:          string | string[] | Signal,
//                                              // controlled mode
//       defaultValue:   string | string[],    // uncontrolled seed
//       disabled:       false,                // group-wide
//       loop:           true,                 // arrow nav wraps
//       allowDeselect:  false,                // single mode: clicking
//                                              // current item deselects?
//                                              // (multi always allows)
//       orientation:    "horizontal" | "vertical",
//       onValueChange:  (value, reason) => void,
//   })
//
//   attachRoot(el)
//   attachItem(el, value)        // value is the unique key
//   setItemDisabled(value, flag)
//   setDisabled(flag)            // group-wide
//   setValue(v, reason?)
//   value()                      // reactive accessor
//   contains(v)                  // multi-mode helper
//   destroy()
//
// KEYBOARD (per APG toolbar pattern)
//
//   ArrowRight/Down: next item (loop if loop:true)
//   ArrowLeft/Up:    prev item
//   Home:            first item
//   End:             last item
//   Space / Enter:   activate (toggle in multi, select in single)
//
// In SINGLE mode, focus alone does NOT select -- that's not how
// segmented controls work (unlike radio groups, where automatic
// activation is standard). The user must explicitly activate via
// click or Space/Enter. This matches the Radix + ShadCN behavior
// and is more predictable for "view mode" selectors.
//
// ARIA pattern
//
//   Root         role="group"   aria-label or aria-labelledby
//                                 (consumer-provided)
//   Items        type="button"  aria-pressed="true|false"
//                                 aria-disabled (when disabled)
//                                 data-pressed (when on)
//                                 data-disabled
//                                 tabindex (roving: 0 on active, -1 on rest)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { toggleAttr } from "../_overlay/aria.js";
import { createRovingFocus, STRATEGY_DOM_FOCUS } from "../_overlay/roving-focus.js";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createToggleGroup(options = {}) {
    const {
        type = "single",
        value: externalValue,
        defaultValue,
        disabled: initiallyDisabled = false,
        loop = true,
        allowDeselect = false,
        orientation = "horizontal",
        onValueChange,
    } = options;

    if (type !== "single" && type !== "multi") {
        throw new Error(`createToggleGroup: type must be 'single' or 'multi', got '${type}'`);
    }
    if (orientation !== "horizontal" && orientation !== "vertical") {
        throw new Error(`createToggleGroup: orientation must be 'horizontal' or 'vertical', got '${orientation}'`);
    }

    // ----- state ----------------------------------------------------
    // Internal value is normalized:
    //   single mode -> string | null
    //   multi  mode -> string[] (always)
    function _normalizeInitial() {
        if (type === "single") {
            return typeof defaultValue === "string" ? defaultValue : null;
        }
        return Array.isArray(defaultValue) ? defaultValue.slice() : [];
    }

    const _own = externalValue ? null : makeSignal(_normalizeInitial());
    function _read() {
        if (externalValue) {
            const v = externalValue();
            if (type === "single") return typeof v === "string" ? v : null;
            return Array.isArray(v) ? v : [];
        }
        return _own();
    }
    function _write(v) {
        if (externalValue) return;
        _own.set(v);
    }

    const _disabled = makeSignal(!!initiallyDisabled);

    let _destroyed = false;
    let _rootEl = null;
    // items: array of { el, key, label, disabled }; insertion order
    // is the keyboard nav order.
    const _items = [];

    // ----- contains/setValue/etc -----------------------------------
    function contains(key) {
        const v = _read();
        if (type === "single") return v === key;
        return v.indexOf(key) >= 0;
    }

    function _setSingleValue(key, reason) {
        if (_disabled()) return false;
        const cur = _read();
        if (cur === key) return false;
        // verify the key is registered and enabled
        const item = _items.find(i => i.key === key);
        if (key != null && (!item || item.disabled)) return false;
        _write(key);
        if (onValueChange) {
            try { onValueChange(key, reason || "set"); } catch { /* swallow */ }
        }
        return true;
    }
    function _setMultiValue(arr, reason) {
        if (_disabled()) return false;
        // dedupe + filter to known enabled items
        const knownKeys = new Set(_items.filter(i => !i.disabled).map(i => i.key));
        const next = [];
        const seen = new Set();
        for (const k of arr) {
            if (seen.has(k)) continue;
            if (!knownKeys.has(k)) continue;
            seen.add(k);
            next.push(k);
        }
        const cur = _read();
        // shallow-equal check
        if (cur.length === next.length && cur.every((v, i) => v === next[i])) {
            return false;
        }
        _write(next);
        if (onValueChange) {
            try { onValueChange(next.slice(), reason || "set"); } catch { /* swallow */ }
        }
        return true;
    }

    function setValue(v, reason) {
        if (_destroyed) return false;
        if (type === "single") {
            return _setSingleValue(typeof v === "string" || v === null ? v : null, reason);
        }
        return _setMultiValue(Array.isArray(v) ? v : [v], reason);
    }

    function _toggleItem(key, reason) {
        if (_disabled()) return false;
        const item = _items.find(i => i.key === key);
        if (!item || item.disabled) return false;
        if (type === "single") {
            const cur = _read();
            if (cur === key) {
                // clicking the current item: deselect only if allowed
                if (allowDeselect) return _setSingleValue(null, reason);
                return false;
            }
            return _setSingleValue(key, reason);
        }
        // multi: toggle membership
        const cur = _read();
        const i = cur.indexOf(key);
        const next = cur.slice();
        if (i >= 0) next.splice(i, 1);
        else next.push(key);
        return _setMultiValue(next, reason);
    }

    function setItemDisabled(key, flag) {
        const item = _items.find(i => i.key === key);
        if (!item) return;
        item.disabled = !!flag;
        if (item.el) {
            if (flag) {
                setAttr(item.el, "aria-disabled", "true");
                setAttr(item.el, "data-disabled", "");
                if (item.el.tagName === "BUTTON") item.el.disabled = true;
            } else {
                removeAttr(item.el, "aria-disabled");
                removeAttr(item.el, "data-disabled");
                if (item.el.tagName === "BUTTON") item.el.disabled = false;
            }
        }
        // If this item was selected (single mode) or in the list (multi), drop it
        if (flag) {
            if (type === "single" && _read() === key) {
                _setSingleValue(null, "item-disabled");
            } else if (type === "multi" && _read().indexOf(key) >= 0) {
                _setMultiValue(_read().filter(k => k !== key), "item-disabled");
            }
        }
    }

    function setDisabled(flag) {
        _disabled.set(!!flag);
    }

    // ----- roving focus --------------------------------------------
    // The helper handles tabindex sweep + DOM focus when we call
    // setIndex / move / first / last from item keydown handlers.
    const roving = createRovingFocus({
        getItems: () => _items.filter(i => !i.disabled),
        strategy: STRATEGY_DOM_FOCUS,
        loop,
        // No typeahead -- not standard for segmented controls
        // No automatic activation -- focus is independent of selection
        // in the segmented-control / toolbar pattern.
        onIndexChange: () => { /* no-op: manual activation only */ },
        itemAttr: "data-focused",
    });

    // ----- paint effect ---------------------------------------------
    // Sync aria-pressed + data-pressed on every item whenever value or
    // group-disabled changes. data-disabled is per-item static and
    // not in this effect.
    const stopPaint = effect(() => {
        const _ = _read();   // track value (for multi, this is the array)
        const groupDisabled = _disabled();
        for (const item of _items) {
            if (!item.el) continue;
            const isOn = contains(item.key);
            setAttr(item.el, "aria-pressed", isOn ? "true" : "false");
            toggleAttr(item.el, "data-pressed", isOn);
            // group-wide disabled also reflects to each item
            if (groupDisabled || item.disabled) {
                setAttr(item.el, "aria-disabled", "true");
                setAttr(item.el, "data-disabled", "");
                if (item.el.tagName === "BUTTON") item.el.disabled = true;
            } else {
                removeAttr(item.el, "aria-disabled");
                removeAttr(item.el, "data-disabled");
                if (item.el.tagName === "BUTTON") item.el.disabled = false;
            }
        }
    });

    // ----- attach root ----------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "role", "group");
        setAttr(el, "data-orientation", orientation);
        // aria-label NOT auto-set: consumer should provide via attribute
        // or aria-labelledby pointing to a separate label element.
        const off = () => {
            removeAttr(el, "role");
            removeAttr(el, "data-orientation");
            if (_rootEl === el) _rootEl = null;
        };
        return off;
    }

    // ----- attach item ----------------------------------------------
    function attachItem(el, key, opts = {}) {
        if (!el || _destroyed) return noop;
        if (typeof key !== "string" || !key) {
            throw new Error("attachItem: key must be a non-empty string");
        }
        // Replace if key already exists
        const existing = _items.findIndex(i => i.key === key);
        const item = {
            el, key,
            disabled: !!opts.disabled,
        };
        if (existing >= 0) _items[existing] = item;
        else _items.push(item);

        if (!el.id) el.id = uniqueId("lh-tg-item");
        // Default tabindex: -1 (roving sets the first enabled item's
        // tabindex to 0 once we trigger any nav call). For the very
        // first attached enabled item, we'd want tabindex=0; rely on
        // roving's getItems-driven sweep to do this on the next
        // micro-state change. Until then, set tabindex=0 on the first
        // enabled item for initial keyboard reachability.
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "-1");
        // Promote the first non-disabled item to tabindex=0 so the
        // group is keyboard-reachable from a fresh Tab.
        const firstEnabled = _items.find(i => !i.disabled);
        if (firstEnabled === item && !item.disabled) {
            setAttr(el, "tabindex", "0");
        }

        // Initial paint of pressed state + disabled
        const isOn = contains(key);
        setAttr(el, "aria-pressed", isOn ? "true" : "false");
        toggleAttr(el, "data-pressed", isOn);
        if (item.disabled || _disabled()) {
            setAttr(el, "aria-disabled", "true");
            setAttr(el, "data-disabled", "");
            if (el.tagName === "BUTTON") el.disabled = true;
        }
        // type: button so it doesn't submit if inside a form
        if (el.tagName === "BUTTON" && !el.hasAttribute("type")) el.setAttribute("type", "button");

        const onClick = (e) => {
            if (_disabled() || item.disabled) return;
            e.preventDefault();
            _toggleItem(key, "click");
            // Move roving focus index to this item so Tab+Tab returns here
            const enabled = _items.filter(i => !i.disabled);
            const idx = enabled.indexOf(item);
            if (idx >= 0) roving.setIndex(idx);
        };

        // When the item receives DOM focus directly (e.g., user Tab'd
        // into the group and landed on the first focusable item, OR
        // clicked it), sync roving's internal index so the FIRST arrow
        // press actually moves. Without this, roving's index stays at
        // -1 and ArrowRight just "lands" on the first enabled item,
        // looking like a no-op when the user is already on it.
        const onFocus = () => {
            if (item.disabled) return;
            const enabled = _items.filter(i => !i.disabled);
            const idx = enabled.indexOf(item);
            if (idx >= 0 && roving.index !== idx) roving.setIndex(idx);
        };

        const onKey = (e) => {
            if (_disabled() || item.disabled) return;
            const k = e.key;
            // Space / Enter: activate this item
            if (k === " " || k === "Enter" || k === "Spacebar") {
                e.preventDefault();
                _toggleItem(key, "keyboard");
                return;
            }
            // Arrows: navigate (respect orientation)
            const horizontal = orientation === "horizontal";
            const isNext = horizontal ? (k === "ArrowRight") : (k === "ArrowDown");
            const isPrev = horizontal ? (k === "ArrowLeft")  : (k === "ArrowUp");
            if (isNext)      { e.preventDefault(); roving.move(+1); }
            else if (isPrev) { e.preventDefault(); roving.move(-1); }
            else if (k === "Home") { e.preventDefault(); roving.first(); }
            else if (k === "End")  { e.preventDefault(); roving.last(); }
        };

        el.addEventListener("click", onClick);
        el.addEventListener("focus", onFocus);
        el.addEventListener("keydown", onKey);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("focus", onFocus);
            el.removeEventListener("keydown", onKey);
            removeAttr(el, "aria-pressed");
            removeAttr(el, "data-pressed");
            removeAttr(el, "data-focused");
            removeAttr(el, "aria-disabled");
            removeAttr(el, "data-disabled");
            removeAttr(el, "tabindex");
            if (el.tagName === "BUTTON") el.disabled = false;
            const idx = _items.indexOf(item);
            if (idx >= 0) _items.splice(idx, 1);
        };
        return off;
    }

    // ----- destroy --------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        roving.destroy();
        for (const item of _items) {
            if (!item.el) continue;
            removeAttr(item.el, "aria-pressed");
            removeAttr(item.el, "data-pressed");
            removeAttr(item.el, "data-focused");
            removeAttr(item.el, "aria-disabled");
            removeAttr(item.el, "data-disabled");
        }
        _items.length = 0;
        _rootEl = null;
    }

    return {
        // reactive
        value:    () => _read(),
        disabled: () => _disabled(),
        contains,
        items:    () => _items.map(i => ({ key: i.key, disabled: i.disabled })),
        // imperative
        setValue,
        setDisabled, setItemDisabled,
        toggleItem: (key, reason) => _toggleItem(key, reason || "imperative"),
        // attachments
        attachRoot, attachItem,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        // metadata
        get type() { return type; },
        get orientation() { return orientation; },
    };
}
