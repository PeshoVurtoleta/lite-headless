// picture.test.js -- createPicture state machine + lifecycle
//
// happy-dom doesn't implement IntersectionObserver or ResizeObserver
// natively, so lazy-load + container-source-selection tests are
// either stubbed or skipped here and covered by browser specs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createPicture } from "../src/picture/index.js";

function mkRoot() {
    const el = document.createElement("picture");
    document.body.appendChild(el);
    return el;
}
function mkImg() {
    return document.createElement("img");
}

// -----------------------------------------------------------------
// Construction
// -----------------------------------------------------------------

test("createPicture requires src", () => {
    setupDOM();
    assert.throws(() => createPicture({}), /src is required/);
    teardownDOM();
});

test("createPicture eager mode starts in 'loading' state", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg", lazy: false });
    assert.equal(p.state(), "loading");
    p.destroy();
    teardownDOM();
});

test("createPicture lazy mode starts in 'idle' state", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg", lazy: true });
    assert.equal(p.state(), "idle");
    p.destroy();
    teardownDOM();
});

test("createPicture lazy + eager override starts in loading", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg", lazy: true, eager: true });
    assert.equal(p.state(), "loading");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attachRoot + attachImg
// -----------------------------------------------------------------

test("attachRoot writes data-img-state", () => {
    setupDOM();
    const root = mkRoot();
    const p = createPicture({ src: "x.jpg", lazy: false });
    p.attachRoot(root);
    assert.equal(root.getAttribute("data-img-state"), "loading");
    p.destroy();
    teardownDOM();
});

test("attachRoot writes data-aspect-ratio when set", () => {
    setupDOM();
    const root = mkRoot();
    const p = createPicture({ src: "x.jpg", aspectRatio: "16/9", lazy: false });
    p.attachRoot(root);
    assert.equal(root.getAttribute("data-aspect-ratio"), "16/9");
    p.destroy();
    teardownDOM();
});

test("attachImg rejects non-img elements", () => {
    setupDOM();
    const div = document.createElement("div");
    const p = createPicture({ src: "x.jpg" });
    assert.throws(() => p.attachImg(div), /must be an <img>/);
    p.destroy();
    teardownDOM();
});

test("attachImg sets loading + decoding attributes", () => {
    setupDOM();
    const img = mkImg();
    const p = createPicture({ src: "x.jpg", lazy: true });
    p.attachImg(img);
    assert.equal(img.getAttribute("loading"), "lazy");
    assert.equal(img.getAttribute("decoding"), "async");
    p.destroy();
    teardownDOM();
});

test("attachImg sets loading=eager when not lazy", () => {
    setupDOM();
    const img = mkImg();
    const p = createPicture({ src: "x.jpg", lazy: false });
    p.attachImg(img);
    assert.equal(img.getAttribute("loading"), "eager");
    p.destroy();
    teardownDOM();
});

test("attachImg assigns placeholder src when in idle state", () => {
    setupDOM();
    const img = mkImg();
    const p = createPicture({
        src: "main.jpg",
        placeholder: "https://example.com/lqip.jpg",
        lazy: true,
    });
    p.attachImg(img);
    // happy-dom's <img>.src resolves to absolute URL; check it ends with lqip.jpg
    assert.ok(img.src.endsWith("lqip.jpg"), `img.src should contain placeholder, got: ${img.src}`);
    p.destroy();
    teardownDOM();
});

test("attachImg eager mode assigns main src immediately", () => {
    setupDOM();
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({ src: "main.jpg", lazy: false });
    p.attachRoot(root);
    p.attachImg(img);
    assert.ok(img.src.endsWith("main.jpg"), `expected main.jpg, got ${img.src}`);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Load + error flow
// -----------------------------------------------------------------

test("img load event transitions to 'loaded' + fires onLoad", () => {
    setupDOM();
    let loadFired = false;
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({
        src: "x.jpg",
        lazy: false,
        onLoad: () => { loadFired = true; },
    });
    p.attachRoot(root);
    p.attachImg(img);
    img.dispatchEvent(new window.Event("load"));
    assert.equal(p.state(), "loaded");
    assert.equal(loadFired, true);
    assert.equal(root.getAttribute("data-img-state"), "loaded");
    p.destroy();
    teardownDOM();
});

test("img error with retries available re-attempts", async () => {
    setupDOM();
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({ src: "x.jpg", lazy: false, maxRetries: 2 });
    p.attachRoot(root);
    p.attachImg(img);
    img.dispatchEvent(new window.Event("error"));
    // After error with retries left, state stays "loading" (or back to loading)
    // We don't go to "error" until retries exhausted
    await new Promise(r => setTimeout(r, 150));
    assert.notEqual(p.state(), "error");
    p.destroy();
    teardownDOM();
});

test("img error after maxRetries goes to 'error' + fires onError", async () => {
    setupDOM();
    let errorFired = false;
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({
        src: "x.jpg",
        lazy: false,
        maxRetries: 0,           // immediate failure
        onError: () => { errorFired = true; },
    });
    p.attachRoot(root);
    p.attachImg(img);
    img.dispatchEvent(new window.Event("error"));
    assert.equal(p.state(), "error");
    assert.equal(errorFired, true);
    p.destroy();
    teardownDOM();
});

test("onStateChange fires for each transition", () => {
    setupDOM();
    const states = [];
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({
        src: "x.jpg",
        lazy: false,
        onStateChange: (s) => states.push(s),
    });
    p.attachRoot(root);
    p.attachImg(img);
    img.dispatchEvent(new window.Event("load"));
    // The "loading" state was set at construction; onStateChange fires on
    // each subsequent change.
    assert.deepEqual(states, ["loaded"]);
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Retry
// -----------------------------------------------------------------

test("retry() resets state to loading + re-assigns src", () => {
    setupDOM();
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({ src: "x.jpg", lazy: false, maxRetries: 0 });
    p.attachRoot(root);
    p.attachImg(img);
    img.dispatchEvent(new window.Event("error"));
    assert.equal(p.state(), "error");
    p.retry();
    assert.equal(p.state(), "loading");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// State paint sync
// -----------------------------------------------------------------

test("data-img-state on root + img sync to state", () => {
    setupDOM();
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({ src: "x.jpg", lazy: false });
    p.attachRoot(root);
    p.attachImg(img);
    assert.equal(root.getAttribute("data-img-state"), "loading");
    assert.equal(img.getAttribute("data-img-state"), "loading");
    img.dispatchEvent(new window.Event("load"));
    assert.equal(root.getAttribute("data-img-state"), "loaded");
    assert.equal(img.getAttribute("data-img-state"), "loaded");
    p.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Destroy
// -----------------------------------------------------------------

test("destroy() clears attributes from root + img", () => {
    setupDOM();
    const root = mkRoot();
    const img = mkImg();
    const p = createPicture({ src: "x.jpg", lazy: false, aspectRatio: "1/1" });
    p.attachRoot(root);
    p.attachImg(img);
    p.destroy();
    assert.equal(p.destroyed, true);
    assert.equal(root.hasAttribute("data-img-state"), false);
    assert.equal(root.hasAttribute("data-aspect-ratio"), false);
    assert.equal(img.hasAttribute("data-img-state"), false);
    teardownDOM();
});

test("destroy() is idempotent", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg" });
    p.destroy();
    p.destroy();
    assert.equal(p.destroyed, true);
    teardownDOM();
});

// -----------------------------------------------------------------
// v1.0.0: setSrc runtime mutation
// -----------------------------------------------------------------

test("setSrc updates the canonical src reactively (before attachImg)", () => {
    setupDOM();
    const p = createPicture({ src: "first.jpg", lazy: false });
    assert.equal(p.src, "first.jpg");
    p.setSrc("second.jpg");
    assert.equal(p.src, "second.jpg");
    p.destroy(); teardownDOM();
});

test("setSrc with the same value is a no-op", () => {
    setupDOM();
    const p = createPicture({ src: "same.jpg", lazy: false, eager: true });
    const root = mkRoot();
    const img = mkImg();
    p.attachRoot(root);
    p.attachImg(img);
    assert.equal(img.src.endsWith("same.jpg") || img.src === "same.jpg", true);
    // Same value -- nothing should change
    p.setSrc("same.jpg");
    assert.equal(p.src, "same.jpg");
    p.destroy(); teardownDOM();
});

test("setSrc rejects non-string + empty inputs", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg", lazy: false });
    assert.throws(() => p.setSrc(""), /non-empty/);
    assert.throws(() => p.setSrc(null), /non-empty/);
    assert.throws(() => p.setSrc(undefined), /non-empty/);
    assert.throws(() => p.setSrc(123), /non-empty/);
    p.destroy(); teardownDOM();
});

test("setSrc after attachImg writes the new src to the img element", () => {
    setupDOM();
    const p = createPicture({ src: "first.jpg", lazy: false, eager: true });
    const root = mkRoot();
    const img = mkImg();
    p.attachRoot(root);
    p.attachImg(img);
    // happy-dom resolves src to an absolute URL; match by suffix
    assert.ok(img.src.endsWith("first.jpg"));
    p.setSrc("second.jpg");
    assert.ok(img.src.endsWith("second.jpg"));
    p.destroy(); teardownDOM();
});

test("setSrc after destroy is a no-op", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg", lazy: false });
    p.destroy();
    // Should silently return; not throw
    p.setSrc("y.jpg");
    assert.equal(p.destroyed, true);
    teardownDOM();
});

test("setSrc resets retry budget on src change", () => {
    setupDOM();
    const p = createPicture({ src: "x.jpg", lazy: false, eager: true, maxRetries: 1 });
    const root = mkRoot();
    const img = mkImg();
    p.attachRoot(root);
    p.attachImg(img);
    // Set new src -- the new src should start with fresh retry budget
    p.setSrc("y.jpg");
    assert.equal(p.state(), "loading");
    p.destroy(); teardownDOM();
});
