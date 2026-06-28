// @zakkster/lite-headless / meter
//
// ARIA `role="meter"`. A scalar measurement within a known range.
//
// Use meter for: vote/poll share, gauge readings, fuel/battery
// level, disk usage, score-vs-target. Static value semantically;
// the user is reading it, not waiting for it.
//
// Use progress for: task completion, network transfer, multi-step
// flow position. Action in progress; the user is waiting.
//
// HTML has both <progress> and <meter>; this primitive is the
// headless equivalent of <meter>.
//
// State machine: none. A meter is just (value, min, max) +
// optional thresholds (low, high, optimum) for color-coding regions.
//
// Painted attributes (root):
//   role="meter"
//   aria-valuenow=<value>
//   aria-valuemin=<min>
//   aria-valuemax=<max>
//   aria-valuetext=<text>     (when valueText option provided)
//   aria-label=<label>        (when label option provided; only if no aria-label pre-set)
//   data-meter-root
//   data-zone="optimum|sub-optimum|low|high"  (when thresholds configured)
//   --meter: <fraction>       CSS custom property: (value-min) / (max-min), clamped [0..1]
//
// Painted attributes (fill, optional via attachFill):
//   data-meter-fill
//   data-zone=<same as root>
//   --meter: <fraction>       Also set on the fill element so it can size itself
//                             with e.g. transform: scaleX(var(--meter))

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

function clamp(n, lo, hi) {
    if (n < lo) return lo;
    if (n > hi) return hi;
    return n;
}

// Compute the meter "state" per HTML meter spec, given value + range
// + thresholds. Mirrors browser behavior for <meter low high optimum>.
function computeState(v, min, max, low, high, optimum) {
    // If no thresholds defined, everything is "optimum" (matches
    // browser default rendering — the meter shows in the standard
    // "good" color).
    if (low == null && high == null) return "optimum";
    // "Optimum" region is one of three: below low, between low/high,
    // or above high. Which one is optimum is determined by where
    // `optimum` sits.
    let optRegion;
    if (optimum == null) {
        // Default: optimum is the "between low and high" band.
        optRegion = "mid";
    } else if (low != null && optimum < low) {
        optRegion = "lo";
    } else if (high != null && optimum > high) {
        optRegion = "hi";
    } else {
        optRegion = "mid";
    }

    // Identify which region the value falls into.
    let valueRegion;
    if (low != null && v < low) valueRegion = "lo";
    else if (high != null && v > high) valueRegion = "hi";
    else valueRegion = "mid";

    if (valueRegion === optRegion) return "optimum";
    // Distance-1: adjacent region is "sub-optimum"; opposite is "low/high"
    // per the HTML meter algorithm:
    //   optimum in mid: lo/hi regions are both "sub-optimum"
    //   optimum in lo:  mid is "sub-optimum"; hi is "low"
    //   optimum in hi:  mid is "sub-optimum"; lo is "low"
    if (optRegion === "mid") return "sub-optimum";
    if (optRegion === "lo") return (valueRegion === "mid") ? "sub-optimum" : "low";
    if (optRegion === "hi") return (valueRegion === "mid") ? "sub-optimum" : "low";
    return "optimum";
}

export function createMeter(opts = {}) {
    const o = opts || {};
    const _value    = makeSignal(typeof o.value === "number" ? o.value : 0);
    const _min      = typeof o.min === "number" ? o.min : 0;
    const _max      = typeof o.max === "number" ? o.max : 1;
    const _low      = typeof o.low      === "number" ? o.low      : null;
    const _high     = typeof o.high     === "number" ? o.high     : null;
    const _optimum  = typeof o.optimum  === "number" ? o.optimum  : null;
    const label     = typeof o.label === "string" ? o.label : null;
    const _valueText = makeSignal(typeof o.valueText === "string" ? o.valueText : null);
    const _destroyed = { v: false };

    if (_max <= _min) {
        throw new Error("createMeter: max must be greater than min");
    }

    let _rootEl = null;
    const _fills = new Set();
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function setValue(v) {
        if (_destroyed.v) return;
        if (typeof v !== "number" || !isFinite(v)) return;
        const c = clamp(v, _min, _max);
        if (_value() === c) return;
        _value.set(c);
    }

    function value()      { return _value(); }
    function fraction()   { return (_value() - _min) / (_max - _min); }
    function min()        { return _min; }
    function max()        { return _max; }
    function state()      { return computeState(_value(), _min, _max, _low, _high, _optimum); }

    function setValueText(t) {
        if (_destroyed.v) return;
        if (t != null && typeof t !== "string") return;
        if (_valueText() === t) return;
        _valueText.set(t);
    }

    function paintElement(el, root) {
        // root=true paints the ARIA role + valuemin/max + label;
        // any element gets the per-state + fraction custom prop.
        const stop = effect(() => {
            const v = _value();
            const f = clamp((v - _min) / (_max - _min), 0, 1);
            const st = computeState(v, _min, _max, _low, _high, _optimum);
            const vt = _valueText();
            // Custom property — usable by both root and fill.
            el.style.setProperty("--meter", String(f));
            setAttr(el, "data-zone", st);
            if (root) {
                setAttr(el, "aria-valuenow", String(v));
                if (vt) setAttr(el, "aria-valuetext", vt);
                else    removeAttr(el, "aria-valuetext");
            }
        });
        return stop;
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-meter-root", "");
        if (!el.hasAttribute("role")) setAttr(el, "role", "meter");
        setAttr(el, "aria-valuemin", String(_min));
        setAttr(el, "aria-valuemax", String(_max));
        if (label && !el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
            setAttr(el, "aria-label", label);
        }
        const stop = paintElement(el, true);
        const off = () => {
            stop();
            removeAttr(el, "data-meter-root");
            removeAttr(el, "data-zone");
            removeAttr(el, "aria-valuenow");
            removeAttr(el, "aria-valuemin");
            removeAttr(el, "aria-valuemax");
            removeAttr(el, "aria-valuetext");
            if (label && el.getAttribute("aria-label") === label) removeAttr(el, "aria-label");
            if (el.getAttribute("role") === "meter") removeAttr(el, "role");
            el.style.removeProperty("--meter");
            if (_rootEl === el) _rootEl = null;
        };
        addCleanup(off);
        return off;
    }

    // Attach a fill element (the visible bar that grows with the
    // value). The primitive doesn't render anything; consumer decides
    // how to use --meter (transform: scaleX, width: calc, etc.).
    function attachFill(el) {
        if (!el || _destroyed.v) return noop;
        _fills.add(el);
        setAttr(el, "data-meter-fill", "");
        const stop = paintElement(el, false);
        const off = () => {
            stop();
            _fills.delete(el);
            removeAttr(el, "data-meter-fill");
            removeAttr(el, "data-zone");
            el.style.removeProperty("--meter");
        };
        addCleanup(off);
        return off;
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _fills.clear();
        _rootEl = null;
    }

    return {
        // accessors
        value, min, max, fraction, state,
        // mutations
        setValue, setValueText,
        // attach
        attachRoot, attachFill,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
