// avatar.test.js -- createAvatar + initials algorithm + color hash

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createAvatar, deriveInitials, hueFromString } from "../src/avatar/index.js";

function mkSpan() {
    const el = document.createElement("span");
    document.body.appendChild(el);
    return el;
}

// -----------------------------------------------------------------
// deriveInitials algorithm
// -----------------------------------------------------------------

test("deriveInitials: two-word names", () => {
    assert.equal(deriveInitials("Alice Lee"), "AL");
    assert.equal(deriveInitials("Zahary Shinikchiev"), "ZS");
    assert.equal(deriveInitials("Marie Curie"), "MC");
});

test("deriveInitials: hyphenated treated as word break", () => {
    assert.equal(deriveInitials("Jean-Paul Sartre"), "JS");
    assert.equal(deriveInitials("Mary-Anne"), "MA");
});

test("deriveInitials: dot and underscore as word breaks", () => {
    assert.equal(deriveInitials("M. Curie"), "MC");
    assert.equal(deriveInitials("john_doe"), "JD");
});

test("deriveInitials: single-word names get one letter", () => {
    assert.equal(deriveInitials("Cher"), "C");
    assert.equal(deriveInitials("Madonna"), "M");
});

test("deriveInitials: no word breaks (email-like) takes first two letters", () => {
    assert.equal(deriveInitials("john@example.com"), "JO");
    assert.equal(deriveInitials("zakkster"), "ZA");
});

test("deriveInitials: empty / nullish falls back to '?'", () => {
    assert.equal(deriveInitials(""), "?");
    assert.equal(deriveInitials("   "), "?");
    assert.equal(deriveInitials(null), "?");
    assert.equal(deriveInitials(undefined), "?");
});

test("deriveInitials: extra whitespace doesn't pollute output", () => {
    assert.equal(deriveInitials("  Alice  Lee  "), "AL");
});

test("deriveInitials: many words takes first + last", () => {
    assert.equal(deriveInitials("Jean-Claude Van Damme"), "JD");
    assert.equal(deriveInitials("Dr. Martin Luther King Jr."), "DJ");
});

// -----------------------------------------------------------------
// hueFromString deterministic hash
// -----------------------------------------------------------------

test("hueFromString returns 0..359", () => {
    for (const s of ["alice", "bob", "carol", "", "x", "ZS"]) {
        const h = hueFromString(s);
        assert.ok(h >= 0 && h < 360, `out of range for "${s}": ${h}`);
        assert.ok(Number.isInteger(h));
    }
});

test("hueFromString is deterministic (same input -> same hue)", () => {
    assert.equal(hueFromString("alice"), hueFromString("alice"));
    assert.equal(hueFromString("zahary shinikchiev"), hueFromString("zahary shinikchiev"));
});

test("hueFromString varies across inputs (no collision for these samples)", () => {
    const samples = ["alice", "bob", "carol", "dave", "eve"];
    const hues = samples.map(hueFromString);
    const unique = new Set(hues);
    // 5 names should produce at least 4 distinct hues
    assert.ok(unique.size >= 4, `expected variety, got ${unique.size}: ${hues}`);
});

// -----------------------------------------------------------------
// createAvatar
// -----------------------------------------------------------------

test("createAvatar with no src starts in fallback state", () => {
    setupDOM();
    const a = createAvatar({ name: "Alice" });
    assert.equal(a.state(), "fallback");
    a.destroy();
    teardownDOM();
});

test("createAvatar with src starts in 'loading' state (not image yet)", () => {
    setupDOM();
    const a = createAvatar({ src: "user.jpg", name: "Alice" });
    // Internal "loading" state — data-loaded is absent during both load and fallback
    // until load succeeds
    assert.equal(a.state(), "loading");
    a.destroy();
    teardownDOM();
});

test("createAvatar exposes derived initials + hue", () => {
    setupDOM();
    const a = createAvatar({ name: "Alice Lee" });
    assert.equal(a.initials(), "AL");
    assert.equal(typeof a.colorHash(), "number");
    a.destroy();
    teardownDOM();
});

test("createAvatar respects initials override", () => {
    setupDOM();
    const a = createAvatar({ name: "Alice Lee", initials: "🙂" });   // not ASCII but allowed in initials override
    assert.equal(a.initials(), "🙂");
    a.destroy();
    teardownDOM();
});

test("attachRoot sets data-loaded + role + aria-label", () => {
    setupDOM();
    const root = mkSpan();
    const a = createAvatar({ name: "Alice Lee" });
    a.attachRoot(root);
    assert.equal(root.getAttribute("role"), "img");
    assert.equal(root.getAttribute("aria-label"), "Alice Lee");
    assert.equal(root.hasAttribute("data-loaded"), false);
    a.destroy();
    teardownDOM();
});

test("attachFallback paints data-initials + data-color-hue + --hue", () => {
    setupDOM();
    const fb = mkSpan();
    const a = createAvatar({ name: "Alice Lee" });
    a.attachFallback(fb);
    assert.equal(fb.getAttribute("data-initials"), "AL");
    const hue = a.colorHash();
    assert.equal(fb.getAttribute("data-color-hue"), String(hue));
    assert.equal(fb.getAttribute("aria-hidden"), "true");
    assert.equal(fb.style.getPropertyValue("--hue"), String(hue));
    a.destroy();
    teardownDOM();
});

test("attachImage rejects non-img", () => {
    setupDOM();
    const a = createAvatar({ name: "Alice" });
    assert.throws(() => a.attachImage(document.createElement("div")), /must be an <img>/);
    a.destroy();
    teardownDOM();
});

test("attachImage sets decoding=async + loading=lazy + alt", () => {
    setupDOM();
    const img = document.createElement("img");
    const a = createAvatar({ src: "user.jpg", name: "Alice Lee" });
    a.attachImage(img);
    assert.equal(img.getAttribute("decoding"), "async");
    assert.equal(img.getAttribute("loading"), "lazy");
    assert.equal(img.getAttribute("alt"), "Alice Lee");
    a.destroy();
    teardownDOM();
});

test("image load event transitions to 'image' state", () => {
    setupDOM();
    const root = mkSpan();
    const img = document.createElement("img");
    const a = createAvatar({ src: "user.jpg", name: "Alice Lee" });
    a.attachRoot(root);
    a.attachImage(img);
    img.dispatchEvent(new window.Event("load"));
    assert.equal(a.state(), "image");
    assert.equal(root.hasAttribute("data-loaded"), true);
    a.destroy();
    teardownDOM();
});

test("image error falls back without delay (default)", () => {
    setupDOM();
    const root = mkSpan();
    const img = document.createElement("img");
    const fb = mkSpan();
    const a = createAvatar({ src: "user.jpg", name: "Alice Lee" });
    a.attachRoot(root);
    a.attachImage(img);
    a.attachFallback(fb);
    img.dispatchEvent(new window.Event("error"));
    assert.equal(a.state(), "fallback");
    assert.equal(root.hasAttribute("data-loaded"), false);
    a.destroy();
    teardownDOM();
});

test("image error with fallbackDelay defers the swap", async () => {
    setupDOM();
    const root = mkSpan();
    const img = document.createElement("img");
    const a = createAvatar({ src: "user.jpg", name: "Alice", fallbackDelay: 50 });
    a.attachRoot(root);
    a.attachImage(img);
    img.dispatchEvent(new window.Event("error"));
    // Not yet fallback
    assert.equal(a.state(), "loading");
    await new Promise(r => setTimeout(r, 80));
    assert.equal(a.state(), "fallback");
    a.destroy();
    teardownDOM();
});

test("img hidden when in fallback; fallback hidden when in image", () => {
    setupDOM();
    const img = document.createElement("img");
    const fb = mkSpan();
    const a = createAvatar({ src: "user.jpg", name: "Alice" });
    a.attachImage(img);
    a.attachFallback(fb);
    // initial: loading -> not image -> img hidden, fb visible
    assert.equal(img.hasAttribute("hidden"), true);
    assert.equal(fb.hasAttribute("hidden"), false);
    // load: image -> img visible, fb hidden
    img.dispatchEvent(new window.Event("load"));
    assert.equal(img.hasAttribute("hidden"), false);
    assert.equal(fb.hasAttribute("hidden"), true);
    a.destroy();
    teardownDOM();
});

test("setSrc changes the source and re-enters loading", () => {
    setupDOM();
    const img = document.createElement("img");
    const a = createAvatar({ name: "Alice" });
    a.attachImage(img);
    a.setSrc("new.jpg");
    assert.equal(a.state(), "loading");
    assert.ok(img.src.endsWith("new.jpg"));
    a.destroy();
    teardownDOM();
});

test("setSrc(null) goes to fallback", () => {
    setupDOM();
    const img = document.createElement("img");
    const a = createAvatar({ src: "user.jpg", name: "Alice" });
    a.attachImage(img);
    a.setSrc(null);
    assert.equal(a.state(), "fallback");
    a.destroy();
    teardownDOM();
});

test("destroy() removes attributes from all attached elements", () => {
    setupDOM();
    const root = mkSpan();
    const img = document.createElement("img");
    const fb = mkSpan();
    const a = createAvatar({ src: "user.jpg", name: "Alice" });
    a.attachRoot(root);
    a.attachImage(img);
    a.attachFallback(fb);
    a.destroy();
    assert.equal(a.destroyed, true);
    assert.equal(root.hasAttribute("data-loaded"), false);
    assert.equal(fb.hasAttribute("data-initials"), false);
    assert.equal(fb.hasAttribute("data-color-hue"), false);
    assert.equal(fb.style.getPropertyValue("--hue"), "");
    teardownDOM();
});

test("destroy() is idempotent", () => {
    setupDOM();
    const a = createAvatar({ name: "Alice" });
    a.destroy();
    a.destroy();
    assert.equal(a.destroyed, true);
    teardownDOM();
});
