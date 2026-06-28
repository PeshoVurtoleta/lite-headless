// inline-edit.test.js -- createInlineEdit state + commit/cancel + paint.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createInlineEdit } from "../src/inline-edit/index.js";

function mkEl(tag = "span") {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    return el;
}
function mkInput(tag = "input") {
    const el = document.createElement(tag);
    document.body.appendChild(el);
    return el;
}
function typeInto(el, value) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
}
function keydown(el, key, modifiers = {}) {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
    el.dispatchEvent(ev);
    return ev;
}
async function flushMicro() {
    for (let i = 0; i < 4; i++) await Promise.resolve();
}

// =====================================================================
// Construction
// =====================================================================

test("default: value=initialValue, not editing, not invalid", () => {
    setupDOM();
    const ie = createInlineEdit({ initialValue: "Hello" });
    assert.equal(ie.value(), "Hello");
    assert.equal(ie.draftValue(), "Hello");
    assert.equal(ie.isEditing(), false);
    assert.equal(ie.isInvalid(), false);
    ie.destroy();
    teardownDOM();
});

test("non-string initialValue throws", () => {
    setupDOM();
    assert.throws(() => createInlineEdit({ initialValue: 42 }), /must be a string/);
    teardownDOM();
});

test("non-array commitOn/cancelOn throws", () => {
    setupDOM();
    assert.throws(() => createInlineEdit({ commitOn: "Enter" }), /commitOn must be an array/);
    assert.throws(() => createInlineEdit({ cancelOn: "Escape" }), /cancelOn must be an array/);
    teardownDOM();
});

// =====================================================================
// startEdit / commit / cancel
// =====================================================================

test("startEdit transitions to edit mode + draft mirrors value", () => {
    setupDOM();
    const ie = createInlineEdit({ initialValue: "abc" });
    ie.startEdit();
    assert.equal(ie.isEditing(), true);
    assert.equal(ie.draftValue(), "abc");
    ie.destroy();
    teardownDOM();
});

test("commit with valid draft updates value + fires onChange + onCommit", () => {
    setupDOM();
    const order = [];
    const ie = createInlineEdit({
        initialValue: "old",
        onChange: (next, prev) => order.push("change:" + prev + "->" + next),
        onCommit: (next, prev) => order.push("commit:" + prev + "->" + next),
    });
    ie.startEdit();
    ie.setDraftValue("new");
    assert.equal(ie.commit(), true);
    assert.equal(ie.value(), "new");
    assert.equal(ie.isEditing(), false);
    assert.deepEqual(order, ["change:old->new", "commit:old->new"]);
    ie.destroy();
    teardownDOM();
});

test("commit when draft === value fires onCommit but NOT onChange", () => {
    setupDOM();
    const order = [];
    const ie = createInlineEdit({
        initialValue: "same",
        onChange: () => order.push("change"),
        onCommit: () => order.push("commit"),
    });
    ie.startEdit();
    // Don't change draft; commit
    assert.equal(ie.commit(), true);
    assert.deepEqual(order, ["commit"]);
    ie.destroy();
    teardownDOM();
});

test("commit when not editing returns false", () => {
    setupDOM();
    const ie = createInlineEdit({ initialValue: "x" });
    assert.equal(ie.commit(), false);
    ie.destroy();
    teardownDOM();
});

test("commit rejects empty by default + fires onInvalid + sets isInvalid", () => {
    setupDOM();
    const invalid = [];
    const ie = createInlineEdit({
        initialValue: "x",
        onInvalid: (v, r) => invalid.push([v, r]),
    });
    ie.startEdit();
    ie.setDraftValue("   ");
    assert.equal(ie.commit(), false);
    assert.equal(ie.isInvalid(), true);
    assert.equal(ie.isEditing(), true);    // still editing
    assert.equal(ie.value(), "x");          // unchanged
    assert.deepEqual(invalid, [["", "empty"]]);
    ie.destroy();
    teardownDOM();
});

test("commit allows empty when allowEmpty=true", () => {
    setupDOM();
    const ie = createInlineEdit({ initialValue: "x", allowEmpty: true });
    ie.startEdit();
    ie.setDraftValue("");
    assert.equal(ie.commit(), true);
    assert.equal(ie.value(), "");
    ie.destroy();
    teardownDOM();
});

test("commit runs validate; false rejects + forwards reason", () => {
    setupDOM();
    const invalid = [];
    const ie = createInlineEdit({
        initialValue: "abc",
        validate: (next) => next.length >= 3 || "too short",
        onInvalid: (v, r) => invalid.push([v, r]),
    });
    ie.startEdit();
    ie.setDraftValue("ab");
    assert.equal(ie.commit(), false);
    assert.deepEqual(invalid, [["ab", "too short"]]);
    ie.destroy();
    teardownDOM();
});

test("commit applies normalize + trim", () => {
    setupDOM();
    const ie = createInlineEdit({
        initialValue: "Hello",
        normalize: (s) => s.toUpperCase(),
        trim: true,
    });
    ie.startEdit();
    ie.setDraftValue("  world  ");
    ie.commit();
    assert.equal(ie.value(), "WORLD");
    ie.destroy();
    teardownDOM();
});

test("cancel reverts draft + exits edit + fires onCancel", () => {
    setupDOM();
    let cancelled = 0;
    const ie = createInlineEdit({
        initialValue: "x",
        onCancel: () => cancelled++,
    });
    ie.startEdit();
    ie.setDraftValue("new draft");
    ie.cancel();
    assert.equal(ie.value(), "x");
    assert.equal(ie.draftValue(), "x");
    assert.equal(ie.isEditing(), false);
    assert.equal(cancelled, 1);
    ie.destroy();
    teardownDOM();
});

test("setDraftValue while invalid clears the invalid state", () => {
    setupDOM();
    const ie = createInlineEdit({ initialValue: "abc" });
    ie.startEdit();
    ie.setDraftValue("");
    ie.commit();
    assert.equal(ie.isInvalid(), true);
    ie.setDraftValue("def");
    assert.equal(ie.isInvalid(), false);
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot paint
// =====================================================================

test("attachRoot paints data-mode + data-invalid reactively", async () => {
    setupDOM();
    const root = mkEl("div");
    const ie = createInlineEdit({ initialValue: "x" });
    ie.attachRoot(root);
    await flushMicro();
    assert.equal(root.getAttribute("data-mode"), "display");
    assert.equal(root.hasAttribute("data-invalid"), false);
    ie.startEdit();
    await flushMicro();
    assert.equal(root.getAttribute("data-mode"), "edit");
    ie.setDraftValue("");
    ie.commit();
    await flushMicro();
    assert.equal(root.getAttribute("data-invalid"), "true");
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// attachDisplay
// =====================================================================

test("attachDisplay paints textContent from value + toggles hidden", async () => {
    setupDOM();
    const el = mkEl("span");
    const ie = createInlineEdit({ initialValue: "Hello" });
    ie.attachDisplay(el);
    await flushMicro();
    assert.equal(el.textContent, "Hello");
    assert.equal(el.hasAttribute("hidden"), false);
    ie.startEdit();
    await flushMicro();
    assert.equal(el.hasAttribute("hidden"), true);
    ie.cancel();
    await flushMicro();
    assert.equal(el.hasAttribute("hidden"), false);
    ie.destroy();
    teardownDOM();
});

test("display click starts edit", () => {
    setupDOM();
    const el = mkEl("span");
    const ie = createInlineEdit({ initialValue: "x" });
    ie.attachDisplay(el);
    el.dispatchEvent(new Event("click", { bubbles: true }));
    assert.equal(ie.isEditing(), true);
    ie.destroy();
    teardownDOM();
});

test("display Enter / Space starts edit", () => {
    setupDOM();
    const el = mkEl("span");
    const ie = createInlineEdit({ initialValue: "x" });
    ie.attachDisplay(el);
    const ev = keydown(el, "Enter");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(ie.isEditing(), true);
    ie.cancel();
    keydown(el, " ");
    assert.equal(ie.isEditing(), true);
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// attachInput
// =====================================================================

test("attachInput hidden state reflects edit mode", async () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({ initialValue: "x" });
    ie.attachInput(inp);
    await flushMicro();
    assert.equal(inp.hasAttribute("hidden"), true);
    ie.startEdit();
    await flushMicro();
    assert.equal(inp.hasAttribute("hidden"), false);
    ie.destroy();
    teardownDOM();
});

test("typing into input updates draftValue", () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({ initialValue: "abc" });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "hello");
    assert.equal(ie.draftValue(), "hello");
    ie.destroy();
    teardownDOM();
});

test("Enter on input commits (single-line default)", () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({ initialValue: "abc" });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "new");
    const ev = keydown(inp, "Enter");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(ie.value(), "new");
    assert.equal(ie.isEditing(), false);
    ie.destroy();
    teardownDOM();
});

test("Escape on input cancels", () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({ initialValue: "abc" });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "new");
    const ev = keydown(inp, "Escape");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(ie.value(), "abc");
    assert.equal(ie.isEditing(), false);
    ie.destroy();
    teardownDOM();
});

test("blur on input commits when 'blur' in commitOn", () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({ initialValue: "abc", commitOn: ["Enter", "blur"] });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "new");
    inp.dispatchEvent(new Event("blur", { bubbles: false }));
    assert.equal(ie.value(), "new");
    ie.destroy();
    teardownDOM();
});

test("blur does NOT commit when 'blur' NOT in commitOn", () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({ initialValue: "abc", commitOn: ["Enter"] });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "new");
    inp.dispatchEvent(new Event("blur", { bubbles: false }));
    assert.equal(ie.value(), "abc");        // unchanged
    assert.equal(ie.isEditing(), true);     // still editing
    ie.destroy();
    teardownDOM();
});

test("Tab on input commits when 'Tab' in commitOn", () => {
    setupDOM();
    const inp = mkInput();
    const ie = createInlineEdit({
        initialValue: "abc",
        commitOn: ["Enter", "Tab", "blur"],
    });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "new");
    const ev = keydown(inp, "Tab");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(ie.value(), "new");
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// Multiline (textarea-style)
// =====================================================================

test("multiline: Enter alone does NOT commit", () => {
    setupDOM();
    const inp = mkInput("textarea");
    const ie = createInlineEdit({ initialValue: "abc", multiline: true });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "new\ntext");
    const ev = keydown(inp, "Enter");
    // No preventDefault -- newline goes through.
    assert.equal(ev.defaultPrevented, false);
    assert.equal(ie.isEditing(), true);
    ie.destroy();
    teardownDOM();
});

test("multiline: Cmd/Ctrl + Enter commits", () => {
    setupDOM();
    const inp = mkInput("textarea");
    const ie = createInlineEdit({ initialValue: "abc", multiline: true });
    ie.attachInput(inp);
    ie.startEdit();
    typeInto(inp, "multi\nline");
    const ev = keydown(inp, "Enter", { ctrlKey: true });
    assert.equal(ev.defaultPrevented, true);
    assert.equal(ie.value(), "multi\nline");   // newlines preserved
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// attachTrigger
// =====================================================================

test("attachTrigger: click starts edit", () => {
    setupDOM();
    const btn = mkInput("button");
    const ie = createInlineEdit({ initialValue: "x" });
    ie.attachTrigger(btn);
    btn.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
    assert.equal(ie.isEditing(), true);
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// setValue (programmatic, no events)
// =====================================================================

test("setValue updates value + draft without firing onChange/onCommit", () => {
    setupDOM();
    const order = [];
    const ie = createInlineEdit({
        initialValue: "old",
        onChange: () => order.push("change"),
        onCommit: () => order.push("commit"),
    });
    ie.setValue("programmatic");
    assert.equal(ie.value(), "programmatic");
    assert.equal(ie.draftValue(), "programmatic");
    assert.deepEqual(order, []);   // no events
    ie.destroy();
    teardownDOM();
});

// =====================================================================
// destroy
// =====================================================================

test("destroy clears attrs + makes methods no-ops", () => {
    setupDOM();
    const root = mkEl("div");
    const display = mkEl("span");
    const input = mkInput();
    const ie = createInlineEdit({ initialValue: "x" });
    ie.attachRoot(root);
    ie.attachDisplay(display);
    ie.attachInput(input);
    ie.destroy();
    assert.equal(ie.destroyed, true);
    assert.equal(root.hasAttribute("data-inline-edit-root"), false);
    assert.equal(display.hasAttribute("data-inline-edit-display"), false);
    assert.equal(input.hasAttribute("data-inline-edit-input"), false);
    ie.startEdit();
    assert.equal(ie.destroyed, true);    // still destroyed
    teardownDOM();
});

test("destroy is idempotent", () => {
    setupDOM();
    const ie = createInlineEdit({ initialValue: "x" });
    ie.destroy();
    ie.destroy();
    assert.equal(ie.destroyed, true);
    teardownDOM();
});
