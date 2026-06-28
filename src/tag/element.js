// @zakkster/lite-headless / tag / element.js
//
// <lite-tag intent="success">Shipped</lite-tag>
// <lite-tag intent="warning" closable>
//     Pending review
//     <button data-tag-close>×</button>
// </lite-tag>

import { define } from "@zakkster/lite-element";
import { createTag } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const matches = host.querySelectorAll(sel);
    for (let i = 0; i < matches.length; i++) {
        if (belongsToHost(matches[i], host)) return matches[i];
    }
    return null;
}

define("lite-tag", (host, scope) => {
    const tag = createTag({
        intent:   host.getAttribute("intent") || "default",
        closable: host.hasAttribute("closable"),
        onClose: (reason) => {
            host.dispatchEvent(new CustomEvent("close", { detail: { reason }, bubbles: true }));
        },
    });
    const offRoot = tag.attachRoot(host);

    let _closeEl = null, _closeOff = null;
    function syncSlots() {
        if (!host.hasAttribute("closable")) return;
        const closeEl = scopedQuery(host, "[data-tag-close]");
        if (closeEl !== _closeEl) {
            if (_closeOff) _closeOff();
            _closeEl = closeEl;
            _closeOff = closeEl ? tag.attachCloseButton(closeEl) : null;
        }
    }
    syncSlots();
    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    const attrMo = new MutationObserver((muts) => {
        for (const mut of muts) {
            if (mut.attributeName === "intent") {
                tag.setIntent(host.getAttribute("intent") || "default");
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["intent"] });

    host._tagInstance = tag;
    host.setIntent = (v) => { host.setAttribute("intent", v); tag.setIntent(v); };
    host.close     = (r) => tag.close(r);
    host.reset     = () => tag.reset();
    Object.defineProperty(host, "intent",    { get: () => tag.intent(),    configurable: true });
    Object.defineProperty(host, "isRemoved", { get: () => tag.isRemoved(), configurable: true });

    return () => {
        mo.disconnect();
        attrMo.disconnect();
        if (_closeOff) _closeOff();
        offRoot();
        tag.destroy();
    };
});
