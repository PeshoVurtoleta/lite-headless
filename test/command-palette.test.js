// command-palette.test.js -- createCommandPalette (imperative + ARIA)
//
// Browser-driven tests cover the real Cmd+K keybinding and click
// invocation; here we cover:
//   - registry CRUD
//   - scoring tiers (exact, prefix, start-of-word, substring, keyword, fuzzy)
//   - recent boost
//   - open/close/toggle + onOpenChange firing
//   - setQuery + onQueryChange
//   - invoke + invokeActive
//   - keyboard nav (next/prev/setActive)
//   - attach* ARIA painting + click delegation via primitive's markItem
//   - destroy() idempotence

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { createCommandPalette } from "../src/command-palette/index.js";

function mkCmd(id, label, extras = {}) {
    return { id, label, ...extras };
}

// -------- construction validation -------------------------------

test("createCommandPalette defaults are sane", () => {
    setupDOM();
    const p = createCommandPalette();
    assert.equal(p.isOpen(), false);
    assert.equal(p.query(), "");
    assert.deepEqual(p.results(), []);
    assert.equal(p.activeIndex(), -1, "no active item with empty registry");
    assert.equal(p.destroyed, false);
    p.destroy();
    teardownDOM();
});

test("register throws on invalid command", () => {
    setupDOM();
    const p = createCommandPalette();
    assert.throws(() => p.register(null), /must be an object/);
    assert.throws(() => p.register({}), /id is required/);
    assert.throws(() => p.register({ id: "x" }), /label is required/);
    p.destroy();
    teardownDOM();
});

test("register accepts an array of commands", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "Aardvark"), mkCmd("b", "Bear")]);
    assert.equal(p.commands().length, 2);
    p.destroy();
    teardownDOM();
});

test("register on existing id REPLACES (no duplicates)", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("a", "First"));
    p.register(mkCmd("a", "Second"));
    assert.equal(p.commands().length, 1);
    assert.equal(p.commands()[0].label, "Second");
    p.destroy();
    teardownDOM();
});

test("unregister removes by id; clear removes all", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "A"), mkCmd("b", "B"), mkCmd("c", "C")]);
    p.unregister("b");
    assert.deepEqual(p.commands().map(c => c.id), ["a", "c"]);
    p.clear();
    assert.deepEqual(p.commands(), []);
    p.destroy();
    teardownDOM();
});

// -------- scoring -----------------------------------------------

test("empty query returns ALL registered commands in insertion order", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "Z"), mkCmd("b", "A"), mkCmd("c", "M")]);
    const r = p.results();
    assert.deepEqual(r.map(x => x.id), ["a", "b", "c"]);
    p.destroy();
    teardownDOM();
});

test("scoring tier: exact match wins over prefix wins over substring", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: false });
    p.register([
        mkCmd("a", "save"),         // exact
        mkCmd("b", "save as..."),   // prefix
        mkCmd("c", "auto save"),    // start-of-word
        mkCmd("d", "unsaved doc"),  // substring
    ]);
    p.setQuery("save");
    const ranks = p.results().map(r => r.id);
    // exact > prefix > start-of-word > substring
    assert.equal(ranks[0], "a", "exact wins");
    assert.equal(ranks[1], "b", "prefix second");
    assert.equal(ranks[2], "c", "start-of-word third");
    assert.equal(ranks[3], "d", "substring last");
    p.destroy();
    teardownDOM();
});

test("scoring: insertion order is the tie-breaker at equal score", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: false });
    p.register([
        mkCmd("z", "delete"),
        mkCmd("y", "delete"),
        mkCmd("x", "delete"),
    ]);
    p.setQuery("delete");
    assert.deepEqual(p.results().map(r => r.id), ["z", "y", "x"]);
    p.destroy();
    teardownDOM();
});

test("scoring: substring match returns match position metadata", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: false });
    p.register(mkCmd("a", "open file"));
    p.setQuery("file");
    const r = p.results();
    assert.equal(r.length, 1);
    // "open file" -> "file" matches at index 5..9
    assert.deepEqual(r[0].matches, [[5, 9]]);
    p.destroy();
    teardownDOM();
});

test("scoring: keyword match used when label doesn't match", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: false });
    p.register(mkCmd("a", "Save", { keywords: ["write", "persist"] }));
    p.setQuery("persist");
    assert.equal(p.results().length, 1);
    p.destroy();
    teardownDOM();
});

test("scoring: fuzzy match (when enabled) finds non-contiguous", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: true });
    p.register(mkCmd("a", "Open File Explorer"));
    p.setQuery("ofe");  // open File Explorer -- non-contiguous
    assert.equal(p.results().length, 1);
    p.destroy();
    teardownDOM();
});

test("scoring: fuzzy=false rejects non-contiguous matches", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: false });
    p.register(mkCmd("a", "Open File Explorer"));
    p.setQuery("ofe");
    assert.equal(p.results().length, 0);
    p.destroy();
    teardownDOM();
});

test("scoring: maxResults caps the list", () => {
    setupDOM();
    const p = createCommandPalette({ maxResults: 3 });
    for (let i = 0; i < 10; i++) p.register(mkCmd("c" + i, "cmd" + i));
    p.setQuery("cmd");
    assert.equal(p.results().length, 3);
    p.destroy();
    teardownDOM();
});

test("scoring: disabled commands are filtered out", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "alpha"), mkCmd("b", "beta", { disabled: true })]);
    assert.equal(p.results().length, 1);
    assert.equal(p.results()[0].id, "a");
    p.destroy();
    teardownDOM();
});

test("scoring: when() filter is honored; refresh() re-evaluates", () => {
    setupDOM();
    const p = createCommandPalette();
    let inEditor = false;
    p.register(mkCmd("a", "Format Document", { when: () => inEditor }));
    p.register(mkCmd("b", "Always"));
    assert.equal(p.results().length, 1);
    inEditor = true;
    p.refresh();             // re-evaluate when() now that context changed
    assert.equal(p.results().length, 2);
    p.destroy();
    teardownDOM();
});

// -------- recent boost ------------------------------------------

test("recent boost: lifts a recently-invoked command above equal-scoring peers", () => {
    setupDOM();
    const p = createCommandPalette({ recentBoost: 5, fuzzy: false });
    p.register([
        // All three are SUBSTRING matches for "file" -- same scoring tier.
        // Without boost, they'd come out in insertion order [a, b, c].
        mkCmd("a", "open file"),
        mkCmd("b", "close file"),
        mkCmd("c", "save file"),
    ]);
    p.setQuery("file");
    assert.deepEqual(p.results().map(r => r.id), ["a", "b", "c"],
        "without invocation, insertion order is the tie-break");
    p.invoke("c");
    // After invoking c, re-show. Within the same scoring tier, the
    // recently-invoked one rises to the top.
    p.setQuery("file");
    assert.equal(p.results()[0].id, "c", "recently invoked rises within tier");
    p.destroy();
    teardownDOM();
});

test("recent boost does NOT escalate across scoring tiers (exact still wins)", () => {
    setupDOM();
    const p = createCommandPalette({ recentBoost: 5, fuzzy: false });
    p.register([
        mkCmd("exact", "save"),       // exact: 100
        mkCmd("prefix", "save as"),   // prefix: 95
    ]);
    p.invoke("prefix");
    p.setQuery("save");
    assert.equal(p.results()[0].id, "exact",
        "exact (100) still beats prefix+boost (95+5=100, but stable sort keeps exact first)");
    p.destroy();
    teardownDOM();
});

test("rememberRecent: false disables the recent boost entirely", () => {
    setupDOM();
    const p = createCommandPalette({ rememberRecent: false, fuzzy: false });
    p.register([mkCmd("a", "save"), mkCmd("b", "save as...")]);
    p.invoke("b");
    p.setQuery("save");
    // No boost -- 'a' (exact) still beats 'b' (prefix); 'b' doesn't
    // jump above. Same order as before invoke.
    assert.deepEqual(p.results().map(r => r.id), ["a", "b"]);
    p.destroy();
    teardownDOM();
});

// -------- open/close/toggle -------------------------------------

test("open() sets isOpen + fires onOpen and onOpenChange", () => {
    setupDOM();
    const opens = [], changes = [];
    const p = createCommandPalette({
        onOpen: r => opens.push(r),
        onOpenChange: (o, r) => changes.push([o, r]),
    });
    p.open("test");
    assert.equal(p.isOpen(), true);
    assert.deepEqual(opens, ["test"]);
    assert.deepEqual(changes, [[true, "test"]]);
    p.destroy();
    teardownDOM();
});

test("close() clears query and fires onClose", () => {
    setupDOM();
    const closes = [];
    const p = createCommandPalette({ onClose: r => closes.push(r) });
    p.register(mkCmd("a", "alpha"));
    p.open();
    p.setQuery("alp");
    assert.equal(p.query(), "alp");
    p.close("manual");
    assert.equal(p.isOpen(), false);
    assert.equal(p.query(), "", "query cleared on close");
    assert.deepEqual(closes, ["manual"]);
    p.destroy();
    teardownDOM();
});

test("toggle() flips open state", () => {
    setupDOM();
    const p = createCommandPalette();
    assert.equal(p.isOpen(), false);
    p.toggle();
    assert.equal(p.isOpen(), true);
    p.toggle();
    assert.equal(p.isOpen(), false);
    p.destroy();
    teardownDOM();
});

test("open() is a no-op when already open", () => {
    setupDOM();
    let count = 0;
    const p = createCommandPalette({ onOpen: () => count++ });
    p.open();
    p.open();
    p.open();
    assert.equal(count, 1);
    p.destroy();
    teardownDOM();
});

// -------- setQuery ----------------------------------------------

test("setQuery fires onQueryChange (only when different)", () => {
    setupDOM();
    const changes = [];
    const p = createCommandPalette({ onQueryChange: q => changes.push(q) });
    p.setQuery("a");
    p.setQuery("a");           // same -- should not fire
    p.setQuery("ab");
    assert.deepEqual(changes, ["a", "ab"]);
    p.destroy();
    teardownDOM();
});

test("setQuery triggers recompute + onResultsChange", () => {
    setupDOM();
    const calls = [];
    const p = createCommandPalette({
        onResultsChange: r => calls.push(r.length),
    });
    p.register([mkCmd("a", "alpha"), mkCmd("b", "beta")]);
    calls.length = 0;           // discard register-time emits
    p.setQuery("alp");
    assert.equal(calls.length >= 1, true);
    assert.equal(calls[calls.length - 1], 1);
    p.destroy();
    teardownDOM();
});

// -------- invoke / invokeActive ---------------------------------

test("invoke(id) calls cmd.onSelect and onSelect callback", () => {
    setupDOM();
    let cmdCalled = false, paletteCalled = null;
    const p = createCommandPalette({
        onSelect: (cmd, src) => { paletteCalled = [cmd.id, src]; },
    });
    p.register(mkCmd("a", "alpha", {
        onSelect: () => { cmdCalled = true; },
    }));
    p.invoke("a", "click");
    assert.equal(cmdCalled, true);
    assert.deepEqual(paletteCalled, ["a", "click"]);
    p.destroy();
    teardownDOM();
});

test("invokeOnSelect: false suppresses cmd.onSelect but still fires palette onSelect", () => {
    setupDOM();
    let cmdCalled = false, paletteCalled = false;
    const p = createCommandPalette({
        invokeOnSelect: false,
        onSelect: () => { paletteCalled = true; },
    });
    p.register(mkCmd("a", "alpha", { onSelect: () => { cmdCalled = true; } }));
    p.invoke("a");
    assert.equal(cmdCalled, false);
    assert.equal(paletteCalled, true);
    p.destroy();
    teardownDOM();
});

test("invoke auto-closes the palette", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("a", "alpha"));
    p.open();
    p.invoke("a");
    assert.equal(p.isOpen(), false);
    p.destroy();
    teardownDOM();
});

test("invokeActive uses activeIndex", () => {
    setupDOM();
    const calls = [];
    const p = createCommandPalette({ onSelect: cmd => calls.push(cmd.id) });
    p.register([mkCmd("a", "alpha"), mkCmd("b", "beta")]);
    p.setActive(1);
    p.invokeActive("keyboard");
    assert.deepEqual(calls, ["b"]);
    p.destroy();
    teardownDOM();
});

test("invoke(unknown-id) returns false; does not throw", () => {
    setupDOM();
    const p = createCommandPalette();
    assert.equal(p.invoke("nonexistent"), false);
    p.destroy();
    teardownDOM();
});

// -------- navigation --------------------------------------------

test("next/prev cycle through results with wrap-around", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "A"), mkCmd("b", "B"), mkCmd("c", "C")]);
    assert.equal(p.activeIndex(), 0);
    p.next(); assert.equal(p.activeIndex(), 1);
    p.next(); assert.equal(p.activeIndex(), 2);
    p.next(); assert.equal(p.activeIndex(), 0, "wraps to 0");
    p.prev(); assert.equal(p.activeIndex(), 2, "wraps to last");
    p.destroy();
    teardownDOM();
});

test("setActive(idx) sets activeIndex if within range", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "A"), mkCmd("b", "B")]);
    p.setActive(1);
    assert.equal(p.activeIndex(), 1);
    p.setActive(5);   // out of range -- ignored
    assert.equal(p.activeIndex(), 1);
    p.destroy();
    teardownDOM();
});

test("activeIndex clamps to results length on filter change", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "alpha"), mkCmd("b", "beta"), mkCmd("c", "carrot")]);
    p.setActive(2);
    assert.equal(p.activeIndex(), 2);
    p.setQuery("alp");    // only 1 result now
    assert.equal(p.activeIndex(), 0);
    p.destroy();
    teardownDOM();
});

// -------- attachments + ARIA ------------------------------------

test("attachInput paints role=combobox + aria-expanded + aria-controls", () => {
    setupDOM();
    const p = createCommandPalette();
    const input = document.createElement("input");
    const list  = document.createElement("ul");
    document.body.append(input, list);
    p.attachList(list);
    p.attachInput(input);
    assert.equal(input.getAttribute("role"), "combobox");
    assert.equal(input.getAttribute("aria-expanded"), "false");
    assert.equal(input.getAttribute("aria-autocomplete"), "list");
    assert.equal(input.getAttribute("aria-controls"), list.id);
    p.destroy();
    teardownDOM();
});

test("aria-expanded follows isOpen()", () => {
    setupDOM();
    const p = createCommandPalette();
    const input = document.createElement("input");
    document.body.appendChild(input);
    p.attachInput(input);
    assert.equal(input.getAttribute("aria-expanded"), "false");
    p.open();
    assert.equal(input.getAttribute("aria-expanded"), "true");
    p.close();
    assert.equal(input.getAttribute("aria-expanded"), "false");
    p.destroy();
    teardownDOM();
});

test("attachList paints role=listbox", () => {
    setupDOM();
    const p = createCommandPalette();
    const list = document.createElement("ul");
    document.body.appendChild(list);
    p.attachList(list);
    assert.equal(list.getAttribute("role"), "listbox");
    p.destroy();
    teardownDOM();
});

test("markItem + active painting: aria-selected + data-active follow activeIndex", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "alpha"), mkCmd("b", "beta")]);
    const list = document.createElement("ul");
    document.body.appendChild(list);
    p.attachList(list);
    // simulate consumer rendering
    const li0 = document.createElement("li"); list.appendChild(li0);
    const li1 = document.createElement("li"); list.appendChild(li1);
    p.markItem(li0, "a", 0);
    p.markItem(li1, "b", 1);
    // need to re-trigger active paint -- setActive(0) is idempotent;
    // bump activeIdx to 0 (already 0) and back so the effect fires
    p.setActive(1); p.setActive(0);
    assert.equal(li0.getAttribute("aria-selected"), "true");
    assert.equal(li0.getAttribute("data-active"), "true");
    assert.equal(li1.getAttribute("aria-selected"), "false");
    p.setActive(1);
    assert.equal(li1.getAttribute("aria-selected"), "true");
    assert.equal(li1.getAttribute("data-active"), "true");
    assert.equal(li0.hasAttribute("data-active"), false);
    p.destroy();
    teardownDOM();
});

test("aria-activedescendant on input follows the active item's id", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register([mkCmd("a", "alpha"), mkCmd("b", "beta")]);
    const input = document.createElement("input");
    const list  = document.createElement("ul");
    document.body.append(input, list);
    p.attachList(list);
    p.attachInput(input);
    const li0 = document.createElement("li"); list.appendChild(li0);
    const li1 = document.createElement("li"); list.appendChild(li1);
    p.markItem(li0, "a", 0);
    p.markItem(li1, "b", 1);
    p.setActive(0);
    assert.equal(input.getAttribute("aria-activedescendant"), li0.id);
    p.setActive(1);
    assert.equal(input.getAttribute("aria-activedescendant"), li1.id);
    p.destroy();
    teardownDOM();
});

test("attachEmpty: hidden when results > 0, visible when 0", () => {
    setupDOM();
    const p = createCommandPalette({ fuzzy: false });
    p.register(mkCmd("a", "alpha"));
    const empty = document.createElement("div");
    document.body.appendChild(empty);
    p.attachEmpty(empty);
    // 1 result -> hidden
    assert.equal(empty.hasAttribute("hidden"), true);
    // filter to zero results
    p.setQuery("xyzzy");
    assert.equal(empty.hasAttribute("hidden"), false);
    p.destroy();
    teardownDOM();
});

// -------- destroy ------------------------------------------------

test("destroy() is idempotent and clears registry", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("a", "alpha"));
    p.destroy();
    assert.equal(p.destroyed, true);
    p.destroy();        // no throw
    assert.equal(p.commands().length, 0);
    teardownDOM();
});

test("register after destroy is a no-op", () => {
    setupDOM();
    const p = createCommandPalette();
    p.destroy();
    p.register(mkCmd("a", "alpha"));
    assert.equal(p.commands().length, 0);
    teardownDOM();
});

// -------- clearRecents (v0.7.28) ---------------------------------

test("clearRecents resets recency boost without removing commands", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("save", "Save"));
    p.register(mkCmd("open", "Open"));
    p.register(mkCmd("find", "Find"));

    // Invoke "find" so it rises to the top of equal-scoring results via boost
    p.invoke("find");
    p.setQuery("");        // results re-rank; "find" should be ranked first
    const beforeIds = p.results().map(r => r.cmd.id);

    p.clearRecents();
    const afterIds = p.results().map(r => r.cmd.id);
    // After clearRecents, registration order is restored
    assert.deepEqual(p.commands().map(c => c.id), ["save", "open", "find"]);
    // The "find" boost is gone; results should no longer prioritize it
    assert.notDeepEqual(afterIds, beforeIds);
    // Recents snapshot is empty
    assert.deepEqual(p.recents(), []);
    p.destroy();
    teardownDOM();
});

test("clearRecents is a no-op when recents is already empty", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("a", "alpha"));
    // results() is the recompute output; capture reference identity. The
    // recompute path replaces _results, so a recompute would return a
    // different array. clearRecents() on empty should NOT recompute.
    const before = p.results();
    p.clearRecents();
    assert.strictEqual(p.results(), before);   // same array reference -> no recompute
    p.destroy();
    teardownDOM();
});

test("clearRecents does not unregister commands", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("save", "Save"));
    p.register(mkCmd("open", "Open"));
    p.invoke("save");
    assert.deepEqual(p.recents(), ["save"]);
    p.clearRecents();
    assert.equal(p.commands().length, 2);
    assert.deepEqual(p.recents(), []);
    p.destroy();
    teardownDOM();
});

test("recents() returns snapshot, mutations don't leak", () => {
    setupDOM();
    const p = createCommandPalette();
    p.register(mkCmd("a", "alpha"));
    p.invoke("a");
    const snap = p.recents();
    assert.deepEqual(snap, ["a"]);
    snap.length = 0;                          // mutate the snapshot
    assert.deepEqual(p.recents(), ["a"]);     // internal state unchanged
    p.destroy();
    teardownDOM();
});
