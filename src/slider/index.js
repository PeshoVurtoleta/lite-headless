// @zakkster/lite-headless / slider / index.js
//
// createSlider(options) -> SliderHandle
//
// Headless range/slider primitive. Value is always an array:
//   [50]            -- single-thumb slider
//   [25, 75]        -- two-thumb range slider
//   [10, 40, 70]    -- multi-thumb slider (no upper bound)
//
// The thumb count is determined by the initial value array length and stays
// fixed; the primitive doesn't add or remove thumbs at runtime. (Add a second
// slider if you want dynamic thumb counts.)
//
// Positioning is communicated to consumer CSS via custom properties:
//   --lh-thumb-pct        on each thumb (0-100, inverted-aware)
//   --lh-range-start      on the range fill (0-100, inverted-aware)
//   --lh-range-end        on the range fill (0-100, inverted-aware)
// Consumer styles them however they like. The primitive does not write
// `style.left`, `transform`, or anything other than custom properties; the
// consumer owns the geometry.
//
// Orientation + inversion:
//   horizontal default: left = min, right = max
//   vertical default:   bottom = min, top = max  (volume-slider convention)
//   inverted: reverse the axis. Keyboard semantics are unchanged --
//   ArrowUp/ArrowRight always INCREASES the value, ArrowDown/ArrowLeft
//   always DECREASES it, regardless of axis or inversion. This matches what
//   screen readers and assistive tech expect.
//
// No overlay machinery is used (no portal, no positioner, no dismiss layer);
// the slider is a non-overlay primitive that lives in this package because
// it composes the same lite-signal reactive contract.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { uniqueId, setAttr, ensureId } from "../_overlay/aria.js";

export function createSlider(options = {}) {
    const {
        // Value: pass an external WriteSignal for controlled mode, or
        // defaultValue for uncontrolled. defaultValue's array length determines
        // the thumb count.
        value: externalValue,
        defaultValue,
        onValueChange,

        min = 0,
        max = 100,
        step = 1,
        // largeStep is what PageUp/PageDown moves by, and (when nonzero)
        // what Shift+Arrow moves by. Defaults to 10x step.
        largeStep,

        orientation = "horizontal",     // "horizontal" | "vertical"
        inverted = false,
        disabled: _initialDisabled = false,

        // For range/multi-thumb sliders: minimum number of `step` units that
        // must separate adjacent thumbs. 0 means thumbs can touch but not
        // cross. -Infinity means thumbs can pass through each other.
        minStepsBetweenThumbs = 0,
    } = options;

    // `disabled` is mutable -- consumer can flip via `setDisabled(flag)` at
    // runtime. All attach* closures read this through the lexical binding,
    // so they see the latest value on every event.
    let disabled = !!_initialDisabled;

    if (min >= max) {
        throw new Error("[lite-headless slider] min must be < max");
    }
    if (step <= 0) {
        throw new Error("[lite-headless slider] step must be > 0");
    }

    const _largeStep = largeStep != null ? largeStep : step * 10;
    const initial = Array.isArray(externalValue ? externalValue() : null)
        ? externalValue()
        : (Array.isArray(defaultValue) ? defaultValue.slice() : [min]);

    // Each value clamped + snapped on init
    const _initialClamped = initial.map((v) => clampSnap(v, min, max, step));

    // The value signal -- external if provided, else internal
    const _value = externalValue || makeSignal(_initialClamped);
    if (!externalValue) {
        // ensure initial passes through snap+clamp
        _value.set(_initialClamped);
    }

    // The fixed number of thumbs (locked at init from initial value length)
    const _thumbCount = _initialClamped.length;

    // Attached elements
    let _track = null;
    let _range = null;
    const _thumbs = new Array(_thumbCount).fill(null);
    let _label = null;       // for aria-labelledby / aria-label on thumbs
    const _cleanups = [];
    let _destroyed = false;

    // Drag state (one active drag at a time across the whole slider)
    let _dragging = false;
    let _dragThumbIdx = -1;
    // Cached track rect while a drag is in progress (see pointerToValue).
    // null when not dragging; reset on scroll/resize.
    let _dragTrackRect = null;
    let _dragRectInvalidator = null;
    let _dragPointerId = null;
    let _docMoveOff = null;
    let _docUpOff = null;

    // ----- math helpers ------------------------------------------------
    function clampSnap(v, lo, hi, st) {
        if (v < lo) v = lo;
        else if (v > hi) v = hi;
        // snap to nearest step from lo
        const stepped = Math.round((v - lo) / st) * st + lo;
        // re-clamp because step rounding can push above max
        if (stepped > hi) return hi;
        if (stepped < lo) return lo;
        // protect against float drift on round-trip arithmetic
        const rounded = Number(stepped.toFixed(10));
        return rounded;
    }

    // Convert a client (clientX, clientY) coordinate to a slider value,
    // accounting for orientation + inversion + the track's bounding rect.
    //
    // Layout-thrash guard: during drag, `_dragTrackRect` is populated by
    // startDrag and consumed here. Reading getBoundingClientRect on
    // every pointermove forces a style+layout reflow per frame; at
    // 120Hz on a complex page that's measurable jank. Fresh rect is
    // still read for one-shot calls (track-click before any drag, etc).
    function pointerToValue(clientX, clientY) {
        if (!_track) return min;
        const rect = _dragTrackRect || _track.getBoundingClientRect();
        let pct;
        if (orientation === "horizontal") {
            if (rect.width <= 0) return min;
            pct = (clientX - rect.left) / rect.width;
        } else {
            if (rect.height <= 0) return min;
            // vertical: bottom is min, top is max (volume-slider convention)
            pct = (rect.bottom - clientY) / rect.height;
        }
        if (inverted) pct = 1 - pct;
        if (pct < 0) pct = 0;
        else if (pct > 1) pct = 1;
        const raw = min + pct * (max - min);
        return clampSnap(raw, min, max, step);
    }

    // Set a single thumb's value, enforcing crossing constraints. Returns
    // true if the value actually changed (after constraints).
    //
    // PERF: this runs per pointermove during drag (60-120Hz on modern
    // devices). We early-exit BEFORE the `.slice()` if the snapped value
    // matches the current one. The slice itself is unavoidable -- the
    // signal contract is reference-equality so a fresh array is the only
    // way to trigger downstream effects. But by avoiding it when the
    // pixel-level drag hasn't crossed a step boundary, we drop ~80% of
    // allocations during continuous dragging at typical step granularities.
    function setThumbValue(idx, raw) {
        if (idx < 0 || idx >= _thumbCount) return false;
        const current = _value();
        let v = clampSnap(raw, min, max, step);

        // Crossing constraints reference neighbors, but we can read them
        // directly off `current` without slicing first.
        if (minStepsBetweenThumbs > -Infinity && _thumbCount > 1) {
            const gap = minStepsBetweenThumbs * step;
            if (idx > 0) {
                const lo = current[idx - 1] + gap;
                if (v < lo) v = lo;
            }
            if (idx < _thumbCount - 1) {
                const hi = current[idx + 1] - gap;
                if (v > hi) v = hi;
            }
        }
        if (current[idx] === v) return false;   // <-- early exit, no allocation

        const arr = current.slice();
        arr[idx] = v;
        _value.set(arr);
        if (onValueChange) {
            try { onValueChange(arr); } catch (e) { /* swallow */ }
        }
        return true;
    }

    // Nudge a thumb by a step amount (signed).
    function nudgeThumb(idx, delta) {
        const cur = _value()[idx];
        setThumbValue(idx, cur + delta);
    }

    // ----- reactive sync: write CSS vars + ARIA attrs from value -------
    const stopValueSync = effect(() => {
        const values = _value();
        for (let i = 0; i < _thumbs.length; i++) {
            const t = _thumbs[i];
            if (!t) continue;
            const v = values[i];
            const span = max - min;
            const pctRaw = span > 0 ? ((v - min) / span) * 100 : 0;
            const pct = inverted ? 100 - pctRaw : pctRaw;
            t.style.setProperty("--lh-thumb-pct", pct.toFixed(4));
            setAttr(t, "aria-valuenow", v);
            setAttr(t, "data-value", v);
            setAttr(t, "data-percentage", pct.toFixed(2));
        }
        if (_range) {
            // Range fill spans the convex hull of the values (lowest to highest).
            // For single-thumb: from start of track to thumb.
            // PERF: was `values.slice().sort((a,b) => a-b)` which allocated
            // a copy + ran sort (O(n log n) + comparator closure). Manual
            // min/max scan is O(n) with zero allocations.
            let lo, hi;
            if (values.length === 1) {
                lo = min;
                hi = values[0];
            } else {
                lo = values[0]; hi = values[0];
                for (let i = 1; i < values.length; i++) {
                    const x = values[i];
                    if (x < lo) lo = x;
                    else if (x > hi) hi = x;
                }
            }
            const span = max - min;
            const loPctRaw = span > 0 ? ((lo - min) / span) * 100 : 0;
            const hiPctRaw = span > 0 ? ((hi - min) / span) * 100 : 0;
            const startPct = inverted ? 100 - hiPctRaw : loPctRaw;
            const endPct   = inverted ? 100 - loPctRaw : hiPctRaw;
            _range.style.setProperty("--lh-range-start", startPct.toFixed(4));
            _range.style.setProperty("--lh-range-end",   endPct.toFixed(4));
        }
    });
    _cleanups.push(stopValueSync);

    // ----- attach methods ----------------------------------------------
    function attachTrack(el) {
        if (!el || _destroyed) return noop;
        _track = el;
        setAttr(el, "data-orientation", orientation);
        setAttr(el, "data-disabled", disabled ? "" : null);

        // Clicking the track jumps the nearest thumb to that position AND
        // starts a drag, so the user can press-and-drag from anywhere on
        // the track. Pointerdown on a thumb is handled by the thumb itself
        // and shouldn't bubble up to here -- we check e.target.
        const onPointerDown = (e) => {
            if (disabled) return;
            // ignore if the pointerdown originated on a thumb (which will
            // handle it directly). e.target === el means the click was on
            // the track surface itself.
            if (e.target !== el && _thumbs.indexOf(e.target) !== -1) return;
            e.preventDefault();
            const newVal = pointerToValue(e.clientX, e.clientY);
            // find nearest thumb
            const vals = _value();
            let nearest = 0;
            let nearestDist = Math.abs(vals[0] - newVal);
            for (let i = 1; i < vals.length; i++) {
                const d = Math.abs(vals[i] - newVal);
                if (d < nearestDist) { nearest = i; nearestDist = d; }
            }
            setThumbValue(nearest, newVal);
            const thumb = _thumbs[nearest];
            if (thumb) {
                try { thumb.focus({ preventScroll: true }); } catch { /* noop */ }
            }
            startDrag(nearest, e.pointerId);
        };
        el.addEventListener("pointerdown", onPointerDown);

        const off = () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeAttribute("data-orientation");
            el.removeAttribute("data-disabled");
            if (_track === el) _track = null;
        };
        _cleanups.push(off);
        return off;
    }

    function attachRange(el) {
        if (!el || _destroyed) return noop;
        _range = el;
        setAttr(el, "data-orientation", orientation);
        // initial paint of CSS vars happens via the effect above; tickle the
        // effect by reading _value here so the writes happen for this element.
        // (The effect re-runs when _value changes; for first-paint when range
        // is attached AFTER the initial effect run, we write directly.)
        {
            const values = _value();
            let lo, hi;
            if (values.length === 1) { lo = min; hi = values[0]; }
            else {
                lo = values[0]; hi = values[0];
                for (let i = 1; i < values.length; i++) {
                    const x = values[i];
                    if (x < lo) lo = x;
                    else if (x > hi) hi = x;
                }
            }
            const span = max - min;
            const loPctRaw = span > 0 ? ((lo - min) / span) * 100 : 0;
            const hiPctRaw = span > 0 ? ((hi - min) / span) * 100 : 0;
            const startPct = inverted ? 100 - hiPctRaw : loPctRaw;
            const endPct   = inverted ? 100 - loPctRaw : hiPctRaw;
            el.style.setProperty("--lh-range-start", startPct.toFixed(4));
            el.style.setProperty("--lh-range-end",   endPct.toFixed(4));
        }

        const off = () => {
            el.removeAttribute("data-orientation");
            el.style.removeProperty("--lh-range-start");
            el.style.removeProperty("--lh-range-end");
            if (_range === el) _range = null;
        };
        _cleanups.push(off);
        return off;
    }

    function attachThumb(el, index) {
        if (!el || _destroyed) return noop;
        if (index < 0 || index >= _thumbCount) {
            throw new Error("[lite-headless slider] thumb index " + index +
                " out of range (slider has " + _thumbCount + " thumb(s))");
        }
        if (_thumbs[index]) {
            // re-attaching: tear down previous
            const prev = _thumbs[index];
            // (we can't easily call its `off` here -- just clear the slot)
            _thumbs[index] = null;
        }
        _thumbs[index] = el;
        ensureId(el, "lh-slider-thumb");
        setAttr(el, "role", "slider");
        setAttr(el, "aria-orientation", orientation);
        setAttr(el, "aria-valuemin", String(min));
        setAttr(el, "aria-valuemax", String(max));
        setAttr(el, "aria-valuenow", String(_value()[index]));
        if (disabled) {
            setAttr(el, "aria-disabled", "true");
            setAttr(el, "data-disabled", "");
        }
        if (!el.hasAttribute("tabindex")) {
            el.setAttribute("tabindex", disabled ? "-1" : "0");
        }
        setAttr(el, "data-thumb-index", String(index));
        setAttr(el, "data-orientation", orientation);

        // initial paint of --lh-thumb-pct
        {
            const v = _value()[index];
            const span = max - min;
            const pctRaw = span > 0 ? ((v - min) / span) * 100 : 0;
            const pct = inverted ? 100 - pctRaw : pctRaw;
            el.style.setProperty("--lh-thumb-pct", pct.toFixed(4));
            setAttr(el, "data-value", String(v));
            setAttr(el, "data-percentage", pct.toFixed(2));
        }

        const onPointerDown = (e) => {
            if (disabled) return;
            e.preventDefault();
            e.stopPropagation();   // don't let the track also handle this
            try { el.focus({ preventScroll: true }); } catch { /* noop */ }
            startDrag(index, e.pointerId);
        };
        const onKeyDown = (e) => {
            if (disabled) return;
            const k = e.key;
            // ArrowUp/ArrowRight always increases; ArrowDown/ArrowLeft always
            // decreases. Orientation + inversion are handled at the pointer
            // level, not here -- keyboard semantics are about value direction.
            let delta = 0;
            if (k === "ArrowRight" || k === "ArrowUp") {
                delta = e.shiftKey ? _largeStep : step;
            } else if (k === "ArrowLeft" || k === "ArrowDown") {
                delta = -(e.shiftKey ? _largeStep : step);
            } else if (k === "PageUp") {
                delta = _largeStep;
            } else if (k === "PageDown") {
                delta = -_largeStep;
            } else if (k === "Home") {
                e.preventDefault();
                setThumbValue(index, min);
                return;
            } else if (k === "End") {
                e.preventDefault();
                setThumbValue(index, max);
                return;
            } else {
                return;
            }
            e.preventDefault();
            nudgeThumb(index, delta);
        };
        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("keydown", onKeyDown);

        const off = () => {
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("keydown", onKeyDown);
            el.removeAttribute("role");
            el.removeAttribute("aria-orientation");
            el.removeAttribute("aria-valuemin");
            el.removeAttribute("aria-valuemax");
            el.removeAttribute("aria-valuenow");
            el.removeAttribute("aria-disabled");
            el.removeAttribute("data-thumb-index");
            el.removeAttribute("data-orientation");
            el.removeAttribute("data-disabled");
            el.removeAttribute("data-value");
            el.removeAttribute("data-percentage");
            el.removeAttribute("tabindex");
            el.style.removeProperty("--lh-thumb-pct");
            if (_thumbs[index] === el) _thumbs[index] = null;
        };
        _cleanups.push(off);
        return off;
    }

    function attachLabel(el) {
        if (!el || _destroyed) return noop;
        _label = el;
        ensureId(el, "lh-slider-label");
        // wire aria-labelledby on each thumb
        for (let i = 0; i < _thumbs.length; i++) {
            if (_thumbs[i]) setAttr(_thumbs[i], "aria-labelledby", el.id);
        }
        const off = () => {
            for (let i = 0; i < _thumbs.length; i++) {
                if (_thumbs[i]) _thumbs[i].removeAttribute("aria-labelledby");
            }
            if (_label === el) _label = null;
        };
        _cleanups.push(off);
        return off;
    }

    // ----- drag lifecycle ----------------------------------------------
    function startDrag(idx, pointerId) {
        if (_dragging) endDrag();
        _dragging = true;
        _dragThumbIdx = idx;
        _dragPointerId = pointerId;
        // Snapshot the track rect for the duration of the drag so each
        // pointermove doesn't trigger a forced reflow. Invalidate on
        // window-level scroll/resize -- pointer events don't change
        // geometry but the user might pinch-zoom or scroll a scrollable
        // ancestor mid-drag, in which case the rect is stale.
        if (_track) {
            _dragTrackRect = _track.getBoundingClientRect();
            const invalidate = () => {
                if (_track) _dragTrackRect = _track.getBoundingClientRect();
            };
            const win = (typeof window !== "undefined") ? window : null;
            if (win) {
                win.addEventListener("scroll", invalidate, { passive: true, capture: true });
                win.addEventListener("resize", invalidate, { passive: true });
                _dragRectInvalidator = () => {
                    win.removeEventListener("scroll", invalidate, { capture: true });
                    win.removeEventListener("resize", invalidate);
                };
            }
        }
        // mark drag state on track for CSS hooks
        if (_track) _track.setAttribute("data-dragging", "");
        const thumb = _thumbs[idx];
        if (thumb) thumb.setAttribute("data-dragging", "");

        const onMove = (e) => {
            if (e.pointerId !== _dragPointerId) return;
            const v = pointerToValue(e.clientX, e.clientY);
            setThumbValue(_dragThumbIdx, v);
        };
        const onUp = (e) => {
            if (e.pointerId !== _dragPointerId) return;
            endDrag();
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
        document.addEventListener("pointercancel", onUp);
        _docMoveOff = () => document.removeEventListener("pointermove", onMove);
        _docUpOff = () => {
            document.removeEventListener("pointerup", onUp);
            document.removeEventListener("pointercancel", onUp);
        };
    }

    function endDrag() {
        if (!_dragging) return;
        if (_track) _track.removeAttribute("data-dragging");
        const thumb = _dragThumbIdx >= 0 ? _thumbs[_dragThumbIdx] : null;
        if (thumb) thumb.removeAttribute("data-dragging");
        if (_docMoveOff) { _docMoveOff(); _docMoveOff = null; }
        if (_docUpOff)   { _docUpOff();   _docUpOff = null; }
        if (_dragRectInvalidator) { _dragRectInvalidator(); _dragRectInvalidator = null; }
        _dragTrackRect = null;
        _dragging = false;
        _dragThumbIdx = -1;
        _dragPointerId = null;
    }

    // ----- destroy -----------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        endDrag();
        // run cleanups in reverse so attach effects detach before the
        // top-level effect stops
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch { /* noop */ }
        }
        _cleanups.length = 0;
        _destroyed = true;
    }

    return {
        // value access (signal getter style; .set() on external signal works
        // by writing back through `setValue` which respects constraints)
        value: () => _value(),
        setValue: (next, reason) => {
            // accept either an array of values or a single value for single-
            // thumb sliders
            if (!Array.isArray(next)) next = [next];
            if (next.length !== _thumbCount) {
                throw new Error("[lite-headless slider] setValue array length " +
                    next.length + " != thumb count " + _thumbCount);
            }
            // pipe each value through clampSnap; constraints between thumbs
            // are applied left-to-right
            const arr = [];
            for (let i = 0; i < next.length; i++) {
                let v = clampSnap(next[i], min, max, step);
                if (minStepsBetweenThumbs > -Infinity && i > 0) {
                    const gap = minStepsBetweenThumbs * step;
                    v = Math.max(v, arr[i - 1] + gap);
                }
                arr.push(v);
            }
            const current = _value();
            // shallow array equality
            let same = current.length === arr.length;
            if (same) {
                for (let i = 0; i < arr.length; i++) {
                    if (current[i] !== arr[i]) { same = false; break; }
                }
            }
            if (same) return;
            _value.set(arr);
            if (onValueChange) {
                try { onValueChange(arr, reason); } catch { /* noop */ }
            }
        },
        // disabled state (v0.7.9). Flipping at runtime repaints aria-disabled,
        // data-disabled, and tabindex on every attached thumb + the track,
        // and cancels any in-flight drag. The pointerdown/keydown closures
        // read `disabled` lexically, so they pick up the new value on the
        // next event without rebinding listeners.
        isDisabled: () => disabled,
        setDisabled: (flag) => {
            const next = !!flag;
            if (disabled === next) return;
            disabled = next;
            // cancel an in-flight drag if we just disabled mid-interaction
            if (disabled && _dragging) endDrag();
            // paint track
            if (_track) setAttr(_track, "data-disabled", disabled ? "" : null);
            // paint each thumb
            for (let i = 0; i < _thumbs.length; i++) {
                const th = _thumbs[i];
                if (!th) continue;
                if (disabled) {
                    setAttr(th, "aria-disabled", "true");
                    setAttr(th, "data-disabled", "");
                    th.setAttribute("tabindex", "-1");
                } else {
                    th.removeAttribute("aria-disabled");
                    th.removeAttribute("data-disabled");
                    th.setAttribute("tabindex", "0");
                }
            }
        },
        // metadata
        min, max, step, largeStep: _largeStep, orientation, inverted,
        thumbCount: _thumbCount,
        // attach methods
        attachTrack,
        attachRange,
        attachThumb,
        attachLabel,
        destroy,
        get destroyed() { return _destroyed; },
        // introspection (tests + composition)
        _thumbs: () => _thumbs.slice(),
        _track: () => _track,
        _range: () => _range,
        _dragging: () => _dragging,
    };
}

function noop() {}
