// @zakkster/lite-headless / hover-card
//
// createHoverCard(options) -> HoverCardHandle
//
// A rich hover/focus preview card (think a GitHub user hovercard). Unlike
// tooltip, the floating positioning here is driven by **@zakkster/lite-floating**
// (createFloating + bindTransform + offset/flip/shift middleware). lite-floating's
// autoUpdate, in turn, pulls in @zakkster/lite-observe transitively to keep the
// card pinned on scroll / resize. This is the one primitive that swaps the
// shared overlay positioner for the standalone floating engine; the others keep
// _overlay/position to preserve their exact-pixel test contracts.
//
// Composes:
//   _overlay/core         (open/status state machine + transitions)
//   lite-floating         (placement + flip + shift, frame-coalesced)
//   _overlay/portal       (move content to container)
//   _overlay/dismiss      (Escape)
//   _overlay/aria         (id generation, attr toggles)
//
// Behavior (mirrors tooltip's hover-intent):
//   - trigger model: 'hover focus' (focus opens instantly for keyboard a11y)
//   - openDelay / closeDelay grace timers
//   - "pointer alive" spans BOTH trigger and content: closing happens only
//     after the pointer has left both, so the user can move into the card.
//
// ARIA: a hover card is a supplementary, sighted-user affordance. The content
// carries NO role and is aria-hidden while closed (AT skips it; the trigger
// link still carries the real destination). The trigger gets data-open +
// aria-expanded, but deliberately NO aria-haspopup.
//
// Painted attributes:
//   trigger:  data-hover-card-trigger, data-open, aria-expanded
//   content:  data-hover-card-content, data-open, data-status,
//             data-placement (e.g. "bottom-start"), data-side, data-align
//   arrow:    data-side
//   root:     data-hover-card-root, data-open

import { effect } from "@zakkster/lite-signal";
import { createFloating, bindTransform, offset, flip, shift } from "@zakkster/lite-floating";
import { createOverlayCore } from "../_overlay/core.js";
import { bindEscape } from "../_overlay/dismiss.js";
import { portal } from "../_overlay/portal.js";
import { uniqueId, setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}

export function createHoverCard(options = {}) {
    const {
        open,
        defaultOpen = false,
        onOpenChange,

        placement = "bottom",
        offset: offsetVal = 8,
        flip: useFlip = true,
        shift: useShift = true,

        openDelay = 300,
        closeDelay = 200,
        closeOnEscape = true,

        container = (typeof document !== "undefined" ? document.body : null),
        transition = false,
    } = options;

    const core = createOverlayCore({
        open,
        defaultOpen,
        onOpenChange,
        awaitTransitionEnd: !!transition,
    });

    let _root = null;
    let _trigger = null;
    let _anchor = null;
    let _content = null;
    let _arrow = null;
    let _restorePortal = null;

    let _floating = null;
    let _bindOff = null;
    let _placeOff = null;
    let _escapeOff = null;

    // pointer state -- close ONLY when all are false
    let _triggerHovered = false;
    let _contentHovered = false;
    let _triggerFocused = false;

    let _openTimer = null;
    let _closeTimer = null;

    function isAlive() {
        return _triggerHovered || _contentHovered || _triggerFocused;
    }
    function clearOpenTimer() { if (_openTimer) { clearTimeout(_openTimer); _openTimer = null; } }
    function clearCloseTimer() { if (_closeTimer) { clearTimeout(_closeTimer); _closeTimer = null; } }

    function maybeOpen(reasonHint) {
        clearCloseTimer();
        if (core.open()) return;
        if (_openTimer) return;
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

    function buildMiddleware() {
        const mw = [offset(offsetVal)];
        if (useFlip) mw.push(flip());
        if (useShift) mw.push(shift());
        return mw;
    }

    function paintPlacement(pl) {
        if (!_content) return;
        setAttr(_content, "data-placement", pl);
        const dash = pl.indexOf("-");
        const side = dash === -1 ? pl : pl.slice(0, dash);
        const align = dash === -1 ? "center" : pl.slice(dash + 1);
        setAttr(_content, "data-side", side);
        setAttr(_content, "data-align", align);
        if (_arrow) setAttr(_arrow, "data-side", side);
    }

    function clearContentStyles() {
        if (!_content) return;
        const st = _content.style;
        st.transform = "";
        st.position = "";
        st.top = "";
        st.left = "";
        st.willChange = "";
    }

    function doOpen() {
        if (!_content) return;
        if (container && _content.parentNode !== container) {
            _restorePortal = portal(_content, container);
        }
        const a = _anchor || _trigger;
        if (a) {
            _floating = createFloating(() => a, () => _content, {
                placement,
                middleware: buildMiddleware(),
            });
            _bindOff = bindTransform(_content, _floating.x, _floating.y);
            _placeOff = effect(() => { paintPlacement(_floating.placement()); });
        }
    }

    function doClose() {
        if (_placeOff) { _placeOff(); _placeOff = null; }
        if (_bindOff) { _bindOff(); _bindOff = null; }
        if (_floating) { _floating.dispose(); _floating = null; }
        clearContentStyles();
        clearOpenTimer();
        clearCloseTimer();
    }

    // ----- reactive effects (one dep each) ------------------------------
    const stopOpen = effect(() => {
        if (core.open()) doOpen();
        else doClose();
    });
    core._addCleanup(stopOpen);

    const stopContentAria = effect(() => {
        const isOpen = core.open();
        if (!_content) return;
        setAttr(_content, "aria-hidden", isOpen ? null : "true");
        toggleAttr(_content, "data-open", isOpen);
    });
    core._addCleanup(stopContentAria);

    const stopStatusAttr = effect(() => {
        const s = core.status();
        if (_content) setAttr(_content, "data-status", s);
    });
    core._addCleanup(stopStatusAttr);

    const stopTriggerAria = effect(() => {
        const isOpen = core.open();
        if (_trigger) {
            toggleAttr(_trigger, "data-open", isOpen);
            setAttr(_trigger, "aria-expanded", isOpen ? "true" : "false");
        }
        if (_root) toggleAttr(_root, "data-open", isOpen);
    });
    core._addCleanup(stopTriggerAria);

    const stopRestore = effect(() => {
        if (core.status() === "closed" && _restorePortal) {
            _restorePortal();
            _restorePortal = null;
        }
    });
    core._addCleanup(stopRestore);

    // ----- attach* methods ---------------------------------------------
    function attachRoot(el) {
        if (!el || core.destroyed) return noop;
        _root = el;
        setAttr(el, "data-hover-card-root", "");
        toggleAttr(el, "data-open", core.open());
        const off = () => {
            el.removeAttribute("data-hover-card-root");
            el.removeAttribute("data-open");
            if (_root === el) _root = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachTrigger(el) {
        if (!el || core.destroyed) return noop;
        _trigger = el;
        ensureId(el, "lh-hovercard-trigger");
        setAttr(el, "data-hover-card-trigger", "");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "aria-expanded", core.open() ? "true" : "false");

        const enter = () => { _triggerHovered = true; maybeOpen("hover"); };
        const leave = () => { _triggerHovered = false; maybeClose("hover"); };
        const fIn  = () => { _triggerFocused = true; maybeOpen("focus"); };
        const fOut = () => { _triggerFocused = false; maybeClose("focus"); };
        el.addEventListener("pointerenter", enter);
        el.addEventListener("pointerleave", leave);
        el.addEventListener("focus", fIn);
        el.addEventListener("blur", fOut);

        const off = () => {
            el.removeEventListener("pointerenter", enter);
            el.removeEventListener("pointerleave", leave);
            el.removeEventListener("focus", fIn);
            el.removeEventListener("blur", fOut);
            el.removeAttribute("data-hover-card-trigger");
            el.removeAttribute("data-open");
            el.removeAttribute("aria-expanded");
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
        if (!el.id) el.id = uniqueId("lh-hovercard");
        setAttr(el, "data-hover-card-content", "");
        if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
        setAttr(el, "aria-hidden", core.open() ? null : "true");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        core._setContentForTransitions(el);

        const enter = () => { _contentHovered = true; maybeOpen("hover"); };
        const leave = () => { _contentHovered = false; maybeClose("hover"); };
        el.addEventListener("pointerenter", enter);
        el.addEventListener("pointerleave", leave);

        if (closeOnEscape) _escapeOff = bindEscape(core);

        if (core.open()) doOpen();

        const off = () => {
            el.removeEventListener("pointerenter", enter);
            el.removeEventListener("pointerleave", leave);
            if (_content === el) {
                el.removeAttribute("data-hover-card-content");
                el.removeAttribute("aria-hidden");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                el.removeAttribute("data-placement");
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
        attachRoot,
        attachTrigger,
        attachAnchor,
        attachContent,
        attachArrow,
        destroy,
        get destroyed() { return core.destroyed; },
        _floating: () => _floating,
    };
}
