// @zakkster/lite-headless / stat / index.js
//
// createStat(options) -> StatHandle
//
// KPI dashboard card. Wires a label + a numeric value (with optional
// tween animation between updates) + an optional trend indicator
// (direction + magnitude).
//
// State:
//   value()           -- current displayed value (tween target)
//   displayValue()    -- current frame's value during tween (animates)
//   label()           -- string
//   unit()            -- string ("$", "%", "GB", etc.)
//   trend()           -- { direction: "up"|"down"|"flat", value: number } | null
//
// Mutations:
//   setValue(v)       -- triggers tween from current displayValue to v
//   setLabel(s) / setUnit(s) / setTrend(t)
//
// Tween:
//   The displayValue animates from its current frame value to the
//   target with a quadratic ease-out over animationDuration ms. The
//   tween runs via rAF; multiple setValue calls in quick succession
//   re-target the same tween (no jumpy resets).

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}

const VALID_DIRECTIONS = ["up", "down", "flat"];

function normalizeTrend(t) {
    if (t == null) return null;
    const dir = VALID_DIRECTIONS.indexOf(t.direction) === -1 ? "flat" : t.direction;
    const val = typeof t.value === "number" && isFinite(t.value) ? t.value : 0;
    return { direction: dir, value: val };
}

function defaultFormatter(n) {
    if (typeof n !== "number" || !isFinite(n)) return "";
    // Round to avoid showing absurd decimals during the tween.
    if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
    if (Math.abs(n) >= 1)    return n.toFixed(0);
    return n.toFixed(2);
}

function defaultTrendFormatter(t) {
    if (!t) return "";
    const sign = t.direction === "up" ? "+" : (t.direction === "down" ? "-" : "");
    return sign + Math.abs(t.value).toFixed(1) + "%";
}

export function createStat(options = {}) {
    const {
        defaultValue = 0,
        defaultLabel = "",
        defaultUnit = "",
        defaultTrend = null,
        formatter = defaultFormatter,
        trendFormatter = defaultTrendFormatter,
        animationDuration = 600,    // ms; 0 disables tween
        onValueChange,
    } = options;

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- state ---------------------------------------------------------

    const _value = makeSignal(Number(defaultValue) || 0);
    const _displayValue = makeSignal(Number(defaultValue) || 0);
    const _label = makeSignal(String(defaultLabel || ""));
    const _unit = makeSignal(String(defaultUnit || ""));
    const _trend = makeSignal(normalizeTrend(defaultTrend));

    // Tween bookkeeping
    let _tweenFromValue = _value();
    let _tweenStartTime = 0;
    let _rafId = 0;

    // ----- accessors -----------------------------------------------------

    function value()        { return _value(); }
    function displayValue() { return _displayValue(); }
    function label()        { return _label(); }
    function unit()         { return _unit(); }
    function trend()        { return _trend(); }

    // ----- mutations -----------------------------------------------------

    function setValue(v) {
        if (_destroyed) return;
        const next = Number(v);
        if (!isFinite(next)) return;
        const cur = _value();
        if (next === cur) return;
        // Start a tween from the current displayed value to next.
        _tweenFromValue = _displayValue();
        _tweenStartTime = performance.now();
        _value.set(next);
        if (animationDuration <= 0) {
            // No tween -- jump to target.
            _displayValue.set(next);
        } else {
            _scheduleTweenFrame();
        }
        if (onValueChange) {
            try { onValueChange(next, cur); } catch {}
        }
    }

    function setLabel(s) {
        if (_destroyed) return;
        const next = String(s == null ? "" : s);
        if (next === _label()) return;
        _label.set(next);
    }

    function setUnit(s) {
        if (_destroyed) return;
        const next = String(s == null ? "" : s);
        if (next === _unit()) return;
        _unit.set(next);
    }

    function setTrend(t) {
        if (_destroyed) return;
        const next = normalizeTrend(t);
        const cur = _trend();
        // Compare structurally
        if (next === cur) return;
        if (next && cur && next.direction === cur.direction && next.value === cur.value) return;
        _trend.set(next);
    }

    // ----- tween loop ----------------------------------------------------
    // rAF when present; setTimeout fallback for Node test envs.
    const _raf = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : (cb) => setTimeout(() => cb(performance.now()), 16);
    const _cancelRaf = typeof cancelAnimationFrame === "function"
        ? cancelAnimationFrame
        : clearTimeout;

    function _scheduleTweenFrame() {
        if (_rafId) return;
        _rafId = _raf(_tweenFrame);
    }

    function _tweenFrame(now) {
        _rafId = 0;
        if (_destroyed) return;
        const elapsed = now - _tweenStartTime;
        const t = Math.min(1, elapsed / animationDuration);
        // Quadratic ease-out.
        const eased = 1 - (1 - t) * (1 - t);
        const target = _value();
        const next = _tweenFromValue + (target - _tweenFromValue) * eased;
        _displayValue.set(next);
        if (t < 1) {
            _scheduleTweenFrame();
        } else {
            // Snap to exact target at end.
            _displayValue.set(target);
        }
    }

    // ----- attach helpers ------------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-stat");
        setAttr(el, "role", "group");
        // Reactive: data-trend-direction on root for CSS hooks
        let _lastDir = null;
        const stop = effect(() => {
            const t = _trend();
            const dir = t ? t.direction : null;
            if (dir !== _lastDir) {
                if (dir) setAttr(el, "data-trend-direction", dir);
                else      el.removeAttribute("data-trend-direction");
                _lastDir = dir;
            }
            toggleAttr(el, "data-has-trend", !!t);
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeAttribute("role");
            el.removeAttribute("data-trend-direction");
            el.removeAttribute("data-has-trend");
        };
        addCleanup(off);
        return off;
    }

    function attachLabel(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-stat-label");
        const stop = effect(() => {
            const next = _label();
            if (el.textContent !== next) el.textContent = next;
        });
        addCleanup(stop);
        const off = () => { stop(); };
        addCleanup(off);
        return off;
    }

    function attachValue(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-stat-value");
        // aria-live so screen readers announce big value changes
        setAttr(el, "aria-live", "polite");
        const stop = effect(() => {
            const v = _displayValue();
            const next = formatter(v);
            if (el.textContent !== next) el.textContent = next;
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeAttribute("aria-live");
        };
        addCleanup(off);
        return off;
    }

    function attachUnit(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-stat-unit");
        const stop = effect(() => {
            const next = _unit();
            if (el.textContent !== next) el.textContent = next;
        });
        addCleanup(stop);
        const off = () => { stop(); };
        addCleanup(off);
        return off;
    }

    function attachTrend(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-stat-trend");
        const stop = effect(() => {
            const t = _trend();
            const next = t ? trendFormatter(t) : "";
            if (el.textContent !== next) el.textContent = next;
            if (t) {
                setAttr(el, "data-trend-direction", t.direction);
                setAttr(el, "data-trend-value", String(t.value));
                toggleAttr(el, "data-hidden", false);
            } else {
                el.removeAttribute("data-trend-direction");
                el.removeAttribute("data-trend-value");
                toggleAttr(el, "data-hidden", true);
            }
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeAttribute("data-trend-direction");
            el.removeAttribute("data-trend-value");
            el.removeAttribute("data-hidden");
        };
        addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        if (_rafId) _cancelRaf(_rafId);
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
    }

    return {
        // reactive
        value, displayValue, label, unit, trend,
        // mutations
        setValue, setLabel, setUnit, setTrend,
        // attach
        attachRoot, attachLabel, attachValue, attachUnit, attachTrend,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
