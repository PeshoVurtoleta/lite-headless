// tag-input.test.js -- createTagInput state machine + delimiter handling
//                      + paste-split + backspace two-step + activeIndex.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createTagInput } from "../src/tag-input/index.js";

function mkRoot() {
    const el = document.createElement("div");
    document.body.appendChild(el);
    return el;
}
function mkInput() {
    const el = document.createElement("input");
    document.body.appendChild(el);
    return el;
}
function type(el, value) {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
}
function keydown(el, key, modifiers = {}) {
    const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers });
    el.dispatchEvent(ev);
    return ev;
}
function paste(el, text) {
    const ev = new Event("paste", { bubbles: true, cancelable: true });
    ev.clipboardData = { getData: (t) => (t === "text" || t === "text/plain") ? text : "" };
    el.dispatchEvent(ev);
    return ev;
}

// =====================================================================
// Construction + options
// =====================================================================

test("default options: empty tags, maxItems=Infinity, no duplicates", () => {
    setupDOM();
    const t = createTagInput();
    assert.deepEqual(t.tags(), []);
    assert.equal(t.count(), 0);
    assert.equal(t.canAddMore(), true);
    assert.equal(t.activeIndex(), -1);
    t.destroy();
    teardownDOM();
});

test("initialValue filtered through pipeline", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "  c  ", "a", ""] });
    // trim "  c  " -> "c"; dedupe "a"; drop empty
    assert.deepEqual(t.tags(), ["a", "b", "c"]);
    t.destroy();
    teardownDOM();
});

test("initialValue respects maxItems", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c", "d", "e"], maxItems: 3 });
    assert.deepEqual(t.tags(), ["a", "b", "c"]);
    t.destroy();
    teardownDOM();
});

test("non-array initialValue throws", () => {
    setupDOM();
    assert.throws(() => createTagInput({ initialValue: "abc" }), /must be an array/);
    teardownDOM();
});

// =====================================================================
// addTag pipeline
// =====================================================================

test("addTag adds a unique trimmed tag", () => {
    setupDOM();
    const t = createTagInput();
    assert.equal(t.addTag("  hello  "), true);
    assert.deepEqual(t.tags(), ["hello"]);
    t.destroy();
    teardownDOM();
});

test("addTag rejects empty after trim", () => {
    setupDOM();
    const invalidCalls = [];
    const t = createTagInput({ onInvalid: (v, r) => invalidCalls.push([v, r]) });
    assert.equal(t.addTag("   "), false);
    assert.deepEqual(invalidCalls, [["", "empty"]]);
    t.destroy();
    teardownDOM();
});

test("addTag rejects duplicate (default allowDuplicates=false)", () => {
    setupDOM();
    const invalidCalls = [];
    const t = createTagInput({ onInvalid: (v, r) => invalidCalls.push([v, r]) });
    t.addTag("hello");
    assert.equal(t.addTag("hello"), false);
    assert.deepEqual(invalidCalls, [["hello", "duplicate"]]);
    assert.deepEqual(t.tags(), ["hello"]);
    t.destroy();
    teardownDOM();
});

test("addTag allows duplicates when allowDuplicates=true", () => {
    setupDOM();
    const t = createTagInput({ allowDuplicates: true });
    t.addTag("hello");
    t.addTag("hello");
    assert.deepEqual(t.tags(), ["hello", "hello"]);
    t.destroy();
    teardownDOM();
});

test("addTag rejects when at maxItems", () => {
    setupDOM();
    const invalidCalls = [];
    const t = createTagInput({ maxItems: 2, onInvalid: (v, r) => invalidCalls.push([v, r]) });
    t.addTag("a");
    t.addTag("b");
    assert.equal(t.addTag("c"), false);
    assert.deepEqual(invalidCalls, [["c", "max-items"]]);
    assert.equal(t.canAddMore(), false);
    t.destroy();
    teardownDOM();
});

test("addTag runs validate; false rejects", () => {
    setupDOM();
    const invalidCalls = [];
    const t = createTagInput({
        validate: (s) => /^[a-z]+$/.test(s),
        onInvalid: (v, r) => invalidCalls.push([v, r]),
    });
    t.addTag("hello");
    assert.equal(t.addTag("HELLO"), false);
    assert.deepEqual(invalidCalls, [["HELLO", "validate"]]);
    t.destroy();
    teardownDOM();
});

test("addTag validate string return is forwarded as reason", () => {
    setupDOM();
    const invalidCalls = [];
    const t = createTagInput({
        validate: () => "not an email",
        onInvalid: (v, r) => invalidCalls.push([v, r]),
    });
    t.addTag("foo");
    assert.deepEqual(invalidCalls, [["foo", "not an email"]]);
    t.destroy();
    teardownDOM();
});

test("addTag applies normalize() before duplicate check", () => {
    setupDOM();
    const t = createTagInput({ normalize: (s) => s.toLowerCase() });
    t.addTag("Hello");
    assert.equal(t.addTag("HELLO"), false);    // duplicate after normalize
    assert.deepEqual(t.tags(), ["hello"]);
    t.destroy();
    teardownDOM();
});

test("addTag fires onAdd + onChange in order", () => {
    setupDOM();
    const order = [];
    const t = createTagInput({
        onAdd: (tag) => order.push("add:" + tag),
        onChange: (tags) => order.push("change:" + tags.join(",")),
    });
    t.addTag("x");
    assert.deepEqual(order, ["add:x", "change:x"]);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// removeTag / removeLast / clear
// =====================================================================

test("removeTag removes + fires onRemove + onChange", () => {
    setupDOM();
    const order = [];
    const t = createTagInput({
        initialValue: ["a", "b", "c"],
        onRemove: (tag, i) => order.push("remove:" + tag + "@" + i),
        onChange: (tags) => order.push("change:" + tags.join(",")),
    });
    t.removeTag(1);
    assert.deepEqual(t.tags(), ["a", "c"]);
    assert.deepEqual(order, ["remove:b@1", "change:a,c"]);
    t.destroy();
    teardownDOM();
});

test("removeTag with out-of-range index returns false", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a"] });
    assert.equal(t.removeTag(5), false);
    assert.equal(t.removeTag(-1), false);
    assert.deepEqual(t.tags(), ["a"]);
    t.destroy();
    teardownDOM();
});

test("removeLast", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b"] });
    assert.equal(t.removeLast(), true);
    assert.deepEqual(t.tags(), ["a"]);
    assert.equal(t.removeLast(), true);
    assert.equal(t.removeLast(), false);    // empty
    t.destroy();
    teardownDOM();
});

test("clear empties + fires onChange + resets activeIndex", () => {
    setupDOM();
    let changes = 0;
    const t = createTagInput({
        initialValue: ["a", "b"],
        onChange: () => changes++,
    });
    t.setActiveIndex(1);
    t.clear();
    assert.deepEqual(t.tags(), []);
    assert.equal(t.activeIndex(), -1);
    assert.equal(changes, 1);
    t.destroy();
    teardownDOM();
});

test("activeIndex shifts correctly when earlier tag is removed", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c"] });
    t.setActiveIndex(2);
    t.removeTag(0);
    // Removing index 0 -> ai (2) shifts down to 1
    assert.equal(t.activeIndex(), 1);
    assert.deepEqual(t.tags(), ["b", "c"]);
    t.destroy();
    teardownDOM();
});

test("activeIndex retreats when last is removed", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b"] });
    t.setActiveIndex(1);
    t.removeTag(1);
    assert.equal(t.activeIndex(), 0);
    t.removeTag(0);
    assert.equal(t.activeIndex(), -1);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// setTags
// =====================================================================

test("setTags runs full pipeline per item", () => {
    setupDOM();
    const t = createTagInput({ normalize: (s) => s.trim().toLowerCase() });
    t.setTags(["  A ", "B", "a"]);   // dedupe after normalize
    assert.deepEqual(t.tags(), ["a", "b"]);
    t.destroy();
    teardownDOM();
});

test("setTags non-array throws", () => {
    setupDOM();
    const t = createTagInput();
    assert.throws(() => t.setTags("x"), /must be an array/);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// Keyboard: delimiter commit
// =====================================================================

test("Enter commits current input as tag", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    type(input, "hello");
    const ev = keydown(input, "Enter");
    assert.equal(ev.defaultPrevented, true);
    assert.deepEqual(t.tags(), ["hello"]);
    assert.equal(input.value, "");
    t.destroy();
    teardownDOM();
});

test("Tab commits + preventDefault (so focus doesn't move)", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    type(input, "tab-tag");
    const ev = keydown(input, "Tab");
    assert.equal(ev.defaultPrevented, true);
    assert.deepEqual(t.tags(), ["tab-tag"]);
    t.destroy();
    teardownDOM();
});

test("Comma char key commits", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    type(input, "csv");
    const ev = keydown(input, ",");
    assert.equal(ev.defaultPrevented, true);
    assert.deepEqual(t.tags(), ["csv"]);
    t.destroy();
    teardownDOM();
});

test("Delimiter with EMPTY input does NOT commit", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    const ev = keydown(input, "Enter");
    assert.equal(ev.defaultPrevented, false);    // not handled by us
    assert.deepEqual(t.tags(), []);
    t.destroy();
    teardownDOM();
});

test("custom delimiters work", () => {
    setupDOM();
    const t = createTagInput({ delimiters: [";", "Enter"] });
    const input = mkInput();
    t.attachInput(input);
    type(input, "a");
    keydown(input, ";");
    assert.deepEqual(t.tags(), ["a"]);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// Keyboard: backspace two-step
// =====================================================================

test("Backspace with text passes through to browser", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["x"] });
    const input = mkInput();
    t.attachInput(input);
    type(input, "abc");
    const ev = keydown(input, "Backspace");
    assert.equal(ev.defaultPrevented, false);
    assert.deepEqual(t.tags(), ["x"]);
    t.destroy();
    teardownDOM();
});

test("Backspace on empty input activates last tag (first step)", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c"] });
    const input = mkInput();
    t.attachInput(input);
    const ev = keydown(input, "Backspace");
    assert.equal(ev.defaultPrevented, true);
    assert.equal(t.activeIndex(), 2);
    assert.deepEqual(t.tags(), ["a", "b", "c"]);    // not removed yet
    t.destroy();
    teardownDOM();
});

test("Backspace with active tag removes it (second step)", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c"] });
    const input = mkInput();
    t.attachInput(input);
    keydown(input, "Backspace");   // activates c
    keydown(input, "Backspace");   // removes c
    assert.deepEqual(t.tags(), ["a", "b"]);
    t.destroy();
    teardownDOM();
});

test("Backspace on empty input + no tags is a no-op", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    const ev = keydown(input, "Backspace");
    assert.equal(ev.defaultPrevented, false);
    t.destroy();
    teardownDOM();
});

test("Delete on active tag removes it", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b"] });
    const input = mkInput();
    t.attachInput(input);
    t.setActiveIndex(0);
    keydown(input, "Delete");
    assert.deepEqual(t.tags(), ["b"]);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// Keyboard: nav
// =====================================================================

test("ArrowLeft from input activates last", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c"] });
    const input = mkInput();
    t.attachInput(input);
    keydown(input, "ArrowLeft");
    assert.equal(t.activeIndex(), 2);
    t.destroy();
    teardownDOM();
});

test("ArrowLeft walks toward earlier tags", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c"] });
    const input = mkInput();
    t.attachInput(input);
    t.setActiveIndex(2);
    keydown(input, "ArrowLeft");
    assert.equal(t.activeIndex(), 1);
    keydown(input, "ArrowLeft");
    assert.equal(t.activeIndex(), 0);
    keydown(input, "ArrowLeft");    // stay at 0
    assert.equal(t.activeIndex(), 0);
    t.destroy();
    teardownDOM();
});

test("ArrowRight walks back toward input", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b"] });
    const input = mkInput();
    t.attachInput(input);
    t.setActiveIndex(0);
    keydown(input, "ArrowRight");
    assert.equal(t.activeIndex(), 1);
    keydown(input, "ArrowRight");
    assert.equal(t.activeIndex(), -1);   // back to input
    t.destroy();
    teardownDOM();
});

test("Home jumps to first tag, End back to input", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a", "b", "c"] });
    const input = mkInput();
    t.attachInput(input);
    keydown(input, "Home");
    assert.equal(t.activeIndex(), 0);
    keydown(input, "End");
    assert.equal(t.activeIndex(), -1);
    t.destroy();
    teardownDOM();
});

test("Printable char while tag-active exits to input", () => {
    setupDOM();
    const t = createTagInput({ initialValue: ["a"] });
    const input = mkInput();
    t.attachInput(input);
    t.setActiveIndex(0);
    keydown(input, "x");   // jsdom won't actually write the char, but the
                            // primitive should at least set activeIndex back
    assert.equal(t.activeIndex(), -1);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// Paste
// =====================================================================

test("paste with delimiter splits + adds each fragment", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    const ev = paste(input, "red, green, blue");
    assert.equal(ev.defaultPrevented, true);
    assert.deepEqual(t.tags(), ["red", "green", "blue"]);
    t.destroy();
    teardownDOM();
});

test("paste with no delimiter is passed through (browser handles)", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    const ev = paste(input, "no-delim");
    assert.equal(ev.defaultPrevented, false);
    assert.deepEqual(t.tags(), []);
    t.destroy();
    teardownDOM();
});

test("paste filters invalid fragments via pipeline", () => {
    setupDOM();
    const invalidCalls = [];
    const t = createTagInput({
        maxItems: 2,
        onInvalid: (v, r) => invalidCalls.push([v, r]),
    });
    const input = mkInput();
    t.attachInput(input);
    paste(input, "a, b, c, d");   // c + d rejected (max-items)
    assert.deepEqual(t.tags(), ["a", "b"]);
    assert.equal(invalidCalls.length, 2);
    assert.equal(invalidCalls[0][1], "max-items");
    t.destroy();
    teardownDOM();
});

test("paste with newline delimiter (default RegExp matches)", () => {
    setupDOM();
    const t = createTagInput();
    const input = mkInput();
    t.attachInput(input);
    paste(input, "a\nb\nc");
    assert.deepEqual(t.tags(), ["a", "b", "c"]);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// attachRoot
// =====================================================================

test("attachRoot paints role + aria + count + active", () => {
    setupDOM();
    const root = mkRoot();
    const t = createTagInput({ initialValue: ["a", "b"], ariaLabel: "Cats" });
    t.attachRoot(root);
    assert.equal(root.getAttribute("role"), "group");
    assert.equal(root.getAttribute("aria-label"), "Cats");
    assert.equal(root.getAttribute("data-tag-count"), "2");
    assert.equal(root.getAttribute("data-tag-active"), "-");
    t.setActiveIndex(1);
    assert.equal(root.getAttribute("data-tag-active"), "1");
    t.destroy();
    teardownDOM();
});

test("attachRoot off() cleans up attrs", () => {
    setupDOM();
    const root = mkRoot();
    const t = createTagInput();
    const off = t.attachRoot(root);
    off();
    assert.equal(root.hasAttribute("role"), false);
    assert.equal(root.hasAttribute("data-tag-count"), false);
    t.destroy();
    teardownDOM();
});

// =====================================================================
// destroy
// =====================================================================

test("destroy detaches attrs + methods become no-ops", () => {
    setupDOM();
    const root = mkRoot();
    const input = mkInput();
    const t = createTagInput({ initialValue: ["a"] });
    t.attachRoot(root);
    t.attachInput(input);
    t.destroy();
    assert.equal(t.destroyed, true);
    assert.equal(root.hasAttribute("data-tag-root"), false);
    assert.equal(input.hasAttribute("data-tag-input-field"), false);
    // Methods after destroy are no-ops
    t.addTag("b");
    assert.equal(t.destroyed, true);
    teardownDOM();
});

test("destroy is idempotent", () => {
    setupDOM();
    const t = createTagInput();
    t.destroy();
    t.destroy();
    assert.equal(t.destroyed, true);
    teardownDOM();
});
