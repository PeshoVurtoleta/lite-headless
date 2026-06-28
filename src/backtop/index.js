// @zakkster/lite-headless / backtop
//
// "Scroll to top" floating action button. Shows after the user
// scrolls past a threshold; click scrolls the container back to top.
//
// Listens to scroll events on a target container (window by default).
// Throttles paint via requestAnimationFrame so scroll fires don't
// thrash the DOM.
//
// Painted attributes:
//   button:
//     data-backtop                 (slot marker)
//     data-visible                 (boolean -- true when past threshold)
//     hidden                       (when not visible; for SR + non-CSS)
//     aria-label="Back to top"     (only if not pre-set)
//
// Default behavior: smooth scroll. Set `smooth: false` to jump.

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createBackTop(opts = {}) {
    const o = opts || {};
    const _threshold = (typeof o.threshold === "number" && o.threshold >= 0)
                     ? o.threshold : 200;
    const smooth = o.smooth !== false;  // default true
    const onActivate = typeof o.onActivate === "function" ? o.onActivate : null;
    let _target = null;          // scroll container; null = window
    let _scrollEl = null;        // resolved element used for getting scrollTop
    const _visible = makeSignal(false);
    const _destroyed = { v: false };

    let _scrollHandler = null;
    let _rafToken = 0;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    // Throttle scroll → paint via rAF in browsers, setTimeout(0) in
    // non-browser test environments where rAF doesn't exist. We
    // resolve once per primitive instance so the fallback path is
    // deterministic.
    const _hasRaf = typeof globalThis.requestAnimationFrame === "function";
    function _scheduleCheck() {
        if (_hasRaf) return globalThis.requestAnimationFrame(_checkVisibility);
        return setTimeout(_checkVisibility, 0);
    }
    function _cancelCheck(token) {
        if (token === 0) return;
        if (_hasRaf) globalThis.cancelAnimationFrame(token);
        else clearTimeout(token);
    }

    function isVisible() { return _visible(); }
    function threshold() { return _threshold; }

    function _scrollTop() {
        if (_target === null) return window.scrollY || window.pageYOffset || 0;
        return _scrollEl ? _scrollEl.scrollTop : 0;
    }

    function _checkVisibility() {
        if (_destroyed.v) return;
        const past = _scrollTop() > _threshold;
        if (_visible() !== past) _visible.set(past);
        _rafToken = 0;
    }

    function _onScroll() {
        if (_rafToken !== 0) return;
        _rafToken = _scheduleCheck();
    }

    function attachTarget(el) {
        // Pass `window` (or null/undefined) for window scroll.
        // Pass an element for an internal scroll container.
        if (_destroyed.v) return noop;
        // Detach prior target
        if (_scrollHandler) {
            (_target === null ? window : _target).removeEventListener("scroll", _scrollHandler);
            _scrollHandler = null;
        }
        if (_rafToken !== 0) { _cancelCheck(_rafToken); _rafToken = 0; }

        if (el === window || el === null || el === undefined) {
            _target = null;
            _scrollEl = document.scrollingElement || document.documentElement;
        } else {
            _target = el;
            _scrollEl = el;
        }
        _scrollHandler = _onScroll;
        const listenOn = (_target === null ? window : _target);
        listenOn.addEventListener("scroll", _scrollHandler, { passive: true });
        // Initial sample so visibility matches the current position
        _checkVisibility();

        const off = () => {
            if (_scrollHandler) {
                listenOn.removeEventListener("scroll", _scrollHandler);
                _scrollHandler = null;
            }
            if (_rafToken !== 0) { _cancelCheck(_rafToken); _rafToken = 0; }
        };
        addCleanup(off);
        return off;
    }

    function attachButton(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-backtop", "");
        if (!el.hasAttribute("aria-label")) setAttr(el, "aria-label", "Back to top");

        const stop = effect(() => {
            toggleAttr(el, "data-visible", _visible());
            if (_visible()) removeAttr(el, "hidden");
            else setAttr(el, "hidden", "");
        });
        addCleanup(stop);

        const onClick = () => { scrollToTop("click"); };
        el.addEventListener("click", onClick);

        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-backtop");
            removeAttr(el, "data-visible");
            removeAttr(el, "hidden");
        };
        addCleanup(off);
        return off;
    }

    function scrollToTop(reason) {
        if (_destroyed.v) return;
        const behavior = smooth ? "smooth" : "auto";
        if (_target === null) {
            window.scrollTo({ top: 0, left: 0, behavior });
        } else if (_scrollEl) {
            // Element.scrollTo supports the same options shape
            _scrollEl.scrollTo({ top: 0, left: 0, behavior });
        }
        if (onActivate) try { onActivate(reason || "api"); } catch {}
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        if (_rafToken !== 0) { _cancelCheck(_rafToken); _rafToken = 0; }
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
    }

    return {
        isVisible, threshold,
        get smooth() { return smooth; },
        attachTarget, attachButton, scrollToTop,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
