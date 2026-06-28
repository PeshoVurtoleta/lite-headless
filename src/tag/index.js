// @zakkster/lite-headless / tag
//
// Display tag (status pill). Distinct from tag-input (which is the
// MULTI-VALUE INPUT primitive that produces tag-like chips inside a
// form field). This is a single status display element.
//
// Two variants:
//   - simple: just a styled span (no state)
//   - closable: has an X button that removes/dismisses the tag
//
// Painted attributes:
//   root:
//     data-tag-root
//     data-intent="default|primary|success|info|warning|danger"
//     data-closable                (boolean, when closable: true)
//     data-hidden                 (boolean, after close fired)
//     hidden                       (after close fired)
//   close button:
//     data-tag-close
//     aria-label="Remove tag"      (only if not pre-set)

import { signal as makeSignal, effect } from "@zakkster/lite-signal";
import { setAttr, toggleAttr } from "../_overlay/aria.js";

function noop() {}
function removeAttr(el, name) { el.removeAttribute(name); }

const VALID_INTENTS = new Set(["default", "primary", "success", "info", "warning", "danger"]);

export function createTag(opts = {}) {
    const o = opts || {};
    const closable = !!o.closable;
    const _intent  = makeSignal(VALID_INTENTS.has(o.intent) ? o.intent : "default");
    const _removed = makeSignal(false);
    const onClose  = typeof o.onClose === "function" ? o.onClose : null;
    const _destroyed = { v: false };

    let _rootEl = null;
    const _cleanups = [];
    function addCleanup(fn) { _cleanups.push(fn); }

    function intent() { return _intent(); }
    function isRemoved() { return _removed(); }

    function setIntent(v) {
        if (_destroyed.v) return;
        if (!VALID_INTENTS.has(v)) return;
        if (_intent() === v) return;
        _intent.set(v);
    }

    function close(reason) {
        if (_destroyed.v) return;
        if (!closable) return;
        if (_removed()) return;
        _removed.set(true);
        if (onClose) try { onClose(reason || "api"); } catch {}
    }

    function reset() {
        if (_destroyed.v) return;
        _removed.set(false);
    }

    function attachRoot(el) {
        if (!el || _destroyed.v) return noop;
        _rootEl = el;
        setAttr(el, "data-tag-root", "");
        if (closable) setAttr(el, "data-closable", "");
        const stop = effect(() => {
            setAttr(el, "data-intent", _intent());
            toggleAttr(el, "data-hidden", _removed());
            if (_removed()) setAttr(el, "hidden", "");
            else removeAttr(el, "hidden");
        });
        addCleanup(stop);
        const off = () => {
            stop();
            removeAttr(el, "data-tag-root");
            removeAttr(el, "data-closable");
            removeAttr(el, "data-intent");
            removeAttr(el, "data-hidden");
            removeAttr(el, "hidden");
            if (_rootEl === el) _rootEl = null;
        };
        addCleanup(off);
        return off;
    }

    function attachCloseButton(el) {
        if (!el || _destroyed.v || !closable) return noop;
        setAttr(el, "data-tag-close", "");
        if (!el.hasAttribute("aria-label")) setAttr(el, "aria-label", "Remove tag");
        const onClick = (ev) => { ev.stopPropagation(); close("click"); };
        el.addEventListener("click", onClick);
        const off = () => {
            el.removeEventListener("click", onClick);
            removeAttr(el, "data-tag-close");
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
        intent, isRemoved,
        get closable() { return closable; },
        setIntent, close, reset,
        attachRoot, attachCloseButton,
        destroy,
        get destroyed() { return _destroyed.v; },
    };
}
