// @zakkster/lite-headless / notification-center / index.js
//
// createNotificationCenter(options) -> NotificationCenterHandle
//
// Persistent list of past notifications (info / success / warning /
// error / system). Unlike toasts which are ephemeral, notifications
// live in a list that the user can browse, mark as read, filter, and
// clear. The classic "bell icon with unread badge" UX.
//
// Distinct from createToaster:
//
//                   toast                 notification-center
//   purpose         ephemeral feedback    persistent history
//   lifetime        N seconds, auto-dis   manual dismiss / mark-read
//   stack           visible viewport      collapsible panel
//   unread state    n/a                   first-class
//   filtering       n/a                   by kind / read-state
//
// Common composition: toast.show() fires + the same payload is pushed
// into the notification center. The center keeps the user's history
// while the toast covers the in-the-moment feedback.
//
// Notification shape:
//   {
//     id:        string              -- required, unique
//     title:     string              -- required
//     body:      string              -- optional
//     kind:      "info" | "success" | "warning" | "error" | "system"
//     timestamp: Date | number       -- ms epoch or Date; defaults to now
//     read:      boolean             -- defaults to false
//     meta:      {}                  -- consumer-defined extras
//   }
//
// Filtering:
//   center.filter()                  -- current filter object
//   center.setFilter({ kind, read }) -- partial update; null clears
//   center.visible()                 -- reactive: notifications passing the filter
//
// All mutations route through the cleanup chain and onChange callback.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}

const VALID_KINDS = ["info", "success", "warning", "error", "system"];

export function createNotificationCenter(options = {}) {
    const {
        defaultNotifications = [],
        maxItems = null,            // null = unbounded; integer = oldest are evicted
        defaultFilter = null,        // { kind?, read?: boolean }
        onChange,                    // (notifications) => void
        onMarkRead,                  // (id) => void
        onMarkAllRead,               // () => void
        onClear,                     // (id) => void
        onClearAll,                  // () => void
    } = options;

    let _destroyed = false;
    const _cleanups = [];
    function addCleanup(fn) { if (fn) _cleanups.push(fn); }

    // ----- state ---------------------------------------------------------

    // Notifications are stored newest-first so the natural iteration order
    // matches what users expect to see in the panel.
    const _normalized = defaultNotifications.map(normalizeNotification);
    sortByTimestamp(_normalized);
    const _items = makeSignal(_normalized);
    const _filter = makeSignal(defaultFilter ? Object.assign({}, defaultFilter) : null);

    function normalizeNotification(n) {
        if (!n) return null;
        const ts = n.timestamp == null
            ? Date.now()
            : (n.timestamp instanceof Date ? n.timestamp.getTime() : n.timestamp);
        const kind = VALID_KINDS.indexOf(n.kind) === -1 ? "info" : n.kind;
        return {
            id: String(n.id),
            title: n.title == null ? "" : String(n.title),
            body: n.body == null ? "" : String(n.body),
            kind,
            timestamp: ts,
            read: !!n.read,
            meta: n.meta || null,
        };
    }

    function sortByTimestamp(arr) {
        arr.sort((a, b) => b.timestamp - a.timestamp);
    }

    function fireChange() {
        if (onChange) {
            try { onChange(_items().slice()); } catch { /* swallow */ }
        }
    }

    function evictIfNeeded(arr) {
        if (maxItems == null || arr.length <= maxItems) return arr;
        // Trim the tail (oldest), keep newest maxItems.
        return arr.slice(0, maxItems);
    }

    // ----- reactive accessors --------------------------------------------

    function notifications() { return _items(); }
    function filter() { return _filter(); }

    function unreadCount() {
        const arr = _items();
        let n = 0;
        for (let i = 0; i < arr.length; i++) if (!arr[i].read) n++;
        return n;
    }

    function getNotification(id) {
        const arr = _items();
        for (let i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
        return null;
    }

    // Reactive filtered view. Inside an effect, this re-runs when the
    // items signal OR the filter signal updates.
    function visible() {
        const arr = _items();
        const f = _filter();
        if (!f) return arr;
        const out = [];
        for (let i = 0; i < arr.length; i++) {
            const n = arr[i];
            if (f.kind != null && n.kind !== f.kind) continue;
            if (f.read != null && n.read !== !!f.read) continue;
            out.push(n);
        }
        return out;
    }

    // ----- mutations ------------------------------------------------------

    function add(notification) {
        if (_destroyed) return;
        const n = normalizeNotification(notification);
        if (!n || !n.id) return;
        const cur = _items();
        // Dedup by id (newer replaces older).
        let next;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === n.id) {
                next = cur.slice();
                next[i] = n;
                break;
            }
        }
        if (!next) {
            next = cur.slice();
            next.unshift(n);
        }
        sortByTimestamp(next);
        next = evictIfNeeded(next);
        _items.set(next);
        fireChange();
    }

    function remove(id) {
        if (_destroyed || id == null) return;
        const cur = _items();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return;
        const next = cur.slice();
        next.splice(idx, 1);
        _items.set(next);
        if (onClear) { try { onClear(id); } catch {} }
        fireChange();
    }

    function update(id, partial) {
        if (_destroyed || id == null || !partial) return;
        const cur = _items();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === id) { idx = i; break; }
        }
        if (idx === -1) return;
        const merged = normalizeNotification(Object.assign({}, cur[idx], partial, { id }));
        const next = cur.slice();
        next[idx] = merged;
        sortByTimestamp(next);
        _items.set(next);
        fireChange();
    }

    function markRead(id) {
        if (_destroyed || id == null) return;
        const cur = _items();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === id) { idx = i; break; }
        }
        if (idx === -1 || cur[idx].read) return;     // already read
        const next = cur.slice();
        next[idx] = Object.assign({}, cur[idx], { read: true });
        _items.set(next);
        if (onMarkRead) { try { onMarkRead(id); } catch {} }
        fireChange();
    }

    function markUnread(id) {
        if (_destroyed || id == null) return;
        const cur = _items();
        let idx = -1;
        for (let i = 0; i < cur.length; i++) {
            if (cur[i].id === id) { idx = i; break; }
        }
        if (idx === -1 || !cur[idx].read) return;
        const next = cur.slice();
        next[idx] = Object.assign({}, cur[idx], { read: false });
        _items.set(next);
        fireChange();
    }

    function markAllRead() {
        if (_destroyed) return;
        const cur = _items();
        let anyUnread = false;
        for (let i = 0; i < cur.length; i++) {
            if (!cur[i].read) { anyUnread = true; break; }
        }
        if (!anyUnread) return;
        const next = cur.map(n => n.read ? n : Object.assign({}, n, { read: true }));
        _items.set(next);
        if (onMarkAllRead) { try { onMarkAllRead(); } catch {} }
        fireChange();
    }

    function clearAll() {
        if (_destroyed) return;
        if (_items().length === 0) return;
        _items.set([]);
        if (onClearAll) { try { onClearAll(); } catch {} }
        fireChange();
    }

    function clearByKind(kind) {
        if (_destroyed) return;
        if (VALID_KINDS.indexOf(kind) === -1) return;
        const cur = _items();
        const next = cur.filter(n => n.kind !== kind);
        if (next.length === cur.length) return;
        _items.set(next);
        fireChange();
    }

    function clearRead() {
        if (_destroyed) return;
        const cur = _items();
        const next = cur.filter(n => !n.read);
        if (next.length === cur.length) return;
        _items.set(next);
        fireChange();
    }

    function setNotifications(arr) {
        if (_destroyed) return;
        const next = (arr || []).map(normalizeNotification).filter(n => n && n.id);
        sortByTimestamp(next);
        _items.set(evictIfNeeded(next));
        fireChange();
    }

    function setFilter(f) {
        if (_destroyed) return;
        if (f == null) {
            _filter.set(null);
        } else {
            _filter.set(Object.assign({}, _filter() || {}, f));
        }
    }

    function clearFilter() {
        if (_destroyed) return;
        _filter.set(null);
    }

    // ----- attach helpers ------------------------------------------------
    //
    // The primitive doesn't build a panel — consumer renders rows
    // however they like. The attach helpers paint state attributes on
    // consumer-provided elements:
    //
    //   attachRoot(el)            -- role=region, aria-label, unreadcount badge attr
    //   attachItem(el, id)        -- per-row paint (kind, read, click-to-mark-read)
    //   attachUnreadBadge(el)     -- aria-live updates with count
    //   attachClearAllButton(el)  -- click -> clearAll()
    //   attachMarkAllReadButton(el) -- click -> markAllRead()

    const _itemEls = new Map();         // el -> { id, off }
    let _root = null;
    let _badge = null;

    function attachRoot(el) {
        if (!el || _destroyed) return noop;
        _root = el;
        ensureId(el, "lh-nc");
        setAttr(el, "role", "region");
        setAttr(el, "aria-label", "Notifications");
        // Mirror unread count as a host-level attribute for CSS hooks.
        const stop = effect(() => {
            const c = unreadCount();
            setAttr(el, "data-nc-unread", String(c));
            toggleAttr(el, "data-nc-has-unread", c > 0);
        });
        addCleanup(stop);
        const off = () => {
            stop();
            if (_root === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-label");
                el.removeAttribute("data-nc-unread");
                el.removeAttribute("data-nc-has-unread");
                _root = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachUnreadBadge(el) {
        if (!el || _destroyed) return noop;
        _badge = el;
        ensureId(el, "lh-nc-badge");
        setAttr(el, "aria-live", "polite");
        setAttr(el, "aria-atomic", "true");
        const stop = effect(() => {
            const c = unreadCount();
            const text = c > 99 ? "99+" : String(c);
            if (el.textContent !== text) el.textContent = text;
            toggleAttr(el, "data-nc-hidden", c === 0);
        });
        addCleanup(stop);
        const off = () => {
            stop();
            if (_badge === el) {
                el.removeAttribute("aria-live");
                el.removeAttribute("aria-atomic");
                el.removeAttribute("data-nc-hidden");
                _badge = null;
            }
        };
        addCleanup(off);
        return off;
    }

    function attachItem(el, id) {
        if (!el || _destroyed || id == null) return noop;
        const prev = _itemEls.get(el);
        if (prev) prev.off();

        ensureId(el, "lh-nc-item");
        setAttr(el, "data-nc-id", String(id));
        setAttr(el, "role", "listitem");
        if (!el.hasAttribute("tabindex")) setAttr(el, "tabindex", "0");

        // Paint effect: data-kind, data-read, data-nc-missing.
        let _lastKind = null;
        let _lastRead = null;
        const stop = effect(() => {
            const n = getNotification(id);
            if (!n) {
                toggleAttr(el, "data-nc-missing", true);
                return;
            }
            toggleAttr(el, "data-nc-missing", false);
            if (_lastKind !== n.kind) {
                setAttr(el, "data-nc-kind", n.kind);
                _lastKind = n.kind;
            }
            if (_lastRead !== n.read) {
                toggleAttr(el, "data-nc-read", n.read);
                toggleAttr(el, "data-nc-unread", !n.read);
                _lastRead = n.read;
            }
        });

        // Click marks read by default (consumers can override via stopPropagation).
        const onClick = () => { markRead(id); };
        el.addEventListener("click", onClick);

        // Keyboard: Enter or Space marks read.
        const onKey = (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                markRead(id);
            }
        };
        el.addEventListener("keydown", onKey);

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            el.removeEventListener("keydown", onKey);
            el.removeAttribute("data-nc-id");
            el.removeAttribute("data-nc-kind");
            el.removeAttribute("data-nc-read");
            el.removeAttribute("data-nc-unread");
            el.removeAttribute("data-nc-missing");
            el.removeAttribute("role");
            _itemEls.delete(el);
        };
        _itemEls.set(el, { id, off });
        addCleanup(off);
        return off;
    }

    function attachClearAllButton(el) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("type")) setAttr(el, "type", "button");
        const onClick = (ev) => { ev.preventDefault(); clearAll(); };
        el.addEventListener("click", onClick);
        const off = () => { el.removeEventListener("click", onClick); };
        addCleanup(off);
        return off;
    }

    function attachMarkAllReadButton(el) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("type")) setAttr(el, "type", "button");
        const onClick = (ev) => { ev.preventDefault(); markAllRead(); };
        el.addEventListener("click", onClick);
        const off = () => { el.removeEventListener("click", onClick); };
        addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _itemEls.clear();
        _root = null;
        _badge = null;
    }

    return {
        // reactive
        notifications, visible, filter, unreadCount,
        // queries
        getNotification,
        // mutations
        add, remove, update,
        markRead, markUnread, markAllRead,
        clearAll, clearByKind, clearRead,
        setNotifications,
        setFilter, clearFilter,
        // attach
        attachRoot, attachItem,
        attachUnreadBadge,
        attachClearAllButton,
        attachMarkAllReadButton,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
        // introspection
        _itemEls: () => _itemEls,
    };
}
