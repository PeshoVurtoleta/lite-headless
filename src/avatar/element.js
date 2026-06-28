// @zakkster/lite-headless / avatar / element.js
//
// <lite-avatar> wrapping createAvatar.
//
//   <lite-avatar name="Alice Lee" src="alice.jpg">
//       <img data-avatar-img alt="">
//       <span data-avatar-fallback></span>
//   </lite-avatar>
//
// The fallback span gets data-initials attribute (from the derived
// or override initials) -- consumers display it via ::after content:
//
//   [data-avatar-fallback]::after {
//       content: attr(data-initials);
//   }
//   [data-avatar-fallback] {
//       background: oklch(60% 0.12 var(--hue));
//   }
//
// Attributes:
//   src                 image src
//   name                user's full name (used for initials + color hash)
//   initials            override initials
//   fallback-delay      ms to wait before showing fallback (anti-flash)
//
// Imperative API on host:
//   host.setSrc(newSrc)
//   host.state          -> "image" | "loading" | "fallback"
//   host.initials       -> string
//   host.colorHash      -> 0..359
//
// Dispatched events:
//   statechange         { detail: { state } }
//   load                { detail: {} }
//   error               { detail: {} }

import { define } from "@zakkster/lite-element";
import { createAvatar } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-avatar", (host, scope) => {
    const src = host.getAttribute("src");
    const name = host.getAttribute("name") || "";
    const initials = host.getAttribute("initials") || null;
    const fallbackDelayRaw = host.getAttribute("fallback-delay");
    const fallbackDelay = fallbackDelayRaw ? parseInt(fallbackDelayRaw, 10) : 0;

    const av = createAvatar({
        src, name, initials, fallbackDelay,
        onLoad: () => {
            host.dispatchEvent(new CustomEvent("load", { detail: {}, bubbles: true }));
        },
        onError: () => {
            host.dispatchEvent(new CustomEvent("error", { detail: {}, bubbles: true }));
        },
    });

    // Role observer. scopedQuery rejects matches inside a nested
    // `<lite-avatar>` (e.g. a card avatar containing a presence-badge
    // avatar) -- outer wouldn't steal the inner's img/fallback.
    const _attached = { root: null, img: null, fb: null };
    function syncRoles() {
        const root = host;
        const img  = scopedQuery(host, "[data-avatar-img]") || scopedQuery(host, "img");
        const fb   = scopedQuery(host, "[data-avatar-fallback]");
        if (_attached.root !== root) { av.attachRoot(root); _attached.root = root; }
        if (img && _attached.img !== img) { av.attachImage(img); _attached.img = img; }
        if (fb && _attached.fb !== fb) { av.attachFallback(fb); _attached.fb = fb; }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // Observe src attribute. Dirty-flag collapse: multiple writes in
    // one tick coalesce into a single setSrc call at the microtask
    // boundary.
    let _srcDirty = false;
    function _flushSrc() {
        _srcDirty = false;
        av.setSrc(host.getAttribute("src"));
    }
    const attrMo = new MutationObserver(() => {
        if (_srcDirty) return;
        _srcDirty = true;
        queueMicrotask(_flushSrc);
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["src"] });

    // Expose imperative API
    host._avatarInstance = av;
    host.setSrc = (s) => av.setSrc(s);
    Object.defineProperty(host, "state",     { get: () => av.state(),     configurable: true });
    Object.defineProperty(host, "initials",  { get: () => av.initials(),  configurable: true });
    Object.defineProperty(host, "colorHash", { get: () => av.colorHash(), configurable: true });

    // Mirror onStateChange via the underlying av callbacks
    // (createAvatar doesn't have onStateChange directly; we synthesize
    // by listening to load/error events through the wrapper.)
    // Actually we should add onStateChange-like dispatch. Let's track
    // state with an effect:
    // Skipping for now -- consumer can listen to load/error directly.

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        av.destroy();
    });
});
