// @zakkster/lite-headless / switch / element.js
//
// <lite-switch> wrapping createSwitch. Markup contract:
//
//   <lite-switch default-checked>
//       <span data-switch-label>Enable notifications</span>
//       <button data-switch-root type="button">
//           <span data-switch-thumb></span>
//       </button>
//   </lite-switch>
//
// Attribute mapping:
//   default-checked     -> defaultChecked
//   checked             -> sets state (writable)
//   disabled            -> disabled
//   required            -> required
//   name                -> name attr on the auto-created hidden checkbox
//                          (for native form submission)
//   value               -> value attr (default "on")
//
// Reactive attributes:
//   checked is observed -- setting/removing it from the outside updates state
//   disabled is observed
//
// Imperative API on host:
//   host.toggle(reason?)
//   host.setChecked(bool, reason?)
//   host.setDisabled(bool)
//   host.checked     -> boolean
//   host.disabled    -> boolean
//
// Dispatched events:
//   change           { detail: { checked, reason } }
//
// FORM INTEGRATION
//
// If `name` is set on the host, the wrapper auto-creates a visually-
// hidden <input type="checkbox" name="..."> inside the host so the
// switch participates in <form> submission. The native input also
// serves as the no-JS fallback (consumers can hide it via CSS).

import { define } from "@zakkster/lite-element";
import { createSwitch } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-switch", (host, scope) => {
    const defaultChecked = host.hasAttribute("default-checked") || host.hasAttribute("checked");
    const initiallyDisabled = host.hasAttribute("disabled");
    const required = host.hasAttribute("required");
    const name  = host.getAttribute("name") || null;
    const value = host.getAttribute("value") || "on";

    const sw = createSwitch({
        defaultChecked,
        disabled: initiallyDisabled,
        required,
        onChange: (checked, reason) => {
            // mirror to the host attribute for CSS / external observers
            if (checked) setHostAttr("checked", "");
            else hostRemove("checked");
            host.dispatchEvent(new CustomEvent("change", {
                detail: { checked, reason }, bubbles: true,
            }));
        },
    });

    // Suppress reactive-attribute cascade -- when our onChange mirrors
    // to the host attribute, the attribute-observer would re-fire as
    // if the consumer set it, producing an infinite ping-pong. We
    // guard the same way as accordion / dialog / etc.
    let _suppressCheckedEffect = false;
    function setHostAttr(name, value) {
        _suppressCheckedEffect = true;
        host.setAttribute(name, value);
        queueMicrotask(() => { _suppressCheckedEffect = false; });
    }
    function hostRemove(name) {
        _suppressCheckedEffect = true;
        host.removeAttribute(name);
        queueMicrotask(() => { _suppressCheckedEffect = false; });
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
        sw.attachInput(hiddenInput);
    }

    // Role observer: when child elements with data-switch-* appear
    // (initial render OR re-render), attach them. scopedQuery rejects
    // matches inside a nested `<lite-switch>`.
    const _attached = { root: null, label: null, thumb: null };
    function syncRoles() {
        const root  = scopedQuery(host, "[data-switch-root]");
        const label = scopedQuery(host, "[data-switch-label]");
        const thumb = scopedQuery(host, "[data-switch-thumb]");
        if (root && _attached.root !== root)   { sw.attachRoot(root);   _attached.root = root; }
        if (label && _attached.label !== label){ sw.attachLabel(label); _attached.label = label; }
        if (thumb && _attached.thumb !== thumb){ sw.attachThumb(thumb); _attached.thumb = thumb; }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // Observe host attributes for reactive control
    const attrMo = new MutationObserver((muts) => {
        if (_suppressCheckedEffect) return;
        for (const m of muts) {
            if (m.attributeName === "checked") {
                sw.setChecked(host.hasAttribute("checked"), "attribute");
            } else if (m.attributeName === "disabled") {
                sw.setDisabled(host.hasAttribute("disabled"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["checked", "disabled"] });

    // Expose imperative API on the host
    host._switchInstance = sw;
    host.toggle      = (reason) => sw.toggle(reason);
    host.setChecked  = (v, reason) => sw.setChecked(v, reason);
    host.setDisabled = (v) => sw.setDisabled(v);
    Object.defineProperty(host, "checked",  { get: () => sw.isChecked(), configurable: true });
    Object.defineProperty(host, "disabled", { get: () => sw.disabled(),  configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        sw.destroy();
        if (hiddenInput && hiddenInput.parentNode === host) {
            host.removeChild(hiddenInput);
        }
    });
});
