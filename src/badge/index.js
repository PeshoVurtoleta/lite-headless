// @zakkster/lite-headless / badge
//
// Count indicator (e.g., "3 unread") or dot variant. Typically used
// as a small decoration on another element (button, avatar, menu item).
//
// Two display modes:
//   - count mode (default): shows a number, optionally capped (99+)
//   - dot mode: shows a small dot, no number
//
// When count is 0 and `showZero: false` (default), the badge hides
// itself (data-hidden + native hidden attribute).
//
// Painted attributes:
//   root:
//     data-badge-root
//     data-intent="default|primary|success|info|warning|danger"
//     data-dot                     (boolean, when dot mode)
//     data-count="<displayed>"     (when count mode; "99+" if over max)
//     data-hidden                  (boolean, when count === 0 and showZero === false)
//     hidden                       (native; same trigger as data-hidden)
//     aria-label                   (live count description, only if not pre-set)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

const VALID_INTENTS = new Set(["default", "primary", "success", "info", "warning", "danger"]);

export function createBadge(opts = {}) {
    const o = opts || {};
    const isDot = !!o.dot;
    const max = (typeof o.max === "number" && o.max > 0) ? Math.floor(o.max) : 99;
    const showZero = !!o.showZero;
    const intent = VALID_INTENTS.has(o.intent) ? o.intent : "default";

    const _count = makeSignal(typeof o.count === "number" ? Math.max(0, Math.floor(o.count)) : 0);
    const _destroyed = { v: false };

    let _rootEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function count() { return _count(); }
    function setCount(n) {
        if (_destroyed.v) return;
        if (typeof n !== "number" || !isFinite(n)) return;
        const v = Math.max(0, Math.floor(n));
        if (_count() === v) return;
        _count.set(v);
    }
    function increment(by) { setCount(_count() + (typeof by === "number" ? by : 1)); }
    function decrement(by) { setCount(_count() - (typeof by === "number" ? by : 1)); }
    function reset() { setCount(0); }

    function displayed() {
        const c = _count();
        if (c > max) return max + "+";
        return String(c);
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-badge-root", "");
        setAttr(el, "data-intent", intent);
        if (isDot) setAttr(el, "data-dot", "");
        const hadAriaLabel = el.hasAttribute("aria-label");
        const stop = effect(() => {
            const c = _count();
            const hide = (!isDot) && (c === 0 && !showZero);
            toggleAttr(el, "data-hidden", hide);
            if (hide) setAttr(el, "hidden", "");
            else removeAttr(el, "hidden");
            if (!isDot) {
                setAttr(el, "data-count", displayed());
            }
            if (!hadAriaLabel) {
                if (isDot) setAttr(el, "aria-label", "Indicator");
                else setAttr(el, "aria-label", c === 1 ? "1 item" : c + " items");
            }
        });
        addCleanup(stop);
        const off = () => {
            stop();
            removeAttr(el, "data-badge-root");
            removeAttr(el, "data-intent");
            removeAttr(el, "data-dot");
            removeAttr(el, "data-count");
            removeAttr(el, "data-hidden");
            removeAttr(el, "hidden");
            if (!hadAriaLabel && el.hasAttribute("aria-label")) removeAttr(el, "aria-label");
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
        count, displayed,
        get isDot() { return isDot; },
        get max() { return max; },
        get intent() { return intent; },
        setCount, increment, decrement, reset,
        attachRoot,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
