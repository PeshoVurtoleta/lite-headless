// @zakkster/lite-headless / drawer / index.js
//
// createDrawer(options) -> DrawerHandle
//
// Slide-in panel anchored to one of the four edges of the viewport.
// Composes the standard overlay machinery (createOverlayCore, portal,
// focus trap, scroll lock, escape + outside dismiss) the same way
// dialog does -- drawer IS essentially a dialog whose visual anchor is
// an edge instead of the viewport center. Use it for:
//
//   - filter panels in data-heavy admin pages
//   - mobile navigation (off-canvas menus)
//   - row-detail side panels in tables
//   - settings drawers
//
// Side: "left" | "right" | "top" | "bottom" (default "right").
// Modal: when true (default), a backdrop is rendered, focus is trapped,
// and scroll is locked. When false, the drawer is a non-modal pane
// (e.g. inspector that doesn't block page interaction).
//
// The primitive doesn't manage the slide-in transition itself --
// consumers do that via CSS `[data-side="..."][data-status="opening"]`
// selectors. The overlay core can optionally `awaitTransitionEnd` so
// the close flip waits until the slide-out animation finishes.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";
import { createOverlayCore } from "../_overlay/core.js";
import { portal } from "../_overlay/portal.js";
import { createFocusTrap } from "../_overlay/focus.js";
import { lockScroll } from "../_overlay/scroll-lock.js";
import { bindEscape, bindOutsideClick } from "../_overlay/dismiss.js";

function noop() {}

const VALID_SIDES = ["left", "right", "top", "bottom"];
function normalizeSide(s) {
    return VALID_SIDES.indexOf(s) === -1 ? "right" : s;
}

export function createDrawer(options = {}) {
    const {
        open: controlledOpen,
        defaultOpen = false,
        defaultSide = "right",
        modal = true,
        portalRoot,
        closeOnEscape = true,
        closeOnOutsideClick = true,
        lockScrollOnOpen = true,
        trapFocus = true,
        awaitTransitionEnd = false,
        initialFocus,
        returnFocus = true,
        onOpenChange,
    } = options;

    // ----- core state machine --------------------------------------------

    const core = createOverlayCore({
        open: controlledOpen,
        defaultOpen,
        onOpenChange,
        awaitTransitionEnd,
    });

    const _side = makeSignal(normalizeSide(defaultSide));
    let _destroyed = false;

    // Registered elements
    let _trigger = null;
    let _content = null;
    let _backdrop = null;
    let _title = null;
    let _description = null;

    // Lifecycle handles (active while open)
    let _focusTrap = null;
    let _scrollLock = null;
    let _escapeOff = null;
    let _outsideOff = null;
    let _restorePortal = null;
    let _restoreFocus = null;

    // ----- public reactive accessors -------------------------------------

    function open()   { return core.open(); }
    function status() { return core.status(); }
    function side()   { return _side(); }

    function setOpen(b, reason)  { core.setOpen(b, reason || "api"); }
    function show()        { setOpen(true,  "api"); }
    function hide()        { setOpen(false, "api"); }

    function setSide(s) {
        if (_destroyed) return;
        const next = normalizeSide(s);
        if (next === _side()) return;
        _side.set(next);
    }

    // ----- open/close machinery ------------------------------------------
    //
    // When the drawer opens we:
    //   1. portal content + backdrop into the chosen root
    //   2. lock body scroll (if modal + lockScrollOnOpen)
    //   3. install focus trap inside content (if modal + trapFocus)
    //   4. bind Escape + outside-click dismiss
    //   5. remember the previously-focused element to restore after close
    //
    // When it closes we tear all that down in reverse order.

    function doOpen() {
        if (!_content) return;
        // Portal the content (and backdrop, if present) to the portal root.
        const root = portalRoot || (typeof document !== "undefined" ? document.body : null);
        if (root && _content.parentNode !== root) {
            _restorePortal = portal(_content, root);
        }
        if (_backdrop && root && _backdrop.parentNode !== root) {
            // Insert backdrop just before content so content stacks above.
            root.appendChild(_backdrop);
        }

        // Scroll lock (modal only)
        if (modal && lockScrollOnOpen) {
            _scrollLock = lockScroll();
        }

        // Remember previously focused element for restoration on close
        if (returnFocus && typeof document !== "undefined") {
            const active = document.activeElement;
            if (active && active !== document.body) {
                _restoreFocus = () => {
                    try { active.focus(); } catch {}
                };
            }
        }

        // Focus trap (modal only)
        if (modal && trapFocus && _content) {
            _focusTrap = createFocusTrap({
                container: _content,
                initialFocus: initialFocus || _content,
            });
            _focusTrap.activate();
        }

        // Escape + outside dismiss
        if (closeOnEscape) {
            _escapeOff = bindEscape(core);
        }
        if (closeOnOutsideClick) {
            _outsideOff = bindOutsideClick(core, () => {
                // Insides: content + trigger (clicking trigger toggles,
                // shouldn't also count as outside-click).
                const out = [];
                if (_content) out.push(_content);
                if (_trigger) out.push(_trigger);
                return out;
            });
        }

        // Paint data-open on trigger; backdrop becomes visible
        if (_trigger) setAttr(_trigger, "aria-expanded", "true");
        if (_backdrop) toggleAttr(_backdrop, "data-open", true);
    }

    function doClose() {
        // Unwind in reverse order.
        if (_outsideOff) { _outsideOff(); _outsideOff = null; }
        if (_escapeOff)  { _escapeOff();  _escapeOff  = null; }
        if (_focusTrap)  { _focusTrap.deactivate(); _focusTrap = null; }
        if (_scrollLock) { _scrollLock(); _scrollLock = null; }
        if (_restoreFocus) {
            // Restore focus on next microtask so any handlers complete first.
            const restore = _restoreFocus;
            _restoreFocus = null;
            Promise.resolve().then(() => { try { restore(); } catch {} });
        }
        if (_restorePortal) { _restorePortal(); _restorePortal = null; }
        if (_backdrop && _backdrop.parentNode) {
            _backdrop.parentNode.removeChild(_backdrop);
        }
        if (_trigger) setAttr(_trigger, "aria-expanded", "false");
    }

    // Reactive: respond to open() flipping. Use status() so we react to
    // both the immediate open->opening transition AND the
    // close->closing->closed sequence (the doClose path needs to fire
    // BEFORE awaitTransitionEnd settles, since we tear down the trap +
    // scroll lock when the user-visible state goes to "closing").
    let _openAtLastRun = null;
    const stopOpenEffect = effect(() => {
        const isOpen = core.open();
        if (isOpen === _openAtLastRun) return;
        _openAtLastRun = isOpen;
        if (isOpen) doOpen();
        else        doClose();
    });
    core._addCleanup(stopOpenEffect);

    // ----- attach: content -----------------------------------------------

    function attachContent(el) {
        if (!el || _destroyed) return noop;
        _content = el;
        ensureId(el, "lh-drawer");
        setAttr(el, "role", modal ? "dialog" : "region");
        if (modal) setAttr(el, "aria-modal", "true");
        if (_title) setAttr(el, "aria-labelledby", _title.id);
        if (_description) setAttr(el, "aria-describedby", _description.id);

        // Reactive paint of side + status.
        const stop = effect(() => {
            setAttr(el, "data-side", _side());
            setAttr(el, "data-status", core.status());
            toggleAttr(el, "data-open", core.open());
        });
        core._addCleanup(stop);

        if (awaitTransitionEnd) {
            core.setContentForTransitions(el);
        }

        const off = () => {
            stop();
            if (_content === el) {
                el.removeAttribute("role");
                el.removeAttribute("aria-modal");
                el.removeAttribute("aria-labelledby");
                el.removeAttribute("aria-describedby");
                el.removeAttribute("data-side");
                el.removeAttribute("data-status");
                el.removeAttribute("data-open");
                _content = null;
            }
        };
        core._addCleanup(off);

        // If we're already open (e.g. defaultOpen=true), trigger doOpen
        // now that we have a content element to portal.
        if (core.open()) doOpen();

        return off;
    }

    // ----- attach: backdrop ----------------------------------------------

    function attachBackdrop(el) {
        if (!el || _destroyed) return noop;
        _backdrop = el;
        ensureId(el, "lh-drawer-backdrop");
        setAttr(el, "data-drawer-backdrop", "");
        // Backdrop click closes (unless closeOnOutsideClick is false).
        const onClick = (ev) => {
            if (closeOnOutsideClick) {
                ev.preventDefault();
                core.setOpen(false, "outside");
            }
        };
        el.addEventListener("click", onClick);
        const stop = effect(() => {
            toggleAttr(el, "data-open", core.open());
            setAttr(el, "data-status", core.status());
        });
        core._addCleanup(stop);
        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            if (_backdrop === el) {
                el.removeAttribute("data-drawer-backdrop");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                _backdrop = null;
            }
        };
        core._addCleanup(off);
        return off;
    }

    // ----- attach: trigger -----------------------------------------------

    function attachTrigger(el) {
        if (!el || _destroyed) return noop;
        _trigger = el;
        if (!el.hasAttribute("type") && el.tagName === "BUTTON") {
            setAttr(el, "type", "button");
        }
        // ARIA: button that controls expandable content
        setAttr(el, "aria-haspopup", "dialog");
        setAttr(el, "aria-expanded", core.open() ? "true" : "false");
        if (_content) addIdToken(el, "aria-controls", _content.id);

        const onClick = (ev) => {
            ev.preventDefault();
            core.setOpen(!core.open(), "trigger");
        };
        el.addEventListener("click", onClick);

        const off = () => {
            el.removeEventListener("click", onClick);
            if (_trigger === el) {
                el.removeAttribute("aria-haspopup");
                el.removeAttribute("aria-expanded");
                if (_content) removeIdToken(el, "aria-controls", _content.id);
                _trigger = null;
            }
        };
        core._addCleanup(off);
        return off;
    }

    // ----- attach: close button (inside content) -------------------------

    function attachCloseButton(el) {
        if (!el || _destroyed) return noop;
        if (!el.hasAttribute("type") && el.tagName === "BUTTON") {
            setAttr(el, "type", "button");
        }
        setAttr(el, "aria-label", "Close");
        const onClick = (ev) => {
            ev.preventDefault();
            core.setOpen(false, "close");
        };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute("aria-label");
        };
        core._addCleanup(off);
        return off;
    }

    // ----- attach: title + description (for ARIA labelling) --------------

    function attachTitle(el) {
        if (!el || _destroyed) return noop;
        _title = el;
        ensureId(el, "lh-drawer-title");
        if (_content) setAttr(_content, "aria-labelledby", el.id);
        const off = () => {
            if (_title === el) {
                if (_content) _content.removeAttribute("aria-labelledby");
                _title = null;
            }
        };
        core._addCleanup(off);
        return off;
    }

    function attachDescription(el) {
        if (!el || _destroyed) return noop;
        _description = el;
        ensureId(el, "lh-drawer-desc");
        if (_content) setAttr(_content, "aria-describedby", el.id);
        const off = () => {
            if (_description === el) {
                if (_content) _content.removeAttribute("aria-describedby");
                _description = null;
            }
        };
        core._addCleanup(off);
        return off;
    }

    // ----- teardown -------------------------------------------------------

    function destroy() {
        if (_destroyed) return;
        _destroyed = true;
        // Close first to release scroll lock + focus trap if currently open.
        if (core.open()) doClose();
        core.destroy();
    }

    return {
        // reactive
        open, status, side,
        // mutations
        setOpen, show, hide, setSide,
        // attach
        attachContent, attachBackdrop, attachTrigger, attachCloseButton,
        attachTitle, attachDescription,
        // lifecycle
        destroy,
        get destroyed() { return _destroyed; },
    };
}
