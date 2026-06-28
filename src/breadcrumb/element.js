// @zakkster/lite-headless / breadcrumb / element.js
//
// <lite-breadcrumb> wrapping createBreadcrumb.
//
//   <lite-breadcrumb>
//       <ol data-bc-list>
//           <li data-bc-item="home"><a href="/">Home</a></li>
//           <li data-bc-item="projects"><a href="/projects">Projects</a></li>
//           <li data-bc-item="current">Current</li>
//       </ol>
//   </lite-breadcrumb>
//
// The wrapper auto-detects items via [data-bc-item="<key>"] and wires
// them. The LAST item is automatically marked aria-current="page".
//
// Attributes:
//   current             explicit current key (overrides last-attached default)
//   separator           text for auto-created separators (default "/")
//
// Imperative API on host:
//   host.setCurrent(key)
//   host.current        -> string | null
//   host.items          -> [{ key, label, current }]
//
// Dispatched events:
//   itemclick           { detail: { key, index } }

import { define } from "@zakkster/lite-element";
import { createBreadcrumb } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, selector) {
    const el = host.querySelector(selector);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

define("lite-breadcrumb", (host, scope) => {
    const explicitCurrent = host.getAttribute("current");
    const separator = host.getAttribute("separator") || "/";

    const bc = createBreadcrumb({
        separator,
        onItemClick: (key, index, event) => {
            host.dispatchEvent(new CustomEvent("itemclick", {
                detail: { key, index, originalEvent: event }, bubbles: true,
            }));
        },
    });

    // Attach host as root
    bc.attachRoot(host);

    const _attached = new Map();    // key -> { el, off }
    let _listEl = null;

    function syncItems() {
        const list = scopedQuery(host, "[data-bc-list]");
        if (list && list !== _listEl) {
            bc.attachList(list);
            _listEl = list;
        }
        // Items. belongsToHost protects nested breadcrumbs.
        const itemEls = host.querySelectorAll("[data-bc-item]");
        const seen = new Set();
        for (let i = 0; i < itemEls.length; i++) {
            const el = itemEls[i];
            if (!belongsToHost(el, host)) continue;
            const key = el.getAttribute("data-bc-item");
            if (!key) continue;
            seen.add(key);
            const prev = _attached.get(key);
            if (prev && prev.el === el) continue;
            if (prev) { try { prev.off(); } catch {} }
            const off = bc.attachItem(el, key);
            _attached.set(key, { el, off });
        }
        // Detach removed
        for (const [key, entry] of _attached) {
            if (!seen.has(key)) {
                try { entry.off(); } catch {}
                _attached.delete(key);
            }
        }
        // Auto-wire any [data-bc-sep] elements (scoped)
        const seps = host.querySelectorAll("[data-bc-sep]");
        for (let i = 0; i < seps.length; i++) {
            const sep = seps[i];
            if (!belongsToHost(sep, host)) continue;
            // attachSeparator is idempotent in effect (set attrs again)
            bc.attachSeparator(sep);
        }
    }
    syncItems();
    // Apply explicit current EXACTLY ONCE, after the initial scan.
    // Putting this inside syncItems() created a reset loop: every
    // child-list mutation (a user-triggered setCurrent paints
    // data-current, which is itself a mutation; or upstream code
    // appends an item) re-ran syncItems(), which re-applied the
    // INITIAL value of `current=` from the markup, clobbering the
    // user's selection. The `attrMo` below already handles future
    // attribute updates correctly; init only handles init.
    if (explicitCurrent) bc.setCurrent(explicitCurrent);

    const mo = new MutationObserver(syncItems);
    mo.observe(host, { childList: true, subtree: true });

    // Observe `current` attribute on the host
    const attrMo = new MutationObserver((muts) => {
        for (const m of muts) {
            if (m.attributeName === "current") {
                const v = host.getAttribute("current");
                bc.setCurrent(v || null);
            }
        }
    });
    attrMo.observe(host, { attributes: true, attributeFilter: ["current"] });

    // Expose imperative API
    host._breadcrumbInstance = bc;
    host.setCurrent = (k) => bc.setCurrent(k);
    Object.defineProperty(host, "current", { get: () => bc.currentKey(), configurable: true });
    Object.defineProperty(host, "items",   { get: () => bc.items(),      configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        attrMo.disconnect();
        bc.destroy();
    });
});
