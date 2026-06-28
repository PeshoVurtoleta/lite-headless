// @zakkster/lite-headless / notification-center / element.js
//
// <lite-notification-center> wrapping createNotificationCenter.
//
//   <lite-notification-center>
//       <header>
//           <span data-nc-badge></span>
//           <button data-nc-mark-all-read>Mark all read</button>
//           <button data-nc-clear-all>Clear all</button>
//       </header>
//       <div data-nc-list role="list">
//           <article data-nc-id="n1">
//               <strong>Server restarted</strong>
//               <p>Production node 7 came back online.</p>
//           </article>
//           <article data-nc-id="n2">
//               <strong>Build passed</strong>
//           </article>
//       </div>
//   </lite-notification-center>
//
// Auto-discovers items with [data-nc-id], the unread badge slot via
// [data-nc-badge], and the two buttons.
//
// Imperative API on host:
//   host.notifications                    -- accessor: NotificationDef[]
//   host.unreadCount                      -- accessor: number
//   host.visible                          -- accessor: NotificationDef[] (filtered)
//   host.add(n) / .remove(id) / .update(id, partial)
//   host.markRead(id) / .markUnread(id) / .markAllRead()
//   host.clearAll() / .clearByKind(kind) / .clearRead()
//   host.setFilter(f) / .clearFilter()
//   host._notificationCenterInstance
//
// Events:
//   ncchange   { detail: { notifications } } -- fires after any mutation

import { define } from "@zakkster/lite-element";
import { createNotificationCenter } from "./index.js";
import { belongsToHost } from "../_overlay/element-roles.js";

function scopedQuery(host, sel) {
    const el = host.querySelector(sel);
    if (!el || el === host) return el;
    return belongsToHost(el, host) ? el : null;
}

function scopedQueryAll(host, sel) {
    const all = host.querySelectorAll(sel);
    const out = [];
    for (let i = 0; i < all.length; i++) {
        if (belongsToHost(all[i], host)) out.push(all[i]);
    }
    return out;
}

define("lite-notification-center", (host, scope) => {
    const maxAttr = host.getAttribute("max-items");
    const maxItems = maxAttr ? parseInt(maxAttr, 10) : null;

    const nc = createNotificationCenter({
        maxItems: Number.isFinite(maxItems) ? maxItems : null,
        onChange: (notifications) => {
            host.dispatchEvent(new CustomEvent("ncchange", {
                detail: { notifications }, bubbles: true,
            }));
        },
    });

    nc.attachRoot(host);

    // Discovery cache
    const _attached = {
        badge: null, badgeOff: null,
        clearBtn: null, clearOff: null,
        markBtn: null, markOff: null,
    };
    const _itemOffs = new Map();   // el -> off

    function syncRoles() {
        // Badge
        const badge = scopedQuery(host, "[data-nc-badge]");
        if (badge !== _attached.badge) {
            if (_attached.badgeOff) _attached.badgeOff();
            _attached.badge = badge;
            _attached.badgeOff = badge ? nc.attachUnreadBadge(badge) : null;
        }
        // Clear-all button
        const clearBtn = scopedQuery(host, "[data-nc-clear-all]");
        if (clearBtn !== _attached.clearBtn) {
            if (_attached.clearOff) _attached.clearOff();
            _attached.clearBtn = clearBtn;
            _attached.clearOff = clearBtn ? nc.attachClearAllButton(clearBtn) : null;
        }
        // Mark-all-read button
        const markBtn = scopedQuery(host, "[data-nc-mark-all-read]");
        if (markBtn !== _attached.markBtn) {
            if (_attached.markOff) _attached.markOff();
            _attached.markBtn = markBtn;
            _attached.markOff = markBtn ? nc.attachMarkAllReadButton(markBtn) : null;
        }
        // Items
        const itemEls = scopedQueryAll(host, "[data-nc-id]");
        const seen = new Set();
        for (let i = 0; i < itemEls.length; i++) {
            const el = itemEls[i];
            seen.add(el);
            if (_itemOffs.has(el)) continue;
            const id = el.getAttribute("data-nc-id");
            if (!id) continue;
            // Auto-register a placeholder notification if it doesn't exist
            // yet, so the paint binds to a real object.
            if (!nc.getNotification(id)) {
                nc.add({
                    id,
                    title: el.getAttribute("data-nc-title") || "",
                    body:  el.getAttribute("data-nc-body")  || "",
                    kind:  el.getAttribute("data-nc-kind")  || "info",
                });
            }
            _itemOffs.set(el, nc.attachItem(el, id));
        }
        for (const [el, off] of _itemOffs) {
            if (!seen.has(el)) { off(); _itemOffs.delete(el); }
        }
    }
    syncRoles();

    const mo = new MutationObserver(syncRoles);
    mo.observe(host, { childList: true, subtree: true });

    // Imperative surface
    host._notificationCenterInstance = nc;
    host.add          = (n) => nc.add(n);
    host.remove       = (id) => nc.remove(id);
    host.update       = (id, p) => nc.update(id, p);
    host.markRead     = (id) => nc.markRead(id);
    host.markUnread   = (id) => nc.markUnread(id);
    host.markAllRead  = () => nc.markAllRead();
    host.clearAll     = () => nc.clearAll();
    host.clearByKind  = (k) => nc.clearByKind(k);
    host.clearRead    = () => nc.clearRead();
    host.setFilter    = (f) => nc.setFilter(f);
    host.clearFilter  = () => nc.clearFilter();
    Object.defineProperty(host, "notifications", { get: () => nc.notifications(), configurable: true });
    Object.defineProperty(host, "unreadCount",   { get: () => nc.unreadCount(),   configurable: true });
    Object.defineProperty(host, "visible",       { get: () => nc.visible(),       configurable: true });

    scope.onCleanup(() => {
        mo.disconnect();
        for (const off of _itemOffs.values()) { try { off(); } catch {} }
        _itemOffs.clear();
        if (_attached.badgeOff) _attached.badgeOff();
        if (_attached.clearOff) _attached.clearOff();
        if (_attached.markOff)  _attached.markOff();
        nc.destroy();
    });
});
