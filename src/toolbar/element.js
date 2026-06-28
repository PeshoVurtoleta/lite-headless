// @zakkster/lite-headless / toolbar / element.js
//
// <lite-toolbar orientation="horizontal" aria-label="Formatting">
//     <button data-toolbar-item>Bold</button>
//     <button data-toolbar-item>Italic</button>
//     <div data-toolbar-separator></div>
//     <div data-toolbar-group>
//         <button data-toolbar-item>Left</button>
//         <button data-toolbar-item>Center</button>
//         <button data-toolbar-item>Right</button>
//     </div>
// </lite-toolbar>

import { define } from "@zakkster/lite-element";
import { createToolbar } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL =
    "[data-toolbar-item], [data-toolbar-separator], [data-toolbar-group]";

define("lite-toolbar", (host, scope) => {
    const orientation = host.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
    const loop = host.getAttribute("loop") !== "false";

    const tb = createToolbar({ orientation, loop });
    const offRoot = tb.attachRoot(host);

    // Role discovery via MutationObserver. Same followQueue trick the
    // drawer wrapper uses -- createRoleObserver runs wire() during its
    // own synchronous initial pass before `roles` is assigned, so we
    // must NOT rely on `roles` being set inside wire().
    function wire(node) {
        if (node.hasAttribute("data-toolbar-item"))      return tb.attachItem(node);
        if (node.hasAttribute("data-toolbar-separator")) return tb.attachSeparator(node);
        if (node.hasAttribute("data-toolbar-group"))     return tb.attachGroup(node);
        return null;
    }

    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    // Imperative surface
    host._toolbarInstance = tb;
    host.setItemDisabled = (el, d) => tb.setItemDisabled(el, d);
    host.focusFirst      = () => tb.focusFirst();
    host.focusLast       = () => tb.focusLast();

    return () => {
        roles.destroy();
        offRoot();
        tb.destroy();
    };
});
