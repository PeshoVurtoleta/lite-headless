// @zakkster/lite-headless / toast / element.js
//
// <lite-toast> custom element wrapping createToast. Unlike most other
// element wrappers, toast is primarily IMPERATIVE -- consumers don't
// declare toasts in markup; they call host.show() at runtime.
//
// Markup contract:
//
// <lite-toast placement="bottom-right" duration="5000"></lite-toast>
//
// The host element IS the viewport. Toasts get appended to it as
// they're shown. Consumer styles the host's position via CSS:
//
//   lite-toast {
//       position: fixed;
//       bottom: 1rem; right: 1rem;
//       display: flex; flex-direction: column; gap: 0.5rem;
//   }
//
// Imperative API exposed on the host:
//
//   host.show(content, opts?) -> { id, el, dismiss, update }
//   host.dismiss(id)
//   host.clear()
//   host.count -> number
//
// Attribute -> option mapping:
//   placement         -> placement
//   duration          -> duration (ms; 0 = no auto-dismiss)
//   swipe-direction   -> swipeDirection
//   swipe-threshold   -> swipeThreshold (px)
//   max-stack         -> maxStack
//   no-swipe          -> swipeToDismiss=false (presence)
//   no-pause          -> pauseOnHover/Focus=false (presence)
//   no-announce       -> announceLive=false (presence)
//
// Dispatched events:
//   show     { detail: { id } }
//   dismiss  { detail: { id, reason } }

import { define } from "@zakkster/lite-element";
import { createToast } from "./index.js";

function parseIntAttr(raw, fallback) {
    if (raw == null) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

define("lite-toast", (host, scope) => {
    const placement      = host.getAttribute("placement") || "bottom-right";
    const duration       = parseIntAttr(host.getAttribute("duration"), 5000);
    const swipeDirection = host.getAttribute("swipe-direction") || "auto";
    const swipeThreshold = parseIntAttr(host.getAttribute("swipe-threshold"), 50);
    const maxStack       = parseIntAttr(host.getAttribute("max-stack"), 5);
    const swipeToDismiss = !host.hasAttribute("no-swipe");
    const pauseOnHover   = !host.hasAttribute("no-pause");
    const pauseOnFocus   = !host.hasAttribute("no-pause");
    const announceLive   = !host.hasAttribute("no-announce");

    const toast = createToast({
        placement, duration,
        swipeToDismiss, swipeDirection, swipeThreshold,
        maxStack, pauseOnHover, pauseOnFocus, announceLive,
        onShow: (id) => {
            host.dispatchEvent(new CustomEvent("show", {
                detail: { id }, bubbles: true,
            }));
        },
        onDismiss: (id, reason) => {
            host.dispatchEvent(new CustomEvent("dismiss", {
                detail: { id, reason }, bubbles: true,
            }));
        },
    });

    // Host IS the viewport
    const detachRoot = toast.attachRoot(host);

    // Expose imperative API on the host
    host._toastInstance = toast;
    host.show    = (content, opts) => toast.show(content, opts);
    host.dismiss = (id, reason)    => toast.dismiss(id, reason);
    host.clear   = (reason)        => toast.clear(reason);
    Object.defineProperty(host, "count", {
        get: () => toast.count(),
        configurable: true,
    });

    scope.onCleanup(() => {
        detachRoot();
        toast.destroy();
    });
});
