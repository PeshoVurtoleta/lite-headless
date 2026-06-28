// Tests: result.

import test from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createResult } from "../src/result/index.js";

function setup() {
    setupDOM();
    const root = document.createElement("div");
    document.body.appendChild(root);
    return root;
}

test("attachRoot paints role=status + data-result-root + default status=info", () => {
    const root = setup();
    const r = createResult({});
    r.attachRoot(root);
    assert.equal(root.getAttribute("role"), "status");
    assert.equal(root.hasAttribute("data-result-root"), true);
    assert.equal(root.getAttribute("data-status"), "info");
    r.destroy(); teardownDOM();
});

test("status option paints data-status", () => {
    const root = setup();
    const r = createResult({ status: "404" });
    r.attachRoot(root);
    assert.equal(root.getAttribute("data-status"), "404");
    r.destroy(); teardownDOM();
});

test("invalid status falls back to info", () => {
    const root = setup();
    const r = createResult({ status: "nope" });
    r.attachRoot(root);
    assert.equal(root.getAttribute("data-status"), "info");
    r.destroy(); teardownDOM();
});

test("all valid statuses accepted", () => {
    for (const s of ["success", "error", "warning", "info", "empty", "404", "403", "500"]) {
        const root = setup();
        const r = createResult({ status: s });
        r.attachRoot(root);
        assert.equal(root.getAttribute("data-status"), s);
        r.destroy(); teardownDOM();
    }
});

test("attachIcon paints aria-hidden=true + data-result-icon", () => {
    const root = setup();
    const icon = document.createElement("span");
    const r = createResult({});
    r.attachRoot(root);
    r.attachIcon(icon);
    assert.equal(icon.hasAttribute("data-result-icon"), true);
    assert.equal(icon.getAttribute("aria-hidden"), "true");
    r.destroy(); teardownDOM();
});

test("attachTitle + attachSubtitle paint slot markers", () => {
    const root = setup();
    const t = document.createElement("h2");
    const s = document.createElement("p");
    const r = createResult({});
    r.attachRoot(root);
    r.attachTitle(t);
    r.attachSubtitle(s);
    assert.equal(t.hasAttribute("data-result-title"), true);
    assert.equal(s.hasAttribute("data-result-subtitle"), true);
    r.destroy(); teardownDOM();
});

test("attachActions paints role=group + data-result-actions", () => {
    const root = setup();
    const a = document.createElement("div");
    const r = createResult({});
    r.attachRoot(root);
    r.attachActions(a);
    assert.equal(a.getAttribute("role"), "group");
    assert.equal(a.hasAttribute("data-result-actions"), true);
    r.destroy(); teardownDOM();
});

test("destroy clears attrs + is idempotent", () => {
    const root = setup();
    const icon = document.createElement("span");
    const r = createResult({ status: "success" });
    r.attachRoot(root);
    r.attachIcon(icon);
    r.destroy(); r.destroy();
    assert.equal(r.destroyed, true);
    assert.equal(root.hasAttribute("data-result-root"), false);
    assert.equal(icon.hasAttribute("data-result-icon"), false);
    teardownDOM();
});
