// @zakkster/lite-headless / tooltip / index.js
//
// createTooltip(options) -> TooltipHandle
//
// Composes:
//   _overlay/core         (state machine + status signal)
//   _overlay/position     (placement + flip + shift + arrow + autoUpdate)
//   _overlay/dismiss      (Escape; no outside-click -- pointer-leave handles that)
//   _overlay/portal       (move to container)
//   _overlay/aria         (id generation, attr toggles)
//
// Differences vs popover:
//   - No focus trap (tooltips never trap)
//   - Trigger model: 'hover', 'focus', 'click', 'manual' (space-separated subset)
//   - openDelay / closeDelay (hover/pointer only -- focus triggers are instant
//     to preserve keyboard accessibility)
//   - "Pointer alive" extends to BOTH trigger and content: closing happens
//     only after pointer has left BOTH. Lets the user mouse over a link inside
//     the tooltip without dismissing it.
//   - role="tooltip" on content
//   - aria-describedby (or aria-labelledby) wired onto trigger
//
// On touch devices, pointerenter/leave behavior is platform-dependent. v0.1
// does NOT handle touch specially; the consumer can flip to trigger:'click'
// for a tap-to-toggle tooltip on touch.

import { effect } from "@zakkster/lite-signal";
import { createOverlayCore } from "../_overlay/core.js";
import { bindEscape } from "../_overlay/dismiss.js";
import { createPositioner } from "../_overlay/position.js";
import { portal } from "../_overlay/portal.js";
import { uniqueId, setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";

export function createTooltip(options = {}) {
    const {
        open,
        defaultOpen = false,
        onOpenChange,

        placement = "top",
        offset = 6,
        flip = true,
        shift = true,
        boundary = "clipping",

        trigger: triggerSpec = "hover focus",
        openDelay = 200,
        closeDelay = 150,        // grace period for crossing trigger->content gap
        closeOnEscape = true,

        container = (typeof document !== "undefined" ? document.body : null),
        transition = false,

        describesTrigger = true, // aria-describedby (default) vs aria-labelledby
    } = options;

    const triggers = String(triggerSpec).split(/\s+/).filter(Boolean);
    const usesHover = triggers.includes("hover");
    const usesFocus = triggers.includes("focus");
    const usesClick = triggers.includes("click");

    const core = createOverlayCore({
        open,
        defaultOpen,
        onOpenChange,
        awaitTransitionEnd: !!transition,
    });

    let _trigger = null;
    let _anchor = null;
    let _content = null;
    let _arrow = null;
    let _restorePortal = null;
    let _positioner = null;
    let _stopAutoUpdate = null;
    let _escapeOff = null;

    // pointer state -- close ONLY when both are false
    let _triggerHovered = false;
    let _contentHovered = false;
    let _triggerFocused = false;

    let _openTimer = null;
    let _closeTimer = null;

    function isAlive() {
        return _triggerHovered || _contentHovered || _triggerFocused;
    }

    function clearOpenTimer() {
        if (_openTimer) { clearTimeout(_openTimer); _openTimer = null; }
    }
    function clearCloseTimer() {
        if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; }
    }

    function maybeOpen(reasonHint) {
        clearCloseTimer();
        if (core.open()) return;
        if (_openTimer) return;
        // focus triggers open immediately for keyboard accessibility
        const delay = (reasonHint === "focus") ? 0 : openDelay;
        if (delay > 0) {
            _openTimer = setTimeout(() => {
                _openTimer = null;
                if (isAlive()) core.setOpen(true, "trigger");
            }, delay);
        } else {
            core.setOpen(true, "trigger");
        }
    }

    function maybeClose(reasonHint) {
        clearOpenTimer();
        if (!core.open()) return;
        if (_closeTimer) return;
        // focus loss closes immediately
        const delay = (reasonHint === "focus") ? 0 : closeDelay;
        if (delay > 0) {
            _closeTimer = setTimeout(() => {
                _closeTimer = null;
                if (!isAlive()) core.setOpen(false, "pointer-leave");
            }, delay);
        } else {
            if (!isAlive()) core.setOpen(false, "pointer-leave");
        }
    }

    function doOpen() {
        if (!_content) return;
        if (container && _content.parentNode !== container) {
            _restorePortal = portal(_content, container);
        }
        const a = _anchor || _trigger;
        if (a) {
            _positioner = createPositioner({
                anchor: a, content: _content, arrow: _arrow,
                placement, offset, flip, shift, boundary,
            });
            _positioner.update();
            _stopAutoUpdate = _positioner.autoUpdate();
        }
    }

    function doClose() {
        if (_stopAutoUpdate) { _stopAutoUpdate(); _stopAutoUpdate = null; }
        if (_positioner) { _positioner.destroy(); _positioner = null; }
        clearOpenTimer();
        clearCloseTimer();
    }

    // ----- reactive effects (one dep each) ------------------------------
    const stopOpen = effect(() => {
        if (core.open()) doOpen();
        else doClose();
    });
    core._addCleanup(stopOpen);

    const stopOpenAria = effect(() => {
        const isOpen = core.open();
        if (!_content) return;
        setAttr(_content, "aria-hidden", isOpen ? null : "true");
        toggleAttr(_content, "data-open", isOpen);
    });
    core._addCleanup(stopOpenAria);

    const stopStatusAttr = effect(() => {
        const s = core.status();
        if (_content) setAttr(_content, "data-status", s);
    });
    core._addCleanup(stopStatusAttr);

    const stopRestore = effect(() => {
        if (core.status() === "closed" && _restorePortal) {
            _restorePortal();
            _restorePortal = null;
        }
    });
    core._addCleanup(stopRestore);

    // ----- attach* methods ---------------------------------------------
    function attachTrigger(el) {
        if (!el || core.destroyed) return noop;
        _trigger = el;
        ensureId(el, "lh-trigger");
        // tooltips describe (or label) the trigger; wire id when content known.
        // Use addIdToken so a consumer's existing aria-describedby (e.g. pointing
        // at an inline error/helper message) is preserved instead of clobbered.
        const refAttr = describesTrigger ? "aria-describedby" : "aria-labelledby";
        if (_content && _content.id) {
            addIdToken(el, refAttr, _content.id);
        }

        const listeners = [];

        if (usesHover) {
            const enter = () => { _triggerHovered = true; maybeOpen("hover"); };
            const leave = () => { _triggerHovered = false; maybeClose("hover"); };
            el.addEventListener("pointerenter", enter);
            el.addEventListener("pointerleave", leave);
            listeners.push(["pointerenter", enter], ["pointerleave", leave]);
        }
        if (usesFocus) {
            const fIn  = () => { _triggerFocused = true; maybeOpen("focus"); };
            const fOut = () => { _triggerFocused = false; maybeClose("focus"); };
            el.addEventListener("focus", fIn);
            el.addEventListener("blur", fOut);
            listeners.push(["focus", fIn], ["blur", fOut]);
        }
        if (usesClick) {
            const click = (e) => {
                e.preventDefault();
                core.setOpen(!core.open(), "trigger");
            };
            el.addEventListener("click", click);
            listeners.push(["click", click]);
        }

        const off = () => {
            for (const [type, fn] of listeners) el.removeEventListener(type, fn);
            // remove ONLY our id from the IDREF list; leave consumer's tokens alone
            if (_content && _content.id) removeIdToken(el, refAttr, _content.id);
            if (_trigger === el) _trigger = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachAnchor(el) {
        if (!el || core.destroyed) return noop;
        _anchor = el;
        const off = () => { if (_anchor === el) _anchor = null; };
        core._addCleanup(off);
        return off;
    }

    function attachContent(el) {
        if (!el || core.destroyed) return noop;
        _content = el;
        if (!el.id) el.id = uniqueId("lh-tooltip");

        setAttr(el, "role", "tooltip");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        setAttr(el, "aria-hidden", core.open() ? null : "true");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        core._setContentForTransitions(el);

        if (_trigger) {
            addIdToken(_trigger, describesTrigger ? "aria-describedby" : "aria-labelledby", el.id);
        }

        const listeners = [];
        if (usesHover) {
            const enter = () => { _contentHovered = true; maybeOpen("hover"); };
            const leave = () => { _contentHovered = false; maybeClose("hover"); };
            el.addEventListener("pointerenter", enter);
            el.addEventListener("pointerleave", leave);
            listeners.push(["pointerenter", enter], ["pointerleave", leave]);
        }

        if (closeOnEscape) {
            _escapeOff = bindEscape(core);
        }

        if (core.open()) doOpen();

        const off = () => {
            for (const [type, fn] of listeners) el.removeEventListener(type, fn);
            if (_content === el) {
                if (_trigger) {
                    removeIdToken(_trigger, describesTrigger ? "aria-describedby" : "aria-labelledby", el.id);
                }
                el.removeAttribute("role");
                el.removeAttribute("aria-hidden");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                el.removeAttribute("data-side");
                el.removeAttribute("data-align");
                _content = null;
            }
            if (_escapeOff) { _escapeOff(); _escapeOff = null; }
        };
        core._addCleanup(off);
        return off;
    }

    function attachArrow(el) {
        if (!el || core.destroyed) return noop;
        _arrow = el;
        const off = () => {
            if (_arrow === el) {
                el.removeAttribute("data-side");
                el.style.left = "";
                el.style.top = "";
                _arrow = null;
            }
        };
        core._addCleanup(off);
        return off;
    }

    function destroy() {
        clearOpenTimer();
        clearCloseTimer();
        if (core.open()) doClose();
        if (_restorePortal) { _restorePortal(); _restorePortal = null; }
        core.destroy();
    }

    return {
        open: core.open,
        status: core.status,
        setOpen: core.setOpen,
        toggle: core.toggle,
        attachTrigger,
        attachAnchor,
        attachContent,
        attachArrow,
        destroy,
        get destroyed() { return core.destroyed; },
        _positioner: () => _positioner,
    };
}

function noop() {}
