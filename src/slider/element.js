// @zakkster/lite-headless / slider / element.js
//
// <lite-slider min="0" max="100" step="1" value="50">
//   <div data-track>
//     <div data-range></div>
//     <div data-thumb></div>
//   </div>
//   <label data-label for="...">Volume</label>
// </lite-slider>
//
// For range sliders, ship value="lo,hi" AND two thumbs:
//   <lite-slider value="20,80">
//     <div data-track>
//       <div data-range></div>
//       <div data-thumb data-thumb-index="0"></div>
//       <div data-thumb data-thumb-index="1"></div>
//     </div>
//   </lite-slider>
//
// Dispatches CustomEvent('valuechange', { detail: { value, reason } }) on
// every change.
//
// ----- DYNAMIC ROLES -------------------------------------------------------
// Track/range/label are attached via MutationObserver, so swapping them at
// runtime (e.g. virtualized form layouts) works. They are also automatically
// re-attached if a framework reparents them inside the host.
//
// ----- THUMB LIMITATION ---------------------------------------------------
// Thumbs are NOT dynamically addable -- the underlying createSlider locks
// `thumbCount` to `initial.length` at construction. A consumer who needs to
// flip a slider between single and range mode must replace the entire
// <lite-slider> instance (destroy + recreate with a new value="a,b" or
// value="x"). The wrapper still attaches thumbs found in the initial DOM via
// the observer (so async-rendered thumbs that arrive after connect but
// BEFORE the first value change work), but adding a 3rd thumb to a single-
// thumb slider throws from the primitive. Lifting this limitation would
// require either dynamic-array signal semantics in createSlider or a
// "rebuild" entry point on the primitive; deferred until a real consumer
// asks for it.
//
// ----- ATTRIBUTE SYNC -----------------------------------------------------
// Both `value` and `disabled` are reactive: external setAttribute flows
// into the primitive via setValue / setDisabled. The `value` parse throws
// if the parsed array length doesn't match the current thumb count;
// we swallow rather than break the page on an ill-formed external attribute.

import { define } from "@zakkster/lite-element";
import { effect, signal as makeSignal } from "@zakkster/lite-signal";
import { createSlider } from "./index.js";
import { createRoleObserver } from "../_overlay/element-roles.js";

const ROLE_SEL = "[data-track],[data-range],[data-thumb],[data-label]";

define("lite-slider", (host, scope) => {
    function parseValue(spec) {
        if (spec == null || spec === "") return null;
        const parts = String(spec).split(",");
        const out = new Array(parts.length);
        for (let i = 0; i < parts.length; i++) {
            const n = parseFloat(parts[i]);
            if (Number.isNaN(n)) return null;
            out[i] = n;
        }
        return out;
    }

    const min  = parseFloat(host.getAttribute("min")  || "0");
    const max  = parseFloat(host.getAttribute("max")  || "100");
    const step = parseFloat(host.getAttribute("step") || "1");
    const largeStep = host.hasAttribute("large-step") ? parseFloat(host.getAttribute("large-step")) : undefined;

    const valueSig = makeSignal(parseValue(host.getAttribute("value")) || [min]);

    const slider = createSlider({
        value: valueSig,
        min, max, step, largeStep,
        orientation:  host.getAttribute("orientation") || "horizontal",
        inverted:     host.hasAttribute("inverted"),
        disabled:     host.hasAttribute("disabled"),
        minStepsBetweenThumbs: host.hasAttribute("min-steps-between-thumbs")
            ? parseFloat(host.getAttribute("min-steps-between-thumbs"))
            : 0,
        onValueChange: (next, reason) => {
            host.dispatchEvent(new CustomEvent("valuechange", {
                detail: { value: next.slice(), reason }, bubbles: true,
            }));
        },
    });

    function wire(node) {
        if (node.hasAttribute("data-track")) return slider.attachTrack(node);
        if (node.hasAttribute("data-range")) return slider.attachRange(node);
        if (node.hasAttribute("data-label")) return slider.attachLabel(node);
        if (node.hasAttribute("data-thumb")) {
            const idx = parseInt(node.getAttribute("data-thumb-index") || "0", 10);
            // The primitive throws if idx is out of range; we swallow so a
            // consumer who ships a 3rd thumb to a 2-thumb slider gets a
            // dead extra element instead of a broken page. (Documented above.)
            try { return slider.attachThumb(node, idx); }
            catch { return null; }
        }
        return null;
    }

    const roles = createRoleObserver(host, ROLE_SEL, wire);
    roles.rescan();
    roles.rescan();   // initial sweep -- safe to call once `roles` is bound

    // ----- reactive value attribute sync ---------------------------------
    // Skip the first run (signal was initialized synchronously at construct).
    // Subsequent attribute writes flow through setValue, which enforces
    // step + min/max + crossing constraints.
    let _attrFirstRun = true;
    const valueAttr = scope.useAttr("value");
    const stopAttrSync = effect(() => {
        const raw = valueAttr();
        if (_attrFirstRun) { _attrFirstRun = false; return; }
        const parsed = parseValue(raw);
        if (!parsed) return;
        // setValue throws if length mismatches thumb count; swallow rather
        // than break the page on an ill-formed external attribute.
        try { slider.setValue(parsed, "attribute"); }
        catch { /* swallow */ }
    });

    // v0.7.9: reactive `disabled` attribute. Presence => disabled. Tracks
    // whether the attribute is present (not its value), matching the
    // standard HTML semantics for boolean attributes.
    let _disabledFirstRun = true;
    const disabledAttr = scope.useAttr("disabled");
    const stopDisabledSync = effect(() => {
        const raw = disabledAttr();
        if (_disabledFirstRun) { _disabledFirstRun = false; return; }
        slider.setDisabled(raw !== null);
    });

    host.setValue    = (v, reason) => slider.setValue(v, reason);
    host.setDisabled = (flag) => slider.setDisabled(flag);
    Object.defineProperty(host, "value", { get: () => slider.value().slice(), configurable: true });
    Object.defineProperty(host, "disabled", {
        get: () => slider.isDisabled(),
        set: (v) => slider.setDisabled(!!v),
        configurable: true,
    });

    scope.onCleanup(() => {
        stopAttrSync();
        stopDisabledSync();
        roles.disconnect();
        slider.destroy();
    });
}, { observedAttributes: ["value", "disabled"] });
