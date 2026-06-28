// tooltip.test.js -- trigger model + delays + leave-both grace period

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks, dispatchKey } from "./_setup.js";
import { createTooltip } from "../src/tooltip/index.js";

function mkDOM() {
    const trigger = document.createElement("button");
    const content = document.createElement("div");
    content.textContent = "tip";
    document.body.append(trigger);
    return { trigger, content };
}

function dispatchEvt(target, type) {
    const e = new globalThis.Event(type, { bubbles: true, cancelable: true });
    target.dispatchEvent(e);
    return e;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test("hover trigger opens after openDelay", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 20, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    assert.equal(tip.open(), false, "still closed during delay");
    await wait(40);
    assert.equal(tip.open(), true, "opens after openDelay elapsed");
    tip.destroy();
    teardownDOM();
});

test("hover trigger: pointerleave before openDelay cancels the pending open", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 50, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    await wait(10);
    dispatchEvt(trigger, "pointerleave");
    await wait(80);
    assert.equal(tip.open(), false, "open was cancelled");
    tip.destroy();
    teardownDOM();
});

test("focus trigger opens immediately (no delay -- keyboard accessibility)", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "focus", openDelay: 500, closeDelay: 500,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "focus");
    assert.equal(tip.open(), true, "opens synchronously on focus");

    dispatchEvt(trigger, "blur");
    assert.equal(tip.open(), false, "closes synchronously on blur");
    tip.destroy();
    teardownDOM();
});

test("hover+focus combined: pointerenter and focus both open", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover focus", openDelay: 20, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "focus");
    assert.equal(tip.open(), true);
    dispatchEvt(trigger, "blur");
    assert.equal(tip.open(), false);

    dispatchEvt(trigger, "pointerenter");
    await wait(40);
    assert.equal(tip.open(), true);
    tip.destroy();
    teardownDOM();
});

test("leave trigger then enter content within closeDelay keeps tooltip open", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 0, closeDelay: 50,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    assert.equal(tip.open(), true, "opens immediately (openDelay 0)");

    dispatchEvt(trigger, "pointerleave");
    // within closeDelay window, move to content
    await wait(20);
    dispatchEvt(content, "pointerenter");
    await wait(80);
    assert.equal(tip.open(), true, "tooltip stayed open while pointer was over content");
    tip.destroy();
    teardownDOM();
});

test("leaving BOTH trigger and content eventually closes after closeDelay", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 0, closeDelay: 30,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    dispatchEvt(trigger, "pointerleave");
    dispatchEvt(content, "pointerenter");
    dispatchEvt(content, "pointerleave");

    await wait(15);
    assert.equal(tip.open(), true, "still open mid-closeDelay");
    await wait(40);
    assert.equal(tip.open(), false, "closed after closeDelay");
    tip.destroy();
    teardownDOM();
});

test("re-entering trigger while closeDelay pending cancels the close", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 0, closeDelay: 60,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    dispatchEvt(trigger, "pointerleave");
    await wait(20);
    dispatchEvt(trigger, "pointerenter");
    await wait(80);
    assert.equal(tip.open(), true, "still open after the would-be-close window");
    tip.destroy();
    teardownDOM();
});

test("focus blur with hover-trigger still active does NOT close", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover focus", openDelay: 0, closeDelay: 30,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");  // hover alive
    dispatchEvt(trigger, "focus");          // focus alive
    assert.equal(tip.open(), true);

    dispatchEvt(trigger, "blur");           // focus gone, but hover still alive
    await wait(50);
    assert.equal(tip.open(), true, "stays open while hover keeps it alive");
    tip.destroy();
    teardownDOM();
});

test("content gets role='tooltip' on attach", () => {
    setupDOM();
    const { content } = mkDOM();
    const tip = createTooltip({ defaultOpen: false, container: null });
    tip.attachContent(content);
    assert.equal(content.getAttribute("role"), "tooltip");
    tip.destroy();
    teardownDOM();
});

test("trigger gets aria-describedby pointing at content (default)", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({ defaultOpen: false, container: null });
    tip.attachContent(content);
    tip.attachTrigger(trigger);
    assert.equal(trigger.getAttribute("aria-describedby"), content.id);
    assert.equal(trigger.hasAttribute("aria-labelledby"), false);
    tip.destroy();
    teardownDOM();
});

test("describesTrigger:false flips to aria-labelledby", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({ defaultOpen: false, container: null, describesTrigger: false });
    tip.attachContent(content);
    tip.attachTrigger(trigger);
    assert.equal(trigger.getAttribute("aria-labelledby"), content.id);
    assert.equal(trigger.hasAttribute("aria-describedby"), false);
    tip.destroy();
    teardownDOM();
});

test("click trigger toggles tooltip", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "click", openDelay: 0, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    const e1 = new globalThis.Event("click", { bubbles: true, cancelable: true });
    trigger.dispatchEvent(e1);
    assert.equal(tip.open(), true);
    const e2 = new globalThis.Event("click", { bubbles: true, cancelable: true });
    trigger.dispatchEvent(e2);
    assert.equal(tip.open(), false);
    tip.destroy();
    teardownDOM();
});

test("manual trigger: no auto open from hover/focus, only setOpen", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "manual", openDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    dispatchEvt(trigger, "focus");
    await wait(10);
    assert.equal(tip.open(), false, "manual trigger ignores events");

    tip.setOpen(true, "api");
    assert.equal(tip.open(), true);
    tip.destroy();
    teardownDOM();
});

test("Escape closes the tooltip (closeOnEscape default)", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: true, container: null,
        trigger: "focus", openDelay: 0, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);
    dispatchKey(document, "Escape");
    assert.equal(tip.open(), false);
    tip.destroy();
    teardownDOM();
});

test("status: closed -> opening -> open on hover-open path", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 0, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    const seen = [];
    tip.status.subscribe((s) => seen.push(s));

    dispatchEvt(trigger, "pointerenter");
    await flushMicrotasks();
    assert.deepEqual(seen, ["closed", "opening", "open"]);
    tip.destroy();
    teardownDOM();
});

test("destroy: clears pending timers (no lingering open after destroy)", async () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({
        defaultOpen: false, container: null,
        trigger: "hover", openDelay: 50, closeDelay: 0,
    });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    dispatchEvt(trigger, "pointerenter");
    tip.destroy();
    await wait(80);
    assert.equal(tip.open(), false, "no late-fire open after destroy");
    teardownDOM();
});

test("focus on trigger receives aria-describedby pointing at content", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({ defaultOpen: false, container: null });
    tip.attachTrigger(trigger);   // no content attached yet
    assert.equal(trigger.hasAttribute("aria-describedby"), false, "no describedby until content attached");
    tip.attachContent(content);
    assert.equal(trigger.getAttribute("aria-describedby"), content.id, "wired after content attaches");
    tip.destroy();
    teardownDOM();
});

test("aria-describedby coexists with consumer's pre-existing tokens (no clobber)", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    // consumer set up an error message and points trigger.aria-describedby at it
    const errMsg = document.createElement("div");
    errMsg.id = "field-error-1";
    errMsg.textContent = "Required.";
    document.body.appendChild(errMsg);
    trigger.setAttribute("aria-describedby", "field-error-1");

    const tip = createTooltip({ defaultOpen: false, container: null });
    tip.attachTrigger(trigger);
    tip.attachContent(content);

    const ref = trigger.getAttribute("aria-describedby");
    const tokens = ref.split(/\s+/);
    assert.ok(tokens.includes("field-error-1"), "consumer's id preserved");
    assert.ok(tokens.includes(content.id), "tooltip's id added");
    assert.equal(tokens.length, 2);

    tip.destroy();
    // after destroy: consumer's id remains, tooltip's id is gone
    const after = trigger.getAttribute("aria-describedby");
    assert.equal(after, "field-error-1", "only consumer's id remains");
    teardownDOM();
});

test("attaching twice doesn't duplicate the tooltip's id token", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    const tip = createTooltip({ defaultOpen: false, container: null });
    tip.attachTrigger(trigger);
    tip.attachContent(content);
    // Re-attach is unusual but should be idempotent w.r.t. the IDREF list
    tip.attachTrigger(trigger);
    const ref = trigger.getAttribute("aria-describedby");
    const tokens = ref.split(/\s+/).filter(Boolean);
    assert.equal(tokens.filter((t) => t === content.id).length, 1, "no duplicate");
    tip.destroy();
    teardownDOM();
});

test("describesTrigger:false flips to aria-labelledby and respects existing tokens", () => {
    setupDOM();
    const { trigger, content } = mkDOM();
    trigger.setAttribute("aria-labelledby", "external-label");
    const tip = createTooltip({ defaultOpen: false, container: null, describesTrigger: false });
    tip.attachTrigger(trigger);
    tip.attachContent(content);
    const ref = trigger.getAttribute("aria-labelledby").split(/\s+/);
    assert.ok(ref.includes("external-label"));
    assert.ok(ref.includes(content.id));
    tip.destroy();
    assert.equal(trigger.getAttribute("aria-labelledby"), "external-label");
    teardownDOM();
});
