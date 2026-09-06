// test/torture.mjs -- node --expose-gc test/torture.mjs
//
// Mandatory zero-GC torture gate for @zakkster/lite-headless. Three phases:
//
//   Phase A (retention, @zakkster/lite-leak): churn every overlay + non-overlay
//   primitive through create/attach/open/close/destroy inside a disposable
//   signal owner. Each primitive is tracked; disposing the owner must untrack
//   it (kernels attribute its listeners/timers/observers to that owner and
//   flag any that outlive it). After churn: gc + settle, then tracker.size()
//   must be 0 and audit() must be empty.
//
//   Phase B (GC budget, @zakkster/lite-gc-profiler): drive four hot loops --
//   slider setValue mix, time-picker segment spin, positioner update() tick,
//   floating-adapter update() tick -- with instances built OUTSIDE the loop,
//   sampling the heap periodically. Gate: checkNoGc({maxMajor:0,maxPauseMs:4})
//   plus one gc-bracketed heapUsed-delta guard (< 65536 B / 200k ops) on the
//   floating adapter. Phase B watches for MAJOR collections and retained
//   growth; it is blind to per-op transient garbage (perf_hooks GC entries are
//   event-loop-deferred, so gc.minor reads 0 mid-loop, and a gc-bracketed
//   delta reclaims transients by construction).
//
//   Phase C (transient witness, test/torture/harness.mjs): the new-space
//   bump-allocator delta lane that CAN see per-op transient garbage Phase B
//   cannot. Each window is measured MIN-OF-N: it runs up to N back-to-back
//   attempts and keeps the smallest valid new-space delta -- real per-op garbage
//   reproduces in every attempt, while one-off background-runtime noise
//   (optimizer/GC bookkeeping landing in an otherwise-clean window) cannot
//   survive an immediate retry; every attempt voiding fails closed. Windows are
//   classified by the happy-dom trap. ENGINE windows drive a primitive's state
//   machine with no DOM crossing inside the loop and are GATED at <= 16384 B /
//   50000 ops (~0 B/op): E2 stepper spin, E3 pin-input setValue, E4 time-picker
//   spin, E5s positioner steady-state tick, E6 floating-adapter tick. A window
//   with a large hot body warms per-window past V8 tier-up before it measures
//   (E3 and E5s use 30000; the un-optimized call frame boxes bytes that are a
//   JIT tiering artifact, not primitive garbage). DOM windows must cross
//   happy-dom and are RECORDED against a once-per-run empty-op calibration floor
//   (F0, printed on the GATE line; the floor varies per run), each with a PINNED
//   literal ratchet = ceil(max_measured * 1.25) + 4096 that catches regression,
//   not zero: E1 combobox highlight (reclassified DOM -- no public highlight
//   mutator, the honest drive dispatches a real ArrowDown), E5 positioner MOVING
//   tick (one transform string per move, unavoidable by DOM contract), D1 slider
//   setValue mix, D2 time-picker attached spin, D3 dialog open/close toggle incl.
//   focus trap. Each window opens and closes alone, strictly sequential.
//
// Two control modes prove the gate can fail. TORTURE_CONTROL=1 injects a
// per-iteration retained allocation into a Phase B loop (must flip the GC gate)
// and skips one Phase A tracker registration; the process must then exit
// non-zero. TORTURE_CONTROL=transient injects dead per-op garbage into the E4
// window: Phase A and Phase B are provably blind to it (they report clean --
// "h8 transient witness sees") and only the Phase C witness kills the run. A
// gate that cannot fail is not a gate.
//
// The GATE line carries the Phase C summary before the terminal ok|FAIL:
// `alloc=<n> B/op` (Phase B), then `transient gated=<n>/<n>
// budget=16384B/50000ops worst=<N>B(<window>)` and `transient rec=<n>
// floor=<N>B/512ops`.
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
// Phase C transient witness (new-space bump-allocator delta lane): min-of-N
// windows over the ported harness, gated ENGINE + recorded DOM (see header).
import {
    allocTotal,
    allocTotalMin,
    newSpaceUsed,
    check,
    die,
    ENGINE_BUDGET,
    ENGINE_OPS,
    ENGINE_WARMUP,
    DOM_WARMUP,
} from "./torture/harness.mjs";

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
import { createTimePicker } from "../src/time-picker/index.js";
// Phase C engine-window drive surfaces (transient witness, Mission 2)
import { createStepper } from "../src/stepper/index.js";
import { createPinInput } from "../src/pin-input/index.js";

const CONTROL = process.env.TORTURE_CONTROL === "1";
// T8 transient control: a SEPARATE mode that injects dead transient garbage into
// a GATED Phase C window (E4) to prove the transient witness itself can fail.
// CONTROL === "1" (retention/major-GC control) semantics are untouched.
const CONTROL_TRANSIENT = process.env.TORTURE_CONTROL === "transient";
// Overwritten every op in transient mode so NOTHING accumulates: each [i] is
// dead the next op -- invisible to Phase A retention (never tracked) and too
// small/short-lived for a major GC, but the new-space delta witness sees the
// per-op churn. ~32 B/op x 50000 ops = ~1.6 MB: over ENGINE_BUDGET (16384) yet
// under the harness SHRINK_CEILING (4194304), so E4's window returns a real
// over-budget total and its check() dies with the normal budget thunk.
let _t8sink = null;
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
// H7 G-01: multi-select combobox toggle churn. Each cycle attaches trigger +
// listbox + items, toggles membership on and off (the reused-Set + snapshot
// path), attaches + removes a chip, then destroys. destroy() seals the
// multi-select bump signal back into the pool (H-12) alongside the value
// signal; a regression would exhaust the fixed 1024-node registry here.
churn(
    () => createCombobox({ multiple: true }),
    (x) => {
        x.attachTrigger(el("input")); x.attachListbox(el("div"));
        x.attachItem(el("div"), { value: "a" }); x.attachItem(el("div"), { value: "b" });
        x.toggleValue("a"); x.toggleValue("b"); x.toggleValue("a");
        const chip = el("span"); const off = x.attachChip(chip, "b"); off();
        x.setOpen(true); x.setOpen(false);
    },
    256,
);
// H7 G-04: time-picker create/destroy churn. Attaches all three segments +
// a listbox slot, spins, then destroys. destroy() seals the hour + minute
// signals back into the pool (H-12).
churn(
    () => createTimePicker({ hour12: true, defaultValue: { hour: 9, minute: 5 } }),
    (x) => {
        x.attachHourSegment(el("span")); x.attachMinuteSegment(el("span")); x.attachMeridiem(el("span"));
        x.attachSlotList(el("div")); x.attachSlot(el("div"), { hour: 10, minute: 30 });
        x.spinHour(1); x.spinMinute(1); x.toggleMeridiem();
    },
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

// (i.b) time-picker segment spin hot path. The instance is built OUTSIDE the
// loop with its segments attached; spinMinute/spinHour run the reflection
// effect + dirty-checked setAttr each step. hour12 was resolved ONCE at
// construction, so no per-spin Intl call is made and the typeahead buffer is a
// single reused object -- a steady-state spin must be allocation-free.
const _tp = createTimePicker({ hour12: true, defaultValue: { hour: 0, minute: 0 } });
_tp.attachHourSegment(el("span"));
_tp.attachMinuteSegment(el("span"));
_tp.attachMeridiem(el("span"));
for (let i = 0; i < HOT; i++) {
    _tp.spinMinute(1);
    if ((i & 15) === 0) _tp.spinHour(1);
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

// ============================================================================
// Phase C: transient witness (new-space bump-allocator delta lane).
//
// Runs here, AFTER the floating-adapter retention guard and while happy-dom is
// still alive. Phase B's profiler is already stopped (gc.stop() above), so the
// gc() calls allocTotal makes for a clean-slate sample cannot pollute the
// checkNoGc summary asserted above. Each window is opened and measured ALONE,
// strictly sequential: all scratch, closures, and drive tables are built
// OUTSIDE each measured window, and every window body is a hoisted named
// function (never an inline arrow rebuilt per call). A window that fails its
// budget dies immediately via check() (harness semantics). Each window prints
// its own line here; T9 (later mission) folds these into the GATE line.
// ============================================================================

// PLAN RISK 2 mitigation (op count reduced for DOM-crossing windows only).
// MEASURED: happy-dom's setAttribute allocates ~2940 B/op and the combobox
// keydown dispatch ~7385 B/op of new-space transient. At the harness DOM_OPS
// (5000) the floor alone is ~14.7 MB, which trips the harness SHRINK_CEILING
// (4194304 B) fail-closed BEFORE a number can be recorded (and sits at the
// scavenge edge, so on a smaller new_space it would VOID nondeterministically).
// Per PLAN RISK 2 ("if a DOM window still VOIDs, halve ops for that window only
// and note the op count beside its number"), the DOM-crossing windows (F0, E1)
// run at reduced op counts sized to stay well under the ceiling with ~2x
// margin. NOTE FOR COORDINATOR (pre-T7): DOM_OPS=5000 is not viable under
// happy-dom; the harness constant needs a ruling (lower DOM_OPS, or raise the
// ceiling) before the T7 DOM windows land. The op count is printed in each
// line so the number is never read without its denominator.
const F0_OPS = 512;   // ~1.5 MB at ~2940 B/op -- under the 4194304 B ceiling
const E1_OPS = 256;   // ~1.9 MB at ~7385 B/op -- under the 4194304 B ceiling

// T9: worst gated window, tracked without arrays or closures -- two module lets
// updated right after each gated window passes its check. Folded into the GATE
// line so the heaviest gated total (and which window) is visible at a glance.
let _gatedWorst = 0;
let _gatedWorstName = "";

// ---- F0: calibration floor (calibration, NOT gated) ------------------------
// happy-dom's own attribute-write path is the floor every DOM-recorded window
// sits on. ONE real element built outside the window; two pre-built constant
// strings alternated per op so no same-value fast path hides the write; the
// constants mean zero caller-side allocation, so the delta is happy-dom's write
// path alone -- the floor. Measured ONCE per run, before any other Phase C
// window. Stored in _floorBytes for later missions (DOM windows land in T7).
const _calEl = el("div");
const _CAL_A = "0";
const _CAL_B = "1";
function _floorWindow(i) {
    _calEl.setAttribute("data-cal", (i & 1) === 0 ? _CAL_A : _CAL_B);
}
let _floorBytes = allocTotalMin(_floorWindow, F0_OPS, DOM_WARMUP, 2);
console.log("transient F0 floor=" + _floorBytes + "B/" + F0_OPS + "ops");

// ---- E4: time-picker spin (ENGINE, gated) ----------------------------------
// CLASS ruling: ENGINE -- no segments attached, so the reflection effect reads
// the value signals but touches NO DOM (every _hourEl/_minuteEl/_meridiemEl is
// null). DRIVE: spinMinute(1) every op, spinHour(1) every 16th (mirrors phase-B
// loop i.b's mix). Both walk read/normalize/write on the pooled value signals
// only. HONEST: state observably advances -- the post-window probe below spins
// once more and asserts the minute value moved (wrap-safe: m+1 mod 60 != m).
const _e4 = createTimePicker({ hour12: true, defaultValue: { hour: 0, minute: 0 } });
function _e4Window(i) {
    _e4.spinMinute(1);
    if ((i & 15) === 0) _e4.spinHour(1);
    if (CONTROL_TRANSIENT) _t8sink = [i]; // dead transient garbage (control only)
}
const _e4Total = allocTotalMin(_e4Window, ENGINE_OPS, ENGINE_WARMUP, 3, ENGINE_BUDGET);
const _e4m0 = _e4.minute();
_e4.spinMinute(1);
if (_e4.minute() === _e4m0) die("E4 time-picker: spinMinute did not advance value (dishonest window)");
if (CONTROL_TRANSIENT) {
    console.log("CONTROL transient: phaseA live=" + live + " findings=" + findings.length + " | phaseB major=" + s.gc.major + " ok=" + report.ok + " -- h8 transient witness sees");
}
check(
    _e4Total <= ENGINE_BUDGET,
    () => "E4 time-picker " + _e4Total + " B over " + ENGINE_OPS + " ops (budget " + ENGINE_BUDGET + " B total, ~0 B/op)",
);
if (_e4Total > _gatedWorst) { _gatedWorst = _e4Total; _gatedWorstName = "E4"; }
console.log("transient E4 time-picker=" + _e4Total + "B/" + ENGINE_OPS + "ops ok");

// ---- E2: stepper spin (ENGINE, gated) --------------------------------------
// CLASS ruling: ENGINE -- no input/readout attached, so syncDisplay short-
// circuits on the null _input and attachReadout's effect never exists;
// increment() runs publish -> normalize (clamp + step-snap) on the pooled value
// signal only, no DOM. Wide range (0..1e9, step 1) so the walk never clamps.
// DRIVE: increment() per op. HONEST: value advances by step every op -- the
// post-window probe increments once more and asserts the value moved.
const _e2 = createStepper({ min: 0, max: 1e9, step: 1, defaultValue: 0 });
function _e2Window(i) { _e2.increment(); }
const _e2Total = allocTotalMin(_e2Window, ENGINE_OPS, ENGINE_WARMUP, 3, ENGINE_BUDGET);
const _e2v0 = _e2.value();
_e2.increment();
if (_e2.value() === _e2v0) die("E2 stepper: increment did not advance value (dishonest window)");
check(
    _e2Total <= ENGINE_BUDGET,
    () => "E2 stepper " + _e2Total + " B over " + ENGINE_OPS + " ops (budget " + ENGINE_BUDGET + " B total, ~0 B/op)",
);
if (_e2Total > _gatedWorst) { _gatedWorst = _e2Total; _gatedWorstName = "E2"; }
console.log("transient E2 stepper=" + _e2Total + "B/" + ENGINE_OPS + "ops ok");

// ---- E3: pin-input digit accept (ENGINE class, RECORDED -- tiering-blocked) --
// CLASS ruling: ENGINE -- NO inputs attached, so _repaintInputs iterates no Map
// and _focusInputAt finds no record (no queueMicrotask). setValue runs the
// _filter pattern walk + the _writeValue signal writes only -- no DOM crossing.
// DRIVE: cycle a pre-built table of 8 distinct full-length codes (built ONCE
// outside the window); setValue replaces the whole value so no reset is needed
// inside the body. HONEST: consecutive table entries differ so the value changes
// every op; the post-window probe sets a distinct value and asserts it moved.
//
// T10 PAYDOWN APPLIED (src/pin-input/index.js): the two allocators Mission 2
// found are fixed. (a) _filter now has a scan-only clean-input fast path that
// returns the input string ITSELF (identity, zero alloc) -- no more `out += c`
// intermediate string per char. (b) _repaintInputs early-returns before creating
// the Map iterator when nothing is attached. Together these cut the measured
// cost from ~362 B/op to ~0 B/op STEADY-STATE: a fully-warmed setValue allocates
// 0.36 B/op (measured at 100000 warmup), and the primitive is genuinely zero-GC
// once optimized.
//
// GATED with a PER-WINDOW WARMUP (coordinator ruling). setValue is a large
// multi-branch function (nested _filter/_writeValue/_repaintInputs/
// _focusInputAt + two try/catch callback arms), so at the suite ENGINE_WARMUP
// (1000) it is still in V8's baseline tier and the un-optimized call frame
// itself boxes ~40 B/op -- a JIT tiering artifact, not primitive garbage
// (proved: the _filter scan, the signal set, and Map.get are each ~0 in
// isolation), and it is unstable across runs (650 KB -> 350 KB -> 2.8 KB as
// the JIT climbs). The witness gates the primitive's steady state, not V8's
// tiering, so this window warms with E3_WARMUP (30000 > the ~15-20k tier-up
// point) instead of ENGINE_WARMUP. Fully warmed it is byte-stable: 2872 B /
// 50000 ops across four consecutive runs (fixed lazy-init, ~0 B/op steady) --
// the same profile as E6's 3304 B. Gating on ENGINE_WARMUP instead fails on
// the tiering artifact; the ruling and the artifact are documented here so a
// future window with a big hot body knows the precedent.
const E3_WARMUP = 30000;   // per-window: past V8 tier-up for the large setValue body
const _e3 = createPinInput({ length: 6 });
const E3_CODES = ["000000", "111111", "222222", "333333", "444444", "555555", "666666", "777777"];
function _e3Window(i) { _e3.setValue(E3_CODES[i & 7]); }
const _e3Total = allocTotalMin(_e3Window, ENGINE_OPS, E3_WARMUP, 3, ENGINE_BUDGET);
const _e3v0 = _e3.value();
_e3.setValue(_e3v0 === "999999" ? "888888" : "999999");
if (_e3.value() === _e3v0) die("E3 pin-input: setValue did not change value (dishonest window)");
check(
    _e3Total <= ENGINE_BUDGET,
    () => "E3 pin-input " + _e3Total + " B of transient garbage over " + ENGINE_OPS + " ops (budget 16384 B total, ~0 B/op)",
);
if (_e3Total > _gatedWorst) { _gatedWorst = _e3Total; _gatedWorstName = "E3"; }
console.log("transient E3 pin-input=" + _e3Total + "B/" + ENGINE_OPS + "ops ok");

// ---- E1: combobox highlight (RECLASSIFIED DOM-recorded, ratified) ----------
// PLAN ruling c classified E1 as ENGINE gated, driving highlight via a public
// setHighlight/moveHighlight on the returned handle. THAT SURFACE DOES NOT
// EXIST: setHighlight/moveHighlight are internal wrappers (src/combobox/
// index.js:179-180); the returned handle exposes no highlight mutator. The
// only public way to move the highlight is the trigger's keydown handler
// (src/combobox/index.js:367, moveHighlight on ArrowDown while open), which
// requires a REAL KeyboardEvent dispatched at a REAL trigger -- plain-object
// fakes have a noop addEventListener, so no listener is ever registered and a
// dispatch is inert. Driving E1 therefore crosses happy-dom every op (real
// event dispatch + roving attr writes). E1 is thus DOM-recorded over the F0
// floor, NOT gated (coordinator RATIFIED 2026-09-06). E1_OPS (256) keeps event
// dispatch (~7.3 KB/op) from overflowing new space (VOID). The event object is
// built ONCE outside the window and reused (verified safe in happy-dom).
// HONEST: 8 items + loop, so one ArrowDown always changes the index; the
// post-window probe dispatches once more and asserts the index moved.
// RATCHET (recorded-not-gated: catches REGRESSION past floor+dispatch, not zero).
// MEASURED (four runs): 1867584, 1889024, 1884248, 1883584 B / 256 ops.
// RATCHET = ceil(1889024 * 1.25) + 4096 = 2365376.
const E1_RATCHET = 2365376;
const _e1 = createCombobox();
const _e1Trigger = el("input");
const _e1Listbox = el("div");
_e1.attachTrigger(_e1Trigger);
_e1.attachListbox(_e1Listbox);
for (let _i = 0; _i < 8; _i++) _e1.attachItem(el("div"), { value: "v" + _i });
_e1.setOpen(true);
const _e1Down = new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true });
function _e1Window(i) { _e1Trigger.dispatchEvent(_e1Down); }
const _e1Total = allocTotalMin(_e1Window, E1_OPS, DOM_WARMUP, 2, E1_RATCHET);
const _e1a = _e1._highlightIndex();
_e1Trigger.dispatchEvent(_e1Down);
if (_e1a === _e1._highlightIndex()) die("E1 combobox: highlight did not move (dishonest window)");
_e1.destroy();
check(
    _e1Total <= E1_RATCHET,
    () => "E1 combobox " + _e1Total + " B over " + E1_OPS + " ops (ratchet " + E1_RATCHET + " B) -- regression past pinned floor+dispatch",
);
console.log("transient E1 combobox=" + _e1Total + "B/" + E1_OPS + "ops record floor=" + _floorBytes + "B");

// ---- E5: positioner update (RECLASSIFIED recorded -- coordinator ratify) ----
// PLAN ruling c / T6 classified E5 as ENGINE gated at ~0 B: the drive uses
// plain-object fakes, so no happy-dom crosses the loop. MEASUREMENT REFUTES ~0.
// loop (ii)'s drive mutates the anchor rect every op, so the rounded content
// coords change every op, so update() rewrites content.style.transform every op
// (src/_overlay/position.js:213-221). That write is a string concat --
// "translate3d(" + rx + "px," + ry + "px,0)" -- and building it allocates the
// intermediate + final strings (~128 B/op, measured 84712 B/512, 643296 B/5000).
// This is NOT happy-dom (the fake .style is a plain object); it is the engine's
// own transform write, which is UNAVOIDABLE when the positioned element moves --
// you cannot set a CSS transform without a string. The positioner's zero-alloc
// guarantee holds only for the STEADY-STATE (element-not-moved) tick, where the
// rx/ry diff short-circuits the write; a moving element allocates by DOM
// contract. At ENGINE_OPS (50000) that is ~6.4 MB -- over ENGINE_BUDGET AND past
// the SHRINK_CEILING (allocTotal dies before a number is recorded). So E5 is
// RECORDED at a ceiling-safe op count (E5_OPS), not gated -- the crossing is
// inherent at 1.5.1. FLAGGED for the coordinator ledger (no LH number invented
// here). HONEST: coords move every op; the post-window probe steps once more and
// asserts the resolved x moved.
const E5_OPS = 512;   // ~84 KB at ~128 B/op (moving transform) -- under ceiling
// RATCHET (recorded-not-gated: catches REGRESSION in the moving-transform cost,
// not zero). MEASURED (five runs: three prior + two this session): 84712, 117656,
// 117656, <R1>, <R2> B / 512 ops. RATCHET = ceil(max * 1.25) + 4096.
const E5_RATCHET = 151166;
const _e5AnchorRect = { left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30, x: 10, y: 10 };
const _e5ContentRect = { left: 0, top: 0, right: 120, bottom: 60, width: 120, height: 60, x: 0, y: 0 };
const _e5Vp = { width: 1024, height: 768 };
const _e5Content = { nodeType: 1, style: { position: "", left: "", top: "", transform: "" }, setAttribute() {} };
const _e5Anchor = { nodeType: 1 };
const _e5GetRect = (node) => (node === _e5Anchor ? _e5AnchorRect : _e5ContentRect);
const _e5GetViewport = () => _e5Vp;
const _e5Positioner = createPositioner({
    anchor: _e5Anchor,
    content: _e5Content,
    placement: "bottom",
    boundary: "viewport",
    getRect: _e5GetRect,
    getViewport: _e5GetViewport,
});
function _e5Window(i) {
    _e5AnchorRect.top = 10 + ((i % 200) - 100) * 0.5;
    _e5AnchorRect.bottom = _e5AnchorRect.top + 30;
    _e5AnchorRect.left = 10 + (i % 50);
    _e5AnchorRect.right = _e5AnchorRect.left + 100;
    _e5Positioner.update();
}
const _e5Total = allocTotalMin(_e5Window, E5_OPS, ENGINE_WARMUP, 2, E5_RATCHET);
const _e5x0 = _e5Content.style.transform;
_e5AnchorRect.left += 37; _e5AnchorRect.right += 37;
_e5Positioner.update();
if (_e5Content.style.transform === _e5x0) die("E5 positioner: transform did not move (dishonest window)");
check(
    _e5Total <= E5_RATCHET,
    () => "E5 positioner " + _e5Total + " B over " + E5_OPS + " ops (ratchet " + E5_RATCHET + " B) -- regression past pinned moving-transform cost",
);
console.log("transient E5 positioner=" + _e5Total + "B/" + E5_OPS + "ops record floor=" + _floorBytes + "B");

// ---- E5s: positioner steady-state (ENGINE gated) ---------------------------
// FRESH instance, NOT a reuse of _e5Positioner: reusing the moving window's
// instance inherits its JIT state (the E5 drive feeds double-valued rect
// fields, so the shared closures deopt/re-optimize mid-window), and the
// measurement was run-to-run unstable (2245248 -> 480128 -> 2872 B across
// identical runs -- optimizer allocation, not primitive garbage). A fresh
// positioner over CONSTANT INTEGER rects is monomorphic from birth and
// byte-stable. The anchor rect never mutates, so update() takes the no-op
// diff path (src/_overlay/position.js:213-221): rx/ry equal the last painted
// values and the transform string is NEVER rebuilt. This is the package's
// gated zero-GC positioner claim -- the steady-state (element-not-moved) tick
// is allocation-free. The MOVING-tick cost (one transform string per move,
// unavoidable by DOM contract) lives in E5's recorded number above. Warmup is
// E3_WARMUP-class (30000): update() is a large body and must be past V8
// tier-up before the window opens (the E3 per-window-warmup precedent). One
// update() outside the window seeds the diff baseline.
const _e5sAnchorRect = { left: 10, top: 10, right: 110, bottom: 40, width: 100, height: 30, x: 10, y: 10 };
const _e5sContentRect = { left: 0, top: 0, right: 120, bottom: 60, width: 120, height: 60, x: 0, y: 0 };
const _e5sVp = { width: 1024, height: 768 };
const _e5sContent = { nodeType: 1, style: { position: "", left: "", top: "", transform: "" }, setAttribute() {} };
const _e5sAnchor = { nodeType: 1 };
const _e5sGetRect = (node) => (node === _e5sAnchor ? _e5sAnchorRect : _e5sContentRect);
const _e5sPositioner = createPositioner({
    anchor: _e5sAnchor,
    content: _e5sContent,
    placement: "bottom",
    boundary: "viewport",
    getRect: _e5sGetRect,
    getViewport: () => _e5sVp,
});
_e5sPositioner.update(); // seed the no-op diff baseline at the constant rect
function _e5sWindow(i) { _e5sPositioner.update(); }
const _e5sTotal = allocTotalMin(_e5sWindow, ENGINE_OPS, 30000, 3, ENGINE_BUDGET);
// HONESTY probe (reviewer NIT-3): a steady-state window that measured a live
// no-op diff and one that measured a dead handle look identical, so prove the
// instance still computes: move the anchor once and assert the transform tracks.
const _e5st0 = _e5sContent.style.transform;
_e5sAnchorRect.left += 41; _e5sAnchorRect.right += 41;
_e5sPositioner.update();
if (_e5sContent.style.transform === _e5st0) die("E5s positioner-steady: transform did not track moved anchor (dishonest window)");
check(
    _e5sTotal <= ENGINE_BUDGET,
    () => "E5s positioner-steady " + _e5sTotal + " B of transient garbage over " + ENGINE_OPS + " ops (budget 16384 B total, ~0 B/op)",
);
if (_e5sTotal > _gatedWorst) { _gatedWorst = _e5sTotal; _gatedWorstName = "E5s"; }
console.log("transient E5s positioner-steady=" + _e5sTotal + "B/" + ENGINE_OPS + "ops ok");

// ---- E6: floating-adapter steady-state update (ENGINE gated) ---------------
// PLAN ruling c classified E6 as ENGINE gated at ~0 B. A cold 512-op window
// first measured 54680 B (~106 B/op) and suggested a DOM reclassification;
// the coordinator probe at ENGINE_OPS refuted that: 3304 B / 50000 ops,
// byte-identical across three runs -- a fixed lazy-init cost, ~0 B/op
// steady-state. The peer's window.inner* reads against the happy-dom Window
// do NOT allocate per op, so phase B loop (iii)'s "steady-state tick is
// allocation-free" claim is CONFIRMED by the witness, and E6 gates at the
// suite budget. HONEST: update() recomputes each op; the post-window probe
// moves the anchor rect and asserts the painted transform tracked it
// (bindTransform writes content.style.transform from the floating x/y
// signals).
const _e6Rect = { x: 20, y: 20, left: 20, top: 20, right: 120, bottom: 50, width: 100, height: 30 };
const _e6CRect = { x: 0, y: 0, left: 0, top: 0, right: 120, bottom: 60, width: 120, height: 60 };
const _e6Anchor = { nodeType: 1, getBoundingClientRect() { return _e6Rect; } };
const _e6Content = {
    nodeType: 1,
    style: {},
    getBoundingClientRect() { return _e6CRect; },
    getAttribute() { return null; },
    setAttribute() {},
    hasAttribute() { return false; },
    removeAttribute() {},
};
const _e6Factory = createFloatingPositioner();
const _e6Handle = _e6Factory({
    anchor: _e6Anchor,
    content: _e6Content,
    placement: "bottom",
    offset: 8,
    flip: true,
    shift: true,
    boundary: "viewport",
});
_e6Handle.update(); // one-time seed
function _e6Window(i) { _e6Handle.update(); }
const _e6Total = allocTotalMin(_e6Window, ENGINE_OPS, ENGINE_WARMUP, 3, ENGINE_BUDGET);
const _e6t0 = _e6Content.style.transform;
_e6Rect.left += 50; _e6Rect.right += 50; _e6Rect.x += 50;
_e6Handle.update();
if (_e6Content.style.transform === _e6t0) die("E6 floating-adapter: transform did not track moved anchor (dishonest window)");
_e6Handle.destroy();
check(
    _e6Total <= ENGINE_BUDGET,
    () => "E6 floating-adapter " + _e6Total + " B of transient garbage over " + ENGINE_OPS + " ops (budget 16384 B total, ~0 B/op)",
);
if (_e6Total > _gatedWorst) { _gatedWorst = _e6Total; _gatedWorstName = "E6"; }
console.log("transient E6 floating-adapter=" + _e6Total + "B/" + ENGINE_OPS + "ops ok");

// ============================================================================
// DOM-recorded windows (D1-D3). Each crosses happy-dom every op, so it is
// RECORDED over the F0 floor, not gated at zero. Op counts are per-window,
// sized ceiling-safe under happy-dom's ~2.9 KB/op-and-up write floor (the
// harness DOM_OPS constant is retired -- see harness comment). Each pins a
// LITERAL RATCHET = ceil(max_measured * 1.25) + 4096 with both measurements in
// the comment: recorded-not-gated means the ratchet catches REGRESSION, not
// zero. Fresh instance + REAL happy-dom elements attached OUTSIDE the window.
// ============================================================================

// ---- D1: slider setValue mix (DOM recorded) --------------------------------
// Mirrors phase-B loop (i): 3:1 same-value (early-exit) to step-crossing moves
// on a fresh slider with track + thumb attached. Each step-crossing setValue
// writes aria-valuenow via String() (happy-dom setAttribute is the recorded
// cost). MEASURED (two full torture runs): 1856872 B, 1873072 B / 512 ops.
// RATCHET = ceil(1873072 * 1.25) + 4096 = 2345436.
const D1_OPS = 512;
const D1_RATCHET = 2345436;
const _d1 = createSlider({ min: 0, max: 100, step: 1, defaultValue: [50] });
_d1.attachTrack(el("div"));
_d1.attachThumb(el("div"), 0);
let _d1v = 50;
function _d1Window(i) {
    if ((i & 3) === 0) { _d1v = 20 + (i % 60); _d1.setValue([_d1v]); }
    else { _d1.setValue([_d1v]); }
}
const _d1Total = allocTotalMin(_d1Window, D1_OPS, DOM_WARMUP, 2, D1_RATCHET);
check(
    _d1Total <= D1_RATCHET,
    () => "D1 slider " + _d1Total + " B over " + D1_OPS + " ops (ratchet " + D1_RATCHET + " B) -- regression past pinned floor+primitive",
);
console.log("transient D1 slider=" + _d1Total + "B/" + D1_OPS + "ops record floor=" + _floorBytes + "B");

// ---- D2: time-picker attached spin (DOM recorded) --------------------------
// Fresh time-picker with all three segments attached (real els). spinMinute(1)
// per op + spinHour(1) every 16th; the reflection effect writes 6 setAttribute
// per changed spin (String()/_pad2 aria strings, src/time-picker/index.js:
// 219-231) -- the recorded happy-dom cost. Op count halved from 512 (which
// overflowed new space at ~9.9 KB/op) to 256 per PLAN RISK 2. MEASURED (two
// full torture runs): 2479200 B, 2505464 B / 256 ops. RATCHET = ceil(2505464 *
// 1.25) + 4096 = 3135926.
const D2_OPS = 256;
const D2_RATCHET = 3135926;
const _d2 = createTimePicker({ hour12: true, defaultValue: { hour: 0, minute: 0 } });
_d2.attachHourSegment(el("span"));
_d2.attachMinuteSegment(el("span"));
_d2.attachMeridiem(el("span"));
function _d2Window(i) {
    _d2.spinMinute(1);
    if ((i & 15) === 0) _d2.spinHour(1);
}
const _d2Total = allocTotalMin(_d2Window, D2_OPS, DOM_WARMUP, 2, D2_RATCHET);
check(
    _d2Total <= D2_RATCHET,
    () => "D2 time-picker " + _d2Total + " B over " + D2_OPS + " ops (ratchet " + D2_RATCHET + " B) -- regression past pinned floor+aria strings",
);
console.log("transient D2 time-picker=" + _d2Total + "B/" + D2_OPS + "ops record floor=" + _floorBytes + "B");

// ---- D3: dialog setOpen toggle (DOM recorded) ------------------------------
// Fresh dialog with trigger + content attached (real els). One op is a FULL
// toggle: setOpen(true) then setOpen(false). The focus trap wires/unwires on
// each open/close (query focusables + document listener churn) -- that is the
// recorded point, and it is the heaviest DOM window (~78 KB/op), so the op
// count is deep-halved from 128 (overflowed) to 32 per PLAN RISK 2. MEASURED
// (two full torture runs): 2268608 B, 2282376 B / 32 ops. RATCHET =
// ceil(2282376 * 1.25) + 4096 = 2857066.
const D3_OPS = 32;
const D3_RATCHET = 2857066;
const _d3 = createDialog();
_d3.attachTrigger(el("button"));
_d3.attachContent(el("div"));
function _d3Window(i) {
    _d3.setOpen(true);
    _d3.setOpen(false);
}
const _d3Total = allocTotalMin(_d3Window, D3_OPS, DOM_WARMUP, 2, D3_RATCHET);
check(
    _d3Total <= D3_RATCHET,
    () => "D3 dialog " + _d3Total + " B over " + D3_OPS + " ops (ratchet " + D3_RATCHET + " B) -- regression past pinned floor+trap",
);
console.log("transient D3 dialog=" + _d3Total + "B/" + D3_OPS + "ops record floor=" + _floorBytes + "B");

// keep the control buffer reachable past summary() so it cannot be collected
// early and hide the pressure it is meant to create.
if (CONTROL && _ctrlBuf[HOT - 1] === null) throw new Error("unreachable");

const ok = report.ok && live === 0 && leaks.length === 0 && findings.length === 0 && _faHeapOk;
// T9: gated = E2,E3,E4,E6,E5s (5 -- E3 re-entered the gated set per the
// per-window-warmup ruling, see the E3 block); rec = E1,E5,D1,D2,D3 (5).
console.log(
    "GATE leak=size " + live + "/0 findings=" + findings.length +
    " warnings=" + warns.length +
    " | gc major=" + s.gc.major + " minor=" + s.gc.minor +
    " maxMs=" + s.gc.maxMs.toFixed(2) +
    " | alloc=" + _faAllocPerOp + " B/op" +
    " | transient gated=5/5 budget=16384B/50000ops worst=" + _gatedWorst + "B(" + _gatedWorstName + ")" +
    " | transient rec=5 floor=" + _floorBytes + "B/512ops " +
    "| " + (ok ? "ok" : "FAIL"),
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
