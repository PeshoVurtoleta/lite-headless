// Tests: separator.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createSeparator } from "../src/separator/index.js";

function mk() {
    setupDOM();
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}

test("semantic default: role=separator, horizontal, no aria-orientation", () => {
    const el = mk();
    const s = createSeparator({});
    s.attachRoot(el);
    assert.equal(el.hasAttribute("data-separator-root"), true);
    assert.equal(el.getAttribute("role"), "separator");
    assert.equal(el.getAttribute("data-orientation"), "horizontal");
    // ARIA default orientation for separator is horizontal -> not declared
    assert.equal(el.hasAttribute("aria-orientation"), false);
    assert.equal(s.orientation(), "horizontal");
    assert.equal(s.isDecorative, false);
    s.destroy(); teardownDOM();
});

test("vertical: paints data-orientation + aria-orientation=vertical", () => {
    const el = mk();
    const s = createSeparator({ orientation: "vertical" });
    s.attachRoot(el);
    assert.equal(el.getAttribute("data-orientation"), "vertical");
    assert.equal(el.getAttribute("aria-orientation"), "vertical");
    s.destroy(); teardownDOM();
});

test("setOrientation flips reactively + toggles aria-orientation", () => {
    const el = mk();
    const s = createSeparator({});
    s.attachRoot(el);
    s.setOrientation("vertical");
    assert.equal(s.orientation(), "vertical");
    assert.equal(el.getAttribute("data-orientation"), "vertical");
    assert.equal(el.getAttribute("aria-orientation"), "vertical");
    s.setOrientation("horizontal");
    assert.equal(el.getAttribute("data-orientation"), "horizontal");
    assert.equal(el.hasAttribute("aria-orientation"), false);
    s.destroy(); teardownDOM();
});

test("setOrientation rejects invalid values", () => {
    const el = mk();
    const s = createSeparator({ orientation: "horizontal" });
    s.attachRoot(el);
    s.setOrientation("diagonal");
    s.setOrientation("");
    assert.equal(s.orientation(), "horizontal");
    s.destroy(); teardownDOM();
});

test("invalid initial orientation falls back to horizontal", () => {
    const el = mk();
    const s = createSeparator({ orientation: "sideways" });
    s.attachRoot(el);
    assert.equal(s.orientation(), "horizontal");
    s.destroy(); teardownDOM();
});

test("decorative: role=none, aria-hidden, no aria-orientation even when vertical", () => {
    const el = mk();
    const s = createSeparator({ decorative: true, orientation: "vertical" });
    s.attachRoot(el);
    assert.equal(el.getAttribute("role"), "none");
    assert.equal(el.getAttribute("aria-hidden"), "true");
    assert.equal(el.getAttribute("data-orientation"), "vertical");
    assert.equal(el.hasAttribute("aria-orientation"), false);
    assert.equal(s.isDecorative, true);
    s.destroy(); teardownDOM();
});

test("pre-set role is preserved (not overwritten)", () => {
    const el = mk();
    el.setAttribute("role", "presentation");
    const s = createSeparator({});
    s.attachRoot(el);
    assert.equal(el.getAttribute("role"), "presentation");
    s.destroy(); teardownDOM();
});

test("destroy is idempotent + clears attrs", () => {
    const el = mk();
    const s = createSeparator({ orientation: "vertical" });
    s.attachRoot(el);
    s.destroy(); s.destroy();
    assert.equal(s.destroyed, true);
    assert.equal(el.hasAttribute("data-separator-root"), false);
    assert.equal(el.hasAttribute("data-orientation"), false);
    assert.equal(el.hasAttribute("aria-orientation"), false);
    assert.equal(el.hasAttribute("role"), false);
    teardownDOM();
});

test("setOrientation after destroy is a no-op", () => {
    const el = mk();
    const s = createSeparator({});
    s.attachRoot(el);
    s.destroy();
    s.setOrientation("vertical");
    assert.equal(s.orientation(), "horizontal");
    teardownDOM();
});
