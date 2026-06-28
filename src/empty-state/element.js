// @zakkster/lite-headless / empty-state / element.js
//
// <lite-empty-state variant="empty">
//     <div data-empty-icon>📭</div>
//     <h3 data-empty-title>No projects yet</h3>
//     <p data-empty-description>Create one to start tracking work.</p>
//     <div data-empty-actions>
//         <button>Create project</button>
//         <button>Import</button>
//     </div>
// </lite-empty-state>

import { define } from "@zakkster/lite-element";
import { createEmptyState } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL =
    "[data-empty-icon], [data-empty-title], [data-empty-description], [data-empty-actions]";

define("lite-empty-state", (host, scope) => {
    const variant = host.getAttribute("variant") || "empty";
    const es = createEmptyState({ variant });
    const offRoot = es.attachRoot(host);

    function wire(node) {
        if (node.hasAttribute("data-empty-icon"))        return es.attachIcon(node);
        if (node.hasAttribute("data-empty-title"))       return es.attachTitle(node);
        if (node.hasAttribute("data-empty-description")) return es.attachDescription(node);
        if (node.hasAttribute("data-empty-actions"))     return es.attachActions(node);
        return null;
    }

    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    // Reactive `variant` attribute: external setAttribute flows to setVariant.
    let _suppressVariant = false;
    const attrMo = new MutationObserver((muts) => {
        if (_suppressVariant) return;
        for (let i = 0; i < muts.length; i++) {
            if (muts[i].attributeName === "variant") {
                const v = host.getAttribute("variant");
                if (v) es.setVariant(v);
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["variant"] });

    // Imperative surface
    host._emptyStateInstance = es;
    host.setVariant = (v) => {
        _suppressVariant = true;
        host.setAttribute("variant", v);
        queueMicrotask(() => { _suppressVariant = false; });
        es.setVariant(v);
    };
    Object.defineProperty(host, "variant", { get: () => es.variant(), configurable: true });

    return () => {
        roles.destroy();
        attrMo.disconnect();
        offRoot();
        es.destroy();
    };
});
