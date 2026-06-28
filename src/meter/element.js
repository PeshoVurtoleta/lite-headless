// @zakkster/lite-headless / meter / element.js
//
// <lite-meter value="0.42" min="0" max="1" low="0.3" high="0.7" label="Battery">
//     <div data-meter-fill></div>
// </lite-meter>
//
// The fill discovery uses syncSlots + MutationObserver + belongsToHost
// (the same pattern used by banner / form-field / split-panels). Without
// this, dynamically-injected fills are invisible to the wrapper, and a
// nested <lite-meter> inside a fill template would have its fills
// hijacked by the outer meter.

import { define } from "@zakkster/lite-element";
import { createMeter } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function parseN(s, dflt) {
    const n = parseFloat(s);
    return isFinite(n) ? n : dflt;
}

function scopedQueryAll(host, sel) {
    const out = [];
    const all = host.querySelectorAll(sel);
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-meter", (host, scope) => {
    const m = createMeter({
        value:     parseN(host.getAttribute("value"), 0),
        min:       parseN(host.getAttribute("min"),   0),
        max:       parseN(host.getAttribute("max"),   1),
        low:       host.hasAttribute("low")     ? parseN(host.getAttribute("low"), null)     : null,
        high:      host.hasAttribute("high")    ? parseN(host.getAttribute("high"), null)    : null,
        optimum:   host.hasAttribute("optimum") ? parseN(host.getAttribute("optimum"), null) : null,
        valueText: host.getAttribute("value-text") || undefined,
        label:     host.getAttribute("label") || undefined,
    });
    const offRoot = m.attachRoot(host);

    // Fill registry: track which elements we've attached so re-scans
    // are diffs (attach new, detach removed) rather than reattaches.
    const _fillOffs = new Map();   // el -> off()

    function syncSlots() {
        const fillEls = scopedQueryAll(host, "[data-meter-fill]");
        const seen = new Set();
        for (let i = 0; i < fillEls.length; i++) {
            const el = fillEls[i];
            seen.add(el);
            if (!_fillOffs.has(el)) {
                _fillOffs.set(el, m.attachFill(el));
            }
        }
        // Detach any previously-tracked fills that are gone.
        for (const [el, off] of _fillOffs) {
            if (!seen.has(el)) {
                try { off(); } catch {}
                _fillOffs.delete(el);
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
            if (mut.attributeName === "value") {
                m.setValue(parseN(host.getAttribute("value"), 0));
            } else if (mut.attributeName === "value-text") {
                m.setValueText(host.getAttribute("value-text") || null);
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["value", "value-text"] });

    // Imperative
    host._meterInstance = m;
    host.setValue = (v) => {
        _suppress = true;
        host.setAttribute("value", String(v));
        queueMicrotask(() => { _suppress = false; });
        m.setValue(v);
    };
    host.setValueText = (t) => m.setValueText(t);
    Object.defineProperty(host, "value",    { get: () => m.value(),    configurable: true });
    Object.defineProperty(host, "fraction", { get: () => m.fraction(), configurable: true });
    Object.defineProperty(host, "state",    { get: () => m.state(),    configurable: true });

    return () => {
        mo.disconnect();
        attrMo.disconnect();
        for (const off of _fillOffs.values()) { try { off(); } catch {} }
        _fillOffs.clear();
        offRoot();
        m.destroy();
    };
});
