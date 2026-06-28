// @zakkster/lite-headless / radio-group / element.js
//
// <lite-radio-group value="b" orientation="horizontal" required>
//     <button data-radio-item value="a">Option A</button>
//     <button data-radio-item value="b">Option B</button>
//     <button data-radio-item value="c" disabled>Option C</button>
// </lite-radio-group>
//
// The wrapper auto-discovers child elements with `data-radio-item`
// and registers them by their `value="..."` attribute.

import { define } from "@zakkster/lite-element";
import { createRadioGroup } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-radio-item]";

define("lite-radio-group", (host, scope) => {
    const rg = createRadioGroup({
        value:       host.getAttribute("value") || null,
        orientation: host.getAttribute("orientation") || "vertical",
        required:    host.hasAttribute("required"),
        disabled:    host.hasAttribute("disabled"),
        onChange: (key, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value: key, reason }, bubbles: true,
            }));
        },
    });
    const offRoot = rg.attachRoot(host);

    function wire(node) {
        // scanAndMount calls wire(host) too — the host has a `value`
        // attribute (the initial SELECTED value), which is not an item
        // key. Only proceed if this node is actually a radio item.
        if (!node.hasAttribute("data-radio-item")) return null;
        const key = node.getAttribute("value");
        if (!key) return null;
        return rg.attachItem(node, key, { disabled: node.hasAttribute("disabled") });
    }
    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    // Reactive attributes
    let _suppressValueAttr = false;
    const attrMo = new MutationObserver((muts) => {
        if (_suppressValueAttr) return;
        for (const m of muts) {
            if (m.attributeName === "value") {
                const v = host.getAttribute("value");
                rg.setValue(v && v.length > 0 ? v : null, "attribute");
            }
            if (m.attributeName === "disabled") {
                rg.setDisabled(host.hasAttribute("disabled"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["value", "disabled"] });

    // Mirror value -> host attribute for form integration + readability.
    // (We can't actually wire reactively without a peer dep on lite-signal
    // here, so use the onChange callback above. The MutationObserver guard
    // prevents echo loops if onChange triggers a host.setAttribute.)

    // Imperative surface
    host._radioGroupInstance = rg;
    host.setValue = (v) => {
        _suppressValueAttr = true;
        if (v == null) host.removeAttribute("value");
        else host.setAttribute("value", v);
        queueMicrotask(() => { _suppressValueAttr = false; });
        rg.setValue(v, "api");
    };
    host.setDisabled = (b) => {
        if (b) host.setAttribute("disabled", "");
        else host.removeAttribute("disabled");
    };
    host.setItemDisabled = (keyOrEl, b) => rg.setItemDisabled(keyOrEl, b);

    Object.defineProperty(host, "value",       { get: () => rg.value(),       configurable: true });
    Object.defineProperty(host, "checkedKey",  { get: () => rg.checkedKey,    configurable: true });
    Object.defineProperty(host, "isDisabled",  { get: () => rg.isDisabled(),  configurable: true });
    Object.defineProperty(host, "itemCount",   { get: () => rg.itemCount,     configurable: true });

    return () => {
        roles.destroy();
        attrMo.disconnect();
        offRoot();
        rg.destroy();
    };
});
