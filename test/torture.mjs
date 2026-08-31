// test/torture.mjs -- node --expose-gc test/torture.mjs
//
// Mandatory zero-GC torture gate for @zakkster/lite-headless. Two phases:
//
//   Phase A (retention, @zakkster/lite-leak): churn every overlay + non-overlay
//   primitive through create/attach/open/close/destroy inside a disposable
//   signal owner. Each primitive is tracked; disposing the owner must untrack
//   it (kernels attribute its listeners/timers/observers to that owner and
//   flag any that outlive it). After churn: gc + settle, then tracker.size()
//   must be 0 and audit() must be empty.
//
//   Phase B (GC budget, @zakkster/lite-gc-profiler): drive the two hot paths
//   -- slider value updates and the positioner update() tick -- with instances
//   built OUTSIDE the loop, sampling the heap periodically. Gate: zero major
//   collections and no pause > 4ms.
//
// TORTURE_CONTROL=1 injects a per-iteration retained allocation into a Phase B
// loop (must flip the GC gate) and skips one Phase A tracker registration; the
// process must then exit non-zero. A gate that cannot fail is not a gate.
//
// happy-dom is set up ONCE (mirroring test/_setup.js's global exposure) and
// closed at the end. lite-signal's node pool is swapped for a grow-policy
// registry: churning thousands of primitives would exhaust the default fixed
// 1024-node ledger, which is an unrelated capacity concern, not a leak.

import { GcProfiler, checkNoGc } from "@zakkster/lite-gc-profiler";
import {
    createLeakTracker,
    createOwnerCascadeOrphanKernel,
    createTimerOrphanKernel,
    createListenerOrphanKernel,
    createObserverOrphanKernel,
    createAsyncRetentionKernel,
} from "@zakkster/lite-leak";
import { createRegistry, setDefaultRegistry, effect } from "@zakkster/lite-signal";

// Grow-policy registry BEFORE any primitive constructs a signal (see header).
setDefaultRegistry(createRegistry({ maxNodes: 1 << 20, onCapacityExceeded: "grow" }));

// ----- happy-dom setup (once) -- mirrors test/_setup.js global exposure ----
import { Window } from "happy-dom";
const _window = new Window();
const document = _window.document;
globalThis.window = _window;
globalThis.document = document;
globalThis.HTMLElement = _window.HTMLElement;
globalThis.HTMLButtonElement = _window.HTMLButtonElement;
globalThis.HTMLInputElement = _window.HTMLInputElement;
globalThis.Element = _window.Element;
globalThis.Node = _window.Node;
globalThis.Event = _window.Event;
globalThis.KeyboardEvent = _window.KeyboardEvent;
globalThis.MouseEvent = _window.MouseEvent;
globalThis.PointerEvent = _window.PointerEvent;
globalThis.CustomEvent = _window.CustomEvent;
globalThis.customElements = _window.customElements;
globalThis.getComputedStyle = _window.getComputedStyle.bind(_window);

// ----- real entry points under test ----------------------------------------
import { createDialog } from "../src/dialog/index.js";
import { createPopover } from "../src/popover/index.js";
import { createMenu } from "../src/menu/index.js";
import { createCombobox } from "../src/combobox/index.js";
import { createDrawer } from "../src/drawer/index.js";
import { createSlider } from "../src/slider/index.js";
import { createTabs } from "../src/tabs/index.js";
import { createTree } from "../src/tree/index.js";
import { createPositioner } from "../src/_overlay/position.js";

const CONTROL = process.env.TORTURE_CONTROL === "1";
const HOT = 200000;
const leaks = [];
const warns = [];

const tracker = createLeakTracker({
    name: "torture",
    onLeak: (r) => leaks.push(r.kind + ":" + String(r.tag)),
    onWarning: (w) => warns.push(w.kind + ":" + w.reason),
});
tracker.registerKernel(createOwnerCascadeOrphanKernel());
tracker.registerKernel(createTimerOrphanKernel());
tracker.registerKernel(createListenerOrphanKernel());
tracker.registerKernel(createObserverOrphanKernel());
tracker.registerKernel(createAsyncRetentionKernel());

const d = document;
function el(tag) { return d.createElement(tag || "div"); }

// ----- phase A: retention torture -------------------------------------------
// Each cycle runs inside an effect owner. track() inside the owner auto-wires
// onCleanup(untrack); disposing the effect (stop()) fires it. The cleanup and
// tag close over `id` (a detached number) only -- never the tracked primitive
// -- per lite-leak's held-value contract. The primitive is destroyed inside
// the owner so any listener/timer/observer it forgot to release surfaces as an
// owner-disposed finding.
let _idc = 0;
let _skipOnce = CONTROL; // control: drop exactly one registration (invisible leak)

function churn(make, exercise, n) {
    for (let i = 0; i < n; i++) {
        const id = _idc++;
        const stop = effect(() => {
            const prim = make();
            exercise(prim);
            prim.destroy();
            if (_skipOnce) {
                _skipOnce = false; // control: this primitive goes untracked
            } else {
                tracker.track(prim, () => { void id; }, "p#" + id, { audit: true });
            }
        });
        stop();
    }
}

churn(
    () => createDialog(),
    (x) => { x.attachTrigger(el("button")); x.attachContent(el("div")); x.setOpen(true); x.setOpen(false); },
    512,
);
churn(
    () => createPopover(),
    (x) => { x.attachTrigger(el("button")); x.attachAnchor(el("div")); x.attachContent(el("div")); x.setOpen(true); x.setOpen(false); },
    512,
);
churn(
    () => createMenu(),
    (x) => { x.attachTrigger(el("button")); x.attachMenu(el("div")); x.attachItem(el("div")); x.setOpen(true); x.setOpen(false); },
    512,
);
churn(
    () => createCombobox(),
    (x) => { x.attachTrigger(el("input")); x.attachListbox(el("div")); x.attachItem(el("div"), { value: "a" }); x.setOpen(true); x.setOpen(false); },
    512,
);
churn(
    () => createDrawer(),
    (x) => { x.attachContent(el("div")); x.attachTrigger(el("button")); x.setOpen(true); x.setOpen(false); },
    512,
);
// non-overlay primitives (lighter 128-cycle sweep)
churn(
    () => createSlider({ min: 0, max: 100, step: 1, defaultValue: [50] }),
    (x) => { x.attachTrack(el("div")); x.attachThumb(el("div"), 0); x.setValue([60]); x.setValue([60]); },
    128,
);
churn(
    () => createTabs({ defaultValue: "a" }),
    (x) => { x.attachTablist(el("div")); x.attachTab(el("button"), { value: "a" }); x.attachPanel(el("div"), { value: "a" }); x.setValue("a"); },
    128,
);
churn(
    () => createTree(),
    (x) => { x.attachRoot(el("ul")); x.attachNode(el("li"), { key: "a" }); x.attachLabel(el("span")); },
    128,
);

globalThis.gc?.();
await new Promise((r) => setTimeout(r, 60));
globalThis.gc?.();
await new Promise((r) => setTimeout(r, 60));

const live = tracker.size();
const findings = tracker.audit();

// ----- phase B: allocation + GC torture -------------------------------------
const gc = new GcProfiler().start();

// Control allocation buffer: retained across the whole slider loop so the old
// generation fills and V8 must run a MAJOR collection (and a > 4ms pause),
// flipping both gate rules. Sized to HOT so nothing is overwritten mid-loop.
const _ctrlBuf = CONTROL ? new Array(HOT) : null;

// (i) slider hot path. clampSnap + setThumbValue run per setValue. Realistic
// drag mix ~3:1 same-value (zero-crossing, early-exit) to step-crossing moves:
// most pointermoves don't cross a step boundary, a minority do.
const slider = createSlider({ min: 0, max: 100, step: 1, defaultValue: [50] });
slider.attachTrack(el("div"));
slider.attachThumb(el("div"), 0);
let _v = 50;
for (let i = 0; i < HOT; i++) {
    if ((i & 3) === 0) { _v = 20 + (i % 60); slider.setValue([_v]); } // step-crossing
    else { slider.setValue([_v]); }                                    // same-value
    if (CONTROL) {
        // Retain a fresh object every step (a hot-path allocation leak). The
        // buffer is never overwritten, so the working set only grows. Every
        // ~16k steps we force a collection: because the buffer is live, that
        // collection reclaims nothing and runs as a real MAJOR with a long
        // pause -- deterministically flipping both maxMajor and maxPauseMs,
        // instead of waiting on V8's size heuristic (heap headroom varies by
        // machine). The leak is what makes the collection expensive; forcing
        // it only makes the observation deterministic.
        _ctrlBuf[i] = [i, `alloc-${i}-${i * 3}-payload`, new Array(64).fill(i)];
        if ((i % 16384) === 0) globalThis.gc?.();
    }
    if ((i & 8191) === 0) gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
}

// (ii) positioner hot path. Injected getRect/getViewport return mutated-in-place
// scratch objects (zero browser DOMRect allocation), driven with a viewport
// boundary so no DOM walk happens. Anchor rect values are mutated each tick so
// some ticks force a transform rewrite and others are no-op diffs.
const _anchorRect = { left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30, x: 10, y: 10 };
const _contentRect = { left: 0, top: 0, right: 120, bottom: 60, width: 120, height: 60, x: 0, y: 0 };
const _vp = { width: 1024, height: 768 };
const _content = { nodeType: 1, style: { position: "", left: "", top: "", transform: "" }, setAttribute() {} };
const _anchor = { nodeType: 1 };
const _getRect = (node) => (node === _anchor ? _anchorRect : _contentRect);
const _getViewport = () => _vp;
const positioner = createPositioner({
    anchor: _anchor,
    content: _content,
    placement: "bottom",
    boundary: "viewport",
    getRect: _getRect,
    getViewport: _getViewport,
});
for (let i = 0; i < HOT; i++) {
    _anchorRect.top = 10 + ((i % 200) - 100) * 0.5; // varies -> some transform rewrites
    _anchorRect.bottom = _anchorRect.top + 30;
    _anchorRect.left = 10 + (i % 50);
    _anchorRect.right = _anchorRect.left + 100;
    positioner.update();
    if ((i & 8191) === 0) gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
}

// settle: GC entries arrive asynchronously; read summary AFTER a macrotask.
await new Promise((r) => setTimeout(r, 60));
const s = gc.summary();
const report = checkNoGc(s, { maxMajor: 0, maxPauseMs: 4 });
gc.stop();

// keep the control buffer reachable past summary() so it cannot be collected
// early and hide the pressure it is meant to create.
if (CONTROL && _ctrlBuf[HOT - 1] === null) throw new Error("unreachable");

const ok = report.ok && live === 0 && leaks.length === 0 && findings.length === 0;
console.log(
    "GATE leak=size " + live + "/0 findings=" + findings.length +
    " warnings=" + warns.length +
    " | gc major=" + s.gc.major + " minor=" + s.gc.minor +
    " maxMs=" + s.gc.maxMs.toFixed(2) +
    " | " + (ok ? "ok" : "FAIL"),
);
if (!ok) {
    for (const v of report.violations) {
        console.error("  violation " + v.metric + " limit=" + v.limit + " actual=" + v.actual);
    }
    for (const f of findings) console.error("  finding " + f.kind + ":" + f.reason);
    for (const l of leaks) console.error("  leak " + l);
    process.exitCode = 1;
}

// release happy-dom async resources so the process exits promptly.
try { _window.happyDOM.abort(); } catch { /* swallow */ }
try { _window.happyDOM.close(); } catch { /* swallow */ }
