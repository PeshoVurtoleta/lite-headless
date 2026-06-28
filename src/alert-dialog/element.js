// @zakkster/lite-headless / alert-dialog / element.js
//
// <lite-alert-dialog> -- interruptive confirm/destroy dialog. Same slot
// convention as <lite-dialog>, but role="alertdialog", always modal, and a
// backdrop click does NOT dismiss (the user must pick an action).
//
//   <lite-alert-dialog>
//     <button data-trigger>Delete account</button>
//     <div data-overlay></div>
//     <div data-content>
//       <h2 data-title>Delete account?</h2>
//       <p data-description>This cannot be undone.</p>
//       <button data-close>Cancel</button>
//       <button data-confirm>Delete</button>
//     </div>
//   </lite-alert-dialog>
//
// Attributes:
//   no-escape       -- disable Escape-to-cancel (hard confirm)
//   dismissable     -- allow a backdrop click to close (opt back in)
//   placement       -- center (default) | left | right | top | bottom
//   container       -- selector | "self" | "none" (default: document.body)
//
// [data-confirm] is wired as a convenience close-button (it dismisses; the
// consumer attaches the actual destructive handler in their own click
// listener). Side-effect: importing this module registers the element.

import { define } from "@zakkster/lite-element";
import { createAlertDialog } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-trigger],[data-content],[data-overlay],[data-title],[data-description],[data-close],[data-confirm]";

define("lite-alert-dialog", (host, scope) => {
    const openSig = scope.prop("open", false, { type: Boolean, reflect: true });

    const dialog = createAlertDialog({
        open: openSig,
        onOpenChange: (next) => openSig.set(next),
        closeOnEscape:       !host.hasAttribute("no-escape"),
        closeOnOutsideClick: host.hasAttribute("dismissable"),
        placement:           resolvePlacement(host.getAttribute("placement")),
        container:           resolveContainer(host.getAttribute("container")),
        transition:          host.hasAttribute("transition"),
    });

    let roles;
    function wire(node) {
        if (node.hasAttribute("data-trigger")) return dialog.attachTrigger(node);
        if (node.hasAttribute("data-content")) {
            const off = dialog.attachContent(node);
            if (roles) roles.follow(node);
            return () => { if (roles) roles.unfollow(node); if (off) off(); };
        }
        if (node.hasAttribute("data-overlay"))     return dialog.attachOverlay(node);
        if (node.hasAttribute("data-title"))       return dialog.attachTitle(node);
        if (node.hasAttribute("data-description")) return dialog.attachDescription(node);
        if (node.hasAttribute("data-close"))       return dialog.attachClose(node);
        if (node.hasAttribute("data-confirm"))     return dialog.attachClose(node);
        return null;
    }

    roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();

    host._alertDialogInstance = dialog;
    host.toggle  = (reason) => dialog.toggle(reason);
    host.setOpen = (v, reason) => dialog.setOpen(v, reason);
    Object.defineProperty(host, "isOpen", { get: () => dialog.open(),   configurable: true });
    Object.defineProperty(host, "status", { get: () => dialog.status(), configurable: true });

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
    return "center";
}
