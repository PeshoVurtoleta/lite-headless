// @zakkster/lite-headless / _overlay / dismiss.js
//
// Dismiss policies. Two flavors:
//
//   bindEscape(overlay)                  -> closes on Escape keydown
//   bindOutsideClick(overlay, anchors)   -> closes on pointerdown outside the
//                                           list of "inside" elements
//
// ESCAPE STACK SEMANTICS (v0.7.8)
//
// Earlier versions used per-binding keydown listeners with a stack that
// gated "am I the topmost binding?". That broke when N popovers were
// constructed but only the older (lower-stack) one was open: the
// topmost-bound handler saw the Escape, its overlay.open() check
// returned false, and the event was swallowed. No popover closed.
//
// The fix is a single shared document listener that walks the stack
// top-down and dispatches to the first OPEN overlay. Each bindEscape
// call still pushes a stack entry (and pops on cleanup), but the
// listener is registered once on document and removed when the stack
// drains. Open/close state is sampled lazily at keydown time, so an
// overlay opening after another stays "above" in dismissal order
// regardless of construction order.

const _escapeStack = [];
let _escapeListenerTarget = null;

function _onEscapeKey(e) {
    if (e.key !== "Escape" && e.keyCode !== 27) return;
    // top-down: the most recently bound overlay gets first refusal,
    // but only OPEN overlays consume the event. Skipping closed
    // overlays means an N-popover page where only the bottom one is
    // open will still close on Escape -- the old design didn't.
    for (let i = _escapeStack.length - 1; i >= 0; i--) {
        const entry = _escapeStack[i];
        if (entry.overlay.open()) {
            entry.overlay.setOpen(false, "escape");
            return;
        }
    }
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
