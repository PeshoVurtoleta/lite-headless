// carousel.test.js -- createCarousel end-to-end (imperative API + ARIA)
//
// Scroll-driven index detection (IntersectionObserver path + fast-path
// rAF scrollLeft math) is tested in test-browser/carousel.spec.js with
// a real chromium. Here we focus on:
//   - imperative API (go/next/prev/first/last, with and without loop)
//   - autoplay state machine (play/pause/toggle, hover/focus pause)
//   - ARIA painting (slide labels with "N of M", indicator state,
//     play/pause button label, viewport aria-live mode)
//   - attach/detach lifecycle (idempotent destroy, label repaint on
//     slide add/remove)

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchClick } from "./_setup.js";
import { createCarousel } from "../src/carousel/index.js";

function mkScene(opts = {}) {
    const slideCount = opts.slideCount || 3;
    const root = document.createElement("section");
    const viewport = document.createElement("div");
    const slides = [];
    for (let i = 0; i < slideCount; i++) {
        const s = document.createElement("div");
        s.textContent = `Slide ${i + 1}`;
        viewport.appendChild(s);
        slides.push(s);
    }
    root.appendChild(viewport);
    document.body.appendChild(root);
    return { root, viewport, slides };
}

// -----------------------------------------------------------------
// Construction
// -----------------------------------------------------------------

test("createCarousel rejects invalid orientation", () => {
    setupDOM();
    assert.throws(() => createCarousel({ orientation: "diagonal" }),
        /orientation must be/);
    teardownDOM();
});

test("createCarousel rejects invalid autoplay value", () => {
    setupDOM();
    assert.throws(() => createCarousel({ autoplay: 0 }), /autoplay must be a positive/);
    assert.throws(() => createCarousel({ autoplay: -1 }), /autoplay must be a positive/);
    assert.throws(() => createCarousel({ autoplay: NaN }), /autoplay must be a positive/);
    teardownDOM();
});

test("createCarousel default state", () => {
    setupDOM();
    const c = createCarousel();
    assert.equal(c.index(), 0);
    assert.equal(c.slideCount(), 0);
    assert.equal(c.isPlaying(), false, "no autoplay -> not playing");
    assert.equal(c.destroyed, false);
    c.destroy();
    teardownDOM();
});

test("createCarousel with autoplay starts playing", () => {
    setupDOM();
    const c = createCarousel({ autoplay: 1000 });
    assert.equal(c.isPlaying(), true);
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// attach lifecycle
// -----------------------------------------------------------------

test("attachRoot writes role + aria-roledescription + data-orientation", () => {
    setupDOM();
    const { root } = mkScene();
    const c = createCarousel();
    c.attachRoot(root, { label: "Featured products" });
    assert.equal(root.getAttribute("role"), "region");
    assert.equal(root.getAttribute("aria-roledescription"), "carousel");
    assert.equal(root.getAttribute("aria-label"), "Featured products");
    assert.equal(root.getAttribute("data-orientation"), "horizontal");
    c.destroy();
    teardownDOM();
});

test("attachRoot returns a cleanup that detaches the root", () => {
    setupDOM();
    const { root } = mkScene();
    const c = createCarousel();
    const off = c.attachRoot(root);
    // The role attribute is set; the off() doesn't strip it (consumer
    // owns the DOM), but internally the carousel disowns it. We can
    // verify by attaching a different root.
    off();
    const root2 = document.createElement("section");
    document.body.appendChild(root2);
    c.attachRoot(root2);
    assert.equal(root2.getAttribute("role"), "region");
    c.destroy();
    teardownDOM();
});

test("attachSlide tags element with role + aria-roledescription + label", () => {
    setupDOM();
    const { viewport, slides } = mkScene();
    const c = createCarousel();
    c.attachViewport(viewport);
    c.attachSlide(slides[0], 0);
    c.attachSlide(slides[1], 1);
    c.attachSlide(slides[2], 2);
    assert.equal(slides[0].getAttribute("role"), "group");
    assert.equal(slides[0].getAttribute("aria-roledescription"), "slide");
    assert.equal(slides[0].getAttribute("aria-label"), "1 of 3");
    assert.equal(slides[1].getAttribute("aria-label"), "2 of 3");
    assert.equal(slides[2].getAttribute("aria-label"), "3 of 3");
    c.destroy();
    teardownDOM();
});

test("attachSlide with custom label includes both label + position", () => {
    setupDOM();
    const { viewport, slides } = mkScene({ slideCount: 2 });
    const c = createCarousel();
    c.attachViewport(viewport);
    c.attachSlide(slides[0], 0, { label: "Mountain landscape" });
    c.attachSlide(slides[1], 1, { label: "Beach sunset" });
    assert.equal(slides[0].getAttribute("aria-label"), "Mountain landscape (1 of 2)");
    assert.equal(slides[1].getAttribute("aria-label"), "Beach sunset (2 of 2)");
    c.destroy();
    teardownDOM();
});

test("attachSlide rejects non-integer / negative index", () => {
    setupDOM();
    const { slides } = mkScene();
    const c = createCarousel();
    assert.throws(() => c.attachSlide(slides[0], -1), /non-negative/);
    assert.throws(() => c.attachSlide(slides[0], 1.5), /non-negative/);
    assert.throws(() => c.attachSlide(slides[0], "foo"), /non-negative/);
    c.destroy();
    teardownDOM();
});

test("detaching a slide repaints sibling labels (4 of 5 -> 4 of 4)", () => {
    setupDOM();
    const { viewport, slides: rawSlides } = mkScene({ slideCount: 5 });
    const c = createCarousel();
    c.attachViewport(viewport);
    const offs = rawSlides.map((s, i) => c.attachSlide(s, i));
    assert.equal(rawSlides[3].getAttribute("aria-label"), "4 of 5");
    // detach slide #4 (the last)
    offs[4]();
    assert.equal(c.slideCount(), 4);
    assert.equal(rawSlides[3].getAttribute("aria-label"), "4 of 4");
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Imperative navigation
// -----------------------------------------------------------------

function buildPopulated(opts = {}) {
    const scene = mkScene({ slideCount: opts.slideCount || 5 });
    const c = createCarousel(opts);
    c.attachRoot(scene.root);
    c.attachViewport(scene.viewport);
    scene.slides.forEach((s, i) => c.attachSlide(s, i));
    return { c, ...scene };
}

test("go(N) updates index and fires onIndexChange", () => {
    setupDOM();
    const calls = [];
    const { c } = buildPopulated({ onIndexChange: (i, r) => calls.push([i, r]) });
    c.go(3);
    assert.equal(c.index(), 3);
    assert.deepEqual(calls, [[3, "go"]]);
    c.destroy();
    teardownDOM();
});

test("go(N) clamps out-of-range when loop is false", () => {
    setupDOM();
    const { c } = buildPopulated({ slideCount: 5 });
    c.go(99);
    assert.equal(c.index(), 4, "clamped to last");
    c.go(-3);
    assert.equal(c.index(), 0, "clamped to first");
    c.destroy();
    teardownDOM();
});

test("go(N) wraps when loop is true", () => {
    setupDOM();
    const { c } = buildPopulated({ slideCount: 4, loop: true });
    c.go(5);
    assert.equal(c.index(), 1, "5 mod 4 = 1");
    c.go(-1);
    assert.equal(c.index(), 3, "-1 wraps to 3");
    c.go(-5);
    assert.equal(c.index(), 3, "-5 mod 4 = 3 (handles negatives)");
    c.destroy();
    teardownDOM();
});

test("next() advances by 1", () => {
    setupDOM();
    const { c } = buildPopulated();
    c.next(); c.next();
    assert.equal(c.index(), 2);
    c.destroy();
    teardownDOM();
});

test("prev() goes back by 1", () => {
    setupDOM();
    const { c } = buildPopulated();
    c.go(3);
    c.prev();
    assert.equal(c.index(), 2);
    c.destroy();
    teardownDOM();
});

test("next() at end stops (no loop)", () => {
    setupDOM();
    const { c } = buildPopulated({ slideCount: 3, loop: false });
    c.go(2);
    c.next();
    assert.equal(c.index(), 2, "stayed at last");
    c.destroy();
    teardownDOM();
});

test("next() at end wraps (loop)", () => {
    setupDOM();
    const { c } = buildPopulated({ slideCount: 3, loop: true });
    c.go(2);
    c.next();
    assert.equal(c.index(), 0);
    c.destroy();
    teardownDOM();
});

test("first()/last() jump to ends", () => {
    setupDOM();
    const { c } = buildPopulated();
    c.go(2);
    c.last();
    assert.equal(c.index(), 4);
    c.first();
    assert.equal(c.index(), 0);
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Indicators + paint
// -----------------------------------------------------------------

test("indicators paint aria-selected + data-active on index change", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ slideCount: 4 });
    const inds = [];
    for (let i = 0; i < 4; i++) {
        const el = document.createElement("button");
        viewport.appendChild(el);
        c.attachIndicator(el, i);
        inds.push(el);
    }
    // initial: index 0
    assert.equal(inds[0].getAttribute("aria-selected"), "true");
    assert.equal(inds[0].hasAttribute("data-active"), true);
    assert.equal(inds[1].getAttribute("aria-selected"), "false");
    // navigate
    c.go(2);
    assert.equal(inds[0].getAttribute("aria-selected"), "false");
    assert.equal(inds[2].getAttribute("aria-selected"), "true");
    assert.equal(inds[2].hasAttribute("data-active"), true);
    c.destroy();
    teardownDOM();
});

test("indicators get tabindex roving (current is 0, rest are -1)", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ slideCount: 3 });
    const inds = [0, 1, 2].map(i => {
        const el = document.createElement("button");
        viewport.appendChild(el);
        c.attachIndicator(el, i);
        return el;
    });
    assert.equal(inds[0].getAttribute("tabindex"), "0");
    assert.equal(inds[1].getAttribute("tabindex"), "-1");
    c.go(1);
    assert.equal(inds[0].getAttribute("tabindex"), "-1");
    assert.equal(inds[1].getAttribute("tabindex"), "0");
    c.destroy();
    teardownDOM();
});

test("slide data-active toggles", () => {
    setupDOM();
    const { c, slides } = buildPopulated();
    assert.equal(slides[0].hasAttribute("data-active"), true);
    assert.equal(slides[1].hasAttribute("data-active"), false);
    c.go(2);
    assert.equal(slides[0].hasAttribute("data-active"), false);
    assert.equal(slides[2].hasAttribute("data-active"), true);
    c.destroy();
    teardownDOM();
});

test("indicator click calls go(index)", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ slideCount: 4 });
    const inds = [0, 1, 2, 3].map(i => {
        const el = document.createElement("button");
        viewport.appendChild(el);
        c.attachIndicator(el, i);
        return el;
    });
    dispatchClick(inds[2]);
    assert.equal(c.index(), 2);
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Prev/Next buttons
// -----------------------------------------------------------------

test("attachNext + click advances; attachPrev + click goes back", () => {
    setupDOM();
    const { c, viewport } = buildPopulated();
    const prevBtn = document.createElement("button");
    const nextBtn = document.createElement("button");
    viewport.appendChild(prevBtn);
    viewport.appendChild(nextBtn);
    c.attachPrev(prevBtn);
    c.attachNext(nextBtn);

    dispatchClick(nextBtn);
    dispatchClick(nextBtn);
    assert.equal(c.index(), 2);
    dispatchClick(prevBtn);
    assert.equal(c.index(), 1);
    c.destroy();
    teardownDOM();
});

test("attachNext writes default aria-label and aria-controls", () => {
    setupDOM();
    const { c, viewport } = buildPopulated();
    const next = document.createElement("button");
    viewport.appendChild(next);
    c.attachNext(next);
    assert.equal(next.getAttribute("aria-label"), "Next Slide");
    assert.equal(next.getAttribute("aria-controls"), viewport.id);
    c.destroy();
    teardownDOM();
});

test("attachNext preserves consumer-provided aria-label", () => {
    setupDOM();
    const { c, viewport } = buildPopulated();
    const next = document.createElement("button");
    next.setAttribute("aria-label", "Show next product");
    viewport.appendChild(next);
    c.attachNext(next);
    assert.equal(next.getAttribute("aria-label"), "Show next product");
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Autoplay
// -----------------------------------------------------------------

test("play/pause/toggle update isPlaying", () => {
    setupDOM();
    const { c } = buildPopulated({ autoplay: 1000 });
    assert.equal(c.isPlaying(), true);
    c.pause();
    assert.equal(c.isPlaying(), false);
    c.play();
    assert.equal(c.isPlaying(), true);
    c.toggle();
    assert.equal(c.isPlaying(), false);
    c.destroy();
    teardownDOM();
});

test("play/pause fire onPlayingChange with reasons", () => {
    setupDOM();
    const calls = [];
    const { c } = buildPopulated({ autoplay: 1000, onPlayingChange: (p, r) => calls.push([p, r]) });
    c.pause("user-toggle");
    c.play("user-toggle");
    assert.deepEqual(calls, [[false, "user-toggle"], [true, "user-toggle"]]);
    c.destroy();
    teardownDOM();
});

test("play() is a no-op when autoplay was not configured", () => {
    setupDOM();
    const { c } = buildPopulated({ autoplay: null });
    c.play();
    assert.equal(c.isPlaying(), false);
    c.destroy();
    teardownDOM();
});

test("attachPlayPause paints aria-pressed + aria-label reactively", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ autoplay: 1000 });
    const btn = document.createElement("button");
    viewport.appendChild(btn);
    c.attachPlayPause(btn);
    assert.equal(btn.getAttribute("aria-pressed"), "true");
    assert.equal(btn.getAttribute("aria-label"), "Pause carousel");
    assert.equal(btn.hasAttribute("data-playing"), true);
    c.pause();
    assert.equal(btn.getAttribute("aria-pressed"), "false");
    assert.equal(btn.getAttribute("aria-label"), "Play carousel");
    assert.equal(btn.hasAttribute("data-playing"), false);
    c.destroy();
    teardownDOM();
});

test("attachPlayPause click toggles play state", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ autoplay: 1000 });
    const btn = document.createElement("button");
    viewport.appendChild(btn);
    c.attachPlayPause(btn);
    assert.equal(c.isPlaying(), true);
    dispatchClick(btn);
    assert.equal(c.isPlaying(), false);
    dispatchClick(btn);
    assert.equal(c.isPlaying(), true);
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// aria-live on viewport
// -----------------------------------------------------------------

test("viewport aria-live = 'off' when playing, 'polite' when paused", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ autoplay: 1000 });
    // initial: playing -> off
    assert.equal(viewport.getAttribute("aria-live"), "off");
    c.pause();
    assert.equal(viewport.getAttribute("aria-live"), "polite");
    c.destroy();
    teardownDOM();
});

test("viewport aria-live = 'polite' when not autoplaying at all", () => {
    setupDOM();
    const { c, viewport } = buildPopulated({ autoplay: null });
    assert.equal(viewport.getAttribute("aria-live"), "polite");
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Destroy
// -----------------------------------------------------------------

test("destroy() is idempotent", () => {
    setupDOM();
    const { c } = buildPopulated();
    c.destroy();
    assert.equal(c.destroyed, true);
    c.destroy(); // should not throw
    teardownDOM();
});

test("destroy() stops further mutations", () => {
    setupDOM();
    const calls = [];
    const { c } = buildPopulated({ onIndexChange: (i) => calls.push(i) });
    c.go(2);
    c.destroy();
    c.go(3); // should be no-op
    assert.deepEqual(calls, [2], "no further callbacks after destroy");
    teardownDOM();
});

// -----------------------------------------------------------------
// onIndexChange contract
// -----------------------------------------------------------------

test("onIndexChange skipped when commit is to current index", () => {
    setupDOM();
    const calls = [];
    const { c } = buildPopulated({ onIndexChange: (i) => calls.push(i) });
    c.go(2);
    c.go(2); // same -> no call
    assert.deepEqual(calls, [2]);
    c.destroy();
    teardownDOM();
});

test("onIndexChange errors swallowed (don't break navigation)", () => {
    setupDOM();
    const { c } = buildPopulated({ onIndexChange: () => { throw new Error("boom"); } });
    c.go(2); // should not throw
    assert.equal(c.index(), 2);
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Reactive accessors
// -----------------------------------------------------------------

test("index() returns signal getter that updates with commits", async () => {
    setupDOM();
    const { c } = buildPopulated();
    const seen = [];
    const { effect } = await import("@zakkster/lite-signal");
    const stop = effect(() => seen.push(c.index()));
    c.go(2);
    c.go(1);
    assert.deepEqual(seen, [0, 2, 1], "tracks current index reactively");
    stop();
    c.destroy();
    teardownDOM();
});

test("playing() returns signal getter that updates with play/pause", async () => {
    setupDOM();
    const { c } = buildPopulated({ autoplay: 1000 });
    const seen = [];
    const { effect } = await import("@zakkster/lite-signal");
    const stop = effect(() => seen.push(c.playing()));
    c.pause();
    c.play();
    assert.deepEqual(seen, [true, false, true]);
    stop();
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Vertical orientation
// -----------------------------------------------------------------

test("orientation: 'vertical' writes data-orientation correctly", () => {
    setupDOM();
    const { root } = mkScene();
    const c = createCarousel({ orientation: "vertical" });
    c.attachRoot(root);
    assert.equal(root.getAttribute("data-orientation"), "vertical");
    c.destroy();
    teardownDOM();
});

// -----------------------------------------------------------------
// Regression: multi-click guard against same-target spam
// -----------------------------------------------------------------
// Before v0.7.20, rapid go() calls all fired scrollTo (potentially
// canceling each other mid-flight and interacting badly with
// scroll-snap-type:mandatory). The guard now ignores calls to
// go(sameTarget) within the scroll-lock window.

test("multi-click: go(same target) within scroll-lock window is ignored", () => {
    setupDOM();
    const { root, viewport, slides } = mkScene({ slideCount: 5 });
    // Track scrollTo calls — we want to see exactly ONE per distinct target
    let scrollCalls = 0;
    viewport.scrollTo = function() { scrollCalls++; };
    const c = createCarousel();
    c.attachRoot(root);
    c.attachViewport(viewport);
    for (let i = 0; i < 5; i++) c.attachSlide(slides[i], i);
    scrollCalls = 0;        // discard attach-time setup calls

    // 5 rapid go(2) calls — all should funnel into a single scrollTo
    c.go(2); c.go(2); c.go(2); c.go(2); c.go(2);
    assert.equal(scrollCalls, 1,
        "5 identical go() calls within lock window -> 1 scrollTo");
    assert.equal(c.index(), 2, "index commits correctly");

    // Different target IS allowed within the window (UX: user
    // changed their mind mid-scroll, should respect that)
    c.go(3);
    assert.equal(scrollCalls, 2,
        "go(differentTarget) within window -> NEW scrollTo");
    assert.equal(c.index(), 3);

    c.destroy();
    teardownDOM();
});

test("multi-click: rapid next() advances cumulatively (not guarded by lock)", () => {
    setupDOM();
    const { root, viewport, slides } = mkScene({ slideCount: 5 });
    viewport.scrollTo = () => {};         // stub so no real scroll
    const c = createCarousel();
    c.attachRoot(root);
    c.attachViewport(viewport);
    for (let i = 0; i < 5; i++) c.attachSlide(slides[i], i);

    // rapid next() calls — each targets a DIFFERENT slide, so the guard
    // doesn't kick in. All four advances should happen.
    c.next(); c.next(); c.next(); c.next();
    assert.equal(c.index(), 4,
        "4 rapid next() calls advance to index 4");

    c.destroy();
    teardownDOM();
});
