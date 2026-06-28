// @zakkster/lite-headless / accordion / element.js
//
// <lite-accordion type="single" collapsible value="billing">
//     <div data-accordion-item="overview">
//         <button data-accordion-trigger="overview">Overview</button>
//         <div data-accordion-panel="overview">overview content</div>
//     </div>
//     <div data-accordion-item="settings">
//         <button data-accordion-trigger="settings">Settings</button>
//         <div data-accordion-panel="settings">settings content</div>
//     </div>
//     <div data-accordion-item="billing" data-disabled>
//         <button data-accordion-trigger="billing">Billing</button>
//         <div data-accordion-panel="billing">billing content</div>
//     </div>
// </lite-accordion>
//
// Discovers [data-accordion-item], [data-accordion-trigger="<key>"], and
// [data-accordion-panel="<key>"] via createRoleObserver so dynamically
// inserted items wire automatically (lazy-loaded routes / async data).
//
// Attribute -> option mapping:
//   type          -> "single" | "multiple"  (default single)
//   collapsible   -> boolean attribute      (default false; single-mode only)
//   value         -> reactive sync via useAttr ("a" for single,
//                    JSON-encoded "[a,b]" or "a,b" for multiple)
//
// Each item supports:
//   data-disabled        -- mark the item's trigger disabled
//
// Dispatches CustomEvent('valuechange', { detail: { value, reason } }).

import { define } from "@zakkster/lite-element";
import { effect } from "@zakkster/lite-signal";
import { createAccordion } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-accordion-item],[data-accordion-trigger],[data-accordion-panel]";

function parseAttrValue(raw, type) {
    if (raw == null) return type === "multiple" ? [] : null;
    if (type === "single") return raw === "" ? null : raw;
    // multiple: accept JSON array, comma-separated, or single key.
    // Empty string -> []
    if (raw === "") return [];
    if (raw.startsWith("[")) {
        try { const arr = JSON.parse(raw); if (Array.isArray(arr)) return arr.map(String); } catch {}
    }
    if (raw.indexOf(",") !== -1) {
        return raw.split(",").map(s => s.trim()).filter(Boolean);
    }
    return [raw];
}

function serializeValue(v, type) {
    if (type === "single") return v == null ? "" : String(v);
    if (!Array.isArray(v)) return "";
    // pick comma-separated when no key contains a comma; otherwise JSON.
    // Comma is more readable in HTML attribute inspectors.
    const hasComma = v.some(k => String(k).indexOf(",") !== -1);
    return hasComma ? JSON.stringify(v) : v.join(",");
}

define("lite-accordion", (host, scope) => {
    const type = host.getAttribute("type") === "multiple" ? "multiple" : "single";
    const collapsible = host.hasAttribute("collapsible");
    const initial = parseAttrValue(host.getAttribute("value"), type);

    // v0.7.12: re-entrance guard. The `reason !== "attribute"` mirror
    // guard above is necessary but not sufficient. Under chromium with
    // lite-signal's effect-queue propagation, calling
    // host.setAttribute(...) INSIDE onValueChange (which runs INSIDE
    // _value.set's flush chain) causes the useAttr effect to fire
    // TWICE — once before the attribute has actually settled to the
    // new value (signal-side traces show this is a real re-entrance,
    // not a stale read: valueAttr(), attrSig.peek(), and
    // host.getAttribute() all agree at each run, but the signal
    // genuinely transitions twice). Final primitive.value is always
    // correct, but each cascade dispatches an extra "valuechange"
    // CustomEvent with stale `detail`, breaking consumers that
    // listen to `e.detail.value`.
    //
    // The fix is a re-entrance flag: set it before our own
    // setAttribute, unset it on the next microtask. The useAttr
    // effect honors the flag and bails. External setAttribute calls
    // (consumer-driven, route sync, etc.) leave the flag false and
    // pass through normally.
    //
    // Root cause is in the lite-signal / lite-element effect-queue
    // interaction and is documented for a separate focused debug
    // pass. This wrapper-side fix shields all consumers cleanly.
    let _suppressValueEffect = false;
    let _firstValueRun = true;

    const acc = createAccordion({
        type, collapsible,
        defaultValue: initial,
        onValueChange: (value, reason) => {
            if (reason !== "attribute") {
                const ser = serializeValue(value, type);
                if (host.getAttribute("value") !== ser) {
                    _suppressValueEffect = true;
                    host.setAttribute("value", ser);
                    queueMicrotask(() => { _suppressValueEffect = false; });
                }
            }
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value, reason }, bubbles: true,
            }));
        },
    });

    // Reactive sync from the host's `value` attribute (route-sync use case).
    const valueAttr = scope.useAttr("value");
    const stopValueAttr = effect(() => {
        const raw = valueAttr();
        if (_firstValueRun) { _firstValueRun = false; return; }
        if (_suppressValueEffect) return;          // v0.7.12 cascade guard
        const parsed = parseAttrValue(raw, type);
        acc.setValue(parsed, "attribute");
    });

    // The host itself is the "root" -- it doesn't carry a role marker
    // matching ROLE_SEL, so the role observer wouldn't pick it up; we
    // attach it explicitly here. This writes data-orientation +
    // data-accordion-type for CSS hooks.
    const detachRoot = acc.attachRoot(host);

    // Role observer for [data-accordion-item], [data-accordion-trigger],
    // [data-accordion-panel]. Same pattern as every other wrapper.
    const roles = createRoleObserver(host, ROLE_SEL, (node) => {
        if (node.matches("[data-accordion-item]")) {
            // The attribute value is the key.
            const key = node.getAttribute("data-accordion-item");
            if (!key) return null;
            return acc.attachItem(node, key);
        }
        if (node.matches("[data-accordion-trigger]")) {
            const key = node.getAttribute("data-accordion-trigger");
            if (!key) return null;
            // disabled comes from the item OR the trigger
            const disabled = node.hasAttribute("data-disabled") ||
                node.hasAttribute("disabled") ||
                node.closest("[data-accordion-item][data-disabled]") != null;
            return acc.attachTrigger(node, key, { disabled });
        }
        if (node.matches("[data-accordion-panel]")) {
            const key = node.getAttribute("data-accordion-panel");
            if (!key) return null;
            return acc.attachPanel(node, key);
        }
        return null;
    });
    roles.rescan();

    // Expose primitive instance + ergonomic accessors
    host._accordionInstance = acc;
    host.toggle      = (key, reason) => acc.toggle(key, reason);
    host.open        = (key, reason) => acc.open(key, reason);
    host.close       = (key, reason) => acc.close(key, reason);
    host.setValue    = (v, reason)   => acc.setValue(v, reason);
    host.setDisabled = (key, flag)   => acc.setDisabled(key, flag);
    Object.defineProperty(host, "value", {
        get: () => acc.value(),
        set: (v) => acc.setValue(v, "property"),
        configurable: true,
    });

    scope.onCleanup(() => {
        stopValueAttr();
        detachRoot();
        roles.disconnect();
        acc.destroy();
    });
}, { observedAttributes: ["value"] });
