// @zakkster/lite-headless / stat / element.js
//
// <lite-stat value="1234" label="Revenue" unit="$" trend-direction="up" trend-value="12.5">
//     <span data-stat-label></span>
//     <strong data-stat-value></strong>
//     <span data-stat-unit></span>
//     <small data-stat-trend></small>
// </lite-stat>

import { define } from "@zakkster/lite-element";
import { createStat } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const el = host.querySelector(sel);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

function parseTrendFromAttrs(host) {
    const dir = host.getAttribute("trend-direction");
    const val = host.getAttribute("trend-value");
    if (dir == null && val == null) return null;
    return { direction: dir || "flat", value: val ? parseFloat(val) : 0 };
}

define("lite-stat", (host, scope) => {
    const initialValue = parseFloat(host.getAttribute("value") || "0");
    const stat = createStat({
        defaultValue: isFinite(initialValue) ? initialValue : 0,
        defaultLabel: host.getAttribute("label") || "",
        defaultUnit: host.getAttribute("unit") || "",
        defaultTrend: parseTrendFromAttrs(host),
        animationDuration: parseInt(host.getAttribute("animation-duration") || "600", 10),
        onValueChange: (next, prev) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value: next, previousValue: prev }, bubbles: true,
            }));
        },
    });

    stat.attachRoot(host);

    const _attached = {
        label: null, labelOff: null,
        value: null, valueOff: null,
        unit:  null, unitOff:  null,
        trend: null, trendOff: null,
    };

    function syncSlots() {
        const pairs = [
            ["label", "[data-stat-label]", stat.attachLabel],
            ["value", "[data-stat-value]", stat.attachValue],
            ["unit",  "[data-stat-unit]",  stat.attachUnit],
            ["trend", "[data-stat-trend]", stat.attachTrend],
        ];
        for (const [key, sel, attacher] of pairs) {
            const el = scopedQuery(host, sel);
            const offKey = key + "Off";
            if (el !== _attached[key]) {
                if (_attached[offKey]) _attached[offKey]();
                _attached[key] = el;
                _attached[offKey] = el ? attacher(el) : null;
            }
        }
    }
    syncSlots();

    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attribute mirrors. Iterate the mutation records and
    // only update the dimension whose attribute actually changed.
    // The earlier version re-evaluated everything on any attribute
    // mutation, including allocating a fresh `{direction, value}`
    // trend object every time, which thrashed the trend signal
    // (object identity changes -> downstream re-paint).
    const attrMo = new MutationObserver((muts) => {
        let touchTrend = false;
        for (let i = 0; i < muts.length; i++) {
            const name = muts[i].attributeName;
            if (name === "value") {
                const v = parseFloat(host.getAttribute("value"));
                if (isFinite(v)) stat.setValue(v);
            } else if (name === "label") {
                stat.setLabel(host.getAttribute("label") || "");
            } else if (name === "unit") {
                stat.setUnit(host.getAttribute("unit") || "");
            } else if (name === "trend-direction" || name === "trend-value") {
                touchTrend = true;
            }
        }
        if (touchTrend) {
            const td = parseTrendFromAttrs(host);
            if (td) stat.setTrend(td);
        }
    });
    attrMo.observe(host, {
        attributes: true,
        attributeFilter: ["value", "label", "unit", "trend-direction", "trend-value"],
    });

    host._statInstance = stat;
    host.setValue = (v) => stat.setValue(v);
    host.setLabel = (s) => stat.setLabel(s);
    host.setUnit  = (s) => stat.setUnit(s);
    host.setTrend = (t) => stat.setTrend(t);
    // v1.0.0: drop `current*` host aliases. The canonical names
    // `value` / `trend` are the only public surface now.
    Object.defineProperty(host, "value",          { get: () => stat.value(),        configurable: true });
    Object.defineProperty(host, "displayValue" , { get: () => stat.displayValue(), configurable: true });
    Object.defineProperty(host, "trend",          { get: () => stat.trend(),        configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        for (const k of ["label", "value", "unit", "trend"]) {
            const offKey = k + "Off";
            if (_attached[offKey]) _attached[offKey]();
        }
        stat.destroy();
    });
});
