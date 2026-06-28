// @zakkster/lite-headless / skeleton / element.js
//
// <lite-skeleton> wrapping createSkeleton.
//
//   <lite-skeleton sources="user posts" min-visible-ms="300">
//       <div slot="placeholder" data-skeleton>...</div>
//       <div slot="content" data-skeleton-content>...</div>
//   </lite-skeleton>
//
// Reactive attributes:
//   sources         space-separated list of declared sources (read once on attach)
//   min-visible-ms  number; default 0
//   ready           flag attribute -- setting it reveals; removing conceals
//
// Imperative API on host:
//   host.setReady(b)
//   host.reveal()
//   host.conceal()
//   host.resolve(name)
//   host.reset()
//   host.ready          // accessor: boolean
//   host.pendingSources // accessor: string[]
//
// Events:
//   reveal              fires once on loading -> ready transition
//   conceal             fires once on ready -> loading transition

import { define } from "@zakkster/lite-element";
import { createSkeleton } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

// Scoped query helper. `host.querySelectorAll` returns every matching
// descendant including those owned by a nested `<lite-skeleton>`;
// `belongsToHost` filters to direct ownership so the outer instance
// doesn't steal a nested one's placeholders/content.
function scopedQueryAll(host, sel) {
    const all = host.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-skeleton", (host, scope) => {
    const sourcesAttr = host.getAttribute("sources");
    const declaredSources = sourcesAttr ? sourcesAttr.trim().split(/\s+/).filter(Boolean) : [];
    const minVisibleMsRaw = host.getAttribute("min-visible-ms");
    const minVisibleMs = minVisibleMsRaw ? Number(minVisibleMsRaw) : 0;
    const initiallyReady = host.hasAttribute("ready");

    const sk = createSkeleton({
        sources: declaredSources,
        minVisibleMs: Number.isFinite(minVisibleMs) ? minVisibleMs : 0,
        initiallyReady,
        onReveal: () => host.dispatchEvent(new CustomEvent("reveal", { bubbles: true })),
        onConceal: () => host.dispatchEvent(new CustomEvent("conceal", { bubbles: true })),
    });

    // Host itself is the root.
    sk.attachRoot(host);

    // Auto-attach placeholder + content children. Convention: descendants
    // carrying `data-skeleton` declaratively are placeholders;
    // `data-skeleton-content` are content. The belongsToHost guard
    // protects nested skeletons: a `<lite-skeleton>` inside another
    // `<lite-skeleton>` claims its own `[data-skeleton]` descendants
    // instead of having them stolen by the outer instance.
    const _attached = { placeholders: new Map(), contents: new Map() };
    function syncRoles() {
        const placeholders = scopedQueryAll(host, "[data-skeleton]");
        const contents = scopedQueryAll(host, "[data-skeleton-content]");
        for (let i = 0; i < placeholders.length; i++) {
            const el = placeholders[i];
            if (!_attached.placeholders.has(el)) {
                _attached.placeholders.set(el, sk.attachPlaceholder(el));
            }
        }
        for (let i = 0; i < contents.length; i++) {
            const el = contents[i];
            if (!_attached.contents.has(el)) {
                _attached.contents.set(el, sk.attachContent(el));
            }
        }
        // Detach removed nodes.
        for (const [el, off] of _attached.placeholders) {
            if (!host.contains(el)) { off(); _attached.placeholders.delete(el); }
        }
        for (const [el, off] of _attached.contents) {
            if (!host.contains(el)) { off(); _attached.contents.delete(el); }
        }
    }
    syncRoles();
    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // React to `ready` attribute changes on the host. Dirty-flag collapse:
    // multiple attribute writes in one tick coalesce into a single
    // setReady call at the microtask boundary instead of N redundant
    // calls + N getAttribute reads. The frequency of multi-write bursts
    // is low in practice, but the work is O(1) per coalesce regardless.
    let _readyDirty = false;
    function _flushReady() {
        _readyDirty = false;
        sk.setReady(host.hasAttribute("ready"));
    }
    const attrMo = new MutationObserver(() => {
        if (_readyDirty) return;
        _readyDirty = true;
        queueMicrotask(_flushReady);
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["ready"] });

    // Imperative surface
    host._skeletonInstance = sk;
    host.setReady = (b) => sk.setReady(b);
    host.reveal = () => sk.reveal();
    host.conceal = () => sk.conceal();
    host.resolve = (n) => sk.resolve(n);
    host.reset = () => sk.reset();
    Object.defineProperty(host, "ready",           { get: () => sk.ready(),           configurable: true });
    Object.defineProperty(host, "pendingSources",  { get: () => sk.pendingSources(),  configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        for (const off of _attached.placeholders.values()) off();
        for (const off of _attached.contents.values()) off();
        sk.destroy();
    });
});
