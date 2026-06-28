// @zakkster/lite-headless / rating / element.js
//
// <lite-rating value="3" max="5" step="1">
//     <button data-rating-item="1">★</button>
//     <button data-rating-item="2">★</button>
//     <button data-rating-item="3">★</button>
//     <button data-rating-item="4">★</button>
//     <button data-rating-item="5">★</button>
// </lite-rating>

import { define } from "@zakkster/lite-element";
import { createRating } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQueryAll(host, sel) {
    const all = host.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}
function scopedQuery(host, sel) {
    const el = host.querySelector(sel);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-rating", (host, scope) => {
    const valueAttr = parseFloat(host.getAttribute("value") || "0");
    const maxAttr = parseInt(host.getAttribute("max") || "5", 10);
    const stepAttr = parseFloat(host.getAttribute("step") || "1");

    const rating = createRating({
        max: Number.isFinite(maxAttr) && maxAttr > 0 ? maxAttr : 5,
        defaultValue: Number.isFinite(valueAttr) ? valueAttr : 0,
        step: stepAttr === 0.5 ? 0.5 : 1,
        readOnly: host.hasAttribute("read-only"),
        clearable: host.hasAttribute("clearable"),
        ariaLabel: host.getAttribute("aria-label") || "Rating",
        onValueChange: (next, prev, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value: next, previousValue: prev, reason }, bubbles: true,
            }));
        },
    });

    rating.attachRoot(host);

    const _itemOffs = new Map();
    let _railEl = null;
    let _railOff = null;

    function syncSlots() {
        const items = scopedQueryAll(host, "[data-rating-item]");
        const seen = new Set();
        for (const el of items) {
            seen.add(el);
            if (_itemOffs.has(el)) continue;
            const idx = parseInt(el.getAttribute("data-rating-item"), 10);
            if (!Number.isFinite(idx)) continue;
            _itemOffs.set(el, rating.attachItem(el, idx));
        }
        for (const [el, off] of _itemOffs) {
            if (!seen.has(el)) { off(); _itemOffs.delete(el); }
        }
        // Optional rail for half-step pointer support.
        const rail = scopedQuery(host, "[data-rating-rail]");
        if (rail !== _railEl) {
            if (_railOff) _railOff();
            _railEl = rail;
            _railOff = rail ? rating.attachRail(rail) : null;
        }
    }
    syncSlots();

    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attributes. Iterate records so a `value` change
    // doesn't also re-call setReadOnly (idempotent but wasteful).
    const attrMo = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) {
            const name = muts[i].attributeName;
            if (name === "value") {
                const v = parseFloat(host.getAttribute("value"));
                if (Number.isFinite(v)) rating.setValue(v, "attribute");
            } else if (name === "read-only") {
                rating.setReadOnly(host.hasAttribute("read-only"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["value", "read-only"] });

    host._ratingInstance = rating;
    host.setValue     = (v) => rating.setValue(v, "api");
    host.clear        = () => rating.clear();
    host.setReadOnly  = (b) => rating.setReadOnly(b);
    Object.defineProperty(host, "value",        { get: () => rating.value(),        configurable: true });
    Object.defineProperty(host, "displayValue",  { get: () => rating.displayValue(), configurable: true });
    Object.defineProperty(host, "isReadOnly",    { get: () => rating.isReadOnly(),   configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        for (const off of _itemOffs.values()) { try { off(); } catch {} }
        _itemOffs.clear();
        if (_railOff) _railOff();
        rating.destroy();
    });
});
