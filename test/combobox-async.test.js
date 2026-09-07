// combobox-async.test.js -- qa boundary + assertion suite for the H10 combobox
// async surface: filter (LOCAL), onQueryChange (REMOTE), setQuery/query,
// setLoading/loading, generation, attachInput. Proves PLAN.md section 6
// assertions A1-A8 against the primitive DIRECTLY (no lite-query) plus a
// boundary matrix on every new entry point. Does NOT duplicate the lite-query
// pairing already covered by test/combobox-remote-options.test.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, dispatchKey, dispatchClick, dispatchPointer } from "./_setup.js";
import { createCombobox } from "../src/combobox/index.js";

function mkListboxDOM(labels) {
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    const items = labels.map((label) => {
        const li = document.createElement("li");
        li.textContent = label;
        listbox.appendChild(li);
        return { el: li, value: label.toLowerCase(), label };
    });
    return { trigger, listbox, items };
}

// Small seeded PRNG (mulberry32) so the A1 interleaving fuzz is deterministic
// and reproducible across runs/CI -- no external dependency.
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// ===========================================================================
// A3 -- filter XOR onQueryChange (construction)
// ===========================================================================

test("A3: filter + onQueryChange together throws the exact mutual-exclusion TypeError", () => {
    setupDOM();
    const MSG = 'createCombobox: "filter" (local) and "onQueryChange" (remote) are mutually exclusive; supply one.';
    assert.throws(
        () => createCombobox({ container: null, filter: () => true, onQueryChange: () => {} }),
        (e) => e.name === "TypeError" && e.message === MSG,
    );
    teardownDOM();
});

test("A3: filter alone constructs fine", () => {
    setupDOM();
    assert.doesNotThrow(() => createCombobox({ container: null, filter: () => true }).destroy());
    teardownDOM();
});

test("A3: onQueryChange alone constructs fine", () => {
    setupDOM();
    assert.doesNotThrow(() => createCombobox({ container: null, onQueryChange: () => {} }).destroy());
    teardownDOM();
});

test("A3: neither option constructs fine (byte-stable default path)", () => {
    setupDOM();
    assert.doesNotThrow(() => createCombobox({ container: null }).destroy());
    teardownDOM();
});

// ===========================================================================
// A6 -- off-cost / byte-stability: generation + paint are inert with neither
// filter nor onQueryChange.
// ===========================================================================

test("A6: off-cost -- generation stays 0 across N setQuery calls, no item painted hidden, commit still works", () => {
    setupDOM();
    const { trigger, listbox, items } = mkListboxDOM(["Apple", "Banana", "Cherry"]);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });

    assert.equal(combo.generation(), 0);
    for (let i = 0; i < 10; i++) {
        assert.doesNotThrow(() => combo.setQuery("q" + i));
    }
    assert.equal(combo.generation(), 0, "generation is inert with no filter/no remote option");
    assert.equal(combo.query(), "q9", "query() still updates even when inert for filter/generation");
    for (const it of items) {
        assert.equal(it.el.hasAttribute("hidden"), false, "no item painted hidden without a filter");
        assert.equal(it.el.hasAttribute("data-hidden"), false);
    }
    // selectIndex commits normally: the gen guard is a constant-true branch
    // (every entry.gen is 0, current generation is 0).
    combo.setOpen(true, "api");
    dispatchKey(trigger, "ArrowDown"); // -> banana
    dispatchKey(trigger, "Enter");
    assert.equal(combo.value(), "banana");
    combo.destroy();
    teardownDOM();
});

// ===========================================================================
// A1 -- stale-generation commit impossible
// ===========================================================================

test("A1: a stale-generation item cannot be committed; re-attaching under the current gen commits fine", () => {
    setupDOM();
    const { trigger, listbox, items } = mkListboxDOM(["Alpha", "Beta"]);
    let qcCalls = 0;
    const combo = createCombobox({ container: null, onQueryChange: () => { qcCalls++; } });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    const offs = items.map((it) => combo.attachItem(it.el, { value: it.value, label: it.label }));
    assert.equal(combo.generation(), 0);

    // Bump generation WITHOUT re-attaching -- the existing _items entries are
    // now stale relative to generation() (stamped gen 0, current gen 1).
    combo.setQuery("a", "input");
    assert.equal(qcCalls, 1);
    assert.equal(combo.generation(), 1);

    combo.setOpen(true, "api");
    dispatchClick(items[0].el); // Alpha, stale (gen 0)
    assert.equal(combo.value(), null, "stale-gen click is a silent no-op, no commit");

    dispatchKey(trigger, "Enter"); // whatever autoFocus highlighted is also stale
    assert.equal(combo.value(), null, "stale-gen Enter is also a no-op");

    // Re-attach a fresh item under the CURRENT generation -- it commits.
    offs[0]();
    const fresh = document.createElement("li");
    fresh.textContent = "Alpha2";
    listbox.appendChild(fresh);
    combo.attachItem(fresh, { value: "alpha2", label: "Alpha2" });
    combo.setOpen(true, "api");
    dispatchClick(fresh);
    assert.equal(combo.value(), "alpha2", "a current-generation item commits normally");
    combo.destroy();
    teardownDOM();
});

test("A1: seeded interleaving fuzz -- no commit ever yields a value whose item.gen != current generation", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    const combo = createCombobox({ container: null, onQueryChange: () => {} });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);

    // Live pool mirrors the primitive's internal stamping: attachedGen is
    // combo.generation() read at the exact moment of attachItem (the same
    // value the primitive stamps onto entry.gen).
    let pool = [];
    let uid = 0;
    let violations = 0;
    let commits = 0;
    let staleNoops = 0;

    function attachOne() {
        const li = document.createElement("li");
        const value = "v" + (uid++);
        li.textContent = value;
        listbox.appendChild(li);
        const attachedGen = combo.generation();
        const off = combo.attachItem(li, { value, label: value });
        pool.push({ el: li, value, off, attachedGen });
    }

    for (let i = 0; i < 3; i++) attachOne(); // seed at gen 0

    const rand = mulberry32(0xC0FFEE);
    combo.setOpen(true, "api");
    for (let step = 0; step < 300; step++) {
        const op = rand();
        if (op < 0.35) {
            combo.setQuery("q" + step, "input"); // type -> bumps generation
        } else if (op < 0.6) {
            // replace: detach everything, attach a fresh batch under the
            // CURRENT generation (simulates the caller's fetch-resolve render).
            for (const p of pool) p.off();
            pool = [];
            const n = 1 + Math.floor(rand() * 3);
            for (let i = 0; i < n; i++) attachOne();
        } else if (op < 0.65) {
            attachOne(); // append without detaching (a slow, un-replaced append)
        } else {
            // commit: click a RANDOM item from the live pool, including ones
            // attached under an older, now-superseded generation.
            if (pool.length === 0) continue;
            const target = pool[Math.floor(rand() * pool.length)];
            const before = combo.value();
            dispatchClick(target.el);
            const after = combo.value();
            if (after !== before) {
                commits++;
                if (target.attachedGen !== combo.generation()) violations++;
                assert.equal(target.attachedGen, combo.generation(), "a committed item's stamped gen matches the current generation");
                assert.equal(after, target.value, "the committed value belongs to the clicked item");
            } else {
                staleNoops++;
            }
        }
    }
    console.log("A1 fuzz: steps=300 commits=" + commits + " staleNoops=" + staleNoops + " violations=" + violations);
    assert.equal(violations, 0, "no stale-generation commit ever landed across " + commits + " commits");
    assert.ok(commits > 0, "die-guard: the fuzz must have produced at least one real commit");
    assert.ok(staleNoops > 0, "die-guard: the fuzz must have produced at least one stale no-op (the guard was actually exercised)");
    combo.destroy();
    teardownDOM();
});

// ===========================================================================
// A2 -- highlight truth table across a LOCAL filter recompute
// ===========================================================================

test("A2: highlight truth table -- preserved by value identity, reset to first visible, empty set -> -1", () => {
    setupDOM();
    const { trigger, listbox, items } = mkListboxDOM(["Apple", "Apricot", "Banana", "Cherry"]);
    const filter = (entry, q) => q === "" || entry.label.toLowerCase().startsWith(q.toLowerCase());
    const combo = createCombobox({ container: null, filter });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });

    combo.setOpen(true, "api");           // highlight -> index 0 (Apple)
    dispatchKey(trigger, "ArrowDown");    // -> index 1 (Apricot), all visible so far
    assert.equal(combo._highlightIndex(), 1);

    // survives: "apr" hides Apple/Banana/Cherry, keeps Apricot visible.
    combo.setQuery("apr");
    assert.equal(items[0].el.hasAttribute("hidden"), true, "Apple hidden");
    assert.equal(items[1].el.hasAttribute("hidden"), false, "Apricot stays visible");
    assert.equal(items[2].el.hasAttribute("hidden"), true, "Banana hidden");
    assert.equal(items[3].el.hasAttribute("hidden"), true, "Cherry hidden");
    assert.equal(combo._highlightIndex(), 1, "highlight PRESERVED by value identity (same index, still visible)");

    // gone: "ban" hides Apricot (the highlighted item) -> reset to first
    // ENABLED (visible) item, which is now Banana (index 2).
    combo.setQuery("ban");
    assert.equal(items[1].el.hasAttribute("hidden"), true, "Apricot (previously highlighted) now hidden");
    assert.equal(items[2].el.hasAttribute("hidden"), false, "Banana visible");
    assert.equal(items[2].el.hasAttribute("data-hidden"), false);
    assert.equal(combo._highlightIndex(), 2, "highlight RESET to the first (only) visible item");

    // empty: nothing matches -> no highlight at all.
    combo.setQuery("zzz");
    for (const it of items) assert.equal(it.el.hasAttribute("hidden"), true);
    assert.equal(combo._highlightIndex(), -1, "empty visible set -> highlight -1");

    combo.destroy();
    teardownDOM();
});

// ===========================================================================
// A4 -- loading never blocks typing or dismiss; paints/clears aria-busy
// ===========================================================================

test("A4: loading never blocks a keystroke, Escape dismiss, or outside-click dismiss; paints/clears aria-busy + data-loading", () => {
    setupDOM();
    const { trigger, listbox, items } = mkListboxDOM(["Apple", "Banana"]);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (const it of items) combo.attachItem(it.el, { value: it.value, label: it.label });

    combo.setLoading(true);
    assert.equal(combo.loading(), true);
    assert.equal(listbox.getAttribute("aria-busy"), "true");
    assert.ok(listbox.hasAttribute("data-loading"));

    assert.doesNotThrow(() => combo.setQuery("x", "input"));
    assert.equal(combo.query(), "x", "keystroke still updates query() while loading");

    combo.setOpen(true, "api");
    assert.equal(combo.open(), true);
    dispatchKey(document, "Escape");
    assert.equal(combo.open(), false, "Escape dismisses even while loading");

    const outside = document.createElement("div");
    document.body.appendChild(outside);
    combo.setOpen(true, "api");
    dispatchPointer(outside, "pointerdown");
    assert.equal(combo.open(), false, "outside-click dismisses even while loading");

    combo.setLoading(false);
    assert.equal(listbox.getAttribute("aria-busy"), null);
    assert.equal(listbox.hasAttribute("data-loading"), false);
    combo.destroy();
    teardownDOM();
});

test("A4: retro-paint -- setLoading(true) BEFORE attachListbox paints aria-busy on attach", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    const combo = createCombobox({ container: null });
    combo.setLoading(true);
    assert.equal(listbox.hasAttribute("aria-busy"), false, "not attached yet -- nothing to paint");
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    assert.equal(listbox.getAttribute("aria-busy"), "true", "retro-painted on attach");
    assert.ok(listbox.hasAttribute("data-loading"));
    combo.destroy();
    teardownDOM();
});

// ===========================================================================
// A7 -- attachItem meta passthrough (confirm, not new: no bag validator added)
// ===========================================================================

test("A7: attachItem meta with an unknown extra key does not throw (passthrough, unchanged from 1.6.0)", () => {
    setupDOM();
    const { trigger, listbox } = mkListboxDOM([]);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    const li = document.createElement("li");
    listbox.appendChild(li);
    assert.doesNotThrow(() => combo.attachItem(li, { value: "a", label: "A", extraUnknownKey: 42 }));
    assert.equal(li.getAttribute("role"), "option");
    combo.destroy();
    teardownDOM();
});

// ===========================================================================
// A8 -- destroy() during a pending remote flow seals cleanly (H-12)
// ===========================================================================

test("A8: destroy() during a pending remote flow freezes query/loading; post-destroy calls are inert", () => {
    setupDOM();
    const { trigger, listbox } = mkListboxDOM([]);
    let qcCalls = 0;
    const combo = createCombobox({ container: null, onQueryChange: () => { qcCalls++; } });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);

    combo.setLoading(true);
    combo.setQuery("pending", "input");
    assert.equal(qcCalls, 1);
    assert.equal(combo.loading(), true);
    assert.equal(combo.query(), "pending");

    assert.doesNotThrow(() => combo.destroy());
    assert.equal(combo.query(), "pending", "query freezes at final value (H-12 seal)");
    assert.equal(combo.loading(), true, "loading freezes at final value (H-12 seal)");

    assert.doesNotThrow(() => combo.setQuery("after-destroy"));
    assert.doesNotThrow(() => combo.setLoading(false));
    assert.equal(combo.query(), "pending", "post-destroy setQuery is inert");
    assert.equal(combo.loading(), true, "post-destroy setLoading is inert");
    teardownDOM();
});

// ===========================================================================
// Boundary matrix -- every new entry point: setQuery, setLoading, generation,
// attachInput, attachItem/filter buffer growth, duplicate dispose,
// dispose-during-iteration, re-entrant write, adversarial.
// ===========================================================================

test("boundary: setQuery coerces every non-string input to \"\" (0, 1, NaN, -0, null, undefined, object, array, symbol)", () => {
    setupDOM();
    const { trigger, listbox } = mkListboxDOM([]);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    const nonStrings = [0, 1, NaN, -0, null, undefined, {}, [], Symbol("x")];
    for (const v of nonStrings) {
        assert.doesNotThrow(() => combo.setQuery(v), "setQuery(" + String(v) + ") does not throw");
        assert.equal(combo.query(), "", "non-string coerces to empty string");
    }
    assert.doesNotThrow(() => combo.setQuery(""));
    assert.equal(combo.query(), "");
    combo.setQuery("real");
    assert.equal(combo.query(), "real");
    combo.destroy();
    teardownDOM();
});

test("boundary: setLoading coerces every value via !! (0, 1, NaN, -0, null, undefined, \"\", \"false\", \"0\")", () => {
    setupDOM();
    const { trigger, listbox } = mkListboxDOM([]);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    const cases = [
        [0, false], [1, true], [NaN, false], [-0, false],
        [null, false], [undefined, false], ["", false], ["false", true],
        ["0", true], [{}, true], [[], true],
    ];
    for (const [input, expected] of cases) {
        combo.setLoading(input);
        assert.equal(combo.loading(), expected, "setLoading(" + JSON.stringify(input === undefined ? "undefined" : input) + ") -> " + expected);
    }
    combo.destroy();
    teardownDOM();
});

test("boundary: filter recompute buffer grows correctly across the N-1/N/N+1 capacity threshold (7/8/9 items)", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    const filter = (entry, q) => q === "" || entry.value === q;
    const combo = createCombobox({ container: null, filter });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);

    // 0 items: setQuery on an empty combobox must not throw.
    assert.doesNotThrow(() => combo.setQuery("anything"));

    const els = [];
    for (let i = 0; i < 9; i++) {
        const li = document.createElement("li");
        listbox.appendChild(li);
        combo.attachItem(li, { value: "v" + i, label: "v" + i });
        els.push(li);
        if (i === 0) assert.doesNotThrow(() => combo.setQuery("")); // 1-item boundary
    }
    // N-1=7, N=8 (== initial Int32Array capacity), N+1=9 (forces a doubling
    // grow). Querying for ONLY the 9th (last, index 8) item exercises the
    // grown buffer's actual content, not just its capacity.
    combo.setQuery("v8");
    for (let i = 0; i < 9; i++) {
        assert.equal(els[i].hasAttribute("hidden"), i !== 8, "only the item crossing the grow threshold is visible");
    }
    combo.setQuery("");
    for (let i = 0; i < 9; i++) assert.equal(els[i].hasAttribute("hidden"), false, "all visible again");
    combo.destroy();
    teardownDOM();
});

test("boundary: attachInput(null/undefined) is a safe no-op returning a function", () => {
    setupDOM();
    const combo = createCombobox({ container: null });
    let off1, off2;
    assert.doesNotThrow(() => { off1 = combo.attachInput(null); });
    assert.doesNotThrow(() => { off2 = combo.attachInput(undefined); });
    assert.equal(typeof off1, "function");
    assert.equal(typeof off2, "function");
    assert.doesNotThrow(() => off1());
    assert.doesNotThrow(() => off2());
    combo.destroy();
    teardownDOM();
});

test("boundary: attachInput after destroy() is inert (no throw, no ARIA painted)", () => {
    setupDOM();
    const combo = createCombobox({ container: null });
    combo.destroy();
    const input = document.createElement("input");
    document.body.appendChild(input);
    let off;
    assert.doesNotThrow(() => { off = combo.attachInput(input); });
    assert.equal(input.hasAttribute("role"), false, "destroyed combobox does not paint a late attach");
    assert.doesNotThrow(() => off());
    teardownDOM();
});

test("boundary: attachInput wired to two different inputs -- both independently drive setQuery", () => {
    setupDOM();
    const combo = createCombobox({ container: null });
    const input1 = document.createElement("input");
    const input2 = document.createElement("input");
    document.body.append(input1, input2);
    combo.attachInput(input1);
    combo.attachInput(input2);
    input2.value = "second";
    input2.dispatchEvent(new window.Event("input"));
    assert.equal(combo.query(), "second", "the most-recently attached input drives setQuery");
    input1.value = "first";
    input1.dispatchEvent(new window.Event("input"));
    assert.equal(combo.query(), "first", "input1's own listener is still independently wired (attach-native: no dedupe)");
    combo.destroy();
    teardownDOM();
});

test("boundary: duplicate dispose -- destroy() called twice does not throw and state stays frozen", () => {
    setupDOM();
    const { trigger, listbox, items } = mkListboxDOM(["Apple"]);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    combo.attachItem(items[0].el, { value: items[0].value, label: items[0].label });
    combo.setValue("apple");
    combo.destroy();
    assert.equal(combo.value(), "apple");
    assert.doesNotThrow(() => combo.destroy(), "second destroy() is a no-op, not a throw");
    assert.equal(combo.value(), "apple", "value still frozen after duplicate dispose");
    teardownDOM();
});

test("boundary: dispose-during-iteration -- destroy() called from inside the filter predicate mid-recompute", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    let combo;
    let calls = 0;
    const filter = (entry, q) => {
        calls++;
        if (calls === 2) combo.destroy(); // re-entrant destroy mid-loop, on item #2 of 4
        return true;
    };
    combo = createCombobox({ container: null, filter });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    for (let i = 0; i < 4; i++) {
        const li = document.createElement("li");
        listbox.appendChild(li);
        combo.attachItem(li, { value: "v" + i, label: "v" + i });
    }
    let threw = null;
    try { combo.setQuery("x"); } catch (e) { threw = e; }
    assert.equal(threw, null, "destroy() during the filter walk must not throw: " + (threw && threw.stack));
    assert.equal(combo.destroyed, true);
    assert.doesNotThrow(() => combo.destroy(), "duplicate dispose after the re-entrant one still does not throw");
    teardownDOM();
});

test("boundary: re-entrant write -- setQuery called INSIDE onQueryChange updates query() but does not re-fire or re-bump generation", () => {
    setupDOM();
    const { trigger, listbox } = mkListboxDOM([]);
    let qcCalls = [];
    const combo = createCombobox({
        container: null,
        onQueryChange: (q, gen) => {
            qcCalls.push([q, gen]);
            if (qcCalls.length === 1) combo.setQuery("re-entrant", "input");
        },
    });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    combo.setQuery("outer", "input");
    assert.equal(qcCalls.length, 1, "the re-entrant setQuery call does not re-fire onQueryChange in the same tick");
    assert.equal(combo.generation(), 1, "generation does not re-bump on the re-entrant attempt");
    combo.destroy();
    teardownDOM();
});

test("adversarial: attachItem called twice on the SAME element does not corrupt selection or the item list", () => {
    setupDOM();
    const trigger = document.createElement("button");
    const listbox = document.createElement("ul");
    document.body.append(trigger, listbox);
    const combo = createCombobox({ container: null });
    combo.attachTrigger(trigger);
    combo.attachListbox(listbox);
    const li = document.createElement("li");
    listbox.appendChild(li);
    const off1 = combo.attachItem(li, { value: "dup", label: "Dup" });
    const off2 = combo.attachItem(li, { value: "dup", label: "Dup" });
    assert.equal(combo._items().length, 2, "two independent entries for the same element (attach-native: no dedupe)");
    combo.setOpen(true, "api");
    assert.doesNotThrow(() => dispatchClick(li));
    assert.equal(combo.value(), "dup", "click resolves without throwing even with two listeners firing on one element");
    assert.doesNotThrow(() => off1());
    assert.equal(combo._items().length, 1, "off() removes exactly the one entry it owns, list is not corrupted");
    assert.doesNotThrow(() => off2());
    assert.equal(combo._items().length, 0);
    combo.destroy();
    teardownDOM();
});
