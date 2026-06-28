// Tests: hover-card (createHoverCard; positioned by @zakkster/lite-floating).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchPointer, dispatchKey } from "./_setup.js";
import { createHoverCard } from "../src/hover-card/index.js";

function mkDOM() {
    const trigger = document.createElement("a");
    trigger.setAttribute("href", "/u/zak");
    const content = document.createElement("div");
    content.innerHTML = `<strong>Zak</strong>`;
    document.body.append(trigger);
    return { trigger, content };
}
function fire(el, type) { el.dispatchEvent(new globalThis.Event(type, { bubbles: false })); }

test("attachTrigger paints marker + aria-expanded=false; not open", () => {
    setupDOM();
    const { trigger } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    assert.equal(trigger.hasAttribute("data-hover-card-trigger"), true);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.hasAttribute("data-open"), false);
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("attachContent: no role, aria-hidden, data-status=closed, tabindex", () => {
    setupDOM();
    const { content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachContent(content);
    assert.equal(content.hasAttribute("data-hover-card-content"), true);
    assert.equal(content.hasAttribute("role"), false);
    assert.equal(content.getAttribute("aria-hidden"), "true");
    assert.equal(content.getAttribute("data-status"), "closed");
    assert.equal(content.getAttribute("tabindex"), "-1");
    hc.destroy(); teardownDOM();
});

test("hover opens; paints data-open/placement; lite-floating handle is live", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0, placement: "bottom-start" });
    hc.attachTrigger(trigger);
    hc.attachContent(content);

    dispatchPointer(trigger, "pointerenter");
    assert.equal(hc.open(), true);
    assert.equal(content.hasAttribute("data-open"), true);
    assert.equal(content.hasAttribute("aria-hidden"), false);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    // placement painted from the floating engine
    assert.equal(content.getAttribute("data-placement"), "bottom-start");
    assert.equal(content.getAttribute("data-side"), "bottom");
    assert.equal(content.getAttribute("data-align"), "start");
    // the lite-floating instance exists while open
    assert.ok(hc._floating());
    hc.destroy(); teardownDOM();
});

test("pointer stays alive across trigger->content; closes only after both leave", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);

    dispatchPointer(trigger, "pointerenter");
    assert.equal(hc.open(), true);
    dispatchPointer(content, "pointerenter");
    dispatchPointer(trigger, "pointerleave");   // still over content
    assert.equal(hc.open(), true);
    dispatchPointer(content, "pointerleave");    // now over neither
    assert.equal(hc.open(), false);
    // floating disposed on close
    assert.equal(hc._floating(), null);
    hc.destroy(); teardownDOM();
});

test("focus opens instantly; blur closes", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 999, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);

    fire(trigger, "focus");
    assert.equal(hc.open(), true);   // focus bypasses openDelay
    fire(trigger, "blur");
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("Escape closes when open", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    dispatchPointer(trigger, "pointerenter");
    assert.equal(hc.open(), true);
    dispatchKey(document.body, "Escape");
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("setOpen(true) opens programmatically + paints content", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    hc.setOpen(true);
    assert.equal(hc.open(), true);
    assert.equal(content.hasAttribute("data-open"), true);
    assert.equal(content.getAttribute("data-placement"), "bottom");
    hc.setOpen(false);
    assert.equal(hc.open(), false);
    hc.destroy(); teardownDOM();
});

test("attachRoot paints data-hover-card-root + mirrors data-open", () => {
    setupDOM();
    const root = document.createElement("div");
    const { trigger, content } = mkDOM();
    root.append(trigger);
    document.body.append(root);
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachRoot(root);
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    assert.equal(root.hasAttribute("data-hover-card-root"), true);
    assert.equal(root.hasAttribute("data-open"), false);
    hc.setOpen(true);
    assert.equal(root.hasAttribute("data-open"), true);
    hc.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const hc = createHoverCard({ openDelay: 0, closeDelay: 0 });
    hc.attachTrigger(trigger);
    hc.attachContent(content);
    hc.setOpen(true);
    hc.destroy(); hc.destroy();
    assert.equal(hc.destroyed, true);
    assert.equal(trigger.hasAttribute("data-hover-card-trigger"), false);
    assert.equal(content.hasAttribute("data-hover-card-content"), false);
    teardownDOM();
});
