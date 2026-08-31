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
// closed at the end. The harness runs on lite-signal's DEFAULT fixed
// 1024-node registry ON PURPOSE (H-12): destroy() seals every factory-owned
// signal back into the pool, so thousands of create/destroy cycles never
// exceed the concurrent-node ceiling. This file used to swap in a 1<<20
// grow-policy registry to survive churn -- that swap was masking a real
// disposal gap (signals were never returned on destroy), not an unrelated
// capacity concern. If a factory regresses, phase A now fails fast with
// lite-signal's CapacityError. The per-factory exact-return proof lives in
// test/signal-pool.test.js (H-12), which churns every barrel factory on a
// 256-node registry.

import { GcProfiler, checkNoGc } from "@zakkster/lite-gc-profiler";
import {
    createLeakTracker,
    createOwnerCascadeOrphanKernel,
    createTimerOrphanKernel,
    createListenerOrphanKernel,
    createObserverOrphanKernel,
    createAsyncRetentionKernel,
} from "@zakkster/lite-leak";
import { effect } from "@zakkster/lite-signal";

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
import { createTooltip } from "../src/tooltip/index.js";
import { createFloatingPositioner } from "../src/floating-adapter.js";
// signal-owning factories fixed for H-12 (destroy() must dispose owned signals)
import { createAvatar } from "../src/avatar/index.js";
import { createTour } from "../src/tour/index.js";
import { createSwitch } from "../src/switch/index.js";
import { createAnchor } from "../src/anchor/index.js";
import { createSplitPanels } from "../src/split-panels/index.js";
import { createTagInput } from "../src/tag-input/index.js";
import { createBreadcrumb } from "../src/breadcrumb/index.js";
import { createColorPicker } from "../src/color-picker/index.js";
import { createMeter } from "../src/meter/index.js";
import { createNotificationCenter } from "../src/notification-center/index.js";
import { createTag } from "../src/tag/index.js";
import { createDatePicker } from "../src/datepicker/index.js";

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
// H-12 signal-owning factories: create/attach/exercise/destroy must return
// every pooled signal node. Any signal the destroy() forgot to dispose would
// surface here as a retained node (and, without the grow registry, exhaust the
// default 1024-node ledger). 256 cycles each -- enough to blow a fixed pool.
churn(
    () => createAvatar({ src: "x.jpg", name: "Alice Lee" }),
    (x) => { x.attachRoot(el("span")); x.attachImage(el("img")); x.attachFallback(el("span")); x.setSrc("y.jpg"); },
    256,
);
churn(
    () => createTour(),
    (x) => { x.attachRoot(el("div")); x.addStep({ id: "a", target: el("div") }); x.attachStepContent("a", el("div")); x.start(); },
    256,
);
churn(
    () => createSwitch({ defaultChecked: false }),
    (x) => { x.attachRoot(el("button")); x.attachThumb(el("span")); x.toggle(); x.setDisabled(true); },
    256,
);
churn(
    () => createAnchor(),
    (x) => { x.attachRoot(el("nav")); x.attachLink(el("a"), el("section"), "a"); x._setActiveForTest("a"); },
    256,
);
churn(
    () => createSplitPanels({ orientation: "horizontal" }),
    (x) => { x.attachContainer(el("div")); x.attachPanel(el("div"), 0, { defaultSize: 30 }); x.attachPanel(el("div"), 1, { defaultSize: 70 }); x.attachHandle(el("div"), 0); x.setLayout([40, 60]); },
    256,
);
churn(
    () => createTagInput({ initialValue: ["a"] }),
    (x) => { x.attachRoot(el("div")); x.attachInput(el("input")); x.addTag("b"); x.removeLast(); },
    256,
);
churn(
    () => createBreadcrumb(),
    (x) => { x.attachRoot(el("nav")); x.attachList(el("ol")); x.attachItem(el("li"), "home"); x.attachItem(el("li"), "here"); x.setCurrent("home"); },
    256,
);
churn(
    () => createColorPicker({ defaultHex: "#7dd3fc" }),
    (x) => { x.attachRoot(el("div")); x.attachArea(el("div")); x.attachHueSlider(el("div")); x.setHue(120); x.setAlpha(0.5); },
    256,
);
churn(
    () => createMeter({ value: 0.5, low: 0.2, high: 0.8, optimum: 1 }),
    (x) => { x.attachRoot(el("div")); x.attachFill(el("div")); x.setValue(0.7); x.setValueText("70%"); },
    256,
);
churn(
    () => createNotificationCenter(),
    (x) => { x.attachRoot(el("div")); x.attachUnreadBadge(el("span")); x.add({ id: "1", title: "hi" }); x.attachItem(el("li"), "1"); x.markRead("1"); x.setFilter({ kind: "info" }); },
    256,
);
churn(
    () => createTag({ closable: true, intent: "primary" }),
    (x) => { x.attachRoot(el("span")); x.attachCloseButton(el("button")); x.setIntent("success"); x.close(); },
    256,
);
churn(
    () => createDatePicker({ mode: "range" }),
    (x) => { x.attachGrid(el("div")); x.attachMonthLabel(el("div")); x.attachDay(el("div"), new Date(2026, 0, 15)); x.setView("months"); x.setView("days"); },
    256,
);

// H5 floating-adapter retention sweep -- runs last in phase A, on the SAME
// default fixed 1024-node registry as everything above. lite-floating >=1.1.0
// pool-returns its x/y/placement/isPositioned output signals on dispose()
// (the H-12 seal pattern, ported there), so 512 create/open/close/destroy
// cycles no longer accumulate registry nodes; a regression in either the
// adapter's destroy() or lite-floating's pool return now fails fast as
// lite-signal's CapacityError. (Before 1.1.0 this sweep needed a grow-policy
// registry because lite-floating reclaimed via FinalizationRegistry/GC.)
// Retention proof is unchanged: tracker.size() -> 0 and audit() empty prove
// the adapter's destroy() disposes the floating effect and unwires its
// scroll/resize listeners.
churn(
    () => createTooltip({ positioner: createFloatingPositioner() }),
    (x) => { x.attachTrigger(el("button")); x.attachAnchor(el("div")); x.attachContent(el("div")); x.setOpen(true); x.setOpen(false); },
    512,
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

// (iii) floating-adapter hot path. The adapter wraps @zakkster/lite-floating;
// each update() forwards to the floating handle's compute (synchronous here --
// no requestAnimationFrame global -- so every tick recomputes). The anchor rect
// is held CONSTANT so the steady-state (element-has-not-moved) tick is proven
// allocation-free: lite-signal equality-gates x/y/placement, so bindTransform
// and the diffed placement paint never re-fire, and encodePlacement's
// zero-suffix concat returns the interned side string. A heapUsed-delta guard
// (< 65536 bytes across 200000 ticks) catches any per-tick retention the GC
// budget alone might miss. Fake anchor/content are plain objects with a shared
// mutable rect (zero browser DOMRect allocation), matching phase (ii).
const _faRect = { x: 20, y: 20, left: 20, top: 20, right: 120, bottom: 50, width: 100, height: 30 };
const _faCRect = { x: 0, y: 0, left: 0, top: 0, right: 120, bottom: 60, width: 120, height: 60 };
const _faAnchor = { nodeType: 1, getBoundingClientRect() { return _faRect; } };
const _faContent = {
    nodeType: 1,
    style: {},
    getBoundingClientRect() { return _faCRect; },
    getAttribute() { return null; },
    setAttribute() {},
    hasAttribute() { return false; },
    removeAttribute() {},
};
const _faFactory = createFloatingPositioner();
const _faHandle = _faFactory({
    anchor: _faAnchor,
    content: _faContent,
    placement: "bottom",
    offset: 8,
    flip: true,
    shift: true,
    boundary: "viewport",
});
_faHandle.update(); // one-time initial compute + signal/paint seed
for (let i = 0; i < HOT; i++) {
    _faHandle.update();
    if ((i & 8191) === 0) gc.sampleHeap(performance.now(), process.memoryUsage().heapUsed);
}

// settle: GC entries arrive asynchronously; read summary AFTER a macrotask.
await new Promise((r) => setTimeout(r, 60));
const s = gc.summary();
const report = checkNoGc(s, { maxMajor: 0, maxPauseMs: 4 });
gc.stop();

// floating-adapter RETENTION guard. Runs OUTSIDE the profiler window: the two
// forced collections here would otherwise register as majors and pollute the
// GC budget asserted above. The steady-state (element-not-moved) update tick
// produces only transient young-gen garbage (lite-floating reads window.inner*
// each compute); a full GC on both ends reclaims it, so a genuinely non-
// retaining path lands a near-zero delta. A per-tick RETENTION would survive
// the trailing GC and blow the 64 KiB ceiling.
globalThis.gc?.();
const _faHeapBefore = process.memoryUsage().heapUsed;
for (let i = 0; i < HOT; i++) {
    _faHandle.update();
}
globalThis.gc?.();
const _faHeapAfter = process.memoryUsage().heapUsed;
const _faHeapDelta = _faHeapAfter - _faHeapBefore;
const _faAllocPerOp = _faHeapDelta > 0 ? Math.round(_faHeapDelta / HOT) : 0;
const _faHeapOk = _faHeapDelta < 65536;
_faHandle.destroy();

// keep the control buffer reachable past summary() so it cannot be collected
// early and hide the pressure it is meant to create.
if (CONTROL && _ctrlBuf[HOT - 1] === null) throw new Error("unreachable");

const ok = report.ok && live === 0 && leaks.length === 0 && findings.length === 0 && _faHeapOk;
console.log(
    "GATE leak=size " + live + "/0 findings=" + findings.length +
    " warnings=" + warns.length +
    " | gc major=" + s.gc.major + " minor=" + s.gc.minor +
    " maxMs=" + s.gc.maxMs.toFixed(2) +
    " | alloc=" + _faAllocPerOp + " B/op" +
    " | " + (ok ? "ok" : "FAIL"),
);
if (!ok) {
    for (const v of report.violations) {
        console.error("  violation " + v.metric + " limit=" + v.limit + " actual=" + v.actual);
    }
    for (const f of findings) console.error("  finding " + f.kind + ":" + f.reason);
    for (const l of leaks) console.error("  leak " + l);
    if (!_faHeapOk) console.error("  violation floating-adapter heapDelta limit=65536 actual=" + _faHeapDelta);
    process.exitCode = 1;
}

// release happy-dom async resources so the process exits promptly.
try { _window.happyDOM.abort(); } catch { /* swallow */ }
try { _window.happyDOM.close(); } catch { /* swallow */ }
