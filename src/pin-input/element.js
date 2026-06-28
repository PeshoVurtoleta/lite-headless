// @zakkster/lite-headless / pin-input / element.js
//
// <lite-pin-input> wrapping createPinInput.
//
//   <lite-pin-input length="6" type="numeric" aria-label="2FA code">
//       <input data-pin-slot> <input data-pin-slot> ...
//   </lite-pin-input>
//
// Reactive attributes:
//   length             1..16; default 6 (read once on attach)
//   type               "numeric" | "alphanumeric"; default "numeric"
//   aria-label         passed to the root group
//
// Imperative API on host:
//   host.value         (getter) -- current string
//   host.isComplete    (getter)
//   host.position      (getter)
//   host.setValue(s)
//   host.clear()
//   host.submit()
//   host.focusInput(i)
//
// Events:
//   change             { value: string, isComplete: boolean }
//   complete           { value: string }

import { define } from "@zakkster/lite-element";
import { createPinInput } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

// Scoped-query helper. Returns only descendants owned by THIS host
// instance, not a nested `<lite-pin-input>` further down.
function scopedQueryAll(host, sel) {
    const all = host.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-pin-input", (host, scope) => {
    const length = Number(host.getAttribute("length")) || 6;
    const typeAttr = host.getAttribute("type") || "numeric";
    const ariaLabel = host.getAttribute("aria-label") || "One-time code";

    const pin = createPinInput({
        length,
        type: typeAttr === "alphanumeric" ? "alphanumeric" : "numeric",
        ariaLabel,
        onChange: (value, isComplete) => {
            host.dispatchEvent(new CustomEvent("change", {
                detail: { value, isComplete },
                bubbles: true,
            }));
        },
        onComplete: (value) => {
            host.dispatchEvent(new CustomEvent("complete", {
                detail: { value },
                bubbles: true,
            }));
        },
    });

    pin.attachRoot(host);

    // Auto-attach descendant inputs marked `data-pin-slot`. Assigns indices
    // in document order. We watch for DOM changes (template hydration,
    // dynamic shadow content) and re-attach as inputs appear.
    // belongsToHost guard: a `<lite-pin-input>` nested inside another
    // keeps its own `[data-pin-slot]` inputs instead of having them
    // claimed by the outer instance.
    const _attached = new Map();      // el -> off()
    function syncSlots() {
        const slots = scopedQueryAll(host, "[data-pin-slot]");
        let ownIdx = 0;
        for (let i = 0; i < slots.length; i++) {
            const el = slots[i];
            if (ownIdx >= length) break;
            if (!_attached.has(el)) {
                _attached.set(el, pin.attachInput(el, ownIdx));
            }
            ownIdx++;
        }
        // Detach removed inputs.
        for (const [el, off] of _attached) {
            if (!host.contains(el)) {
                off();
                _attached.delete(el);
            }
        }
    }
    syncSlots();
    const mo = new MutationObserver(syncSlots);
    mo.observe(host, { childList: true, subtree: true });

    // Imperative surface
    host._pinInstance = pin;
    host.setValue    = (s) => pin.setValue(s);
    host.clear       = () => pin.clear();
    host.submit      = () => pin.submit();
    host.focusInput  = (i) => pin.focusInput(i);
    Object.defineProperty(host, "value",      { get: () => pin.value(),      configurable: true });
    Object.defineProperty(host, "isComplete", { get: () => pin.isComplete(), configurable: true });
    Object.defineProperty(host, "position",   { get: () => pin.position(),   configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        for (const off of _attached.values()) off();
        _attached.clear();
        pin.destroy();
    });
});
