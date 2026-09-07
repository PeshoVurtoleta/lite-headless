// combobox-remote-options.test.js -- the H10 (LH-04) recipe seam proven against
// PUBLISHED @zakkster/lite-query (devDep ^2.2.0, not a symlink): onQueryChange ->
// lite-query fetch -> generation()-guarded apply. Async ordering is controlled
// with deferred fetchers so the stale-fetch guard is asserted deterministically;
// lite-query drives the real observed-fetch lifecycle (a setTimeout(0) flush
// settles it). See docs/recipes/combobox-remote-options.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM } from "./_setup.js";
import { effect } from "@zakkster/lite-signal";
import { queryClient, query } from "@zakkster/lite-query";
import { createCombobox } from "../src/combobox/index.js";

const flush = () => new Promise((r) => setTimeout(r, 0));

function deferred() {
    let resolve;
    const p = new Promise((r) => { resolve = r; });
    return { p, resolve };
}

// Wire the recipe: a combobox whose onQueryChange fetches through lite-query and
// applies results guarded by generation(). `fetchers[q]` is a deferred the test
// resolves by hand to control ordering. Returns { combo, listbox, itemLabels }.
function wireRemote(fetchers) {
    const listbox = document.createElement("ul");
    const input = document.createElement("input");
    document.body.append(input, listbox);

    let itemOffs = [];
    const combo = createCombobox({
        container: null,
        onQueryChange(q, generation) {
            combo.setLoading(true);
            const h = query(qc, {
                key: ["options", q],
                fetcher: async () => fetchers[q].p,
            });
            const stop = effect(() => {
                const rows = h.data();
                const s = h.status();
                if (s !== "success" && s !== "error") return;
                stop();
                combo.setLoading(false);
                if (combo.generation() !== generation) { h.dispose(); return; }
                if (s === "success") applyOptions(rows || []);
                h.dispose();
            });
        },
    });
    combo.attachInput(input);
    combo.attachListbox(listbox);

    function applyOptions(rows) {
        for (const off of itemOffs) off();
        itemOffs = [];
        listbox.replaceChildren();
        for (const row of rows) {
            const li = document.createElement("li");
            li.textContent = row.label;
            listbox.appendChild(li);
            itemOffs.push(combo.attachItem(li, { value: row.value, label: row.label }));
        }
    }

    const itemLabels = () => combo._items().map((it) => it.label);
    return { combo, input, listbox, itemLabels };
}

let qc;

test("a superseded (stale) fetch never replaces the current options", async () => {
    setupDOM();
    qc = queryClient();
    const fetchers = { a: deferred(), ap: deferred() };
    const { combo, itemLabels } = wireRemote(fetchers);

    // Type "a" (generation 1), then "ap" (generation 2) -- both in flight.
    combo.setQuery("a", "input");
    const gen1 = combo.generation();
    combo.setQuery("ap", "input");
    const gen2 = combo.generation();
    assert.equal(gen2, gen1 + 1, "each committed query bumps the generation");

    // Resolve the NEWER fetch first: it matches the current generation -> applied.
    fetchers.ap.resolve([{ value: "apple", label: "Apple" }, { value: "apricot", label: "Apricot" }]);
    await flush();
    assert.deepEqual(itemLabels(), ["Apple", "Apricot"], "current-generation results applied");

    // Now the OLDER fetch resolves late. It is superseded -> must be ignored.
    fetchers.a.resolve([{ value: "avocado", label: "Avocado" }]);
    await flush();
    assert.deepEqual(itemLabels(), ["Apple", "Apricot"], "stale results did NOT replace the list");

    combo.destroy();
    teardownDOM();
});

test("loading paints aria-busy + data-loading during a fetch and clears after", async () => {
    setupDOM();
    qc = queryClient();
    const fetchers = { x: deferred() };
    const { combo, listbox } = wireRemote(fetchers);

    combo.setQuery("x", "input");
    assert.equal(combo.loading(), true, "loading true while the fetch is in flight");
    assert.equal(listbox.getAttribute("aria-busy"), "true");
    assert.ok(listbox.hasAttribute("data-loading"));

    fetchers.x.resolve([{ value: "x1", label: "X1" }]);
    await flush();
    assert.equal(combo.loading(), false, "loading cleared after settle");
    assert.equal(listbox.getAttribute("aria-busy"), null);
    assert.equal(listbox.hasAttribute("data-loading"), false);

    combo.destroy();
    teardownDOM();
});

test("the editable input drives setQuery -> onQueryChange (attachInput seam)", async () => {
    setupDOM();
    qc = queryClient();
    const fetchers = { hi: deferred() };
    const { combo, input, itemLabels } = wireRemote(fetchers);

    input.value = "hi";
    input.dispatchEvent(new window.Event("input"));
    assert.equal(combo.query(), "hi", "input event drove the query signal");
    assert.equal(combo.generation(), 1, "onQueryChange bumped the generation");

    fetchers.hi.resolve([{ value: "hit", label: "Hit" }]);
    await flush();
    assert.deepEqual(itemLabels(), ["Hit"], "results from the input-driven query applied");

    combo.destroy();
    teardownDOM();
});
