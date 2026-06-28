// @zakkster/lite-headless / password-input
//
// A password field whose visibility is toggled by a button. The primitive
// flips the input's `type` between "password" and "text", keeps the toggle's
// aria-pressed / aria-label in sync, and links the two with aria-controls.
//
// Painted attributes:
//   input:
//     data-password-input
//     type="password|text"        (driven by visibility; original restored on detach)
//     data-visible                 (boolean, when visible)
//   toggle:
//     data-password-toggle
//     type="button"                (only if the toggle is a <button>)
//     aria-pressed="true|false"
//     aria-controls="<input id>"   (input id auto-generated if needed)
//     aria-label                   ("Show password" / "Hide password"; only if not pre-set)
//     data-visible                 (boolean, when visible)
//   root:
//     data-password-input-root
//     data-visible

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr, ensureId } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createPasswordInput(opts = {}) {
    const o = opts || {};
    const onVisibilityChange = (typeof o.onVisibilityChange === "function") ? o.onVisibilityChange : null;

    const _visible = makeSignal(!!o.visible);
    const _destroyed = { v: false };

    let _inputEl = null;
    let _toggleEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function isVisible() { return _visible(); }

    function setVisible(v) {
        if (_destroyed.v) return;
        const next = !!v;
        if (_visible() === next) return;
        _visible.set(next);
        if (onVisibilityChange) { try { onVisibilityChange(next); } catch {} }
    }
    function toggle() { setVisible(!_visible()); }
    function show() { setVisible(true); }
    function hide() { setVisible(false); }

    function relink() {
        // wire aria-controls once both ends are present
        if (_inputEl && _toggleEl) {
            const id = ensureId(_inputEl, "lh-pwd");
            setAttr(_toggleEl, "aria-controls", id);
        }
    }

    function attachInput(el) {
        if (!el || _destroyed.v) return noop;
        _inputEl = el;
        setAttr(el, "data-password-input", "");
        const originalType = el.getAttribute("type");
        const stop = effect(() => {
            const vis = _visible();
            setAttr(el, "type", vis ? "text" : "password");
            toggleAttr(el, "data-visible", vis);
        });
        addCleanup(stop);
        relink();
        const off = () => {
            stop();
            removeAttr(el, "data-password-input");
            removeAttr(el, "data-visible");
            if (originalType !== null) setAttr(el, "type", originalType);
            else removeAttr(el, "type");
            if (_inputEl === el) _inputEl = null;
        };
        addCleanup(off);
        return off;
    }

    function attachToggle(el) {
        if (!el || _destroyed.v) return noop;
        _toggleEl = el;
        setAttr(el, "data-password-toggle", "");
        if (el.tagName === "BUTTON" && !el.hasAttribute("type")) setAttr(el, "type", "button");
        const hadAriaLabel = el.hasAttribute("aria-label");
        const onClick = () => { toggle(); };
        el.addEventListener("click", onClick);
        const stop = effect(() => {
            const vis = _visible();
            setAttr(el, "aria-pressed", vis ? "true" : "false");
            toggleAttr(el, "data-visible", vis);
            if (!hadAriaLabel) setAttr(el, "aria-label", vis ? "Hide password" : "Show password");
        });
        addCleanup(stop);
        relink();
        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-password-toggle");
            removeAttr(el, "aria-pressed");
            removeAttr(el, "aria-controls");
            removeAttr(el, "data-visible");
            if (!hadAriaLabel) removeAttr(el, "aria-label");
            if (_toggleEl === el) _toggleEl = null;
        };
        addCleanup(off);
        return off;
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-password-input-root", "");
        const stop = effect(() => { toggleAttr(el, "data-visible", _visible()); });
        addCleanup(stop);
        const off = () => {
            stop();
            removeAttr(el, "data-password-input-root");
            removeAttr(el, "data-visible");
        };
        addCleanup(off);
        return off;
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
        _inputEl = null;
        _toggleEl = null;
    }

    return {
        isVisible,
        setVisible, toggle, show, hide,
        attachInput, attachToggle, attachRoot,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
