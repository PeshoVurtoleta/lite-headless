// @zakkster/lite-headless / clipboard
//
// Copy-to-clipboard with transient feedback state. The primitive owns the
// "copied" flag (auto-resets after `timeout`) and the optional "error" flag;
// CSS reacts to data-copied / data-error.
//
// The actual write is injectable (`write`) so the consumer can supply an
// execCommand fallback, and so the behavior is testable without a real
// Clipboard API. The default uses navigator.clipboard.writeText when present.
//
// Painted attributes:
//   root / trigger / indicator:
//     data-clipboard-root | data-clipboard-trigger | data-clipboard-indicator
//     data-copied                  (boolean, while in the copied window)
//     data-error                   (boolean, if the last copy threw)
//   trigger additionally:
//     type="button"                (only if the trigger is a <button>)
//     aria-label                   ("Copy" / "Copied") -- only if not pre-set

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

function defaultWrite(text) {
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error("clipboard: no Clipboard API available"));
}

export function createClipboard(opts = {}) {
    const o = opts || {};
    const timeout = (typeof o.timeout === "number" && o.timeout >= 0) ? o.timeout : 2000;
    const write = (typeof o.write === "function") ? o.write : defaultWrite;
    const onCopy = (typeof o.onCopy === "function") ? o.onCopy : null;
    const onError = (typeof o.onError === "function") ? o.onError : null;

    const _value = makeSignal(typeof o.value === "string" ? o.value : "");
    const _copied = makeSignal(false);
    const _error = makeSignal(false);
    const _destroyed = { v: false };

    const _cleanups = [];
    let _timer = null;
    function addCleanup(fn) { _cleanups.push(fn); }
    function clearTimer() { if (_timer) { clearTimeout(_timer); _timer = null; } }

    function value() { return _value(); }
    function isCopied() { return _copied(); }
    function isError() { return _error(); }

    function setValue(v) {
        if (_destroyed.v) return;
        if (typeof v !== "string") return;
        _value.set(v);
    }

    function reset() {
        clearTimer();
        if (_copied()) _copied.set(false);
        if (_error()) _error.set(false);
    }

    async function copy() {
        if (_destroyed.v) return false;
        const text = _value();
        if (_error()) _error.set(false);
        try {
            await write(text);
            if (_destroyed.v) return false;
            _copied.set(true);
            if (onCopy) { try { onCopy(text); } catch {} }
            clearTimer();
            if (timeout > 0) {
                _timer = setTimeout(() => { _timer = null; if (!_destroyed.v) _copied.set(false); }, timeout);
            }
            return true;
        } catch (err) {
            if (_destroyed.v) return false;
            _copied.set(false);
            _error.set(true);
            if (onError) { try { onError(err); } catch {} }
            return false;
        }
    }

    function paintState(el) {
        const stop = effect(() => {
            toggleAttr(el, "data-copied", _copied());
            toggleAttr(el, "data-error", _error());
        });
        addCleanup(stop);
        return stop;
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-clipboard-root", "");
        const stop = paintState(el);
        const off = () => {
            stop();
            removeAttr(el, "data-clipboard-root");
            removeAttr(el, "data-copied");
            removeAttr(el, "data-error");
        };
        addCleanup(off);
        return off;
    }

    function attachTrigger(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-clipboard-trigger", "");
        if (el.tagName === "BUTTON" && !el.hasAttribute("type")) setAttr(el, "type", "button");
        const hadAriaLabel = el.hasAttribute("aria-label");
        const onClick = () => { copy(); };
        el.addEventListener("click", onClick);
        const stop = effect(() => {
            const c = _copied();
            toggleAttr(el, "data-copied", c);
            toggleAttr(el, "data-error", _error());
            if (!hadAriaLabel) setAttr(el, "aria-label", c ? "Copied" : "Copy");
        });
        addCleanup(stop);
        const off = () => {
            stop();
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-clipboard-trigger");
            removeAttr(el, "data-copied");
            removeAttr(el, "data-error");
            if (!hadAriaLabel) removeAttr(el, "aria-label");
        };
        addCleanup(off);
        return off;
    }

    function attachIndicator(el) {
        if (!el || _destroyed.v) return noop;
        setAttr(el, "data-clipboard-indicator", "");
        // polite live region: the check/"Copied" text appears on copy
        if (!el.hasAttribute("aria-live")) setAttr(el, "aria-live", "polite");
        const stop = paintState(el);
        const off = () => {
            stop();
            removeAttr(el, "data-clipboard-indicator");
            removeAttr(el, "data-copied");
            removeAttr(el, "data-error");
        };
        addCleanup(off);
        return off;
    }

    function destroy() {
        if (_destroyed.v) return;
        _destroyed.v = true;
        clearTimer();
        for (let i = _cleanups.length - 1; i >= 0; i--) {
            try { _cleanups[i](); } catch {}
        }
        _cleanups.length = 0;
    }

    return {
        value, isCopied, isError,
        setValue, copy, reset,
        attachRoot, attachTrigger, attachIndicator,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
