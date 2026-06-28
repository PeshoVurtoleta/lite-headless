// menu-v04.test.js
// v0.4 additions: context menu (right-click + virtual anchor), checkbox/radio
// items, safe-triangle geometry + lifecycle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks, dispatchKey, dispatchClick, dispatchPointer } from "./_setup.js";
import { createMenu } from "../src/menu/index.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── context menu ──────────────────────────────────────────────────────────

test("attachContextTarget: right-click on target opens the menu", () => {
    setupDOM();
    const target = document.createElement("div");
    target.style.width = "200px";
    target.style.height = "200px";
    const menuEl = document.createElement("ul");
    const li = document.createElement("li");
    li.textContent = "Copy";
    menuEl.appendChild(li);
    document.body.append(target, menuEl);

    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachItem(li, { label: "Copy", onSelect: () => {} });
    menu.attachContextTarget(target);

    assert.equal(menu.open(), false);
    const e = new globalThis.Event("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clientX", { value: 50 });
    Object.defineProperty(e, "clientY", { value: 80 });
    target.dispatchEvent(e);

    assert.equal(menu.open(), true);
    // a virtual anchor element should be appended to body
    const vAnchor = document.querySelector("[data-menu-virtual-anchor]");
    assert.ok(vAnchor, "virtual anchor element exists");
    assert.equal(vAnchor.style.left, "50px");
    assert.equal(vAnchor.style.top, "80px");

    menu.destroy();
    teardownDOM();
});

test("context menu close removes the virtual anchor", () => {
    setupDOM();
    const target = document.createElement("div");
    const menuEl = document.createElement("ul");
    document.body.append(target, menuEl);
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachContextTarget(target);
    const e = new globalThis.Event("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clientX", { value: 10 });
    Object.defineProperty(e, "clientY", { value: 20 });
    target.dispatchEvent(e);
    assert.ok(document.querySelector("[data-menu-virtual-anchor]"));

    menu.setOpen(false, "api");
    assert.equal(document.querySelector("[data-menu-virtual-anchor]"), null, "virtual anchor removed on close");

    menu.destroy();
    teardownDOM();
});

test("preventDefault on the native contextmenu event so the OS menu doesn't show", () => {
    setupDOM();
    const target = document.createElement("div");
    const menuEl = document.createElement("ul");
    document.body.append(target, menuEl);
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachContextTarget(target);
    const e = new globalThis.Event("contextmenu", { bubbles: true, cancelable: true });
    Object.defineProperty(e, "clientX", { value: 30 });
    Object.defineProperty(e, "clientY", { value: 40 });
    target.dispatchEvent(e);
    assert.equal(e.defaultPrevented, true);
    menu.destroy();
    teardownDOM();
});

test("rapid re-right-click on a different spot repositions, doesn't double-open", () => {
    setupDOM();
    const target = document.createElement("div");
    const menuEl = document.createElement("ul");
    document.body.append(target, menuEl);
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachContextTarget(target);

    const click = (x, y) => {
        const e = new globalThis.Event("contextmenu", { bubbles: true, cancelable: true });
        Object.defineProperty(e, "clientX", { value: x });
        Object.defineProperty(e, "clientY", { value: y });
        target.dispatchEvent(e);
    };
    click(50, 50);
    click(120, 90);

    const anchors = document.querySelectorAll("[data-menu-virtual-anchor]");
    assert.equal(anchors.length, 1, "only one virtual anchor at a time");
    assert.equal(anchors[0].style.left, "120px", "moved to the new location");
    assert.equal(anchors[0].style.top, "90px");
    menu.destroy();
    teardownDOM();
});

// ─── menuitemcheckbox ──────────────────────────────────────────────────────

test("attachCheckboxItem sets role=menuitemcheckbox and aria-checked", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const li = document.createElement("li");
    li.textContent = "Word Wrap";
    menuEl.appendChild(li);
    document.body.appendChild(menuEl);

    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachCheckboxItem(li, { label: "Word Wrap", checked: false });

    assert.equal(li.getAttribute("role"), "menuitemcheckbox");
    assert.equal(li.getAttribute("aria-checked"), "false");
    menu.destroy();
    teardownDOM();
});

test("clicking a checkbox item toggles aria-checked and fires onCheckedChange", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const li = document.createElement("li");
    menuEl.appendChild(li);
    document.body.appendChild(menuEl);

    let lastChange = null;
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachCheckboxItem(li, {
        label: "Toggle",
        checked: false,
        onCheckedChange: (next) => { lastChange = next; },
    });
    menu.setOpen(true, "api");

    dispatchClick(li);
    assert.equal(li.getAttribute("aria-checked"), "true");
    assert.equal(lastChange, true);

    dispatchClick(li);
    assert.equal(li.getAttribute("aria-checked"), "false");
    assert.equal(lastChange, false);

    menu.destroy();
    teardownDOM();
});

test("checkbox items DON'T close the menu on activation (sticky)", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const li = document.createElement("li");
    menuEl.appendChild(li);
    document.body.appendChild(menuEl);
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachCheckboxItem(li, { checked: false });
    menu.setOpen(true, "api");

    dispatchClick(li);
    assert.equal(menu.open(), true, "checkbox is sticky -- menu stays open");
    dispatchClick(li);
    assert.equal(menu.open(), true);
    menu.destroy();
    teardownDOM();
});

test("Enter on a focused checkbox item toggles without closing", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const li = document.createElement("li");
    menuEl.appendChild(li);
    document.body.appendChild(menuEl);
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    menu.attachCheckboxItem(li, { checked: false });
    menu.setOpen(true, "api");

    dispatchKey(menuEl, "Enter");
    assert.equal(li.getAttribute("aria-checked"), "true");
    assert.equal(menu.open(), true, "Enter on checkbox doesn't close menu");
    menu.destroy();
    teardownDOM();
});

// ─── menuitemradio ─────────────────────────────────────────────────────────

test("attachRadioItem sets role=menuitemradio; one per group checked", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const items = ["small", "medium", "large"].map((v) => {
        const li = document.createElement("li");
        li.textContent = v;
        menuEl.appendChild(li);
        return { el: li, value: v };
    });
    document.body.appendChild(menuEl);

    let lastValue = null;
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    for (const it of items) {
        menu.attachRadioItem(it.el, {
            value: it.value, group: "size", label: it.value,
            onValueChange: (v) => { lastValue = v; },
        });
    }

    // first attached item seeds the group's value
    assert.equal(items[0].el.getAttribute("role"), "menuitemradio");
    assert.equal(items[0].el.getAttribute("aria-checked"), "true",
        "first item registered is the initial selection");
    assert.equal(items[1].el.getAttribute("aria-checked"), "false");
    assert.equal(items[2].el.getAttribute("aria-checked"), "false");

    menu.setOpen(true, "api");
    dispatchClick(items[1].el);

    assert.equal(items[0].el.getAttribute("aria-checked"), "false");
    assert.equal(items[1].el.getAttribute("aria-checked"), "true");
    assert.equal(items[2].el.getAttribute("aria-checked"), "false");
    assert.equal(lastValue, "medium");

    menu.destroy();
    teardownDOM();
});

test("radio activation closes the menu (one-shot pick), unlike checkbox (sticky)", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const items = ["a", "b"].map((v) => {
        const li = document.createElement("li");
        li.textContent = v;
        menuEl.appendChild(li);
        return { el: li, value: v };
    });
    document.body.appendChild(menuEl);
    const menu = createMenu({ container: null });
    menu.attachMenu(menuEl);
    for (const it of items) {
        menu.attachRadioItem(it.el, { value: it.value, group: "g", label: it.value });
    }
    menu.setOpen(true, "api");
    dispatchClick(items[1].el);
    assert.equal(menu.open(), false, "radio is a single pick; menu closes");
    menu.destroy();
    teardownDOM();
});

test("two radio groups in the same menu stay independent", () => {
    setupDOM();
    const menuEl = document.createElement("ul");
    const a1 = document.createElement("li"); a1.textContent = "A1";
    const a2 = document.createElement("li"); a2.textContent = "A2";
    const b1 = document.createElement("li"); b1.textContent = "B1";
    const b2 = document.createElement("li"); b2.textContent = "B2";
    menuEl.append(a1, a2, b1, b2);
    document.body.appendChild(menuEl);

    const menu = createMenu({ container: null, closeOnSelect: false });
    menu.attachMenu(menuEl);
    menu.attachRadioItem(a1, { value: "a1", group: "A" });
    menu.attachRadioItem(a2, { value: "a2", group: "A" });
    menu.attachRadioItem(b1, { value: "b1", group: "B" });
    menu.attachRadioItem(b2, { value: "b2", group: "B" });

    menu.setOpen(true, "api");
    dispatchClick(a2);
    assert.equal(a1.getAttribute("aria-checked"), "false");
    assert.equal(a2.getAttribute("aria-checked"), "true");
    assert.equal(b1.getAttribute("aria-checked"), "true", "group B unchanged");
    assert.equal(b2.getAttribute("aria-checked"), "false");

    dispatchClick(b2);
    assert.equal(a2.getAttribute("aria-checked"), "true", "group A unchanged");
    assert.equal(b1.getAttribute("aria-checked"), "false");
    assert.equal(b2.getAttribute("aria-checked"), "true");

    menu.destroy();
    teardownDOM();
});

// ─── safe-triangle ─────────────────────────────────────────────────────────
//
// happy-dom doesn't simulate layout, so getBoundingClientRect returns zeros
// for unstyled elements. We exercise the geometry directly through the
// _submenus introspection + simulated pointermove events with chosen
// coordinates. The triangle-vs-point math is the load-bearing piece.

function buildSubmenuPair() {
    const parent = createBareMenu("parent");
    const submenu = createMenu({ container: null, isSubmenu: true });
    const subMenuEl = document.createElement("ul");
    const subLi = document.createElement("li");
    subLi.textContent = "deep";
    subMenuEl.appendChild(subLi);
    document.body.appendChild(subMenuEl);
    submenu.attachMenu(subMenuEl);
    submenu.attachItem(subLi, { label: "deep", onSelect: () => {} });
    parent.menu.attachSubmenu(parent.parentItem, submenu);
    return { ...parent, submenu, subMenuEl, subLi };
}

function createBareMenu(name) {
    const trigger = document.createElement("button");
    const menuEl = document.createElement("ul");
    const parentItem = document.createElement("li");
    parentItem.textContent = "with-submenu";
    menuEl.appendChild(parentItem);
    document.body.append(trigger, menuEl);
    const menu = createMenu({
        container: null,
        submenuOpenDelay: 5, submenuCloseDelay: 50,
        safeTriangle: true,
    });
    menu.attachTrigger(trigger);
    menu.attachMenu(menuEl);
    menu.attachItem(parentItem, { label: "with-submenu" });
    return { menu, trigger, menuEl, parentItem };
}

test("safeTriangle:false falls back to plain timer close (regression guard)", async () => {
    setupDOM();
    const trigger = document.createElement("button");
    const menuEl = document.createElement("ul");
    const parentItem = document.createElement("li");
    parentItem.textContent = "p";
    menuEl.appendChild(parentItem);
    document.body.append(trigger, menuEl);
    const menu = createMenu({
        container: null,
        submenuOpenDelay: 5, submenuCloseDelay: 40,
        safeTriangle: false,
    });
    menu.attachTrigger(trigger);
    menu.attachMenu(menuEl);
    menu.attachItem(parentItem, { label: "p" });
    const submenu = createMenu({ container: null, isSubmenu: true });
    const sub = document.createElement("ul");
    document.body.appendChild(sub);
    submenu.attachMenu(sub);
    menu.attachSubmenu(parentItem, submenu);

    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");

    const leave = new globalThis.Event("pointerleave", { bubbles: true });
    Object.defineProperty(leave, "clientX", { value: 100 });
    Object.defineProperty(leave, "clientY", { value: 100 });
    parentItem.dispatchEvent(leave);

    const links = menu._submenus();
    const link = links.get(parentItem);
    assert.ok(link.closeTimer, "plain timer installed");
    assert.equal(link.safeTriangleOff, undefined, "no safe-triangle when disabled");

    await wait(60);
    assert.equal(submenu.open(), false, "closed after delay");

    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("safe-triangle installs a document pointermove listener while active", () => {
    setupDOM();
    const { menu, parentItem, submenu, subMenuEl } = buildSubmenuPair();
    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");

    const leave = new globalThis.Event("pointerleave", { bubbles: true });
    Object.defineProperty(leave, "clientX", { value: 50 });
    Object.defineProperty(leave, "clientY", { value: 50 });
    parentItem.dispatchEvent(leave);

    const link = menu._submenus().get(parentItem);
    assert.ok(link.safeTriangleOff, "safe-triangle is armed");

    // re-entering the parent item should clear safe-triangle
    const reEnter = new globalThis.Event("pointerenter", { bubbles: true });
    parentItem.dispatchEvent(reEnter);
    assert.equal(link.safeTriangleOff, null, "re-enter parent disarms safe-triangle");
    assert.equal(submenu.open(), true, "submenu stayed open");

    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("pointer entering the submenu cancels safe-triangle", () => {
    setupDOM();
    const { menu, parentItem, submenu, subMenuEl } = buildSubmenuPair();
    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");

    const leave = new globalThis.Event("pointerleave", { bubbles: true });
    Object.defineProperty(leave, "clientX", { value: 50 });
    Object.defineProperty(leave, "clientY", { value: 50 });
    parentItem.dispatchEvent(leave);
    let link = menu._submenus().get(parentItem);
    assert.ok(link.safeTriangleOff);

    const enterSub = new globalThis.Event("pointerenter", { bubbles: true });
    subMenuEl.dispatchEvent(enterSub);
    link = menu._submenus().get(parentItem);
    assert.equal(link.safeTriangleOff, null, "safe-triangle disarmed on submenu enter");

    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("safe-triangle hard-cap fallback: pointer-still inside triangle closes eventually", async () => {
    setupDOM();
    const trigger = document.createElement("button");
    const menuEl = document.createElement("ul");
    const parentItem = document.createElement("li");
    parentItem.textContent = "p";
    menuEl.appendChild(parentItem);
    document.body.append(trigger, menuEl);
    // tiny delays so the hard cap (2 * submenuCloseDelay = 40ms) fires fast
    const menu = createMenu({
        container: null,
        submenuOpenDelay: 5, submenuCloseDelay: 20,
        safeTriangle: true,
    });
    menu.attachTrigger(trigger);
    menu.attachMenu(menuEl);
    menu.attachItem(parentItem, { label: "p" });
    const submenu = createMenu({ container: null, isSubmenu: true });
    const sub = document.createElement("ul");
    document.body.appendChild(sub);
    submenu.attachMenu(sub);
    menu.attachSubmenu(parentItem, submenu);

    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");

    const leave = new globalThis.Event("pointerleave", { bubbles: true });
    Object.defineProperty(leave, "clientX", { value: 50 });
    Object.defineProperty(leave, "clientY", { value: 50 });
    parentItem.dispatchEvent(leave);

    assert.equal(submenu.open(), true, "still open mid-triangle");
    await wait(60);  // > 2 * 20ms hard cap
    assert.equal(submenu.open(), false, "hard cap closed it after pointer stayed still");

    submenu.destroy();
    menu.destroy();
    teardownDOM();
});
