// @zakkster/lite-headless / switch
//
// Boolean toggle control with WAI-ARIA switch semantics. Distinct
// from a checkbox: visually a sliding switch (consumer-styled),
// semantically role="switch" + aria-checked. Best for instant-
// commit settings ("Enable notifications", "Dark mode") rather
// than form fields that require submission.
//
// WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/patterns/switch/
//
// API
//
//   createSwitch({
//       defaultChecked?: false,
//       checked?:        Signal<boolean>,   // controlled mode
//       disabled?:       false,
//       required?:       false,
//       onChange?:       (checked, reason) => void,
//   })
//
//   attachRoot(el)     // role=switch, listeners, ARIA painting
//   attachLabel(el)    // aria-labelledby auto-wired; click on label toggles
//   attachThumb(el)    // optional visual thumb (gets data-checked attr)
//   attachInput(el)    // optional native checkbox for form submission
//
//   isChecked() / disabled()    // reactive accessors
//   toggle(reason?)
//   setChecked(bool, reason?)
//   setDisabled(bool)
//   destroy()
//
// CSS CONTRACT
//
// Root gets:
//   data-checked="true|false"     -- bound to state
//   data-disabled                 -- when disabled
//   data-pressed                  -- pointer down (active state)
//
// Thumb (if attached) gets the same attrs so consumer CSS can style
// the thumb independently of the root.
//
// KEYBOARD (per ARIA APG)
//
//   Space: toggle
//   Enter: toggle (note: ARIA APG says Enter is OPTIONAL but
//          widely-expected behavior so we include it)
//
// CONTROLLED VS UNCONTROLLED
//
// Pass `checked: signal()` to control externally; the primitive
// reads from it and never mutates it (caller decides whether to
// update on the change callback). Without `checked`, the primitive
// owns an internal signal seeded from `defaultChecked`.
//
// FORM INTEGRATION
//
// `attachInput(el)` accepts a native <input type="checkbox">
// (typically visually-hidden) which the primitive keeps synced
// for native form submission. The native input also serves as the
// fallback if JS fails to load.
//
// REASON STRINGS for onChange/dispatched events:
//   "click", "keyboard", "set", "toggle", "label-click", "input-change"

import { signal as makeSignal, effect } from "@zakkster/lite-signal";

const noop = () => {};
let _idCounter = 0;
const uniqueId = (prefix) => `${prefix}-${++_idCounter}`;
function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createSwitch(options = {}) {
    const {
        defaultChecked = false,
        checked: externalChecked,
        disabled: initiallyDisabled = false,
        required = false,
        onChange,
    } = options;

    // ----- state -----------------------------------------------------
    // Controlled vs uncontrolled: if the consumer passes a signal
    // we read from it; otherwise we own one.
    const _own = externalChecked ? null : makeSignal(!!defaultChecked);
    function _read() { return externalChecked ? !!externalChecked() : _own(); }
    function _write(v) {
        if (externalChecked) {
            // controlled: don't mutate; the consumer is expected to
            // update their signal in response to onChange.
            return;
        }
        _own.set(!!v);
    }

    const _disabled = makeSignal(!!initiallyDisabled);
    let _destroyed = false;
    let _rootEl = null, _labelEl = null, _thumbEl = null, _inputEl = null;
    const _detach = new Map();

    // ----- core setChecked ------------------------------------------
    function setChecked(next, reason) {
        if (_destroyed) return false;
        if (_disabled()) return false;
        const v = !!next;
        const prev = _read();
        if (v === prev) return false;
        _write(v);
        if (_inputEl) {
            // Keep native input in sync. Don't fire its change event
            // (we own the change semantics).
            if (_inputEl.checked !== v) _inputEl.checked = v;
        }
        if (onChange) {
            try { onChange(v, reason || "set"); } catch { /* swallow */ }
        }
        return true;
    }
    function toggle(reason) {
        return setChecked(!_read(), reason || "toggle");
    }
    function setDisabled(flag) {
        const v = !!flag;
        if (_disabled() === v) return;
        _disabled.set(v);
    }

    // ----- ARIA + data-attr paint ------------------------------------
    // Single effect that reads both signals and writes to all attached
    // elements. Each effect read is reactive, so when either signal
    // changes, the effect re-runs and re-paints. The early-bail by
    // attribute comparison (setAttr) means stable values don't
    // produce DOM writes.
    const stopPaint = effect(() => {
        const v = _read();
        const d = _disabled();
        for (const el of [_rootEl, _thumbEl]) {
            if (!el) continue;
            setAttr(el, "data-checked", v ? "true" : "false");
            if (d) setAttr(el, "data-disabled", "");
            else   removeAttr(el, "data-disabled");
        }
        if (_rootEl) {
            setAttr(_rootEl, "aria-checked", v ? "true" : "false");
            if (d) setAttr(_rootEl, "aria-disabled", "true");
            else   removeAttr(_rootEl, "aria-disabled");
        }
        if (_inputEl && _inputEl.checked !== v) _inputEl.checked = v;
        if (_inputEl && _inputEl.disabled !== d) _inputEl.disabled = d;
    });

    // ----- attachRoot -----------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        if (!el.id) el.id = uniqueId("lh-switch");
        setAttr(el, "role", "switch");
        setAttr(el, "aria-checked", _read() ? "true" : "false");
        // Apply current data-* state immediately. The paint effect
        // already ran during construction with no root attached --
        // calling it again only fires if a signal changes. Without
        // this explicit paint, the initial data-checked attribute
        // would be missing until the first toggle.
        setAttr(el, "data-checked", _read() ? "true" : "false");
        if (_disabled()) {
            setAttr(el, "aria-disabled", "true");
            setAttr(el, "data-disabled", "");
        }
        if (required) setAttr(el, "aria-required", "true");
        // tabindex: focusable unless already set by consumer
        if (!el.hasAttribute("tabindex")) {
            setAttr(el, "tabindex", "0");
        }
        // If the root is itself a <button>, the consumer may have set
        // type="button" already. If not, this is intentional -- the
        // root is typically a <button> for native keyboard semantics,
        // but the primitive doesn't enforce.

        const onClick = (e) => {
            if (_disabled()) return;
            // If the click came from a child <input> that we manage,
            // skip our own toggle -- the input's change event will
            // drive the update via _onInputChange. (Without this,
            // clicking a wrapping label would toggle twice.)
            if (_inputEl && (e.target === _inputEl || _inputEl.contains(e.target))) {
                return;
            }
            e.preventDefault();
            toggle("click");
        };
        const onKey = (e) => {
            if (_disabled()) return;
            if (e.key === " " || e.key === "Spacebar" || e.key === "Enter") {
                e.preventDefault();
                toggle("keyboard");
            }
        };
        const onPointerDown = () => {
            if (_disabled()) return;
            setAttr(_rootEl, "data-pressed", "");
        };
        const onPointerUp = () => {
            removeAttr(_rootEl, "data-pressed");
        };
        const onPointerLeave = () => {
            removeAttr(_rootEl, "data-pressed");
        };

        el.addEventListener("click",       onClick);
        el.addEventListener("keydown",     onKey);
        el.addEventListener("pointerdown", onPointerDown);
        el.addEventListener("pointerup",   onPointerUp);
        el.addEventListener("pointerleave",onPointerLeave);
        el.addEventListener("pointercancel", onPointerUp);

        const off = () => {
            el.removeEventListener("click",       onClick);
            el.removeEventListener("keydown",     onKey);
            el.removeEventListener("pointerdown", onPointerDown);
            el.removeEventListener("pointerup",   onPointerUp);
            el.removeEventListener("pointerleave",onPointerLeave);
            el.removeEventListener("pointercancel", onPointerUp);
            removeAttr(el, "role");
            removeAttr(el, "aria-checked");
            removeAttr(el, "aria-disabled");
            removeAttr(el, "aria-required");
            removeAttr(el, "data-checked");
            removeAttr(el, "data-disabled");
            removeAttr(el, "data-pressed");
            if (_rootEl === el) _rootEl = null;
        };
        _detach.set("root", off);
        return off;
    }

    // ----- attachLabel ----------------------------------------------
    function attachLabel(el) {
        if (!el || _destroyed) return noop;
        _labelEl = el;
        if (!el.id) el.id = uniqueId("lh-switch-label");
        if (_rootEl) setAttr(_rootEl, "aria-labelledby", el.id);
        const onClick = (e) => {
            if (_disabled()) return;
            // If label wraps the root, the root's click handler will
            // also fire via bubbling -- we'd toggle twice. Skip in
            // that case.
            if (_rootEl && el.contains(_rootEl)) return;
            e.preventDefault();
            toggle("label-click");
            // Focus the root for keyboard accessibility (clicking a
            // standalone label that's NOT wrapping the root)
            if (_rootEl) {
                try { _rootEl.focus(); } catch { /* may not be focusable */ }
            }
        };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            if (_rootEl) removeAttr(_rootEl, "aria-labelledby");
            if (_labelEl === el) _labelEl = null;
        };
        _detach.set("label", off);
        return off;
    }

    // ----- attachThumb ----------------------------------------------
    function attachThumb(el) {
        if (!el || _destroyed) return noop;
        _thumbEl = el;
        setAttr(el, "data-checked", _read() ? "true" : "false");
        if (_disabled()) setAttr(el, "data-disabled", "");
        // Thumb is purely visual; no listeners on it.
        const off = () => {
            removeAttr(el, "data-checked");
            removeAttr(el, "data-disabled");
            if (_thumbEl === el) _thumbEl = null;
        };
        _detach.set("thumb", off);
        return off;
    }

    // ----- attachInput (form integration) ----------------------------
    function attachInput(el) {
        if (!el || _destroyed) return noop;
        _inputEl = el;
        // Set up the native input
        if (el.type !== "checkbox") {
            // Permissive: warn but try to work anyway
            try { el.type = "checkbox"; } catch { /* readonly in old envs */ }
        }
        el.checked  = _read();
        el.disabled = _disabled();
        if (required) el.required = true;
        // Sync from native input back to primitive (handles cases
        // where the native input is interacted with directly via
        // browser autofill, password managers, or accessibility tools).
        const onChange = () => {
            if (_disabled()) return;
            setChecked(el.checked, "input-change");
        };
        el.addEventListener("change", onChange);
        const off = () => {
            el.removeEventListener("change", onChange);
            if (_inputEl === el) _inputEl = null;
        };
        _detach.set("input", off);
        return off;
    }

    // ----- destroy ---------------------------------------------------
    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        stopPaint();
        for (const off of _detach.values()) { try { off(); } catch { /* swallow */ } }
        _detach.clear();
        _rootEl = null; _labelEl = null; _thumbEl = null; _inputEl = null;
    }

    return {
        // reactive
        isChecked: () => _read(),
        disabled:  () => _disabled(),
        // imperative
        toggle, setChecked, setDisabled,
        // attachments
        attachRoot, attachLabel, attachThumb, attachInput,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
