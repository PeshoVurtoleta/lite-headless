// @zakkster/lite-headless / dialog / index.js
//
// createDialog(options) -> DialogHandle
//
// Composes:
//   _overlay/core         (state machine + status signal)
//   _overlay/dismiss      (Escape, outside click)
//   _overlay/focus        (trap + initial/final focus)   -- only when modal:true
//   _overlay/scroll-lock  (body lock)                    -- only when modal:true
//   _overlay/portal       (move to container)            -- only when container set
//   _overlay/aria         (id generation, attr toggles)
//
// IMPORTANT ARCHITECTURE NOTE
// ---------------------------
// Each effect() reads exactly ONE reactive value. lite-signal collects deps
// from every reactive read during a run, so an effect that incidentally calls
// a helper which reads status() ends up depending on status() too. That bites
// when you only meant to listen for open() -- status changes then re-fire your
// open side effects, triple-locking scroll, etc. (Bug fixed pre-v0.1.0.)

import { effect } from "@zakkster/lite-signal";
import { createOverlayCore } from "../_overlay/core.js";
import { bindEscape, bindOutsideClick } from "../_overlay/dismiss.js";
import { createFocusTrap } from "../_overlay/focus.js";
import { lockScroll } from "../_overlay/scroll-lock.js";
import { portal } from "../_overlay/portal.js";
import { uniqueId, setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";

export function createDialog(options = {}) {
    const {
        open,
        defaultOpen = false,
        onOpenChange,

        modal = true,
        closeOnEscape = true,
        closeOnOutsideClick = true,
        initialFocus = "auto",
        finalFocus = "trigger",

        // v0.7.2: directional contract for drawer/sheet variants. The dialog
        // primitive itself does not animate or position -- it just writes
        // `data-placement` to the content and overlay so CSS can do the
        // work. "center" is the historical default (full-screen modal); the
        // four cardinal values produce a drawer attached to that edge.
        //
        //   placement: "center"  -> data-placement="center"  (modal dialog)
        //   placement: "right"   -> data-placement="right"   (right drawer)
        //   placement: "left"    -> data-placement="left"    (left drawer)
        //   placement: "top"     -> data-placement="top"     (top sheet)
        //   placement: "bottom"  -> data-placement="bottom"  (bottom sheet)
        //
        // State machine, focus trap, scroll lock, portal, dismiss policy
        // are 100% identical across all placements. The animation is
        // entirely a CSS responsibility -- consumers style
        // `[data-content][data-placement="right"]` with the relevant
        // `transform: translateX(...)` and `transition` rules.
        placement = "center",

        // v1.0.0: ARIA role for the content. "dialog" (default) or
        // "alertdialog" (interruptive confirm/destroy flows). See createAlertDialog.
        role = "dialog",

        container = (typeof document !== "undefined" ? document.body : null),
        transition = false,

        labelledBy: labelledByOpt,
        describedBy: describedByOpt,
    } = options;

    const core = createOverlayCore({
        open,
        defaultOpen,
        onOpenChange,
        awaitTransitionEnd: !!transition,
    });

    // ----- registry of attached elements --------------------------------
    let _trigger = null;
    let _content = null;
    let _overlayEl = null;
    let _title = null;
    let _description = null;
    let _restorePortal = null;
    let _trap = null;
    let _unlockScroll = null;
    let _outsideOff = null;
    let _escapeOff = null;
    let _labelledById = labelledByOpt || null;
    let _describedById = describedByOpt || null;
    // External elements that the consumer has marked as "inside" for
    // outside-click purposes (e.g., toolbar/panel buttons that control
    // this dialog from outside its content tree). Populated via attachInside().
    const _extraInsides = [];

    // ----- side-effect helpers (NOT reactive themselves) ----------------
    function doOpen() {
        if (!_content) return;
        if (container && _content.parentNode !== container) {
            _restorePortal = portal(_content, container);
        }
        if (_trigger) setAttr(_trigger, "aria-expanded", "true");
        if (modal) {
            _unlockScroll = lockScroll();
            _trap = createFocusTrap({
                container: _content,
                initialFocus,
                finalFocus: finalFocus === "trigger" ? (_trigger || "trigger") : finalFocus,
            });
            _trap.activate();
        }
    }

    function doClose() {
        if (_trap) { _trap.deactivate(); _trap.destroy(); _trap = null; }
        if (_unlockScroll) { _unlockScroll(); _unlockScroll = null; }
        if (_trigger) setAttr(_trigger, "aria-expanded", "false");
        // portal is restored after status hits 'closed' (effect 4) so exit
        // animations can run inside the portal target
    }

    function applyStaticAria() {
        if (!_content) return;
        setAttr(_content, "role", role === "alertdialog" ? "alertdialog" : "dialog");
        if (modal) setAttr(_content, "aria-modal", "true");
        else _content.removeAttribute("aria-modal");
        if (!_content.hasAttribute("tabindex")) _content.setAttribute("tabindex", "-1");
        if (_labelledById) setAttr(_content, "aria-labelledby", _labelledById);
        if (_describedById) setAttr(_content, "aria-describedby", _describedById);
    }

    // ----- reactive effects (one dep each) ------------------------------

    // (1) open -> doOpen / doClose (trap, scroll lock, portal, trigger aria)
    const stopOpen = effect(() => {
        const isOpen = core.open();
        if (isOpen) doOpen();
        else doClose();
    });
    core._addCleanup(stopOpen);

    // (2) open -> aria-hidden + data-open on content
    const stopOpenAria = effect(() => {
        const isOpen = core.open();
        if (!_content) return;
        setAttr(_content, "aria-hidden", isOpen ? null : "true");
        toggleAttr(_content, "data-open", isOpen);
    });
    core._addCleanup(stopOpenAria);

    // (3) status -> data-status on content + overlay (CSS animation hook)
    const stopStatusAttr = effect(() => {
        const s = core.status();
        if (_content) setAttr(_content, "data-status", s);
        if (_overlayEl) setAttr(_overlayEl, "data-status", s);
    });
    core._addCleanup(stopStatusAttr);

    // (4) status -> portal restore when fully closed
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
        setAttr(el, "aria-haspopup", "dialog");
        setAttr(el, "aria-expanded", core.open() ? "true" : "false");
        if (_content && _content.id) addIdToken(el, "aria-controls", _content.id);

        const onClick = (e) => {
            e.preventDefault();
            core.setOpen(!core.open(), "trigger");
        };
        el.addEventListener("click", onClick);

        const off = () => {
            el.removeEventListener("click", onClick);
            el.removeAttribute("aria-haspopup");
            el.removeAttribute("aria-expanded");
            if (_content && _content.id) removeIdToken(el, "aria-controls", _content.id);
            if (_trigger === el) _trigger = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachContent(el) {
        if (!el || core.destroyed) return noop;
        _content = el;
        if (!el.id) el.id = uniqueId("lh-dialog");

        applyStaticAria();
        // initial reactive paint -- effects haven't re-run since _content was null
        setAttr(el, "aria-hidden", core.open() ? null : "true");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        // v0.7.2: directional hook for drawer/sheet CSS. Written once at
        // attach time -- placement is locked at construction and never
        // changes during the dialog's lifetime, so this is not in the hot
        // path.
        setAttr(el, "data-placement", placement);

        core._setContentForTransitions(el);
        if (_trigger) addIdToken(_trigger, "aria-controls", el.id);

        if (closeOnOutsideClick) {
            _outsideOff = bindOutsideClick(core, () => {
                const insides = [_content];
                for (let i = 0; i < _extraInsides.length; i++) insides.push(_extraInsides[i]);
                return insides;
            });
        }
        if (closeOnEscape) {
            _escapeOff = bindEscape(core);
        }

        // catch defaultOpen:true: effect 1 ran earlier with _content null and bailed
        if (core.open()) doOpen();

        const off = () => {
            if (_content === el) {
                if (_trigger) removeIdToken(_trigger, "aria-controls", el.id);
                el.removeAttribute("role");
                el.removeAttribute("aria-modal");
                el.removeAttribute("aria-hidden");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                el.removeAttribute("data-placement");
                _content = null;
            }
            if (_outsideOff) { _outsideOff(); _outsideOff = null; }
            if (_escapeOff)  { _escapeOff();  _escapeOff = null; }
        };
        core._addCleanup(off);
        return off;
    }

    function attachOverlay(el) {
        if (!el || core.destroyed) return noop;
        _overlayEl = el;
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        // mirror placement so consumers can style backdrop differently per
        // drawer direction (e.g. blur from the left for left drawers)
        setAttr(el, "data-placement", placement);

        const stopOverlayState = effect(() => {
            toggleAttr(el, "data-open", core.open());
        });

        let onDown = null;
        if (closeOnOutsideClick) {
            onDown = (e) => {
                e.preventDefault();
                core.setOpen(false, "outside");
            };
            el.addEventListener("pointerdown", onDown);
        }

        const off = () => {
            stopOverlayState();
            if (onDown) el.removeEventListener("pointerdown", onDown);
            el.removeAttribute("data-open");
            el.removeAttribute("data-status");
            el.removeAttribute("data-placement");
            if (_overlayEl === el) _overlayEl = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachClose(el) {
        if (!el || core.destroyed) return noop;
        const onClick = (e) => {
            e.preventDefault();
            core.setOpen(false, "close");
        };
        el.addEventListener("click", onClick);
        const off = () => el.removeEventListener("click", onClick);
        core._addCleanup(off);
        return off;
    }

    // attachInside: mark an external element as "inside" for outside-click
    // purposes. Use this for toolbar buttons / sidebar controls that operate
    // on the dialog from outside its content tree. Without this, pointerdown
    // on those controls would close the dialog BEFORE the click handler ran
    // (pointerdown beats click in the event order), making controls feel
    // broken or one-way. Returns an off() to detach.
    function attachInside(el) {
        if (!el || core.destroyed) return noop;
        _extraInsides.push(el);
        const off = () => {
            const i = _extraInsides.indexOf(el);
            if (i !== -1) _extraInsides.splice(i, 1);
        };
        core._addCleanup(off);
        return off;
    }

    function attachTitle(el) {
        if (!el || core.destroyed) return noop;
        _title = el;
        const id = ensureId(el, "lh-dialog-title");
        _labelledById = id;
        if (_content) setAttr(_content, "aria-labelledby", id);
        const off = () => {
            if (_title === el) {
                _title = null;
                _labelledById = null;
                if (_content) _content.removeAttribute("aria-labelledby");
            }
        };
        core._addCleanup(off);
        return off;
    }

    function attachDescription(el) {
        if (!el || core.destroyed) return noop;
        _description = el;
        const id = ensureId(el, "lh-dialog-desc");
        _describedById = id;
        if (_content) setAttr(_content, "aria-describedby", id);
        const off = () => {
            if (_description === el) {
                _description = null;
                _describedById = null;
                if (_content) _content.removeAttribute("aria-describedby");
            }
        };
        core._addCleanup(off);
        return off;
    }

    function destroy() {
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
        attachContent,
        attachOverlay,
        attachClose,
        attachInside,
        attachTitle,
        attachDescription,
        destroy,
        get destroyed() { return core.destroyed; },
    };
}

function noop() {}
