// @zakkster/lite-headless / toggle-group / element.js
//
// <lite-toggle-group> wrapping createToggleGroup.
//
// Markup contract:
//
//   <lite-toggle-group type="single" value="grid" aria-label="View mode">
//       <button data-tg-item="list">List</button>
//       <button data-tg-item="grid">Grid</button>
//       <button data-tg-item="card">Card</button>
//   </lite-toggle-group>
//
// Multi mode (comma-separated values):
//
//   <lite-toggle-group type="multi" value="bold,italic">
//       <button data-tg-item="bold">B</button>
//       <button data-tg-item="italic">I</button>
//       <button data-tg-item="underline">U</button>
//   </lite-toggle-group>
//
// Attributes:
//   type            "single" | "multi"      default "single"
//   value           string OR comma-list    initial selection
//   disabled        group-wide disable
//   orientation     "horizontal" | "vertical"
//   loop            arrow nav wraps (default true; set "false" to disable)
//   allow-deselect  single mode: clicking current item deselects
//
// Imperative API on host:
//   host.setValue(v, reason?)
//   host.toggleItem(key, reason?)
//   host.contains(key)
//   host.setDisabled(flag)
//   host.setItemDisabled(key, flag)
//   host.value             -> string | string[]
//   host.disabled          -> boolean
//   host.type              -> "single" | "multi"
//
// Dispatched events:
//   change      { detail: { value, reason } }

import { define } from "@zakkster/lite-element";
import { createToggleGroup } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function parseValue(raw, type) {
    if (raw == null) return type === "single" ? null : [];
    if (type === "single") return raw || null;
    return raw.split(",").map(s => s.trim()).filter(Boolean);
}

function stringifyValue(v) {
    if (v == null) return "";
    if (Array.isArray(v)) return v.join(",");
    return String(v);
}

define("lite-toggle-group", (host, scope) => {
    const type        = host.getAttribute("type") === "multi" ? "multi" : "single";
    const defaultValue = parseValue(host.getAttribute("value"), type);
    const initiallyDisabled = host.hasAttribute("disabled");
    const orientation = host.getAttribute("orientation") === "vertical" ? "vertical" : "horizontal";
    const loop        = host.getAttribute("loop") !== "false";
    const allowDeselect = host.hasAttribute("allow-deselect");

    let _suppressValueEffect = false;

    const tg = createToggleGroup({
        type,
        defaultValue,
        disabled: initiallyDisabled,
        orientation,
        loop,
        allowDeselect,
        onValueChange: (value, reason) => {
            // mirror to host attribute (guarded against cascade)
            _suppressValueEffect = true;
            host.setAttribute("value", stringifyValue(value));
            queueMicrotask(() => { _suppressValueEffect = false; });
            // v1.0.0: only `valuechange` fires now. The legacy `change`
            // event (carryover from v0.10) was removed at v1.0.
            const detail = { value, reason };
            host.dispatchEvent(new CustomEvent("valuechange", { detail, bubbles: true }));
        },
    });

    // Attach root immediately (host is the root)
    const offRoot = tg.attachRoot(host);
    if (initiallyDisabled) tg.setDisabled(true);

    // Role observer: scan for items. belongsToHost protects nested
    // toggle-groups: items inside an inner `<lite-toggle-group>` aren't
    // claimed by the outer one. Iterating with `for (let i ...)` instead
    // of `for (const ... of)` avoids allocating an iterator object per
    // scan.
    const _attached = new Map();   // key -> { el, off }
    function syncItems() {
        const itemEls = host.querySelectorAll("[data-tg-item]");
        const seenKeys = new Set();
        for (let i = 0; i < itemEls.length; i++) {
            const el = itemEls[i];
            if (!belongsToHost(el, host)) continue;
            const key = el.getAttribute("data-tg-item");
            if (!key) continue;
            seenKeys.add(key);
            const prev = _attached.get(key);
            if (prev && prev.el === el) continue;
            // detach previous if a stale element
            if (prev) { try { prev.off(); } catch {} }
            const opts = { disabled: el.hasAttribute("data-disabled") || el.hasAttribute("disabled") };
            const off = tg.attachItem(el, key, opts);
            _attached.set(key, { el, off });
        }
        // Detach removed items
        for (const [key, entry] of _attached) {
            if (!seenKeys.has(key)) {
                try { entry.off(); } catch {}
                _attached.delete(key);
            }
        }
    }
    syncItems();
    const childMo = new MutationObserver(syncItems);
    childMo.observe(host, { childList: true, subtree: true });

    // Observe host attributes
    const attrMo = new MutationObserver((muts) => {
        if (_suppressValueEffect) return;
        for (const m of muts) {
            if (m.attributeName === "value") {
                tg.setValue(parseValue(host.getAttribute("value"), type), "attribute");
            } else if (m.attributeName === "disabled") {
                tg.setDisabled(host.hasAttribute("disabled"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["value", "disabled"] });

    // Expose imperative API
    host._toggleGroupInstance = tg;
    host.setValue        = (v, r) => tg.setValue(v, r);
    host.toggleItem      = (k, r) => tg.toggleItem(k, r);
    host.contains        = (k) => tg.contains(k);
    host.setDisabled     = (f) => tg.setDisabled(f);
    host.setItemDisabled = (k, f) => tg.setItemDisabled(k, f);
    Object.defineProperty(host, "value",    { get: () => tg.value(),    configurable: true });
    Object.defineProperty(host, "disabled", { get: () => tg.disabled(), configurable: true });
    Object.defineProperty(host, "type",     { get: () => tg.type,       configurable: true });

    scope.onCleanup(() => {
        childMo.disconnect();
        attrMo.disconnect();
        offRoot();
        tg.destroy();
    });
});
