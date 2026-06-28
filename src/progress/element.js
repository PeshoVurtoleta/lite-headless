// @zakkster/lite-headless / progress / element.js
//
// <lite-progress> wrapping createProgress.
//
//   <lite-progress value="42" max="100" variant="linear" label="Uploading">
//       <div data-progress-bar></div>
//   </lite-progress>
//
//   <lite-progress value="42" max="100" variant="circular" label="Saving">
//       <svg viewBox="0 0 36 36">
//           <circle data-progress-track cx="18" cy="18" r="16" />
//           <circle data-progress-indicator cx="18" cy="18" r="16" />
//       </svg>
//   </lite-progress>
//
// Reactive attributes:
//   value             current value (default 0)
//   min               lower bound (default 0)
//   max               upper bound (default 100)
//   variant           "linear" or "circular" (default "linear")
//   indeterminate     flag attribute
//   label             aria-label
//   value-text        custom aria-valuetext (overrides auto "NN%")
//
// Imperative API on host:
//   host.setValue(n)
//   host.setMin(n) / host.setMax(n)
//   host.setIndeterminate(b)
//   host.setValueText(s)
//   host.value          // accessor
//   host.fraction       // 0..1 accessor
//   host.isComplete     // boolean accessor
//
// Events:
//   change              { detail: { value, fraction } }
//   complete            { detail: {} }

import { define } from "@zakkster/lite-element";
import { createProgress } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function parseNum(raw, fallback) {
    if (raw === null) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
}

// Same scope-guarded selector wrapper used elsewhere: rejects a hit
// that lives inside a nested `<lite-*>` so an outer progress can't
// steal an inner progress's bar/indicator.
function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-progress", (host, scope) => {
    const variant = host.getAttribute("variant") || "linear";
    const value = parseNum(host.getAttribute("value"), 0);
    const min   = parseNum(host.getAttribute("min"), 0);
    const max   = parseNum(host.getAttribute("max"), 100);
    const indeterminate = host.hasAttribute("indeterminate");
    const label     = host.getAttribute("label") || null;
    const valueText = host.getAttribute("value-text");

    const pg = createProgress({
        value, min, max, indeterminate, variant, label,
        valueText: valueText || null,
        onChange: (v, f) => {
            host.dispatchEvent(new CustomEvent("change", {
                detail: { value: v, fraction: f }, bubbles: true,
            }));
        },
        onComplete: () => {
            host.dispatchEvent(new CustomEvent("complete", { detail: {}, bubbles: true }));
        },
    });

    // Attach host as root
    pg.attachRoot(host);

    // Auto-attach bar / indicator on first-paint and on DOM changes.
    // scopedQuery skips matches inside a nested `<lite-progress>`.
    const _attached = { bar: null, indicator: null };
    function syncRoles() {
        const bar = scopedQuery(host, "[data-progress-bar]");
        const ind = scopedQuery(host, "[data-progress-indicator]");
        // For HTML attribute, the consumer may write data-progress-bar
        // declaratively (it just acts as a selector hook). The primitive's
        // attachBar sets it again, no harm.
        if (bar && _attached.bar !== bar) { pg.attachBar(bar); _attached.bar = bar; }
        if (ind && _attached.indicator !== ind) { pg.attachIndicator(ind); _attached.indicator = ind; }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // React to attribute changes on the host. Dirty-flag collapse:
    // a framework that writes value+min+max in one render tick produces
    // three mutation records, but we coalesce them into a single
    // microtask-deferred resync. Each resync reads each attribute exactly
    // once, regardless of how many writes hit. The trade is one
    // microtask of latency in exchange for O(1) work per burst.
    const _dirty = { value: false, min: false, max: false, indeterminate: false, valueText: false };
    let _scheduled = false;
    function _flushAttrs() {
        _scheduled = false;
        if (_dirty.value)         { _dirty.value = false;         pg.setValue(parseNum(host.getAttribute("value"), 0)); }
        if (_dirty.min)           { _dirty.min = false;           pg.setMin(parseNum(host.getAttribute("min"), 0)); }
        if (_dirty.max)           { _dirty.max = false;           pg.setMax(parseNum(host.getAttribute("max"), 100)); }
        if (_dirty.indeterminate) { _dirty.indeterminate = false; pg.setIndeterminate(host.hasAttribute("indeterminate")); }
        if (_dirty.valueText)     { _dirty.valueText = false;     pg.setValueText(host.getAttribute("value-text")); }
    }
    const attrMo = new MutationObserver((muts) => {
        for (let i = 0; i < muts.length; i++) {
            const name = muts[i].attributeName;
            if (name === "value")              _dirty.value = true;
            else if (name === "min")           _dirty.min = true;
            else if (name === "max")           _dirty.max = true;
            else if (name === "indeterminate") _dirty.indeterminate = true;
            else if (name === "value-text")    _dirty.valueText = true;
        }
        if (!_scheduled) {
            _scheduled = true;
            queueMicrotask(_flushAttrs);
        }
    });
    attrMo.observe(host, {
        attributes: true,
        attributeFilter: ["value", "min", "max", "indeterminate", "value-text"],
    });

    // Imperative surface
    host._progressInstance = pg;
    host.setValue = (n) => pg.setValue(n);
    host.setMin = (n) => pg.setMin(n);
    host.setMax = (n) => pg.setMax(n);
    host.setIndeterminate = (b) => pg.setIndeterminate(b);
    host.setValueText = (s) => pg.setValueText(s);
    Object.defineProperty(host, "value",      { get: () => pg.value(),      configurable: true });
    Object.defineProperty(host, "fraction",   { get: () => pg.fraction(),   configurable: true });
    Object.defineProperty(host, "isComplete", { get: () => pg.isComplete(), configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        pg.destroy();
    });
});
