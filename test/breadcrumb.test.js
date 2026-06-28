// breadcrumb.test.js -- createBreadcrumb ARIA painting + current resolution

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createBreadcrumb } from "../src/breadcrumb/index.js";

function mkNav() {
    const el = document.createElement("nav");
    document.body.appendChild(el);
    return el;
}
function mkList() {
    const el = document.createElement("ol");
    document.body.appendChild(el);
    return el;
}
function mkItem(text) {
    const el = document.createElement("a");
    el.textContent = text;
    document.body.appendChild(el);
    return el;
}

// -----------------------------------------------------------------
// Construction + attach
// -----------------------------------------------------------------

test("createBreadcrumb default state has no items", () => {
    setupDOM();
    const bc = createBreadcrumb();
    assert.deepEqual(bc.items(), []);
    assert.equal(bc.currentKey(), null);
    bc.destroy();
    teardownDOM();
});

test("attachRoot writes role=navigation + aria-label", () => {
    setupDOM();
    const nav = mkNav();
    const bc = createBreadcrumb();
    bc.attachRoot(nav);
    assert.equal(nav.getAttribute("role"), "navigation");
    assert.equal(nav.getAttribute("aria-label"), "Breadcrumb");
    bc.destroy();
    teardownDOM();
});

test("attachRoot respects consumer aria-label", () => {
    setupDOM();
    const nav = mkNav();
    nav.setAttribute("aria-label", "Site navigation");
    const bc = createBreadcrumb();
    bc.attachRoot(nav);
    assert.equal(nav.getAttribute("aria-label"), "Site navigation");
    bc.destroy();
    teardownDOM();
});

test("attachList sets role=list", () => {
    setupDOM();
    const ol = mkList();
    const bc = createBreadcrumb();
    bc.attachList(ol);
    assert.equal(ol.getAttribute("role"), "list");
    bc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachItem + current resolution
// -----------------------------------------------------------------

test("attachItem rejects empty key", () => {
    setupDOM();
    const bc = createBreadcrumb();
    assert.throws(() => bc.attachItem(mkItem("a"), ""), /non-empty string/);
    assert.throws(() => bc.attachItem(mkItem("a"), null), /non-empty string/);
    bc.destroy();
    teardownDOM();
});

test("last attached item is marked current automatically", () => {
    setupDOM();
    const bc = createBreadcrumb();
    const a = mkItem("Home"), b = mkItem("Projects"), c = mkItem("Specifics");
    bc.attachItem(a, "home");
    bc.attachItem(b, "projects");
    bc.attachItem(c, "specifics");
    assert.equal(c.getAttribute("aria-current"), "page");
    assert.equal(c.getAttribute("data-current"), "true");
    assert.equal(a.hasAttribute("aria-current"), false);
    assert.equal(b.hasAttribute("aria-current"), false);
    bc.destroy();
    teardownDOM();
});

test("currentKey() returns key of the current item", () => {
    setupDOM();
    const bc = createBreadcrumb();
    bc.attachItem(mkItem("Home"), "home");
    bc.attachItem(mkItem("Now"), "now");
    assert.equal(bc.currentKey(), "now");
    bc.destroy();
    teardownDOM();
});

test("setCurrent(key) moves the marker", () => {
    setupDOM();
    const bc = createBreadcrumb();
    const a = mkItem("Home"), b = mkItem("Projects"), c = mkItem("Specifics");
    bc.attachItem(a, "home");
    bc.attachItem(b, "projects");
    bc.attachItem(c, "specifics");
    bc.setCurrent("projects");
    assert.equal(b.getAttribute("aria-current"), "page");
    assert.equal(c.hasAttribute("aria-current"), false);
    assert.equal(bc.currentKey(), "projects");
    bc.destroy();
    teardownDOM();
});

test("setCurrent(null) falls back to last-attached", () => {
    setupDOM();
    const bc = createBreadcrumb();
    const a = mkItem("Home"), b = mkItem("Now");
    bc.attachItem(a, "home");
    bc.attachItem(b, "now");
    bc.setCurrent("home");
    assert.equal(a.getAttribute("aria-current"), "page");
    bc.setCurrent(null);
    assert.equal(b.getAttribute("aria-current"), "page");
    bc.destroy();
    teardownDOM();
});

test("attachItem with current:true sets it immediately", () => {
    setupDOM();
    const bc = createBreadcrumb();
    const a = mkItem("Home"), b = mkItem("Now");
    bc.attachItem(a, "home", { current: true });
    bc.attachItem(b, "now");
    // 'now' is the LAST item but 'home' was explicitly marked
    assert.equal(a.getAttribute("aria-current"), "page");
    assert.equal(b.hasAttribute("aria-current"), false);
    bc.destroy();
    teardownDOM();
});

test("items() returns ordered list with current flag", () => {
    setupDOM();
    const bc = createBreadcrumb();
    bc.attachItem(mkItem("Home"), "home");
    bc.attachItem(mkItem("Projects"), "projects");
    bc.attachItem(mkItem("Specifics"), "specifics");
    const list = bc.items();
    assert.equal(list.length, 3);
    assert.equal(list[0].key, "home");
    assert.equal(list[0].current, false);
    assert.equal(list[2].key, "specifics");
    assert.equal(list[2].current, true);
    bc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Click behavior
// -----------------------------------------------------------------

test("clicking an item fires onItemClick with key + index", () => {
    setupDOM();
    const clicks = [];
    const bc = createBreadcrumb({
        onItemClick: (key, idx) => clicks.push([key, idx]),
    });
    const a = mkItem("Home"), b = mkItem("Projects");
    bc.attachItem(a, "home");
    bc.attachItem(b, "projects");
    a.click();
    b.click();
    assert.deepEqual(clicks, [["home", 0], ["projects", 1]]);
    bc.destroy();
    teardownDOM();
});

test("clicks don't preventDefault by default (native nav works)", () => {
    setupDOM();
    let defaultPrevented = false;
    const bc = createBreadcrumb();
    const a = mkItem("Home");
    bc.attachItem(a, "home");
    a.addEventListener("click", (e) => { defaultPrevented = e.defaultPrevented; });
    a.click();
    assert.equal(defaultPrevented, false);
    bc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Separator handling
// -----------------------------------------------------------------

test("attachSeparator sets aria-hidden + data-bc-sep", () => {
    setupDOM();
    const sep = document.createElement("span");
    document.body.appendChild(sep);
    const bc = createBreadcrumb();
    bc.attachSeparator(sep);
    assert.equal(sep.getAttribute("aria-hidden"), "true");
    assert.equal(sep.hasAttribute("data-bc-sep"), true);
    bc.destroy();
    teardownDOM();
});

test("attachSeparator populates empty content with configured separator", () => {
    setupDOM();
    const sep = document.createElement("span");
    document.body.appendChild(sep);
    const bc = createBreadcrumb({ separator: "›" });
    bc.attachSeparator(sep);
    assert.equal(sep.textContent, "›");
    bc.destroy();
    teardownDOM();
});

test("attachSeparator keeps existing content", () => {
    setupDOM();
    const sep = document.createElement("span");
    sep.textContent = "→";
    document.body.appendChild(sep);
    const bc = createBreadcrumb({ separator: "/" });
    bc.attachSeparator(sep);
    assert.equal(sep.textContent, "→");
    bc.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Detach + destroy
// -----------------------------------------------------------------

test("detaching the current item re-resolves current to new last", () => {
    setupDOM();
    const bc = createBreadcrumb();
    const a = mkItem("Home"), b = mkItem("Projects"), c = mkItem("Specifics");
    const offA = bc.attachItem(a, "home");
    const offB = bc.attachItem(b, "projects");
    const offC = bc.attachItem(c, "specifics");
    assert.equal(bc.currentKey(), "specifics");
    offC();
    assert.equal(bc.currentKey(), "projects");
    offB();
    assert.equal(bc.currentKey(), "home");
    bc.destroy();
    teardownDOM();
});

test("destroy() clears attributes from all items + separators", () => {
    setupDOM();
    const bc = createBreadcrumb();
    const a = mkItem("Home");
    const sep = document.createElement("span");
    document.body.appendChild(sep);
    bc.attachItem(a, "home");
    bc.attachSeparator(sep);
    bc.destroy();
    assert.equal(bc.destroyed, true);
    assert.equal(a.hasAttribute("aria-current"), false);
    assert.equal(a.hasAttribute("data-current"), false);
    assert.equal(sep.hasAttribute("aria-hidden"), false);
    assert.equal(sep.hasAttribute("data-bc-sep"), false);
    teardownDOM();
});

test("destroy() is idempotent", () => {
    setupDOM();
    const bc = createBreadcrumb();
    bc.destroy();
    bc.destroy();
    assert.equal(bc.destroyed, true);
    teardownDOM();
});
