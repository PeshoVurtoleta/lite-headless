// @zakkster/lite-headless / hover-card / element.js
//
// <lite-hover-card placement="bottom-start" open-delay="300" close-delay="200">
//   <a data-trigger href="/u/zak">@zak</a>
//   <div data-content>
//     <div data-arrow></div>
//     ...rich preview...
//   </div>
// </lite-hover-card>
//
// `open` reflects to/from the attribute. Slotted [data-trigger] / [data-anchor]
// / [data-content] / [data-arrow] are wired (and re-wired if injected later).
// Positioned by @zakkster/lite-floating.
//
// Side-effect: importing this module registers the custom element.

import { define } from "@zakkster/lite-element";
import { createHoverCard } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-anchor],[data-content],[data-arrow]";

const PLACEMENTS = new Set([
    "top", "top-start", "top-end",
    "right", "right-start", "right-end",
    "bottom", "bottom-start", "bottom-end",
    "left", "left-start", "left-end",
]);

function parseN(s, dflt) {
    const n = parseInt(s, 10);
    return isFinite(n) ? n : dflt;
}
function resolvePlacement(spec) {
    return PLACEMENTS.has(spec) ? spec : "bottom";
}
function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}

define("lite-hover-card", (host, scope) => {
    const openSig = scope.prop("open", false, { type: Boolean, reflect: true });

    const hc = createHoverCard({
        open: openSig,
        onOpenChange: (next) => openSig.set(next),
        placement:   resolvePlacement(host.getAttribute("placement")),
        offset:      parseN(host.getAttribute("offset"), 8),
        openDelay:   parseN(host.getAttribute("open-delay"), 300),
        closeDelay:  parseN(host.getAttribute("close-delay"), 200),
        closeOnEscape: !host.hasAttribute("no-escape"),
        container:   resolveContainer(host.getAttribute("container")),
        transition:  host.hasAttribute("transition"),
    });
    const offRoot = hc.attachRoot(host);

    let roles;
    function wire(node) {
        if (node.hasAttribute("data-trigger")) return hc.attachTrigger(node);
        if (node.hasAttribute("data-anchor"))  return hc.attachAnchor(node);
        if (node.hasAttribute("data-content")) {
            const off = hc.attachContent(node);
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-arrow"))   return hc.attachArrow(node);
        return null;
    }
    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    host._hoverCardInstance = hc;
    host.toggle  = (reason) => hc.toggle(reason);
    host.setOpen = (v, reason) => hc.setOpen(v, reason);
    Object.defineProperty(host, "isOpen", { get: () => hc.open(),   configurable: true });
    Object.defineProperty(host, "status", { get: () => hc.status(), configurable: true });

    scope.onCleanup(() => {
        roles.disconnect();
        offRoot();
        hc.destroy();
    });
}, { observedAttributes: ["open"] });
