// @zakkster/lite-headless / radio-group
//
// W3C ARIA Authoring Practices for radio button groups.
//
// Distinct from toggle-group: that one is the SEGMENTED CONTROL
// pattern (role=group + aria-pressed per item, items rendered as
// buttons). This one is the FORM RADIO pattern: role=radiogroup +
// role=radio per item, items behave like native HTML radios for
// screen readers and form integration.
//
// Use radio-group for: form fields, "pick one outcome" decisions,
// poll options, Twitch Prediction outcomes.
// Use toggle-group for: text alignment (left/center/right), view
// modes (grid/list/card), filter pills.
//
// Keyboard (per ARIA APG):
//   - Tab enters the group on whichever radio is checked (or the
//     first focusable one if none is checked yet).
//   - ArrowDown / ArrowRight: move focus AND selection to the next
//     radio in tab order (wraps).
//   - ArrowUp / ArrowLeft: same but previous (wraps).
//   - Space: confirms selection on the currently focused radio.
//     (For radios, arrow-key movement also selects, so Space is
//     mostly redundant -- but supported.)
//
// Painted attributes:
//   Root:
//     role="radiogroup"
//     aria-orientation="vertical|horizontal" (when explicit)
//     aria-required="true|false" (when required: true)
//     aria-disabled="true" (when group-wide disabled)
//     data-radio-group-root
//   Items:
//     role="radio"
//     aria-checked="true|false"  (single source of truth for selection)
//     aria-disabled="true" (per-item disabled)
//     tabindex="0" on the checked item (or first when none checked); "-1" on the rest
//     data-radio-item
//     data-checked   (boolean; CSS hook -- presence === aria-checked=true)
//     data-disabled  (boolean; CSS hook)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";
import { createRovingFocus, STRATEGY_DOM_FOCUS } from "../_overlay/roving-focus.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createRadioGroup(opts = {}) {
    const o = opts || {};
    const orientation = o.orientation === "horizontal" ? "horizontal" : "vertical";
    const required    = !!o.required;
    const initialValue = (typeof o.value === "string" && o.value.length > 0) ? o.value : null;
    const onChange = typeof o.onChange === "function" ? o.onChange : null;

    // Reactive selection. null = nothing selected.
    const _value     = makeSignal(initialValue);
    const _disabled  = makeSignal(!!o.disabled);
    const _destroyed = { v: false };

    // Items registry. Each entry: { key, el, disabled }
    const _items = [];
    // Map key -> index for O(1) lookup.
    const _byKey = new Map();
    // attach() returns off() callbacks; we collect everything to tear down.
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    let _rootEl = null;
    let _roving = null;     // created in attachRoot
    // When true, roving's onIndexChange should NOT trigger selection.
    // Used to seed the tab stop without selecting (ARIA APG: Tab into
    // the group focuses the right radio but doesn't change selection).
    let _suppressIndexChange = false;

    // ─── selection ───────────────────────────────────────────────────

    function setValue(v, reason) {
        if (_destroyed.v) return;
        if (v !== null && typeof v !== "string") return;
        if (v === _value()) return;
        // If trying to set a value that doesn't exist (yet), accept
        // anyway -- items can attach later and the reactive paint
        // will catch up. But check that it's not the disabled item.
        if (v !== null) {
            const idx = _byKey.get(v);
            if (idx != null && _items[idx].disabled) return;
        }
        _value.set(v);
        if (onChange) try { onChange(v, reason || "api"); } catch {}
    }

    function value() { return _value(); }
    function isDisabled() { return _disabled(); }

    function setDisabled(b) {
        if (_destroyed.v) return;
        if (_disabled() === !!b) return;
        _disabled.set(!!b);
    }

    // ─── attach: root ────────────────────────────────────────────────

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-radio-group-root", "");
        if (!el.hasAttribute("role")) setAttr(el, "role", "radiogroup");
        // Orientation per ARIA. Default is vertical for radiogroups.
        if (orientation !== "vertical") setAttr(el, "aria-orientation", orientation);
        if (required) setAttr(el, "aria-required", "true");

        // Build the roving-focus instance. It manages tabindex per item,
        // wraps on arrow nav, and skips disabled items.
        _roving = createRovingFocus({
            orientation,
            loop: true,
            strategy: STRATEGY_DOM_FOCUS,
            getItems: () => _items.map(it => ({ el: it.el, disabled: it.disabled })),
            onIndexChange: (idx) => {
                if (_suppressIndexChange) return;
                if (_disabled()) return;
                if (idx < 0) return;
                const it = _items[idx];
                if (!it || it.disabled) return;
                // Radio semantics: arrow movement ALSO selects.
                setValue(it.key, "keyboard");
            },
        });

        // The roving-focus instance manages tabindex on items. But we
        // also need its index to track the CHECKED item by default,
        // not just whichever was focused last. The effect below seeds
        // the tab stop WITHOUT selecting (per ARIA APG: Tab into the
        // group focuses but doesn't select; arrow keys are what select).
        const stopSeed = effect(() => {
            const v = _value();
            _suppressIndexChange = true;
            try {
                if (v != null && _byKey.has(v)) {
                    _roving.setIndex(_byKey.get(v));
                } else if (_items.length > 0) {
                    _roving.first();
                }
            } finally {
                _suppressIndexChange = false;
            }
        });
        addCleanup(stopSeed);

        // Group-disabled paint. aria-disabled wants a literal "true"
        // (or removal) -- toggleAttr's presence-as-truth pattern would
        // produce aria-disabled="" which screen readers may not parse.
        const stopDisabled = effect(() => {
            if (_disabled()) setAttr(el, "aria-disabled", "true");
            else removeAttr(el, "aria-disabled");
        });
        addCleanup(stopDisabled);

        // Keyboard at root scope.
        const NEXT = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
        const PREV = orientation === "horizontal" ? "ArrowLeft"  : "ArrowUp";
        const onKey = (ev) => {
            if (_disabled()) return;
            if (typeof ev.key !== "string") return;
            switch (ev.key) {
                case NEXT:    ev.preventDefault(); syncIndexFromActiveElement(); _roving.move(+1); break;
                case PREV:    ev.preventDefault(); syncIndexFromActiveElement(); _roving.move(-1); break;
                case "Home":  ev.preventDefault(); _roving.first(); break;
                case "End":   ev.preventDefault(); _roving.last();  break;
                case " ":
                case "Enter": {
                    ev.preventDefault();
                    const i = _roving.index;
                    if (i >= 0 && i < _items.length && !_items[i].disabled) {
                        setValue(_items[i].key, "keyboard");
                    }
                    break;
                }
            }
        };
        // Click + Tab-in sync -- same fix as toolbar/v0.12.3. Without
        // this, focusing an item from outside leaves roving at its
        // previous index, and the next arrow press jumps from the
        // wrong place.
        function syncIndexFromActiveElement() {
            const active = document.activeElement;
            if (!active) return;
            for (let i = 0; i < _items.length; i++) {
                if (_items[i].el === active) {
                    _roving.setIndex(i);
                    return;
                }
            }
        }
        const onFocusIn = () => { syncIndexFromActiveElement(); };

        el.addEventListener("keydown", onKey);
        el.addEventListener("focusin", onFocusIn);
        const off = () => {
            el.removeEventListener("keydown", onKey);
            el.removeEventListener("focusin", onFocusIn);
            removeAttr(el, "data-radio-group-root");
            removeAttr(el, "aria-orientation");
            removeAttr(el, "aria-required");
            removeAttr(el, "aria-disabled");
            if (el.getAttribute("role") === "radiogroup") removeAttr(el, "role");
            if (_rootEl === el) _rootEl = null;
            if (_roving) { _roving.destroy(); _roving = null; }
        };
        addCleanup(off);
        return off;
    }

    // ─── attach: item ────────────────────────────────────────────────

    function attachItem(el, key, opts2) {
        if (!el || _destroyed.v) return noop;
        if (typeof key !== "string" || key.length === 0) {
            throw new Error("radio-group attachItem: key must be a non-empty string");
        }
        if (_byKey.has(key)) {
            throw new Error("radio-group attachItem: duplicate key '" + key + "'");
        }
        const o2 = opts2 || {};
        // Per-item disabled is a SIGNAL so the paint effect re-runs
        // when setItemDisabled flips it. Without this, changing
        // entry.disabled mutates a plain field that no effect watches.
        const _itemDisabled = makeSignal(!!o2.disabled);
        const entry = {
            key,
            el,
            get disabled() { return _itemDisabled(); },
            set disabled(b) { _itemDisabled.set(!!b); },
        };
        _items.push(entry);
        _byKey.set(key, _items.length - 1);

        // Static paint
        setAttr(el, "data-radio-item", "");
        if (!el.hasAttribute("role")) setAttr(el, "role", "radio");

        // Reactive paint: aria-checked, data-checked, tabindex (via roving), disabled
        const stop = effect(() => {
            const checked = (_value() === key);
            const dis = _itemDisabled();
            toggleAttr(el, "data-checked", checked);
            setAttr(el, "aria-checked", checked ? "true" : "false");
            toggleAttr(el, "data-disabled", dis);
            if (dis) setAttr(el, "aria-disabled", "true");
            else removeAttr(el, "aria-disabled");
        });
        addCleanup(stop);

        // Click -> select (if not disabled and group not disabled).
        const onClick = (ev) => {
            if (_disabled() || _itemDisabled()) return;
            setValue(key, "click");
            // Move focus to the clicked item so subsequent arrow keys
            // navigate from there.
            try { el.focus(); } catch {}
        };
        el.addEventListener("click", onClick);

        // If the group is already attached + roving exists, the new
        // item needs to be visible to roving on its next call. Roving
        // pulls items via getItems() each time, so this is automatic.
        // But if this item is the currently-checked one, point roving
        // at it now.
        if (_roving && _value() === key) {
            _roving.setIndex(_items.length - 1);
        }

        const off = () => {
            el.removeEventListener("click", onClick);
            stop();
            removeAttr(el, "data-radio-item");
            removeAttr(el, "data-checked");
            removeAttr(el, "data-disabled");
            removeAttr(el, "aria-checked");
            removeAttr(el, "aria-disabled");
            if (el.getAttribute("role") === "radio") removeAttr(el, "role");
            // Remove from registry.
            const idx = _byKey.get(key);
            if (idx != null) {
                _items.splice(idx, 1);
                _byKey.delete(key);
                // Re-index the map (keys after idx shifted left by 1)
                for (let i = idx; i < _items.length; i++) {
                    _byKey.set(_items[i].key, i);
                }
                // If we removed the checked item, clear the value.
                if (_value() === key) setValue(null, "remove");
            }
        };
        addCleanup(off);
        return off;
    }

    function setItemDisabled(elOrKey, disabled) {
        if (_destroyed.v) return;
        let entry = null;
        if (typeof elOrKey === "string") {
            const idx = _byKey.get(elOrKey);
            if (idx != null) entry = _items[idx];
        } else {
            for (const it of _items) if (it.el === elOrKey) { entry = it; break; }
        }
        if (!entry) return;
        if (entry.disabled === !!disabled) return;
        entry.disabled = !!disabled;    // signal setter via the getter/setter pair
        // If the now-disabled item was checked, clear selection.
        if (disabled && _value() === entry.key) setValue(null, "disabled");
    }

    // ─── destroy ─────────────────────────────────────────────────────

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _items.length = 0;
        _byKey.clear();
        _rootEl = null;
        _roving = null;
    }

    return {
        // accessors
        value, isDisabled,
        get checkedKey() { return _value(); },
        get itemCount() { return _items.length; },
        // mutations
        setValue, setDisabled, setItemDisabled,
        // attach
        attachRoot, attachItem,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
