// Tests: tag.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createTag } from "../src/tag/index.js";

function mkDiv() {
    setupDOM();
    const el = document.createElement("span");
    document.body.appendChild(el);
    return el;
}

test("attachRoot paints data-tag-root + data-intent='default'", () => {
    const el = mkDiv();
    const t = createTag({});
    t.attachRoot(el);
    assert.equal(el.hasAttribute("data-tag-root"), true);
    assert.equal(el.getAttribute("data-intent"), "default");
    t.destroy(); teardownDOM();
});

test("intent option sets data-intent at init", () => {
    const el = mkDiv();
    const t = createTag({ intent: "success" });
    t.attachRoot(el);
    assert.equal(el.getAttribute("data-intent"), "success");
    t.destroy(); teardownDOM();
});

test("setIntent updates data-intent reactively", () => {
    const el = mkDiv();
    const t = createTag({ intent: "default" });
    t.attachRoot(el);
    t.setIntent("warning");
    assert.equal(el.getAttribute("data-intent"), "warning");
    t.setIntent("danger");
    assert.equal(el.getAttribute("data-intent"), "danger");
    t.destroy(); teardownDOM();
});

test("invalid intent is rejected", () => {
    const el = mkDiv();
    const t = createTag({ intent: "success" });
    t.attachRoot(el);
    t.setIntent("nope");
    assert.equal(el.getAttribute("data-intent"), "success");
    t.destroy(); teardownDOM();
});

test("closable: false (default) -> close is a no-op", () => {
    const el = mkDiv();
    const t = createTag({});
    t.attachRoot(el);
    t.close();
    assert.equal(t.isRemoved(), false);
    t.destroy(); teardownDOM();
});

test("closable: true -> close paints data-hidden + hidden + fires callback", () => {
    const el = mkDiv();
    const events = [];
    const t = createTag({ closable: true, onClose: (r) => events.push(r) });
    t.attachRoot(el);
    t.close();
    assert.equal(t.isRemoved(), true);
    assert.equal(el.hasAttribute("data-hidden"), true);
    assert.equal(el.hasAttribute("hidden"), true);
    assert.deepEqual(events, ["api"]);
    t.destroy(); teardownDOM();
});

test("close is idempotent", () => {
    const el = mkDiv();
    let count = 0;
    const t = createTag({ closable: true, onClose: () => count++ });
    t.attachRoot(el);
    t.close();
    t.close();
    assert.equal(count, 1);
    t.destroy(); teardownDOM();
});

test("reset un-removes", () => {
    const el = mkDiv();
    const t = createTag({ closable: true });
    t.attachRoot(el);
    t.close();
    t.reset();
    assert.equal(t.isRemoved(), false);
    assert.equal(el.hasAttribute("data-hidden"), false);
    assert.equal(el.hasAttribute("hidden"), false);
    t.destroy(); teardownDOM();
});

test("attachCloseButton: click closes + paints data-tag-close + aria-label", () => {
    const el = mkDiv();
    const btn = document.createElement("button");
    el.appendChild(btn);
    const t = createTag({ closable: true });
    t.attachRoot(el);
    t.attachCloseButton(btn);
    assert.equal(btn.hasAttribute("data-tag-close"), true);
    assert.equal(btn.getAttribute("aria-label"), "Remove tag");
    btn.click();
    assert.equal(t.isRemoved(), true);
    t.destroy(); teardownDOM();
});

test("closable=false: attachCloseButton is a no-op", () => {
    const el = mkDiv();
    const btn = document.createElement("button");
    const t = createTag({});
    t.attachRoot(el);
    t.attachCloseButton(btn);
    assert.equal(btn.hasAttribute("data-tag-close"), false);
    t.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", () => {
    const el = mkDiv();
    const t = createTag({ intent: "primary", closable: true });
    t.attachRoot(el);
    t.destroy(); t.destroy();
    assert.equal(t.destroyed, true);
    assert.equal(el.hasAttribute("data-tag-root"), false);
    assert.equal(el.hasAttribute("data-intent"), false);
    teardownDOM();
});
