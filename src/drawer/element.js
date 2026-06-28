// @zakkster/lite-headless / drawer / element.js
//
// <lite-drawer side="right">
//     <button data-drawer-trigger>Open filters</button>
//     <div    data-drawer-backdrop></div>
//     <aside  data-drawer-content>
//         <h2  data-drawer-title>Filters</h2>
//         <p   data-drawer-description>...</p>
//         <button data-drawer-close>×</button>
//     </aside>
// </lite-drawer>

import { define } from "@zakkster/lite-element";
import { createDrawer } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = [
    "[data-drawer-trigger]",
    "[data-drawer-content]",
    "[data-drawer-backdrop]",
    "[data-drawer-title]",
    "[data-drawer-description]",
    "[data-drawer-close]",
].join(",");

define("lite-drawer", (host, scope) => {
    const drawer = createDrawer({
        defaultOpen: host.hasAttribute("open"),
        defaultSide: host.getAttribute("side") || "right",
        modal: !host.hasAttribute("non-modal"),
        closeOnEscape: !host.hasAttribute("no-escape"),
        closeOnOutsideClick: !host.hasAttribute("no-outside-close"),
        awaitTransitionEnd: host.hasAttribute("await-transitions"),
        onOpenChange: (open, reason) => {
            host.dispatchEvent(new CustomEvent("openchange", {
                detail: { open, reason }, bubbles: true,
            }));
            if (open && !host.hasAttribute("open")) host.setAttribute("open", "");
            if (!open && host.hasAttribute("open")) host.removeAttribute("open");
        },
    });

    let roles;
    // The initial pass of createRoleObserver runs wire() synchronously
    // for every matching node in the existing DOM *before* the
    // constructor returns and `roles` is assigned. If wire() naively
    // does `if (roles) roles.follow(node)`, that branch is dead on the
    // first pass -- and the drawer content + backdrop are never
    // followed. The content then portals to document.body and the
    // observer can't see its descendants (close buttons, title, etc.),
    // so they silently un-wire.
    //
    // Fix: queue follow-requests made during the initial pass, then
    // flush after `roles` is assigned. Post-init, the branch resolves
    // directly through `roles`.
    const followQueue = [];
    function queueFollow(node) {
        if (roles) roles.follow(node);
        else       followQueue.push(node);
    }
    function queueUnfollow(node) {
        if (roles) roles.unfollow(node);
        // No-op if observer is gone -- nothing to unfollow from.
    }

    function wire(node) {
        if (node.hasAttribute("data-drawer-trigger"))     return drawer.attachTrigger(node);
        if (node.hasAttribute("data-drawer-content")) {
            const off = drawer.attachContent(node);
            // Content portals to document.body when the drawer opens;
            // follow it so descendants stay observable across the move.
            queueFollow(node);
            return () => { queueUnfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-drawer-backdrop")) {
            const off = drawer.attachBackdrop(node);
            queueFollow(node);
            return () => { queueUnfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-drawer-title"))       return drawer.attachTitle(node);
        if (node.hasAttribute("data-drawer-description")) return drawer.attachDescription(node);
        if (node.hasAttribute("data-drawer-close"))       return drawer.attachCloseButton(node);
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    // Flush queued follow-requests now that `roles` exists. After this
    // point, queueFollow takes the fast path through `roles` directly.
    for (let i = 0; i < followQueue.length; i++) roles.follow(followQueue[i]);
    followQueue.length = 0;
    roles.rescan();

    // Reactive attribute mirrors: open + side
    const attrMo = new MutationObserver((records) => {
        for (const r of records) {
            if (r.attributeName === "open") {
                drawer.setOpen(host.hasAttribute("open"), "attribute");
            }
            if (r.attributeName === "side") {
                drawer.setSide(host.getAttribute("side") || "right");
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["open", "side"] });

    host._drawerInstance = drawer;
    host.show     = () => drawer.show();
    host.hide     = () => drawer.hide();
    host.setSide  = (s) => drawer.setSide(s);
    host.setOpen  = (b) => drawer.setOpen(b, "api");
    Object.defineProperty(host, "isOpen",        { get: () => drawer.open(),   configurable: true });
    // v1.0.0: drop `current*` host aliases. The canonical names
    // `side` / `status` are the only public surface now.
    Object.defineProperty(host, "side",          { get: () => drawer.side(),   configurable: true });
    Object.defineProperty(host, "status",        { get: () => drawer.status(), configurable: true });

    scope.onCleanup(() => {
        roles.disconnect();
        attrMo.disconnect();
        drawer.destroy();
    });
});
