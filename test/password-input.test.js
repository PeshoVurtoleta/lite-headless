// Tests: password-input.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createPasswordInput } from "../src/password-input/index.js";

function mkInput() {
    const i = document.createElement("input");
    i.setAttribute("type", "password");
    document.body.append(i);
    return i;
}
function mkBtn() {
    const b = document.createElement("button");
    document.body.append(b);
    return b;
}

test("attachInput paints marker + defaults to type=password (hidden)", () => {
    setupDOM();
    const input = mkInput();
    const p = createPasswordInput({});
    p.attachInput(input);
    assert.equal(input.hasAttribute("data-password-input"), true);
    assert.equal(input.getAttribute("type"), "password");
    assert.equal(input.hasAttribute("data-visible"), false);
    assert.equal(p.isVisible(), false);
    p.destroy(); teardownDOM();
});

test("show/hide/toggle flip input type + data-visible", () => {
    setupDOM();
    const input = mkInput();
    const p = createPasswordInput({});
    p.attachInput(input);
    p.show();
    assert.equal(input.getAttribute("type"), "text");
    assert.equal(input.hasAttribute("data-visible"), true);
    assert.equal(p.isVisible(), true);
    p.hide();
    assert.equal(input.getAttribute("type"), "password");
    assert.equal(input.hasAttribute("data-visible"), false);
    p.toggle();
    assert.equal(input.getAttribute("type"), "text");
    p.destroy(); teardownDOM();
});

test("initial visible:true starts as text", () => {
    setupDOM();
    const input = mkInput();
    const p = createPasswordInput({ visible: true });
    p.attachInput(input);
    assert.equal(input.getAttribute("type"), "text");
    assert.equal(p.isVisible(), true);
    p.destroy(); teardownDOM();
});

test("attachToggle: aria-pressed + aria-label track visibility; type=button", () => {
    setupDOM();
    const btn = mkBtn();
    const p = createPasswordInput({});
    p.attachToggle(btn);
    assert.equal(btn.hasAttribute("data-password-toggle"), true);
    assert.equal(btn.getAttribute("type"), "button");
    assert.equal(btn.getAttribute("aria-pressed"), "false");
    assert.equal(btn.getAttribute("aria-label"), "Show password");
    p.show();
    assert.equal(btn.getAttribute("aria-pressed"), "true");
    assert.equal(btn.getAttribute("aria-label"), "Hide password");
    assert.equal(btn.hasAttribute("data-visible"), true);
    p.destroy(); teardownDOM();
});

test("clicking toggle flips visibility", () => {
    setupDOM();
    const input = mkInput();
    const btn = mkBtn();
    let changes = 0;
    const p = createPasswordInput({ onVisibilityChange: () => { changes++; } });
    p.attachInput(input);
    p.attachToggle(btn);
    dispatchClick(btn);
    assert.equal(p.isVisible(), true);
    assert.equal(input.getAttribute("type"), "text");
    dispatchClick(btn);
    assert.equal(p.isVisible(), false);
    assert.equal(changes, 2);
    p.destroy(); teardownDOM();
});

test("toggle gets aria-controls pointing at the input id", () => {
    setupDOM();
    const input = mkInput();
    const btn = mkBtn();
    const p = createPasswordInput({});
    p.attachInput(input);
    p.attachToggle(btn);
    const controls = btn.getAttribute("aria-controls");
    assert.ok(controls && controls.length > 0);
    assert.equal(controls, input.id);
    p.destroy(); teardownDOM();
});

test("aria-controls links even if toggle attached before input", () => {
    setupDOM();
    const input = mkInput();
    const btn = mkBtn();
    const p = createPasswordInput({});
    p.attachToggle(btn);
    p.attachInput(input);
    assert.equal(btn.getAttribute("aria-controls"), input.id);
    p.destroy(); teardownDOM();
});

test("original input type restored on detach", () => {
    setupDOM();
    const input = mkInput();
    const p = createPasswordInput({ visible: true });
    const off = p.attachInput(input);
    assert.equal(input.getAttribute("type"), "text");
    off();
    assert.equal(input.getAttribute("type"), "password");
    p.destroy(); teardownDOM();
});

test("pre-set aria-label preserved on toggle", () => {
    setupDOM();
    const btn = mkBtn();
    btn.setAttribute("aria-label", "Reveal");
    const p = createPasswordInput({});
    p.attachToggle(btn);
    assert.equal(btn.getAttribute("aria-label"), "Reveal");
    p.show();
    assert.equal(btn.getAttribute("aria-label"), "Reveal");
    p.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", () => {
    setupDOM();
    const input = mkInput();
    const btn = mkBtn();
    const p = createPasswordInput({});
    p.attachInput(input);
    p.attachToggle(btn);
    p.destroy(); p.destroy();
    assert.equal(p.destroyed, true);
    assert.equal(input.hasAttribute("data-password-input"), false);
    assert.equal(btn.hasAttribute("data-password-toggle"), false);
    assert.equal(btn.hasAttribute("aria-pressed"), false);
    teardownDOM();
});
