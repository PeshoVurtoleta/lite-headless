// drawer.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createDrawer } from "../src/drawer/index.js";

function mkEl(tag) {
    const el = document.createElement(tag || "div");
    document.body.appendChild(el);
    return el;
}

// =====================================================================
// Defaults
// =====================================================================

test("defaults to closed + side=right + status=closed", () => {
    setupDOM();
    const d = createDrawer();
    assert.equal(d.open(), false);
    assert.equal(d.side(), "right");
    assert.equal(d.status(), "closed");
    d.destroy();
    teardownDOM();
});

test("defaultOpen=true starts open", () => {
    setupDOM();
    const d = createDrawer({ defaultOpen: true });
    assert.equal(d.open(), true);
    d.destroy();
    teardownDOM();
});

test("defaultSide is honored; invalid value clamps to 'right'", () => {
    setupDOM();
    const d1 = createDrawer({ defaultSide: "left" });
    assert.equal(d1.side(), "left");
    d1.destroy();
    const d2 = createDrawer({ defaultSide: "diagonal" });
    assert.equal(d2.side(), "right");
    d2.destroy();
    teardownDOM();
});

// =====================================================================
// open/close
// =====================================================================

test("show / hide toggle open + fire onOpenChange", () => {
    setupDOM();
    let arg = null;
    const d = createDrawer({
        onOpenChange: (next, reason) => { arg = { next, reason }; },
    });
    d.show();
    assert.equal(d.open(), true);
    assert.equal(arg.next, true);
    assert.equal(arg.reason, "api");
    d.hide();
    assert.equal(d.open(), false);
    d.destroy();
    teardownDOM();
});

test("setSide changes side reactively (and idempotent on same)", () => {
    setupDOM();
    const d = createDrawer();
    d.setSide("left");
    assert.equal(d.side(), "left");
    d.setSide("left");   // no-op
    assert.equal(d.side(), "left");
    d.setSide("bogus");   // clamps to "right"
    assert.equal(d.side(), "right");
    d.destroy();
    teardownDOM();
});

// =====================================================================
// attachContent
// =====================================================================

test("attachContent sets role=dialog (modal) + aria-modal + data-side", () => {
    setupDOM();
    const d = createDrawer({ defaultSide: "left", modal: true });
    const content = mkEl();
    d.attachContent(content);
    assert.equal(content.getAttribute("role"), "dialog");
    assert.equal(content.getAttribute("aria-modal"), "true");
    assert.equal(content.getAttribute("data-side"), "left");
    assert.equal(content.getAttribute("data-status"), "closed");
    d.destroy();
    teardownDOM();
});

test("attachContent with modal=false uses role=region (no aria-modal)", () => {
    setupDOM();
    const d = createDrawer({ modal: false });
    const content = mkEl();
    d.attachContent(content);
    assert.equal(content.getAttribute("role"), "region");
    assert.equal(content.hasAttribute("aria-modal"), false);
    d.destroy();
    teardownDOM();
});

test("attachContent reacts to setSide + open state changes", () => {
    setupDOM();
    const d = createDrawer({ defaultSide: "right" });
    const content = mkEl();
    d.attachContent(content);
    d.setSide("bottom");
    assert.equal(content.getAttribute("data-side"), "bottom");
    d.show();
    assert.equal(content.hasAttribute("data-open"), true);
    d.destroy();
    teardownDOM();
});

// =====================================================================
// attachTrigger
// =====================================================================

test("attachTrigger sets aria-haspopup=dialog + aria-expanded mirror", () => {
    setupDOM();
    const d = createDrawer();
    const trig = mkEl("button");
    d.attachTrigger(trig);
    assert.equal(trig.getAttribute("type"), "button");
    assert.equal(trig.getAttribute("aria-haspopup"), "dialog");
    assert.equal(trig.getAttribute("aria-expanded"), "false");
    d.destroy();
    teardownDOM();
});

test("attachTrigger click toggles open + updates aria-expanded", () => {
    setupDOM();
    const d = createDrawer();
    const trig = mkEl("button");
    const content = mkEl();
    d.attachContent(content);
    d.attachTrigger(trig);
    trig.click();
    assert.equal(d.open(), true);
    assert.equal(trig.getAttribute("aria-expanded"), "true");
    trig.click();
    assert.equal(d.open(), false);
    assert.equal(trig.getAttribute("aria-expanded"), "false");
    d.destroy();
    teardownDOM();
});

test("attachTrigger wires aria-controls to content.id", () => {
    setupDOM();
    const d = createDrawer();
    const content = mkEl();
    const trig = mkEl("button");
    d.attachContent(content);
    d.attachTrigger(trig);
    const controls = trig.getAttribute("aria-controls") || "";
    assert.ok(controls.includes(content.id));
    d.destroy();
    teardownDOM();
});

// =====================================================================
// attachCloseButton
// =====================================================================

test("attachCloseButton click closes the drawer + sets aria-label", () => {
    setupDOM();
    const d = createDrawer({ defaultOpen: true });
    const content = mkEl();
    const closeBtn = mkEl("button");
    d.attachContent(content);
    d.attachCloseButton(closeBtn);
    assert.equal(closeBtn.getAttribute("aria-label"), "Close");
    closeBtn.click();
    assert.equal(d.open(), false);
    d.destroy();
    teardownDOM();
});

// =====================================================================
// Backdrop
// =====================================================================

test("attachBackdrop sets data-drawer-backdrop + reactive data-open", () => {
    setupDOM();
    const d = createDrawer();
    const bd = mkEl();
    d.attachBackdrop(bd);
    assert.equal(bd.getAttribute("data-drawer-backdrop"), "");
    assert.equal(bd.hasAttribute("data-open"), false);
    d.show();
    assert.equal(bd.hasAttribute("data-open"), true);
    d.destroy();
    teardownDOM();
});

test("backdrop click closes the drawer when closeOnOutsideClick=true", () => {
    setupDOM();
    const d = createDrawer({ defaultOpen: true });
    const content = mkEl();
    const bd = mkEl();
    d.attachContent(content);
    d.attachBackdrop(bd);
    bd.click();
    assert.equal(d.open(), false);
    d.destroy();
    teardownDOM();
});

test("backdrop click does NOT close when closeOnOutsideClick=false", () => {
    setupDOM();
    const d = createDrawer({ defaultOpen: true, closeOnOutsideClick: false });
    const content = mkEl();
    const bd = mkEl();
    d.attachContent(content);
    d.attachBackdrop(bd);
    bd.click();
    assert.equal(d.open(), true);
    d.destroy();
    teardownDOM();
});

// =====================================================================
// Title + description -> aria-labelledby / aria-describedby
// =====================================================================

test("attachTitle wires aria-labelledby on content", () => {
    setupDOM();
    const d = createDrawer();
    const content = mkEl();
    const title = mkEl("h2");
    d.attachContent(content);
    d.attachTitle(title);
    assert.equal(content.getAttribute("aria-labelledby"), title.id);
    d.destroy();
    teardownDOM();
});

test("attachDescription wires aria-describedby on content", () => {
    setupDOM();
    const d = createDrawer();
    const content = mkEl();
    const desc = mkEl("p");
    d.attachContent(content);
    d.attachDescription(desc);
    assert.equal(content.getAttribute("aria-describedby"), desc.id);
    d.destroy();
    teardownDOM();
});

// =====================================================================
// Lifecycle
// =====================================================================

test("destroy closes if open + tears down attachments", () => {
    setupDOM();
    const d = createDrawer({ defaultOpen: true });
    const content = mkEl();
    const trig = mkEl("button");
    d.attachContent(content);
    d.attachTrigger(trig);
    d.destroy();
    assert.equal(content.hasAttribute("role"), false);
    assert.equal(trig.hasAttribute("aria-haspopup"), false);
    assert.equal(d.destroyed, true);
    teardownDOM();
});

test("destroy idempotent", () => {
    setupDOM();
    const d = createDrawer();
    d.destroy();
    d.destroy();
    assert.equal(d.destroyed, true);
    teardownDOM();
});
