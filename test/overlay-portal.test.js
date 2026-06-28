// overlay/portal.test.js -- move to container, restore to original position

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { portal } from "../src/_overlay/portal.js";

test("portal() moves content into container", () => {
    setupDOM();
    const orig = document.createElement("div");
    const content = document.createElement("span");
    const container = document.createElement("aside");
    orig.appendChild(content);
    document.body.appendChild(orig);
    document.body.appendChild(container);

    const restore = portal(content, container);
    assert.equal(content.parentNode, container);
    restore();
    teardownDOM();
});

test("restore() puts content back to original parent", () => {
    setupDOM();
    const orig = document.createElement("div");
    const content = document.createElement("span");
    const container = document.createElement("aside");
    orig.appendChild(content);
    document.body.appendChild(orig);
    document.body.appendChild(container);

    const restore = portal(content, container);
    restore();
    assert.equal(content.parentNode, orig);
    teardownDOM();
});

test("restore() preserves original sibling order", () => {
    setupDOM();
    const orig = document.createElement("div");
    const before = document.createElement("i");
    const content = document.createElement("span");
    const after = document.createElement("b");
    orig.append(before, content, after);
    document.body.appendChild(orig);

    const container = document.createElement("aside");
    document.body.appendChild(container);

    const restore = portal(content, container);
    restore();

    assert.equal(orig.children[0], before);
    assert.equal(orig.children[1], content);
    assert.equal(orig.children[2], after);
    teardownDOM();
});

test("restore() is idempotent (calling twice is safe)", () => {
    setupDOM();
    const orig = document.createElement("div");
    const content = document.createElement("span");
    orig.appendChild(content);
    document.body.appendChild(orig);
    const container = document.createElement("aside");
    document.body.appendChild(container);

    const restore = portal(content, container);
    restore();
    restore(); // must not throw or duplicate
    assert.equal(content.parentNode, orig);
    teardownDOM();
});

test("portal() with content already inside container is a no-op", () => {
    setupDOM();
    const container = document.createElement("aside");
    const content = document.createElement("span");
    container.appendChild(content);
    document.body.appendChild(container);

    const restore = portal(content, container);
    restore();
    assert.equal(content.parentNode, container, "still inside, never moved");
    teardownDOM();
});

test("portal() accepts a selector string for container", () => {
    setupDOM();
    const container = document.createElement("aside");
    container.id = "portal-root";
    document.body.appendChild(container);

    const content = document.createElement("span");
    document.body.appendChild(content);

    const restore = portal(content, "#portal-root");
    assert.equal(content.parentNode, container);
    restore();
    teardownDOM();
});
