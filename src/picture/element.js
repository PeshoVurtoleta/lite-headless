// @zakkster/lite-headless / picture / element.js
//
// <lite-picture> wrapping createPicture.
//
//   <lite-picture src="hero.jpg" aspect-ratio="16/9" lazy
//                 placeholder="data:image/svg+xml;...">
//       <picture data-pic-root>
//           <source type="image/avif" srcset="hero.avif">
//           <source type="image/webp" srcset="hero.webp">
//           <img data-pic-img alt="">
//       </picture>
//   </lite-picture>
//
// Attributes:
//   src               (required)
//   aspect-ratio      mirrors aspect-ratio CSS
//   lazy              flag (default behavior is lazy)
//   eager             flag (overrides lazy)
//   placeholder       LQIP src
//   max-retries       defaults to 2
//
// Imperative API on host:
//   host.retry()
//   host.state         -> "idle" | "loading" | "loaded" | "error"
//
// Dispatched events:
//   statechange       { detail: { state } }
//   load              { detail: {} }
//   error             { detail: { error } }

import { define } from "@zakkster/lite-element";
import { createPicture } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

function parseInt2(raw, fallback) {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
}

define("lite-picture", (host, scope) => {
    const src = host.getAttribute("src");
    if (!src) {
        console.warn("lite-picture: missing src attribute");
        return;
    }
    const lazy = !host.hasAttribute("eager");
    const eager = host.hasAttribute("eager");
    const aspectRatio = host.getAttribute("aspect-ratio") || null;
    const placeholder = host.getAttribute("placeholder") || null;
    const maxRetries  = parseInt2(host.getAttribute("max-retries"), 2);

    const pic = createPicture({
        src, lazy, eager, aspectRatio, placeholder, maxRetries,
        onStateChange: (state) => {
            host.dispatchEvent(new CustomEvent("statechange", {
                detail: { state }, bubbles: true,
            }));
        },
        onLoad: () => {
            host.dispatchEvent(new CustomEvent("load", { detail: {}, bubbles: true }));
        },
        onError: (error) => {
            host.dispatchEvent(new CustomEvent("error", {
                detail: { error }, bubbles: true,
            }));
        },
    });

    // Role observer. scopedQuery rejects matches inside a nested
    // `<lite-picture>` so an outer picture can't steal its child's
    // [data-pic-root] or <img>.
    const _attached = { root: null, img: null };
    function syncRoles() {
        // Root is either a marked container OR the host itself.
        let root = scopedQuery(host, "[data-pic-root]");
        if (!root) root = host;
        const img = scopedQuery(host, "[data-pic-img]") || scopedQuery(host, "img");
        if (_attached.root !== root) { pic.attachRoot(root); _attached.root = root; }
        if (img && _attached.img !== img) { pic.attachImg(img); _attached.img = img; }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // Expose imperative API
    host._pictureInstance = pic;
    host.retry = () => pic.retry();
    host.setSrc = (next) => pic.setSrc(next);
    Object.defineProperty(host, "state", { get: () => pic.state(), configurable: true });
    Object.defineProperty(host, "src",   { get: () => pic.src,     configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        pic.destroy();
    });
});
