// popover.test.js -- end-to-end createPopover wiring

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks, dispatchKey, dispatchClick, dispatchPointer } from "./_setup.js";
import { createPopover } from "../src/popover/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    content.innerHTML = `<button id="b1">first</button><button id="b2">second</button>`;
    document.body.append(trigger, content);
    return { trigger, content };
}

test("clicking trigger opens the popover", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const pop = createPopover({ defaultOpen: false, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    assert.equal(pop.open(), false);
    dispatchClick(trigger);
    assert.equal(pop.open(), true);
    pop.destroy();
    teardownDOM();
});

test("trigger gets aria-haspopup + aria-expanded + aria-controls", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const pop = createPopover({ defaultOpen: false, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    assert.ok(trigger.getAttribute("aria-haspopup"));
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.getAttribute("aria-controls"), content.id);
    dispatchClick(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    pop.destroy();
    teardownDOM();
});

test("content gets data-open/data-status on open", async () => {
    setupDOM();
    const { content } = mkDOM();
    const pop = createPopover({ defaultOpen: false, container: null });
    pop.attachContent(content);
    assert.equal(content.hasAttribute("data-open"), false);
    pop.setOpen(true, "trigger");
    assert.equal(content.hasAttribute("data-open"), true);
    assert.equal(content.getAttribute("data-status"), "opening");
    await flushMicrotasks();
    assert.equal(content.getAttribute("data-status"), "open");
    pop.destroy();
    teardownDOM();
});

test("non-modal: no aria-modal, no role=dialog", async () => {
    setupDOM();
    const { content } = mkDOM();
    const pop = createPopover({ defaultOpen: true, modal: false, container: null });
    pop.attachContent(content);
    await flushMicrotasks();
    assert.equal(content.hasAttribute("aria-modal"), false);
    assert.notEqual(content.getAttribute("role"), "dialog");
    pop.destroy();
    teardownDOM();
});

test("modal: role=dialog + aria-modal=true", () => {
    setupDOM();
    const { content } = mkDOM();
    const pop = createPopover({ defaultOpen: true, modal: true, container: null });
    pop.attachContent(content);
    assert.equal(content.getAttribute("role"), "dialog");
    assert.equal(content.getAttribute("aria-modal"), "true");
    pop.destroy();
    teardownDOM();
});

test("non-modal: initial focus moves into content but Tab is NOT trapped", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    trigger.focus();

    const pop = createPopover({ defaultOpen: false, modal: false, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    pop.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(document.activeElement, content.querySelector("#b1"), "initial focus moved");

    // Tab from last button should NOT wrap (no trap)
    content.querySelector("#b2").focus();
    const e = dispatchKey(document, "Tab");
    assert.equal(e.defaultPrevented, false, "Tab not intercepted in non-modal mode");
    pop.destroy();
    teardownDOM();
});

test("modal: Tab cycles inside content (trap engaged)", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    trigger.focus();

    const pop = createPopover({ defaultOpen: false, modal: true, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    pop.setOpen(true, "trigger");
    await flushMicrotasks();
    content.querySelector("#b2").focus();
    const e = dispatchKey(document, "Tab");
    assert.equal(e.defaultPrevented, true);
    assert.equal(document.activeElement, content.querySelector("#b1"));
    pop.destroy();
    teardownDOM();
});

test("Escape closes (with reason='escape')", () => {
    setupDOM();
    const { content } = mkDOM();
    let r = null;
    const pop = createPopover({
        defaultOpen: true,
        container: null,
        onOpenChange: (_, reason) => { r = reason; },
    });
    pop.attachContent(content);
    dispatchKey(document, "Escape");
    assert.equal(pop.open(), false);
    assert.equal(r, "escape");
    pop.destroy();
    teardownDOM();
});

test("outside click closes; clicks on trigger or content stay open", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const outside = document.createElement("div");
    document.body.appendChild(outside);

    const pop = createPopover({ defaultOpen: true, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);

    // click inside content: stays open
    dispatchPointer(content.querySelector("#b1"), "pointerdown");
    assert.equal(pop.open(), true);

    // click outside: closes
    dispatchPointer(outside, "pointerdown");
    assert.equal(pop.open(), false);
    pop.destroy();
    teardownDOM();
});

test("attachAnchor: positioner uses anchor (not trigger) for placement origin", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const anchor = document.createElement("span");
    document.body.appendChild(anchor);

    // mock rects via overriding getBoundingClientRect
    const triggerRect = { left: 500, top: 500, width: 50, height: 30, right: 550, bottom: 530, x: 500, y: 500 };
    const anchorRect  = { left: 100, top: 100, width: 50, height: 30, right: 150, bottom: 130, x: 100, y: 100 };
    const contentRect = { left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0 };
    trigger.getBoundingClientRect = () => triggerRect;
    anchor.getBoundingClientRect  = () => anchorRect;
    content.getBoundingClientRect = () => contentRect;

    const pop = createPopover({ defaultOpen: false, placement: "bottom", offset: 0, container: null });
    pop.attachTrigger(trigger);
    pop.attachAnchor(anchor);
    pop.attachContent(content);
    pop.setOpen(true, "trigger");
    await flushMicrotasks();

    // bottom of anchor at y=130; content top = 130; centered: x = 100 + 25 - 50 = 75
    const t = content.style.transform;
    assert.ok(t.includes("75px") && t.includes("130px"), `transform should be near anchor, got: ${t}`);
    pop.destroy();
    teardownDOM();
});

test("portal: content moves to body when opened with default container", async () => {
    setupDOM();
    const wrap = document.createElement("section");
    const { trigger, content } = mkDOM();
    wrap.appendChild(content);
    document.body.appendChild(wrap);

    const pop = createPopover({ defaultOpen: false }); // container defaults to body
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    pop.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(content.parentNode, document.body);

    pop.setOpen(false, "api");
    await flushMicrotasks();
    await flushMicrotasks();
    assert.equal(content.parentNode, wrap, "restored on close");
    pop.destroy();
    teardownDOM();
});

test("attachClose: any close button dismisses with reason='close'", () => {
    setupDOM();
    const { content } = mkDOM();
    const closeBtn = document.createElement("button");
    content.appendChild(closeBtn);

    let r = null;
    const pop = createPopover({
        defaultOpen: true,
        container: null,
        onOpenChange: (_, reason) => { r = reason; },
    });
    pop.attachContent(content);
    pop.attachClose(closeBtn);

    dispatchClick(closeBtn);
    assert.equal(pop.open(), false);
    assert.equal(r, "close");
    pop.destroy();
    teardownDOM();
});

test("attachArrow: data-side and inline left written on open", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const arrow = document.createElement("span");
    content.appendChild(arrow);

    trigger.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 30, right: 150, bottom: 130, x: 100, y: 100 });
    content.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 50, right: 100, bottom: 50, x: 0, y: 0 });

    const pop = createPopover({ defaultOpen: false, placement: "bottom", container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    pop.attachArrow(arrow);
    pop.setOpen(true, "trigger");
    assert.equal(arrow.getAttribute("data-side"), "bottom");
    assert.ok(arrow.style.left, "arrow.style.left should be set");
    pop.destroy();
    teardownDOM();
});

test("destroy: stops positioner and unwires attached elements", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const pop = createPopover({ defaultOpen: false, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);
    pop.setOpen(true, "trigger");
    pop.destroy();
    assert.equal(pop.destroyed, true);
    dispatchClick(trigger);
    assert.equal(pop.open(), true, "open state frozen at destroy; setOpen is no-op");
    // aria attrs cleaned
    assert.equal(trigger.hasAttribute("aria-haspopup"), false);
    teardownDOM();
});

test("status signal: closed -> opening -> open -> closing -> closed", async () => {
    setupDOM();
    const { content } = mkDOM();
    const pop = createPopover({ defaultOpen: false, container: null });
    pop.attachContent(content);

    const seen = [];
    pop.status.subscribe((s) => seen.push(s));

    pop.setOpen(true, "trigger");
    await flushMicrotasks();
    pop.setOpen(false, "api");
    await flushMicrotasks();
    assert.deepEqual(seen, ["closed", "opening", "open", "closing", "closed"]);
    pop.destroy();
    teardownDOM();
});

test("aria-controls coexists with consumer's pre-existing tokens", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const sidebar = document.createElement("div");
    sidebar.id = "consumer-sidebar";
    document.body.appendChild(sidebar);
    trigger.setAttribute("aria-controls", "consumer-sidebar");

    const pop = createPopover({ defaultOpen: false, container: null });
    pop.attachTrigger(trigger);
    pop.attachContent(content);

    const tokens = trigger.getAttribute("aria-controls").split(/\s+/);
    assert.ok(tokens.includes("consumer-sidebar"));
    assert.ok(tokens.includes(content.id));
    assert.equal(tokens.length, 2);

    pop.destroy();
    assert.equal(trigger.getAttribute("aria-controls"), "consumer-sidebar");
    teardownDOM();
});
