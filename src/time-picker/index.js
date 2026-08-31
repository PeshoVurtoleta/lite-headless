// @zakkster/lite-headless / time-picker
//
// createTimePicker(options) -> TimePickerHandle
//
// Headless time entry built from ARIA spinbutton SEGMENTS -- an hour segment,
// a minute segment, and (in 12-hour locales) a meridiem segment. Each segment
// is a role="spinbutton" the consumer provides; the primitive wires
// aria-valuenow/valuemin/valuemax/valuetext, ArrowUp/Down spin-with-wrap, and
// digit typeahead (the pin-input precedent: consecutive digits accumulate
// within a short window, then clamp).
//
// This is a NON-OVERLAY primitive. It ships aria id helpers only. A popover /
// dropdown around the segments is a docs-level composition (exactly as the
// datepicker documents pairing with a popover) -- we deliberately do NOT pull
// in the overlay layers here.
//
// hour12 is resolved ONCE, at construction: an explicit `hour12` option wins,
// otherwise it is derived from Intl.DateTimeFormat().resolvedOptions() a single
// time. It is never re-derived per event.
//
// Optional listbox slot mode: attachSlotList / attachSlot wire a role="listbox"
// grid of role="option" time slots (e.g. a 15-minute picker) onto the same
// value state. Segments are the priority surface; the slot mode is a thin add.
//
// What this is NOT (deferred):
//   - seconds precision (hour + minute only in this release)
//   - overlay / popover composition (docs-level; see llms.txt)
//   - locale-formatted display strings beyond zero-padded HH / MM and AM/PM

import { signal, effect } from "@zakkster/lite-signal";
import { sealSignal } from "../_overlay/seal.js";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";
import { checkOptions } from "../_validate.js";

const OPTION_KEYS = "value|defaultValue|onValueChange|hour12|minuteStep|hourStep|ariaLabel|ariaLabelHour|ariaLabelMinute|ariaLabelMeridiem|typeaheadTimeout";

const noop = () => {};

// Resolve the locale's clock convention ONCE. An explicit boolean option wins;
// otherwise probe Intl a single time. Fails safe to 12-hour if Intl is absent
// or throws (fail-closed: an unverified probe never silently picks 24h).
function _resolveHour12(explicit) {
    if (typeof explicit === "boolean") return explicit;
    try {
        const ro = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions();
        if (typeof ro.hour12 === "boolean") return ro.hour12;
        if (typeof ro.hourCycle === "string") return ro.hourCycle === "h11" || ro.hourCycle === "h12";
    } catch (_) { /* fall through */ }
    return true;
}

function _pad2(n) { return n < 10 ? "0" + n : String(n); }

// Normalize a {hour, minute} shape into clamped 24h integers. Fails closed:
// non-numeric / out-of-range members become 0.
function _normHour(h) {
    if (typeof h !== "number" || !Number.isFinite(h)) return 0;
    let v = h | 0;
    if (v < 0) v = 0; else if (v > 23) v = 23;
    return v;
}
function _normMinute(m) {
    if (typeof m !== "number" || !Number.isFinite(m)) return 0;
    let v = m | 0;
    if (v < 0) v = 0; else if (v > 59) v = 59;
    return v;
}

export function createTimePicker(options = {}) {
    checkOptions("createTimePicker", options, OPTION_KEYS);
    const {
        value: valueOpt,
        defaultValue = null,
        onValueChange,
        hour12: hour12Opt,
        minuteStep = 1,
        hourStep = 1,
        ariaLabel = "Time",
        ariaLabelHour = "Hour",
        ariaLabelMinute = "Minute",
        ariaLabelMeridiem = "AM/PM",
        typeaheadTimeout = 900,
    } = options;

    // Resolve clock convention ONCE (never per event).
    const _hour12 = _resolveHour12(hour12Opt);
    const _minuteStep = (typeof minuteStep === "number" && minuteStep >= 1) ? (minuteStep | 0) : 1;
    const _hourStep = (typeof hourStep === "number" && hourStep >= 1) ? (hourStep | 0) : 1;

    // Seed initial value.
    let _seedH = 0, _seedM = 0;
    if (defaultValue && typeof defaultValue === "object") {
        _seedH = _normHour(defaultValue.hour);
        _seedM = _normMinute(defaultValue.minute);
    }

    // `let`: destroy() seals these (H-12) -- pooled nodes go back to the
    // registry, reads freeze at the final value. Accessors resolve the binding
    // at call time, so the swap costs the live paths nothing.
    let _hourSig = signal(_seedH);
    let _minuteSig = signal(_seedM);

    // Controlled mode: a caller-supplied {hour,minute} signal. When present it
    // is the source of truth (never sealed -- it is the consumer's state).
    const _externalValue = valueOpt || null;
    function readH() {
        if (_externalValue) { const v = _externalValue(); return v ? _normHour(v.hour) : 0; }
        return _hourSig();
    }
    function readM() {
        if (_externalValue) { const v = _externalValue(); return v ? _normMinute(v.minute) : 0; }
        return _minuteSig();
    }
    function writeValue(h, m, reason) {
        const nh = _normHour(h), nm = _normMinute(m);
        if (_externalValue && typeof _externalValue.set === "function") {
            _externalValue.set({ hour: nh, minute: nm });
        } else {
            if (_hourSig.peek() !== nh) _hourSig.set(nh);
            if (_minuteSig.peek() !== nm) _minuteSig.set(nm);
        }
        if (onValueChange) {
            try { onValueChange({ hour: nh, minute: nm }, reason || "set"); } catch (err) {
                try { console.error("lite-time-picker: onValueChange threw:", err); } catch (_) {}
            }
        }
    }

    // ---- display helpers (12/24 aware) ----------------------------------
    // Displayed hour in 12h mode: 1..12 (0 -> 12). In 24h mode: 0..23.
    function _dispHour(h24) {
        if (!_hour12) return h24;
        const h = h24 % 12;
        return h === 0 ? 12 : h;
    }
    function _isPM(h24) { return h24 >= 12; }
    function _hourValueText(h24) {
        return _hour12 ? String(_dispHour(h24)) : _pad2(h24);
    }

    // ---- segment registry -----------------------------------------------
    let _hourEl = null;
    let _minuteEl = null;
    let _meridiemEl = null;
    let _destroyed = false;

    // Cleanup ledger: every attach* registers its off() closure here so
    // destroy() can run them all (unwiring listeners + roles from consumer
    // elements), even the ones the consumer never called by hand. Each off is
    // wrapped in try/catch at destroy time so one throwing cleanup cannot
    // strand the rest (suite convention: swallow on teardown). An off pulls
    // itself from the ledger when invoked, so a direct consumer call + the
    // destroy sweep never double-run the same closure.
    const _cleanups = [];
    function _register(off) {
        _cleanups.push(off);
        return () => {
            const i = _cleanups.indexOf(off);
            if (i >= 0) _cleanups.splice(i, 1);
            off();
        };
    }

    // typeahead accumulation buffer (per-segment), reused -- one small object,
    // not allocated per keystroke.
    const _ta = { seg: null, buf: "", at: 0 };
    function _taPush(seg, digit, max) {
        const now = Date.now();
        if (_ta.seg !== seg || (now - _ta.at) > typeaheadTimeout) _ta.buf = "";
        _ta.seg = seg;
        _ta.at = now;
        let next = _ta.buf + digit;
        // Never accumulate beyond the width of `max`; drop the oldest digit.
        while (next.length > String(max).length) next = next.slice(1);
        let n = parseInt(next, 10);
        if (!Number.isFinite(n)) n = 0;
        // If the running number already exceeds max, restart from this digit.
        if (n > max) { next = digit; n = parseInt(next, 10); }
        _ta.buf = next;
        return n;
    }

    // ---- public spin / set ----------------------------------------------
    function spinHour(delta) {
        if (_destroyed) return;
        const h = readH();
        let nh = (h + delta * _hourStep) % 24;
        if (nh < 0) nh += 24;
        writeValue(nh, readM(), "spin");
    }
    function spinMinute(delta) {
        if (_destroyed) return;
        const m = readM();
        let nm = (m + delta * _minuteStep) % 60;
        if (nm < 0) nm += 60;
        writeValue(readH(), nm, "spin");
    }
    function toggleMeridiem(reason) {
        if (_destroyed || !_hour12) return;
        const h = readH();
        writeValue(_isPM(h) ? h - 12 : h + 12, readM(), reason || "meridiem");
    }
    function setHour24(h24, reason) { if (!_destroyed) writeValue(h24, readM(), reason || "set"); }
    function setMinute(m, reason)   { if (!_destroyed) writeValue(readH(), m, reason || "set"); }
    // Set the 12h-DISPLAY hour (1..12), preserving the current meridiem.
    function _setDisplayHour(disp, reason) {
        if (!_hour12) { setHour24(disp, reason); return; }
        let d = disp % 12;               // 12 -> 0
        const h24 = _isPM(readH()) ? d + 12 : d;
        writeValue(h24, readM(), reason || "set");
    }
    function setValue(v, reason) {
        if (_destroyed || !v || typeof v !== "object") return;
        writeValue(_normHour(v.hour), _normMinute(v.minute), reason || "api");
    }

    // ---- reflection effect ----------------------------------------------
    // One effect repaints every attached segment. Reads _hour/_minute; the
    // dirty-checked setAttr helpers skip writes when the DOM already matches.
    const stopPaint = effect(() => {
        const h = readH();
        const m = readM();
        if (_hourEl) {
            setAttr(_hourEl, "aria-valuenow", String(_dispHour(h)));
            setAttr(_hourEl, "aria-valuetext", _hourValueText(h));
            setAttr(_hourEl, "data-hour", _pad2(h));
        }
        if (_minuteEl) {
            setAttr(_minuteEl, "aria-valuenow", String(m));
            setAttr(_minuteEl, "aria-valuetext", _pad2(m));
            setAttr(_minuteEl, "data-minute", _pad2(m));
        }
        if (_meridiemEl) {
            const pm = _isPM(h);
            setAttr(_meridiemEl, "aria-valuenow", pm ? "1" : "0");
            setAttr(_meridiemEl, "aria-valuetext", pm ? "PM" : "AM");
            setAttr(_meridiemEl, "data-meridiem", pm ? "PM" : "AM");
        }
    });

    // ---- attach segments ------------------------------------------------
    function _wireSpinButton(el, opts) {
        setAttr(el, "role", "spinbutton");
        setAttr(el, "aria-label", opts.label);
        setAttr(el, "aria-valuemin", String(opts.min));
        setAttr(el, "aria-valuemax", String(opts.max));
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

        const onKey = (e) => {
            if (_destroyed) return;
            const k = e.key;
            if (k === "ArrowUp")        { e.preventDefault(); opts.spin(1); }
            else if (k === "ArrowDown") { e.preventDefault(); opts.spin(-1); }
            else if (k === "Home" && opts.home !== undefined) { e.preventDefault(); opts.setDisp(opts.home); }
            else if (k === "End" && opts.end !== undefined)   { e.preventDefault(); opts.setDisp(opts.end); }
            else if (opts.onDigit && k.length === 1 && k >= "0" && k <= "9") {
                e.preventDefault();
                opts.onDigit(k);
            } else if (opts.onAlpha && k.length === 1) {
                opts.onAlpha(k.toLowerCase(), e);
            }
        };
        el.addEventListener("keydown", onKey);
        return () => {
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("role");
            el.removeAttribute("aria-label");
            el.removeAttribute("aria-valuemin");
            el.removeAttribute("aria-valuemax");
            el.removeAttribute("aria-valuenow");
            el.removeAttribute("aria-valuetext");
        };
    }

    function attachHourSegment(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-time-hour");
        _hourEl = el;
        const min = _hour12 ? 1 : 0;
        const max = _hour12 ? 12 : 23;
        const inner = _wireSpinButton(el, {
            label: ariaLabelHour, min, max,
            spin: spinHour,
            home: min, end: max,
            setDisp: (d) => _setDisplayHour(d, "home-end"),
            onDigit: (digit) => {
                const n = _taPush("hour", digit, max);
                // Clamp typed value into the valid display range before applying.
                let disp = n < min ? min : n;
                _setDisplayHour(disp, "typeahead");
            },
        });
        // seed the reflected values immediately
        const h = readH();
        setAttr(el, "aria-valuenow", String(_dispHour(h)));
        setAttr(el, "aria-valuetext", _hourValueText(h));
        setAttr(el, "data-hour", _pad2(h));
        const off = () => { inner(); el.removeAttribute("data-hour"); if (_hourEl === el) _hourEl = null; };
        return _register(off);
    }

    function attachMinuteSegment(el) {
        if (!el || _destroyed) return noop;
        ensureId(el, "lh-time-minute");
        _minuteEl = el;
        const inner = _wireSpinButton(el, {
            label: ariaLabelMinute, min: 0, max: 59,
            spin: spinMinute,
            home: 0, end: 59,
            setDisp: (d) => setMinute(d, "home-end"),
            onDigit: (digit) => {
                const n = _taPush("minute", digit, 59);
                setMinute(n, "typeahead");
            },
        });
        const m = readM();
        setAttr(el, "aria-valuenow", String(m));
        setAttr(el, "aria-valuetext", _pad2(m));
        setAttr(el, "data-minute", _pad2(m));
        const off = () => { inner(); el.removeAttribute("data-minute"); if (_minuteEl === el) _minuteEl = null; };
        return _register(off);
    }

    function attachMeridiem(el) {
        if (!el || _destroyed || !_hour12) return noop;
        ensureId(el, "lh-time-meridiem");
        _meridiemEl = el;
        const inner = _wireSpinButton(el, {
            label: ariaLabelMeridiem, min: 0, max: 1,
            spin: () => toggleMeridiem("spin"),
            onAlpha: (ch, e) => {
                if (ch === "a") { e.preventDefault(); if (_isPM(readH())) toggleMeridiem("typeahead"); }
                else if (ch === "p") { e.preventDefault(); if (!_isPM(readH())) toggleMeridiem("typeahead"); }
            },
        });
        const pm = _isPM(readH());
        setAttr(el, "aria-valuenow", pm ? "1" : "0");
        setAttr(el, "aria-valuetext", pm ? "PM" : "AM");
        setAttr(el, "data-meridiem", pm ? "PM" : "AM");
        const off = () => { inner(); el.removeAttribute("data-meridiem"); if (_meridiemEl === el) _meridiemEl = null; };
        return _register(off);
    }

    // ---- optional listbox slot mode -------------------------------------
    let _slotListEl = null;
    const _slots = [];   // { el, hour, minute, onClick }

    const stopSlotReflect = effect(() => {
        const h = readH();
        const m = readM();
        for (let i = 0; i < _slots.length; i++) {
            const s = _slots[i];
            const sel = s.hour === h && s.minute === m;
            setAttr(s.el, "aria-selected", sel ? "true" : "false");
            toggleAttr(s.el, "data-selected", sel);
        }
    });

    function attachSlotList(el) {
        if (!el || _destroyed) return noop;
        _slotListEl = el;
        setAttr(el, "role", "listbox");
        setAttr(el, "aria-label", ariaLabel);
        return _register(() => {
            el.removeAttribute("role");
            el.removeAttribute("aria-label");
            if (_slotListEl === el) _slotListEl = null;
        });
    }

    function attachSlot(el, meta) {
        if (!el || _destroyed || !meta) return noop;
        const hour = _normHour(meta.hour);
        const minute = _normMinute(meta.minute);
        ensureId(el, "lh-time-slot");
        setAttr(el, "role", "option");
        const entry = { el, hour, minute };
        _slots.push(entry);
        const sel = hour === readH() && minute === readM();
        setAttr(el, "aria-selected", sel ? "true" : "false");
        toggleAttr(el, "data-selected", sel);
        const onClick = (e) => { e.preventDefault(); writeValue(hour, minute, "slot"); };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute("role");
            el.removeAttribute("aria-selected");
            el.removeAttribute("data-selected");
            const idx = _slots.indexOf(entry);
            if (idx >= 0) _slots.splice(idx, 1);
        };
        return _register(off);
    }

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        // Run every registered attach cleanup (unwire listeners + roles from
        // consumer elements), each guarded so a throwing off cannot strand the
        // rest. Iterate a snapshot + clear the ledger so the self-splicing off
        // closures cannot mutate the array mid-sweep.
        const pending = _cleanups.slice();
        _cleanups.length = 0;
        for (let i = 0; i < pending.length; i++) {
            try { pending[i](); } catch (_) { /* swallow on teardown */ }
        }
        _hourEl = null;
        _minuteEl = null;
        _meridiemEl = null;
        _slotListEl = null;
        _slots.length = 0;
        stopPaint();
        stopSlotReflect();
        // return the pooled signal nodes after every effect stopped; reads
        // freeze at the final value (H-12)
        _hourSig = sealSignal(_hourSig);
        _minuteSig = sealSignal(_minuteSig);
    }

    return {
        // reactive reads
        hour: () => readH(),
        minute: () => readM(),
        meridiem: () => (_isPM(readH()) ? "PM" : "AM"),
        value: () => ({ hour: readH(), minute: readM() }),
        hour12: _hour12,
        // control
        setValue,
        setHour: setHour24,
        setMinute,
        spinHour,
        spinMinute,
        toggleMeridiem,
        // attach
        attachHourSegment,
        attachMinuteSegment,
        attachMeridiem,
        attachSlotList,
        attachSlot,
        destroy,
        get destroyed() { return _destroyed; },
    };
}
