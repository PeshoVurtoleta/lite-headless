// @zakkster/lite-headless / steps / element.js
//
// <lite-steps orientation="horizontal" current="0">
//     <ol>
//         <li data-step-id="account">Account</li>
//         <li data-step-id="billing">Billing</li>
//         <li data-step-id="review">Review</li>
//     </ol>
//     <button data-step-prev>Back</button>
//     <button data-step-next>Continue</button>
// </lite-steps>

import { define } from "@zakkster/lite-element";
import { createSteps } from "./index.js";
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

define("lite-steps", (host, scope) => {
    // Discover initial steps from markup (any element with data-step-id).
    const initial = [];
    for (const el of scopedQueryAll(host, "[data-step-id]")) {
        initial.push({
            id: el.getAttribute("data-step-id"),
            title: el.getAttribute("data-step-title") || el.textContent.trim(),
        });
    }

    const currentAttr = parseInt(host.getAttribute("current") || "0", 10);

    const steps = createSteps({
        steps: initial,
        defaultCurrent: Number.isFinite(currentAttr) ? currentAttr : 0,
        orientation: host.getAttribute("orientation") || "horizontal",
        allowBack: !host.hasAttribute("no-back"),
        allowSkip: host.hasAttribute("allow-skip"),
        onStepChange: (nextIdx, prevIdx, reason) => {
            host.dispatchEvent(new CustomEvent("stepchange", {
                detail: { current: nextIdx, previous: prevIdx, reason }, bubbles: true,
            }));
        },
        onComplete: () => {
            host.dispatchEvent(new CustomEvent("complete", { bubbles: true }));
        },
    });

    steps.attachRoot(host);

    const _stepOffs = new Map();   // el -> off
    const _attached = {
        nextBtn: null, nextOff: null,
        prevBtn: null, prevOff: null,
    };

    function syncSlots() {
        // Steps
        const els = scopedQueryAll(host, "[data-step-id]");
        const seen = new Set();
        for (const el of els) {
            seen.add(el);
            if (_stepOffs.has(el)) continue;
            const id = el.getAttribute("data-step-id");
            if (!id) continue;
            // Register if new
            if (!steps.getStep(id)) {
                const cur = steps.steps().slice();
                cur.push({ id, title: el.textContent.trim() });
                steps.setSteps(cur);
            }
            _stepOffs.set(el, steps.attachStep(el, id));
        }
        for (const [el, off] of _stepOffs) {
            if (!seen.has(el)) { off(); _stepOffs.delete(el); }
        }
        // Next + prev buttons
        const next = scopedQuery(host, "[data-step-next]");
        if (next !== _attached.nextBtn) {
            if (_attached.nextOff) _attached.nextOff();
            _attached.nextBtn = next;
            _attached.nextOff = next ? steps.attachNextButton(next) : null;
        }
        const prev = scopedQuery(host, "[data-step-prev]");
        if (prev !== _attached.prevBtn) {
            if (_attached.prevOff) _attached.prevOff();
            _attached.prevBtn = prev;
            _attached.prevOff = prev ? steps.attachPrevButton(prev) : null;
        }
    }
    syncSlots();

    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attributes
    const attrMo = new MutationObserver(() => {
        const v = parseInt(host.getAttribute("current") || "0", 10);
        if (Number.isFinite(v)) steps.setCurrent(v, "attribute");
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["current"] });

    host._stepsInstance = steps;
    host.next            = () => steps.next();
    host.prev            = () => steps.prev();
    host.setCurrent      = (i) => steps.setCurrent(i, "api");
    host.setCurrentById  = (id) => steps.setCurrentById(id, "api");
    host.setStepStatus   = (id, st) => steps.setStepStatus(id, st);
    host.clearAllErrors  = () => steps.clearAllErrors();
    host.reset           = () => steps.reset();
    // v1.0.0: drop `current*` host aliases. The canonical names
    // `index` / `step` are the only public surface now.
    Object.defineProperty(host, "index",        { get: () => steps.current(),     configurable: true });
    Object.defineProperty(host, "currentStep",         { get: () => steps.currentStep(), configurable: true });
    Object.defineProperty(host, "isComplete",   { get: () => steps.isComplete(),  configurable: true });
    Object.defineProperty(host, "progress",     { get: () => steps.progress(),    configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        for (const off of _stepOffs.values()) { try { off(); } catch {} }
        _stepOffs.clear();
        if (_attached.nextOff) _attached.nextOff();
        if (_attached.prevOff) _attached.prevOff();
        steps.destroy();
    });
});
