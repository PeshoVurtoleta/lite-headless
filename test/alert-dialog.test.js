// Tests: alert-dialog (createDialog wrapper with alertdialog contract).

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick, dispatchPointer } from "./_setup.js";
import { createAlertDialog } from "../src/alert-dialog/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    content.innerHTML = `<h2>Confirm</h2><p>Body</p><button id="cancel">Cancel</button>`;
    const title = content.querySelector("h2");
    const desc = content.querySelector("p");
    document.body.append(trigger);
    return { trigger, content, title, desc };
}

test("attachContent writes role=alertdialog + aria-modal", () => {
    setupDOM();
    const { content } = mkDOM();
    const d = createAlertDialog({ defaultOpen: true, container: null });
    d.attachContent(content);
    assert.equal(content.getAttribute("role"), "alertdialog");
    assert.equal(content.getAttribute("aria-modal"), "true");
    assert.equal(content.hasAttribute("data-open"), true);
    d.destroy(); teardownDOM();
});

test("trigger opens; setOpen controls state", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const d = createAlertDialog({ defaultOpen: false, container: null });
    d.attachTrigger(trigger);
    d.attachContent(content);
    assert.equal(d.open(), false);
    dispatchClick(trigger);
    assert.equal(d.open(), true);
    d.setOpen(false);
    assert.equal(d.open(), false);
    d.destroy(); teardownDOM();
});

test("attachTitle/Description wire aria-labelledby/-describedby", () => {
    setupDOM();
    const { content, title, desc } = mkDOM();
    const d = createAlertDialog({ defaultOpen: true, container: null });
    d.attachContent(content);
    d.attachTitle(title);
    d.attachDescription(desc);
    assert.equal(content.getAttribute("aria-labelledby"), title.id);
    assert.equal(content.getAttribute("aria-describedby"), desc.id);
    d.destroy(); teardownDOM();
});

test("backdrop click does NOT dismiss by default", () => {
    setupDOM();
    const { content } = mkDOM();
    const overlay = document.createElement("div");
    const d = createAlertDialog({ defaultOpen: true, container: null });
    d.attachContent(content);
    d.attachOverlay(overlay);
    // a pointerdown/click on the overlay (outside content) must not close
    dispatchPointer(overlay, "pointerdown");
    dispatchClick(overlay);
    assert.equal(d.open(), true);
    d.destroy(); teardownDOM();
});

test("dismissable opt-in: closeOnOutsideClick:true allows backdrop close", () => {
    setupDOM();
    const { content } = mkDOM();
    const d = createAlertDialog({ defaultOpen: true, container: null, closeOnOutsideClick: true });
    d.attachContent(content);
    // outside pointerdown then click on body
    dispatchPointer(document.body, "pointerdown");
    dispatchClick(document.body);
    assert.equal(d.open(), false);
    d.destroy(); teardownDOM();
});

test("is always modal even if modal:false passed", () => {
    setupDOM();
    const { content } = mkDOM();
    const d = createAlertDialog({ defaultOpen: true, container: null, modal: false });
    d.attachContent(content);
    assert.equal(content.getAttribute("aria-modal"), "true");
    d.destroy(); teardownDOM();
});

test("destroy is idempotent", () => {
    setupDOM();
    const { content } = mkDOM();
    const d = createAlertDialog({ defaultOpen: true, container: null });
    d.attachContent(content);
    d.destroy(); d.destroy();
    teardownDOM();
});
