// @zakkster/lite-headless / form-field / index.js
//
// createFormField(options) -> FormFieldHandle
//
// Wrapper primitive that wires a label, control, helper text, and
// error message into a coherent ARIA pattern. Doesn't own the input
// value -- that's the consumer's (or a paired primitive's, like
// combobox/datepicker/switch). Owns:
//
//   - validity state (valid + errorMessage)
//   - required flag
//   - touched flag (true once the control has been blurred at least once;
//     used to delay error display until after user interaction)
//   - ARIA wiring: label[for] + control[id] + control[aria-describedby]
//     pointing at helper + error (when invalid) + control[aria-invalid]
//
// Painted attributes on the root element:
//   data-invalid     -- present when !valid
//   data-required    -- present when required
//   data-touched     -- present when the user has interacted
//
// Why a primitive: every admin form has 20+ of these. Doing the ARIA
// wiring by hand for each is error-prone (forgotten aria-describedby
// chains, mismatched ids, missing aria-invalid). This primitive does
// it once.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";

function noop() {}

export function createFormField(options = {}) {
    const {
        defaultValid = true,
        defaultErrorMessage = null,
        defaultRequired = false,
        defaultTouched = false,
        showErrorsBeforeTouched = false,
        onValidChange,
        onTouch,
    } = options;

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- state ---------------------------------------------------------

    const _valid = makeSignal(!!defaultValid);
    const _errorMessage = makeSignal(defaultErrorMessage);
    const _required = makeSignal(!!defaultRequired);
    const _touched = makeSignal(!!defaultTouched);

    // ----- public accessors ----------------------------------------------

    function valid()        { return _valid(); }
    function errorMessage() { return _errorMessage(); }
    function required()     { return _required(); }
    function touched()      { return _touched(); }

    // Derived: whether errors should be VISIBLY shown right now.
    function showsError() {
        if (_valid()) return false;
        if (showErrorsBeforeTouched) return true;
        return _touched();
    }

    function setValid(v, msg) {
        if (_destroyed) return;
        const wasValid = _valid();
        const nextValid = !!v;
        const nextMsg = msg == null ? null : String(msg);
        if (nextValid === wasValid && nextMsg === _errorMessage()) return;
        _valid.set(nextValid);
        _errorMessage.set(nextValid ? null : nextMsg);
        if (onValidChange) {
            try { onValidChange(nextValid, nextValid ? null : nextMsg); } catch {}
        }
    }

    function setRequired(r) {
        if (_destroyed) return;
        const next = !!r;
        if (next === _required()) return;
        _required.set(next);
    }

    function setTouched(t) {
        if (_destroyed) return;
        const next = !!t;
        if (next === _touched()) return;
        _touched.set(next);
        if (next && onTouch) {
            try { onTouch(); } catch {}
        }
    }

    function reset() {
        if (_destroyed) return;
        _valid.set(!!defaultValid);
        _errorMessage.set(defaultErrorMessage);
        _required.set(!!defaultRequired);
        _touched.set(!!defaultTouched);
    }

    // ----- registered elements -------------------------------------------

    let _root = null;
    let _label = null;
    let _control = null;
    let _helper = null;
    let _errorEl = null;

    // ----- attach helpers -------------------------------------------------

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _root = el;
        ensureId(el, "lh-ff");
        // Reactive paint of state flags on the root.
        const stop = effect(() => {
            toggleAttr(el, "data-invalid", !_valid());
            toggleAttr(el, "data-required", _required());
            toggleAttr(el, "data-touched", _touched());
            toggleAttr(el, "data-shows-error", showsError());
        });
        addCleanup(stop);
        const off = () => {
            stop();
            if (_root === el) {
                el.removeAttribute("data-invalid");
                el.removeAttribute("data-required");
                el.removeAttribute("data-touched");
                el.removeAttribute("data-shows-error");
                _root = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachLabel(el) {
        if (!el || _destroyed) return noop;
        _label = el;
        ensureId(el, "lh-ff-label");
        // If a control is already registered, wire label.for to control.id.
        if (_control) {
            el.setAttribute("for", _control.id);
        }
        // Reactive: append "*" treatment via [data-required]
        const stop = effect(() => {
            toggleAttr(el, "data-required", _required());
        });
        addCleanup(stop);
        const off = () => {
            stop();
            if (_label === el) {
                el.removeAttribute("for");
                el.removeAttribute("data-required");
                _label = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachControl(el) {
        if (!el || _destroyed) return noop;
        _control = el;
        ensureId(el, "lh-ff-control");
        // Back-wire to label if it was attached first.
        if (_label && !_label.getAttribute("for")) {
            _label.setAttribute("for", el.id);
        }

        // ARIA wiring: aria-invalid + aria-required + aria-describedby
        // for the helper text (error wiring lives in attachErrorText so
        // it picks up the right element identity regardless of attach
        // order).
        const stopAriaInvalid = effect(() => {
            const shown = showsError();
            setAttr(el, "aria-invalid", shown ? "true" : "false");
        });
        const stopAriaRequired = effect(() => {
            setAttr(el, "aria-required", _required() ? "true" : "false");
        });
        // Helper id stays in describedby as long as helper is present.
        // attachHelperText handles its own add/remove; we re-add here in
        // case it was attached before the control.
        if (_helper) addIdToken(el, "aria-describedby", _helper.id);
        addCleanup(stopAriaInvalid);
        addCleanup(stopAriaRequired);

        // Touch on blur (mark the field as interacted with).
        const onBlur = () => setTouched(true);
        el.addEventListener("blur", onBlur);

        const off = () => {
            stopAriaInvalid();
            stopAriaRequired();
            el.removeEventListener("blur", onBlur);
            if (_control === el) {
                el.removeAttribute("aria-invalid");
                el.removeAttribute("aria-required");
                if (_helper)  removeIdToken(el, "aria-describedby", _helper.id);
                if (_errorEl) removeIdToken(el, "aria-describedby", _errorEl.id);
                _control = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachHelperText(el) {
        if (!el || _destroyed) return noop;
        _helper = el;
        ensureId(el, "lh-ff-helper");
        // Wire into the control's describedby chain.
        if (_control) addIdToken(_control, "aria-describedby", el.id);
        const off = () => {
            if (_helper === el) {
                if (_control) removeIdToken(_control, "aria-describedby", el.id);
                _helper = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachErrorText(el) {
        if (!el || _destroyed) return noop;
        _errorEl = el;
        ensureId(el, "lh-ff-error");
        setAttr(el, "role", "alert");
        setAttr(el, "aria-live", "polite");
        // Reactive: textContent + data-hidden mirror the error state.
        const stopPaint = effect(() => {
            const msg = _errorMessage();
            const next = msg == null ? "" : msg;
            if (el.textContent !== next) el.textContent = next;
            toggleAttr(el, "data-hidden", !showsError());
        });
        // Reactive: add/remove this error element's id from the
        // control's aria-describedby based on showsError(). Re-reads
        // _control via closure so a control attached AFTER this error
        // element still gets wired (the consumer mutates _control via
        // attachControl which we don't observe directly; but the
        // showsError() read here makes the effect a subscriber to the
        // _valid/_touched signals, so as soon as those change after a
        // control attach, this effect re-runs).
        const stopDescribedBy = effect(() => {
            const shown = showsError();
            if (!_control) return;
            if (shown) addIdToken(_control, "aria-describedby", el.id);
            else       removeIdToken(_control, "aria-describedby", el.id);
        });
        addCleanup(stopPaint);
        addCleanup(stopDescribedBy);
        const off = () => {
            stopPaint();
            stopDescribedBy();
            if (_errorEl === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-live");
                el.removeAttribute("data-hidden");
                if (_control) removeIdToken(_control, "aria-describedby", el.id);
                _errorEl = null;
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
        _root = null;
        _label = null;
        _control = null;
        _helper = null;
        _errorEl = null;
    }

    return {
        // reactive
        valid, errorMessage, required, touched, showsError,
        // mutations
        setValid, setRequired, setTouched, reset,
        // attach
        attachRoot, attachLabel, attachControl,
        attachHelperText, attachErrorText,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
