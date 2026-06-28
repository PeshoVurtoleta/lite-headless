// @zakkster/lite-headless / progress
//
// Headless progress indicator: linear bar OR circular ring, determinate
// or indeterminate. Behavior the primitive owns:
//
//   - Reactive value clamping into [min, max]
//   - ARIA painting (role=progressbar, aria-valuenow/min/max/text)
//   - CSS custom property `--progress` (0 to 1) on the root for the
//     consumer's CSS to drive (width %, stroke-dashoffset, etc.)
//   - `data-loading` while value < max, `data-complete` at max
//   - `data-indeterminate=""` when indeterminate is set (CSS animation)
//   - `onComplete` callback fires once when value first reaches max
//   - `variant` data attribute for CSS-driven linear-vs-circular branching
//
// What the primitive does NOT do:
//
//   - It does NOT render anything. The consumer provides the markup
//     (an outer container + a bar/indicator element). The primitive
//     paints attributes + CSS custom properties.
//   - It does NOT enforce a specific visual style. Consumer CSS reads
//     `var(--progress)` and does whatever it wants (width %,
//     stroke-dashoffset, conic-gradient angle, etc.).
//   - It does NOT animate transitions. The consumer adds `transition`
//     in CSS if they want smooth value changes.
//
// API
//
//   createProgress({
//       value?:         0,                  // current value
//       min?:           0,                  // lower bound
//       max?:           100,                // upper bound
//       indeterminate?: false,              // override-style: animation, no value
//       variant?:       "linear",           // "linear" or "circular"
//       label?:         "Loading",          // aria-label OR aria-labelledby on root
//       valueText?:     null,               // custom aria-valuetext; auto-derived if null
//       onChange?:      (value, fraction) => void,
//       onComplete?:    () => void,         // fires once when value reaches max
//   })
//
//   attachRoot(el)            // role=progressbar, aria-* + data-* painted
//   attachBar(el)             // optional: linear bar gets data-progress + --progress
//   attachIndicator(el)       // optional: circular indicator gets --progress
//   attachLabel(el)           // optional: external label; sets aria-labelledby
//
//   setValue(n)               // mutate value
//   setMax(n)                 // mutate max
//   setIndeterminate(b)
//
//   value()                   // reactive accessor
//   fraction()                // reactive 0..1 accessor (derived)
//   isComplete()              // reactive accessor (value >= max)
//   destroy()
//
// ARIA
//
//   role="progressbar"
//   aria-valuenow=<value>      (omitted when indeterminate)
//   aria-valuemin=<min>
//   aria-valuemax=<max>
//   aria-valuetext=<auto: "42%" | custom>
//   aria-label OR aria-labelledby
//
// CSS contract
//
//   [data-progress-root] {
//       --progress: 0..1;            // set by primitive
//   }
//   [data-progress-root][data-complete] { ... }
//   [data-progress-root][data-indeterminate] { ... }   // animation
//   [data-progress-root][data-variant="linear"]   { ... }
//   [data-progress-root][data-variant="circular"] { ... }
//
//   /* linear example */
//   [data-progress-bar] { width: calc(var(--progress) * 100%); }
//
//   /* circular example -- SVG ring, circumference = 2πr */
//   [data-progress-indicator] {
//       stroke-dasharray: var(--circumference);
//       stroke-dashoffset: calc(var(--circumference) * (1 - var(--progress)));
//   }

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { toggleAttr } from "../_overlay/aria.js";

const noop = () => {};
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

function clamp(value, min, max) {
    if (max < min) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

let _idCounter = 0;
function uniqueId(prefix) {
    _idCounter = (_idCounter + 1) | 0;
    return `${prefix}-${_idCounter}`;
}

export function createProgress(options = {}) {
    const {
        value:        initialValue = 0,
        min:          initialMin   = 0,
        max:          initialMax   = 100,
        indeterminate: initialIndeterminate = false,
        variant       = "linear",
        label         = null,
        valueText:    initialValueText = null,
        onChange,
        onComplete,
    } = options;

    if (variant !== "linear" && variant !== "circular") {
        throw new Error(`createProgress: variant must be "linear" or "circular", got "${variant}"`);
    }

    const _min    = makeSignal(initialMin);
    const _max    = makeSignal(initialMax);
    const _value  = makeSignal(clamp(initialValue, initialMin, initialMax));
    const _indet  = makeSignal(initialIndeterminate);
    const _valueText = makeSignal(initialValueText);

    let _rootEl = null;
    let _barEl = null;
    let _indEl = null;
    let _labelEl = null;
    let _destroyed = false;
    let _hasFiredComplete = false;

    // Derived fraction: (value - min) / (max - min) clamped to [0, 1].
    // If max == min, fraction is 0 (avoid divide-by-zero; treats as "no progress").
    function fraction() {
        const v = _value();
        const lo = _min();
        const hi = _max();
        if (hi <= lo) return 0;
        const f = (v - lo) / (hi - lo);
        return f < 0 ? 0 : f > 1 ? 1 : f;
    }

    function isComplete() {
        return _value() >= _max();
    }

    function _valueTextAuto() {
        const custom = _valueText();
        if (custom !== null && custom !== undefined) return String(custom);
        if (_indet()) return "Loading";
        const pct = Math.round(fraction() * 100);
        return `${pct}%`;
    }

    // ----- paint effect ---------------------------------------------
    // ARIA attrs + data-complete/data-loading + CSS custom property all in one effect.
    // With lite-signal 1.2.1's owner tree, no guards needed.
    const stopPaint = effect(() => {
        const v   = _value();
        const lo  = _min();
        const hi  = _max();
        const ind = _indet();
        const vt  = _valueTextAuto();    // derived; reads fraction() -> tracks _value/_min/_max + _indet + _valueText
        const f   = fraction();
        const complete = !ind && v >= hi;

        // Root: ARIA + data attrs + CSS custom property
        if (_rootEl) {
            if (ind) {
                removeAttr(_rootEl, "aria-valuenow");
            } else {
                setAttr(_rootEl, "aria-valuenow", String(v));
            }
            setAttr(_rootEl, "aria-valuemin", String(lo));
            setAttr(_rootEl, "aria-valuemax", String(hi));
            setAttr(_rootEl, "aria-valuetext", vt);
            toggleAttr(_rootEl, "data-complete", complete);
            toggleAttr(_rootEl, "data-loading", !complete);
            if (ind) setAttr(_rootEl, "data-indeterminate", "");
            else     removeAttr(_rootEl, "data-indeterminate");
            // CSS custom property as a 0..1 number (consumer scales as needed)
            _rootEl.style.setProperty("--progress", String(f));
        }

        // Bar (linear): mirror --progress + data-progress for any
        // styling that scopes to the bar element specifically.
        if (_barEl) {
            _barEl.style.setProperty("--progress", String(f));
            setAttr(_barEl, "data-progress", String(Math.round(f * 100)));
        }

        // Indicator (circular): same as bar
        if (_indEl) {
            _indEl.style.setProperty("--progress", String(f));
            setAttr(_indEl, "data-progress", String(Math.round(f * 100)));
        }

        // onChange always fires on any of value/min/max/indeterminate change
        // Fires BEFORE onComplete so consumers' change handlers see the final
        // value first; then onComplete is the lifecycle hook that runs once
        // the value is settled.
        if (onChange) {
            try { onChange(v, f); } catch { /* swallow */ }
        }

        // onComplete fires once on first hit-or-pass of max
        if (complete && !_hasFiredComplete) {
            _hasFiredComplete = true;
            if (onComplete) {
                try { onComplete(); } catch { /* swallow */ }
            }
        } else if (!complete && _hasFiredComplete) {
            // reset so a subsequent return-to-complete fires again
            _hasFiredComplete = false;
        }
    });

    // ----- attach root ----------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        setAttr(el, "role", "progressbar");
        setAttr(el, "data-progress-root", "");
        setAttr(el, "data-variant", variant);
        // Apply initial state inline (effect already ran with null root)
        const v   = _value();
        const lo  = _min();
        const hi  = _max();
        const ind = _indet();
        const f   = fraction();
        const complete = !ind && v >= hi;
        if (ind) removeAttr(el, "aria-valuenow");
        else     setAttr(el, "aria-valuenow", String(v));
        setAttr(el, "aria-valuemin", String(lo));
        setAttr(el, "aria-valuemax", String(hi));
        setAttr(el, "aria-valuetext", _valueTextAuto());
        toggleAttr(el, "data-complete", complete);
        toggleAttr(el, "data-loading", !complete);
        if (ind) setAttr(el, "data-indeterminate", "");
        el.style.setProperty("--progress", String(f));
        // label
        if (label && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
            setAttr(el, "aria-label", label);
        }
        const off = () => {
            removeAttr(el, "role");
            removeAttr(el, "data-progress-root");
            removeAttr(el, "data-variant");
            removeAttr(el, "data-complete");
            removeAttr(el, "data-loading");
            removeAttr(el, "data-indeterminate");
            removeAttr(el, "aria-valuenow");
            removeAttr(el, "aria-valuemin");
            removeAttr(el, "aria-valuemax");
            removeAttr(el, "aria-valuetext");
            removeAttr(el, "aria-label");
            removeAttr(el, "aria-labelledby");
            el.style.removeProperty("--progress");
            if (_rootEl === el) _rootEl = null;
        };
        return off;
    }

    function attachBar(el) {
        if (!el || _destroyed) return noop;
        _barEl = el;
        setAttr(el, "data-progress-bar", "");
        const f = fraction();
        el.style.setProperty("--progress", String(f));
        setAttr(el, "data-progress", String(Math.round(f * 100)));
        const off = () => {
            removeAttr(el, "data-progress-bar");
            removeAttr(el, "data-progress");
            el.style.removeProperty("--progress");
            if (_barEl === el) _barEl = null;
        };
        return off;
    }

    function attachIndicator(el) {
        if (!el || _destroyed) return noop;
        _indEl = el;
        setAttr(el, "data-progress-indicator", "");
        const f = fraction();
        el.style.setProperty("--progress", String(f));
        setAttr(el, "data-progress", String(Math.round(f * 100)));
        const off = () => {
            removeAttr(el, "data-progress-indicator");
            removeAttr(el, "data-progress");
            el.style.removeProperty("--progress");
            if (_indEl === el) _indEl = null;
        };
        return off;
    }

    function attachLabel(el) {
        if (!el || _destroyed) return noop;
        _labelEl = el;
        if (!el.id) el.id = uniqueId("lh-progress-label");
        if (_rootEl) {
            removeAttr(_rootEl, "aria-label");
            setAttr(_rootEl, "aria-labelledby", el.id);
        }
        const off = () => {
            if (_rootEl) {
                removeAttr(_rootEl, "aria-labelledby");
                if (label) setAttr(_rootEl, "aria-label", label);
            }
            if (_labelEl === el) _labelEl = null;
        };
        return off;
    }

    // ----- imperative API -------------------------------------------
    function setValue(n) {
        if (_destroyed) return;
        if (typeof n !== "number" || !Number.isFinite(n)) return;
        _value.set(clamp(n, _min(), _max()));
    }

    function setMax(n) {
        if (_destroyed) return;
        if (typeof n !== "number" || !Number.isFinite(n)) return;
        _max.set(n);
        // re-clamp value to new bounds
        _value.set(clamp(_value(), _min(), n));
    }

    function setMin(n) {
        if (_destroyed) return;
        if (typeof n !== "number" || !Number.isFinite(n)) return;
        _min.set(n);
        _value.set(clamp(_value(), n, _max()));
    }

    function setIndeterminate(b) {
        if (_destroyed) return;
        _indet.set(Boolean(b));
    }

    function setValueText(s) {
        if (_destroyed) return;
        _valueText.set(s === null || s === undefined ? null : String(s));
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        // Clear attrs from each attached element
        if (_rootEl) {
            removeAttr(_rootEl, "role");
            removeAttr(_rootEl, "data-progress-root");
            removeAttr(_rootEl, "data-variant");
            removeAttr(_rootEl, "data-complete");
            removeAttr(_rootEl, "data-loading");
            removeAttr(_rootEl, "data-indeterminate");
            removeAttr(_rootEl, "aria-valuenow");
            removeAttr(_rootEl, "aria-valuemin");
            removeAttr(_rootEl, "aria-valuemax");
            removeAttr(_rootEl, "aria-valuetext");
            removeAttr(_rootEl, "aria-label");
            removeAttr(_rootEl, "aria-labelledby");
            _rootEl.style.removeProperty("--progress");
        }
        if (_barEl) {
            removeAttr(_barEl, "data-progress-bar");
            removeAttr(_barEl, "data-progress");
            _barEl.style.removeProperty("--progress");
        }
        if (_indEl) {
            removeAttr(_indEl, "data-progress-indicator");
            removeAttr(_indEl, "data-progress");
            _indEl.style.removeProperty("--progress");
        }
        _rootEl = null;
        _barEl = null;
        _indEl = null;
        _labelEl = null;
    }

    return {
        value:          () => _value(),
        min:            () => _min(),
        max:            () => _max(),
        indeterminate:  () => _indet(),
        fraction,
        isComplete,
        variant:        () => variant,
        setValue, setMin, setMax, setIndeterminate, setValueText,
        attachRoot, attachBar, attachIndicator, attachLabel,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
