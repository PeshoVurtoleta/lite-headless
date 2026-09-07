// @zakkster/lite-headless / checkbox / element.js
//
// <lite-checkbox> wrapping createCheckbox. Markup contract:
//
//   <lite-checkbox default-checked>
//       <span data-checkbox-root></span>
//       <span data-checkbox-label>Accept terms</span>
//   </lite-checkbox>
//
// Attribute mapping:
//   default-checked        -> defaultChecked
//   default-indeterminate  -> defaultIndeterminate (seeds "mixed")
//   checked                -> sets state (writable, observed)
//   indeterminate          -> sets mixed state (writable, observed)
//   disabled               -> disabled (observed)
//   required               -> required
//   name                   -> name attr on the auto-created hidden checkbox
//                             (for native form submission)
//   value                  -> value attr on that input (default "on")
//
// Reactive attributes:
//   checked / indeterminate / disabled are observed -- setting/removing them
//   from the outside updates state.
//
// Imperative API on host:
//   host.toggle(reason?)
//   host.setChecked(bool, reason?)
//   host.setIndeterminate(bool, reason?)
//   host.setDisabled(bool)
//   host.checked        -> boolean
//   host.indeterminate  -> boolean
//   host.disabled       -> boolean
//
// Dispatched events:
//   change              { detail: { checked, indeterminate, reason } }
//
// FORM INTEGRATION
//
// If `name` is set on the host, the wrapper auto-creates a visually-hidden
// <input type="checkbox" name="..."> inside the host so the checkbox
// participates in <form> submission (and carries the indeterminate flag). The
// native input also serves as the no-JS fallback (hide it via CSS).

import { define } from "@zakkster/lite-element";
import { createCheckbox } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-checkbox", (host, scope) => {
    const defaultChecked = host.hasAttribute("default-checked") || host.hasAttribute("checked");
    const defaultIndeterminate = host.hasAttribute("default-indeterminate") || host.hasAttribute("indeterminate");
    const initiallyDisabled = host.hasAttribute("disabled");
    const required = host.hasAttribute("required");
    const name  = host.getAttribute("name") || null;
    const value = host.getAttribute("value") || "on";

    const cb = createCheckbox({
        defaultChecked,
        defaultIndeterminate,
        disabled: initiallyDisabled,
        required,
        onChange: (checked, reason) => {
            // mirror to host attributes for CSS / external observers
            if (checked) setHostAttr("checked", "");
            else hostRemove("checked");
            if (cb.indeterminate()) setHostAttr("indeterminate", "");
            else hostRemove("indeterminate");
            host.dispatchEvent(new CustomEvent("change", {
                detail: { checked, indeterminate: cb.indeterminate(), reason }, bubbles: true,
            }));
        },
    });

    // Suppress the reactive-attribute cascade -- when onChange mirrors to the
    // host attribute, the attribute-observer would re-fire as if the consumer
    // set it, producing an infinite ping-pong (guarded like switch / dialog).
    let _suppress = false;
    function setHostAttr(n, v) {
        _suppress = true;
        host.setAttribute(n, v);
        queueMicrotask(() => { _suppress = false; });
    }
    function hostRemove(n) {
        _suppress = true;
        host.removeAttribute(n);
        queueMicrotask(() => { _suppress = false; });
    }

    // Build a hidden native input if `name` is set (form integration)
    let hiddenInput = null;
    if (name) {
        hiddenInput = document.createElement("input");
        hiddenInput.type = "checkbox";
        hiddenInput.name = name;
        hiddenInput.value = value;
        hiddenInput.style.cssText =
            "position:absolute;width:1px;height:1px;padding:0;margin:-1px;" +
            "overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";
        host.appendChild(hiddenInput);
        cb.attachInput(hiddenInput);
    }

    // Role observer: attach child elements as they appear (initial render OR
    // re-render). scopedQuery rejects matches inside a nested <lite-checkbox>.
    const _attached = { root: null, label: null };
    function syncRoles() {
        const root  = scopedQuery(host, "[data-checkbox-root]");
        const label = scopedQuery(host, "[data-checkbox-label]");
        if (root && _attached.root !== root)   { cb.attachRoot(root);   _attached.root = root; }
        if (label && _attached.label !== label){ cb.attachLabel(label); _attached.label = label; }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // Observe host attributes for reactive control
    const attrMo = new MutationObserver((muts) => {
        if (_suppress) return;
        for (const m of muts) {
            if (m.attributeName === "checked") {
                cb.setChecked(host.hasAttribute("checked"), "attribute");
            } else if (m.attributeName === "indeterminate") {
                cb.setIndeterminate(host.hasAttribute("indeterminate"), "attribute");
            } else if (m.attributeName === "disabled") {
                cb.setDisabled(host.hasAttribute("disabled"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["checked", "indeterminate", "disabled"] });

    // Expose imperative API on the host
    host._checkboxInstance = cb;
    host.toggle          = (reason) => cb.toggle(reason);
    host.setChecked      = (v, reason) => cb.setChecked(v, reason);
    host.setIndeterminate = (v, reason) => cb.setIndeterminate(v, reason);
    host.setDisabled     = (v) => cb.setDisabled(v);
    Object.defineProperty(host, "checked",       { get: () => cb.checked(),       configurable: true });
    Object.defineProperty(host, "indeterminate", { get: () => cb.indeterminate(), configurable: true });
    Object.defineProperty(host, "disabled",      { get: () => cb.disabled(),      configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        cb.destroy();
        if (hiddenInput && hiddenInput.parentNode === host) {
            host.removeChild(hiddenInput);
        }
    });
});
