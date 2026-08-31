// overlay/core.test.js -- state machine, controlled/uncontrolled, status, reasons

import { test } from "node:test";
import assert from "node:assert/strict";
import { setupDOM, teardownDOM, flushMicrotasks } from "./_setup.js";
import { signal } from "@zakkster/lite-signal";
import { createOverlayCore } from "../src/_overlay/core.js";

test("uncontrolled: defaultOpen false -> open()===false, status===closed", () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: false });
    assert.equal(c.open(), false);
    assert.equal(c.status(), "closed");
    c.destroy();
    teardownDOM();
});

test("uncontrolled: defaultOpen true -> open()===true, status===open", () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: true });
    assert.equal(c.open(), true);
    assert.equal(c.status(), "open");
    c.destroy();
    teardownDOM();
});

test("setOpen(true) transitions status: closed -> opening -> open", async () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: false });
    const seen = [];
    c.status.subscribe((s) => seen.push(s));

    c.setOpen(true);
    assert.equal(c.open(), true);
    assert.equal(c.status(), "opening");

    await flushMicrotasks();
    assert.equal(c.status(), "open");
    assert.deepEqual(seen, ["closed", "opening", "open"]);

    c.destroy();
    teardownDOM();
});

test("setOpen(false) transitions status: open -> closing -> closed", async () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: true });
    const seen = [];
    c.status.subscribe((s) => seen.push(s));

    c.setOpen(false);
    assert.equal(c.open(), false);
    assert.equal(c.status(), "closing");

    await flushMicrotasks();
    assert.equal(c.status(), "closed");
    assert.deepEqual(seen, ["open", "closing", "closed"]);

    c.destroy();
    teardownDOM();
});

test("onOpenChange fires BEFORE state flips, with reason", () => {
    setupDOM();
    const calls = [];
    const c = createOverlayCore({
        defaultOpen: false,
        onOpenChange: (next, reason) => calls.push({ next, reason }),
    });

    c.setOpen(true, "trigger");
    c.setOpen(false, "escape");
    c.setOpen(true); // default reason
    c.setOpen(false, "outside");

    assert.deepEqual(calls, [
        { next: true,  reason: "trigger" },
        { next: false, reason: "escape"  },
        { next: true,  reason: "api"     },
        { next: false, reason: "outside" },
    ]);

    c.destroy();
    teardownDOM();
});

test("no-op setOpen (same value) does not fire onOpenChange and does not move status", () => {
    setupDOM();
    let calls = 0;
    const c = createOverlayCore({ defaultOpen: true, onOpenChange: () => calls++ });
    c.setOpen(true, "api");
    assert.equal(calls, 0);
    assert.equal(c.status(), "open");
    c.destroy();
    teardownDOM();
});

test("toggle flips state and passes 'api' reason", () => {
    setupDOM();
    const reasons = [];
    const c = createOverlayCore({ defaultOpen: false, onOpenChange: (_, r) => reasons.push(r) });
    c.toggle();
    c.toggle();
    assert.deepEqual(reasons, ["api", "api"]);
    c.destroy();
    teardownDOM();
});

test("controlled mode: open signal supplied; setOpen does NOT flip it (consumer must)", async () => {
    setupDOM();
    const ext = signal(false);
    let changeCalls = 0;
    const c = createOverlayCore({
        open: ext,
        onOpenChange: () => changeCalls++,
    });
    assert.equal(c._isControlled, true);

    c.setOpen(true, "trigger");
    // engine does not write to ext; consumer is responsible
    assert.equal(ext.peek(), false);
    assert.equal(changeCalls, 1);

    // consumer flips it manually -> engine should pick it up via the signal
    ext.set(true);
    assert.equal(c.open(), true);

    c.destroy();
    teardownDOM();
});

test("controlled mode: if consumer DOES flip, status follows", async () => {
    setupDOM();
    const ext = signal(false);
    const c = createOverlayCore({
        open: ext,
        onOpenChange: (next) => ext.set(next),
    });

    const seen = [];
    c.status.subscribe((s) => seen.push(s));

    c.setOpen(true, "trigger");
    await flushMicrotasks();
    await flushMicrotasks();

    assert.equal(c.open(), true);
    assert.equal(c.status(), "open", "status settles on 'open'");
    assert.ok(seen.includes("opening"), `status passed through 'opening'; saw: ${JSON.stringify(seen)}`);
    assert.equal(seen[seen.length - 1], "open");

    c.destroy();
    teardownDOM();
});

test("controlled mode: if consumer VETOES the flip, status stays put", async () => {
    setupDOM();
    const ext = signal(false);
    const c = createOverlayCore({
        open: ext,
        onOpenChange: (_next, _reason) => {
            // consumer chooses NOT to flip ext -- the veto
        },
    });

    c.setOpen(true, "trigger");
    await flushMicrotasks();
    await flushMicrotasks();
    assert.equal(c.open(), false);
    assert.equal(c.status(), "closed");

    c.destroy();
    teardownDOM();
});

test("destroy is idempotent and stops further setOpen calls", () => {
    setupDOM();
    let calls = 0;
    const c = createOverlayCore({ defaultOpen: false, onOpenChange: () => calls++ });
    c.destroy();
    c.destroy(); // second time -- no throw
    c.setOpen(true, "api");
    assert.equal(calls, 0);
    assert.equal(c.destroyed, true);
    teardownDOM();
});

test("_addCleanup runs in LIFO order on destroy and swallows throws", () => {
    setupDOM();
    const c = createOverlayCore({});
    const order = [];
    c._addCleanup(() => order.push("a"));
    c._addCleanup(() => { order.push("b"); throw new Error("from b"); });
    c._addCleanup(() => order.push("c"));
    c.destroy();
    assert.deepEqual(order, ["c", "b", "a"]);
    teardownDOM();
});

test("_addCleanup returned remover unregisters AND runs the cleanup", () => {
    setupDOM();
    const c = createOverlayCore({});
    let ran = 0;
    const off = c._addCleanup(() => ran++);
    off();
    assert.equal(ran, 1);
    c.destroy();
    assert.equal(ran, 1, "cleanup should NOT run again on destroy after manual removal");
    teardownDOM();
});

// --- status generation guard (H-01) -----------------------------------

test("same-tick setOpen(true) then setOpen(false) never emits closing->open", async () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: false });
    const seen = [];
    c.status.subscribe((s) => seen.push(s));

    c.setOpen(true);
    c.setOpen(false);

    await new Promise((r) => setTimeout(r, 10));

    const illegalFlash = seen.some((s, i) => i > 0 && s === "open" && seen[i - 1] === "closing");
    assert.equal(illegalFlash, false, `no closing->open flash; saw: ${JSON.stringify(seen)}`);
    assert.equal(c.status(), "closed");

    c.destroy();
    teardownDOM();
});

test("reverse order: setOpen(false) after open never emits opening flash", async () => {
    setupDOM();
    const c = createOverlayCore({ defaultOpen: false });
    c.setOpen(true);
    await flushMicrotasks();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(c.status(), "open", "precondition: settled open");

    const seen = [];
    c.status.subscribe((s) => seen.push(s));

    c.setOpen(false);
    c.setOpen(true);

    await new Promise((r) => setTimeout(r, 10));

    // Once "opening" has been observed (the re-open winning), a later
    // "closed" would mean a superseded close finalize slipped through and
    // reverted the newer open -- the H-01 flash in reverse.
    let sawOpening = false;
    let staleClosedAfterOpening = false;
    for (const s of seen) {
        if (s === "opening") sawOpening = true;
        else if (s === "closed" && sawOpening) staleClosedAfterOpening = true;
    }
    assert.equal(staleClosedAfterOpening, false, `no stale closed-after-opening; saw: ${JSON.stringify(seen)}`);
    assert.equal(c.status(), "open");

    c.destroy();
    teardownDOM();
});

test("controlled mode: superseded read-back does not emit a stale status", async () => {
    setupDOM();
    const ext = signal(false);
    const c = createOverlayCore({
        open: ext,
        onOpenChange: (next) => ext.set(next), // consumer flips synchronously, no veto
    });

    const seen = [];
    c.status.subscribe((s) => seen.push(s));

    c.setOpen(true, "trigger");
    c.setOpen(false, "trigger");

    await new Promise((r) => setTimeout(r, 10));

    const LEGAL = new Set(["closed>opening", "opening>open", "open>closing", "closing>closed"]);
    for (let i = 1; i < seen.length; i++) {
        if (seen[i] === seen[i - 1]) continue; // repeats are fine
        const pair = seen[i - 1] + ">" + seen[i];
        assert.ok(LEGAL.has(pair), `illegal transition ${pair} in stream ${JSON.stringify(seen)}`);
    }

    c.destroy();
    teardownDOM();
});
