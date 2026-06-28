// @zakkster/lite-headless / form-field / element.js
//
// <lite-form-field>:
//
//   <lite-form-field required>
//       <label data-ff-label>Email</label>
//       <input  data-ff-control type="email">
//       <p      data-ff-helper>We won't share your email.</p>
//       <p      data-ff-error></p>
//   </lite-form-field>
//
// host.setValid(false, "Required")
// host.setRequired(true)
// host.reset()
// host.valid / .errorMessage / .required / .touched (accessors)
//
// Events: validchange { detail: { valid, errorMessage } }, touch {}

import { define } from "@zakkster/lite-element";
import { createFormField } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const el = host.querySelector(sel);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-form-field", (host, scope) => {
    const ff = createFormField({
        defaultRequired: host.hasAttribute("required"),
        defaultValid: !host.hasAttribute("invalid"),
        defaultErrorMessage: host.getAttribute("error") || null,
        showErrorsBeforeTouched: host.hasAttribute("show-errors-immediately"),
        onValidChange: (valid, errorMessage) => {
            host.dispatchEvent(new CustomEvent("validchange", {
                detail: { valid, errorMessage }, bubbles: true,
            }));
        },
        onTouch: () => {
            host.dispatchEvent(new CustomEvent("touch", { bubbles: true }));
        },
    });

    ff.attachRoot(host);

    const _attached = {
        label: null, labelOff: null,
        control: null, controlOff: null,
        helper: null, helperOff: null,
        errorEl: null, errorOff: null,
    };

    function syncSlots() {
        const lbl    = scopedQuery(host, "[data-ff-label]");
        const ctrl   = scopedQuery(host, "[data-ff-control]");
        const helper = scopedQuery(host, "[data-ff-helper]");
        const errEl  = scopedQuery(host, "[data-ff-error]");
        // Re-attach if identity changed.
        if (lbl !== _attached.label) {
            if (_attached.labelOff) _attached.labelOff();
            _attached.label = lbl;
            _attached.labelOff = lbl ? ff.attachLabel(lbl) : null;
        }
        if (ctrl !== _attached.control) {
            if (_attached.controlOff) _attached.controlOff();
            _attached.control = ctrl;
            _attached.controlOff = ctrl ? ff.attachControl(ctrl) : null;
        }
        if (helper !== _attached.helper) {
            if (_attached.helperOff) _attached.helperOff();
            _attached.helper = helper;
            _attached.helperOff = helper ? ff.attachHelperText(helper) : null;
        }
        if (errEl !== _attached.errorEl) {
            if (_attached.errorOff) _attached.errorOff();
            _attached.errorEl = errEl;
            _attached.errorOff = errEl ? ff.attachErrorText(errEl) : null;
        }
    }
    syncSlots();

    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attribute: required + invalid + error.
    let _suppressAttr = false;
    // Iterate records so a `required` change doesn't also re-evaluate
    // the invalid/error path (and vice versa). Each branch is
    // independent; the validity flip needs both `invalid` and `error`
    // because they cooperate.
    const attrMo = new MutationObserver((muts) => {
        if (_suppressAttr) return;
        let touchValidity = false;
        for (let i = 0; i < muts.length; i++) {
            const name = muts[i].attributeName;
            if (name === "required") {
                ff.setRequired(host.hasAttribute("required"));
            } else if (name === "invalid" || name === "error") {
                touchValidity = true;
            }
        }
        if (touchValidity) {
            const errAttr = host.getAttribute("error");
            if (host.hasAttribute("invalid") || errAttr) {
                ff.setValid(false, errAttr || ff.errorMessage() || "Invalid");
            } else {
                ff.setValid(true);
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["required", "invalid", "error"] });

    host._formFieldInstance = ff;
    host.setValid    = (v, m) => ff.setValid(v, m);
    host.setRequired = (r) => ff.setRequired(r);
    host.setTouched  = (t) => ff.setTouched(t);
    host.reset       = () => ff.reset();
    Object.defineProperty(host, "valid",        { get: () => ff.valid(),        configurable: true });
    Object.defineProperty(host, "errorMessage", { get: () => ff.errorMessage(), configurable: true });
    Object.defineProperty(host, "required",     { get: () => ff.required(),     configurable: true });
    Object.defineProperty(host, "touched",      { get: () => ff.touched(),      configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        if (_attached.labelOff)   _attached.labelOff();
        if (_attached.controlOff) _attached.controlOff();
        if (_attached.helperOff)  _attached.helperOff();
        if (_attached.errorOff)   _attached.errorOff();
        ff.destroy();
    });
});
