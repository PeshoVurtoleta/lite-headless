// Tests: clipboard.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createClipboard } from "../src/clipboard/index.js";

function okWrite() { return async () => {}; }
function failWrite() { return async () => { throw new Error("denied"); }; }
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("attachTrigger paints marker + type=button + aria-label Copy", () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.append(btn);
    const c = createClipboard({ value: "x", write: okWrite() });
    c.attachTrigger(btn);
    assert.equal(btn.hasAttribute("data-clipboard-trigger"), true);
    assert.equal(btn.getAttribute("type"), "button");
    assert.equal(btn.getAttribute("aria-label"), "Copy");
    c.destroy(); teardownDOM();
});

test("copy() flips data-copied + aria-label across root/trigger/indicator", async () => {
    setupDOM();
    const root = document.createElement("div");
    const btn = document.createElement("button");
    const ind = document.createElement("span");
    document.body.append(root, btn, ind);
    const c = createClipboard({ value: "hello", write: okWrite(), timeout: 0 });
    c.attachRoot(root); c.attachTrigger(btn); c.attachIndicator(ind);

    assert.equal(c.isCopied(), false);
    const ok = await c.copy();
    assert.equal(ok, true);
    assert.equal(c.isCopied(), true);
    assert.equal(root.hasAttribute("data-copied"), true);
    assert.equal(btn.hasAttribute("data-copied"), true);
    assert.equal(ind.hasAttribute("data-copied"), true);
    assert.equal(btn.getAttribute("aria-label"), "Copied");
    c.destroy(); teardownDOM();
});

test("click on trigger triggers copy()", async () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.append(btn);
    let copied = "";
    const c = createClipboard({ value: "payload", write: okWrite(), timeout: 0, onCopy: (t) => { copied = t; } });
    c.attachTrigger(btn);
    dispatchClick(btn);
    await wait(0);
    assert.equal(c.isCopied(), true);
    assert.equal(copied, "payload");
    c.destroy(); teardownDOM();
});

test("timeout auto-resets copied", async () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.append(btn);
    const c = createClipboard({ value: "x", write: okWrite(), timeout: 10 });
    c.attachTrigger(btn);
    await c.copy();
    assert.equal(c.isCopied(), true);
    await wait(30);
    assert.equal(c.isCopied(), false);
    assert.equal(btn.hasAttribute("data-copied"), false);
    c.destroy(); teardownDOM();
});

test("reset() clears copied immediately", async () => {
    setupDOM();
    const c = createClipboard({ value: "x", write: okWrite(), timeout: 0 });
    await c.copy();
    assert.equal(c.isCopied(), true);
    c.reset();
    assert.equal(c.isCopied(), false);
    c.destroy(); teardownDOM();
});

test("failed write sets data-error + onError, not copied", async () => {
    setupDOM();
    const root = document.createElement("div");
    document.body.append(root);
    let err = null;
    const c = createClipboard({ value: "x", write: failWrite(), onError: (e) => { err = e; } });
    c.attachRoot(root);
    const ok = await c.copy();
    assert.equal(ok, false);
    assert.equal(c.isCopied(), false);
    assert.equal(c.isError(), true);
    assert.equal(root.hasAttribute("data-error"), true);
    assert.ok(err instanceof Error);
    c.destroy(); teardownDOM();
});

test("setValue updates the copy target", async () => {
    setupDOM();
    let seen = "";
    const c = createClipboard({ value: "old", write: async (t) => { seen = t; }, timeout: 0 });
    c.setValue("new");
    assert.equal(c.value(), "new");
    await c.copy();
    assert.equal(seen, "new");
    c.destroy(); teardownDOM();
});

test("pre-set aria-label preserved on trigger", () => {
    setupDOM();
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "Copy token");
    document.body.append(btn);
    const c = createClipboard({ value: "x", write: okWrite() });
    c.attachTrigger(btn);
    assert.equal(btn.getAttribute("aria-label"), "Copy token");
    c.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", async () => {
    setupDOM();
    const btn = document.createElement("button");
    document.body.append(btn);
    const c = createClipboard({ value: "x", write: okWrite(), timeout: 0 });
    c.attachTrigger(btn);
    await c.copy();
    c.destroy(); c.destroy();
    assert.equal(c.destroyed, true);
    assert.equal(btn.hasAttribute("data-clipboard-trigger"), false);
    assert.equal(btn.hasAttribute("data-copied"), false);
    teardownDOM();
});
