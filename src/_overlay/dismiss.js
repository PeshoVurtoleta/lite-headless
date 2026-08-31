// @zakkster/lite-headless / _overlay / dismiss.js
//
// Dismiss policies. Two flavors:
//
//   bindEscape(overlay)                  -> closes on Escape keydown
//   bindOutsideClick(overlay, anchors)   -> closes on pointerdown outside the
//                                           list of "inside" elements
//
// ESCAPE STACK SEMANTICS (v0.7.8; open-recency rework H-02)
//
// Earlier versions used per-binding keydown listeners with a stack that
// gated "am I the topmost binding?". That broke when N popovers were
// constructed but only the older (lower-stack) one was open: the
// topmost-bound handler saw the Escape, its overlay.open() check
// returned false, and the event was swallowed. No popover closed.
//
// The fix is a single shared document listener that scans the stack and
// dispatches to the most-recently-OPENED overlay. Each bindEscape call
// still pushes a stack entry (and pops on cleanup); the listener is
// registered once on document and removed when the stack drains.
//
// OPEN-RECENCY CONTRACT: bind order is NOT open order. Two overlays can be
// bound A-then-B yet opened B-then-A, in which case A is visually on top and
// Escape must dismiss A. core.js stamps each successful open with a global
// monotonic `_openSeq`, so at keydown we pick the OPEN overlay with the
// HIGHEST `_openSeq` -- the one opened last, i.e. on top.
//
// defaultOpen FALLBACK: an uncontrolled core created with `defaultOpen: true`
// opens without ever calling setOpen, so its `_openSeq` stays 0 (as does any
// overlay opened before the stamping existed). Among only-zero-seq open
// overlays we fall back to the previous bind-order-top behavior (last bound
// wins), so defaultOpen overlays still dismiss on Escape. Any explicitly
// -opened overlay (seq > 0) outranks every seq-0 one.
//
// The handler allocates nothing: a single reverse scan tracking two locals.

const _escapeStack = [];
let _escapeListenerTarget = null;

function _onEscapeKey(e) {
    if (e.key !== "Escape" && e.keyCode !== 27) return;
    // Single reverse pass: reverse order means the first OPEN entry we see is
    // the bind-order-top one, which is exactly the seq-0 tie-breaker we want
    // (later-bound wins among unstamped/defaultOpen overlays). We then let any
    // strictly-higher `_openSeq` overwrite the pick, so an explicitly-opened
    // overlay always outranks a seq-0 one and the newest open wins overall.
    let best = null;
    let bestSeq = -1;
    for (let i = _escapeStack.length - 1; i >= 0; i--) {
        const overlay = _escapeStack[i].overlay;
        if (!overlay.open()) continue;
        const seq = overlay._openSeq || 0; // missing/0 => opened before stamping / defaultOpen
        if (seq > bestSeq) {
            bestSeq = seq;
            best = overlay;
        }
    }
    if (best) best.setOpen(false, "escape");
}

function _ensureEscapeListener(target) {
    if (_escapeListenerTarget) return;
    if (!target) return;
    target.addEventListener("keydown", _onEscapeKey, true);
    _escapeListenerTarget = target;
}

function _removeEscapeListenerIfDrained() {
    if (_escapeStack.length > 0 || !_escapeListenerTarget) return;
    _escapeListenerTarget.removeEventListener("keydown", _onEscapeKey, true);
    _escapeListenerTarget = null;
}

export function bindEscape(overlay, target = (typeof document !== "undefined" ? document : null)) {
    if (!target) return () => {};

    const entry = { overlay };
    _escapeStack.push(entry);
    _ensureEscapeListener(target);

    const off = () => {
        const i = _escapeStack.indexOf(entry);
        if (i >= 0) _escapeStack.splice(i, 1);
        _removeEscapeListenerIfDrained();
    };
    overlay._addCleanup(off);
    return off;
}

/**
 * Close when a pointerdown lands outside every element in `getInsides()`.
 * `getInsides` is a function returning a fresh array each time (so primitives
 * can add/remove "inside" elements -- content, anchor, secondary panels --
 * without re-binding).
 *
 * `pointerdown` (not `click`) so a drag that starts outside doesn't pull focus
 * mid-interaction, and so it fires before the browser commits a focus shift.
 */
export function bindOutsideClick(overlay, getInsides, target = (typeof document !== "undefined" ? document : null)) {
    if (!target) return () => {};

    const onDown = (e) => {
        if (!overlay.open()) return;
        const insides = getInsides();
        if (!insides || insides.length === 0) return;

        // composedPath() (when available) traverses shadow boundaries and
        // detached event paths -- the canonical shadow-DOM-aware check.
        // contains() is the fallback for environments without composedPath
        // and for events that don't bubble through shadow trees.
        const path = (typeof e.composedPath === "function") ? e.composedPath() : null;
        const t = e.target;

        for (let i = 0; i < insides.length; i++) {
            const inside = insides[i];
            if (!inside) continue;
            if (path && path.indexOf(inside) !== -1) return;
            if (inside === t || (inside.contains && inside.contains(t))) return;
        }
        overlay.setOpen(false, "outside");
    };

    target.addEventListener("pointerdown", onDown, true);

    const off = () => target.removeEventListener("pointerdown", onDown, true);
    overlay._addCleanup(off);
    return off;
}
