// @zakkster/lite-headless / separator
//
// A thin divider between content groups. Two modes:
//   - semantic (default): role="separator", announced to assistive tech as a
//     group boundary. aria-orientation is painted only for vertical (the ARIA
//     default for a separator is horizontal).
//   - decorative (`decorative: true`): role="none", aria-hidden -- a purely
//     visual rule that should NOT be announced.
//
// Orientation is reactive so a responsive layout can flip it at runtime.
//
// Painted attributes:
//   root:
//     data-separator-root
//     data-orientation="horizontal|vertical"   (Class 3 enum, always present)
//     role="separator"            (semantic mode)
//     aria-orientation="vertical" (semantic mode, vertical only)
//     role="none" + aria-hidden="true"  (decorative mode)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

const VALID_ORIENTATIONS = new Set(["horizontal", "vertical"]);

export function createSeparator(opts = {}) {
    const o = opts || {};
    const decorative = !!o.decorative;
    const _orientation = makeSignal(
        VALID_ORIENTATIONS.has(o.orientation) ? o.orientation : "horizontal"
    );
    const _destroyed = { v: false };

    let _rootEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function orientation() { return _orientation(); }

    function setOrientation(next) {
        if (_destroyed.v) return;
        if (!VALID_ORIENTATIONS.has(next)) return;
        if (_orientation() === next) return;
        _orientation.set(next);
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-separator-root", "");
        // role is fixed by mode; only orientation animates
        const hadRole = el.hasAttribute("role");
        if (decorative) {
            if (!hadRole) setAttr(el, "role", "none");
            setAttr(el, "aria-hidden", "true");
        } else {
            if (!hadRole) setAttr(el, "role", "separator");
        }
        const stop = effect(() => {
            const or = _orientation();
            setAttr(el, "data-orientation", or);
            if (!decorative) {
                // ARIA default orientation for separator is horizontal; only
                // declare aria-orientation when vertical to avoid redundancy.
                if (or === "vertical") setAttr(el, "aria-orientation", "vertical");
                else removeAttr(el, "aria-orientation");
            }
        });
        addCleanup(stop);
        const off = () => {
            stop();
            removeAttr(el, "data-separator-root");
            removeAttr(el, "data-orientation");
            if (!hadRole) removeAttr(el, "role");
            removeAttr(el, "aria-orientation");
            if (decorative) removeAttr(el, "aria-hidden");
            if (_rootEl === el) _rootEl = null;
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
        _rootEl = null;
    }

    return {
        orientation,
        get isDecorative() { return decorative; },
        setOrientation,
        attachRoot,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
