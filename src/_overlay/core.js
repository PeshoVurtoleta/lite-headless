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
// All teardown registers through `addCleanup`; `destroy()` runs them LIFO.

import { signal } from "@zakkster/lite-signal";

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
    }

    // ----- transition awaiting -------------------------------------------
    let _contentEl = null;
    let _pendingFinalize = null;

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
            const m = queueMicrotask(finalize);
            _pendingFinalize = () => { /* microtask cannot be cancelled; finalize is idempotent below */ };
        }
        function finalize() {
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
            // we wait one microtask to give them a chance, then read back
            queueMicrotask(() => {
                if (destroyed) return;
                const settled = !!openSig.peek();
                if (settled === want) {
                    status.set(want ? "opening" : "closing");
                    scheduleFinalize(want ? "open" : "closed");
                }
                // if consumer chose NOT to flip, status stays put (consumer veto)
            });
        } else {
            internal.set(want);
            status.set(want ? "opening" : "closing");
            scheduleFinalize(want ? "open" : "closed");
        }
    }

    function toggle() {
        setOpen(!openSig.peek(), "api");
    }

    // ----- handle ---------------------------------------------------------
    return {
        // read-only state
        open: readOnly(openSig),
        status: readOnly(status),

        // imperative
        setOpen,
        toggle,

        // internals for primitive composition
        _addCleanup: addCleanup,
        _setContentForTransitions: setContentForTransitions,
        _isControlled: isControlled,

        // teardown
        destroy,
        get destroyed() { return destroyed; },
    };
}

// ----- helpers ------------------------------------------------------------

function isSignal(v) {
    return v && typeof v === "function" && typeof v.set === "function" && typeof v.peek === "function";
}

function readOnly(sig) {
    // expose only the read interface; preserve the call signature so consumers
    // can do `if (handle.open()) { ... }` and `handle.open.subscribe(fn)`.
    const fn = () => sig();
    fn.peek = () => sig.peek();
    fn.subscribe = (cb) => sig.subscribe(cb);
    return fn;
}
