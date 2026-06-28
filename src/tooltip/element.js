// @zakkster/lite-headless / tooltip / element.js
//
// <lite-tooltip> -- light-DOM wrapper around createTooltip().
//
//   <lite-tooltip placement="top" trigger="hover focus">
//     <button data-trigger>Hover me</button>
//     <div data-content>Helpful text<span data-arrow></span></div>
//   </lite-tooltip>
//
// Dynamic content: same MutationObserver pattern as the other primitives.
// Tooltips show up in data-grids and rich-text editors where triggers/anchors
// are virtualized; the wrapper now wires/unwires them as they flow in and
// out of the light DOM.

import { define } from "@zakkster/lite-element";
import { createTooltip } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-anchor],[data-content],[data-arrow]";

define("lite-tooltip", (host, scope) => {
    const openSig = scope.prop("open", false, { type: Boolean, reflect: true });

    const cfg = {
        placement: host.getAttribute("placement") || "top",
        offset:    parseFloat(host.getAttribute("offset") || "6"),
        flip:      !host.hasAttribute("no-flip"),
        shift:     !host.hasAttribute("no-shift"),
        trigger:   host.getAttribute("trigger") || "hover focus",
        openDelay:  parseInt(host.getAttribute("open-delay")  || "200", 10),
        closeDelay: parseInt(host.getAttribute("close-delay") || "150", 10),
        closeOnEscape: !host.hasAttribute("no-escape"),
        container:     resolveContainer(host.getAttribute("container")),
        transition:    host.hasAttribute("transition"),
        describesTrigger: !host.hasAttribute("labels"),
    };

    const tooltip = createTooltip({
        open: openSig,
        onOpenChange: (next) => openSig.set(next),
        ...cfg,
    });

    function wire(node) {
        if      (node.hasAttribute("data-trigger")) return tooltip.attachTrigger(node);
        else if (node.hasAttribute("data-anchor"))  return tooltip.attachAnchor(node);
        else if (node.hasAttribute("data-content")) return tooltip.attachContent(node);
        else if (node.hasAttribute("data-arrow"))   return tooltip.attachArrow(node);
        return null;
    }

    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    host.toggle  = () => tooltip.toggle();
    host.setOpen = (v, reason) => tooltip.setOpen(v, reason);

    scope.onCleanup(() => {
        roles.disconnect();
        tooltip.destroy();
    });
}, { observedAttributes: ["open"] });

function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}
