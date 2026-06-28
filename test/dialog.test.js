// dialog.test.js -- end-to-end createDialog wiring

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks, dispatchKey, dispatchClick, dispatchPointer } from "./_setup.js";
import { createDialog } from "../src/dialog/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    const content = document.createElement("div");
    content.innerHTML = `<h2>Title</h2><button>Inner</button><button id="close">Close</button>`;
    const overlay = document.createElement("div");
    const title = content.querySelector("h2");
    const closeBtn = content.querySelector("#close");
    document.body.append(trigger);
    return { trigger, content, overlay, title, closeBtn };
}

test("clicking trigger opens the dialog", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const dialog = createDialog({ defaultOpen: false });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);

    assert.equal(dialog.open(), false);
    dispatchClick(trigger);
    assert.equal(dialog.open(), true);
    dialog.destroy();
    teardownDOM();
});

test("attachTrigger writes aria-haspopup and aria-expanded", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const dialog = createDialog({ defaultOpen: false });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);

    assert.equal(trigger.getAttribute("aria-haspopup"), "dialog");
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(trigger.getAttribute("aria-controls"), content.id);

    dispatchClick(trigger);
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    dialog.destroy();
    teardownDOM();
});

test("attachContent writes role, aria-modal, tabindex, data-open", () => {
    setupDOM();
    const { content } = mkDOM();
    const dialog = createDialog({ defaultOpen: true, modal: true, container: null });
    dialog.attachContent(content);

    assert.equal(content.getAttribute("role"), "dialog");
    assert.equal(content.getAttribute("aria-modal"), "true");
    assert.equal(content.getAttribute("tabindex"), "-1");
    assert.equal(content.hasAttribute("data-open"), true);
    dialog.destroy();
    teardownDOM();
});

test("non-modal: aria-modal NOT set", () => {
    setupDOM();
    const { content } = mkDOM();
    const dialog = createDialog({ defaultOpen: true, modal: false, container: null });
    dialog.attachContent(content);
    assert.equal(content.hasAttribute("aria-modal"), false);
    dialog.destroy();
    teardownDOM();
});

test("attachTitle wires aria-labelledby", () => {
    setupDOM();
    const { content, title } = mkDOM();
    const dialog = createDialog({ defaultOpen: true, container: null });
    dialog.attachContent(content);
    dialog.attachTitle(title);

    const titleId = title.getAttribute("id");
    assert.ok(titleId, "title got an auto-id");
    assert.equal(content.getAttribute("aria-labelledby"), titleId);
    dialog.destroy();
    teardownDOM();
});

test("attachDescription wires aria-describedby", () => {
    setupDOM();
    const { content } = mkDOM();
    const desc = document.createElement("p");
    desc.textContent = "details";
    content.appendChild(desc);

    const dialog = createDialog({ defaultOpen: true, container: null });
    dialog.attachContent(content);
    dialog.attachDescription(desc);

    const descId = desc.getAttribute("id");
    assert.ok(descId);
    assert.equal(content.getAttribute("aria-describedby"), descId);
    dialog.destroy();
    teardownDOM();
});

test("attachClose button dismisses with reason='close'", () => {
    setupDOM();
    const { trigger, content, closeBtn } = mkDOM();
    let reason = null;
    const dialog = createDialog({
        defaultOpen: true,
        container: null,
        onOpenChange: (_, r) => { reason = r; },
    });
    dialog.attachContent(content);
    dialog.attachClose(closeBtn);

    dispatchClick(closeBtn);
    assert.equal(dialog.open(), false);
    assert.equal(reason, "close");
    dialog.destroy();
    teardownDOM();
});

test("Escape closes (closeOnEscape: true default)", () => {
    setupDOM();
    const { content } = mkDOM();
    const dialog = createDialog({ defaultOpen: true, container: null });
    dialog.attachContent(content);
    dispatchKey(document, "Escape");
    assert.equal(dialog.open(), false);
    dialog.destroy();
    teardownDOM();
});

test("Escape does NOT close when closeOnEscape:false", () => {
    setupDOM();
    const { content } = mkDOM();
    const dialog = createDialog({ defaultOpen: true, container: null, closeOnEscape: false });
    dialog.attachContent(content);
    dispatchKey(document, "Escape");
    assert.equal(dialog.open(), true);
    dialog.destroy();
    teardownDOM();
});

test("clicking the overlay backdrop closes with reason='outside'", () => {
    setupDOM();
    const { content, overlay } = mkDOM();
    document.body.appendChild(overlay);
    let reason = null;
    const dialog = createDialog({
        defaultOpen: true,
        container: null,
        onOpenChange: (_, r) => { reason = r; },
    });
    dialog.attachContent(content);
    dialog.attachOverlay(overlay);

    dispatchPointer(overlay, "pointerdown");
    assert.equal(dialog.open(), false);
    assert.equal(reason, "outside");
    dialog.destroy();
    teardownDOM();
});

test("portal: content moves to document.body by default when opened", async () => {
    setupDOM();
    const wrapper = document.createElement("section");
    const { content } = mkDOM();
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    const dialog = createDialog({ defaultOpen: false }); // container defaults to body
    dialog.attachContent(content);
    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(content.parentNode, document.body);
    dialog.destroy();
    teardownDOM();
});

test("portal: content restores to original parent after close completes", async () => {
    setupDOM();
    const wrapper = document.createElement("section");
    const { content } = mkDOM();
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    const dialog = createDialog({ defaultOpen: false });
    dialog.attachContent(content);
    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    dialog.setOpen(false, "api");
    await flushMicrotasks();
    await flushMicrotasks();
    assert.equal(content.parentNode, wrapper, "back to original parent");
    dialog.destroy();
    teardownDOM();
});

test("container:null skips portal entirely", async () => {
    setupDOM();
    const wrapper = document.createElement("section");
    const { content } = mkDOM();
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    const dialog = createDialog({ defaultOpen: false, container: null });
    dialog.attachContent(content);
    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(content.parentNode, wrapper, "never moved");
    dialog.destroy();
    teardownDOM();
});

test("modal:true locks scroll on open, unlocks on close", async () => {
    setupDOM();
    const { content } = mkDOM();
    document.body.style.overflow = "auto";

    const dialog = createDialog({ defaultOpen: false, modal: true, container: null });
    dialog.attachContent(content);
    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(document.body.style.overflow, "hidden");

    dialog.setOpen(false, "api");
    await flushMicrotasks();
    assert.equal(document.body.style.overflow, "auto");
    dialog.destroy();
    teardownDOM();
});

test("modal:false does NOT lock scroll", async () => {
    setupDOM();
    const { content } = mkDOM();
    document.body.style.overflow = "scroll";

    const dialog = createDialog({ defaultOpen: false, modal: false, container: null });
    dialog.attachContent(content);
    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(document.body.style.overflow, "scroll", "not locked");
    dialog.destroy();
    teardownDOM();
});

test("modal:true traps focus inside content", async () => {
    setupDOM();
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();

    const content = document.createElement("div");
    content.innerHTML = `<button id="inner">inner</button>`;
    document.body.appendChild(content);

    const dialog = createDialog({ defaultOpen: false, modal: true, container: null });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);
    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    assert.equal(document.activeElement, content.querySelector("#inner"));

    dialog.setOpen(false, "api");
    await flushMicrotasks();
    assert.equal(document.activeElement, trigger, "focus returned to trigger");
    dialog.destroy();
    teardownDOM();
});

test("status signal emits closed -> opening -> open -> closing -> closed", async () => {
    setupDOM();
    const { content } = mkDOM();
    const dialog = createDialog({ defaultOpen: false, container: null });
    dialog.attachContent(content);

    const seen = [];
    dialog.status.subscribe((s) => seen.push(s));

    dialog.setOpen(true, "trigger");
    await flushMicrotasks();
    dialog.setOpen(false, "api");
    await flushMicrotasks();

    assert.deepEqual(seen, ["closed", "opening", "open", "closing", "closed"]);
    dialog.destroy();
    teardownDOM();
});

test("content gets data-status synced for CSS animations", async () => {
    setupDOM();
    const { content } = mkDOM();
    const dialog = createDialog({ defaultOpen: false, container: null });
    dialog.attachContent(content);
    assert.equal(content.getAttribute("data-status"), "closed");

    dialog.setOpen(true, "trigger");
    assert.equal(content.getAttribute("data-status"), "opening");
    await flushMicrotasks();
    assert.equal(content.getAttribute("data-status"), "open");

    dialog.setOpen(false, "api");
    assert.equal(content.getAttribute("data-status"), "closing");
    await flushMicrotasks();
    assert.equal(content.getAttribute("data-status"), "closed");
    dialog.destroy();
    teardownDOM();
});

test("destroy() unwires attached elements", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const dialog = createDialog({ defaultOpen: false });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);
    dialog.destroy();

    dispatchClick(trigger);
    // engine destroyed -- setOpen is a no-op; trigger's aria attrs cleared
    assert.equal(trigger.hasAttribute("aria-haspopup"), false);
});

test("attachClose returns an off() that unwires the listener", () => {
    setupDOM();
    const { content, closeBtn } = mkDOM();
    const dialog = createDialog({ defaultOpen: true, container: null });
    dialog.attachContent(content);
    const off = dialog.attachClose(closeBtn);
    off();
    dispatchClick(closeBtn);
    assert.equal(dialog.open(), true, "manual off() removed the listener");
    dialog.destroy();
    teardownDOM();
});

test("attachInside: pointerdown on external control doesn't dismiss the dialog", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    const externalToolbar = document.createElement("button");  // sits outside content tree
    document.body.append(trigger, content, externalToolbar);

    const d = createDialog({ modal: true, closeOnOutsideClick: true });
    d.attachTrigger(trigger);
    d.attachContent(content);
    d.attachInside(externalToolbar);
    d.setOpen(true, "api");
    assert.equal(d.open(), true);

    // pointerdown on the external toolbar would normally fire outside-click and close
    dispatchPointer(externalToolbar, "pointerdown");
    assert.equal(d.open(), true, "external control treated as inside; dialog stays open");

    // detach: now pointerdown closes again
    const offAgain = d.attachInside(externalToolbar);
    offAgain();  // remove ONE instance
    // re-attach was a no-op since we removed it; verify by closing via outside
    dispatchPointer(externalToolbar, "pointerdown");
    assert.equal(d.open(), true, "still inside via the original attach");

    d.destroy();
    teardownDOM();
});

test("attachInside off() removes the element from the inside list", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    const ext = document.createElement("button");
    document.body.append(trigger, content, ext);

    const d = createDialog({ modal: true, closeOnOutsideClick: true });
    d.attachContent(content);
    const off = d.attachInside(ext);
    d.setOpen(true, "api");

    dispatchPointer(ext, "pointerdown");
    assert.equal(d.open(), true);

    off();  // detach
    dispatchPointer(ext, "pointerdown");
    assert.equal(d.open(), false, "after detach, ext is outside again");

    d.destroy();
    teardownDOM();
});
