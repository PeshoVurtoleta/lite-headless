// @zakkster/lite-headless / popover / element.js
//
// <lite-popover> -- light-DOM wrapper around createPopover().
//
// Slot convention:
//   <lite-popover placement="bottom-start" offset="8">
//     <button data-trigger>Open</button>
//     <div data-content>
//       <p>...</p>
//       <button data-close>Close</button>
//       <span data-arrow></span>
//     </div>
//   </lite-popover>
//
// Static attrs (read once at setup): placement, offset, no-flip, no-shift,
// modal, no-escape, no-outside, container, transition.
// Reactive attr: open (reflects).
//
// Dynamic content: any role element injected after mount (multiple triggers,
// lazy-loaded close buttons inside async forms, arrows that arrive with the
// content) is wired via MutationObserver. Multiple triggers and multiple
// closes are explicitly supported -- the primitive handles N attaches per
// role.

import { define } from "@zakkster/lite-element";
import { createPopover } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-anchor],[data-content],[data-arrow],[data-close]";

define("lite-popover", (host, scope) => {
    const openSig = scope.prop("open", false, { type: Boolean, reflect: true });

    const cfg = {
        placement: host.getAttribute("placement") || "bottom",
        offset:    parseFloat(host.getAttribute("offset") || "8"),
        flip:      !host.hasAttribute("no-flip"),
        shift:     !host.hasAttribute("no-shift"),
        modal:     host.hasAttribute("modal"),
        closeOnEscape:       !host.hasAttribute("no-escape"),
        closeOnOutsideClick: !host.hasAttribute("no-outside"),
        container:           resolveContainer(host.getAttribute("container")),
        transition:          host.hasAttribute("transition"),
    };

    const popover = createPopover({
        open: openSig,
        onOpenChange: (next) => openSig.set(next),
        ...cfg,
    });

    let roles;

    function wire(node) {
        if (node.hasAttribute("data-trigger")) return popover.attachTrigger(node);
        if (node.hasAttribute("data-anchor"))  return popover.attachAnchor(node);
        if (node.hasAttribute("data-content")) {
            const off = popover.attachContent(node);
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-arrow")) return popover.attachArrow(node);
        if (node.hasAttribute("data-close")) return popover.attachClose(node);
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    host.toggle  = () => popover.toggle();
    host.setOpen = (v, reason) => popover.setOpen(v, reason);

    scope.onCleanup(() => {
        roles.disconnect();
        popover.destroy();
    });
}, { observedAttributes: ["open"] });

function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}
