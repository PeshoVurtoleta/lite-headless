// @zakkster/lite-headless / dialog / element.js
//
// <lite-dialog> -- light-DOM wrapper around createDialog().
//
// Slot convention: data-* attributes on light-DOM children.
//   <lite-dialog modal>
//     <button data-trigger>Open</button>
//     <div data-overlay></div>
//     <div data-content>
//       <h2 data-title>Title</h2>
//       <p data-description>Subtext</p>
//       <button data-close>Cancel</button>
//     </div>
//   </lite-dialog>
//
// `open` reflects to/from the attribute (so external CSS can target it and
// outside code can read/set state via .open). All other config is static at
// mount -- see design doc: modal-ness, dismiss policy, etc. are locked.
//
// Dynamic content: any [data-trigger]/[data-content]/[data-overlay]/
// [data-title]/[data-description]/[data-close] element injected after mount
// (async forms, framework conditional renders, router navigation) is wired
// automatically via a MutationObserver. Removed nodes are unwired LIFO.
// Nodes inside nested <lite-*> primitives are intentionally NOT claimed --
// they belong to the nested primitive.
//
// Side-effect: importing this module registers the custom element.

import { define } from "@zakkster/lite-element";
import { createDialog } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-content],[data-overlay],[data-title],[data-description],[data-close]";

define("lite-dialog", (host, scope) => {
    const openSig = scope.prop("open", false, { type: Boolean, reflect: true });

    const cfg = {
        modal:               !host.hasAttribute("non-modal"),
        closeOnEscape:       !host.hasAttribute("no-escape"),
        closeOnOutsideClick: !host.hasAttribute("no-outside"),
        // v0.7.2: drawer/sheet direction. "center" (or unset) is a regular
        // modal dialog; "left"/"right"/"top"/"bottom" produce a drawer
        // attached to that edge. The primitive writes data-placement to
        // content + overlay; CSS handles all animation. Validated against
        // a small whitelist so a typo doesn't become an attribute selector
        // with no matching rules.
        placement:           resolvePlacement(host.getAttribute("placement")),
        container:           resolveContainer(host.getAttribute("container")),
        transition:          host.hasAttribute("transition"),
    };

    const dialog = createDialog({
        open: openSig,
        onOpenChange: (next) => openSig.set(next),
        ...cfg,
    });

    // Role router. Each branch routes a discrete role to its attach*; the
    // close role is the one that benefits most from dynamic wiring (every
    // async form field can declare its own <button data-close>).
    //
    // Forward declaration of `roles` so wire() can reach `roles.follow` for
    // the content element below.
    let roles;

    function wire(node) {
        if (node.hasAttribute("data-trigger")) return dialog.attachTrigger(node);
        if (node.hasAttribute("data-content")) {
            const off = dialog.attachContent(node);
            // The content gets portaled to `container` when modal is open.
            // After portal, the host's MutationObserver can't see mutations
            // inside it (it's no longer a host descendant). Follow the
            // element directly so injected close-buttons inside async forms
            // still get wired.
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-overlay"))     return dialog.attachOverlay(node);
        if (node.hasAttribute("data-title"))       return dialog.attachTitle(node);
        if (node.hasAttribute("data-description")) return dialog.attachDescription(node);
        if (node.hasAttribute("data-close"))       return dialog.attachClose(node);
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    host.toggle  = () => dialog.toggle();
    host.setOpen = (v, reason) => dialog.setOpen(v, reason);

    scope.onCleanup(() => {
        roles.disconnect();
        dialog.destroy();
    });
}, { observedAttributes: ["open"] });

function resolveContainer(spec) {
    if (typeof document === "undefined") return null;
    if (!spec) return document.body;
    if (spec === "self" || spec === "none") return null;
    return document.querySelector(spec) || document.body;
}

function resolvePlacement(spec) {
    if (!spec) return "center";
    if (spec === "left" || spec === "right" || spec === "top" || spec === "bottom" || spec === "center") return spec;
    return "center";   // unknown -> fall back to standard modal
}
