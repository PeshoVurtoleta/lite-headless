// @zakkster/lite-headless / color-picker / element.js
//
// <lite-color-picker> wrapper. Declarative slot markers:
//
//   <lite-color-picker value="#7dd3fc">
//       <div data-color-area>
//           <div data-color-area-handle></div>
//       </div>
//       <div data-color-hue-slider>
//           <div data-color-hue-handle></div>
//       </div>
//       <div data-color-alpha-slider>
//           <div data-color-alpha-handle></div>
//       </div>
//       <button data-color-swatch data-color="#ff5500">…</button>
//       <button data-color-swatch data-color="#00aaff">…</button>
//   </lite-color-picker>
//
// Reactive attributes:
//   - `value="#rrggbb"` sets the color via hex
//   - `alpha="false"` disables the alpha channel (alpha rail/handle silently no-op)
//
// Host accessors (canonical per docs/CSS_CONTRACT.md):
//   host.hex, host.rgb, host.hsv, host.hsl, host.oklch  (read; pure objects)
//   host.hue, host.saturation, host.brightness, host.alpha (numbers)
//   host.setHex(s), host.setRgb(o), host.setHsv(o), host.setOklch(o), host.setAlpha(n)
//   host._colorPickerInstance (advanced)
//
// Events:
//   valuechange  { detail: { hsv: {h,s,v,a}, hex, rgb, oklch, reason } }
//   commit       { detail: { ...same shape... } } -- fires on dragend / swatch click

import { define } from "@zakkster/lite-element";
import { createColorPicker } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQueryAll(host, selector) {
    const all = host.querySelectorAll(selector);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-color-picker", (host, scope) => {
    const supportsAlpha = host.getAttribute("alpha") !== "false";
    const valueAttr     = host.getAttribute("value");

    let _suppressValueAttr = false;
    const cp = createColorPicker({
        alpha: supportsAlpha,
        defaultHex: valueAttr || undefined,
        onValueChange: (state, reason) => {
            const detail = {
                hsv:   { h: state.h, s: state.s, v: state.v, a: state.a },
                hex:   cp.hex(),
                rgb:   cp.rgb(),
                oklch: cp.oklch(),
                reason,
            };
            // Mirror to `value` attribute (hex form). Guarded against
            // the attribute observer firing right back at us.
            _suppressValueAttr = true;
            host.setAttribute("value", detail.hex);
            queueMicrotask(() => { _suppressValueAttr = false; });
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail, bubbles: true,
            }));
        },
        onCommit: (state, reason) => {
            const detail = {
                hsv:   { h: state.h, s: state.s, v: state.v, a: state.a },
                hex:   cp.hex(),
                rgb:   cp.rgb(),
                oklch: cp.oklch(),
                reason,
            };
            host.dispatchEvent(new CustomEvent("commit", {
                detail, bubbles: true,
            }));
        },
    });

    // Root is the host element itself.
    const offRoot = cp.attachRoot(host);

    // Track per-slot attached elements for declarative discovery.
    const _attached = new Map();    // el -> off()

    function attachSlot(el) {
        if (_attached.has(el)) return;
        let off = null;
        if (el.hasAttribute("data-color-area"))         off = cp.attachArea(el);
        else if (el.hasAttribute("data-color-area-handle"))   off = cp.attachAreaHandle(el);
        else if (el.hasAttribute("data-color-hue-slider"))    off = cp.attachHueSlider(el, el.getAttribute("data-orientation"));
        else if (el.hasAttribute("data-color-hue-handle"))    off = cp.attachHueHandle(el);
        else if (el.hasAttribute("data-color-alpha-slider"))  off = cp.attachAlphaSlider(el, el.getAttribute("data-orientation"));
        else if (el.hasAttribute("data-color-alpha-handle"))  off = cp.attachAlphaHandle(el);
        else if (el.hasAttribute("data-color-swatch")) {
            const color = el.getAttribute("data-color");
            off = cp.attachSwatch(el, color);
        }
        if (off) _attached.set(el, off);
    }

    function detachSlot(el) {
        const off = _attached.get(el);
        if (off) { try { off(); } catch {} _attached.delete(el); }
    }

    // Initial pass: discover existing slot elements.
    function discoverAll() {
        const seen = new Set();
        const sel = [
            "[data-color-area]", "[data-color-area-handle]",
            "[data-color-hue-slider]", "[data-color-hue-handle]",
            "[data-color-alpha-slider]", "[data-color-alpha-handle]",
            "[data-color-swatch]",
        ].join(",");
        const els = scopedQueryAll(host, sel);
        for (let i = 0; i < els.length; i++) {
            seen.add(els[i]);
            attachSlot(els[i]);
        }
        // Detach anything that left the DOM
        for (const el of _attached.keys()) {
            if (!seen.has(el)) detachSlot(el);
        }
    }
    discoverAll();

    // Watch for late-added slots.
    const mo = new MutationObserver(discoverAll);
    mo.observe(host, { childList: true, subtree: true });

    // Reactive attribute mirror: `value="#rrggbb"`. External attribute
    // edits flow into setHex.
    const attrMo = new MutationObserver((muts) => {
        if (_suppressValueAttr) return;
        for (let i = 0; i < muts.length; i++) {
            const name = muts[i].attributeName;
            if (name === "value") {
                const v = host.getAttribute("value");
                if (v) cp.setHex(v, "attribute");
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["value"] });

    // Imperative surface
    host._colorPickerInstance = cp;
    host.setHex     = (s) => cp.setHex(s, "api");
    host.setRgb     = (o) => cp.setRgb(o, "api");
    host.setHsv     = (o) => cp.setHsv(o, "api");
    host.setOklch   = (o) => cp.setOklch(o, "api");
    host.setAlpha   = (a) => cp.setAlpha(a, "api");

    Object.defineProperty(host, "hex",        { get: () => cp.hex(),        configurable: true });
    Object.defineProperty(host, "rgb",        { get: () => cp.rgb(),        configurable: true });
    Object.defineProperty(host, "hsv",        { get: () => cp.hsv(),        configurable: true });
    Object.defineProperty(host, "hsl",        { get: () => cp.hsl(),        configurable: true });
    Object.defineProperty(host, "oklch",      { get: () => cp.oklch(),      configurable: true });
    Object.defineProperty(host, "hue",        { get: () => cp.hue(),        configurable: true });
    Object.defineProperty(host, "saturation", { get: () => cp.saturation(), configurable: true });
    Object.defineProperty(host, "brightness", { get: () => cp.brightness(), configurable: true });
    Object.defineProperty(host, "alpha",      { get: () => cp.alpha(),      configurable: true });

    return () => {
        mo.disconnect();
        attrMo.disconnect();
        offRoot();
        for (const off of _attached.values()) { try { off(); } catch {} }
        _attached.clear();
        cp.destroy();
    };
});
