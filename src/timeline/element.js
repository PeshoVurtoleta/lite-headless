// @zakkster/lite-headless / timeline / element.js
//
// <lite-timeline>
//     <div data-timeline-item data-type="success">
//         <span data-timeline-marker></span>
//         <time data-timeline-time>09:14</time>
//         <div data-timeline-content>Order #1234 shipped</div>
//     </div>
//     ...
// </lite-timeline>

import { define } from "@zakkster/lite-element";
import { createTimeline } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-timeline-item]";

define("lite-timeline", (host, scope) => {
    const tl = createTimeline({});
    const offRoot = tl.attachRoot(host);

    function wire(node) {
        // Guard: scanAndMount calls wire(host) too; only proceed for items
        if (!node.hasAttribute || !node.hasAttribute("data-timeline-item")) return null;
        // belongsToHost check would already be done by createRoleObserver
        const type = node.getAttribute("data-type") || "default";
        return tl.attachItem(node, { type });
    }
    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    host._timelineInstance = tl;
    host.setItemType = (el, type) => tl.setItemType(el, type);
    Object.defineProperty(host, "itemCount", { get: () => tl.itemCount, configurable: true });

    return () => {
        roles.disconnect();
        offRoot();
        tl.destroy();
    };
});
