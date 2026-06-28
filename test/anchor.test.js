// Tests: anchor.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createAnchor } from "../src/anchor/index.js";

function setup() {
    setupDOM();
    const root = document.createElement("nav");
    document.body.appendChild(root);

    const sections = [];
    const links = [];
    for (const k of ["intro", "install", "api"]) {
        const s = document.createElement("section");
        s.id = k;
        document.body.appendChild(s);
        sections.push(s);

        const l = document.createElement("a");
        l.setAttribute("href", "#" + k);
        l.textContent = k;
        root.appendChild(l);
        links.push(l);
    }
    return { root, sections, links };
}

test("attachRoot paints data-anchor-root", () => {
    const { root } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    assert.equal(root.hasAttribute("data-anchor-root"), true);
    a.destroy(); teardownDOM();
});

test("attachLink paints data-anchor-link + data-anchor-section + key", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    assert.equal(links[0].hasAttribute("data-anchor-link"), true);
    assert.equal(sections[0].hasAttribute("data-anchor-section"), true);
    assert.equal(sections[0].getAttribute("data-anchor-section-key"), "intro");
    a.destroy(); teardownDOM();
});

test("activeKey starts null", () => {
    const { root } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    assert.equal(a.activeKey(), null);
    a.destroy(); teardownDOM();
});

test("_setActiveForTest paints data-active + aria-current=location on link", () => {
    const { root, sections, links } = setup();
    const events = [];
    const a = createAnchor({ onChange: (k) => events.push(k) });
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    a.attachLink(links[1], sections[1], "install");
    a._setActiveForTest("install");
    assert.equal(a.activeKey(), "install");
    assert.equal(links[1].hasAttribute("data-active"), true);
    assert.equal(links[1].getAttribute("aria-current"), "location");
    assert.equal(links[0].hasAttribute("data-active"), false);
    assert.equal(links[0].hasAttribute("aria-current"), false);
    assert.deepEqual(events, ["install"]);
    a.destroy(); teardownDOM();
});

test("setting active to a different key clears the previous active link", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    a.attachLink(links[1], sections[1], "install");
    a._setActiveForTest("intro");
    a._setActiveForTest("install");
    assert.equal(links[0].hasAttribute("data-active"), false);
    assert.equal(links[1].hasAttribute("data-active"), true);
    a.destroy(); teardownDOM();
});

test("setActive to an unknown key is rejected", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    a._setActiveForTest("nonexistent");
    assert.equal(a.activeKey(), null);
    a.destroy(); teardownDOM();
});

test("linkCount tracks attached link count", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    assert.equal(a.linkCount, 0);
    const off1 = a.attachLink(links[0], sections[0], "intro");
    a.attachLink(links[1], sections[1], "install");
    a.attachLink(links[2], sections[2], "api");
    assert.equal(a.linkCount, 3);
    off1();
    assert.equal(a.linkCount, 2);
    a.destroy(); teardownDOM();
});

test("re-attaching the same key replaces the prior entry (no leak)", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    a.attachLink(links[1], sections[1], "intro");   // same key, different elements
    assert.equal(a.linkCount, 1);
    // links[0] should have been cleared
    assert.equal(links[0].hasAttribute("data-anchor-link"), false);
    assert.equal(links[1].hasAttribute("data-anchor-link"), true);
    a.destroy(); teardownDOM();
});

test("click on a link fires onChange + sets active optimistically", () => {
    const { root, sections, links } = setup();
    const events = [];
    const a = createAnchor({ onChange: (k) => events.push(k) });
    a.attachRoot(root);
    a.attachLink(links[1], sections[1], "install");
    links[1].click();
    assert.equal(a.activeKey(), "install");
    assert.deepEqual(events, ["install"]);
    a.destroy(); teardownDOM();
});

test("click with modifier keys is ignored (let the browser handle it)", () => {
    const { root, sections, links } = setup();
    let count = 0;
    const a = createAnchor({ onChange: () => count++ });
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    // Cmd-click (open in new tab) -- should NOT activate
    const ev = new window.MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    links[0].dispatchEvent(ev);
    assert.equal(count, 0);
    a.destroy(); teardownDOM();
});

test("off() returned by attachLink clears all attrs + unhooks observer", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    const off = a.attachLink(links[0], sections[0], "intro");
    a._setActiveForTest("intro");
    off();
    assert.equal(links[0].hasAttribute("data-anchor-link"), false);
    assert.equal(links[0].hasAttribute("data-active"), false);
    assert.equal(links[0].hasAttribute("aria-current"), false);
    assert.equal(sections[0].hasAttribute("data-anchor-section"), false);
    a.destroy(); teardownDOM();
});

test("destroy clears everything + is idempotent", () => {
    const { root, sections, links } = setup();
    const a = createAnchor({});
    a.attachRoot(root);
    a.attachLink(links[0], sections[0], "intro");
    a.attachLink(links[1], sections[1], "install");
    a._setActiveForTest("install");
    a.destroy(); a.destroy();
    assert.equal(a.destroyed, true);
    assert.equal(root.hasAttribute("data-anchor-root"), false);
    assert.equal(links[0].hasAttribute("data-anchor-link"), false);
    assert.equal(links[1].hasAttribute("data-active"), false);
    teardownDOM();
});
