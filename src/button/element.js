// @zakkster/lite-headless / button / element.js
//
// Wraps a native <button> with reactive pressed / loading / disabled
// states. Two usage shapes:
//
//   1) As a toggle button (segmented UI mode picker etc.):
//      <lite-button toggle pressed>Bold</lite-button>
//
//   2) As an action button with async submit:
//      <lite-button>Submit</lite-button>
//      Then in JS:
//          host.runAsync(async () => await submit(form));
//      The host stays locked + announces "busy" during the await.
//
// The host IS the <button> proxy -- click handlers attach to the host,
// not to an internal element. The wrapper's "root" is the host itself.

import { define } from "@zakkster/lite-element";
import { createButton } from "./index.js";

define("lite-button", (host, scope) => {
    // If the host is not actually a <button>, fall back to role=button
    // (consumer chose to wrap a <span>, <a>, etc.). For accessibility +
    // form integration, a real <button> is strongly preferred.
    const isNativeButton = (host.tagName === "BUTTON");
    if (!isNativeButton && !host.hasAttribute("role")) {
        host.setAttribute("role", "button");
        if (!host.hasAttribute("tabindex")) host.setAttribute("tabindex", "0");
    }

    const btn = createButton({
        toggle:    host.hasAttribute("toggle"),
        pressed:   host.hasAttribute("pressed"),
        loading:   host.hasAttribute("loading"),
        disabled:  host.hasAttribute("disabled"),
        onPress:   (ev) => {
            host.dispatchEvent(new CustomEvent("press", {
                detail: { event: ev }, bubbles: true,
            }));
        },
    });
    const offRoot = btn.attachRoot(host);

    // Reactive attributes
    let _suppress = false;
    const attrMo = new MutationObserver((muts) => {
        if (_suppress) return;
        for (const m of muts) {
            if (m.attributeName === "pressed") {
                btn.setPressed(host.hasAttribute("pressed"));
            }
            if (m.attributeName === "loading") {
                btn.setLoading(host.hasAttribute("loading"));
            }
            if (m.attributeName === "disabled") {
                btn.setDisabled(host.hasAttribute("disabled"));
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["pressed", "loading", "disabled"] });

    host._buttonInstance = btn;
    host.setPressed = (b) => {
        _suppress = true;
        if (b) host.setAttribute("pressed", "");
        else host.removeAttribute("pressed");
        queueMicrotask(() => { _suppress = false; });
        btn.setPressed(b);
    };
    host.setLoading = (b) => {
        _suppress = true;
        if (b) host.setAttribute("loading", "");
        else host.removeAttribute("loading");
        queueMicrotask(() => { _suppress = false; });
        btn.setLoading(b);
    };
    host.setDisabled = (b) => {
        _suppress = true;
        if (b) host.setAttribute("disabled", "");
        else host.removeAttribute("disabled");
        queueMicrotask(() => { _suppress = false; });
        btn.setDisabled(b);
    };
    host.runAsync = (fn) => btn.runAsync(fn);

    Object.defineProperty(host, "isPressed",  { get: () => btn.isPressed(),  configurable: true });
    Object.defineProperty(host, "isLoading",  { get: () => btn.isLoading(),  configurable: true });
    Object.defineProperty(host, "isDisabled", { get: () => btn.isDisabled(), configurable: true });
    Object.defineProperty(host, "canPress",   { get: () => btn.canPress(),   configurable: true });

    return () => {
        attrMo.disconnect();
        offRoot();
        btn.destroy();
    };
});
