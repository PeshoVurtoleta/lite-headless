// @zakkster/lite-headless / backtop / element.js
//
// <lite-backtop threshold="200">
//     <button data-backtop-button aria-label="Back to top">↑</button>
// </lite-backtop>
//
// Or with explicit scroll-target attribute pointing at a container:
//   <lite-backtop target="#scroll-container">...</lite-backtop>

import { define } from "@zakkster/lite-element";
import { createBackTop } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function parseN(s, dflt) {
    const n = parseFloat(s);
    return isFinite(n) ? n : dflt;
}
function scopedQuery(host, sel) {
    const matches = host.querySelectorAll(sel);
    for (let i = 0; i < matches.length; i++) {
        if (belongsToHost(matches[i], host)) return matches[i];
    }
    return null;
}

define("lite-backtop", (host, scope) => {
    const bt = createBackTop({
        threshold: parseN(host.getAttribute("threshold"), 200),
        smooth:    host.getAttribute("smooth") !== "false",
        onActivate: (reason) => {
            host.dispatchEvent(new CustomEvent("backtop", { detail: { reason }, bubbles: true }));
        },
    });

    // Resolve the scroll target. If `target` is a selector, use the
    // matching element; if "window" or absent, use the window.
    function resolveTarget() {
        const t = host.getAttribute("target");
        if (!t || t === "window") return null;  // null means window inside the primitive
        // Document selector first; fall back to closest scrollable ancestor
        const found = document.querySelector(t);
        return found || null;
    }
    const offTarget = bt.attachTarget(resolveTarget());

    let _btnEl = null, _btnOff = null;
    function syncSlots() {
        const btn = scopedQuery(host, "[data-backtop-button]") || host.querySelector("button");
        // Don't grab nested buttons inside other primitives
        if (btn && !belongsToHost(btn, host)) {
            // fall through to no-op
        }
        const target = btn && belongsToHost(btn, host) ? btn : null;
        if (target !== _btnEl) {
            if (_btnOff) _btnOff();
            _btnEl = target;
            _btnOff = target ? bt.attachButton(target) : null;
        }
    }
    syncSlots();
    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    host._backtopInstance = bt;
    host.scrollToTop = (r) => bt.scrollToTop(r);
    Object.defineProperty(host, "isVisible", { get: () => bt.isVisible(), configurable: true });
    Object.defineProperty(host, "threshold", { get: () => bt.threshold(), configurable: true });

    return () => {
        mo.disconnect();
        if (_btnOff) _btnOff();
        offTarget();
        bt.destroy();
    };
});
