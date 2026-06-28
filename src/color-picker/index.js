// @zakkster/lite-headless / color-picker
//
// Headless color picker. Internal state is HSV (the natural model for
// the picker UI: 2D area for saturation × brightness, 1D rail for hue,
// optional 1D rail for alpha). Public read API exposes HSV, RGB, HEX,
// HSL, and OKLCH so consumers can talk to the picker in whichever color
// space they need. OKLCH support is first-class because the @zakkster
// design-system family (Hueforge, Gradient Studio) lives in OKLCH.
//
// What this primitive owns:
//   - 4 signals: hue (0..360), saturation (0..1), brightness (0..1),
//     alpha (0..1). One effect mirrors them to CSS custom properties on
//     attached elements.
//   - Color conversions: HSV ↔ sRGB ↔ HEX, HSV → HSL, sRGB ↔ OKLab ↔ OKLCH.
//     All conversions are pure functions; no allocation in the hot path
//     (pointerToHsv reuses a shared scratch object, returns numbers).
//   - Pointer drag on the area (saturation × brightness) and on the
//     hue + alpha rails. Track rects cached on dragstart, invalidated
//     on scroll/resize/dragend (same pattern as slider).
//   - Slot attachments: area, area-handle, hue-slider, hue-handle,
//     alpha-slider, alpha-handle, swatch (declarative preset).
//
// What this primitive does NOT own:
//   - DOM layout or styling. Consumer paints the area background, the
//     hue rail gradient, etc. via CSS (using the published custom
//     properties).
//   - Color-space exotica (P3, Rec2020, Lab). Sticks to sRGB and OKLCH;
//     other spaces can be added later if they earn their keep.
//   - EyeDropper API (Chrome-only). Belongs in a thin add-on, not core.
//
// Wire it up:
//
//   const cp = createColorPicker({ defaultHex: "#7dd3fc" });
//   cp.attachRoot(rootEl);
//   cp.attachArea(areaEl);
//   cp.attachAreaHandle(areaHandleEl);
//   cp.attachHueSlider(hueRailEl);
//   cp.attachHueHandle(hueHandleEl);
//
//   effect(() => {
//       const hex = cp.hex();
//       // mirror to a preview swatch, sync to a form, etc.
//   });

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { toggleAttr } from "../_overlay/aria.js";

function noop() {}

// ─── color conversions ───────────────────────────────────────────────
//
// HSV → RGB. h in [0, 360), s,v in [0, 1]. Returns numbers 0..255
// (integer, rounded) so HEX serialization is exact.
function hsvToRgb(h, s, v) {
    if (s <= 0) {
        const g = Math.round(v * 255);
        return [g, g, g];
    }
    h = ((h % 360) + 360) % 360;
    const c = v * s;
    const hp = h / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));
    let r = 0, g = 0, b = 0;
    if      (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else             { r = c; b = x; }
    const m = v - c;
    return [
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
    ];
}

// RGB → HSV. r,g,b in 0..255. Returns [h, s, v] with h in [0, 360),
// s,v in [0, 1]. Zero-saturation case preserves the existing hue so
// the picker UI doesn't jump on a brightness slide through gray.
function rgbToHsv(r, g, b, prevH) {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const d = max - min;
    let h;
    if (d === 0) {
        h = typeof prevH === "number" ? prevH : 0;
    } else if (max === rn) {
        h = 60 * (((gn - bn) / d) % 6);
    } else if (max === gn) {
        h = 60 * (((bn - rn) / d) + 2);
    } else {
        h = 60 * (((rn - gn) / d) + 4);
    }
    if (h < 0) h += 360;
    const s = max === 0 ? 0 : d / max;
    return [h, s, max];
}

// HEX parsing. Accepts "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", with or
// without the leading "#". Returns [r, g, b, a] with a in 0..1, or null.
function parseHex(input) {
    if (typeof input !== "string") return null;
    let s = input.trim();
    if (s.charAt(0) === "#") s = s.slice(1);
    if (!/^[0-9a-f]+$/i.test(s)) return null;
    if (s.length === 3) {
        const r = parseInt(s.charAt(0) + s.charAt(0), 16);
        const g = parseInt(s.charAt(1) + s.charAt(1), 16);
        const b = parseInt(s.charAt(2) + s.charAt(2), 16);
        return [r, g, b, 1];
    }
    if (s.length === 4) {
        const r = parseInt(s.charAt(0) + s.charAt(0), 16);
        const g = parseInt(s.charAt(1) + s.charAt(1), 16);
        const b = parseInt(s.charAt(2) + s.charAt(2), 16);
        const a = parseInt(s.charAt(3) + s.charAt(3), 16) / 255;
        return [r, g, b, a];
    }
    if (s.length === 6) {
        return [
            parseInt(s.slice(0, 2), 16),
            parseInt(s.slice(2, 4), 16),
            parseInt(s.slice(4, 6), 16),
            1,
        ];
    }
    if (s.length === 8) {
        return [
            parseInt(s.slice(0, 2), 16),
            parseInt(s.slice(2, 4), 16),
            parseInt(s.slice(4, 6), 16),
            parseInt(s.slice(6, 8), 16) / 255,
        ];
    }
    return null;
}

function toHex2(n) {
    const v = Math.max(0, Math.min(255, Math.round(n)));
    return (v < 16 ? "0" : "") + v.toString(16);
}

// sRGB → linear sRGB (gamma decode). Component in 0..1.
function srgbToLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// linear sRGB → sRGB (gamma encode).
function linearToSrgb(c) {
    if (c <= 0) return 0;
    if (c >= 1) return 1;
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Linear sRGB → OKLab. Spec: https://bottosson.github.io/posts/oklab/
// (also W3C CSS Color 4). Operates on linear-sRGB triple in 0..1.
function linearRgbToOklab(r, g, b) {
    const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    const l_ = Math.cbrt(l);
    const m_ = Math.cbrt(m);
    const s_ = Math.cbrt(s);
    return [
        0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
    ];
}

// OKLab → linear sRGB. Inverse of above.
function oklabToLinearRgb(L, a, b) {
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    return [
         4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ];
}

// sRGB (0..255) → OKLCH. Returns [L, C, h] with L in 0..1, C in ~0..0.4,
// h in [0, 360).
function rgbToOklch(r, g, b) {
    const rl = srgbToLinear(r / 255);
    const gl = srgbToLinear(g / 255);
    const bl = srgbToLinear(b / 255);
    const [L, a, bb] = linearRgbToOklab(rl, gl, bl);
    const C = Math.sqrt(a * a + bb * bb);
    let h = Math.atan2(bb, a) * 180 / Math.PI;
    if (h < 0) h += 360;
    return [L, C, h];
}

// OKLCH → sRGB (0..255). Clamps each channel into [0, 255]. Out-of-
// gamut colors are silently clamped; consumers wanting gamut-mapping
// should pre-process.
function oklchToRgb(L, C, h) {
    const a = C * Math.cos(h * Math.PI / 180);
    const b = C * Math.sin(h * Math.PI / 180);
    const [rl, gl, bl] = oklabToLinearRgb(L, a, b);
    return [
        Math.round(Math.max(0, Math.min(1, linearToSrgb(rl))) * 255),
        Math.round(Math.max(0, Math.min(1, linearToSrgb(gl))) * 255),
        Math.round(Math.max(0, Math.min(1, linearToSrgb(bl))) * 255),
    ];
}

// HSV → HSL. Standard formula; preserves hue. Returns [h, s, l].
function hsvToHsl(h, s, v) {
    const l = v * (1 - s / 2);
    const sl = (l === 0 || l === 1) ? 0 : (v - l) / Math.min(l, 1 - l);
    return [h, sl, l];
}

// ─── primitive ───────────────────────────────────────────────────────

export function createColorPicker(opts = {}) {
    const o = opts || {};
    const onValueChange = typeof o.onValueChange === "function" ? o.onValueChange : null;
    const onCommit      = typeof o.onCommit      === "function" ? o.onCommit      : null;
    const supportsAlpha = o.alpha !== false;    // default true; pass false to disable

    // Seed from defaultHex / defaultHsv / defaultRgb, in that priority.
    let _h0 = 0, _s0 = 1, _v0 = 1, _a0 = 1;
    if (o.defaultHsv) {
        if (typeof o.defaultHsv.h === "number") _h0 = ((o.defaultHsv.h % 360) + 360) % 360;
        if (typeof o.defaultHsv.s === "number") _s0 = Math.max(0, Math.min(1, o.defaultHsv.s));
        if (typeof o.defaultHsv.v === "number") _v0 = Math.max(0, Math.min(1, o.defaultHsv.v));
        if (typeof o.defaultHsv.a === "number") _a0 = Math.max(0, Math.min(1, o.defaultHsv.a));
    } else if (o.defaultRgb) {
        const r = Math.max(0, Math.min(255, o.defaultRgb.r | 0));
        const g = Math.max(0, Math.min(255, o.defaultRgb.g | 0));
        const b = Math.max(0, Math.min(255, o.defaultRgb.b | 0));
        const [hh, ss, vv] = rgbToHsv(r, g, b, 0);
        _h0 = hh; _s0 = ss; _v0 = vv;
        if (typeof o.defaultRgb.a === "number") _a0 = Math.max(0, Math.min(1, o.defaultRgb.a));
    } else if (typeof o.defaultHex === "string") {
        const parsed = parseHex(o.defaultHex);
        if (parsed) {
            const [hh, ss, vv] = rgbToHsv(parsed[0], parsed[1], parsed[2], 0);
            _h0 = hh; _s0 = ss; _v0 = vv; _a0 = parsed[3];
        }
    }

    const _hue   = makeSignal(_h0);
    const _sat   = makeSignal(_s0);
    const _val   = makeSignal(_v0);
    const _alpha = makeSignal(_a0);
    const _destroyed = { v: false };

    // ─── reads (derived; converted on demand) ─────────────────────────

    function hue()        { return _hue(); }
    function saturation() { return _sat(); }
    function brightness() { return _val(); }
    function alpha()      { return _alpha(); }

    function hsv() {
        return { h: _hue(), s: _sat(), v: _val(), a: _alpha() };
    }
    function rgb() {
        const [r, g, b] = hsvToRgb(_hue(), _sat(), _val());
        return { r, g, b, a: _alpha() };
    }
    function hex() {
        const [r, g, b] = hsvToRgb(_hue(), _sat(), _val());
        const base = "#" + toHex2(r) + toHex2(g) + toHex2(b);
        if (supportsAlpha && _alpha() < 1) {
            return base + toHex2(_alpha() * 255);
        }
        return base;
    }
    function hsl() {
        const [h, s, l] = hsvToHsl(_hue(), _sat(), _val());
        return { h, s, l, a: _alpha() };
    }
    function oklch() {
        const [r, g, b] = hsvToRgb(_hue(), _sat(), _val());
        const [L, C, h] = rgbToOklch(r, g, b);
        return { l: L, c: C, h, a: _alpha() };
    }

    // ─── writes ──────────────────────────────────────────────────────

    function _setIfDifferent(sig, val) {
        if (sig() !== val) sig.set(val);
    }
    function _fire(reason) {
        if (onValueChange) {
            try { onValueChange(hsv(), reason); } catch { /* swallow */ }
        }
    }

    function setHue(h, reason) {
        if (_destroyed.v) return;
        if (typeof h !== "number" || !isFinite(h)) return;
        h = ((h % 360) + 360) % 360;
        if (_hue() === h) return;
        _hue.set(h);
        _fire(reason || "setHue");
    }
    function setSaturation(s, reason) {
        if (_destroyed.v) return;
        if (typeof s !== "number" || !isFinite(s)) return;
        s = Math.max(0, Math.min(1, s));
        if (_sat() === s) return;
        _sat.set(s);
        _fire(reason || "setSaturation");
    }
    function setBrightness(v, reason) {
        if (_destroyed.v) return;
        if (typeof v !== "number" || !isFinite(v)) return;
        v = Math.max(0, Math.min(1, v));
        if (_val() === v) return;
        _val.set(v);
        _fire(reason || "setBrightness");
    }
    function setAlpha(a, reason) {
        if (_destroyed.v || !supportsAlpha) return;
        if (typeof a !== "number" || !isFinite(a)) return;
        a = Math.max(0, Math.min(1, a));
        if (_alpha() === a) return;
        _alpha.set(a);
        _fire(reason || "setAlpha");
    }
    function setHsv(next, reason) {
        if (_destroyed.v || !next) return;
        let changed = false;
        if (typeof next.h === "number") {
            const h = ((next.h % 360) + 360) % 360;
            if (_hue() !== h) { _hue.set(h); changed = true; }
        }
        if (typeof next.s === "number") {
            const s = Math.max(0, Math.min(1, next.s));
            if (_sat() !== s) { _sat.set(s); changed = true; }
        }
        if (typeof next.v === "number") {
            const v = Math.max(0, Math.min(1, next.v));
            if (_val() !== v) { _val.set(v); changed = true; }
        }
        if (supportsAlpha && typeof next.a === "number") {
            const a = Math.max(0, Math.min(1, next.a));
            if (_alpha() !== a) { _alpha.set(a); changed = true; }
        }
        if (changed) _fire(reason || "setHsv");
    }
    function setRgb(next, reason) {
        if (_destroyed.v || !next) return;
        const r = Math.max(0, Math.min(255, next.r | 0));
        const g = Math.max(0, Math.min(255, next.g | 0));
        const b = Math.max(0, Math.min(255, next.b | 0));
        const [h, s, v] = rgbToHsv(r, g, b, _hue());
        let changed = false;
        if (_hue() !== h) { _hue.set(h); changed = true; }
        if (_sat() !== s) { _sat.set(s); changed = true; }
        if (_val() !== v) { _val.set(v); changed = true; }
        if (supportsAlpha && typeof next.a === "number") {
            const a = Math.max(0, Math.min(1, next.a));
            if (_alpha() !== a) { _alpha.set(a); changed = true; }
        }
        if (changed) _fire(reason || "setRgb");
    }
    function setHex(s, reason) {
        if (_destroyed.v) return;
        const parsed = parseHex(s);
        if (!parsed) return false;
        setRgb({ r: parsed[0], g: parsed[1], b: parsed[2], a: parsed[3] }, reason || "setHex");
        return true;
    }
    function setOklch(next, reason) {
        if (_destroyed.v || !next) return;
        const L = typeof next.l === "number" ? next.l : 0;
        const C = typeof next.c === "number" ? next.c : 0;
        const h = typeof next.h === "number" ? next.h : 0;
        const [r, g, b] = oklchToRgb(L, C, h);
        const a = supportsAlpha && typeof next.a === "number" ? next.a : _alpha();
        setRgb({ r, g, b, a }, reason || "setOklch");
    }

    // Commit hook: pointerup at the end of a drag dispatches "commit"
    // so consumers can persist the final value (history snapshot, form
    // mark-touched, etc.) without seeing every intermediate frame.
    function _fireCommit(reason) {
        if (onCommit) {
            try { onCommit(hsv(), reason); } catch { /* swallow */ }
        }
    }

    // ─── attachments ─────────────────────────────────────────────────

    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    const _attachedRoots = new Set();
    const _attachedAreas = new Set();
    const _attachedAreaHandles = new Set();
    const _attachedHueSliders = new Set();
    const _attachedHueHandles = new Set();
    const _attachedAlphaSliders = new Set();
    const _attachedAlphaHandles = new Set();

    // Per-element paint. Reads the current signal values and writes the
    // matching CSS custom properties. Called inline on attach so the
    // element receives initial state immediately, then again by the
    // global effect on each signal change so it stays in sync. Pure
    // function over the element kind; no allocation.
    function paintEl(el, kind, h, s, v, a, hexStr, r, g, b) {
        switch (kind) {
            case "root":
                el.style.setProperty("--color-hex", hexStr);
                el.style.setProperty("--color-h", h.toFixed(2));
                el.style.setProperty("--color-s", s.toFixed(4));
                el.style.setProperty("--color-v", v.toFixed(4));
                el.style.setProperty("--color-r", String(r));
                el.style.setProperty("--color-g", String(g));
                el.style.setProperty("--color-b", String(b));
                el.style.setProperty("--color-a", a.toFixed(4));
                break;
            case "area":
                el.style.setProperty("--color-h", h.toFixed(2));
                el.style.setProperty("--saturation", s.toFixed(4));
                el.style.setProperty("--brightness", v.toFixed(4));
                break;
            case "areaHandle":
                el.style.setProperty("--x", s.toFixed(4));
                el.style.setProperty("--y", (1 - v).toFixed(4));
                break;
            case "hueSlider":
            case "hueHandle":
                el.style.setProperty("--hue-pct", (h / 360).toFixed(4));
                break;
            case "alphaSlider":
                el.style.setProperty("--color-hex", hexStr);
                el.style.setProperty("--alpha", a.toFixed(4));
                break;
            case "alphaHandle":
                el.style.setProperty("--alpha", a.toFixed(4));
                break;
        }
    }
    // Snapshot of current signal values for one-shot inline paints.
    // Does NOT register reactivity (called outside an effect).
    function paintNow(el, kind) {
        const h = _hue(), s = _sat(), v = _val(), a = _alpha();
        const [r, g, b] = hsvToRgb(h, s, v);
        const hexStr = "#" + toHex2(r) + toHex2(g) + toHex2(b);
        paintEl(el, kind, h, s, v, a, hexStr, r, g, b);
    }

    // Paint custom properties on each attached element. ONE effect that
    // reads all 4 signals and writes to every attached element. Painted
    // values stay in sync with reactive state, no per-frame allocation.
    const stopPaint = effect(() => {
        const h = _hue();
        const s = _sat();
        const v = _val();
        const a = _alpha();
        const [r, g, b] = hsvToRgb(h, s, v);
        const hexStr = "#" + toHex2(r) + toHex2(g) + toHex2(b);
        for (const el of _attachedRoots)        paintEl(el, "root",        h, s, v, a, hexStr, r, g, b);
        for (const el of _attachedAreas)        paintEl(el, "area",        h, s, v, a, hexStr, r, g, b);
        for (const el of _attachedAreaHandles)  paintEl(el, "areaHandle",  h, s, v, a, hexStr, r, g, b);
        for (const el of _attachedHueSliders)   paintEl(el, "hueSlider",   h, s, v, a, hexStr, r, g, b);
        for (const el of _attachedHueHandles)   paintEl(el, "hueHandle",   h, s, v, a, hexStr, r, g, b);
        for (const el of _attachedAlphaSliders) paintEl(el, "alphaSlider", h, s, v, a, hexStr, r, g, b);
        for (const el of _attachedAlphaHandles) paintEl(el, "alphaHandle", h, s, v, a, hexStr, r, g, b);
    });
    addCleanup(stopPaint);

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _attachedRoots.add(el);
        el.setAttribute("data-color-picker-root", "");
        paintNow(el, "root");
        const off = () => {
            el.removeAttribute("data-color-picker-root");
            el.style.removeProperty("--color-hex");
            el.style.removeProperty("--color-h");
            el.style.removeProperty("--color-s");
            el.style.removeProperty("--color-v");
            el.style.removeProperty("--color-r");
            el.style.removeProperty("--color-g");
            el.style.removeProperty("--color-b");
            el.style.removeProperty("--color-a");
            _attachedRoots.delete(el);
        };
        addCleanup(off);
        return off;
    }

    // ── 2D area: pointerdown→drag for saturation × brightness ──
    function attachArea(el) {
        if (!el || _destroyed.v) return noop;
        _attachedAreas.add(el);
        el.setAttribute("data-color-area", "");
        paintNow(el, "area");

        let activePointerId = null;
        let cachedRect = null;
        let invalidateOff = null;

        function cacheRect() {
            cachedRect = el.getBoundingClientRect();
            // Layout-thrash protection: invalidate on scroll/resize.
            const onScroll = () => { cachedRect = null; };
            window.addEventListener("scroll", onScroll, { passive: true, capture: true });
            window.addEventListener("resize", onScroll, { passive: true });
            invalidateOff = () => {
                window.removeEventListener("scroll", onScroll, { capture: true });
                window.removeEventListener("resize", onScroll);
            };
        }
        function releaseRectCache() {
            cachedRect = null;
            if (invalidateOff) { invalidateOff(); invalidateOff = null; }
        }
        function pointerToSV(ev) {
            const rect = cachedRect || el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            let x = (ev.clientX - rect.left) / rect.width;
            let y = (ev.clientY - rect.top) / rect.height;
            if (x < 0) x = 0; else if (x > 1) x = 1;
            if (y < 0) y = 0; else if (y > 1) y = 1;
            // x → saturation, (1 - y) → brightness
            setSaturation(x, "drag-area");
            setBrightness(1 - y, "drag-area");
        }
        function onPointerDown(ev) {
            if (activePointerId !== null) return;
            if (ev.button !== 0 && ev.pointerType !== "touch") return;
            activePointerId = ev.pointerId;
            try { el.setPointerCapture(ev.pointerId); } catch {}
            cacheRect();
            pointerToSV(ev);
            ev.preventDefault();
        }
        function onPointerMove(ev) {
            if (ev.pointerId !== activePointerId) return;
            pointerToSV(ev);
        }
        function onPointerUp(ev) {
            if (ev.pointerId !== activePointerId) return;
            activePointerId = null;
            try { el.releasePointerCapture(ev.pointerId); } catch {}
            releaseRectCache();
            _fireCommit("drag-area-end");
        }
        function onPointerCancel(ev) {
            if (ev.pointerId !== activePointerId) return;
            activePointerId = null;
            releaseRectCache();
        }

        el.addEventListener("pointerdown",   onPointerDown);
        el.addEventListener("pointermove",   onPointerMove);
        el.addEventListener("pointerup",     onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        const off = () => {
            el.removeEventListener("pointerdown",   onPointerDown);
            el.removeEventListener("pointermove",   onPointerMove);
            el.removeEventListener("pointerup",     onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            el.removeAttribute("data-color-area");
            el.style.removeProperty("--color-h");
            el.style.removeProperty("--saturation");
            el.style.removeProperty("--brightness");
            releaseRectCache();
            _attachedAreas.delete(el);
        };
        addCleanup(off);
        return off;
    }

    function attachAreaHandle(el) {
        if (!el || _destroyed.v) return noop;
        _attachedAreaHandles.add(el);
        el.setAttribute("data-color-area-handle", "");
        paintNow(el, "areaHandle");
        const off = () => {
            el.removeAttribute("data-color-area-handle");
            el.style.removeProperty("--x");
            el.style.removeProperty("--y");
            _attachedAreaHandles.delete(el);
        };
        addCleanup(off);
        return off;
    }

    // ── 1D rail attach helper shared by hue + alpha ──
    //
    // dim is "hue" | "alpha"; orientation is "horizontal" | "vertical"
    // (default horizontal). Caller wires which signal getter/setter to
    // drive via the `getValue` / `setValue` callbacks.
    function _attachRail(el, dim, orientation, getValue, setValueByPct) {
        if (!el || _destroyed.v) return noop;
        let activePointerId = null;
        let cachedRect = null;
        let invalidateOff = null;

        function cacheRect() {
            cachedRect = el.getBoundingClientRect();
            const onScroll = () => { cachedRect = null; };
            window.addEventListener("scroll", onScroll, { passive: true, capture: true });
            window.addEventListener("resize", onScroll, { passive: true });
            invalidateOff = () => {
                window.removeEventListener("scroll", onScroll, { capture: true });
                window.removeEventListener("resize", onScroll);
            };
        }
        function releaseRectCache() {
            cachedRect = null;
            if (invalidateOff) { invalidateOff(); invalidateOff = null; }
        }
        function pointerToValue(ev) {
            const rect = cachedRect || el.getBoundingClientRect();
            let pct;
            if (orientation === "vertical") {
                if (rect.height <= 0) return;
                pct = (ev.clientY - rect.top) / rect.height;
            } else {
                if (rect.width <= 0) return;
                pct = (ev.clientX - rect.left) / rect.width;
            }
            if (pct < 0) pct = 0; else if (pct > 1) pct = 1;
            setValueByPct(pct);
        }
        function onPointerDown(ev) {
            if (activePointerId !== null) return;
            if (ev.button !== 0 && ev.pointerType !== "touch") return;
            activePointerId = ev.pointerId;
            try { el.setPointerCapture(ev.pointerId); } catch {}
            cacheRect();
            pointerToValue(ev);
            ev.preventDefault();
        }
        function onPointerMove(ev) {
            if (ev.pointerId !== activePointerId) return;
            pointerToValue(ev);
        }
        function onPointerUp(ev) {
            if (ev.pointerId !== activePointerId) return;
            activePointerId = null;
            try { el.releasePointerCapture(ev.pointerId); } catch {}
            releaseRectCache();
            _fireCommit("drag-" + dim + "-end");
        }
        function onPointerCancel(ev) {
            if (ev.pointerId !== activePointerId) return;
            activePointerId = null;
            releaseRectCache();
        }

        el.addEventListener("pointerdown",   onPointerDown);
        el.addEventListener("pointermove",   onPointerMove);
        el.addEventListener("pointerup",     onPointerUp);
        el.addEventListener("pointercancel", onPointerCancel);
        const off = () => {
            el.removeEventListener("pointerdown",   onPointerDown);
            el.removeEventListener("pointermove",   onPointerMove);
            el.removeEventListener("pointerup",     onPointerUp);
            el.removeEventListener("pointercancel", onPointerCancel);
            releaseRectCache();
        };
        addCleanup(off);
        return off;
    }

    function attachHueSlider(el, orientation) {
        if (!el || _destroyed.v) return noop;
        _attachedHueSliders.add(el);
        el.setAttribute("data-color-hue-slider", "");
        if (orientation === "vertical") el.setAttribute("data-orientation", "vertical");
        paintNow(el, "hueSlider");
        const drag = _attachRail(el, "hue", orientation, hue, (pct) => {
            setHue(pct * 360, "drag-hue");
        });
        const off = () => {
            drag();
            el.removeAttribute("data-color-hue-slider");
            el.removeAttribute("data-orientation");
            el.style.removeProperty("--hue-pct");
            _attachedHueSliders.delete(el);
        };
        addCleanup(off);
        return off;
    }

    function attachHueHandle(el) {
        if (!el || _destroyed.v) return noop;
        _attachedHueHandles.add(el);
        el.setAttribute("data-color-hue-handle", "");
        paintNow(el, "hueHandle");
        const off = () => {
            el.removeAttribute("data-color-hue-handle");
            el.style.removeProperty("--hue-pct");
            _attachedHueHandles.delete(el);
        };
        addCleanup(off);
        return off;
    }

    function attachAlphaSlider(el, orientation) {
        if (!el || _destroyed.v || !supportsAlpha) return noop;
        _attachedAlphaSliders.add(el);
        el.setAttribute("data-color-alpha-slider", "");
        if (orientation === "vertical") el.setAttribute("data-orientation", "vertical");
        paintNow(el, "alphaSlider");
        const drag = _attachRail(el, "alpha", orientation, alpha, (pct) => {
            setAlpha(pct, "drag-alpha");
        });
        const off = () => {
            drag();
            el.removeAttribute("data-color-alpha-slider");
            el.removeAttribute("data-orientation");
            el.style.removeProperty("--alpha");
            el.style.removeProperty("--color-hex");
            _attachedAlphaSliders.delete(el);
        };
        addCleanup(off);
        return off;
    }

    function attachAlphaHandle(el) {
        if (!el || _destroyed.v || !supportsAlpha) return noop;
        _attachedAlphaHandles.add(el);
        el.setAttribute("data-color-alpha-handle", "");
        paintNow(el, "alphaHandle");
        const off = () => {
            el.removeAttribute("data-color-alpha-handle");
            el.style.removeProperty("--alpha");
            _attachedAlphaHandles.delete(el);
        };
        addCleanup(off);
        return off;
    }

    // Swatch: a preset color tile. Click → setRgb (or setHex if the
    // attribute is a hex string). Consumer paints the swatch background
    // themselves; the primitive only wires the click handler.
    function attachSwatch(el, color) {
        if (!el || _destroyed.v) return noop;
        el.setAttribute("data-color-swatch", "");
        const onClick = (ev) => {
            ev.preventDefault();
            if (typeof color === "string") setHex(color, "swatch");
            else if (color && typeof color === "object") {
                if ("r" in color && "g" in color && "b" in color) setRgb(color, "swatch");
                else if ("h" in color) setHsv(color, "swatch");
            }
            _fireCommit("swatch");
        };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute("data-color-swatch");
        };
        addCleanup(off);
        return off;
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* swallow */ }
        }
        _cleanups.length = 0;
        _attachedRoots.clear();
        _attachedAreas.clear();
        _attachedAreaHandles.clear();
        _attachedHueSliders.clear();
        _attachedHueHandles.clear();
        _attachedAlphaSliders.clear();
        _attachedAlphaHandles.clear();
    }

    return {
        // reactive accessors (call-style)
        hue, saturation, brightness, alpha,
        hsv, rgb, hex, hsl, oklch,
        // mutations
        setHue, setSaturation, setBrightness, setAlpha,
        setHsv, setRgb, setHex, setOklch,
        // attach helpers
        attachRoot,
        attachArea, attachAreaHandle,
        attachHueSlider, attachHueHandle,
        attachAlphaSlider, attachAlphaHandle,
        attachSwatch,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}

// Exported so tests can poke the math without spinning up a primitive.
export {
    hsvToRgb, rgbToHsv,
    parseHex,
    srgbToLinear, linearToSrgb,
    linearRgbToOklab, oklabToLinearRgb,
    rgbToOklch, oklchToRgb,
    hsvToHsl,
};
