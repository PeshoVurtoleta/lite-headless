// @zakkster/lite-headless / inline-edit / element.js
//
// <lite-inline-edit> wrapping createInlineEdit. Auto-attaches:
//   [data-inline-edit-display-slot] -> the display element
//   [data-inline-edit-input-slot]   -> the input element
//   [data-inline-edit-trigger-slot] -> optional explicit edit trigger
//
//   <lite-inline-edit value="Untitled" aria-label="Card title">
//       <span data-inline-edit-display-slot></span>
//       <input data-inline-edit-input-slot type="text">
//       <button data-inline-edit-trigger-slot>edit</button>
//   </lite-inline-edit>
//
// Reactive attrs (read once on attach):
//   value          initial committed value
//   placeholder    placeholder text on the input
//   trim           "false" disables trim (default true)
//   allow-empty    "true" allows empty commits
//   multiline      flag attribute (use a <textarea> for the input slot)
//   commit-on      comma-separated; default "Enter,blur"
//   cancel-on      comma-separated; default "Escape"
//   aria-label     forwarded
//
// Imperative API on host: see createInlineEdit.
//
// Events:
//   change          { value, previous }
//   commit          { value, previous }
//   cancel          (no detail)
//   editstart       (no detail)
//   invalid         { value, reason }

import { define } from "@zakkster/lite-element";
import { createInlineEdit } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-inline-edit", (host, scope) => {
    const initialValue = host.getAttribute("value") || "";
    const placeholder = host.getAttribute("placeholder") || "";
    const trim = host.getAttribute("trim") !== "false";
    const allowEmpty = host.getAttribute("allow-empty") === "true";
    const multiline = host.hasAttribute("multiline");
    const commitOn = (host.getAttribute("commit-on") || "Enter,blur")
        .split(",").map(s => s.trim()).filter(Boolean);
    const cancelOn = (host.getAttribute("cancel-on") || "Escape")
        .split(",").map(s => s.trim()).filter(Boolean);
    const ariaLabel = host.getAttribute("aria-label") || null;

    const ie = createInlineEdit({
        initialValue, placeholder, trim, allowEmpty, commitOn, cancelOn,
        multiline, ariaLabel,
        onChange: (value, previous) => {
            host.dispatchEvent(new CustomEvent("change", {
                detail: { value, previous },
                bubbles: true,
            }));
        },
        onCommit: (value, previous) => {
            host.dispatchEvent(new CustomEvent("commit", {
                detail: { value, previous },
                bubbles: true,
            }));
        },
        onCancel: () => {
            host.dispatchEvent(new CustomEvent("cancel", { bubbles: true }));
        },
        onEditStart: () => {
            host.dispatchEvent(new CustomEvent("editstart", { bubbles: true }));
        },
        onInvalid: (value, reason) => {
            host.dispatchEvent(new CustomEvent("invalid", {
                detail: { value, reason },
                bubbles: true,
            }));
        },
    });

    ie.attachRoot(host);

    // Track which slots are currently attached so MO can swap them.
    let _attached = { display: null, displayOff: null, input: null, inputOff: null, trigger: null, triggerOff: null };

    function syncSlots() {
        const newDisplay = scopedQuery(host, "[data-inline-edit-display-slot]");
        if (newDisplay !== _attached.display) {
            if (_attached.displayOff) _attached.displayOff();
            _attached.display = newDisplay;
            _attached.displayOff = newDisplay ? ie.attachDisplay(newDisplay) : null;
        }
        const newInput = scopedQuery(host, "[data-inline-edit-input-slot]");
        if (newInput !== _attached.input) {
            if (_attached.inputOff) _attached.inputOff();
            _attached.input = newInput;
            _attached.inputOff = newInput ? ie.attachInput(newInput) : null;
        }
        const newTrigger = scopedQuery(host, "[data-inline-edit-trigger-slot]");
        if (newTrigger !== _attached.trigger) {
            if (_attached.triggerOff) _attached.triggerOff();
            _attached.trigger = newTrigger;
            _attached.triggerOff = newTrigger ? ie.attachTrigger(newTrigger) : null;
        }
    }
    syncSlots();

    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Imperative surface
    host._inlineEditInstance = ie;
    host.setValue       = (s) => ie.setValue(s);
    host.setDraftValue  = (s) => ie.setDraftValue(s);
    host.startEdit      = () => ie.startEdit();
    host.commit         = () => ie.commit();
    host.cancel         = () => ie.cancel();
    Object.defineProperty(host, "value",        { get: () => ie.value(),        configurable: true });
    Object.defineProperty(host, "draftValue",   { get: () => ie.draftValue(),   configurable: true });
    Object.defineProperty(host, "isEditing",    { get: () => ie.isEditing(),    configurable: true });
    Object.defineProperty(host, "isInvalid",    { get: () => ie.isInvalid(),    configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        if (_attached.displayOff) _attached.displayOff();
        if (_attached.inputOff)   _attached.inputOff();
        if (_attached.triggerOff) _attached.triggerOff();
        ie.destroy();
    });
});
