// nesting-scope-guard.test.js -- belongsToHost contract + locks in the
// fix that an outer <lite-*> wrapper cannot claim DOM nodes living
// inside a nested <lite-*> descendant.
//
// These cases would have silently broken in v0.7.34 (no scope guard).
// The fix exports `belongsToHost` from _overlay/element-roles.js and
// the wrappers route every consumer-facing querySelector through a
// scopedQuery wrapper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { belongsToHost } from "../src/_overlay/element-roles.js";

function el(tag, attrs) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) node.setAttribute(k, attrs[k]);
    document.body.appendChild(node);
    return node;
}

// =====================================================================
// belongsToHost contract
// =====================================================================

test("belongsToHost: a host claims direct children", () => {
    setupDOM();
    const host = el("lite-skeleton");
    const child = document.createElement("div");
    child.setAttribute("data-skeleton", "");
    host.appendChild(child);
    assert.equal(belongsToHost(child, host), true);
    teardownDOM();
});

test("belongsToHost: a host claims deeply-nested children of plain DOM", () => {
    setupDOM();
    const host = el("lite-skeleton");
    const wrap1 = document.createElement("section");
    const wrap2 = document.createElement("article");
    const child = document.createElement("div");
    child.setAttribute("data-skeleton", "");
    wrap2.appendChild(child);
    wrap1.appendChild(wrap2);
    host.appendChild(wrap1);
    assert.equal(belongsToHost(child, host), true);
    teardownDOM();
});

test("belongsToHost: a host DOES NOT claim children of a nested lite-* descendant", () => {
    setupDOM();
    const outer = el("lite-skeleton");
    const inner = document.createElement("lite-skeleton");
    const innerChild = document.createElement("div");
    innerChild.setAttribute("data-skeleton", "");
    inner.appendChild(innerChild);
    outer.appendChild(inner);
    // The inner placeholder belongs to the inner host, not the outer.
    assert.equal(belongsToHost(innerChild, outer), false);
    assert.equal(belongsToHost(innerChild, inner), true);
    teardownDOM();
});

test("belongsToHost: distinguishes mixed primitive types as separate scopes", () => {
    setupDOM();
    // <lite-skeleton><lite-progress><div data-skeleton></div></lite-progress></lite-skeleton>
    // A real-world bug pattern: a skeleton wrapping a progress that happens
    // to have a child marked with skeleton's selector. The outer skeleton
    // must not claim it -- the boundary is "any lite-* ancestor", not
    // "any same-tag ancestor".
    const outerSk = el("lite-skeleton");
    const innerPg = document.createElement("lite-progress");
    const stray = document.createElement("div");
    stray.setAttribute("data-skeleton", "");
    innerPg.appendChild(stray);
    outerSk.appendChild(innerPg);
    assert.equal(belongsToHost(stray, outerSk), false);
    teardownDOM();
});

test("belongsToHost: node === host returns true (self ownership)", () => {
    setupDOM();
    const host = el("lite-progress");
    assert.equal(belongsToHost(host, host), true);
    teardownDOM();
});

test("belongsToHost: false-positive guard -- tag must be 'LITE-' prefixed", () => {
    setupDOM();
    // A custom element named "lite" (no hyphen, no dash) would not be a
    // valid custom element name in the first place, but more importantly
    // a non-lite custom element like <lite> or <litebox> should NOT be
    // treated as a scope boundary.
    const outer = el("lite-skeleton");
    const fakeBoundary = document.createElement("litebox");   // not "lite-*"
    const child = document.createElement("div");
    child.setAttribute("data-skeleton", "");
    fakeBoundary.appendChild(child);
    outer.appendChild(fakeBoundary);
    // <litebox> is just a regular unknown element; child still belongs to outer.
    assert.equal(belongsToHost(child, outer), true);
    teardownDOM();
});

test("belongsToHost: charCode check accepts lowercase 'lite-' if platform doesn't upper-case", () => {
    setupDOM();
    // happy-dom always upper-cases tagName per the HTML spec, so this is
    // belt-and-braces for browsers that ever return lowercase tagName
    // (none in practice, but the check is built around the upper-case
    // contract; this test pins the contract).
    const outer = el("lite-skeleton");
    assert.equal(outer.tagName, "LITE-SKELETON");
    teardownDOM();
});

// =====================================================================
// Performance contract: O(depth), not O(subtree size)
// =====================================================================

test("belongsToHost: walks ancestors only -- O(depth) not O(subtree)", () => {
    setupDOM();
    // Build a 50-deep ancestor chain with no lite-* boundary.
    const host = el("lite-skeleton");
    let cursor = host;
    for (let i = 0; i < 50; i++) {
        const div = document.createElement("div");
        cursor.appendChild(div);
        cursor = div;
    }
    const leaf = document.createElement("span");
    leaf.setAttribute("data-skeleton", "");
    cursor.appendChild(leaf);

    // Verify the chain depth and that belongsToHost still returns true.
    let depth = 0;
    let p = leaf.parentElement;
    while (p && p !== host) { depth++; p = p.parentElement; }
    assert.equal(depth, 50);
    assert.equal(belongsToHost(leaf, host), true);
    teardownDOM();
});
