// @zakkster/lite-headless / affix
//
// Pin an element to the viewport (or a scroll container) when its
// natural top reaches a configurable offset. The classic "sticky
// header that latches in place after scrolling past."
//
// Implementation: insert a 1px-tall sentinel element right BEFORE
// the affix target. Watch the sentinel via IntersectionObserver
// with a top-margin of -offsetTop. When the sentinel scrolls out
// of view, the target enters "pinned" state.
//
// Why a sentinel + IntersectionObserver instead of a scroll
// listener: IO doesn't run on the main thread, doesn't read layout
// during scroll, and gives the browser room to optimize. Works
// the same way Chromium's own ResizeObserver-based libraries do.
//
// Painted attributes:
//   target element:
//     data-affix-root
//     data-pinned                  (boolean -- true while pinned)
//   sentinel (auto-injected):
//     data-affix-sentinel
//     aria-hidden="true"

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

export function createAffix(opts = {}) {
    const o = opts || {};
    const _offsetTop = (typeof o.offsetTop === "number" && o.offsetTop >= 0)
                     ? o.offsetTop : 0;
    const root = o.root || null;  // scroll container; null = viewport
    const onChange = typeof o.onChange === "function" ? o.onChange : null;

    const _pinned = makeSignal(false);
    const _destroyed = { v: false };
    let _targetEl = null;
    let _sentinelEl = null;
    let _observer = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function isPinned() { return _pinned(); }
    function offsetTop() { return _offsetTop; }

    function _setPinned(b) {
        if (_pinned() === b) return;
        _pinned.set(b);
        if (onChange) try { onChange(b); } catch {}
    }

    // Track the most recent attachment so reattach can tear down
    // the prior one (otherwise effects leak + old targets keep
    // data-affix-root).
    let _activeOff = null;

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        // Tear down prior attachment cleanly before installing a new one.
        if (_activeOff) {
            try { _activeOff(); } catch {}
            _activeOff = null;
        }

        _targetEl = el;
        setAttr(el, "data-affix-root", "");

        // Inject sentinel right before the target.
        // It's 0px tall (no layout shift) but still observable by IO.
        const sentinel = el.ownerDocument.createElement("div");
        setAttr(sentinel, "data-affix-sentinel", "");
        setAttr(sentinel, "aria-hidden", "true");
        sentinel.style.cssText = "position:relative;height:0;margin:0;padding:0;border:0;";
        if (el.parentNode) el.parentNode.insertBefore(sentinel, el);
        _sentinelEl = sentinel;

        // Reactive paint of data-pinned on the target.
        const stopEff = effect(() => {
            toggleAttr(el, "data-pinned", _pinned());
        });

        // IntersectionObserver with negative top-margin: the sentinel
        // is considered "out of view" before it actually leaves the
        // viewport edge. When out → pin.
        // Only set up if IO is available (browser); in non-browser
        // test environments, the test can call _setPinnedForTest().
        let localObserver = null;
        if (typeof globalThis.IntersectionObserver === "function") {
            localObserver = new globalThis.IntersectionObserver((entries) => {
                if (_destroyed.v) return;
                for (const entry of entries) {
                    _setPinned(!entry.isIntersecting);
                }
            }, {
                root: root,
                rootMargin: "-" + _offsetTop + "px 0px 0px 0px",
                threshold: 0,
            });
            localObserver.observe(sentinel);
            _observer = localObserver;
        }

        const off = () => {
            if (localObserver) { localObserver.disconnect(); }
            if (_observer === localObserver) _observer = null;
            stopEff();
            if (sentinel.parentNode) sentinel.parentNode.removeChild(sentinel);
            if (_sentinelEl === sentinel) _sentinelEl = null;
            removeAttr(el, "data-affix-root");
            removeAttr(el, "data-pinned");
            if (_targetEl === el) _targetEl = null;
            if (_activeOff === off) _activeOff = null;
        };
        _activeOff = off;
        addCleanup(off);
        return off;
    }

    // Test-only helper: explicit pin/unpin so unit tests don't need IO.
    // Production code should never call this.
    function _setPinnedForTest(b) {
        if (_destroyed.v) return;
        _setPinned(!!b);
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
    }

    return {
        isPinned, offsetTop,
        attachRoot, destroy,
        _setPinnedForTest,
        get destroyed() { return _destroyed.v; },
    };
}
