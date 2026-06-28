// @zakkster/lite-headless / card / element.js
//
// <lite-card collapsible dismissible label="Recent orders">
//     <div data-card-header>
//         Title
//         <button data-card-collapse-trigger>−</button>
//         <button data-card-dismiss>×</button>
//     </div>
//     <div data-card-body>...</div>
//     <div data-card-footer>...</div>
// </lite-card>
//
// The wrapper uses syncSlots + MutationObserver + belongsToHost so
// dynamically-injected slots (body, trigger, dismiss button) get
// detected after mount and nested cards don't poach each other's slots.

import { define } from "@zakkster/lite-element";
import { createCard } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const matches = host.querySelectorAll(sel);
    for (let i = 0; i < matches.length; i++) {
        if (belongsToHost(matches[i], host)) return matches[i];
    }
    return null;
}

define("lite-card", (host, scope) => {
    const card = createCard({
        collapsible: host.hasAttribute("collapsible"),
        dismissible: host.hasAttribute("dismissible"),
        collapsed:   host.hasAttribute("collapsed"),
        dismissed:   host.hasAttribute("dismissed"),
        label:       host.getAttribute("label") || undefined,
        onCollapseChange: (collapsed, reason) => {
            host.dispatchEvent(new CustomEvent("collapsechange", {
                detail: { collapsed, reason }, bubbles: true,
            }));
        },
        onDismiss: (reason) => {
            host.dispatchEvent(new CustomEvent("dismiss", {
                detail: { reason }, bubbles: true,
            }));
        },
    });
    const offRoot = card.attachRoot(host);

    // Track which slot is currently attached so re-scans are diffs.
    let _bodyEl = null, _bodyOff = null;
    let _triggerEl = null, _triggerOff = null;
    let _dismissEl = null, _dismissOff = null;

    function syncSlots() {
        const body = scopedQuery(host, "[data-card-body]");
        if (body !== _bodyEl) {
            if (_bodyOff) _bodyOff();
            _bodyEl = body;
            _bodyOff = body ? card.attachBody(body) : null;
        }
        if (host.hasAttribute("collapsible")) {
            // Trigger: explicit [data-card-collapse-trigger], else the
            // header element itself (so clicking anywhere in the header
            // toggles).
            const trigger = scopedQuery(host, "[data-card-collapse-trigger]")
                         || scopedQuery(host, "[data-card-header]");
            if (trigger !== _triggerEl) {
                if (_triggerOff) _triggerOff();
                _triggerEl = trigger;
                _triggerOff = trigger ? card.attachCollapseTrigger(trigger) : null;
            }
        }
        if (host.hasAttribute("dismissible")) {
            const dismiss = scopedQuery(host, "[data-card-dismiss]");
            if (dismiss !== _dismissEl) {
                if (_dismissOff) _dismissOff();
                _dismissEl = dismiss;
                _dismissOff = dismiss ? card.attachDismissButton(dismiss) : null;
            }
        }
    }
    syncSlots();
    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attributes
    let _suppress = false;
    const attrMo = new MutationObserver((muts) => {
        if (_suppress) return;
        for (const mut of muts) {
            if (mut.attributeName === "collapsed") {
                card.setCollapsed(host.hasAttribute("collapsed"), "attribute");
            }
            if (mut.attributeName === "dismissed" && host.hasAttribute("dismissed")) {
                card.dismiss("attribute");
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["collapsed", "dismissed"] });

    // Mirror state -> attribute (so CSS can use [collapsed] on the host too)
    const stopMirror = (() => {
        let lastC = card.isCollapsed(), lastD = card.isDismissed();
        const sync = () => {
            const c = card.isCollapsed(), d = card.isDismissed();
            _suppress = true;
            if (c !== lastC) {
                if (c) host.setAttribute("collapsed", "");
                else host.removeAttribute("collapsed");
                lastC = c;
            }
            if (d !== lastD) {
                if (d) host.setAttribute("dismissed", "");
                else host.removeAttribute("dismissed");
                lastD = d;
            }
            queueMicrotask(() => { _suppress = false; });
        };
        // Listen on the card's events to mirror cheaply
        host.addEventListener("collapsechange", sync);
        host.addEventListener("dismiss", sync);
        return () => {
            host.removeEventListener("collapsechange", sync);
            host.removeEventListener("dismiss", sync);
        };
    })();

    // Imperative
    host._cardInstance = card;
    host.toggle    = (r) => card.toggle(r);
    host.collapse  = (r) => card.setCollapsed(true, r || "api");
    host.expand    = (r) => card.setCollapsed(false, r || "api");
    host.dismiss   = (r) => card.dismiss(r);
    host.reopen    = () => card.reopen();
    Object.defineProperty(host, "isCollapsed", { get: () => card.isCollapsed(), configurable: true });
    Object.defineProperty(host, "isDismissed", { get: () => card.isDismissed(), configurable: true });

    return () => {
        stopMirror();
        mo.disconnect();
        attrMo.disconnect();
        if (_bodyOff) _bodyOff();
        if (_triggerOff) _triggerOff();
        if (_dismissOff) _dismissOff();
        offRoot();
        card.destroy();
    };
});
