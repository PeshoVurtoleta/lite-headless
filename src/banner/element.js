// @zakkster/lite-headless / banner / element.js
//
// <lite-banner kind="warning" dismiss-on-escape>
//     <p>Your session will expire in 5 minutes.</p>
//     <button data-banner-dismiss>Dismiss</button>
// </lite-banner>

import { define } from "@zakkster/lite-element";
import { createBanner } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const el = host.querySelector(sel);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-banner", (host, scope) => {
    const banner = createBanner({
        defaultOpen: !host.hasAttribute("dismissed"),
        defaultKind: host.getAttribute("kind") || "info",
        dismissOnEscape: host.hasAttribute("dismiss-on-escape"),
        onOpenChange: (o) => {
            host.dispatchEvent(new CustomEvent("openchange", {
                detail: { open: o }, bubbles: true,
            }));
        },
        onDismiss: () => {
            host.dispatchEvent(new CustomEvent("dismiss", { bubbles: true }));
        },
    });

    banner.attachRoot(host);

    let _dismissBtn = null;
    let _dismissOff = null;

    function syncSlots() {
        const btn = scopedQuery(host, "[data-banner-dismiss]");
        if (btn !== _dismissBtn) {
            if (_dismissOff) _dismissOff();
            _dismissBtn = btn;
            _dismissOff = btn ? banner.attachDismissButton(btn) : null;
        }
    }
    syncSlots();

    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attribute: kind + dismissed. Iterate records so a
    // change to one attribute doesn't re-evaluate the other (avoids
    // calling `banner.show()` every time `kind` changes).
    const attrMo = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) {
            const name = muts[i].attributeName;
            if (name === "kind") {
                const kindAttr = host.getAttribute("kind");
                if (kindAttr) banner.setKind(kindAttr);
            } else if (name === "dismissed") {
                if (host.hasAttribute("dismissed")) banner.dismiss();
                else                                banner.show();
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["kind", "dismissed"] });

    host._bannerInstance = banner;
    host.show     = () => banner.show();
    host.dismiss  = () => banner.dismiss();
    host.setKind  = (k) => banner.setKind(k);
    host.setOpen  = (b) => banner.setOpen(b);
    Object.defineProperty(host, "isOpen",      { get: () => banner.isOpen(), configurable: true });
    // v1.0.0: `kind` is the canonical accessor (was: `currentKind` in
    // the v0.10 era; alias removed at v1.0).
    Object.defineProperty(host, "kind",        { get: () => banner.kind(), configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        if (_dismissOff) _dismissOff();
        banner.destroy();
    });
});
