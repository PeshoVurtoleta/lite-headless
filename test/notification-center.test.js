// notification-center.test.js -- createNotificationCenter state, paint, filters.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createNotificationCenter } from "../src/notification-center/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

function basicCenter() {
    return createNotificationCenter({
        defaultNotifications: [
            { id: "n1", title: "Server restarted", kind: "info",    timestamp: 1000 },
            { id: "n2", title: "Build passed",      kind: "success", timestamp: 2000 },
            { id: "n3", title: "Quota at 80%",      kind: "warning", timestamp: 3000 },
            { id: "n4", title: "DB connection lost", kind: "error",  timestamp: 4000 },
        ],
    });
}

// =====================================================================
// Construction + sorting
// =====================================================================

test("notifications are sorted newest-first on construction", () => {
    setupDOM();
    const nc = basicCenter();
    const arr = nc.notifications();
    assert.deepEqual(arr.map(n => n.id), ["n4", "n3", "n2", "n1"]);
    nc.destroy();
    teardownDOM();
});

test("default kind is info; invalid kinds fall back to info", () => {
    setupDOM();
    const nc = createNotificationCenter({
        defaultNotifications: [
            { id: "a", title: "no kind", timestamp: 1 },
            { id: "b", title: "bogus", kind: "purple", timestamp: 2 },
        ],
    });
    assert.equal(nc.getNotification("a").kind, "info");
    assert.equal(nc.getNotification("b").kind, "info");
    nc.destroy();
    teardownDOM();
});

test("Date timestamps are converted to numeric epoch ms", () => {
    setupDOM();
    const d = new Date(2026, 5, 16, 10, 0, 0);
    const nc = createNotificationCenter({
        defaultNotifications: [{ id: "a", title: "X", timestamp: d }],
    });
    assert.equal(nc.getNotification("a").timestamp, d.getTime());
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// add / remove / update
// =====================================================================

test("add prepends new notification + fires onChange", () => {
    setupDOM();
    let changedArg = null;
    const nc = createNotificationCenter({
        onChange: (arr) => { changedArg = arr; },
    });
    nc.add({ id: "a", title: "Hello", kind: "info", timestamp: 100 });
    assert.equal(nc.notifications().length, 1);
    assert.equal(nc.notifications()[0].id, "a");
    assert.ok(changedArg);
    assert.equal(changedArg.length, 1);
    nc.destroy();
    teardownDOM();
});

test("add with duplicate id replaces existing entry", () => {
    setupDOM();
    const nc = basicCenter();
    nc.add({ id: "n1", title: "Rewritten", kind: "warning", timestamp: 5000 });
    assert.equal(nc.notifications().length, 4);   // still 4
    const n1 = nc.getNotification("n1");
    assert.equal(n1.title, "Rewritten");
    assert.equal(n1.kind, "warning");
    // Sorting should put it at the top now (timestamp 5000 > 4000).
    assert.equal(nc.notifications()[0].id, "n1");
    nc.destroy();
    teardownDOM();
});

test("remove deletes by id; fires onClear", () => {
    setupDOM();
    let cleared = null;
    const nc = createNotificationCenter({
        defaultNotifications: [{ id: "a", title: "A" }],
        onClear: (id) => { cleared = id; },
    });
    nc.remove("a");
    assert.equal(nc.notifications().length, 0);
    assert.equal(cleared, "a");
    // No-op for unknown id
    nc.remove("ghost");
    assert.equal(nc.notifications().length, 0);
    nc.destroy();
    teardownDOM();
});

test("update merges partial without changing id; re-sorts on timestamp change", () => {
    setupDOM();
    const nc = basicCenter();
    nc.update("n1", { title: "Updated", timestamp: 9999 });
    const n1 = nc.getNotification("n1");
    assert.equal(n1.title, "Updated");
    assert.equal(n1.id, "n1");
    // n1 should now be first (highest timestamp).
    assert.equal(nc.notifications()[0].id, "n1");
    nc.destroy();
    teardownDOM();
});

test("setNotifications replaces the whole list, normalizing entries", () => {
    setupDOM();
    const nc = basicCenter();
    nc.setNotifications([
        { id: "x", title: "X", kind: "error", timestamp: 100 },
        { id: "y", title: "Y" },
    ]);
    assert.equal(nc.notifications().length, 2);
    assert.equal(nc.notifications()[0].id, "y");   // no-ts defaults to now, newer than 100
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// Read / unread state
// =====================================================================

test("unreadCount returns count of unread notifications", () => {
    setupDOM();
    const nc = basicCenter();
    assert.equal(nc.unreadCount(), 4);
    nc.markRead("n1");
    assert.equal(nc.unreadCount(), 3);
    nc.markRead("n1");   // idempotent
    assert.equal(nc.unreadCount(), 3);
    nc.destroy();
    teardownDOM();
});

test("markRead fires onMarkRead callback (once per transition)", () => {
    setupDOM();
    let fires = 0;
    const nc = createNotificationCenter({
        defaultNotifications: [{ id: "a", title: "A" }],
        onMarkRead: () => { fires++; },
    });
    nc.markRead("a");
    nc.markRead("a");   // already read, no fire
    assert.equal(fires, 1);
    nc.destroy();
    teardownDOM();
});

test("markUnread reverses markRead", () => {
    setupDOM();
    const nc = basicCenter();
    nc.markRead("n1");
    assert.equal(nc.getNotification("n1").read, true);
    nc.markUnread("n1");
    assert.equal(nc.getNotification("n1").read, false);
    nc.destroy();
    teardownDOM();
});

test("markAllRead marks every notification + fires onMarkAllRead once", () => {
    setupDOM();
    let fires = 0;
    const nc = createNotificationCenter({
        defaultNotifications: [
            { id: "a", title: "A" },
            { id: "b", title: "B" },
        ],
        onMarkAllRead: () => { fires++; },
    });
    nc.markAllRead();
    assert.equal(nc.unreadCount(), 0);
    assert.equal(fires, 1);
    // Already all-read, no fire.
    nc.markAllRead();
    assert.equal(fires, 1);
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// Clear operations
// =====================================================================

test("clearAll empties the list + fires onClearAll", () => {
    setupDOM();
    let fires = 0;
    const nc = createNotificationCenter({
        defaultNotifications: [{ id: "a", title: "A" }],
        onClearAll: () => { fires++; },
    });
    nc.clearAll();
    assert.equal(nc.notifications().length, 0);
    assert.equal(fires, 1);
    nc.clearAll();   // already empty, no fire
    assert.equal(fires, 1);
    nc.destroy();
    teardownDOM();
});

test("clearByKind removes only matching kind", () => {
    setupDOM();
    const nc = basicCenter();
    nc.clearByKind("warning");
    assert.equal(nc.notifications().length, 3);
    assert.equal(nc.getNotification("n3"), null);
    nc.destroy();
    teardownDOM();
});

test("clearByKind with invalid kind is a no-op", () => {
    setupDOM();
    const nc = basicCenter();
    nc.clearByKind("purple");
    assert.equal(nc.notifications().length, 4);
    nc.destroy();
    teardownDOM();
});

test("clearRead removes only read notifications", () => {
    setupDOM();
    const nc = basicCenter();
    nc.markRead("n1");
    nc.markRead("n3");
    nc.clearRead();
    assert.equal(nc.notifications().length, 2);
    assert.deepEqual(nc.notifications().map(n => n.id), ["n4", "n2"]);
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// Filtering
// =====================================================================

test("visible() with no filter returns all notifications", () => {
    setupDOM();
    const nc = basicCenter();
    assert.equal(nc.visible().length, 4);
    nc.destroy();
    teardownDOM();
});

test("visible() filters by kind", () => {
    setupDOM();
    const nc = basicCenter();
    nc.setFilter({ kind: "error" });
    const vis = nc.visible();
    assert.equal(vis.length, 1);
    assert.equal(vis[0].id, "n4");
    nc.destroy();
    teardownDOM();
});

test("visible() filters by read state", () => {
    setupDOM();
    const nc = basicCenter();
    nc.markRead("n1");
    nc.markRead("n2");
    nc.setFilter({ read: false });
    assert.deepEqual(nc.visible().map(n => n.id), ["n4", "n3"]);
    nc.setFilter({ read: true });
    assert.deepEqual(nc.visible().map(n => n.id), ["n2", "n1"]);
    nc.destroy();
    teardownDOM();
});

test("setFilter merges; clearFilter resets to null", () => {
    setupDOM();
    const nc = basicCenter();
    nc.setFilter({ kind: "info" });
    nc.setFilter({ read: false });
    // Both criteria active
    assert.deepEqual(nc.filter(), { kind: "info", read: false });
    nc.clearFilter();
    assert.equal(nc.filter(), null);
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// maxItems eviction
// =====================================================================

test("maxItems caps the list to N newest", () => {
    setupDOM();
    const nc = createNotificationCenter({ maxItems: 3 });
    nc.add({ id: "a", title: "A", timestamp: 100 });
    nc.add({ id: "b", title: "B", timestamp: 200 });
    nc.add({ id: "c", title: "C", timestamp: 300 });
    nc.add({ id: "d", title: "D", timestamp: 400 });
    const arr = nc.notifications();
    assert.equal(arr.length, 3);
    assert.deepEqual(arr.map(n => n.id), ["d", "c", "b"]);
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot + paint
// =====================================================================

test("attachRoot sets role=region + aria-label + reactive unread attrs", () => {
    setupDOM();
    const nc = basicCenter();
    const el = mkEl();
    nc.attachRoot(el);
    assert.equal(el.getAttribute("role"), "region");
    assert.equal(el.getAttribute("aria-label"), "Notifications");
    assert.equal(el.getAttribute("data-nc-unread"), "4");
    assert.equal(el.getAttribute("data-nc-has-unread"), "");
    nc.markAllRead();
    assert.equal(el.getAttribute("data-nc-unread"), "0");
    assert.equal(el.hasAttribute("data-nc-has-unread"), false);
    nc.destroy();
    teardownDOM();
});

test("attachUnreadBadge writes count to textContent + clamps to 99+", () => {
    setupDOM();
    const nc = createNotificationCenter();
    const el = mkEl();
    nc.attachUnreadBadge(el);
    assert.equal(el.textContent, "0");
    assert.equal(el.getAttribute("data-nc-hidden"), "");
    nc.add({ id: "a", title: "A" });
    assert.equal(el.textContent, "1");
    assert.equal(el.hasAttribute("data-nc-hidden"), false);
    // Push past 99
    for (let i = 0; i < 105; i++) {
        nc.add({ id: "x" + i, title: "X", timestamp: i });
    }
    assert.equal(el.textContent, "99+");
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// attachItem + paint
// =====================================================================

test("attachItem paints kind, read, missing attrs", () => {
    setupDOM();
    const nc = basicCenter();
    const el = mkEl();
    nc.attachItem(el, "n1");
    assert.equal(el.getAttribute("data-nc-id"), "n1");
    assert.equal(el.getAttribute("data-nc-kind"), "info");
    assert.equal(el.getAttribute("data-nc-unread"), "");
    assert.equal(el.hasAttribute("data-nc-read"), false);
    nc.markRead("n1");
    assert.equal(el.getAttribute("data-nc-read"), "");
    assert.equal(el.hasAttribute("data-nc-unread"), false);
    nc.update("n1", { kind: "error" });
    assert.equal(el.getAttribute("data-nc-kind"), "error");
    nc.remove("n1");
    assert.equal(el.getAttribute("data-nc-missing"), "");
    nc.destroy();
    teardownDOM();
});

test("attachItem click marks the notification as read", () => {
    setupDOM();
    const nc = basicCenter();
    const el = mkEl();
    nc.attachItem(el, "n1");
    assert.equal(nc.getNotification("n1").read, false);
    el.click();
    assert.equal(nc.getNotification("n1").read, true);
    nc.destroy();
    teardownDOM();
});

test("attachItem Enter / Space mark read", () => {
    setupDOM();
    const nc = basicCenter();
    const el = mkEl();
    nc.attachItem(el, "n1");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    assert.equal(nc.getNotification("n1").read, true);
    nc.markUnread("n1");
    el.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    assert.equal(nc.getNotification("n1").read, true);
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// Buttons
// =====================================================================

test("attachClearAllButton wires click to clearAll", () => {
    setupDOM();
    const nc = basicCenter();
    const btn = mkEl("button");
    nc.attachClearAllButton(btn);
    assert.equal(btn.getAttribute("type"), "button");
    btn.click();
    assert.equal(nc.notifications().length, 0);
    nc.destroy();
    teardownDOM();
});

test("attachMarkAllReadButton wires click to markAllRead", () => {
    setupDOM();
    const nc = basicCenter();
    const btn = mkEl("button");
    nc.attachMarkAllReadButton(btn);
    btn.click();
    assert.equal(nc.unreadCount(), 0);
    nc.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy is idempotent + prevents further mutations", () => {
    setupDOM();
    const nc = basicCenter();
    nc.destroy();
    nc.destroy();
    nc.add({ id: "x", title: "X" });
    nc.markRead("n1");
    assert.equal(nc.destroyed, true);
    teardownDOM();
});

test("destroy detaches all attached items", () => {
    setupDOM();
    const nc = basicCenter();
    const root = mkEl();
    const item = mkEl();
    nc.attachRoot(root);
    nc.attachItem(item, "n1");
    nc.destroy();
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(item.hasAttribute("data-nc-id"), false);
    teardownDOM();
});
