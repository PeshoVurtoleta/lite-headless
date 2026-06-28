// @zakkster/lite-headless / popover / index.js
//
// createPopover(options) -> PopoverHandle
//
// Composes:
//   _overlay/core         (state machine + status signal)
//   _overlay/position     (placement + flip + shift + arrow + autoUpdate)
//   _overlay/dismiss      (Escape, outside click)
//   _overlay/focus        (initial/final focus; trap only when modal:true)
//   _overlay/portal       (move to container)
//   _overlay/aria         (id generation, attr toggles)
//
// Differences vs createDialog:
//   - non-modal by default (no scroll lock, no focus trap, no aria-modal)
//   - has anchor/positioning concepts (attachAnchor, attachArrow)
//   - role="dialog" only when modal:true; otherwise consumer-implicit (no role
//     forced) so screen readers see live region semantics naturally
//
// ARCHITECTURE: same one-effect-one-reactive-read discipline as dialog.

import { effect } from "@zakkster/lite-signal";
import { createOverlayCore } from "../_overlay/core.js";
import { bindEscape, bindOutsideClick } from "../_overlay/dismiss.js";
import { createFocusTrap } from "../_overlay/focus.js";
import { createPositioner } from "../_overlay/position.js";
import { portal } from "../_overlay/portal.js";
import { uniqueId, setAttr, toggleAttr, ensureId, addIdToken, removeIdToken } from "../_overlay/aria.js";

export function createPopover(options = {}) {
    const {
        open,
        defaultOpen = false,
        onOpenChange,

        // positioning (static)
        placement = "bottom",
        offset = 8,
        flip = true,
        shift = true,
        boundary = "clipping",

        // policy (static)
        modal = false,
        closeOnEscape = true,
        closeOnOutsideClick = true,
        initialFocus = "auto",
        finalFocus = "trigger",

        // rendering
        container = (typeof document !== "undefined" ? document.body : null),
        transition = false,

        // aria
        labelledBy: labelledByOpt,
        describedBy: describedByOpt,
    } = options;

    const core = createOverlayCore({
        open,
        defaultOpen,
        onOpenChange,
        awaitTransitionEnd: !!transition,
    });

    let _trigger = null;
    let _anchor = null;    // separate from trigger; defaults to trigger if not set
    let _content = null;
    let _arrow = null;
    let _restorePortal = null;
    let _trap = null;
    let _positioner = null;
    let _stopAutoUpdate = null;
    let _outsideOff = null;
    let _escapeOff = null;
    let _labelledById = labelledByOpt || null;
    let _describedById = describedByOpt || null;
    // see dialog/index.js for the rationale
    const _extraInsides = [];

    function activeAnchor() {
        return _anchor || _trigger;
    }

    function doOpen() {
        if (!_content) return;
        if (container && _content.parentNode !== container) {
            _restorePortal = portal(_content, container);
        }
        if (_trigger) setAttr(_trigger, "aria-expanded", "true");

        const a = activeAnchor();
        if (a) {
            _positioner = createPositioner({
                anchor: a, content: _content, arrow: _arrow,
                placement, offset, flip, shift, boundary,
            });
            _positioner.update();
            _stopAutoUpdate = _positioner.autoUpdate();
        }

        if (initialFocus !== false) {
            _trap = createFocusTrap({
                container: _content,
                initialFocus,
                finalFocus: finalFocus === "trigger" ? (_trigger || "trigger") : finalFocus,
                trap: !!modal,
            });
            _trap.activate();
        }
    }

    function doClose() {
        if (_trap) { _trap.deactivate(); _trap.destroy(); _trap = null; }
        if (_stopAutoUpdate) { _stopAutoUpdate(); _stopAutoUpdate = null; }
        if (_positioner) { _positioner.destroy(); _positioner = null; }
        if (_trigger) setAttr(_trigger, "aria-expanded", "false");
    }

    function applyStaticAria() {
        if (!_content) return;
        if (modal) setAttr(_content, "role", "dialog");
        if (modal) setAttr(_content, "aria-modal", "true");
        else _content.removeAttribute("aria-modal");
        if (!_content.hasAttribute("tabindex")) _content.setAttribute("tabindex", "-1");
        if (_labelledById) setAttr(_content, "aria-labelledby", _labelledById);
        if (_describedById) setAttr(_content, "aria-describedby", _describedById);
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
        setAttr(el, "aria-haspopup", modal ? "dialog" : "true");
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

    function attachAnchor(el) {
        if (!el || core.destroyed) return noop;
        _anchor = el;
        const off = () => {
            if (_anchor === el) _anchor = null;
        };
        core._addCleanup(off);
        return off;
    }

    function attachContent(el) {
        if (!el || core.destroyed) return noop;
        _content = el;
        if (!el.id) el.id = uniqueId("lh-popover");

        applyStaticAria();
        setAttr(el, "aria-hidden", core.open() ? null : "true");
        toggleAttr(el, "data-open", core.open());
        setAttr(el, "data-status", core.status());
        core._setContentForTransitions(el);
        if (_trigger) addIdToken(_trigger, "aria-controls", el.id);

        if (closeOnOutsideClick) {
            // PERF: pointerdown fires per click anywhere on document while
            // open. Reuse a scratch array instead of allocating + filter()
            // per event. Safe because bindOutsideClick iterates synchronously.
            const _insidesScratch = [];
            _outsideOff = bindOutsideClick(core, () => {
                _insidesScratch.length = 0;
                if (_content) _insidesScratch.push(_content);
                if (_trigger && _trigger !== _content) _insidesScratch.push(_trigger);
                if (_anchor && _anchor !== _trigger && _anchor !== _content) _insidesScratch.push(_anchor);
                for (let i = 0; i < _extraInsides.length; i++) _insidesScratch.push(_extraInsides[i]);
                return _insidesScratch;
            });
        }
        if (closeOnEscape) {
            _escapeOff = bindEscape(core);
        }

        if (core.open()) doOpen();

        const off = () => {
            if (_content === el) {
                if (_trigger) removeIdToken(_trigger, "aria-controls", el.id);
                el.removeAttribute("role");
                el.removeAttribute("aria-modal");
                el.removeAttribute("aria-hidden");
                el.removeAttribute("data-open");
                el.removeAttribute("data-status");
                el.removeAttribute("data-side");
                el.removeAttribute("data-align");
                _content = null;
            }
            if (_outsideOff) { _outsideOff(); _outsideOff = null; }
            if (_escapeOff)  { _escapeOff();  _escapeOff = null; }
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
        attachAnchor,
        attachContent,
        attachArrow,
        attachClose,
        attachInside,
        destroy,
        get destroyed() { return core.destroyed; },
        // introspection (handy for tests + DnD orchestration)
        _positioner: () => _positioner,
    };
}

function noop() {}
