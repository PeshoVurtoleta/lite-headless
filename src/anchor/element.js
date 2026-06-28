// @zakkster/lite-headless / anchor / element.js
//
// <lite-anchor offset-top="64">
//     <a href="#intro" data-anchor-target="#intro">Intro</a>
//     <a href="#install" data-anchor-target="#install">Install</a>
//     <a href="#api" data-anchor-target="#api">API</a>
// </lite-anchor>
//
// Auto-discovers anchor links inside the host and observes their
// targets. Active link gets data-active + aria-current="location".

import { define } from "@zakkster/lite-element";
import { createAnchor } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function parseN(s, dflt) {
    const n = parseFloat(s);
    return isFinite(n) ? n : dflt;
}

function scopedQueryAll(host, sel) {
    const out = [];
    const all = host.querySelectorAll(sel);
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-anchor", (host, scope) => {
    let rootEl = null;
    const rootAttr = host.getAttribute("root");
    if (rootAttr && rootAttr !== "window") rootEl = document.querySelector(rootAttr);

    const a = createAnchor({
        root: rootEl,
        offsetTop: parseN(host.getAttribute("offset-top"), 0),
        smooth:    host.getAttribute("smooth") !== "false",
        onChange: (key) => {
            host.dispatchEvent(new CustomEvent("activechange", { detail: { key }, bubbles: true }));
        },
    });
    const offRoot = a.attachRoot(host);

    // Track which links are currently wired so we can diff on rescan.
    const _linkOffs = new Map();   // linkEl -> off
    function syncLinks() {
        // Pattern: each anchor link uses data-anchor-target="#section-id"
        // (or has href="#section-id" as a fallback)
        const links = scopedQueryAll(host, "[data-anchor-target], a[href^='#']");
        const seen = new Set();
        for (const link of links) {
            seen.add(link);
            if (_linkOffs.has(link)) continue;   // already wired
            const targetSel = link.getAttribute("data-anchor-target") || link.getAttribute("href");
            if (!targetSel || !targetSel.startsWith("#")) continue;
            const section = document.querySelector(targetSel);
            if (!section) continue;
            const key = targetSel.slice(1);  // strip the '#'
            const off = a.attachLink(link, section, key);
            _linkOffs.set(link, off);
        }
        // Detach links that are gone
        for (const [link, off] of _linkOffs) {
            if (!seen.has(link)) {
                try { off(); } catch {}
                _linkOffs.delete(link);
            }
        }
    }
    syncLinks();
    const mo = new MutationObserver(syncLinks);
    mo.observe(host, { childList: true, subtree: true });

    host._anchorInstance = a;
    Object.defineProperty(host, "activeKey", { get: () => a.activeKey(), configurable: true });
    Object.defineProperty(host, "linkCount", { get: () => a.linkCount, configurable: true });

    return () => {
        mo.disconnect();
        for (const off of _linkOffs.values()) try { off(); } catch {}
        _linkOffs.clear();
        offRoot();
        a.destroy();
    };
});
