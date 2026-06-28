// dialog-drawer.test.js
//
// v0.7.2 drawer/sheet variants: the dialog primitive accepts a `placement`
// option and writes `data-placement` to both content and overlay. CSS does
// all the directional animation work; the state machine, focus trap, and
// dismiss policy are 100% identical across placements.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createDialog } from "../src/dialog/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    const overlay = document.createElement("div");
    document.body.append(trigger);
    return { trigger, content, overlay };
}

test("default placement is 'center'", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const dialog = createDialog();
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);

    assert.equal(content.getAttribute("data-placement"), "center");
    dialog.destroy();
    teardownDOM();
});

test("explicit placement writes data-placement on content", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const dialog = createDialog({ placement: "right" });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);

    assert.equal(content.getAttribute("data-placement"), "right");
    dialog.destroy();
    teardownDOM();
});

test("placement also mirrors to overlay element", () => {
    setupDOM();
    const { trigger, content, overlay } = mkDOM();
    const dialog = createDialog({ placement: "bottom" });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);
    dialog.attachOverlay(overlay);

    assert.equal(content.getAttribute("data-placement"), "bottom");
    assert.equal(overlay.getAttribute("data-placement"), "bottom");
    dialog.destroy();
    teardownDOM();
});

test("each of the four directional placements writes the matching attribute", () => {
    setupDOM();
    for (const placement of ["left", "right", "top", "bottom"]) {
        const trigger = document.createElement("button");
        const content = document.createElement("div");
        document.body.append(trigger);
        const dialog = createDialog({ placement });
        dialog.attachTrigger(trigger);
        dialog.attachContent(content);
        assert.equal(content.getAttribute("data-placement"), placement, `placement=${placement}`);
        dialog.destroy();
    }
    teardownDOM();
});

test("drawer placement preserves identical state-machine behavior", () => {
    // The whole point of the drawer-as-dialog-option model: nothing about
    // the open/close flow should differ from a center modal. Same state
    // transitions, same status signal sequence, same outside-click + Escape
    // contracts.
    setupDOM();
    const { trigger, content } = mkDOM();
    const dialog = createDialog({ placement: "right" });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);

    assert.equal(dialog.open(), false);
    assert.equal(content.hasAttribute("data-open"), false);

    dispatchClick(trigger);
    assert.equal(dialog.open(), true);
    assert.equal(content.hasAttribute("data-open"), true);
    // placement attribute is stable -- not affected by open/close transitions
    assert.equal(content.getAttribute("data-placement"), "right");

    dialog.setOpen(false);
    assert.equal(dialog.open(), false);
    assert.equal(content.hasAttribute("data-open"), false);
    // still there after close
    assert.equal(content.getAttribute("data-placement"), "right");

    dialog.destroy();
    teardownDOM();
});

test("destroy clears data-placement from content + overlay", () => {
    setupDOM();
    const { trigger, content, overlay } = mkDOM();
    const dialog = createDialog({ placement: "left" });
    dialog.attachTrigger(trigger);
    dialog.attachContent(content);
    dialog.attachOverlay(overlay);
    assert.equal(content.getAttribute("data-placement"), "left");

    dialog.destroy();
    assert.equal(content.getAttribute("data-placement"), null, "content data-placement cleared");
    assert.equal(overlay.getAttribute("data-placement"), null, "overlay data-placement cleared");
    teardownDOM();
});
