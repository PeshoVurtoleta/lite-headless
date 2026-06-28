// menu.test.js -- createMenu: keyboard nav, focus management, submenu, ARIA

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks, dispatchKey, dispatchClick, dispatchPointer } from "./_setup.js";
import { createMenu } from "../src/menu/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    trigger.textContent = "Actions";
    const menuEl = document.createElement("ul");
    const items = ["Save", "Export", "Print", "Share"].map((label) => {
        const li = document.createElement("li");
        li.textContent = label;
        menuEl.appendChild(li);
        return { el: li, label };
    });
    document.body.append(trigger, menuEl);
    return { trigger, menuEl, items };
}

function build(opts = {}, itemOpts = []) {
    const { trigger, menuEl, items } = mkDOM();
    const menu = createMenu({ container: null, ...opts });
    menu.attachTrigger(trigger);
    menu.attachMenu(menuEl);
    items.forEach((it, i) => {
        menu.attachItem(it.el, { label: it.label, ...itemOpts[i] });
    });
    return { menu, trigger, menuEl, items };
}

// helpers
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("trigger and menu get correct ARIA attributes", () => {
    setupDOM();
    const { menu, trigger, menuEl } = build();
    assert.equal(trigger.getAttribute("aria-haspopup"), "menu");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.getAttribute("aria-controls"), menuEl.id);
    assert.equal(menuEl.getAttribute("role"), "menu");
    menu.destroy();
    teardownDOM();
});

test("items get role=menuitem and unique ids", () => {
    setupDOM();
    const { menu, items } = build();
    for (const it of items) {
        assert.equal(it.el.getAttribute("role"), "menuitem");
        assert.ok(it.el.id.startsWith("lh-menuitem-"));
        assert.equal(it.el.getAttribute("tabindex"), "-1");
    }
    menu.destroy();
    teardownDOM();
});

test("opening the menu focuses the first item and applies roving tabindex", () => {
    setupDOM();
    const { menu, items } = build();
    menu.setOpen(true, "api");
    assert.equal(items[0].el.getAttribute("tabindex"), "0", "first item is tabbable");
    assert.equal(items[1].el.getAttribute("tabindex"), "-1");
    assert.equal(document.activeElement, items[0].el, "DOM focus moved to first item");
    menu.destroy();
    teardownDOM();
});

test("ArrowDown / ArrowUp move focus with loop wrapping", () => {
    setupDOM();
    const { menu, menuEl, items } = build({ loop: true });
    menu.setOpen(true, "api");
    dispatchKey(menuEl, "ArrowDown");
    assert.equal(menu._focusIndex(), 1);
    dispatchKey(menuEl, "ArrowDown");
    dispatchKey(menuEl, "ArrowDown");
    assert.equal(menu._focusIndex(), 3);
    dispatchKey(menuEl, "ArrowDown");          // wraps
    assert.equal(menu._focusIndex(), 0);
    dispatchKey(menuEl, "ArrowUp");            // wraps back
    assert.equal(menu._focusIndex(), 3);
    menu.destroy();
    teardownDOM();
});

test("disabled items are skipped during arrow navigation", () => {
    setupDOM();
    const { menu, menuEl } = build({}, [{}, { disabled: true }, {}, {}]);
    menu.setOpen(true, "api");
    // initial focus at 0; ArrowDown should skip disabled idx 1 -> 2
    dispatchKey(menuEl, "ArrowDown");
    assert.equal(menu._focusIndex(), 2, "skipped the disabled item at index 1");
    dispatchKey(menuEl, "ArrowUp");
    assert.equal(menu._focusIndex(), 0, "skipped disabled item going back");
    menu.destroy();
    teardownDOM();
});

test("Home / End jump to first / last focusable", () => {
    setupDOM();
    const { menu, menuEl } = build();
    menu.setOpen(true, "api");
    dispatchKey(menuEl, "End");
    assert.equal(menu._focusIndex(), 3);
    dispatchKey(menuEl, "Home");
    assert.equal(menu._focusIndex(), 0);
    menu.destroy();
    teardownDOM();
});

test("Enter activates focused item via onSelect callback and closes menu", () => {
    setupDOM();
    let called = null;
    const itemOpts = [{ onSelect: () => { called = "save"; } }, {}, {}, {}];
    const { menu, menuEl } = build({}, itemOpts);
    menu.setOpen(true, "api");
    dispatchKey(menuEl, "Enter");
    assert.equal(called, "save");
    assert.equal(menu.open(), false, "closeOnSelect default true");
    menu.destroy();
    teardownDOM();
});

test("Space also activates (matching native button semantics)", () => {
    setupDOM();
    let called = false;
    const { menu, menuEl } = build({}, [{ onSelect: () => { called = true; } }, {}, {}, {}]);
    menu.setOpen(true, "api");
    dispatchKey(menuEl, " ");
    assert.equal(called, true);
    menu.destroy();
    teardownDOM();
});

test("clicking a disabled item is a no-op (no onSelect, no close)", () => {
    setupDOM();
    let called = false;
    const { menu, items } = build({}, [{ disabled: true, onSelect: () => { called = true; } }, {}, {}, {}]);
    menu.setOpen(true, "api");
    dispatchClick(items[0].el);
    assert.equal(called, false, "onSelect not fired");
    assert.equal(menu.open(), true, "menu stayed open");
    menu.destroy();
    teardownDOM();
});

test("closeOnSelect:false keeps menu open after activation", () => {
    setupDOM();
    let called = 0;
    const { menu, menuEl } = build({ closeOnSelect: false }, [{ onSelect: () => { called++; } }, {}, {}, {}]);
    menu.setOpen(true, "api");
    dispatchKey(menuEl, "Enter");
    dispatchKey(menuEl, "Enter");
    assert.equal(called, 2);
    assert.equal(menu.open(), true);
    menu.destroy();
    teardownDOM();
});

test("Escape closes the menu", () => {
    setupDOM();
    const { menu } = build();
    menu.setOpen(true, "api");
    dispatchKey(document, "Escape");
    assert.equal(menu.open(), false);
    menu.destroy();
    teardownDOM();
});

test("Tab closes the menu (so native tab flow continues)", () => {
    setupDOM();
    const { menu, menuEl } = build();
    menu.setOpen(true, "api");
    dispatchKey(menuEl, "Tab");
    assert.equal(menu.open(), false);
    menu.destroy();
    teardownDOM();
});

test("trigger ArrowDown opens menu and focuses first item", () => {
    setupDOM();
    const { menu, trigger, items } = build();
    dispatchKey(trigger, "ArrowDown");
    assert.equal(menu.open(), true);
    assert.equal(document.activeElement, items[0].el);
    menu.destroy();
    teardownDOM();
});

test("trigger ArrowUp opens menu and focuses last item", async () => {
    setupDOM();
    const { menu, trigger, items } = build();
    dispatchKey(trigger, "ArrowUp");
    await flushMicrotasks();
    assert.equal(menu.open(), true);
    assert.equal(document.activeElement, items[3].el);
    menu.destroy();
    teardownDOM();
});

test("typeahead: single-letter cycles among matches", () => {
    setupDOM();
    // items: Save(0), Export(1), Print(2), Share(3) -- two 's' items
    const { menu, menuEl } = build();
    menu.setOpen(true, "api");
    // focus is at 0 (Save). Press 's' -> should go to next 's': Share (3)
    dispatchKey(menuEl, "s");
    assert.equal(menu._focusIndex(), 3, "advanced past Save to Share");
    dispatchKey(menuEl, "s");
    assert.equal(menu._focusIndex(), 0, "wrapped back to Save");
    menu.destroy();
    teardownDOM();
});

test("typeahead while closed: opens and jumps", () => {
    setupDOM();
    const { menu, trigger } = build();
    dispatchKey(trigger, "p");
    assert.equal(menu.open(), true);
    assert.equal(menu._focusIndex(), 2, "jumped to Print");
    menu.destroy();
    teardownDOM();
});

test("pointerenter on an item focuses it", () => {
    setupDOM();
    const { menu, items } = build();
    menu.setOpen(true, "api");
    const e = new globalThis.Event("pointerenter", { bubbles: true });
    items[2].el.dispatchEvent(e);
    assert.equal(menu._focusIndex(), 2);
    menu.destroy();
    teardownDOM();
});

test("outside click dismisses (and inside click doesn't)", () => {
    setupDOM();
    const { menu, items } = build({ closeOnOutsideClick: true });
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    menu.setOpen(true, "api");
    dispatchPointer(items[1].el, "pointerdown");
    assert.equal(menu.open(), true, "clicking an item is inside");
    dispatchPointer(outside, "pointerdown");
    assert.equal(menu.open(), false);
    menu.destroy();
    teardownDOM();
});

test("attachSeparator gives the element role=separator", () => {
    setupDOM();
    const { menu, menuEl } = build();
    const hr = document.createElement("li");
    menuEl.insertBefore(hr, menuEl.children[1]);
    const off = menu.attachSeparator(hr);
    assert.equal(hr.getAttribute("role"), "separator");
    off();
    assert.equal(hr.hasAttribute("role"), false);
    menu.destroy();
    teardownDOM();
});

test("destroy clears item ARIA + roving tabindex", () => {
    setupDOM();
    const { menu, trigger, items } = build();
    menu.setOpen(true, "api");
    menu.destroy();
    assert.equal(trigger.hasAttribute("aria-haspopup"), false);
    assert.equal(items[0].el.hasAttribute("role"), false);
    assert.equal(items[0].el.hasAttribute("tabindex"), false);
    teardownDOM();
});

test("attachInside protects external controls from outside-click", () => {
    setupDOM();
    const { menu } = build();
    const ext = document.createElement("button");
    document.body.appendChild(ext);
    menu.attachInside(ext);
    menu.setOpen(true, "api");
    dispatchPointer(ext, "pointerdown");
    assert.equal(menu.open(), true);
    menu.destroy();
    teardownDOM();
});

// ─── submenu suite ────────────────────────────────────────────────────────

function buildWithSubmenu() {
    setupDOM();
    // parent menu owns the submenu hover timing; use small delays so tests are fast
    const parent = build({ submenuOpenDelay: 5, submenuCloseDelay: 10 });
    // create a submenu separately, mark its parent-item-link
    const submenuEl = document.createElement("ul");
    const subItems = ["Recently opened", "Templates", "From URL"].map((label) => {
        const li = document.createElement("li");
        li.textContent = label;
        submenuEl.appendChild(li);
        return { el: li, label };
    });
    document.body.appendChild(submenuEl);

    const submenu = createMenu({
        container: null, isSubmenu: true,
        placement: "right-start",
    });
    submenu.attachMenu(submenuEl);
    subItems.forEach((it) => submenu.attachItem(it.el, { label: it.label, onSelect: () => {} }));

    // wire the parent item (index 0) as the submenu's parent
    parent.menu.attachSubmenu(parent.items[0].el, submenu);
    return { ...parent, submenu, subItems, submenuEl };
}

test("attachSubmenu sets aria-haspopup + aria-expanded on parent item", () => {
    const { menu, items, submenu } = buildWithSubmenu();
    assert.equal(items[0].el.getAttribute("aria-haspopup"), "menu");
    assert.equal(items[0].el.getAttribute("aria-expanded"), "false");
    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");
    assert.equal(items[0].el.getAttribute("aria-expanded"), "true");
    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("ArrowRight on parent item opens the submenu (and ArrowLeft closes it)", async () => {
    const { menu, menuEl, submenu, submenuEl } = buildWithSubmenu();
    menu.setOpen(true, "api");
    // focus is on parent item 0; ArrowRight opens submenu
    dispatchKey(menuEl, "ArrowRight");
    assert.equal(submenu.open(), true);
    // ArrowLeft inside submenu closes it (submenu is isSubmenu:true)
    dispatchKey(submenuEl, "ArrowLeft");
    assert.equal(submenu.open(), false);
    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("hovering parent item opens submenu after submenuOpenDelay", async () => {
    const { menu, items, submenu } = buildWithSubmenu();
    menu.setOpen(true, "api");
    const e = new globalThis.Event("pointerenter", { bubbles: true });
    items[0].el.dispatchEvent(e);
    assert.equal(submenu.open(), false, "not open yet (delay)");
    await wait(20);
    assert.equal(submenu.open(), true, "opened after submenuOpenDelay");
    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("clicking inside the submenu doesn't dismiss the root menu", async () => {
    const { menu, items, submenu, subItems } = buildWithSubmenu();
    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");
    await flushMicrotasks();
    // pointerdown on a submenu item should not be "outside" of root
    dispatchPointer(subItems[1].el, "pointerdown");
    assert.equal(menu.open(), true, "root stays open");
    submenu.destroy();
    menu.destroy();
    teardownDOM();
});

test("hover-leaving parent item closes submenu after submenuCloseDelay (grace)", async () => {
    const { menu, items, submenu } = buildWithSubmenu();
    menu.setOpen(true, "api");
    submenu.setOpen(true, "api");
    const leave = new globalThis.Event("pointerleave", { bubbles: true });
    items[0].el.dispatchEvent(leave);
    assert.equal(submenu.open(), true, "still open mid-grace");
    await wait(40);
    assert.equal(submenu.open(), false, "closed after grace period");
    submenu.destroy();
    menu.destroy();
    teardownDOM();
});
