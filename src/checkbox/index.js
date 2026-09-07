// @zakkster/lite-headless / checkbox
//
// Tri-state checkbox with WAI-ARIA `role="checkbox"` semantics. Distinct from
// switch: a checkbox is a selection-state form control ("agree to terms",
// "select rows") that also supports the INDETERMINATE (mixed) state a switch
// never has. Where a switch is a boolean instant-commit toggle, a checkbox
// carries three states and is the building block of a checkbox group.
//
// WAI-ARIA APG: https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/
//
// TRI-STATE MODEL (ADR 0008 ruling 2). ONE 3-valued signal `_state` in
// {"true","false","mixed"}. Those three tokens ARE the aria-checked values, so
// the paint effect writes `aria-checked = _state()` with NO mapping branch. A
// single source of truth means the derived booleans (checked / indeterminate)
// can never disagree with the painted attribute -- the whole reason to reject
// the boolean-checked + boolean-indeterminate pair, which can be set to the
// incoherent (checked:true, indeterminate:true) combination.
//
// API
//
//   createCheckbox({
//       defaultChecked?:       false,
//       defaultIndeterminate?: false,   // seeds "mixed" (wins over defaultChecked)
//       disabled?:             false,
//       required?:             false,
//       onChange?:             (checked, reason) => void,   // checked is a bool
//   })
//
//   attachRoot(el)     // role=checkbox, listeners, ARIA + data-* painting
//   attachLabel(el)    // aria-labelledby auto-wired; click on label toggles
//   attachInput(el)    // optional native checkbox for form submission
//
//   checked()          -> boolean (_state() === "true")
//   indeterminate()    -> boolean (_state() === "mixed")
//   disabled()         -> boolean
//   setChecked(bool, reason?)         // clears mixed
//   setIndeterminate(bool, reason?)   // true -> "mixed"; false -> resolve
//   toggle(reason?)                   // APG: mixed/false -> true, true -> false
//   setDisabled(bool)
//   destroy()
//
// CSS CONTRACT (docs/CSS_CONTRACT.md taxonomy)
//
//   Root gets:
//     aria-checked="true|false|mixed"   -- painted straight from _state
//     data-checked                      -- present when checked (_state true)
//     data-indeterminate                -- present when mixed
//     data-disabled                     -- present when disabled
//     aria-disabled="true"              -- when disabled
//     aria-required="true"              -- when required
//
// KEYBOARD (per ARIA APG)
//
//   Space: toggle (indeterminate -> checked on user toggle)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { sealSignal } from "../_overlay/seal.js";
import { setAttr, toggleAttr, uniqueId } from "../_overlay/aria.js";
import { checkOptions } from "../_validate.js";

const OPTION_KEYS = "defaultChecked|defaultIndeterminate|disabled|required|onChange";

const noop = () => {};
function removeAttr(el, name) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
}

export function createCheckbox(options = {}) {
    checkOptions("createCheckbox", options, OPTION_KEYS);
    const {
        defaultChecked = false,
        defaultIndeterminate = false,
        disabled: initiallyDisabled = false,
        required = false,
        onChange,
    } = options;

    // ----- state -----------------------------------------------------
    // ONE 3-valued signal. The tokens ARE the aria-checked values.
    // `let`: destroy() seals these (H-12) -- pooled nodes go back to the
    // registry, reads freeze at the final value.
    const seed = defaultIndeterminate ? "mixed" : (defaultChecked ? "true" : "false");
    let _state = makeSignal(seed);
    let _disabled = makeSignal(!!initiallyDisabled);
    let _destroyed = false;
    let _rootEl = null, _labelEl = null, _inputEl = null;
    const _detach = new Map();

    // ----- core mutators --------------------------------------------
    function _commit(next, reason) {
        if (_destroyed) return false;
        if (_disabled()) return false;
        if (next === _state()) return false;
        _state.set(next);
        if (_inputEl) {
            const isChecked = next === "true";
            if (_inputEl.checked !== isChecked) _inputEl.checked = isChecked;
            const isMixed = next === "mixed";
            if (_inputEl.indeterminate !== isMixed) _inputEl.indeterminate = isMixed;
        }
        if (onChange) {
            try { onChange(next === "true", reason || "set"); } catch { /* swallow */ }
        }
        return true;
    }

    function setChecked(v, reason) {
        return _commit(v ? "true" : "false", reason || "set");
    }
    function setIndeterminate(v, reason) {
        if (v) return _commit("mixed", reason || "set");
        // Clearing mixed resolves to unchecked (single-signal has no hidden
        // checked to restore); a non-mixed state is left untouched.
        if (_state() === "mixed") return _commit("false", reason || "set");
        return false;
    }
    function toggle(reason) {
        // APG: mixed -> true, false -> true, true -> false.
        return _commit(_state() === "true" ? "false" : "true", reason || "toggle");
    }
    function setDisabled(flag) {
        const v = !!flag;
        if (_disabled() === v) return;
        _disabled.set(v);
    }

    // ----- ARIA + data-attr paint ------------------------------------
    // Single effect reading both signals. aria-checked is painted STRAIGHT
    // from _state (no mapping branch). With no root attached the effect reads
    // the signals but crosses no DOM (E10 engine window drives exactly this).
    const stopPaint = effect(() => {
        const s = _state();
        const d = _disabled();
        if (_rootEl) {
            setAttr(_rootEl, "aria-checked", s);
            toggleAttr(_rootEl, "data-checked", s === "true");
            toggleAttr(_rootEl, "data-indeterminate", s === "mixed");
            if (d) setAttr(_rootEl, "aria-disabled", "true");
            else   removeAttr(_rootEl, "aria-disabled");
            toggleAttr(_rootEl, "data-disabled", d);
        }
        if (_inputEl) {
            const isChecked = s === "true";
            if (_inputEl.checked !== isChecked) _inputEl.checked = isChecked;
            const isMixed = s === "mixed";
            if (_inputEl.indeterminate !== isMixed) _inputEl.indeterminate = isMixed;
            if (_inputEl.disabled !== d) _inputEl.disabled = d;
        }
    });

    // ----- attachRoot -----------------------------------------------
    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _rootEl = el;
        if (!el.id) el.id = uniqueId("lh-checkbox");
        setAttr(el, "role", "checkbox");
        // Paint the current state immediately (the effect only re-fires on a
        // signal change; without this the initial attributes would be missing
        // until the first toggle).
        const s = _state();
        setAttr(el, "aria-checked", s);
        toggleAttr(el, "data-checked", s === "true");
        toggleAttr(el, "data-indeterminate", s === "mixed");
        if (_disabled()) {
            setAttr(el, "aria-disabled", "true");
            toggleAttr(el, "data-disabled", true);
        }
        if (required) setAttr(el, "aria-required", "true");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "0");

        const onClick = (e) => {
            if (_disabled()) return;
            if (_inputEl && (e.target === _inputEl || _inputEl.contains(e.target))) return;
            e.preventDefault();
            toggle("click");
        };
        const onKey = (e) => {
            if (_disabled()) return;
            if (e.key === " " || e.key === "Spacebar") {
                e.preventDefault();
                toggle("keyboard");
            }
        };
        el.addEventListener("click", onClick);
        el.addEventListener("keydown", onKey);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            removeAttr(el, "role");
            removeAttr(el, "aria-checked");
            removeAttr(el, "aria-disabled");
            removeAttr(el, "aria-required");
            removeAttr(el, "data-checked");
            removeAttr(el, "data-indeterminate");
            removeAttr(el, "data-disabled");
            if (_rootEl === el) _rootEl = null;
        };
        _detach.set("root", off);
        return off;
    }

    // ----- attachLabel ----------------------------------------------
    function attachLabel(el) {
        if (!el || _destroyed) return noop;
        _labelEl = el;
        if (!el.id) el.id = uniqueId("lh-checkbox-label");
        if (_rootEl) setAttr(_rootEl, "aria-labelledby", el.id);
        const onClick = (e) => {
            if (_disabled()) return;
            if (_rootEl && el.contains(_rootEl)) return;   // wrapping label -> avoid double
            e.preventDefault();
            toggle("label-click");
            if (_rootEl) { try { _rootEl.focus(); } catch { /* may not be focusable */ } }
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

    // ----- attachInput (form integration) ----------------------------
    function attachInput(el) {
        if (!el || _destroyed) return noop;
        _inputEl = el;
        if (el.type !== "checkbox") {
            try { el.type = "checkbox"; } catch { /* readonly in old envs */ }
        }
        const s = _state();
        el.checked = s === "true";
        el.indeterminate = s === "mixed";
        el.disabled = _disabled();
        if (required) el.required = true;
        const onNativeChange = () => {
            if (_disabled()) return;
            setChecked(el.checked, "input-change");
        };
        el.addEventListener("change", onNativeChange);
        const off = () => {
            el.removeEventListener("change", onNativeChange);
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
        _rootEl = null; _labelEl = null; _inputEl = null;
        // return the pooled signal nodes after every effect stopped; reads
        // freeze at the final value (H-12)
        _state = sealSignal(_state);
        _disabled = sealSignal(_disabled);
    }

    return {
        // reactive
        checked: () => _state() === "true",
        indeterminate: () => _state() === "mixed",
        disabled: () => _disabled(),
        // imperative
        setChecked, setIndeterminate, toggle, setDisabled,
        // attachments
        attachRoot, attachLabel, attachInput,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        // introspection (handy for tests + the DOM-free torture drive)
        _state: () => _state(),
    };
}
