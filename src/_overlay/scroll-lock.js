// @zakkster/lite-headless / _overlay / scroll-lock.js
//
// Module-scoped refcount so multiple stacked overlays don't fight over
// document.body.style. First lock saves the inline styles; last unlock restores
// them. The "compensate for scrollbar width" trick prevents layout shift when
// `overflow: hidden` removes the vertical scrollbar.
//
// Safe to call in non-DOM environments (returns no-op unlock).

let _count = 0;
let _previousOverflow = "";
let _previousPaddingRight = "";

export function lockScroll() {
    if (typeof document === "undefined" || !document.body) return () => {};

    if (_count === 0) {
        const body = document.body;
        const html = document.documentElement;
        _previousOverflow = body.style.overflow || "";
        _previousPaddingRight = body.style.paddingRight || "";

        // scrollbar width compensation -- avoids content jump on hide
        const scrollbarWidth = (window.innerWidth || 0) - (html.clientWidth || 0);
        if (scrollbarWidth > 0) {
            const current = parseFloat(body.style.paddingRight) || 0;
            body.style.paddingRight = (current + scrollbarWidth) + "px";
        }
        body.style.overflow = "hidden";
    }
    _count++;

    let unlocked = false;
    return function unlock() {
        if (unlocked) return;
        unlocked = true;
        _count = Math.max(0, _count - 1);
        if (_count === 0 && document.body) {
            document.body.style.overflow = _previousOverflow;
            document.body.style.paddingRight = _previousPaddingRight;
            _previousOverflow = "";
            _previousPaddingRight = "";
        }
    };
}

// test-only: reset module state
export function _resetScrollLockForTests() {
    _count = 0;
    _previousOverflow = "";
    _previousPaddingRight = "";
}

export function _getScrollLockCount() {
    return _count;
}
