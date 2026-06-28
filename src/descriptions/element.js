// @zakkster/lite-headless / descriptions / element.js
//
// <lite-descriptions columns="3" bordered>
//     <div data-desc-item>
//         <div data-desc-label>Username</div>
//         <div data-desc-value>alice</div>
//     </div>
//     <div data-desc-item>
//         <div data-desc-label>Email</div>
//         <div data-desc-value>alice@example.com</div>
//     </div>
//     ...
// </lite-descriptions>

import { define } from "@zakkster/lite-element";
import { createDescriptions } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-desc-item]";

function parseN(s, dflt) {
    const n = parseInt(s, 10);
    return isFinite(n) ? n : dflt;
}

define("lite-descriptions", (host, scope) => {
    const d = createDescriptions({
        columns:  parseN(host.getAttribute("columns"), 1),
        bordered: host.hasAttribute("bordered"),
    });
    const offRoot = d.attachRoot(host);

    function wire(node) {
        if (!node.hasAttribute || !node.hasAttribute("data-desc-item")) return null;
        return d.attachItem(node);
    }
    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    host._descriptionsInstance = d;
    Object.defineProperty(host, "columns",  { get: () => d.columns,  configurable: true });
    Object.defineProperty(host, "bordered", { get: () => d.bordered, configurable: true });

    return () => {
        roles.disconnect();
        offRoot();
        d.destroy();
    };
});
