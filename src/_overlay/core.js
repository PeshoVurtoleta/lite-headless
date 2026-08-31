// @zakkster/lite-headless / _overlay / core.js
//
// The overlay state machine. Every primitive (dialog/popover/tooltip) builds on
// this. It owns three things:
//
//   1. `open`  -- ReadSignal<boolean>; either user-supplied (controlled) or
//                 created internally (uncontrolled with defaultOpen).
//   2. `status` -- ReadSignal<'closed'|'opening'|'open'|'closing'>; useful for
//                 CSS animations and external motion drivers (lite-spring etc).
//   3. `setOpen(next, reason)` -- the only place state changes. Calls
//                 `onOpenChange(next, reason)` before flipping internal status,
//                 so consumers can intercept (e.g., confirm-before-close).
//
// Status transitions:
//                       setOpen(true)            setOpen(false)
//      closed   ---->   opening   ---->   open  ---->   closing  ---->   closed
//
//   - If `awaitTransitionEnd` is false (default): opening->open and
//     closing->closed flip on the next microtask. CSS [data-status="opening"]
//     still gets one paint to start animations from.
//   - If `awaitTransitionEnd` is true: engine listens for transitionend/
//     animationend on the content element passed via setContentForTransitions(),
//     and only commits the final flip once the animation reports finished.
//
// A transition never starts from a resting state it is already in. The only
// mid-transition interrupts are the two legal pairs opening->closing and
// closing->opening; every other request from a resting state (a net-zero
// same-tick flip) renders nothing.
//
// All teardown registers through `addCleanup`; `destroy()` runs them LIFO.
//
// SWALLOW-ON-TEARDOWN POLICY (H-11): teardown errors and consumer-callback
// throws are swallowed BY DESIGN. `destroy()` runs every registered cleanup
// even if one throws, so a single bad consumer cannot strand sibling
// teardowns (listeners, portals, scroll locks). Likewise `onOpenChange` and
// finalize callbacks are wrapped: a throwing consumer cannot corrupt the
// state machine. `addCleanup` after `destroy()` runs the cleanup immediately
// (LIFO ledger is already drained). No new throw paths are introduced here.
//
// STATUS-GENERATION GUARANTEE (H-01): each transition captures a factory-scope
// generation stamp. A finalize (microtask flip or transitionend commit) that
// has been superseded by a newer `setOpen` bails BEFORE touching status, so a
// same-tick open->close (or close->open) toggle can never emit a stale status
// such as the illegal closing->open flash. The surviving controlled read-back
// is additionally status-aware: it only advances on the legal interrupt pairs
// (closing->opening, opening->closing), so a net-zero same-tick flip whose
// resting state never changed emits nothing rather than an illegal
// closed->closing / open->opening transition.
//
// ESCAPE OPEN-RECENCY (H-02): every successful OPEN stamps `_openSeq` from a
// module-scope monotonic counter. dismiss.js uses that stamp to dismiss the
// most-recently-OPENED overlay on Escape (not the most-recently-BOUND).

import { signal } from "@zakkster/lite-signal";
import { sealSignal } from "./seal.js";

// Module-scope monotonic open counter. Shared across ALL overlays so their
// open events carry a single global ordering; dismiss.js reads `_openSeq` off
// each bound overlay's handle to find the most-recently-opened one. Starts at
// 0; a handle that never opened (or opened via defaultOpen before any setOpen)
// keeps `_openSeq === 0` and ranks below any explicitly-opened overlay.
let _openSeqCounter = 0;

/** @typedef {'trigger'|'outside'|'escape'|'close'|'pointer-leave'|'api'} OpenChangeReason */

export function createOverlayCore(options = {}) {
    const {
        open: controlled,           // optional Signal<boolean> for controlled mode
        defaultOpen = false,        // uncontrolled initial value
        onOpenChange,               // (next, reason) -> void
        awaitTransitionEnd = false, // wait for transitionend before status flip
    } = options;

    // ----- state ----------------------------------------------------------
    const isControlled = isSignal(controlled);
    const internal = isControlled ? null : signal(!!defaultOpen);
    const openSig = isControlled ? controlled : internal;
    const status = signal(openSig() ? "open" : "closed");

    // Public read targets. Swappable (`let`): destroy() seals them (H-12) so
    // the pooled nodes go back to lite-signal's registry while a destroyed
    // handle keeps answering its frozen final open/status. Internal state
    // transitions keep using the consts above -- every internal touch sits
    // behind a `destroyed` guard, so none can reach a disposed node.
    let _openRead = openSig;
    let _statusRead = status;

    // ----- cleanup ledger -------------------------------------------------
    const cleanups = [];
    let destroyed = false;

    function addCleanup(fn) {
        if (destroyed) {
            // late attach after destroy() -- run immediately, don't queue
            try { fn(); } catch { /* swallow */ }
            return () => {};
        }
        cleanups.push(fn);
        return () => {
            const i = cleanups.indexOf(fn);
            if (i >= 0) {
                cleanups.splice(i, 1);
                try { fn(); } catch { /* swallow */ }
            }
        };
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        // run LIFO; swallow throws so all teardowns get a chance
        for (let i = cleanups.length - 1; i >= 0; i--) {
            try { cleanups[i](); } catch { /* swallow */ }
        }
        cleanups.length = 0;
        // SIGNAL-NODE POOL RETURN (H-12): lite-signal pools nodes in a
        // fixed-capacity registry; a signal that is never disposed occupies a
        // pool slot forever, so churned create/destroy cycles exhaust the
        // ledger. Sealed AFTER the ledger drain (every effect reading them
        // has been stopped): the nodes go back to the pool and the public
        // read targets swap to frozen stand-ins, so a destroyed handle keeps
        // answering its final open/status. `internal` only when uncontrolled
        // -- a consumer-supplied `open` signal is theirs and stays live.
        _statusRead = sealSignal(status);
        if (internal !== null) _openRead = sealSignal(internal);
    }

    // ----- transition awaiting -------------------------------------------
    let _contentEl = null;
    let _pendingFinalize = null;
    // Monotonic per-instance transition generation. Every scheduleFinalize()
    // (and every controlled read-back) bumps this and captures its own value;
    // a finalize whose captured gen no longer matches has been superseded by a
    // newer setOpen and must not commit a status (H-01).
    let _finalizeGen = 0;
    // The handle returned at the end of the factory; `setOpen` stamps
    // `handle._openSeq` on each OPEN. Assigned before any setOpen can run.
    let handle = null;

    function setContentForTransitions(el) {
        _contentEl = el;
    }

    function clearPendingFinalize() {
        if (_pendingFinalize) {
            _pendingFinalize();
            _pendingFinalize = null;
        }
    }

    function scheduleFinalize(target) {
        clearPendingFinalize();
        // Capture this transition's generation. A later setOpen bumps
        // _finalizeGen again; when this finalize eventually fires we compare
        // and bail if it no longer matches (superseded).
        const gen = ++_finalizeGen;
        if (awaitTransitionEnd && _contentEl) {
            // Wait for transitionend/animationend bubbling up from content.
            // We bind once and resolve on first event of either type. If the
            // animation gets superseded by another setOpen call, the cleanup
            // below removes the listeners before they fire.
            const onEnd = (ev) => {
                if (ev.target === _contentEl || _contentEl.contains(ev.target)) {
                    finalize();
                }
            };
            _contentEl.addEventListener("transitionend", onEnd);
            _contentEl.addEventListener("animationend", onEnd);
            _pendingFinalize = () => {
                _contentEl.removeEventListener("transitionend", onEnd);
                _contentEl.removeEventListener("animationend", onEnd);
            };
        } else {
            // microtask flip -- gives one paint with the transitional status
            // so CSS animations starting from [data-status="opening"] work
            queueMicrotask(finalize);
            _pendingFinalize = () => { /* microtask cannot be cancelled; the gen guard below no-ops a stale flip */ };
        }
        function finalize() {
            // Superseded by a newer transition -> bail BEFORE touching status
            // or _pendingFinalize (a later scheduleFinalize now owns the
            // pending listener teardown; clearing here would strip ITS
            // listeners and never commit its status). This is the H-01 guard.
            if (gen !== _finalizeGen) return;
            clearPendingFinalize();
            if (destroyed) return;
            if (status.peek() !== target) status.set(target);
        }
    }

    // ----- public setter --------------------------------------------------
    function setOpen(next, reason = "api") {
        if (destroyed) return;
        const want = !!next;
        const cur = !!openSig.peek();
        if (cur === want) return;

        // notify BEFORE flipping; consumer may have its own state in controlled mode
        if (typeof onOpenChange === "function") {
            try { onOpenChange(want, reason); } catch { /* swallow */ }
        }

        if (isControlled) {
            // controlled: consumer must flip the signal themselves; we just track status
            // we wait one microtask to give them a chance, then read back.
            // Capture a generation NOW so a superseding setOpen in the same
            // tick invalidates this stale read-back before it can paint a
            // status the newer transition already moved past (H-01).
            const gen = ++_finalizeGen;
            queueMicrotask(() => {
                if (destroyed) return;
                if (gen !== _finalizeGen) return; // superseded by a later setOpen
                const settled = !!openSig.peek();
                if (settled === want) {
                    // Status-aware transition: the surviving read-back of a
                    // net-zero same-tick flip must NOT start a transition from a
                    // resting state it is already in (H-01). Only the legal
                    // interrupt pairs advance: closing->opening on open, and
                    // opening->closing on close.
                    const st = status.peek();
                    if (want) {
                        if (st === "closed" || st === "closing") {
                            status.set("opening");
                            handle._openSeq = ++_openSeqCounter; // stamp open-recency
                            scheduleFinalize("open");
                        }
                    } else if (st === "open" || st === "opening") {
                        status.set("closing");
                        scheduleFinalize("closed");
                    }
                }
                // if consumer chose NOT to flip, status stays put (consumer veto)
            });
        } else {
            internal.set(want);
            status.set(want ? "opening" : "closing");
            if (want) handle._openSeq = ++_openSeqCounter; // stamp open-recency
            scheduleFinalize(want ? "open" : "closed");
        }
    }

    function toggle() {
        setOpen(!openSig.peek(), "api");
    }

    // ----- handle ---------------------------------------------------------
    // Plain numeric `_openSeq` (init 0, reassigned in setOpen on each OPEN).
    // Kept as a same-shape numeric property -- not a getter -- so the handle
    // stays monomorphic and setOpen's stamp allocates nothing. dismiss.js
    // reads it to order Escape dismissal by open-recency (H-02).
    // ----- public read surface -------------------------------------------
    // Expose only the read interface; preserve the call signature so
    // consumers can do `if (handle.open()) { ... }` and
    // `handle.open.subscribe(fn)`. The closures resolve the swappable
    // bindings at call time -- the same single context-slot load a captured
    // signal would cost -- which is what lets destroy() seal them (H-12).
    const openRead = () => _openRead();
    openRead.peek = () => _openRead.peek();
    openRead.subscribe = (cb) => _openRead.subscribe(cb);
    const statusRead = () => _statusRead();
    statusRead.peek = () => _statusRead.peek();
    statusRead.subscribe = (cb) => _statusRead.subscribe(cb);

    handle = {
        // read-only state
        open: openRead,
        status: statusRead,

        // imperative
        setOpen,
        toggle,

        // open-recency stamp (H-02); 0 until the first successful open
        _openSeq: 0,

        // internals for primitive composition
        _addCleanup: addCleanup,
        _setContentForTransitions: setContentForTransitions,
        _isControlled: isControlled,

        // teardown
        destroy,
        get destroyed() { return destroyed; },
    };
    return handle;
}

// ----- helpers ------------------------------------------------------------

function isSignal(v) {
    return v && typeof v === "function" && typeof v.set === "function" && typeof v.peek === "function";
}
